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
  ingredients?: {
    name: string;
    quantity?: string;
    unit?: string;
    category?: string;
  }[];
}

export interface ParseMealsCSVResult {
  meals: ParsedImportMeal[];
  warnings: string[];
}

/**
 * Parse a CSV of meals. Expected columns (header row required, case-insensitive):
 *   meal, description, ingredient, quantity, unit, category
 *
 * Multiple rows sharing the same meal name are grouped into one meal with
 * multiple ingredients. The first non-empty description wins. Rows where
 * `meal` is empty are skipped with a warning.
 *
 * Aliases supported for header names:
 *   meal       <- name, mealName
 *   ingredient <- ingredientName, item
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
    ingredient: ["ingredient", "ingredientname", "ingredient name", "item"],
    quantity: ["quantity", "qty", "amount"],
    unit: ["unit", "units"],
    category: ["category", "cat"],
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
