export enum Role {
  PARENT = "PARENT",
  CHILD = "CHILD",
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface Family {
  id: string;
  name: string;
}

export interface FamilyMember {
  id: string;
  role: Role;
  familyId: string;
  userId: string;
  user?: User;
}

export interface Meal {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  placeholderKind: import("../constants/index.js").MealPlaceholderKind | null;
  familyId: string;
  ingredients?: MealIngredient[];
}

export interface MealIngredient {
  id: string;
  name: string;
  quantity?: string;
  unit?: string;
  category?: string;
  mealId: string;
}

export interface WeekPlan {
  id: string;
  weekStart: string; // ISO date string (always a Monday)
  familyId: string;
  days?: DayPlan[];
}

export interface DayPlan {
  id: string;
  date: string; // ISO date string
  weekPlanId: string;
  suggestions?: MealSuggestion[];
}

export interface MealSuggestion {
  id: string;
  mealId: string;
  dayPlanId: string;
  userId: string;
  approved: boolean;
  meal?: Meal;
  suggestedBy?: User;
}

export interface GroceryList {
  id: string;
  weekStart: string;
  familyId: string;
  items?: GroceryItem[];
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity?: string;
  unit?: string;
  category?: string;
  checked: boolean;
  sources?: string[];
  groceryListId: string;
}

export interface ApiKey {
  id: string;
  name: string;
  familyId: string;
  createdBy: string;
  expiresAt?: string;
  lastUsed?: string;
  createdAt: string;
}

// API response types
export interface DisplayMealResponse {
  date: string;
  meals: Pick<Meal, "id" | "name" | "description" | "placeholderKind">[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  memberships: (FamilyMember & { family: Family })[];
}
