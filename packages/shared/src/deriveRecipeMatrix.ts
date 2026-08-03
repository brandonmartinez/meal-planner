/**
 * `deriveRecipeMatrix` — derive the tabular ("Grid") recipe semantics from a
 * meal's ordered ingredients and instructions (spec §3.4). Pure: no Prisma, no
 * I/O, fully unit-testable. Invoked by the API read path.
 *
 * ANTI-STALENESS (load-bearing — Brandon; grocery-provenance lesson):
 *   - Derived output is COMPUTED ON EVERY READ AND NEVER PERSISTED. Do not write
 *     these values back into `MealIngredient.groupLabel` / `MealInstruction.
 *     {kind,subLabel,spanFrom,spanTo}`. Persisted derived state goes stale
 *     against the step text it came from — exactly the bug we hit when a stored
 *     grocery `sources` label drifted from `sourceMealIds`.
 *   - Provenance is STRUCTURAL, not a stored boolean: a meal is "authored" iff
 *     any instruction has a non-null `spanFrom`. We deliberately do NOT add an
 *     `isDerived`/`isAuthored` column — a cached provenance flag is the exact
 *     class of state that goes stale.
 *   - We DERIVE ONLY when `matrixSource === 'derived'`. If a meal has authored
 *     spans, every authored field is passed through UNTOUCHED — editing step
 *     text must never clobber an authored layout.
 *
 * This function produces *semantics* (which ingredient rows a step touches;
 * setup/finish classification), never *presentation*. The rowspan/gap-cell
 * layout is `buildTabularRecipe` in `packages/web`.
 */

import type {
  TabularRecipeIngredientInput,
  TabularRecipeInstructionInput,
  TabularRecipeIngredientMatrix,
  TabularRecipeInstructionMatrix,
  TabularRecipeMatrix,
} from "./types/tabularRecipe.js";

/** Leading-step verbs that mark a full-width SETUP band (spec §3.4.3). */
const SETUP_PATTERNS: RegExp[] = [
  /\bpreheat\b/i,
  /\bline\b/i,
  /\bgrease\b/i,
  /\bboil\b/i,
  /\bbring\b.*\bto a boil\b/i,
  /\bheat\b.*\boil\b/i,
];

/** Trailing-step verbs that mark a FINISH note (spec §3.4.4). */
const FINISH_PATTERNS: RegExp[] = [
  /\bcool\b/i,
  /\brest\b/i,
  /\bserve\b/i,
  /\bgarnish\b/i,
];

/**
 * Quantity / measure / filler words stripped before name matching so that an
 * instruction like "1/2 cup of the butter" still matches the "butter" row.
 * Numbers and fractions vanish for free — we tokenize on non-letters.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  "of", "the", "a", "an", "and", "or", "to", "with", "into", "for", "in", "on",
  "cup", "tablespoon", "tbsp", "teaspoon", "tsp", "ounce", "oz", "gram", "g",
  "kg", "kilogram", "pound", "lb", "ml", "milliliter", "liter", "l", "pinch",
  "dash", "clove", "slice", "can", "package", "pkg", "stick", "piece",
  "large", "small", "medium", "fresh", "dried", "ground", "chopped", "minced",
  "diced", "some", "extra",
]);

/** Lowercase, drop a single trailing plural "s" (spec §3.4.5 normalization). */
function singularize(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Split a phrase into significant lowercase tokens: singularized, with quantity
 * words and pure numbers removed. Applied identically to ingredient names and
 * instruction text so the two sides match consistently.
 */
function significantTokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 0)
    .map(singularize)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Extract a `subLabel` detail fragment from step text: a temperature ("350°F")
 * or a duration ("20 min" / "1 hr"), preferring temperature (spec §3.4.5/6).
 * Returns a normalized fragment, or `null` when neither is present.
 */
function extractSubLabel(text: string): string | null {
  const temp =
    text.match(/(\d+)\s*°\s*F/i) ??
    text.match(/(\d+)\s*°/) ??
    text.match(/(\d+)\s*degrees?\b/i);
  if (temp) return `${temp[1]}°F`;

  const dur = text.match(/(\d+)\s*(min(?:ute)?s?|h(?:ou)?rs?)\b/i);
  if (dur) {
    const unit = /^m/i.test(dur[2]) ? "min" : "hr";
    return `${dur[1]} ${unit}`;
  }
  return null;
}

/**
 * Derive the effective tabular-recipe matrix for a meal.
 *
 * @param ingredients persisted ingredients (any order; sorted here by `position`).
 * @param instructions persisted instructions (any order; sorted here by `position`).
 * @returns provenance + effective per-row / per-step matrix semantics, both
 *          arrays ordered ascending by `position`.
 */
export function deriveRecipeMatrix(
  ingredients: TabularRecipeIngredientInput[],
  instructions: TabularRecipeInstructionInput[],
): TabularRecipeMatrix {
  const sortedIngredients = [...ingredients].sort(
    (a, b) => a.position - b.position,
  );
  const sortedInstructions = [...instructions].sort(
    (a, b) => a.position - b.position,
  );

  // Effective group label is mode-independent: authored groupLabel, else the
  // grocery category, else null. Filling a null from category never clobbers
  // authored data (it was null) and is display-only.
  const ingredientMatrix: TabularRecipeIngredientMatrix[] = sortedIngredients.map(
    (ing) => ({
      position: ing.position,
      groupLabel: ing.groupLabel ?? ing.category ?? null,
    }),
  );

  // Provenance is structural: authored iff any instruction carries a span.
  const authored = sortedInstructions.some((i) => i.spanFrom != null);

  if (authored) {
    // Never re-derive an authored layout: pass every authored field through.
    const instructionMatrix: TabularRecipeInstructionMatrix[] =
      sortedInstructions.map((ins) => ({
        position: ins.position,
        kind: ins.kind,
        subLabel: ins.subLabel,
        spanFrom: ins.spanFrom,
        spanTo: ins.spanTo,
      }));
    return {
      matrixSource: "authored",
      ingredients: ingredientMatrix,
      instructions: instructionMatrix,
    };
  }

  return {
    matrixSource: "derived",
    ingredients: ingredientMatrix,
    instructions: deriveInstructions(sortedInstructions, sortedIngredients),
  };
}

/**
 * Classify and span the instructions of an unauthored meal (spec §3.4.3–6):
 * leading SETUP band, trailing FINISH note, remaining PROCESS steps spanning the
 * ingredient rows they name (unmatched → full-span degenerate case).
 */
function deriveInstructions(
  sortedInstructions: TabularRecipeInstructionInput[],
  sortedIngredients: TabularRecipeIngredientInput[],
): TabularRecipeInstructionMatrix[] {
  const n = sortedInstructions.length;
  const rowCount = sortedIngredients.length;

  // Precompute each ingredient row's significant tokens for name matching.
  const ingredientTokens: string[][] = sortedIngredients.map((ing) =>
    significantTokens(ing.name),
  );

  /** Row indices whose ingredient name is mentioned by the step text. */
  const mentionedRows = (text: string): number[] => {
    const stepTokens = new Set(significantTokens(text));
    const rows: number[] = [];
    for (let r = 0; r < ingredientTokens.length; r++) {
      const tokens = ingredientTokens[r];
      if (tokens.length > 0 && tokens.some((t) => stepTokens.has(t))) {
        rows.push(r);
      }
    }
    return rows;
  };

  const namesNoIngredient = (text: string): boolean =>
    mentionedRows(text).length === 0;

  // Leading contiguous SETUP band: setup verb + names no ingredient.
  let setupEnd = 0;
  while (
    setupEnd < n &&
    matchesAny(SETUP_PATTERNS, sortedInstructions[setupEnd].text) &&
    namesNoIngredient(sortedInstructions[setupEnd].text)
  ) {
    setupEnd++;
  }

  // Trailing contiguous FINISH note: finish verb + names no ingredient, without
  // overrunning the setup band.
  let finishStart = n;
  while (
    finishStart - 1 >= setupEnd &&
    matchesAny(FINISH_PATTERNS, sortedInstructions[finishStart - 1].text) &&
    namesNoIngredient(sortedInstructions[finishStart - 1].text)
  ) {
    finishStart--;
  }

  return sortedInstructions.map((ins, i) => {
    if (i < setupEnd) {
      return {
        position: ins.position,
        kind: "SETUP",
        subLabel: extractSubLabel(ins.text),
        spanFrom: null,
        spanTo: null,
      };
    }
    if (i >= finishStart) {
      return {
        position: ins.position,
        kind: "FINISH",
        subLabel: extractSubLabel(ins.text),
        spanFrom: null,
        spanTo: null,
      };
    }

    // PROCESS: span the min/max mentioned row. Unmatched → span ALL rows (the
    // explicit degenerate case), or null spans when the meal has no ingredients.
    const rows = mentionedRows(ins.text);
    let spanFrom: number | null;
    let spanTo: number | null;
    if (rows.length > 0) {
      spanFrom = rows[0];
      spanTo = rows[rows.length - 1];
    } else if (rowCount > 0) {
      spanFrom = 0;
      spanTo = rowCount - 1;
    } else {
      spanFrom = null;
      spanTo = null;
    }

    return {
      position: ins.position,
      kind: "PROCESS",
      subLabel: extractSubLabel(ins.text),
      spanFrom,
      spanTo,
    };
  });
}
