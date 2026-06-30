export const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const MEAL_PLACEHOLDER_KINDS = [
  "FREE_DAY",
  "LEFTOVERS",
  "TAKEOUT",
  "DINING_OUT",
  "TRAVEL",
  "SKIP",
] as const;

export type MealPlaceholderKind = (typeof MEAL_PLACEHOLDER_KINDS)[number];

export const MEAL_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

export type Difficulty = (typeof MEAL_DIFFICULTIES)[number];

export interface MealPlaceholderMetadata {
  name: string;
  description: string;
  emoji: string;
}

export const MEAL_PLACEHOLDERS: Record<
  MealPlaceholderKind,
  MealPlaceholderMetadata
> = {
  FREE_DAY: {
    name: "Free Day",
    description: "No cooking needed — eating out or away from home",
    emoji: "🏖️",
  },
  LEFTOVERS: {
    name: "Leftovers",
    description: "Reusing food from a previous day",
    emoji: "🥡",
  },
  TAKEOUT: {
    name: "Takeout / Delivery",
    description: "Ordering in — pizza, delivery, drive-thru",
    emoji: "🍕",
  },
  DINING_OUT: {
    name: "Dining Out",
    description: "Eating at a restaurant",
    emoji: "🍽️",
  },
  TRAVEL: {
    name: "Travel / Away",
    description: "Family is traveling — no meal planned",
    emoji: "✈️",
  },
  SKIP: {
    name: "Skip / No Meal",
    description: "No meal for this day",
    emoji: "⏭️",
  },
};

export const PLACEHOLDER_NAMES_LOWER = new Set<string>(
  MEAL_PLACEHOLDER_KINDS.map((k) => MEAL_PLACEHOLDERS[k].name.toLowerCase()),
);

/**
 * Per-operation scopes an MCP agent credential may be granted. The string
 * values are the wire contract — they MUST stay byte-for-byte identical to the
 * API service (`packages/api/src/services/agentCredential.ts`), since the
 * backend validates incoming `scopes[]` against exactly these values (an
 * unknown scope is a 400). Deliberately narrow and least-privilege: an agent
 * only ever holds the grants a parent explicitly hands it.
 */
export const AGENT_SCOPES = [
  "meal_plan:read",
  "meal_plan:schedule",
  "meal_plan:approve",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export interface AgentScopeMetadata {
  /** Short human label for parent-facing UI. */
  label: string;
  /** One-line description of what granting this scope lets the agent do. */
  description: string;
}

/**
 * Parent-facing copy for each agent scope. Used by the web Family Settings UI
 * to render scope checkboxes and badges. The `meal_plan:approve` scope is
 * privileged (PARENT-equivalent) — its description says so.
 */
export const AGENT_SCOPE_METADATA: Record<AgentScope, AgentScopeMetadata> = {
  "meal_plan:read": {
    label: "Read meal plans",
    description: "View week plans and meal suggestions for the family.",
  },
  "meal_plan:schedule": {
    label: "Schedule meals",
    description: "Add (schedule) meal suggestions onto day plans.",
  },
  "meal_plan:approve": {
    label: "Approve meals",
    description:
      "Approve meal suggestions — a privileged, parent-equivalent action.",
  },
};

export const INGREDIENT_CATEGORIES = [
  "produce",
  "dairy",
  "meat",
  "seafood",
  "bakery",
  "frozen",
  "pantry",
  "beverages",
  "snacks",
  "condiments",
  "other",
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];
