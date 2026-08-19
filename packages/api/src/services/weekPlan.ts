import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import prisma from "../config/database.js";
import { DAYS_OF_WEEK, type DayOfWeek } from "@meal-planner/shared";

const suggestionInclude = Prisma.validator<Prisma.MealSuggestionInclude>()({
  meal: {
    include: {
      slots: {
        orderBy: { position: "asc" },
        include: {
          options: {
            orderBy: { position: "asc" },
            include: {
              ingredients: { orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  },
  suggestedBy: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
  choices: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      ingredients: { orderBy: { position: "asc" } },
    },
  },
});

const weekPlanInclude = Prisma.validator<Prisma.WeekPlanInclude>()({
  days: {
    orderBy: { date: "asc" },
    include: {
      suggestions: {
        include: suggestionInclude,
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

export async function resolveSuggestionChoices(
  familyId: string,
  suggestionId: string,
  selections: Array<{ slotId: string; optionId: string }>,
  actor: { id: string; isParent: boolean },
) {
  const suggestion = await prisma.mealSuggestion.findFirst({
    where: { id: suggestionId, dayPlan: { weekPlan: { familyId } } },
    select: {
      id: true,
      userId: true,
      approved: true,
      meal: {
        select: {
          slots: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              name: true,
              options: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  name: true,
                  ingredients: {
                    orderBy: { position: "asc" },
                    select: {
                      name: true,
                      quantity: true,
                      unit: true,
                      category: true,
                      position: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!suggestion) {
    throw new SuggestionError(404, "Suggestion not found");
  }
  if (suggestion.approved) {
    throw new SuggestionError(
      409,
      "Cannot resolve choices for an approved suggestion",
    );
  }
  if (!actor.isParent && suggestion.userId !== actor.id) {
    throw new SuggestionError(
      403,
      "Only the suggester or a parent can resolve suggestion choices",
    );
  }

  const slots = suggestion.meal.slots;
  if (slots.length === 0 && selections.length > 0) {
    throw new SuggestionError(422, "Meal has no choice slots to resolve");
  }
  if (selections.length !== slots.length) {
    throw new SuggestionError(
      422,
      "Selections must include exactly one option for every slot",
    );
  }

  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const selectedSlotIds = new Set<string>();
  const choiceRows: Prisma.SuggestionChoiceSnapshotCreateManyInput[] = [];
  const ingredientRows: Prisma.SuggestionChoiceIngredientSnapshotCreateManyInput[] =
    [];

  for (const selection of selections) {
    const slot = slotById.get(selection.slotId);
    if (!slot) {
      throw new SuggestionError(422, "Selection contains an unknown slot");
    }
    if (selectedSlotIds.has(slot.id)) {
      throw new SuggestionError(
        422,
        "Selections must include each slot exactly once",
      );
    }
    selectedSlotIds.add(slot.id);

    const option = slot.options.find((candidate) => candidate.id === selection.optionId);
    if (!option) {
      throw new SuggestionError(
        422,
        "Selection contains an option that does not belong to its slot",
      );
    }

    const choiceId = randomUUID();
    choiceRows.push({
      id: choiceId,
      suggestionId,
      slotId: slot.id,
      optionId: option.id,
      slotName: slot.name,
      optionName: option.name,
    });
    for (const ingredient of option.ingredients) {
      ingredientRows.push({
        id: randomUUID(),
        choiceId,
        name: ingredient.name,
        quantity: ingredient.quantity ?? null,
        unit: ingredient.unit ?? null,
        category: ingredient.category ?? null,
        position: ingredient.position,
      });
    }
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // TOCTOU guard: re-read approval state inside the transaction so a
    // concurrent approval between the pre-check above and this write cannot
    // silently mutate snapshots on an already-approved suggestion (#226).
    const live = await tx.mealSuggestion.findUnique({
      where: { id: suggestionId },
      select: { approved: true },
    });
    if (!live) {
      throw new SuggestionError(404, "Suggestion not found");
    }
    if (live.approved) {
      throw new SuggestionError(
        409,
        "Cannot resolve choices for an approved suggestion",
      );
    }

    await tx.suggestionChoiceSnapshot.deleteMany({ where: { suggestionId } });
    if (choiceRows.length > 0) {
      await tx.suggestionChoiceSnapshot.createMany({ data: choiceRows });
    }
    if (ingredientRows.length > 0) {
      await tx.suggestionChoiceIngredientSnapshot.createMany({
        data: ingredientRows,
      });
    }
    return tx.mealSuggestion.findUniqueOrThrow({
      where: { id: suggestionId },
      include: suggestionInclude,
    });
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
    select: {
      id: true,
      meal: { select: { slots: { select: { id: true } } } },
      choices: { select: { slotId: true } },
    },
  });
  if (!owned) {
    throw new SuggestionError(404, "Suggestion not found");
  }

  const requiredSlotIds = owned.meal?.slots?.map((slot) => slot.id) ?? [];
  if (requiredSlotIds.length > 0) {
    const selectedSlotIds = (owned.choices ?? []).map((choice) => choice.slotId);
    const selectedSet = new Set(
      selectedSlotIds.filter((slotId): slotId is string => Boolean(slotId)),
    );
    const hasEverySlot = requiredSlotIds.every((slotId) => selectedSet.has(slotId));
    const hasExactCount = selectedSlotIds.length === requiredSlotIds.length;
    const hasNoDuplicates = selectedSet.size === requiredSlotIds.length;
    if (!hasEverySlot || !hasExactCount || !hasNoDuplicates) {
      throw new SuggestionError(
        409,
        "All required meal choices must be resolved before approval",
      );
    }
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
 * Clears approval on a suggestion, enforcing that it belongs to `familyId`
 * via dayPlan.weekPlan.familyId before mutating. A suggestion owned by another
 * family yields 404 without modifying `approved`.
 */
export async function unapproveSuggestion(
  familyId: string,
  suggestionId: string,
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
      approved: false,
      approvedByActorType: null,
      approvedById: null,
      approvedAt: null,
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

/* -------------------------------------------------------------------------- */
/* MCP-friendly read/schedule surface                                         */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the family's IANA timezone, falling back to "UTC" when the column
 * is missing/empty or is not a timezone the runtime's Intl recognizes. Used by
 * the current-week endpoint so "current" is computed in the family's local
 * calendar rather than the server's.
 */
export async function getFamilyTimezone(familyId: string): Promise<string> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { timezone: true },
  });
  const tz = family?.timezone;
  return tz && isValidTimezone(tz) ? tz : "UTC";
}

/**
 * Resolves the Monday (UTC-midnight) that starts the *current* week in the
 * family's timezone. The family-local calendar date is read first, then used
 * as a UTC anchor for the Monday math — this matches how `weekStart` is stored
 * (UTC midnight) and stays correct for timezones both ahead of and behind UTC.
 */
export async function getCurrentWeekStart(
  familyId: string,
): Promise<{ tz: string; monday: Date }> {
  const tz = await getFamilyTimezone(familyId);
  const localDate = formatDateInTz(new Date(), tz); // YYYY-MM-DD in family tz
  const localMidnightUtc = new Date(`${localDate}T00:00:00Z`);
  return { tz, monday: getMondayOfWeek(localMidnightUtc) };
}

/**
 * Returns the current week plan for a family, resolving "current" in the
 * family's timezone and creating the (empty) week if it does not yet exist so
 * MCP callers always receive a coherent, fully-formed week.
 */
export async function getCurrentWeekPlan(familyId: string) {
  const { monday } = await getCurrentWeekStart(familyId);
  return getOrCreateWeekPlan(familyId, monday);
}

/**
 * Lists previous week plans in reverse-chronological order with bounded
 * pagination. `before` (if given) is normalized to its week's Monday and the
 * result contains only weeks strictly before it; otherwise the family's current
 * week is used as the exclusive upper bound. `limit` is clamped to 1..52
 * (default 8) so a single MCP call can never request an unbounded scan.
 */
export async function getPreviousWeekPlans(
  familyId: string,
  options: { before?: Date; limit?: number } = {},
) {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 8), 1), 52);
  const beforeMonday = options.before
    ? getMondayOfWeek(options.before)
    : (await getCurrentWeekStart(familyId)).monday;

  return prisma.weekPlan.findMany({
    where: { familyId, weekStart: { lt: beforeMonday } },
    orderBy: { weekStart: "desc" },
    take: limit,
    include: weekPlanInclude,
  });
}

/**
 * Schedules a meal onto a calendar `date` without the caller needing to know a
 * `dayPlanId`. The service resolves (creating if missing) the WeekPlan for the
 * Monday of `date`'s week, finds the matching DayPlan, then delegates to
 * {@link addSuggestion} — which enforces that BOTH the day and the meal belong
 * to `familyId`. A `date` that does not fall on a day in the resolved week
 * yields a 400 (it should not happen, since the week always spans Mon–Sun).
 */
export async function scheduleMealByDate(
  familyId: string,
  mealId: string,
  date: Date,
  userId: string,
) {
  const monday = getMondayOfWeek(date);
  const week = await getOrCreateWeekPlan(familyId, monday);

  const target = new Date(date);
  target.setUTCHours(0, 0, 0, 0);
  const targetLabel = toDateString(target);

  const day = week.days.find((d) => toDateString(d.date) === targetLabel);
  if (!day) {
    throw new SuggestionError(400, "Date is not within the resolved week");
  }

  return addSuggestion(familyId, day.id, mealId, userId);
}

/**
 * How {@link repeatWeek} treats a target week that already has suggestions:
 * - "error"   (default): refuse the whole operation with a 409 before writing
 *   anything, so an already-populated week is never silently duplicated.
 * - "skip":   copy only into target days that currently have zero suggestions;
 *   populated days are left untouched.
 * - "replace": delete every existing suggestion in the target week first, then
 *   copy the approved source meals in.
 */
export type RepeatWeekExistingMode = "error" | "skip" | "replace";

export interface RepeatWeekParams {
  familyId: string;
  sourceWeekStart: Date;
  targetWeekStart: Date;
  userId: string;
  existingMode?: RepeatWeekExistingMode;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Copies the APPROVED meal suggestions from one week into another week as brand
 * new UNAPPROVED suggestions, preserving the parent approval workflow (every
 * copied row starts `approved: false` with `suggestedBy = userId`). Reuses the
 * existing WeekPlan / DayPlan / MealSuggestion models — no schema change.
 *
 * Both week starts must be Mondays (UTC-midnight) and must differ. The source
 * week is loaded family-scoped; a missing source week, or a source with no
 * approved suggestions, is a no-op that still returns the (get-or-created)
 * target week so callers always receive a coherent, fully-formed week. Days are
 * mapped between weeks by their offset from each Monday, so Mon→Mon … Sun→Sun
 * regardless of the calendar gap between the two weeks. Placeholder meals copy
 * exactly like normal meals.
 *
 * `existingMode` (default "error") is the deliberate, tested policy for a target
 * week that already contains suggestions — see {@link RepeatWeekExistingMode}.
 */
export async function repeatWeek(params: RepeatWeekParams) {
  const { familyId, userId } = params;
  const existingMode: RepeatWeekExistingMode = params.existingMode ?? "error";

  const source = new Date(params.sourceWeekStart);
  source.setUTCHours(0, 0, 0, 0);
  const target = new Date(params.targetWeekStart);
  target.setUTCHours(0, 0, 0, 0);

  if (source.getUTCDay() !== 1) {
    throw new SuggestionError(400, "sourceWeekStart must be a Monday");
  }
  if (target.getUTCDay() !== 1) {
    throw new SuggestionError(400, "targetWeekStart must be a Monday");
  }
  if (source.getTime() === target.getTime()) {
    throw new SuggestionError(
      400,
      "sourceWeekStart and targetWeekStart must differ",
    );
  }

  // Source is loaded family-scoped: a week owned by another family resolves to
  // null here and is therefore treated as an empty source (no-op below).
  const sourceWeek = await getWeekPlan(familyId, source);

  // Ensure the target week exists with its 7 days. `create` is keyed on
  // familyId, so a cross-family target is impossible.
  const targetWeek = await getOrCreateWeekPlan(familyId, target);

  // Collect approved source suggestions grouped by day offset from the source
  // Monday (0 = Mon .. 6 = Sun), including immutable choice snapshots so repeat
  // copies prior selections exactly instead of re-resolving live options.
  const approvedByOffset = new Map<
    number,
    Array<{
      mealId: string;
      choices: Array<{
        slotId: string | null;
        optionId: string | null;
        slotName: string;
        optionName: string;
        ingredients: Array<{
          name: string;
          quantity: string | null;
          unit: string | null;
          category: string | null;
          position: number;
        }>;
      }>;
    }>
  >();
  if (sourceWeek) {
    for (const day of sourceWeek.days) {
      const dayDate = new Date(day.date);
      dayDate.setUTCHours(0, 0, 0, 0);
      const offset = Math.round((dayDate.getTime() - source.getTime()) / MS_PER_DAY);
      const suggestions = day.suggestions
        .filter((suggestion) => suggestion.approved)
        .map((suggestion) => ({
          mealId: suggestion.mealId,
          choices: (suggestion.choices ?? []).map((choice) => ({
            slotId: choice.slotId ?? null,
            optionId: choice.optionId ?? null,
            slotName: choice.slotName,
            optionName: choice.optionName,
            ingredients: (choice.ingredients ?? []).map((ingredient) => ({
              name: ingredient.name,
              quantity: ingredient.quantity ?? null,
              unit: ingredient.unit ?? null,
              category: ingredient.category ?? null,
              position: ingredient.position,
            })),
          })),
        }));
      if (suggestions.length > 0) {
        approvedByOffset.set(offset, suggestions);
      }
    }
  }

  // Nothing approved to copy -> no-op. Return the target week untouched.
  if (approvedByOffset.size === 0) {
    return targetWeek;
  }

  // Index target days by their offset from the target Monday.
  const targetDayByOffset = new Map<number, (typeof targetWeek.days)[number]>();
  for (const day of targetWeek.days) {
    const dayDate = new Date(day.date);
    dayDate.setUTCHours(0, 0, 0, 0);
    const offset = Math.round((dayDate.getTime() - target.getTime()) / MS_PER_DAY);
    targetDayByOffset.set(offset, day);
  }

  const targetHasSuggestions = targetWeek.days.some(
    (d) => d.suggestions.length > 0,
  );
  if (existingMode === "error" && targetHasSuggestions) {
    throw new SuggestionError(
      409,
      "Target week already has suggestions; retry with existingMode 'skip' or 'replace'",
    );
  }

  const rows: Array<{
    id: string;
    dayPlanId: string;
    mealId: string;
    userId: string;
    choices: Array<{
      slotId: string | null;
      optionId: string | null;
      slotName: string;
      optionName: string;
      ingredients: Array<{
        name: string;
        quantity: string | null;
        unit: string | null;
        category: string | null;
        position: number;
      }>;
    }>;
  }> = [];
  for (const [offset, suggestions] of approvedByOffset) {
    const targetDay = targetDayByOffset.get(offset);
    if (!targetDay) continue; // defensive: offsets 0..6 always exist
    if (existingMode === "skip" && targetDay.suggestions.length > 0) {
      continue;
    }
    for (const suggestion of suggestions) {
      rows.push({
        id: randomUUID(),
        dayPlanId: targetDay.id,
        mealId: suggestion.mealId,
        userId,
        choices: suggestion.choices,
      });
    }
  }

  const targetDayIds = targetWeek.days.map((d) => d.id);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (existingMode === "replace") {
      await tx.mealSuggestion.deleteMany({
        where: { dayPlanId: { in: targetDayIds } },
      });
    }
    if (rows.length > 0) {
      await tx.mealSuggestion.createMany({
        data: rows.map((row) => ({
          id: row.id,
          dayPlanId: row.dayPlanId,
          mealId: row.mealId,
          userId: row.userId,
          approved: false,
        })),
      });

      const choiceRows: Prisma.SuggestionChoiceSnapshotCreateManyInput[] = [];
      const ingredientRows: Prisma.SuggestionChoiceIngredientSnapshotCreateManyInput[] =
        [];
      for (const row of rows) {
        for (const choice of row.choices) {
          const choiceId = randomUUID();
          choiceRows.push({
            id: choiceId,
            suggestionId: row.id,
            slotId: choice.slotId ?? null,
            optionId: choice.optionId ?? null,
            slotName: choice.slotName,
            optionName: choice.optionName,
          });
          for (const ingredient of choice.ingredients) {
            ingredientRows.push({
              id: randomUUID(),
              choiceId,
              name: ingredient.name,
              quantity: ingredient.quantity ?? null,
              unit: ingredient.unit ?? null,
              category: ingredient.category ?? null,
              position: ingredient.position,
            });
          }
        }
      }
      if (choiceRows.length > 0) {
        await tx.suggestionChoiceSnapshot.createMany({ data: choiceRows });
      }
      if (ingredientRows.length > 0) {
        await tx.suggestionChoiceIngredientSnapshot.createMany({
          data: ingredientRows,
        });
      }
    }
  });

  // Re-fetch so the returned week reflects the newly copied suggestions.
  return getOrCreateWeekPlan(familyId, target);
}
