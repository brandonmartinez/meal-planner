import type {
  Meal,
  MealIngredient,
  MealListResponseDTO,
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
  MealListResponseDTO,
  ImportMealsResultDTO,
  ExportMealsResponseDTO,
} from "@meal-planner/shared";

const BASE = "/api/families";

export async function listMeals(
  familyId: string,
  opts?: {
    search?: string;
    difficulty?: string[];
    sort?: string;
    order?: string;
    limit?: number;
    offset?: number;
  },
): Promise<MealListResponseDTO> {
  const params = new URLSearchParams();
  if (opts?.search) params.set("search", opts.search);
  if (opts?.difficulty?.length) {
    for (const d of opts.difficulty) params.append("difficulty", d);
  }
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.order) params.set("order", opts.order);
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return request<MealListResponseDTO>(
    `${BASE}/${familyId}/meals${qs ? `?${qs}` : ""}`,
  );
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
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
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
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
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
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
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
