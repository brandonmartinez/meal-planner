import prisma from "../config/database.js";
import {
  MEAL_PLACEHOLDER_KINDS,
  MEAL_PLACEHOLDERS,
  PLACEHOLDER_NAMES_LOWER,
} from "@meal-planner/shared";
import type { Difficulty } from "@meal-planner/shared";
import type { Prisma } from "@prisma/client";
import { getCurrentWeekStart, getMondayOfWeek } from "./weekPlan.js";

/** Calendar-date label (YYYY-MM-DD) of a stored DayPlan/WeekPlan date. Week and
 *  day dates are persisted at UTC midnight, so the UTC slice IS the intended
 *  calendar day — this matches how the rest of the codebase labels those dates
 *  (see `weekPlan.toDateString`). */
function dateLabel(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function listMeals(
  familyId: string,
  options?: { search?: string },
) {
  const where: Prisma.MealWhereInput = { familyId };
  if (options?.search) {
    where.name = { contains: options.search, mode: "insensitive" };
  }

  const meals = await prisma.meal.findMany({
    where,
    include: {
      _count: { select: { ingredients: true } },
    },
    orderBy: { name: "asc" },
  });

  const recentByMeal = await getRecentlyScheduledMap(familyId);

  return meals.map((meal) => {
    const last = recentByMeal.get(meal.id);
    return {
      ...meal,
      recentlyScheduled: last !== undefined,
      lastScheduledOn: last ?? null,
    };
  });
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

export async function getMealById(mealId: string, familyId: string) {
  return prisma.meal.findFirst({
    where: { id: mealId, familyId },
    include: { ingredients: true },
  });
}

export async function createMeal(
  familyId: string,
  data: {
    name: string;
    description?: string;
    imageUrl?: string;
    difficulty?: Difficulty | null;
    ingredients?: {
      name: string;
      quantity?: string;
      unit?: string;
      category?: string;
    }[];
  },
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const meal = await tx.meal.create({
      data: {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        difficulty: data.difficulty,
        familyId,
        ingredients: data.ingredients?.length
          ? { create: data.ingredients }
          : undefined,
      },
      include: { ingredients: true },
    });
    return meal;
  });
}

export async function updateMeal(
  mealId: string,
  familyId: string,
  data: {
    name?: string;
    description?: string;
    imageUrl?: string;
    difficulty?: Difficulty | null;
    ingredients?: {
      name: string;
      quantity?: string;
      unit?: string;
      category?: string;
    }[];
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

    const meal = await tx.meal.update({
      where: { id: mealId },
      data: {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        difficulty: data.difficulty,
        ingredients:
          data.ingredients !== undefined
            ? { create: data.ingredients }
            : undefined,
      },
      include: { ingredients: true },
    });
    return meal;
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
    ingredients?: {
      name: string;
      quantity?: string;
      unit?: string;
      category?: string;
    }[];
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
              ingredients: data.ingredients?.length
                ? { create: data.ingredients }
                : undefined,
            },
          });
          result.updated++;
          return;
        }

        await tx.meal.create({
          data: {
            name: data.name,
            description: data.description,
            familyId,
            ingredients: data.ingredients?.length
              ? { create: data.ingredients }
              : undefined,
          },
        });
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
