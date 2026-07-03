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
    tags?: string[];
    categories?: string[];
    favorite?: boolean;
    minRating?: number;
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
  // Tags & categories filter by name, repeated once per value (#107). The
  // backend treats multiple values within a facet as OR, and combines facets
  // (tags AND categories AND difficulty AND search) with AND.
  if (opts?.tags?.length) {
    for (const t of opts.tags) params.append("tags", t);
  }
  if (opts?.categories?.length) {
    for (const c of opts.categories) params.append("categories", c);
  }
  if (opts?.favorite !== undefined) {
    params.set("favorite", String(opts.favorite));
  }
  if (opts?.minRating !== undefined) {
    params.set("minRating", String(opts.minRating));
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
    imageUrl?: string | null;
    difficulty?: Difficulty | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
    favorite?: boolean;
    rating?: number | null;
    ingredients?: Omit<MealIngredient, "id" | "mealId">[];
    tags?: string[];
    categories?: string[];
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
    imageUrl?: string | null;
    difficulty?: Difficulty | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
    favorite?: boolean;
    rating?: number | null;
    ingredients?: Omit<MealIngredient, "id" | "mealId">[];
    tags?: string[];
    categories?: string[];
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
    imageUrl?: string | null;
    difficulty?: Difficulty | null;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    sourceUrl?: string | null;
    notes?: string | null;
    favorite?: boolean;
    rating?: number | null;
    ingredients?: Omit<MealIngredient, "id" | "mealId">[];
    tags?: string[];
    categories?: string[];
    collections?: string[];
    instructions?: { text: string; timerMinutes?: number | null }[];
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
