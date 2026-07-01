import type {
  Meal,
  MealIngredient,
  MealListItemDTO,
  ImportMealsResultDTO,
  ExportMealsResponseDTO,
  Difficulty,
} from "@meal-planner/shared";
import { request } from "./client";

// Re-export the shared DTOs so components can import the meal-list and
// import-result types from this resource module. Single source of truth lives
// in `@meal-planner/shared`.
export type {
  MealListItemDTO,
  ImportMealsResultDTO,
  ExportMealsResponseDTO,
} from "@meal-planner/shared";

const BASE = "/api/families";

export async function listMeals(
  familyId: string,
  search?: string,
): Promise<MealListItemDTO[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<MealListItemDTO[]>(`${BASE}/${familyId}/meals${params}`);
}

export async function getMeal(
  familyId: string,
  mealId: string,
): Promise<Meal & { ingredients: MealIngredient[] }> {
  return request<Meal & { ingredients: MealIngredient[] }>(
    `${BASE}/${familyId}/meals/${mealId}`,
  );
}

export async function createMeal(
  familyId: string,
  data: {
    name: string;
    description?: string;
    difficulty?: Difficulty | null;
    ingredients?: Omit<MealIngredient, "id" | "mealId">[];
  },
): Promise<Meal> {
  return request<Meal>(`${BASE}/${familyId}/meals`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateMeal(
  familyId: string,
  mealId: string,
  data: {
    name: string;
    description?: string;
    difficulty?: Difficulty | null;
    ingredients?: Omit<MealIngredient, "id" | "mealId">[];
  },
): Promise<Meal> {
  return request<Meal>(`${BASE}/${familyId}/meals/${mealId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteMeal(
  familyId: string,
  mealId: string,
): Promise<void> {
  return request<void>(`${BASE}/${familyId}/meals/${mealId}`, {
    method: "DELETE",
  });
}

export async function importMeals(
  familyId: string,
  meals: {
    name: string;
    description?: string;
    difficulty?: Difficulty | null;
    ingredients?: Omit<MealIngredient, "id" | "mealId">[];
  }[],
  mode: "skip" | "replace" = "skip",
): Promise<ImportMealsResultDTO> {
  return request<ImportMealsResultDTO>(`${BASE}/${familyId}/meals/import`, {
    method: "POST",
    body: JSON.stringify({ meals, mode }),
  });
}

export async function exportMeals(
  familyId: string,
): Promise<ExportMealsResponseDTO> {
  return request<ExportMealsResponseDTO>(`${BASE}/${familyId}/meals/export`);
}
