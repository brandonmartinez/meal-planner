import type { WeekPlan, MealSuggestion } from "@meal-planner/shared";

const BASE = "/api/families";

export async function getWeekPlan(
  familyId: string,
  weekStart: string,
): Promise<WeekPlan> {
  const res = await fetch(`${BASE}/${familyId}/weeks/${weekStart}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch week plan");
  return res.json();
}

export async function createWeekPlan(
  familyId: string,
  weekStart: string,
): Promise<WeekPlan> {
  const res = await fetch(`${BASE}/${familyId}/weeks/${weekStart}`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to create week plan");
  return res.json();
}

export async function addSuggestion(
  familyId: string,
  dayPlanId: string,
  mealId: string,
): Promise<MealSuggestion> {
  const res = await fetch(`${BASE}/${familyId}/days/${dayPlanId}/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ mealId }),
  });
  if (!res.ok) throw new Error("Failed to add suggestion");
  return res.json();
}

export async function approveSuggestion(
  familyId: string,
  suggestionId: string,
): Promise<void> {
  const res = await fetch(
    `${BASE}/${familyId}/suggestions/${suggestionId}/approve`,
    {
      method: "PATCH",
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error("Failed to approve suggestion");
}

export async function removeSuggestion(
  familyId: string,
  suggestionId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/${familyId}/suggestions/${suggestionId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to remove suggestion");
}

export async function moveSuggestion(
  familyId: string,
  suggestionId: string,
  dayPlanId: string,
): Promise<MealSuggestion> {
  const res = await fetch(
    `${BASE}/${familyId}/suggestions/${suggestionId}/move`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ dayPlanId }),
    },
  );
  if (!res.ok) {
    let message = "Failed to move suggestion";
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}
