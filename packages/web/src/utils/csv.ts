import { MEAL_DIFFICULTIES, type Difficulty } from '@meal-planner/shared';

// Minimal RFC 4180-ish CSV parser. Handles quoted fields, embedded
// commas/newlines, and "" -> " escapes. Returns an array of rows of strings.
export function parseCSV(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings
  const text = input.replace(/\r\n?/g, "\n");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // Flush last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty trailing rows
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export interface ParsedImportMeal {
  name: string;
  description?: string;
  imageUrl?: string;
  difficulty?: Difficulty;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  sourceUrl?: string;
  notes?: string;
  favorite?: boolean;
  rating?: number;
  ingredients?: {
    name: string;
    quantity?: string;
    unit?: string;
    category?: string;
  }[];
  /** Meal-level tag names (semicolon-delimited in CSV). #107. */
  tags?: string[];
  /** Meal-level category names (semicolon-delimited in CSV). #107. */
  categories?: string[];
}

export interface ParseMealsCSVResult {
  meals: ParsedImportMeal[];
  warnings: string[];
}

/**
 * Parse a CSV of meals. Expected columns (header row required, case-insensitive):
 *   meal, description, difficulty, ingredient, quantity, unit, category
 *
 * Multiple rows sharing the same meal name are grouped into one meal with
 * multiple ingredients. The first non-empty description/difficulty wins. Rows
 * where `meal` is empty are skipped with a warning. `difficulty` must be one of
 * EASY, MEDIUM, HARD (case-insensitive); an unrecognized value is ignored with
 * a warning.
 *
 * Aliases supported for header names:
 *   meal       <- name, mealName
 *   ingredient <- ingredientName, item
 *   difficulty <- diff, effort
 *   tags       <- tag, labels (semicolon-delimited names; meal-level)
 *   categories <- cats, category names (semicolon-delimited names; meal-level)
 */
export function parseMealsCSV(input: string): ParseMealsCSVResult {
  const rows = parseCSV(input);
  const warnings: string[] = [];
  if (rows.length === 0) {
    return { meals: [], warnings: ["CSV is empty"] };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const aliases: Record<string, string[]> = {
    meal: ["meal", "name", "mealname", "meal name"],
    description: ["description", "desc"],
    imageUrl: ["imageurl", "image url", "image", "photo", "picture"],
    difficulty: ["difficulty", "diff", "effort"],
    prepTimeMinutes: [
      "preptimeminutes",
      "prep",
      "preptime",
      "prep time",
      "prep minutes",
      "prep time (min)",
    ],
    cookTimeMinutes: [
      "cooktimeminutes",
      "cook",
      "cooktime",
      "cook time",
      "cook minutes",
      "cook time (min)",
    ],
    servings: ["servings", "serving", "serves"],
    sourceUrl: ["sourceurl", "source url", "source", "url"],
    notes: ["notes", "note"],
    favorite: ["favorite", "favourite", "fav", "starred"],
    rating: ["rating", "rate", "stars", "score"],
    ingredient: ["ingredient", "ingredientname", "ingredient name", "item"],
    quantity: ["quantity", "qty", "amount"],
    unit: ["unit", "units"],
    category: ["category", "cat"],
    tags: ["tags", "tag", "labels"],
    categories: ["categories", "cats", "category names", "meal categories"],
  };

  const colIndex: Record<string, number> = {};
  for (const [key, options] of Object.entries(aliases)) {
    colIndex[key] = header.findIndex((h) => options.includes(h));
  }

  if (colIndex.meal === -1) {
    return {
      meals: [],
      warnings: [
        'CSV is missing a required "meal" column. Expected header: meal,description,ingredient,quantity,unit,category',
      ],
    };
  }

  const get = (row: string[], key: string): string => {
    const idx = colIndex[key];
    if (idx === -1 || idx >= row.length) return "";
    return (row[idx] ?? "").trim();
  };

  const byName = new Map<string, ParsedImportMeal>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = get(row, "meal");
    if (!name) {
      warnings.push(`Row ${i + 1}: skipped (missing meal name)`);
      continue;
    }

    let meal = byName.get(name.toLowerCase());
    if (!meal) {
      meal = { name };
      byName.set(name.toLowerCase(), meal);
    }

    const description = get(row, "description");
    if (description && !meal.description) {
      meal.description = description;
    }

    const imageUrl = get(row, "imageUrl");
    if (imageUrl && !meal.imageUrl) {
      meal.imageUrl = imageUrl;
    }

    const difficultyRaw = get(row, "difficulty");
    if (difficultyRaw && !meal.difficulty) {
      const normalized = difficultyRaw.toUpperCase();
      if ((MEAL_DIFFICULTIES as readonly string[]).includes(normalized)) {
        meal.difficulty = normalized as Difficulty;
      } else {
        warnings.push(
          `Row ${i + 1}: ignored unknown difficulty "${difficultyRaw}" (expected EASY, MEDIUM, or HARD)`,
        );
      }
    }

    const parseMetaInt = (
      key: "prepTimeMinutes" | "cookTimeMinutes" | "servings" | "rating",
      label: string,
      min: number,
      max?: number,
    ): void => {
      const raw = get(row, key);
      if (!raw || meal![key] != null) return;
      const n = Number(raw);
      if (Number.isInteger(n) && n >= min && (max === undefined || n <= max)) {
        meal![key] = n;
      } else {
        warnings.push(
          `Row ${i + 1}: ignored non-numeric ${label} "${raw}"`,
        );
      }
    };
    parseMetaInt("prepTimeMinutes", "prep time", 0);
    parseMetaInt("cookTimeMinutes", "cook time", 0);
    parseMetaInt("servings", "servings", 1);
    parseMetaInt("rating", "rating", 1, 5);

    const favoriteRaw = get(row, "favorite");
    if (favoriteRaw && meal.favorite == null) {
      const normalized = favoriteRaw.toLowerCase();
      if (["true", "yes", "y", "1"].includes(normalized)) {
        meal.favorite = true;
      } else if (["false", "no", "n", "0"].includes(normalized)) {
        meal.favorite = false;
      } else {
        warnings.push(
          `Row ${i + 1}: ignored unrecognized favorite "${favoriteRaw}"`,
        );
      }
    }

    const sourceUrl = get(row, "sourceUrl");
    if (sourceUrl && !meal.sourceUrl) {
      meal.sourceUrl = sourceUrl;
    }

    const notes = get(row, "notes");
    if (notes && !meal.notes) {
      meal.notes = notes;
    }

    const splitNames = (raw: string): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const part of raw.split(";")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed);
      }
      return out;
    };

    const tagsRaw = get(row, "tags");
    if (tagsRaw && !meal.tags) {
      const parsed = splitNames(tagsRaw);
      if (parsed.length > 0) meal.tags = parsed;
    }

    const categoriesRaw = get(row, "categories");
    if (categoriesRaw && !meal.categories) {
      const parsed = splitNames(categoriesRaw);
      if (parsed.length > 0) meal.categories = parsed;
    }

    const ingredient = get(row, "ingredient");
    if (ingredient) {
      const ing: ParsedImportMeal["ingredients"] extends (infer U)[] | undefined
        ? U
        : never = {
        name: ingredient,
      };
      const quantity = get(row, "quantity");
      const unit = get(row, "unit");
      const category = get(row, "category");
      if (quantity) ing.quantity = quantity;
      if (unit) ing.unit = unit;
      if (category) ing.category = category.toLowerCase();
      meal.ingredients = meal.ingredients || [];
      meal.ingredients.push(ing);
    }
  }

  return { meals: Array.from(byName.values()), warnings };
}

/** Column order used by both the import templates and {@link mealsToCSV}, so an
 *  exported file re-imports cleanly (round-trip). */
export const MEALS_CSV_HEADER = [
  "meal",
  "description",
  "difficulty",
  "ingredient",
  "quantity",
  "unit",
  "category",
  "prepTimeMinutes",
  "cookTimeMinutes",
  "servings",
  "sourceUrl",
  "imageUrl",
  "notes",
  "favorite",
  "rating",
  "tags",
  "categories",
] as const;

export interface ExportMeal {
  name: string;
  description?: string | null;
  difficulty?: Difficulty | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  servings?: number | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  favorite?: boolean | null;
  rating?: number | null;
  ingredients?: {
    name: string;
    quantity?: string | null;
    unit?: string | null;
    category?: string | null;
  }[];
  /** Meal-level tag names, emitted semicolon-delimited. #107. */
  tags?: string[] | null;
  /** Meal-level category names, emitted semicolon-delimited. #107. */
  categories?: string[] | null;
}

/** Quote a single CSV field per RFC 4180 when it contains a comma, quote, or
 *  newline; escape embedded quotes by doubling them. Numbers are stringified. */
function csvField(value: string | number | boolean | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize meals to a CSV string using {@link MEALS_CSV_HEADER}. One row per
 * ingredient; a meal with no ingredients emits a single row with empty
 * ingredient columns. The meal-level `description`/`difficulty` are repeated on
 * every row of that meal so the output round-trips through {@link parseMealsCSV}.
 */
export function mealsToCSV(meals: ExportMeal[]): string {
  const lines: string[] = [MEALS_CSV_HEADER.join(",")];

  const pushRow = (
    meal: ExportMeal,
    ing?: NonNullable<ExportMeal["ingredients"]>[number],
  ) => {
    lines.push(
      [
        csvField(meal.name),
        csvField(meal.description),
        csvField(meal.difficulty),
        csvField(ing?.name),
        csvField(ing?.quantity),
        csvField(ing?.unit),
        csvField(ing?.category),
        csvField(meal.prepTimeMinutes),
        csvField(meal.cookTimeMinutes),
        csvField(meal.servings),
        csvField(meal.sourceUrl),
        csvField(meal.imageUrl),
        csvField(meal.notes),
        csvField(meal.favorite),
        csvField(meal.rating),
        csvField(meal.tags?.join(";")),
        csvField(meal.categories?.join(";")),
      ].join(","),
    );
  };

  for (const meal of meals) {
    if (meal.ingredients && meal.ingredients.length > 0) {
      for (const ing of meal.ingredients) pushRow(meal, ing);
    } else {
      pushRow(meal);
    }
  }

  return lines.join("\n") + "\n";
}
