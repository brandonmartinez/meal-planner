import type {
  WeekPlan,
  MealSuggestion,
  RepeatWeekExistingMode,
} from "@meal-planner/shared";
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

export async function unapproveSuggestion(
  familyId: string,
  suggestionId: string,
): Promise<void> {
  return request<void>(
    `${BASE}/${familyId}/suggestions/${suggestionId}/unapprove`,
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

export async function repeatWeek(
  familyId: string,
  targetWeekStart: string,
  sourceWeekStart: string,
  existingMode?: RepeatWeekExistingMode,
): Promise<WeekPlan> {
  return request<WeekPlan>(
    `${BASE}/${familyId}/weeks/${targetWeekStart}/repeat`,
    {
      method: "POST",
      body: JSON.stringify({ sourceWeekStart, existingMode }),
    },
  );
}
