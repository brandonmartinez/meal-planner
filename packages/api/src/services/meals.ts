import prisma from "../config/database.js";
import {
  MEAL_PLACEHOLDER_KINDS,
  MEAL_PLACEHOLDERS,
  PLACEHOLDER_NAMES_LOWER,
} from "@meal-planner/shared";
import type { Difficulty, MealListResponseDTO } from "@meal-planner/shared";
import type { Prisma } from "@prisma/client";
import { getCurrentWeekStart, getMondayOfWeek } from "./weekPlan.js";
import { syncMealTaxonomy } from "./taxonomy.js";
import type { ListMealsQuery } from "../schemas/meals.js";

/** Prisma `include` that pulls a meal's tag/category join rows with their
 *  parent taxonomy records. Shared by every read path so the wire shape stays
 *  consistent. */
const MEAL_TAXONOMY_INCLUDE = {
  tags: { include: { tag: true } },
  categories: { include: { category: true } },
} satisfies Prisma.MealInclude;

/** The subset of a meal's included join rows this module reads. */
type TaxonomyJoinRows = {
  tags: { tag: { id: string; name: string; familyId: string } }[];
  categories: { category: { id: string; name: string; familyId: string } }[];
};

/** Project a meal's tag/category join rows into flat `Tag[]` / `Category[]`
 *  wire shapes, dropping `nameNormalized` and timestamps (internal only). */
function mapTaxonomy(meal: TaxonomyJoinRows) {
  return {
    tags: (meal.tags ?? []).map((mt) => ({
      id: mt.tag.id,
      name: mt.tag.name,
      familyId: mt.tag.familyId,
    })),
    categories: (meal.categories ?? []).map((mc) => ({
      id: mc.category.id,
      name: mc.category.name,
      familyId: mc.category.familyId,
    })),
  };
}

/** Return a meal with its join rows replaced by flat taxonomy arrays. */
function flattenMeal<T extends TaxonomyJoinRows>(meal: T) {
  return { ...meal, ...mapTaxonomy(meal) };
}

/** Calendar-date label (YYYY-MM-DD) of a stored DayPlan/WeekPlan date. Week and
 *  day dates are persisted at UTC midnight, so the UTC slice IS the intended
 *  calendar day — this matches how the rest of the codebase labels those dates
 *  (see `weekPlan.toDateString`). */
function dateLabel(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function listMeals(
  familyId: string,
  opts: ListMealsQuery = { sort: "name", order: "asc", limit: 25, offset: 0 },
): Promise<MealListResponseDTO> {
  const {
    search,
    difficulty,
    favorite,
    minRating,
    tags,
    categories,
    sort,
    order,
    limit,
    offset,
  } = opts;

  // Normalize filter names to match the stored `nameNormalized` column.
  const tagNames = (tags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const categoryNames = (categories ?? [])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  const hasFilter = Boolean(
    search ||
      difficulty?.length ||
      favorite !== undefined ||
      minRating !== undefined ||
      tagNames.length ||
      categoryNames.length,
  );

  const where: Prisma.MealWhereInput = { familyId };

  // Placeholders are excluded whenever any search/filter is active.
  // Unfiltered pagination keeps them so MealPicker continues to work as before.
  if (hasFilter) {
    where.placeholderKind = null;
  }

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  if (difficulty?.length) {
    where.difficulty = { in: difficulty };
  }

  if (favorite !== undefined) {
    where.favorite = favorite;
  }

  // minRating filters to meals rated at or above the threshold; unrated
  // (null) meals are excluded by the `gte` comparison.
  if (minRating !== undefined) {
    where.rating = { gte: minRating };
  }

  // Taxonomy filters: OR-within a facet (any supplied tag matches), AND-across
  // facets (tag filter AND category filter must both be satisfied). Join rows
  // are family-scoped transitively via the parent tag/category records.
  if (tagNames.length) {
    where.tags = { some: { tag: { nameNormalized: { in: tagNames } } } };
  }
  if (categoryNames.length) {
    where.categories = {
      some: { category: { nameNormalized: { in: categoryNames } } },
    };
  }

  // lastCooked sort is derived — fetch all, enrich, sort app-side, then slice.
  if (sort === "lastCooked") {
    const allMeals = await prisma.meal.findMany({
      where,
      include: {
        _count: { select: { ingredients: true } },
        ...MEAL_TAXONOMY_INCLUDE,
      },
    });

    const mealIds = allMeals.map((m) => m.id);
    const recentByMeal = await getRecentlyScheduledMap(familyId);
    const lastCookedByMeal = await getLastCookedMap(familyId, mealIds);

    const enriched = allMeals.map((meal) => {
      const last = recentByMeal.get(meal.id);
      const cooked = lastCookedByMeal.get(meal.id);
      return {
        ...meal,
        ...mapTaxonomy(meal),
        recentlyScheduled: last !== undefined,
        lastScheduledOn: last ?? null,
        lastCookedOn: cooked?.lastCookedOn ?? null,
        timesCooked: cooked?.timesCooked ?? 0,
      };
    });

    // Nulls-last; tiebreak name asc regardless of order direction.
    enriched.sort((a, b) => {
      if (a.lastCookedOn === null && b.lastCookedOn === null)
        return a.name.localeCompare(b.name);
      if (a.lastCookedOn === null) return 1;
      if (b.lastCookedOn === null) return -1;
      const cmp = a.lastCookedOn.localeCompare(b.lastCookedOn);
      if (cmp !== 0) return order === "asc" ? cmp : -cmp;
      return a.name.localeCompare(b.name);
    });

    const total = enriched.length;
    const items = enriched.slice(offset, offset + limit).map((m) => ({
      ...m,
      description: m.description ?? undefined,
      imageUrl: m.imageUrl ?? undefined,
    }));
    return { items, total, limit, offset, hasMore: offset + items.length < total };
  }

  // DB-side sort + pagination for name / created.
  const orderBy: Prisma.MealOrderByWithRelationInput =
    sort === "created" ? { createdAt: order } : { name: order };

  const [total, meals] = await prisma.$transaction([
    prisma.meal.count({ where }),
    prisma.meal.findMany({
      where,
      include: {
        _count: { select: { ingredients: true } },
        ...MEAL_TAXONOMY_INCLUDE,
      },
      orderBy,
      skip: offset,
      take: limit,
    }),
  ]);

  const mealIds = meals.map((m) => m.id);
  const recentByMeal = await getRecentlyScheduledMap(familyId);
  const lastCookedByMeal = await getLastCookedMap(familyId, mealIds);

  const items = meals.map((meal) => {
    const last = recentByMeal.get(meal.id);
    const cooked = lastCookedByMeal.get(meal.id);
    return {
      ...meal,
      ...mapTaxonomy(meal),
      description: meal.description ?? undefined,
      imageUrl: meal.imageUrl ?? undefined,
      recentlyScheduled: last !== undefined,
      lastScheduledOn: last ?? null,
      lastCookedOn: cooked?.lastCookedOn ?? null,
      timesCooked: cooked?.timesCooked ?? 0,
    };
  });

  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

/**
 * Builds a `Map<mealId, lastScheduledOn>` of meals "recently scheduled" for a
 * family — i.e. meals with at least one **approved** `MealSuggestion` whose
 * `WeekPlan.weekStart` is the family's current or immediately previous week,
 * resolved in `Family.timezone` (issue #27).
 *
 * Runs in a bounded, constant number of queries regardless of meal count: the
 * family timezone/current-week resolution, plus ONE windowed suggestion query
 * (no per-meal lookups). The result maps each qualifying meal to the calendar
 * date (YYYY-MM-DD) of its most recent approved suggestion in the window.
 *
 * Family scoping is enforced on BOTH sides — `meal.familyId` and
 * `dayPlan.weekPlan.familyId` — so suggestions from another family can never
 * flag a meal (preserves the #9 IDOR direction).
 */
async function getRecentlyScheduledMap(
  familyId: string,
): Promise<Map<string, string>> {
  const { monday: currentWeekStart } = await getCurrentWeekStart(familyId);
  const previousWeekStart = getMondayOfWeek(
    new Date(currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000),
  );

  const recentSuggestions = await prisma.mealSuggestion.findMany({
    where: {
      approved: true,
      meal: { familyId },
      dayPlan: {
        weekPlan: {
          familyId,
          weekStart: { in: [previousWeekStart, currentWeekStart] },
        },
      },
    },
    select: {
      mealId: true,
      dayPlan: { select: { date: true } },
    },
  });

  // Reduce to most-recent approved scheduling date per meal.
  const latest = new Map<string, Date>();
  for (const s of recentSuggestions) {
    const scheduledOn = s.dayPlan.date;
    const existing = latest.get(s.mealId);
    if (!existing || scheduledOn.getTime() > existing.getTime()) {
      latest.set(s.mealId, scheduledOn);
    }
  }

  const result = new Map<string, string>();
  for (const [mealId, date] of latest) {
    result.set(mealId, dateLabel(date));
  }
  return result;
}

/**
 * Cook-history derivation for a single meal (issue #99). Both fields are derived
 * at query time from **approved** `MealSuggestion` records — nothing is persisted.
 * - `lastCookedOn`: calendar date (`YYYY-MM-DD`) of the most recent approved
 *   suggestion, or `null` if the meal has never been cooked.
 * - `timesCooked`: all-time count of approved suggestions (no window).
 */
export interface CookHistory {
  lastCookedOn: string;
  timesCooked: number;
}

/**
 * Builds a `Map<mealId, CookHistory>` deriving the most recent **approved**
 * `MealSuggestion` date **and** the all-time approved count for each of the
 * given meal IDs, family-scoped on **both** sides — `meal.familyId` AND
 * `dayPlan.weekPlan.familyId` — enforcing the #9 IDOR direction. Both values
 * come from the SAME approved-suggestion query (one round-trip), so a meal's
 * `timesCooked` can never include another family's suggestions. Absent keys
 * mean the meal has never been approved onto a week plan. Exported for reuse by
 * downstream features (issue #99).
 */
export async function getLastCookedMap(
  familyId: string,
  mealIds: string[],
): Promise<Map<string, CookHistory>> {
  if (mealIds.length === 0) return new Map();

  const suggestions = await prisma.mealSuggestion.findMany({
    where: {
      mealId: { in: mealIds },
      approved: true,
      meal: { familyId },
      dayPlan: { weekPlan: { familyId } },
    },
    select: {
      mealId: true,
      dayPlan: { select: { date: true } },
    },
  });

  const latest = new Map<string, Date>();
  const counts = new Map<string, number>();
  for (const s of suggestions) {
    const d = s.dayPlan.date;
    const existing = latest.get(s.mealId);
    if (!existing || d.getTime() > existing.getTime()) {
      latest.set(s.mealId, d);
    }
    counts.set(s.mealId, (counts.get(s.mealId) ?? 0) + 1);
  }

  const result = new Map<string, CookHistory>();
  for (const [mealId, date] of latest) {
    result.set(mealId, {
      lastCookedOn: dateLabel(date),
      timesCooked: counts.get(mealId) ?? 0,
    });
  }
  return result;
}

export async function getMealById(mealId: string, familyId: string) {
  const meal = await prisma.meal.findFirst({
    where: { id: mealId, familyId },
    include: { ingredients: true, ...MEAL_TAXONOMY_INCLUDE },
  });
  return meal ? flattenMeal(meal) : null;
}

export async function createMeal(
  familyId: string,
  data: {
    name: string;
    description?: string;
    imageUrl?: string | null;
    difficulty?: Difficulty | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
    favorite?: boolean;
    rating?: number | null;
    ingredients?: {
      name: string;
      quantity?: string;
      unit?: string;
      category?: string;
    }[];
    tags?: string[];
    categories?: string[];
  },
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const meal = await tx.meal.create({
      data: {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        difficulty: data.difficulty,
        prepTimeMinutes: data.prepTimeMinutes,
        cookTimeMinutes: data.cookTimeMinutes,
        servings: data.servings,
        sourceUrl: data.sourceUrl,
        notes: data.notes,
        favorite: data.favorite,
        rating: data.rating,
        familyId,
        ingredients: data.ingredients?.length
          ? { create: data.ingredients }
          : undefined,
      },
    });
    await syncMealTaxonomy(tx, familyId, meal.id, data.tags, data.categories);
    const withTaxonomy = await tx.meal.findUniqueOrThrow({
      where: { id: meal.id },
      include: { ingredients: true, ...MEAL_TAXONOMY_INCLUDE },
    });
    return flattenMeal(withTaxonomy);
  });
}

export async function updateMeal(
  mealId: string,
  familyId: string,
  data: {
    name?: string;
    description?: string;
    imageUrl?: string | null;
    difficulty?: Difficulty | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
    favorite?: boolean;
    rating?: number | null;
    ingredients?: {
      name: string;
      quantity?: string;
      unit?: string;
      category?: string;
    }[];
    tags?: string[];
    categories?: string[];
  },
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Verify meal belongs to family
    const existing = await tx.meal.findFirst({
      where: { id: mealId, familyId },
    });
    if (!existing) throw new Error("Meal not found");
    if (existing.placeholderKind !== null) {
      throw new Error("Cannot modify placeholder meal");
    }

    // Delete old ingredients and create new ones
    if (data.ingredients !== undefined) {
      await tx.mealIngredient.deleteMany({ where: { mealId } });
    }

    await tx.meal.update({
      where: { id: mealId },
      data: {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        difficulty: data.difficulty,
        prepTimeMinutes: data.prepTimeMinutes,
        cookTimeMinutes: data.cookTimeMinutes,
        servings: data.servings,
        sourceUrl: data.sourceUrl,
        notes: data.notes,
        favorite: data.favorite,
        rating: data.rating,
        ingredients:
          data.ingredients !== undefined
            ? { create: data.ingredients }
            : undefined,
      },
    });
    await syncMealTaxonomy(tx, familyId, mealId, data.tags, data.categories);
    const meal = await tx.meal.findUniqueOrThrow({
      where: { id: mealId },
      include: { ingredients: true, ...MEAL_TAXONOMY_INCLUDE },
    });
    return flattenMeal(meal);
  });
}

export async function deleteMeal(mealId: string, familyId: string) {
  // Verify meal belongs to family
  const meal = await prisma.meal.findFirst({ where: { id: mealId, familyId } });
  if (!meal) throw new Error("Meal not found");
  if (meal.placeholderKind !== null) {
    throw new Error("Cannot delete placeholder meal");
  }

  // Check for approved suggestions in future weeks
  const now = new Date();
  const futureSuggestions = await prisma.mealSuggestion.findFirst({
    where: {
      mealId,
      approved: true,
      dayPlan: {
        date: { gte: now },
      },
    },
  });

  if (futureSuggestions) {
    throw new Error(
      "Cannot delete meal with approved suggestions in future weeks",
    );
  }

  await prisma.meal.delete({ where: { id: mealId } });
}

export async function importMeals(
  familyId: string,
  meals: {
    name: string;
    description?: string;
    imageUrl?: string | null;
    difficulty?: Difficulty | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
    favorite?: boolean;
    rating?: number | null;
    ingredients?: {
      name: string;
      quantity?: string;
      unit?: string;
      category?: string;
    }[];
    tags?: string[];
    categories?: string[];
  }[],
  options?: { mode?: "skip" | "replace" },
) {
  const mode = options?.mode ?? "skip";
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as { name: string; error: string }[],
  };

  for (const data of meals) {
    if (PLACEHOLDER_NAMES_LOWER.has(data.name.trim().toLowerCase())) {
      result.errors.push({
        name: data.name,
        error: "Name conflicts with a reserved placeholder meal",
      });
      continue;
    }
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.meal.findFirst({
          where: { familyId, name: data.name, placeholderKind: null },
        });

        if (existing) {
          if (mode === "skip") {
            result.skipped++;
            return;
          }
          // replace: update description and reset ingredients
          await tx.mealIngredient.deleteMany({
            where: { mealId: existing.id },
          });
          await tx.meal.update({
            where: { id: existing.id },
            data: {
              description: data.description,
              imageUrl: data.imageUrl,
              difficulty: data.difficulty,
              prepTimeMinutes: data.prepTimeMinutes,
              cookTimeMinutes: data.cookTimeMinutes,
              servings: data.servings,
              sourceUrl: data.sourceUrl,
              notes: data.notes,
              favorite: data.favorite,
              rating: data.rating,
              ingredients: data.ingredients?.length
                ? { create: data.ingredients }
                : undefined,
            },
          });
          await syncMealTaxonomy(
            tx,
            familyId,
            existing.id,
            data.tags,
            data.categories,
          );
          result.updated++;
          return;
        }

        const created = await tx.meal.create({
          data: {
            name: data.name,
            description: data.description,
            imageUrl: data.imageUrl,
            difficulty: data.difficulty,
            prepTimeMinutes: data.prepTimeMinutes,
            cookTimeMinutes: data.cookTimeMinutes,
            servings: data.servings,
            sourceUrl: data.sourceUrl,
            notes: data.notes,
            favorite: data.favorite,
            rating: data.rating,
            familyId,
            ingredients: data.ingredients?.length
              ? { create: data.ingredients }
              : undefined,
          },
        });
        await syncMealTaxonomy(
          tx,
          familyId,
          created.id,
          data.tags,
          data.categories,
        );
        result.created++;
      });
    } catch (err) {
      result.errors.push({
        name: data.name,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}

/**
 * Return every real (non-placeholder) meal for a family with its ingredients,
 * ordered by name — the source data for a portable CSV export. Placeholder
 * meals (Free Day, Leftovers, …) are excluded: they are reserved rows the
 * import flow rejects, so they must never appear in an exported file.
 */
export async function exportMeals(familyId: string) {
  const meals = await prisma.meal.findMany({
    where: { familyId, placeholderKind: null },
    include: {
      ingredients: {
        select: { name: true, quantity: true, unit: true, category: true },
      },
      tags: { include: { tag: { select: { name: true } } } },
      categories: { include: { category: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return meals.map((meal) => ({
    name: meal.name,
    description: meal.description,
    imageUrl: meal.imageUrl,
    difficulty: meal.difficulty,
    prepTimeMinutes: meal.prepTimeMinutes,
    cookTimeMinutes: meal.cookTimeMinutes,
    servings: meal.servings,
    sourceUrl: meal.sourceUrl,
    notes: meal.notes,
    favorite: meal.favorite,
    rating: meal.rating,
    ingredients: meal.ingredients,
    tags: (meal.tags ?? []).map((mt) => mt.tag.name),
    categories: (meal.categories ?? []).map((mc) => mc.category.name),
  }));
}

export async function ensurePlaceholderMeals(familyId: string) {
  // Idempotently ensure each placeholder kind exists for this family.
  // Used for backfilling families that pre-date a new placeholder kind.
  const existing = await prisma.meal.findMany({
    where: { familyId, placeholderKind: { not: null } },
    select: { placeholderKind: true },
  });
  const existingKinds = new Set(existing.map((m) => m.placeholderKind));

  const toCreate = MEAL_PLACEHOLDER_KINDS.filter(
    (k) => !existingKinds.has(k),
  ).map((kind) => ({
    name: MEAL_PLACEHOLDERS[kind].name,
    description: MEAL_PLACEHOLDERS[kind].description,
    placeholderKind: kind,
    familyId,
  }));

  if (toCreate.length === 0) return;
  await prisma.meal.createMany({ data: toCreate, skipDuplicates: true });
}
