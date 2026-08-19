// API response DTOs (serialized wire contracts) live alongside the domain
// models and are re-exported from the package index.
export * from "./dto.js";

// Real-time (WebSocket) event contracts (issue #207).
export * from "./realtime.js";

// Tabular ("Grid") recipe view contracts (spec §3.3) — matrix semantics types
// and the deriveRecipeMatrix() I/O shapes.
export * from "./tabularRecipe.js";

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
  difficulty: import("../constants/index.js").Difficulty | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number | null;
  sourceUrl: string | null;
  notes: string | null;
  favorite: boolean;
  rating: number | null;
  familyId: string;
  ingredients?: MealIngredient[];
  tags?: Tag[];
  instructions?: MealInstruction[];
  collections?: RecipeCollection[];
  /** Configurable choice slots on this meal. Only present when the API includes
   *  them in the response (e.g. detail views). */
  slots?: MealSlot[];
}

export interface MealIngredient {
  id: string;
  name: string;
  quantity?: string;
  unit?: string;
  category?: string;
  mealId: string;
}

/** An ordered preparation step for a meal. Family-scoped through `Meal`,
 *  cascade-deleted with the meal. `position` is 0-based; steps are always
 *  returned ordered by `position` ascending. #100. */
export interface MealInstruction {
  id: string;
  mealId: string;
  position: number;
  text: string;
  timerMinutes?: number | null;
}

/** A family-scoped tag. `name` is the display value (original casing); the
 *  case-insensitive uniqueness key (`nameNormalized`) is a service-internal
 *  detail and is intentionally NOT part of the wire contract. */
export interface Tag {
  id: string;
  name: string;
  familyId: string;
}

/** A family-scoped custom grocery aisle category (issue #119). Same shape and
 *  per-family uniqueness rules as {@link Tag}, but it is an
 *  advisory pick-list layered over the shared `INGREDIENT_CATEGORIES` defaults —
 *  ingredient/grocery `category` values are stored as free-form strings and are
 *  NOT foreign keys to this record. The effective list a client offers is
 *  `INGREDIENT_CATEGORIES ∪ custom rows`. Only the category `name` is user-facing
 *  and round-trips through CSV as a plain string. */
export interface GroceryCategory {
  id: string;
  name: string;
  familyId: string;
}

/** A family-scoped managed pantry staple (issue #205) — a "stock kitchen" item
 *  (salt, spices, oil, ...) the family keeps on hand and does not want mixed into
 *  the active shopping list. Like {@link GroceryCategory} the `nameNormalized`
 *  uniqueness key is a service-internal detail and NOT part of the wire contract;
 *  only the display `name` round-trips. A grocery item whose normalized name
 *  matches a staple is auto-separated into a dedicated "Pantry Staples" section
 *  (see {@link GroceryItem.isPantryStaple}) rather than its aisle category. */
export interface PantryStaple {
  id: string;
  name: string;
  familyId: string;
}

/** A family-scoped, curated recipe collection (issue #109) — a named list a
 *  meal can belong to. Like {@link Tag} the `nameNormalized`
 *  uniqueness key is a service-internal detail and NOT part of the wire
 *  contract, but a collection additionally carries an optional display
 *  `description` (a curated list may have a blurb). Only the collection `name`
 *  round-trips through CSV; `description` is API-only. */
export interface RecipeCollection {
  id: string;
  name: string;
  familyId: string;
  description?: string | null;
}

/** A family-scoped, reusable week planning template (issue #116) — a named set
 *  of relative day→meal entries. Applying a template materializes UNAPPROVED
 *  {@link MealSuggestion} rows into a target week, respecting the same parent
 *  approval workflow as scheduling. Like {@link RecipeCollection} the
 *  `nameNormalized` uniqueness key is a service-internal detail and NOT part of
 *  the wire contract. Planning templates are a distinct resource and do NOT
 *  round-trip through CSV. */
export interface PlanningTemplate {
  id: string;
  name: string;
  familyId: string;
  description?: string | null;
  entries?: PlanningTemplateEntry[];
  createdAt?: string; // ISO datetime string
  updatedAt?: string; // ISO datetime string
}

/** A single entry within a {@link PlanningTemplate}: a meal placed on a relative
 *  day of the week. `dayOfWeek` is 0=Monday .. 6=Sunday — an offset from the
 *  target week's Monday, NOT a calendar date, so the template is reusable across
 *  any week. */
export interface PlanningTemplateEntry {
  id: string;
  templateId: string;
  dayOfWeek: number; // 0=Monday .. 6=Sunday
  mealId: string;
  meal?: Meal;
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
  /** Immutable slot choice snapshots recorded when options were selected.
   *  Only present when the API includes them in the response. */
  choices?: SuggestionChoiceSnapshot[];
}

/** A configurable choice point on a meal (e.g. "Protein", "Sauce"). All slots
 *  on a meal must be resolved before a suggestion can be approved (v1:
 *  single-choice, required). `position` is 0-based ordering within the meal. */
export interface MealSlot {
  id: string;
  mealId: string;
  name: string;
  position: number;
  options?: MealSlotOption[];
}

/** One selectable option within a {@link MealSlot}. Options contribute
 *  additive ingredients only in v1. `position` is 0-based ordering within
 *  the slot. */
export interface MealSlotOption {
  id: string;
  slotId: string;
  name: string;
  position: number;
  ingredients?: MealSlotOptionIngredient[];
}

/** An additive ingredient contributed by a {@link MealSlotOption}. Mirrors
 *  {@link MealIngredient} field shape; `position` is 0-based row order. */
export interface MealSlotOptionIngredient {
  id: string;
  optionId: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  category?: string | null;
  position: number;
}

/** Immutable snapshot of the option chosen for one slot when a
 *  {@link MealSuggestion} was scheduled. Display data (`slotName`,
 *  `optionName`) and additive ingredients are captured at choice time and
 *  never mutated so later recipe edits cannot rewrite history. `slotId` /
 *  `optionId` are optional source-traceability identifiers — they are NOT
 *  foreign keys and may reference deleted rows. */
export interface SuggestionChoiceSnapshot {
  id: string;
  suggestionId: string;
  slotId?: string | null;
  optionId?: string | null;
  slotName: string;
  optionName: string;
  createdAt: string;
  ingredients?: SuggestionChoiceIngredientSnapshot[];
}

/** Immutable snapshot of one additive ingredient within a
 *  {@link SuggestionChoiceSnapshot}. Mirrors {@link MealSlotOptionIngredient}
 *  field shape. */
export interface SuggestionChoiceIngredientSnapshot {
  id: string;
  choiceId: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  category?: string | null;
  position: number;
}

export interface GroceryList {
  id: string;
  weekStart: string;
  familyId: string;
  items?: GroceryItem[];
}

export enum GrocerySource {
  GENERATED = 'GENERATED',
  MANUAL = 'MANUAL',
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
  origin?: GrocerySource;
  edited?: boolean;
  sourceMealIds?: string[];
  /** Weekday offsets (0=Monday .. 6=Sunday) of the source meals' plan days. */
  sourceDays?: number[];
  /** True when this item's normalized name matches a family {@link PantryStaple}
   *  (issue #205). Such items are grouped into a distinct "Pantry Staples"
   *  section on the grocery list instead of their aisle category, and are never
   *  pruned. Derived/serialized at read time — not a persisted column. */
  isPantryStaple?: boolean;
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
