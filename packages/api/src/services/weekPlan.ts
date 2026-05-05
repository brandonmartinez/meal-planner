import prisma from "../config/database.js";
import { DAYS_OF_WEEK } from "@meal-planner/shared";

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

  const weekStartStr = toDateString(d);

  const existing = await prisma.weekPlan.findFirst({
    where: { familyId, weekStart: d },
    include: {
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
    },
  });

  if (existing) return existing;

  const days = DAYS_OF_WEEK.map((_, i) => {
    const dayDate = new Date(d);
    dayDate.setUTCDate(dayDate.getUTCDate() + i);
    return { date: dayDate };
  });

  return prisma.weekPlan.create({
    data: {
      weekStart: d,
      familyId,
      days: { create: days },
    },
    include: {
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
    },
  });
}

export async function getWeekPlan(familyId: string, weekStart: Date) {
  const d = new Date(weekStart);
  d.setUTCHours(0, 0, 0, 0);

  return prisma.weekPlan.findFirst({
    where: { familyId, weekStart: d },
    include: {
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
    },
  });
}

export async function addSuggestion(
  dayPlanId: string,
  mealId: string,
  userId: string,
) {
  return prisma.mealSuggestion.create({
    data: {
      dayPlanId,
      mealId,
      userId,
      approved: false,
    },
    include: {
      meal: true,
      suggestedBy: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  });
}

export async function approveSuggestion(suggestionId: string) {
  return prisma.mealSuggestion.update({
    where: { id: suggestionId },
    data: { approved: true },
    include: {
      meal: true,
      suggestedBy: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
  });
}

export async function removeSuggestion(suggestionId: string) {
  return prisma.mealSuggestion.delete({
    where: { id: suggestionId },
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
      isFreeDayPlaceholder: s.meal.isFreeDayPlaceholder,
    })),
  }));
}
