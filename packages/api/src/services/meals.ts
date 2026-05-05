import prisma from "../config/database.js";
import { FREE_DAY_MEAL_NAME, FREE_DAY_DESCRIPTION } from "@meal-planner/shared";
import type { Prisma } from "@prisma/client";

export async function listMeals(
  familyId: string,
  options?: { search?: string },
) {
  const where: Prisma.MealWhereInput = { familyId };
  if (options?.search) {
    where.name = { contains: options.search, mode: "insensitive" };
  }

  return prisma.meal.findMany({
    where,
    include: {
      _count: { select: { ingredients: true } },
    },
    orderBy: { name: "asc" },
  });
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
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.meal.findFirst({
          where: { familyId, name: data.name, isFreeDayPlaceholder: false },
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

export async function createFreeDayMeal(familyId: string) {
  const existing = await prisma.meal.findFirst({
    where: { familyId, isFreeDayPlaceholder: true },
  });
  if (existing) return existing;

  return prisma.meal.create({
    data: {
      name: FREE_DAY_MEAL_NAME,
      description: FREE_DAY_DESCRIPTION,
      isFreeDayPlaceholder: true,
      familyId,
    },
  });
}
