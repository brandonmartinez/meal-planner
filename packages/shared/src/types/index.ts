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
  timezone: string;
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
export type DisplayDayStatus = "planned" | "unplanned" | "skipped";

export interface DisplayMealEntry {
  id: string;
  name: string;
  description: string | null;
  placeholderKind:
    | import("../constants/index.js").MealPlaceholderKind
    | null;
  /** Emoji glyph for placeholder kinds; null for regular meals. */
  icon: string | null;
  imageUrl: string | null;
}

export interface DisplayDay {
  date: string; // YYYY-MM-DD in the resolved timezone
  dayOfWeek: import("../constants/index.js").DayOfWeek;
  status: DisplayDayStatus;
  meals: DisplayMealEntry[];
}

export interface DisplayFamily {
  id: string;
  name: string;
  timezone: string;
}

export interface DisplayMealsResponse {
  family: DisplayFamily;
  meals: DisplayDay[];
}

/** @deprecated Use DisplayDay instead. Kept for back-compat. */
export type DisplayMealResponse = DisplayDay;

export type DisplayErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_API_KEY"
  | "INVALID_DATE_RANGE"
  | "INVALID_TIMEZONE"
  | "INVALID_QUERY"
  | "INTERNAL_ERROR";

export interface DisplayErrorResponse {
  error: {
    code: DisplayErrorCode;
    message: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  memberships: (FamilyMember & { family: Family })[];
}
