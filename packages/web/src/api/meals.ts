import type { Meal, MealIngredient } from '@meal-planner/shared';

const BASE = '/api/families';

export async function listMeals(familyId: string, search?: string): Promise<Meal[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetch(`${BASE}/${familyId}/meals${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch meals');
  return res.json();
}

export async function getMeal(familyId: string, mealId: string): Promise<Meal & { ingredients: MealIngredient[] }> {
  const res = await fetch(`${BASE}/${familyId}/meals/${mealId}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch meal');
  return res.json();
}

export async function createMeal(familyId: string, data: { name: string; description?: string; ingredients?: Omit<MealIngredient, 'id' | 'mealId'>[] }): Promise<Meal> {
  const res = await fetch(`${BASE}/${familyId}/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create meal');
  return res.json();
}

export async function updateMeal(familyId: string, mealId: string, data: { name: string; description?: string; ingredients?: Omit<MealIngredient, 'id' | 'mealId'>[] }): Promise<Meal> {
  const res = await fetch(`${BASE}/${familyId}/meals/${mealId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update meal');
  return res.json();
}

export async function deleteMeal(familyId: string, mealId: string): Promise<void> {
  const res = await fetch(`${BASE}/${familyId}/meals/${mealId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete meal');
}

export interface ImportMealsResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { name: string; error: string }[];
}

export async function importMeals(
  familyId: string,
  meals: { name: string; description?: string; ingredients?: Omit<MealIngredient, 'id' | 'mealId'>[] }[],
  mode: 'skip' | 'replace' = 'skip'
): Promise<ImportMealsResult> {
  const res = await fetch(`${BASE}/${familyId}/meals/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ meals, mode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to import meals');
  }
  return res.json();
}
