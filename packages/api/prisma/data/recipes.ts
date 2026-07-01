/**
 * A rich library of ~50 common recipes used to seed the demo family. Each maps
 * to a `Meal` (name, description, difficulty) plus its `MealIngredient`s.
 * Ingredient categories come from `INGREDIENT_CATEGORIES` in
 * `@meal-planner/shared`.
 */
import type { Difficulty, IngredientCategory } from "@meal-planner/shared";

export interface SeedIngredient {
  name: string;
  quantity?: string;
  unit?: string;
  category: IngredientCategory;
}

export interface SeedRecipe {
  name: string;
  description: string;
  difficulty: Difficulty;
  ingredients: SeedIngredient[];
}

export const DEMO_RECIPES: SeedRecipe[] = [
  {
    name: "Spaghetti Bolognese",
    description: "Slow-simmered beef and tomato ragù over spaghetti.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Spaghetti", quantity: "1", unit: "lb", category: "pantry" },
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat" },
      { name: "Crushed tomatoes", quantity: "28", unit: "oz", category: "pantry" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Garlic", quantity: "3", unit: "cloves", category: "produce" },
      { name: "Parmesan", quantity: "1/2", unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Chicken Alfredo",
    description: "Creamy parmesan sauce with seared chicken over fettuccine.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Fettuccine", quantity: "1", unit: "lb", category: "pantry" },
      { name: "Chicken breast", quantity: "1", unit: "lb", category: "meat" },
      { name: "Heavy cream", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Butter", quantity: "4", unit: "tbsp", category: "dairy" },
      { name: "Parmesan", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Garlic", quantity: "2", unit: "cloves", category: "produce" },
    ],
  },
  {
    name: "Beef Tacos",
    description: "Seasoned ground beef in warm tortillas with fresh toppings.",
    difficulty: "EASY",
    ingredients: [
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat" },
      { name: "Taco seasoning", quantity: "1", unit: "packet", category: "condiments" },
      { name: "Tortillas", quantity: "8", category: "bakery" },
      { name: "Cheddar", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Lettuce", quantity: "1", unit: "head", category: "produce" },
      { name: "Tomato", quantity: "2", category: "produce" },
    ],
  },
  {
    name: "Margherita Pizza",
    description: "Classic pizza with tomato, fresh mozzarella, and basil.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Pizza dough", quantity: "1", unit: "ball", category: "bakery" },
      { name: "Tomato sauce", quantity: "1", unit: "cup", category: "pantry" },
      { name: "Fresh mozzarella", quantity: "8", unit: "oz", category: "dairy" },
      { name: "Fresh basil", quantity: "1", unit: "handful", category: "produce" },
      { name: "Olive oil", quantity: "2", unit: "tbsp", category: "pantry" },
    ],
  },
  {
    name: "Caesar Salad",
    description: "Crisp romaine, croutons, and parmesan in a creamy dressing.",
    difficulty: "EASY",
    ingredients: [
      { name: "Romaine lettuce", quantity: "2", unit: "heads", category: "produce" },
      { name: "Caesar dressing", quantity: "1/2", unit: "cup", category: "condiments" },
      { name: "Croutons", quantity: "1", unit: "cup", category: "bakery" },
      { name: "Parmesan", quantity: "1/2", unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Grilled Cheese & Tomato Soup",
    description: "Golden grilled cheese with a bowl of tomato soup.",
    difficulty: "EASY",
    ingredients: [
      { name: "Bread", quantity: "4", unit: "slices", category: "bakery" },
      { name: "Cheddar", quantity: "4", unit: "slices", category: "dairy" },
      { name: "Butter", quantity: "2", unit: "tbsp", category: "dairy" },
      { name: "Tomato soup", quantity: "1", unit: "can", category: "pantry" },
    ],
  },
  {
    name: "Vegetable Stir-Fry",
    description: "Crisp-tender vegetables tossed in a savory soy-ginger sauce.",
    difficulty: "EASY",
    ingredients: [
      { name: "Broccoli", quantity: "1", unit: "head", category: "produce" },
      { name: "Bell pepper", quantity: "2", category: "produce" },
      { name: "Carrot", quantity: "2", category: "produce" },
      { name: "Soy sauce", quantity: "1/4", unit: "cup", category: "condiments" },
      { name: "Ginger", quantity: "1", unit: "tbsp", category: "produce" },
      { name: "Rice", quantity: "2", unit: "cups", category: "pantry" },
    ],
  },
  {
    name: "Chicken Fajitas",
    description: "Sizzling chicken with peppers and onions in tortillas.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Chicken breast", quantity: "1", unit: "lb", category: "meat" },
      { name: "Bell pepper", quantity: "2", category: "produce" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Fajita seasoning", quantity: "1", unit: "packet", category: "condiments" },
      { name: "Tortillas", quantity: "8", category: "bakery" },
    ],
  },
  {
    name: "Beef Chili",
    description: "Hearty beef and bean chili simmered with warm spices.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat" },
      { name: "Kidney beans", quantity: "2", unit: "cans", category: "pantry" },
      { name: "Diced tomatoes", quantity: "28", unit: "oz", category: "pantry" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Chili powder", quantity: "2", unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Pancakes",
    description: "Fluffy buttermilk pancakes with maple syrup.",
    difficulty: "EASY",
    ingredients: [
      { name: "Flour", quantity: "2", unit: "cups", category: "pantry" },
      { name: "Eggs", quantity: "2", category: "dairy" },
      { name: "Milk", quantity: "1.5", unit: "cups", category: "dairy" },
      { name: "Maple syrup", quantity: "1/2", unit: "cup", category: "condiments" },
      { name: "Butter", quantity: "2", unit: "tbsp", category: "dairy" },
    ],
  },
  {
    name: "Scrambled Eggs & Toast",
    description: "Soft scrambled eggs with buttered toast.",
    difficulty: "EASY",
    ingredients: [
      { name: "Eggs", quantity: "6", category: "dairy" },
      { name: "Butter", quantity: "2", unit: "tbsp", category: "dairy" },
      { name: "Bread", quantity: "4", unit: "slices", category: "bakery" },
      { name: "Milk", quantity: "1/4", unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Baked Salmon with Asparagus",
    description: "Lemon-herb salmon roasted with fresh asparagus.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Salmon fillets", quantity: "4", category: "seafood" },
      { name: "Asparagus", quantity: "1", unit: "bunch", category: "produce" },
      { name: "Lemon", quantity: "1", category: "produce" },
      { name: "Olive oil", quantity: "2", unit: "tbsp", category: "pantry" },
      { name: "Garlic", quantity: "2", unit: "cloves", category: "produce" },
    ],
  },
  {
    name: "Shrimp Scampi",
    description: "Garlic-butter shrimp with white wine over linguine.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Shrimp", quantity: "1", unit: "lb", category: "seafood" },
      { name: "Linguine", quantity: "1", unit: "lb", category: "pantry" },
      { name: "Butter", quantity: "4", unit: "tbsp", category: "dairy" },
      { name: "Garlic", quantity: "4", unit: "cloves", category: "produce" },
      { name: "White wine", quantity: "1/2", unit: "cup", category: "beverages" },
      { name: "Parsley", quantity: "1/4", unit: "cup", category: "produce" },
    ],
  },
  {
    name: "Pad Thai",
    description: "Stir-fried rice noodles with egg, peanuts, and tamarind.",
    difficulty: "HARD",
    ingredients: [
      { name: "Rice noodles", quantity: "8", unit: "oz", category: "pantry" },
      { name: "Shrimp", quantity: "1/2", unit: "lb", category: "seafood" },
      { name: "Eggs", quantity: "2", category: "dairy" },
      { name: "Bean sprouts", quantity: "1", unit: "cup", category: "produce" },
      { name: "Peanuts", quantity: "1/2", unit: "cup", category: "snacks" },
      { name: "Tamarind paste", quantity: "2", unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Chicken Curry",
    description: "Tender chicken simmered in a spiced coconut curry sauce.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Chicken thighs", quantity: "1.5", unit: "lb", category: "meat" },
      { name: "Coconut milk", quantity: "1", unit: "can", category: "pantry" },
      { name: "Curry powder", quantity: "2", unit: "tbsp", category: "condiments" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Rice", quantity: "2", unit: "cups", category: "pantry" },
    ],
  },
  {
    name: "Vegetable Lasagna",
    description: "Layered pasta with roasted vegetables and ricotta.",
    difficulty: "HARD",
    ingredients: [
      { name: "Lasagna noodles", quantity: "1", unit: "box", category: "pantry" },
      { name: "Ricotta", quantity: "15", unit: "oz", category: "dairy" },
      { name: "Zucchini", quantity: "2", category: "produce" },
      { name: "Spinach", quantity: "2", unit: "cups", category: "produce" },
      { name: "Marinara sauce", quantity: "24", unit: "oz", category: "pantry" },
      { name: "Mozzarella", quantity: "2", unit: "cups", category: "dairy" },
    ],
  },
  {
    name: "BBQ Pulled Pork Sandwiches",
    description: "Slow-cooked pork shoulder in barbecue sauce on brioche buns.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Pork shoulder", quantity: "3", unit: "lb", category: "meat" },
      { name: "BBQ sauce", quantity: "1", unit: "cup", category: "condiments" },
      { name: "Brioche buns", quantity: "6", category: "bakery" },
      { name: "Coleslaw mix", quantity: "1", unit: "bag", category: "produce" },
    ],
  },
  {
    name: "Turkey Meatballs",
    description: "Baked turkey meatballs in marinara over pasta.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Ground turkey", quantity: "1", unit: "lb", category: "meat" },
      { name: "Breadcrumbs", quantity: "1/2", unit: "cup", category: "pantry" },
      { name: "Egg", quantity: "1", category: "dairy" },
      { name: "Marinara sauce", quantity: "24", unit: "oz", category: "pantry" },
      { name: "Spaghetti", quantity: "1", unit: "lb", category: "pantry" },
    ],
  },
  {
    name: "Greek Salad",
    description: "Cucumber, tomato, olives, and feta with oregano vinaigrette.",
    difficulty: "EASY",
    ingredients: [
      { name: "Cucumber", quantity: "1", category: "produce" },
      { name: "Tomato", quantity: "3", category: "produce" },
      { name: "Red onion", quantity: "1/2", category: "produce" },
      { name: "Kalamata olives", quantity: "1/2", unit: "cup", category: "pantry" },
      { name: "Feta", quantity: "4", unit: "oz", category: "dairy" },
    ],
  },
  {
    name: "Minestrone Soup",
    description: "Vegetable and bean soup with small pasta.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Cannellini beans", quantity: "1", unit: "can", category: "pantry" },
      { name: "Diced tomatoes", quantity: "14", unit: "oz", category: "pantry" },
      { name: "Carrot", quantity: "2", category: "produce" },
      { name: "Celery", quantity: "2", unit: "stalks", category: "produce" },
      { name: "Ditalini pasta", quantity: "1", unit: "cup", category: "pantry" },
      { name: "Vegetable broth", quantity: "6", unit: "cups", category: "pantry" },
    ],
  },
  {
    name: "Beef Stew",
    description: "Braised beef with potatoes, carrots, and rich gravy.",
    difficulty: "HARD",
    ingredients: [
      { name: "Beef chuck", quantity: "2", unit: "lb", category: "meat" },
      { name: "Potato", quantity: "4", category: "produce" },
      { name: "Carrot", quantity: "4", category: "produce" },
      { name: "Beef broth", quantity: "4", unit: "cups", category: "pantry" },
      { name: "Tomato paste", quantity: "2", unit: "tbsp", category: "pantry" },
    ],
  },
  {
    name: "Roast Chicken",
    description: "Whole roasted chicken with herbs and lemon.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Whole chicken", quantity: "1", category: "meat" },
      { name: "Lemon", quantity: "1", category: "produce" },
      { name: "Rosemary", quantity: "2", unit: "sprigs", category: "produce" },
      { name: "Butter", quantity: "3", unit: "tbsp", category: "dairy" },
      { name: "Garlic", quantity: "1", unit: "head", category: "produce" },
    ],
  },
  {
    name: "Mac and Cheese",
    description: "Creamy baked macaroni with a three-cheese blend.",
    difficulty: "EASY",
    ingredients: [
      { name: "Elbow macaroni", quantity: "1", unit: "lb", category: "pantry" },
      { name: "Cheddar", quantity: "2", unit: "cups", category: "dairy" },
      { name: "Milk", quantity: "2", unit: "cups", category: "dairy" },
      { name: "Butter", quantity: "3", unit: "tbsp", category: "dairy" },
      { name: "Flour", quantity: "3", unit: "tbsp", category: "pantry" },
    ],
  },
  {
    name: "Fish and Chips",
    description: "Beer-battered cod with crispy fries.",
    difficulty: "HARD",
    ingredients: [
      { name: "Cod fillets", quantity: "4", category: "seafood" },
      { name: "Potato", quantity: "4", category: "produce" },
      { name: "Flour", quantity: "1.5", unit: "cups", category: "pantry" },
      { name: "Beer", quantity: "1", unit: "cup", category: "beverages" },
      { name: "Vegetable oil", quantity: "4", unit: "cups", category: "pantry" },
    ],
  },
  {
    name: "Veggie Burritos",
    description: "Rice, beans, and cheese wrapped in a flour tortilla.",
    difficulty: "EASY",
    ingredients: [
      { name: "Flour tortillas", quantity: "6", category: "bakery" },
      { name: "Black beans", quantity: "2", unit: "cans", category: "pantry" },
      { name: "Rice", quantity: "2", unit: "cups", category: "pantry" },
      { name: "Cheddar", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Salsa", quantity: "1", unit: "cup", category: "condiments" },
    ],
  },
  {
    name: "Teriyaki Chicken Bowl",
    description: "Glazed teriyaki chicken over rice with steamed vegetables.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Chicken thighs", quantity: "1.5", unit: "lb", category: "meat" },
      { name: "Teriyaki sauce", quantity: "1/2", unit: "cup", category: "condiments" },
      { name: "Rice", quantity: "2", unit: "cups", category: "pantry" },
      { name: "Broccoli", quantity: "1", unit: "head", category: "produce" },
      { name: "Sesame seeds", quantity: "1", unit: "tbsp", category: "pantry" },
    ],
  },
  {
    name: "Eggplant Parmesan",
    description: "Breaded eggplant baked with marinara and mozzarella.",
    difficulty: "HARD",
    ingredients: [
      { name: "Eggplant", quantity: "2", category: "produce" },
      { name: "Breadcrumbs", quantity: "1.5", unit: "cups", category: "pantry" },
      { name: "Marinara sauce", quantity: "24", unit: "oz", category: "pantry" },
      { name: "Mozzarella", quantity: "2", unit: "cups", category: "dairy" },
      { name: "Eggs", quantity: "2", category: "dairy" },
    ],
  },
  {
    name: "Tuna Melt",
    description: "Tuna salad and melted cheddar on toasted sourdough.",
    difficulty: "EASY",
    ingredients: [
      { name: "Canned tuna", quantity: "2", unit: "cans", category: "pantry" },
      { name: "Mayonnaise", quantity: "1/4", unit: "cup", category: "condiments" },
      { name: "Sourdough bread", quantity: "4", unit: "slices", category: "bakery" },
      { name: "Cheddar", quantity: "4", unit: "slices", category: "dairy" },
    ],
  },
  {
    name: "Chicken Noodle Soup",
    description: "Comforting chicken soup with egg noodles and vegetables.",
    difficulty: "EASY",
    ingredients: [
      { name: "Chicken breast", quantity: "1", unit: "lb", category: "meat" },
      { name: "Egg noodles", quantity: "3", unit: "cups", category: "pantry" },
      { name: "Carrot", quantity: "3", category: "produce" },
      { name: "Celery", quantity: "3", unit: "stalks", category: "produce" },
      { name: "Chicken broth", quantity: "8", unit: "cups", category: "pantry" },
    ],
  },
  {
    name: "Pork Fried Rice",
    description: "Wok-fried rice with pork, egg, and vegetables.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Cooked rice", quantity: "4", unit: "cups", category: "pantry" },
      { name: "Pork loin", quantity: "1/2", unit: "lb", category: "meat" },
      { name: "Eggs", quantity: "2", category: "dairy" },
      { name: "Peas and carrots", quantity: "1", unit: "cup", category: "frozen" },
      { name: "Soy sauce", quantity: "3", unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Stuffed Bell Peppers",
    description: "Peppers filled with seasoned beef, rice, and cheese.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Bell pepper", quantity: "4", category: "produce" },
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat" },
      { name: "Rice", quantity: "1", unit: "cup", category: "pantry" },
      { name: "Diced tomatoes", quantity: "14", unit: "oz", category: "pantry" },
      { name: "Cheddar", quantity: "1", unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Sloppy Joes",
    description: "Saucy ground beef on soft hamburger buns.",
    difficulty: "EASY",
    ingredients: [
      { name: "Ground beef", quantity: "1", unit: "lb", category: "meat" },
      { name: "Hamburger buns", quantity: "6", category: "bakery" },
      { name: "Tomato sauce", quantity: "1", unit: "cup", category: "pantry" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Worcestershire sauce", quantity: "1", unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Butternut Squash Soup",
    description: "Velvety roasted butternut squash soup with a hint of nutmeg.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Butternut squash", quantity: "1", category: "produce" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Vegetable broth", quantity: "4", unit: "cups", category: "pantry" },
      { name: "Heavy cream", quantity: "1/2", unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Shepherd's Pie",
    description: "Ground lamb and vegetables topped with mashed potatoes.",
    difficulty: "HARD",
    ingredients: [
      { name: "Ground lamb", quantity: "1.5", unit: "lb", category: "meat" },
      { name: "Potato", quantity: "5", category: "produce" },
      { name: "Peas and carrots", quantity: "2", unit: "cups", category: "frozen" },
      { name: "Beef broth", quantity: "1", unit: "cup", category: "pantry" },
      { name: "Butter", quantity: "4", unit: "tbsp", category: "dairy" },
    ],
  },
  {
    name: "Quesadillas",
    description: "Crispy tortillas filled with melted cheese and chicken.",
    difficulty: "EASY",
    ingredients: [
      { name: "Flour tortillas", quantity: "4", category: "bakery" },
      { name: "Cheddar", quantity: "2", unit: "cups", category: "dairy" },
      { name: "Cooked chicken", quantity: "1", unit: "cup", category: "meat" },
      { name: "Salsa", quantity: "1/2", unit: "cup", category: "condiments" },
    ],
  },
  {
    name: "Caprese Chicken",
    description: "Seared chicken topped with tomato, mozzarella, and balsamic.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Chicken breast", quantity: "4", category: "meat" },
      { name: "Tomato", quantity: "2", category: "produce" },
      { name: "Fresh mozzarella", quantity: "8", unit: "oz", category: "dairy" },
      { name: "Basil", quantity: "1", unit: "handful", category: "produce" },
      { name: "Balsamic glaze", quantity: "2", unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Lemon Garlic Tilapia",
    description: "Pan-seared tilapia in a bright lemon-garlic butter.",
    difficulty: "EASY",
    ingredients: [
      { name: "Tilapia fillets", quantity: "4", category: "seafood" },
      { name: "Lemon", quantity: "1", category: "produce" },
      { name: "Garlic", quantity: "3", unit: "cloves", category: "produce" },
      { name: "Butter", quantity: "3", unit: "tbsp", category: "dairy" },
    ],
  },
  {
    name: "Beef and Broccoli",
    description: "Tender beef and broccoli in a glossy garlic-soy sauce.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Flank steak", quantity: "1", unit: "lb", category: "meat" },
      { name: "Broccoli", quantity: "1", unit: "head", category: "produce" },
      { name: "Soy sauce", quantity: "1/3", unit: "cup", category: "condiments" },
      { name: "Garlic", quantity: "3", unit: "cloves", category: "produce" },
      { name: "Rice", quantity: "2", unit: "cups", category: "pantry" },
    ],
  },
  {
    name: "Falafel Wraps",
    description: "Crispy chickpea falafel in pita with tahini sauce.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Chickpeas", quantity: "2", unit: "cans", category: "pantry" },
      { name: "Pita bread", quantity: "4", category: "bakery" },
      { name: "Tahini", quantity: "1/4", unit: "cup", category: "condiments" },
      { name: "Cucumber", quantity: "1", category: "produce" },
      { name: "Parsley", quantity: "1/2", unit: "cup", category: "produce" },
    ],
  },
  {
    name: "French Toast",
    description: "Custard-dipped bread griddled golden and dusted with sugar.",
    difficulty: "EASY",
    ingredients: [
      { name: "Bread", quantity: "8", unit: "slices", category: "bakery" },
      { name: "Eggs", quantity: "4", category: "dairy" },
      { name: "Milk", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Cinnamon", quantity: "1", unit: "tsp", category: "pantry" },
      { name: "Maple syrup", quantity: "1/2", unit: "cup", category: "condiments" },
    ],
  },
  {
    name: "Sausage & Peppers",
    description: "Italian sausage with sautéed peppers and onions.",
    difficulty: "EASY",
    ingredients: [
      { name: "Italian sausage", quantity: "1", unit: "lb", category: "meat" },
      { name: "Bell pepper", quantity: "3", category: "produce" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Hoagie rolls", quantity: "4", category: "bakery" },
    ],
  },
  {
    name: "Chicken Parmesan",
    description: "Breaded chicken cutlets with marinara and melted mozzarella.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Chicken breast", quantity: "4", category: "meat" },
      { name: "Breadcrumbs", quantity: "1.5", unit: "cups", category: "pantry" },
      { name: "Marinara sauce", quantity: "24", unit: "oz", category: "pantry" },
      { name: "Mozzarella", quantity: "1.5", unit: "cups", category: "dairy" },
      { name: "Spaghetti", quantity: "1", unit: "lb", category: "pantry" },
    ],
  },
  {
    name: "Vegetable Fried Quinoa",
    description: "Protein-packed quinoa stir-fried with mixed vegetables.",
    difficulty: "EASY",
    ingredients: [
      { name: "Quinoa", quantity: "2", unit: "cups", category: "pantry" },
      { name: "Mixed vegetables", quantity: "2", unit: "cups", category: "frozen" },
      { name: "Eggs", quantity: "2", category: "dairy" },
      { name: "Soy sauce", quantity: "3", unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Clam Chowder",
    description: "Creamy New England chowder with clams and potatoes.",
    difficulty: "HARD",
    ingredients: [
      { name: "Clams", quantity: "2", unit: "cans", category: "seafood" },
      { name: "Potato", quantity: "3", category: "produce" },
      { name: "Bacon", quantity: "4", unit: "slices", category: "meat" },
      { name: "Heavy cream", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Onion", quantity: "1", category: "produce" },
    ],
  },
  {
    name: "Pesto Pasta",
    description: "Penne tossed in basil pesto with cherry tomatoes.",
    difficulty: "EASY",
    ingredients: [
      { name: "Penne", quantity: "1", unit: "lb", category: "pantry" },
      { name: "Basil pesto", quantity: "1/2", unit: "cup", category: "condiments" },
      { name: "Cherry tomatoes", quantity: "1", unit: "cup", category: "produce" },
      { name: "Parmesan", quantity: "1/2", unit: "cup", category: "dairy" },
    ],
  },
  {
    name: "Korean Bibimbap",
    description: "Rice bowl with seasoned vegetables, beef, and a fried egg.",
    difficulty: "HARD",
    ingredients: [
      { name: "Rice", quantity: "3", unit: "cups", category: "pantry" },
      { name: "Ground beef", quantity: "1/2", unit: "lb", category: "meat" },
      { name: "Spinach", quantity: "2", unit: "cups", category: "produce" },
      { name: "Carrot", quantity: "2", category: "produce" },
      { name: "Eggs", quantity: "4", category: "dairy" },
      { name: "Gochujang", quantity: "3", unit: "tbsp", category: "condiments" },
    ],
  },
  {
    name: "Breakfast Burritos",
    description: "Scrambled eggs, sausage, and cheese in warm tortillas.",
    difficulty: "EASY",
    ingredients: [
      { name: "Flour tortillas", quantity: "6", category: "bakery" },
      { name: "Eggs", quantity: "8", category: "dairy" },
      { name: "Breakfast sausage", quantity: "1/2", unit: "lb", category: "meat" },
      { name: "Cheddar", quantity: "1", unit: "cup", category: "dairy" },
      { name: "Potato", quantity: "2", category: "produce" },
    ],
  },
  {
    name: "Ratatouille",
    description: "Rustic Provençal stew of eggplant, zucchini, and tomato.",
    difficulty: "HARD",
    ingredients: [
      { name: "Eggplant", quantity: "1", category: "produce" },
      { name: "Zucchini", quantity: "2", category: "produce" },
      { name: "Bell pepper", quantity: "2", category: "produce" },
      { name: "Tomato", quantity: "4", category: "produce" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Olive oil", quantity: "1/4", unit: "cup", category: "pantry" },
    ],
  },
  {
    name: "Honey Garlic Chicken Thighs",
    description: "Sticky honey-garlic glazed chicken thighs, oven-baked.",
    difficulty: "MEDIUM",
    ingredients: [
      { name: "Chicken thighs", quantity: "2", unit: "lb", category: "meat" },
      { name: "Honey", quantity: "1/3", unit: "cup", category: "condiments" },
      { name: "Garlic", quantity: "4", unit: "cloves", category: "produce" },
      { name: "Soy sauce", quantity: "1/4", unit: "cup", category: "condiments" },
    ],
  },
  {
    name: "Black Bean Soup",
    description: "Smoky black bean soup finished with lime and cilantro.",
    difficulty: "EASY",
    ingredients: [
      { name: "Black beans", quantity: "3", unit: "cans", category: "pantry" },
      { name: "Onion", quantity: "1", category: "produce" },
      { name: "Vegetable broth", quantity: "4", unit: "cups", category: "pantry" },
      { name: "Lime", quantity: "1", category: "produce" },
      { name: "Cilantro", quantity: "1/4", unit: "cup", category: "produce" },
    ],
  },
];
