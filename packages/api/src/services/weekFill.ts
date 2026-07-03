import type { Prisma } from "@prisma/client";
import prisma from "../config/database.js";
import {
  buildCandidateWhere,
  filterAvoidRecent,
  type RandomSelectFilters,
  type Rng,
} from "./randomPlan.js";
import {
  getOrCreateWeekPlan,
  SuggestionError,
  type RepeatWeekExistingMode,
} from "./weekPlan.js";

/**
 * Tag/collection-based week filling (issue #115).
 *
 * Fills the OPEN days of a target week with meals picked at random from the
 * family's eligible catalog, filtered by the same vocabulary as random
 * scheduling (#113) plus recipe collections (#109). Every created row is an
 * UNAPPROVED `MealSuggestion` (`approved: false`) — a parent approves them
 * separately through the existing approval workflow. No schema change: this
 * reuses the `WeekPlan`/`DayPlan`/`MealSuggestion` models and the
 * `meal_plan:schedule` scope.
 *
 * Determinism: selection reuses #113's exported building blocks
 * ({@link buildCandidateWhere} + {@link filterAvoidRecent}) over an id-asc
 * candidate pool, then draws without replacement via an injectable {@link Rng}
 * (default `Math.random`). Tests inject e.g. `() => 0` to assign candidates in
 * id-asc order to days Mon..Sun, making every assertion stable.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface FillWeekParams {
  familyId: string;
  weekStart: Date;
  userId: string;
  filters: RandomSelectFilters;
  /**
   * Policy for a target week that already has suggestions (default "error"):
   *  - "error":   any existing suggestion → 409 (non-destructive default)
   *  - "skip":    fill only the days that currently have zero suggestions
   *  - "replace": delete all target-week suggestions, then fill all 7 days
   */
  existingMode?: RepeatWeekExistingMode;
  /**
   * When true (default), fill as many open days as the eligible pool allows and
   * stop when candidates are exhausted (a distinct meal per day). When false,
   * an eligible pool smaller than the number of open days is a 422 — the caller
   * wants an all-or-nothing fill.
   */
  allowPartial?: boolean;
  /** Injectable randomness for deterministic tests. Defaults to `Math.random`. */
  rng?: Rng;
  /**
   * Reference point for avoid-recent. Defaults to the target week's Monday.
   * Overridable so tests can pin recency independently of the calendar.
   */
  referenceDate?: Date;
}

/**
 * Fills open days of `weekStart` with randomly-selected eligible meals as new
 * UNAPPROVED suggestions. Returns the fully-formed target week (refetched).
 *
 * @throws {SuggestionError} 400 when `weekStart` is not a Monday.
 * @throws {SuggestionError} 409 when `existingMode` is "error" and the week
 *   already has suggestions.
 * @throws {SuggestionError} 422 when no meal matches the filters, or when
 *   `allowPartial` is false and the eligible pool is smaller than the number of
 *   open days.
 */
export async function fillWeek(params: FillWeekParams) {
  const { familyId, userId, filters, rng = Math.random } = params;
  const existingMode: RepeatWeekExistingMode = params.existingMode ?? "error";
  const allowPartial = params.allowPartial ?? true;

  const monday = new Date(params.weekStart);
  monday.setUTCHours(0, 0, 0, 0);
  if (monday.getUTCDay() !== 1) {
    throw new SuggestionError(400, "weekStart must be a Monday");
  }

  // Ensure the target week exists with its 7 days. `create` is keyed on
  // familyId, so a cross-family target is impossible.
  const week = await getOrCreateWeekPlan(familyId, monday);

  // Index days by offset from Monday (0 = Mon .. 6 = Sun) for a stable order.
  const daysByOffset = new Map<number, (typeof week.days)[number]>();
  for (const day of week.days) {
    const dayDate = new Date(day.date);
    dayDate.setUTCHours(0, 0, 0, 0);
    const offset = Math.round((dayDate.getTime() - monday.getTime()) / MS_PER_DAY);
    daysByOffset.set(offset, day);
  }

  const weekHasSuggestions = week.days.some((d) => d.suggestions.length > 0);
  if (existingMode === "error" && weekHasSuggestions) {
    throw new SuggestionError(
      409,
      "Target week already has suggestions; retry with existingMode 'skip' or 'replace'",
    );
  }

  // Which days receive a meal, in Mon..Sun order. For "skip" only the empty
  // days are filled; "error" (already validated empty) and "replace" fill all 7.
  const daysToFill: (typeof week.days)[number][] = [];
  for (let offset = 0; offset < 7; offset++) {
    const day = daysByOffset.get(offset);
    if (!day) continue; // defensive: offsets 0..6 always exist
    if (existingMode === "skip" && day.suggestions.length > 0) continue;
    daysToFill.push(day);
  }

  // Build the eligible candidate pool once (single query), then apply the same
  // avoid-recent recency rule the random surface uses.
  const referenceDate = params.referenceDate ?? monday;
  const where = buildCandidateWhere(familyId, filters);
  const rows = await prisma.meal.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const candidateIds = await filterAvoidRecent(
    familyId,
    rows.map((r) => r.id),
    filters.avoidRecentDays,
    referenceDate,
  );

  if (candidateIds.length === 0) {
    throw new SuggestionError(422, "No eligible meals match the given filters");
  }
  if (!allowPartial && candidateIds.length < daysToFill.length) {
    throw new SuggestionError(
      422,
      "Not enough eligible meals to fill all open days",
    );
  }

  // Draw WITHOUT replacement so each filled day gets a distinct meal. The pool
  // is id-asc ordered; `rng()` selects an index, which is spliced out. When the
  // pool is exhausted before every open day is covered we stop (partial fill).
  const pool = [...candidateIds];
  const rowsToCreate: Prisma.MealSuggestionCreateManyInput[] = [];
  for (const day of daysToFill) {
    if (pool.length === 0) break;
    const raw = Math.floor(rng() * pool.length);
    const index = Math.min(Math.max(raw, 0), pool.length - 1);
    const [mealId] = pool.splice(index, 1);
    rowsToCreate.push({ dayPlanId: day.id, mealId, userId, approved: false });
  }

  const targetDayIds = week.days.map((d) => d.id);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (existingMode === "replace") {
      await tx.mealSuggestion.deleteMany({
        where: { dayPlanId: { in: targetDayIds } },
      });
    }
    if (rowsToCreate.length > 0) {
      await tx.mealSuggestion.createMany({ data: rowsToCreate });
    }
  });

  return getOrCreateWeekPlan(familyId, monday);
}
