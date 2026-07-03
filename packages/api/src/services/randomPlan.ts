import type { Difficulty, Prisma } from "@prisma/client";
import prisma from "../config/database.js";
import { SuggestionError, scheduleMealByDate } from "./weekPlan.js";
import { getLastCookedMap } from "./meals.js";

/**
 * Random meal selection + scheduling (issue #113).
 *
 * The "random" core is deliberately isolated behind an injectable {@link Rng}
 * so it is fully auditable and deterministic under test — the candidate set is
 * derived by a pure, family-scoped query and the pick is a single `rng()` draw
 * over a stably-ordered id list. No schema change: this reuses the existing
 * `WeekPlan`/`DayPlan`/`MealSuggestion` models, the `meal_plan:schedule` scope,
 * and the family-scoped `scheduleMealByDate` → `addSuggestion` write path, so a
 * randomly-picked meal is scheduled as an UNAPPROVED suggestion (parent approval
 * preserved).
 */

/** A source of randomness in [0, 1). Defaults to `Math.random`; tests inject a
 *  deterministic function (e.g. `() => 0` picks the first candidate). */
export type Rng = () => number;

/**
 * Eligibility filters for random selection. Semantics mirror the meals list
 * endpoint exactly: OR-within a facet (any supplied value matches), AND-across
 * facets (every supplied facet must be satisfied). All filters are optional; an
 * empty filter set selects from the family's entire non-placeholder catalog.
 */
export interface RandomSelectFilters {
  /** Category names (case-insensitive). OR-within, matched on `nameNormalized`. */
  categories?: string[];
  /** Tag names (case-insensitive). OR-within, matched on `nameNormalized`. */
  tags?: string[];
  /**
   * Recipe-collection names (case-insensitive). OR-within, matched on
   * `nameNormalized`. Additive facet consumed by the week-fill surface (#115);
   * `scheduleRandomMeal` (#113) simply never supplies it.
   */
  collections?: string[];
  /** Difficulty levels; OR-within. */
  difficulty?: Difficulty[];
  /** Restrict to (or exclude) favorites. */
  favorite?: boolean;
  /**
   * "Avoid-recent": exclude any candidate whose most recent APPROVED cook date
   * falls within this many days before the target schedule date. `0`/undefined
   * disables the window (nothing is excluded on recency grounds).
   */
  avoidRecentDays?: number;
}

/**
 * Builds the family-scoped candidate `WhereInput`. Placeholder meals (Leftovers,
 * Free Day, …) are ALWAYS excluded — a random pick should never surface one.
 * Filter construction mirrors `listMeals` (OR-within facet, AND-across facet)
 * so the two surfaces stay behaviorally identical. Exported so the week-fill
 * surface (#115) reuses the exact same eligibility semantics.
 */
export function buildCandidateWhere(
  familyId: string,
  filters: RandomSelectFilters,
): Prisma.MealWhereInput {
  const where: Prisma.MealWhereInput = { familyId, placeholderKind: null };

  const tagNames = (filters.tags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const categoryNames = (filters.categories ?? [])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const collectionNames = (filters.collections ?? [])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  if (filters.difficulty?.length) {
    where.difficulty = { in: filters.difficulty };
  }
  if (filters.favorite !== undefined) {
    where.favorite = filters.favorite;
  }
  if (tagNames.length) {
    where.tags = { some: { tag: { nameNormalized: { in: tagNames } } } };
  }
  if (categoryNames.length) {
    where.categories = {
      some: { category: { nameNormalized: { in: categoryNames } } },
    };
  }
  if (collectionNames.length) {
    where.collections = {
      some: { recipeCollection: { nameNormalized: { in: collectionNames } } },
    };
  }

  return where;
}

/**
 * Drops candidates cooked too recently. A candidate is excluded when its most
 * recent approved cook date is strictly after `referenceDate - avoidRecentDays`
 * (i.e. within the window); a meal cooked exactly `avoidRecentDays` days before,
 * or never cooked, is kept. Recency is derived from the same double
 * family-scoped `getLastCookedMap` used by the meals list — no new query shape.
 * Exported so the week-fill surface (#115) reuses the identical recency rule.
 */
export async function filterAvoidRecent(
  familyId: string,
  candidateIds: string[],
  avoidRecentDays: number | undefined,
  referenceDate: Date,
): Promise<string[]> {
  if (!avoidRecentDays || avoidRecentDays <= 0 || candidateIds.length === 0) {
    return candidateIds;
  }

  const cookMap = await getLastCookedMap(familyId, candidateIds);

  const cutoff = new Date(referenceDate);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - avoidRecentDays);

  return candidateIds.filter((id) => {
    const hist = cookMap.get(id);
    if (!hist) return true; // never cooked → always eligible
    const cooked = new Date(`${hist.lastCookedOn}T00:00:00Z`);
    return cooked.getTime() <= cutoff.getTime();
  });
}

/**
 * AUDITABLE CORE — picks one eligible meal id at random. Deterministic given a
 * candidate set and `rng`: candidates are ordered `id asc`, then a single draw
 * `floor(rng() * n)` (clamped for a defensive `rng() === 1`) selects the index.
 * Has NO scheduling side-effects, so it can be unit-tested in isolation.
 *
 * @throws {SuggestionError} 422 when no meal matches the filters + recency window.
 */
export async function selectRandomMeal(
  familyId: string,
  filters: RandomSelectFilters,
  referenceDate: Date,
  rng: Rng = Math.random,
): Promise<{ mealId: string; candidateCount: number }> {
  const where = buildCandidateWhere(familyId, filters);
  const rows = await prisma.meal.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const ids = await filterAvoidRecent(
    familyId,
    rows.map((r) => r.id),
    filters.avoidRecentDays,
    referenceDate,
  );

  if (ids.length === 0) {
    throw new SuggestionError(
      422,
      "No eligible meals match the given filters",
    );
  }

  const raw = Math.floor(rng() * ids.length);
  const index = Math.min(Math.max(raw, 0), ids.length - 1);
  return { mealId: ids[index], candidateCount: ids.length };
}

/**
 * Selects an eligible meal at random and schedules it onto `date` as an
 * UNAPPROVED suggestion. The reference point for avoid-recent is `date` itself
 * (the target schedule date). Scheduling delegates to the existing family-scoped
 * `scheduleMealByDate` → `addSuggestion`, which enforces that BOTH the resolved
 * day plan and the picked meal belong to `familyId` — so cross-family writes are
 * impossible on both the read (candidate query) and write paths.
 */
export async function scheduleRandomMeal(params: {
  familyId: string;
  date: Date;
  userId: string;
  filters: RandomSelectFilters;
  rng?: Rng;
}) {
  const { familyId, date, userId, filters, rng } = params;
  const { mealId } = await selectRandomMeal(
    familyId,
    filters,
    date,
    rng ?? Math.random,
  );
  return scheduleMealByDate(familyId, mealId, date, userId);
}
