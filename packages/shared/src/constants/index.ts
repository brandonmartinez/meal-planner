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
