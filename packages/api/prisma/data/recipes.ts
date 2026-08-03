/**
 * A curated, tabular-Grid-aware library used to seed the demo family. Each recipe
 * maps to a `Meal` (name, description, difficulty) plus its ordered
 * `MealIngredient`s AND ordered `MealInstruction`s.
 *
 * TABULAR ("Grid") VIEW — why this data looks the way it does
 * -----------------------------------------------------------
 * The Cooking-for-Engineers matrix reads ingredients DOWN the left and brackets
 * each PROCESS step across the contiguous ingredient rows it combines. A derived
 * step's span is the min..max of the ingredient rows its text names, so a recipe
 * only renders cleanly when its ingredients are in USE ORDER — the order a cook
 * reaches for them — not shopping order. Every derived recipe below is authored
 * in use order so that each step's named ingredients are contiguous (no
 * over-bracketing sweep). See `deriveRecipeMatrix` in `@meal-planner/shared`.
 *
 * Two knobs, kept honest:
 *   - MOST recipes are DERIVED: they carry `instructions` with plain `text` (+
 *     optional `timerMinutes`) and NO `spanFrom`/`spanTo`/`kind`. Their matrix is
 *     recomputed on every read. A `groupLabel` on an ingredient is independent of
 *     derivation and always renders a group pill (derivation never invents one
 *     from `category`, which is grocery-aisle vocabulary).
 *   - A few recipes are fully AUTHORED: every instruction carries an explicit
 *     `kind` and PROCESS steps carry inclusive 0-based `spanFrom`/`spanTo` indices
 *     into the position-sorted ingredient array (NOT ingredient ids). Presence of
 *     any non-null `spanFrom` flips the meal to authored, so the read path passes
 *     the layout through untouched. These show the format at its ceiling (cascade
 *     re-spans, parallel sub-recipes, group pills).
 *
 * Ingredient categories come from `INGREDIENT_CATEGORIES` in `@meal-planner/shared`.
 */
import type { Difficulty, IngredientCategory } from "@meal-planner/shared";

export interface SeedIngredient {
  name: string;
  quantity?: string;
  unit?: string;
  category: IngredientCategory;
  /**
   * Authored group-pill label (e.g. "Breading", "Rémoulade"). Independent of the
   * derived/authored provenance split — a group pill renders whenever this is set,
   * on derived and authored recipes alike. `null`/absent → ungrouped.
   */
  groupLabel?: string;
}

export interface SeedInstruction {
  text: string;
  /** Optional timer for the step, in minutes. */
  timerMinutes?: number;
  /**
   * Authored band classification. Omit on DERIVED recipes (the read path derives
   * it). Set on AUTHORED recipes, where derivation is bypassed and every field is
   * passed through as-is — so `kind` must be set on EVERY step of an authored
   * recipe (SETUP / PROCESS / FINISH).
   */
  kind?: "SETUP" | "PROCESS" | "FINISH";
  /** Authored sub-detail line (e.g. "350°F", "20 min"). Authored recipes only. */
  subLabel?: string;
  /** Authored process-column index (cascade ordering). Authored recipes only. */
  column?: number;
  /**
   * Authored inclusive 0-based START index into the position-sorted ingredient
   * array (a row index, NOT an ingredient id). PROCESS steps only; leave unset on
   * SETUP/FINISH. Setting this on ANY step marks the whole meal "authored".
   */
  spanFrom?: number;
  /** Authored inclusive 0-based END row index. Pairs with `spanFrom`. */
  spanTo?: number;
}

export interface SeedRecipe {
  name: string;
  description: string;
  difficulty: Difficulty;
  ingredients: SeedIngredient[];
  /** Ordered preparation steps. Position is assigned from array index by the seed. */
  instructions: SeedInstruction[];
}

export const DEMO_RECIPES: SeedRecipe[] = [
  /* ===================================================================== */
  /* DERIVED recipes — use-ordered so derived spans stay contiguous.       */
  /* ===================================================================== */

  {
    name: "Spaghetti Bolognese",
    description: "Slow-simmered beef and tomato ragù over spaghetti.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Olive oil", quantity: "2", unit: "tbsp", category: "pantry" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Garlic", quantity: "3", unit: "cloves", category: "produce" },
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat" },
      { name: "Crushed tomatoes", quantity: "28", unit: "oz", category: "pantry" },
      { name: "Spaghetti", quantity: "1", unit: "lb", category: "pantry" },
      { name: "Parmesan", quantity: "1/2", unit: "cup", category: "dairy" },
    ],
    instructions: [
      { text: "Bring a large pot of salted water to a boil." },
      { text: "Warm the olive oil in a pan and soften the onion and garlic." },
      { text: "Add the ground beef and brown it well." },
      { text: "Stir in the crushed tomatoes and simmer.", timerMinutes: 20 },
      {
        text: "Drain the spaghetti, toss with the sauce, and finish with parmesan.",
      },
      { text: "Serve immediately." },
    ],
  },

  {
    name: "Chocolate Chip Cookies",
    description: "Chewy cookies with a classic creamed-butter cascade.",
    difficulty: "EASY",
    ingredients: [
      { name: "Butter", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Brown sugar", quantity: "1", unit: "cup", category: "pantry" },
      { name: "Eggs", quantity: "2", category: "dairy" },
      { name: "Vanilla", quantity: "1", unit: "tsp", category: "condiments" },
      { name: "Flour", quantity: "2 1/4", unit: "cups", category: "pantry" },
      { name: "Baking soda", quantity: "1", unit: "tsp", category: "pantry" },
      { name: "Chocolate chips", quantity: "2", unit: "cups", category: "snacks" },
    ],
    instructions: [
      { text: "Preheat the oven to 375°F." },
      { text: "Cream the butter and brown sugar until fluffy." },
      { text: "Beat in the eggs and vanilla." },
      { text: "Mix in the flour and baking soda." },
      { text: "Fold in the chocolate chips." },
      { text: "Bake until the edges set.", timerMinutes: 11 },
    ],
  },

  {
    name: "Guacamole",
    description: "Bright, chunky avocado dip.",
    difficulty: "EASY",
    ingredients: [
      { name: "Avocado", quantity: "3", category: "produce" },
      { name: "Lime", quantity: "1", category: "produce" },
      { name: "Salt", quantity: "1/2", unit: "tsp", category: "pantry" },
      { name: "Cilantro", quantity: "1/4", unit: "cup", category: "produce" },
    ],
    instructions: [
      { text: "Mash the avocado in a bowl." },
      { text: "Stir in the lime juice and salt." },
      { text: "Fold in the chopped cilantro." },
      { text: "Serve right away." },
    ],
  },

  {
    name: "Grilled Cheese",
    description: "Golden, buttery, three-ingredient comfort.",
    difficulty: "EASY",
    ingredients: [
      { name: "Bread", quantity: "2", unit: "slices", category: "bakery" },
      { name: "Butter", quantity: "1", unit: "tbsp", category: "dairy" },
      { name: "Cheddar", quantity: "2", unit: "slices", category: "dairy" },
    ],
    instructions: [
      { text: "Spread the butter over one side of each slice of bread." },
      { text: "Layer the cheddar between the unbuttered sides." },
      { text: "Grill the sandwich until golden.", timerMinutes: 4 },
    ],
  },

  {
    name: "Miso-Glazed Salmon",
    description: "A quick roasted salmon with a savory-sweet glaze.",
    difficulty: "EASY",
    ingredients: [
      { name: "Salmon", quantity: "4", unit: "fillets", category: "seafood" },
      { name: "Miso paste", quantity: "3", unit: "tbsp", category: "condiments" },
      { name: "Soy sauce", quantity: "1", unit: "tbsp", category: "condiments" },
      { name: "Honey", quantity: "2", unit: "tbsp", category: "pantry" },
      { name: "Green onion", quantity: "2", category: "produce" },
    ],
    instructions: [
      { text: "Preheat the oven to 400°F." },
      { text: "Whisk the miso paste, soy sauce, and honey into a glaze." },
      { text: "Brush the glaze over the salmon and roast.", timerMinutes: 12 },
      { text: "Scatter the sliced green onion over the top." },
      { text: "Serve hot." },
    ],
  },

  {
    name: "Beef Tacos",
    description: "Seasoned beef with a lime crema — lime pulls double duty.",
    difficulty: "EASY",
    ingredients: [
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat" },
      { name: "Taco seasoning", quantity: "1", unit: "packet", category: "condiments" },
      { name: "Tortillas", quantity: "8", category: "bakery" },
      { name: "Cheddar", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Sour cream", quantity: "1/2", unit: "cup", category: "dairy" },
      { name: "Lime", quantity: "1", category: "produce" },
      { name: "Cilantro", quantity: "1/4", unit: "cup", category: "produce" },
    ],
    instructions: [
      { text: "Brown the ground beef and stir in the taco seasoning." },
      { text: "Warm the tortillas and layer in the cheddar." },
      { text: "Stir the sour cream with a squeeze of lime." },
      { text: "Spoon the filling into the tortillas." },
      { text: "Garnish with cilantro and another squeeze of lime." },
      { text: "Serve while warm." },
    ],
  },

  {
    name: "Vegetable Beef Chili",
    description: "A hearty, long-simmered chili — grouped by prep stage.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Olive oil", quantity: "2", unit: "tbsp", category: "pantry", groupLabel: "Aromatics" },
      { name: "Yellow onion", quantity: "1", category: "produce", groupLabel: "Aromatics" },
      { name: "Bell pepper", quantity: "1", category: "produce", groupLabel: "Aromatics" },
      { name: "Garlic", quantity: "3", unit: "cloves", category: "produce", groupLabel: "Aromatics" },
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat", groupLabel: "Protein & Spice" },
      { name: "Chili powder", quantity: "2", unit: "tbsp", category: "condiments", groupLabel: "Protein & Spice" },
      { name: "Cumin", quantity: "1", unit: "tbsp", category: "condiments", groupLabel: "Protein & Spice" },
      { name: "Diced tomatoes", quantity: "28", unit: "oz", category: "pantry", groupLabel: "Simmer" },
      { name: "Kidney beans", quantity: "15", unit: "oz", category: "pantry", groupLabel: "Simmer" },
      { name: "Beef broth", quantity: "2", unit: "cups", category: "pantry", groupLabel: "Simmer" },
      { name: "Cheddar", quantity: "1", unit: "cup", category: "dairy", groupLabel: "Garnish" },
    ],
    instructions: [
      { text: "Warm the olive oil in a large pot." },
      { text: "Sauté the onion and bell pepper until soft." },
      { text: "Stir in the garlic." },
      { text: "Add the ground beef and brown it." },
      { text: "Season with chili powder and cumin." },
      {
        text: "Pour in the diced tomatoes, kidney beans, and beef broth, then simmer.",
        timerMinutes: 30,
      },
      { text: "Top each bowl with cheddar and serve." },
    ],
  },

  {
    name: "Buttermilk Pancakes",
    description: "Fluffy stacks from a two-bowl batter.",
    difficulty: "EASY",
    ingredients: [
      { name: "Flour", quantity: "1 1/2", unit: "cups", category: "pantry" },
      { name: "Sugar", quantity: "2", unit: "tbsp", category: "pantry" },
      { name: "Baking powder", quantity: "2", unit: "tsp", category: "pantry" },
      { name: "Buttermilk", quantity: "1 1/4", unit: "cups", category: "dairy" },
      { name: "Eggs", quantity: "2", category: "dairy" },
      { name: "Butter", quantity: "3", unit: "tbsp", category: "dairy" },
    ],
    instructions: [
      { text: "Whisk the flour, sugar, and baking powder in a bowl." },
      { text: "In a second bowl, beat the buttermilk, eggs, and melted butter." },
      { text: "Combine into a batter and cook ladlefuls on a hot griddle.", timerMinutes: 3 },
      { text: "Serve warm." },
    ],
  },

  {
    name: "Sheet-Pan Chicken Fajitas",
    description: "Everything roasts on one pan; finish with warm tortillas.",
    difficulty: "EASY",
    ingredients: [
      { name: "Chicken breast", quantity: "1", unit: "lb", category: "meat" },
      { name: "Bell pepper", quantity: "2", category: "produce" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Olive oil", quantity: "2", unit: "tbsp", category: "pantry" },
      { name: "Fajita seasoning", quantity: "2", unit: "tbsp", category: "condiments" },
      { name: "Tortillas", quantity: "8", category: "bakery" },
      { name: "Lime", quantity: "1", category: "produce" },
    ],
    instructions: [
      { text: "Preheat the oven to 425°F." },
      {
        text: "Toss the chicken, bell pepper, onion, olive oil, and fajita seasoning on a sheet pan, then roast.",
        timerMinutes: 20,
      },
      { text: "Warm the tortillas and squeeze lime over the filling." },
      { text: "Serve family-style." },
    ],
  },

  {
    name: "Greek Salad",
    description: "A crisp, no-cook salad tossed in a simple vinaigrette.",
    difficulty: "EASY",
    ingredients: [
      { name: "Cucumber", quantity: "1", category: "produce" },
      { name: "Tomato", quantity: "3", category: "produce" },
      { name: "Red onion", quantity: "1/2", category: "produce" },
      { name: "Feta", quantity: "4", unit: "oz", category: "dairy" },
      { name: "Kalamata olives", quantity: "1/2", unit: "cup", category: "condiments" },
      { name: "Olive oil", quantity: "3", unit: "tbsp", category: "pantry" },
      { name: "Oregano", quantity: "1", unit: "tsp", category: "condiments" },
    ],
    instructions: [
      { text: "Chop the cucumber, tomato, and red onion into a bowl." },
      { text: "Add the feta and kalamata olives." },
      { text: "Dress with olive oil and oregano, then toss." },
      { text: "Serve chilled." },
    ],
  },

  {
    name: "Teriyaki Chicken Bowl",
    description: "Glazed chicken over rice — grouped by component.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Rice", quantity: "2", unit: "cups", category: "pantry", groupLabel: "Base" },
      { name: "Chicken thighs", quantity: "1", unit: "lb", category: "meat", groupLabel: "Chicken" },
      { name: "Soy sauce", quantity: "1/4", unit: "cup", category: "condiments", groupLabel: "Teriyaki Glaze" },
      { name: "Honey", quantity: "3", unit: "tbsp", category: "pantry", groupLabel: "Teriyaki Glaze" },
      { name: "Ginger", quantity: "1", unit: "tbsp", category: "produce", groupLabel: "Teriyaki Glaze" },
      { name: "Broccoli", quantity: "2", unit: "cups", category: "produce", groupLabel: "Vegetables" },
      { name: "Sesame seeds", quantity: "1", unit: "tbsp", category: "pantry", groupLabel: "Garnish" },
    ],
    instructions: [
      { text: "Steam the rice." },
      { text: "Sear the chicken thighs until browned." },
      { text: "Whisk the soy sauce, honey, and ginger, then glaze the chicken.", timerMinutes: 5 },
      { text: "Steam the broccoli until tender." },
      { text: "Sprinkle with sesame seeds and serve." },
    ],
  },

  /* ===================================================================== */
  /* AUTHORED recipes — explicit kind + inclusive 0-based spanFrom/spanTo   */
  /* (row indices into the position-sorted ingredient array) + group pills. */
  /* These bypass derivation and render the layout exactly as written.      */
  /* ===================================================================== */

  {
    name: "Fried Shrimp with Rémoulade",
    description:
      "AUTHORED showcase: a breading cascade over the shrimp beside a parallel rémoulade.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Shrimp", quantity: "1", unit: "lb", category: "seafood", groupLabel: "Shrimp" },
      { name: "Flour", quantity: "1", unit: "cup", category: "pantry", groupLabel: "Breading" },
      { name: "Eggs", quantity: "2", category: "dairy", groupLabel: "Breading" },
      { name: "Breadcrumbs", quantity: "1", unit: "cup", category: "pantry", groupLabel: "Breading" },
      { name: "Mayonnaise", quantity: "1/2", unit: "cup", category: "condiments", groupLabel: "Rémoulade" },
      { name: "Dijon mustard", quantity: "1", unit: "tbsp", category: "condiments", groupLabel: "Rémoulade" },
      { name: "Pickles", quantity: "2", unit: "tbsp", category: "condiments", groupLabel: "Rémoulade" },
      { name: "Hot sauce", quantity: "1", unit: "tsp", category: "condiments", groupLabel: "Rémoulade" },
    ],
    instructions: [
      { kind: "SETUP", text: "Heat 2 inches of oil in a heavy pot.", subLabel: "350°F" },
      { kind: "PROCESS", text: "Dredge the shrimp in flour.", column: 0, spanFrom: 0, spanTo: 1 },
      { kind: "PROCESS", text: "Dip the floured shrimp in beaten egg.", column: 1, spanFrom: 0, spanTo: 2 },
      { kind: "PROCESS", text: "Coat in breadcrumbs.", column: 2, spanFrom: 0, spanTo: 3 },
      { kind: "PROCESS", text: "Fry until golden.", column: 3, spanFrom: 0, spanTo: 3, subLabel: "3 min" },
      { kind: "PROCESS", text: "Whisk the mayonnaise, Dijon, pickles, and hot sauce.", column: 0, spanFrom: 4, spanTo: 7 },
      { kind: "FINISH", text: "Serve the shrimp with the rémoulade for dipping." },
    ],
  },

  {
    name: "Baked Lasagna",
    description:
      "AUTHORED showcase: two parallel sub-recipes (meat sauce, cheese filling) cascade into one assembly.",
    difficulty: "HARD",
    ingredients: [
      { name: "Olive oil", quantity: "2", unit: "tbsp", category: "pantry", groupLabel: "Meat Sauce" },
      { name: "Onion", quantity: "1", category: "produce", groupLabel: "Meat Sauce" },
      { name: "Garlic", quantity: "3", unit: "cloves", category: "produce", groupLabel: "Meat Sauce" },
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat", groupLabel: "Meat Sauce" },
      { name: "Marinara", quantity: "24", unit: "oz", category: "pantry", groupLabel: "Meat Sauce" },
      { name: "Ricotta", quantity: "15", unit: "oz", category: "dairy", groupLabel: "Cheese Filling" },
      { name: "Egg", quantity: "1", category: "dairy", groupLabel: "Cheese Filling" },
      { name: "Parmesan", quantity: "1/2", unit: "cup", category: "dairy", groupLabel: "Cheese Filling" },
      { name: "Lasagna noodles", quantity: "12", category: "pantry", groupLabel: "Assembly" },
      { name: "Mozzarella", quantity: "2", unit: "cups", category: "dairy", groupLabel: "Assembly" },
    ],
    instructions: [
      { kind: "SETUP", text: "Preheat the oven.", subLabel: "375°F" },
      { kind: "PROCESS", text: "Sauté the onion and garlic in the olive oil.", column: 0, spanFrom: 0, spanTo: 2 },
      { kind: "PROCESS", text: "Brown the beef, stir in the marinara, and simmer.", column: 1, spanFrom: 0, spanTo: 4, subLabel: "20 min" },
      { kind: "PROCESS", text: "Blend the ricotta, egg, and parmesan.", column: 0, spanFrom: 5, spanTo: 7 },
      { kind: "PROCESS", text: "Layer noodles, meat sauce, cheese filling, and mozzarella.", column: 2, spanFrom: 0, spanTo: 9 },
      { kind: "PROCESS", text: "Bake covered, then uncovered until bubbly.", column: 3, spanFrom: 0, spanTo: 9, subLabel: "45 min" },
      { kind: "FINISH", text: "Let rest before slicing." },
    ],
  },

  {
    name: "Caprese Salad",
    description:
      "AUTHORED showcase: a small plate — a stack cascade beside a two-item dressing.",
    difficulty: "EASY",
    ingredients: [
      { name: "Tomatoes", quantity: "3", category: "produce", groupLabel: "Stack" },
      { name: "Fresh mozzarella", quantity: "8", unit: "oz", category: "dairy", groupLabel: "Stack" },
      { name: "Fresh basil", quantity: "1", unit: "handful", category: "produce", groupLabel: "Stack" },
      { name: "Olive oil", quantity: "2", unit: "tbsp", category: "pantry", groupLabel: "Dressing" },
      { name: "Balsamic", quantity: "1", unit: "tbsp", category: "condiments", groupLabel: "Dressing" },
    ],
    instructions: [
      { kind: "PROCESS", text: "Slice the tomatoes and mozzarella.", column: 0, spanFrom: 0, spanTo: 1 },
      { kind: "PROCESS", text: "Stack with basil leaves.", column: 1, spanFrom: 0, spanTo: 2 },
      { kind: "PROCESS", text: "Whisk the olive oil and balsamic.", column: 0, spanFrom: 3, spanTo: 4 },
      { kind: "FINISH", text: "Drizzle over the stacks and serve." },
    ],
  },
];
