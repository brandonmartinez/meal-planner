import type { WeekPlan, MealSuggestion } from "@meal-planner/shared";
import { request } from "./client";

const BASE = "/api/families";

export async function getWeekPlan(
  familyId: string,
  weekStart: string,
): Promise<WeekPlan> {
  return request<WeekPlan>(`${BASE}/${familyId}/weeks/${weekStart}`);
}

export async function createWeekPlan(
  familyId: string,
  weekStart: string,
): Promise<WeekPlan> {
  return request<WeekPlan>(`${BASE}/${familyId}/weeks/${weekStart}`, {
    method: "POST",
  });
}

export async function addSuggestion(
  familyId: string,
  dayPlanId: string,
  mealId: string,
): Promise<MealSuggestion> {
  return request<MealSuggestion>(
    `${BASE}/${familyId}/days/${dayPlanId}/suggestions`,
    {
      method: "POST",
      body: JSON.stringify({ mealId }),
    },
  );
}

export async function approveSuggestion(
  familyId: string,
  suggestionId: string,
): Promise<void> {
  return request<void>(
    `${BASE}/${familyId}/suggestions/${suggestionId}/approve`,
    {
      method: "PATCH",
    },
  );
}

export async function removeSuggestion(
  familyId: string,
  suggestionId: string,
): Promise<void> {
  return request<void>(`${BASE}/${familyId}/suggestions/${suggestionId}`, {
    method: "DELETE",
  });
}

export async function moveSuggestion(
  familyId: string,
  suggestionId: string,
  dayPlanId: string,
): Promise<MealSuggestion> {
  return request<MealSuggestion>(
    `${BASE}/${familyId}/suggestions/${suggestionId}/move`,
    {
      method: "PATCH",
      body: JSON.stringify({ dayPlanId }),
    },
  );
}
