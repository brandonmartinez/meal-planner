import { Prisma } from "@prisma/client";
import prisma from "../config/database.js";
import { DAYS_OF_WEEK, type DayOfWeek } from "@meal-planner/shared";

const weekPlanInclude = Prisma.validator<Prisma.WeekPlanInclude>()({
  days: {
    orderBy: { date: "asc" },
    include: {
      suggestions: {
        include: {
          meal: true,
          suggestedBy: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      },
    },
  },
});

/**
 * Returns true if the given IANA timezone identifier is recognized by the
 * runtime's Intl implementation. Used to validate the optional ?tz query
 * param and the Family.timezone column.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

interface TzParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInTz(date: Date, tz: string): TzParts {
  const parts = dtf(tz).formatToParts(date);
  const out: Record<string, number> = {};
  for (const p of parts) {
    if (p.type === "literal") continue;
    const n = Number(p.value);
    if (!Number.isNaN(n)) out[p.type] = n;
  }
  // Intl can return hour=24 at midnight in some engines; normalize to 0.
  if (out.hour === 24) out.hour = 0;
  return out as unknown as TzParts;
}

/**
 * Returns the UTC Date that corresponds to local-midnight (00:00:00.000)
 * on the calendar day of `date` in the given IANA timezone.
 *
 * Works across DST boundaries via a 2-pass refinement: the first pass uses
 * the offset at `date` to estimate midnight; the second pass re-reads the
 * offset at that estimate to handle days where `date` and midnight straddle
 * a DST transition.
 */
export function getStartOfDayInTz(date: Date, tz: string): Date {
  const target = partsInTz(date, tz);

  function midnightFor(anchor: Date): Date {
    const p = partsInTz(anchor, tz);
    const asUtcMs = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    const anchorSecMs = anchor.getTime() - (anchor.getTime() % 1000);
    const offsetMs = asUtcMs - anchorSecMs;
    // Wall-clock midnight on the *target* calendar date, expressed as UTC ms.
    return new Date(
      Date.UTC(target.year, target.month - 1, target.day, 0, 0, 0) - offsetMs,
    );
  }

  // Pass 1: approximate using offset at `date`.
  const first = midnightFor(date);
  // Pass 2: refine using offset at the approximation. On DST-transition
  // days the offset at midnight may differ from the offset at `date`.
  const second = midnightFor(first);
  return second;
}

/**
 * Returns the calendar date in `tz` formatted as YYYY-MM-DD.
 */
export function formatDateInTz(date: Date, tz: string): string {
  const p = partsInTz(date, tz);
  return `${p.year.toString().padStart(4, "0")}-${p.month
    .toString()
    .padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
}

/**
 * Returns the day-of-week name in `tz` (Sunday..Saturday).
 */
export function dayOfWeekInTz(date: Date, tz: string): DayOfWeek {
  // Use a separate formatter to read the weekday directly; this avoids
  // integer math that would re-derive the local date.
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(date);
  // wd is "Sunday".."Saturday" — already matches DAYS_OF_WEEK entries.
  if ((DAYS_OF_WEEK as readonly string[]).includes(wd)) {
    return wd as DayOfWeek;
  }
  // Fallback: derive from formatted date parts.
  const p = partsInTz(date, tz);
  const utcDow = new Date(
    Date.UTC(p.year, p.month - 1, p.day),
  ).getUTCDay();
  return DAYS_OF_WEEK[utcDow];
}

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  // Days to subtract to land on Monday: Sun -> 6, Mon -> 0, Tue -> 1, ...
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function getOrCreateWeekPlan(familyId: string, weekStart: Date) {
  const d = new Date(weekStart);
  d.setUTCHours(0, 0, 0, 0);

  if (d.getUTCDay() !== 1) {
    throw new Error("weekStart must be a Monday");
  }

  const existing = await prisma.weekPlan.findFirst({
    where: { familyId, weekStart: d },
    include: weekPlanInclude,
  });

  if (existing) return existing;

  const days = DAYS_OF_WEEK.map((_, i) => {
    const dayDate = new Date(d);
    dayDate.setUTCDate(dayDate.getUTCDate() + i);
    return { date: dayDate };
  });

  try {
    return await prisma.weekPlan.create({
      data: {
        weekStart: d,
        familyId,
        days: { create: days },
      },
      include: weekPlanInclude,
    });
  } catch (error) {
    // Handle race condition: another request created the same week plan
    // concurrently. The @@unique([familyId, weekStart]) constraint triggers
    // a P2002 error; fall back to fetching the now-existing record.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.weekPlan.findFirst({
        where: { familyId, weekStart: d },
        include: weekPlanInclude,
      });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function getWeekPlan(familyId: string, weekStart: Date) {
  const d = new Date(weekStart);
  d.setUTCHours(0, 0, 0, 0);

  return prisma.weekPlan.findFirst({
    where: { familyId, weekStart: d },
    include: weekPlanInclude,
  });
}

const suggestionInclude = Prisma.validator<Prisma.MealSuggestionInclude>()({
  meal: true,
  suggestedBy: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
});

/**
 * Domain error for suggestion mutations. Carries an HTTP status so routes can
 * map known failures (not-found / forbidden / bad-input) to the right code
 * instead of a generic 500. `MoveSuggestionError` extends this so existing
 * `instanceof MoveSuggestionError` checks keep working.
 */
export class SuggestionError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SuggestionError";
  }
}

export class MoveSuggestionError extends SuggestionError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "MoveSuggestionError";
  }
}

/**
 * Creates a suggestion on a day plan, enforcing that BOTH the target day plan
 * and the meal belong to `familyId`. A non-owned dayPlanId or mealId yields a
 * 404 rather than leaking existence or mutating across families.
 */
export async function addSuggestion(
  familyId: string,
  dayPlanId: string,
  mealId: string,
  userId: string,
) {
  const dayPlan = await prisma.dayPlan.findFirst({
    where: { id: dayPlanId, weekPlan: { familyId } },
    select: { id: true },
  });
  if (!dayPlan) {
    throw new SuggestionError(404, "Day plan not found");
  }

  const meal = await prisma.meal.findFirst({
    where: { id: mealId, familyId },
    select: { id: true },
  });
  if (!meal) {
    throw new SuggestionError(404, "Meal not found");
  }

  return prisma.mealSuggestion.create({
    data: {
      dayPlanId,
      mealId,
      userId,
      approved: false,
    },
    include: suggestionInclude,
  });
}

/**
 * Approves a suggestion, enforcing that it belongs to `familyId` via
 * dayPlan.weekPlan.familyId before mutating. A suggestion owned by another
 * family yields 404 without flipping `approved`.
 *
 * Captures the approving actor so approval is no longer actorless:
 * `approver.actorType` is "user" | "agent" and `approver.actorId` is the
 * User.id or AgentCredential.id respectively.
 */
export async function approveSuggestion(
  familyId: string,
  suggestionId: string,
  approver: { actorType: "user" | "agent"; actorId: string },
) {
  const owned = await prisma.mealSuggestion.findFirst({
    where: { id: suggestionId, dayPlan: { weekPlan: { familyId } } },
    select: { id: true },
  });
  if (!owned) {
    throw new SuggestionError(404, "Suggestion not found");
  }

  return prisma.mealSuggestion.update({
    where: { id: suggestionId },
    data: {
      approved: true,
      approvedByActorType: approver.actorType,
      approvedById: approver.actorId,
      approvedAt: new Date(),
    },
    include: suggestionInclude,
  });
}

/**
 * Removes a suggestion, enforcing that it belongs to `familyId`. Mirrors the
 * move authorization model: only the original suggester or a PARENT may remove
 * it. Cross-family targets yield 404; an unauthorized member yields 403.
 */
export async function removeSuggestion(
  familyId: string,
  suggestionId: string,
  actor: { id: string; isParent: boolean },
) {
  const suggestion = await prisma.mealSuggestion.findFirst({
    where: { id: suggestionId, dayPlan: { weekPlan: { familyId } } },
    select: { id: true, userId: true },
  });
  if (!suggestion) {
    throw new SuggestionError(404, "Suggestion not found");
  }
  if (!actor.isParent && suggestion.userId !== actor.id) {
    throw new SuggestionError(
      403,
      "Only the suggester or a parent can remove this suggestion",
    );
  }

  await prisma.mealSuggestion.delete({
    where: { id: suggestionId },
  });
}

/**
 * Moves an unapproved suggestion to another day in the SAME week plan,
 * enforcing family ownership on both the suggestion and the target day.
 * Preserves the existing rules: only the suggester or a PARENT may move an
 * unapproved suggestion, and approved suggestions cannot move.
 */
export async function moveSuggestion(
  familyId: string,
  suggestionId: string,
  targetDayPlanId: string,
  actor: { id: string; isParent: boolean },
) {
  const suggestion = await prisma.mealSuggestion.findFirst({
    where: { id: suggestionId, dayPlan: { weekPlan: { familyId } } },
    include: { dayPlan: { select: { weekPlanId: true } } },
  });
  if (!suggestion) {
    throw new MoveSuggestionError(404, "Suggestion not found");
  }
  if (suggestion.approved) {
    throw new MoveSuggestionError(400, "Cannot move an approved suggestion");
  }
  if (!actor.isParent && suggestion.userId !== actor.id) {
    throw new MoveSuggestionError(
      403,
      "Only the suggester or a parent can move this suggestion",
    );
  }

  if (suggestion.dayPlanId === targetDayPlanId) {
    return prisma.mealSuggestion.findUnique({
      where: { id: suggestionId },
      include: suggestionInclude,
    });
  }

  const targetDay = await prisma.dayPlan.findFirst({
    where: { id: targetDayPlanId, weekPlan: { familyId } },
    select: { id: true, weekPlanId: true },
  });
  if (!targetDay) {
    throw new MoveSuggestionError(404, "Target day not found");
  }
  if (targetDay.weekPlanId !== suggestion.dayPlan.weekPlanId) {
    throw new MoveSuggestionError(
      400,
      "Target day must be in the same week plan",
    );
  }

  return prisma.mealSuggestion.update({
    where: { id: suggestionId },
    data: { dayPlanId: targetDayPlanId },
    include: suggestionInclude,
  });
}

export async function getApprovedMealsForRange(
  familyId: string,
  startDate: Date,
  endDate: Date,
) {
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  const dayPlans = await prisma.dayPlan.findMany({
    where: {
      date: { gte: start, lte: end },
      weekPlan: { familyId },
    },
    orderBy: { date: "asc" },
    include: {
      suggestions: {
        where: { approved: true },
        include: { meal: true },
      },
    },
  });

  return dayPlans.map((day) => ({
    date: toDateString(day.date),
    meals: day.suggestions.map((s) => ({
      id: s.meal.id,
      name: s.meal.name,
      description: s.meal.description,
      placeholderKind: s.meal.placeholderKind,
    })),
  }));
}

export interface DisplayDayMeal {
  id: string;
  name: string;
  description: string | null;
  placeholderKind: string | null;
  imageUrl: string | null;
}

export interface DisplayDayResult {
  /** YYYY-MM-DD in the resolved tz. */
  date: string;
  /** Day-of-week label in the resolved tz. */
  dayOfWeek: DayOfWeek;
  status: "planned" | "unplanned" | "skipped";
  meals: DisplayDayMeal[];
}

export interface DisplayRangeResult {
  days: DisplayDayResult[];
  /** Most recent updatedAt across WeekPlan/DayPlan/MealSuggestion/Meal in range. */
  maxUpdatedAt: Date | null;
}

/**
 * Returns approved meals across a date range, expanded into a per-day
 * display structure that includes:
 *   - calendar date / day-of-week in the resolved tz
 *   - per-day status: "planned" | "unplanned" | "skipped"
 *     ("skipped" iff every approved suggestion is the SKIP placeholder
 *      AND there is at least one approved suggestion)
 *   - meal.imageUrl (in addition to existing display fields)
 *
 * Days that have no DayPlan record at all are filled in as "unplanned".
 *
 * Also returns `maxUpdatedAt`, the latest updatedAt across the
 * WeekPlan/DayPlan/MealSuggestion(createdAt)/Meal rows that contributed
 * to the response. Used by the route to compute a strong ETag.
 */
export async function getDisplayDays(
  familyId: string,
  startDate: Date,
  endDate: Date,
  tz: string,
): Promise<DisplayRangeResult> {
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  const dayPlans = await prisma.dayPlan.findMany({
    where: {
      date: { gte: start, lte: end },
      weekPlan: { familyId },
    },
    orderBy: { date: "asc" },
    include: {
      weekPlan: { select: { updatedAt: true } },
      suggestions: {
        where: { approved: true },
        include: { meal: true },
      },
    },
  });

  // Index existing day plans by their UTC-date label.
  const byDate = new Map<string, (typeof dayPlans)[number]>();
  for (const dp of dayPlans) {
    byDate.set(toDateString(dp.date), dp);
  }

  // Walk the requested range day-by-day so we can fill gaps as "unplanned".
  const days: DisplayDayResult[] = [];
  let maxUpdatedAt: Date | null = null;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const label = toDateString(cursor);
    const dp = byDate.get(label);
    const dow = dayOfWeekInTz(
      new Date(label + "T12:00:00Z"),
      tz,
    );

    if (!dp) {
      days.push({ date: label, dayOfWeek: dow, status: "unplanned", meals: [] });
    } else {
      const meals: DisplayDayMeal[] = dp.suggestions.map((s) => ({
        id: s.meal.id,
        name: s.meal.name,
        description: s.meal.description,
        placeholderKind: s.meal.placeholderKind,
        imageUrl: s.meal.imageUrl,
      }));

      let status: DisplayDayResult["status"];
      if (meals.length === 0) {
        status = "unplanned";
      } else if (meals.every((m) => m.placeholderKind === "SKIP")) {
        status = "skipped";
      } else {
        status = "planned";
      }

      // For back-compat clients that key on `meals: []`, hide entries on
      // skipped days (the new `status` field carries the signal).
      const exposedMeals = status === "skipped" ? [] : meals;

      days.push({ date: label, dayOfWeek: dow, status, meals: exposedMeals });

      // Track the freshest mutation across everything that contributed.
      const candidates: Date[] = [dp.weekPlan.updatedAt];
      for (const s of dp.suggestions) {
        candidates.push(s.createdAt);
        candidates.push(s.meal.updatedAt);
      }
      for (const c of candidates) {
        if (!maxUpdatedAt || c.getTime() > maxUpdatedAt.getTime()) {
          maxUpdatedAt = c;
        }
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { days, maxUpdatedAt };
}
