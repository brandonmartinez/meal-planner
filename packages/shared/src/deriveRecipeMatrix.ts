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
 * Quantity / measure / grammatical filler words removed entirely before name
 * matching so that an instruction like "1/2 cup of the butter" still matches the
 * "butter" row. Numbers and fractions vanish for free — we tokenize on
 * non-letters.
 */
const QUANTITY_STOP: ReadonlySet<string> = new Set([
  "of", "the", "a", "an", "and", "or", "to", "with", "into", "for", "in", "on",
  "cup", "tablespoon", "tbsp", "teaspoon", "tsp", "ounce", "oz", "gram", "g",
  "kg", "kilogram", "pound", "lb", "ml", "milliliter", "liter", "l", "pinch",
  "dash", "clove", "slice", "can", "package", "pkg", "stick", "piece",
]);

/**
 * Descriptor words. Unlike `QUANTITY_STOP` these are KEPT as tokens, but tagged
 * as *modifiers*. A modifier adds specificity to a phrase ("ground beef" is more
 * specific than "beef") yet can NEVER anchor a match on its own — an ingredient
 * only matches a step through a CORE (non-modifier) token. This is what lets
 * "Ground beef" claim the "beef" region over "Beef broth" without letting a bare
 * "diced"/"fresh" in a step falsely match every diced/fresh ingredient.
 *
 * (Historically these lived in the stop list and were discarded, which erased
 * the very signal that disambiguates e.g. "Ground beef" from "Beef broth".)
 */
const MODIFIER_WORDS: ReadonlySet<string> = new Set([
  "large", "small", "medium", "fresh", "dried", "ground", "chopped", "minced",
  "diced", "some", "extra",
]);

/** A significant token plus modifier/adjacency metadata used by the matcher. */
interface MatchToken {
  t: string;
  /** True when this is a descriptor (can add specificity, never anchors). */
  mod: boolean;
  /**
   * True when the previous significant token was NOT immediately adjacent in the
   * source text (something — a stop word or punctuation — sat between them). A
   * multi-token phrase may only merge across tokens with `gapBefore === false`,
   * so "chicken in broth" does NOT collapse into the compound "chicken broth"
   * (the connective "in" fabricates no adjacency), while "ground beef" does.
   */
  gapBefore: boolean;
}

/** Lowercase, drop a single trailing plural "s" (spec §3.4.5 normalization). */
function singularize(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Split a phrase into ordered significant tokens: singularized, with quantity
 * words and pure numbers removed, descriptors tagged as modifiers, and each
 * token flagged with whether it is truly adjacent to the previous significant
 * token. Applied identically to ingredient names and instruction text so the two
 * sides match consistently. Only whitespace counts as adjacency — a dropped stop
 * word or any punctuation between two words marks a gap.
 */
function tokenize(phrase: string): MatchToken[] {
  const lower = phrase.toLowerCase();
  const re = /[a-z]+/g;
  const out: MatchToken[] = [];
  let prevSigEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lower)) !== null) {
    const word = singularize(match[0]);
    if (word.length === 0 || QUANTITY_STOP.has(word)) {
      // Non-significant: leave `prevSigEnd` untouched so the next significant
      // token sees this dropped word as a gap.
      continue;
    }
    const between = prevSigEnd >= 0 ? lower.slice(prevSigEnd, match.index) : "";
    out.push({
      t: word,
      mod: MODIFIER_WORDS.has(word),
      gapBefore: prevSigEnd >= 0 && between !== " ",
    });
    prevSigEnd = match.index + match[0].length;
  }
  return out;
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
 * @returns provenance, effective per-row / per-step matrix semantics (both arrays
 *          ordered ascending by `position`), and `ingredientDisplayOrder` — the
 *          Grid row order into which `spanFrom`/`spanTo` index.
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

  // Effective group label: ONLY an authored `groupLabel`. We deliberately do
  // NOT fall back to `category` — in this app `category` is the grocery-aisle
  // vocabulary (produce, dairy, pantry, …), so deriving group pills from it
  // would group ingredients by shopping aisle instead of by order/section of
  // use, actively fighting the Cooking-for-Engineers format (Chu groups by
  // recipe section: "Breading", "Remoulade"). So derived meals render with NO
  // group pills (all null) — the COMMON case on real data until Phase-2
  // authoring ships. `groupLabel` is display-only and never persisted (spec
  // §3.4 rule 2; Rusty ruling P1-9, option ii).
  const ingredientMatrix: TabularRecipeIngredientMatrix[] = sortedIngredients.map(
    (ing) => ({
      position: ing.position,
      groupLabel: ing.groupLabel ?? null,
    }),
  );

  // Provenance is structural: authored iff any instruction carries a span.
  const authored = sortedInstructions.some((i) => i.spanFrom != null);

  if (authored) {
    // Never re-derive an authored layout: pass every authored field through, and
    // hand back the IDENTITY display order so display == position and the
    // editor-written spans (already position-indexed) stay valid unchanged.
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
      ingredientDisplayOrder: sortedIngredients.map((_, i) => i),
    };
  }

  const { ingredientDisplayOrder, instructions: derivedInstructions } =
    deriveInstructions(sortedInstructions, sortedIngredients);
  return {
    matrixSource: "derived",
    ingredients: ingredientMatrix,
    instructions: derivedInstructions,
    ingredientDisplayOrder,
  };
}

/**
 * Classify + span the instructions of an unauthored meal AND compute the Grid
 * row order (spec §3.4.2–6):
 *   - leading SETUP band, trailing FINISH note, remaining PROCESS steps;
 *   - `ingredientDisplayOrder` = first-use permutation: rows ordered by the index
 *     of the first step that names them; rows named by no step are parked at the
 *     END in position order (Rusty: the single biggest win — it pulls unrelated
 *     rows out from between co-used ones); ties broken by position (stable);
 *   - each PROCESS step spans min/max of its matched rows' DISPLAY indices
 *     (contiguous by construction). A step naming no ingredient spans ALL display
 *     rows (the explicit degenerate case); a meal with no ingredients → null span.
 *
 * NOTE this fixes the majority over-bracket cause but NOT cross-step reuse: a row
 * used in steps 1 and 4 sorts to step 1, so step 4's min..max still reaches over
 * it. That residual is intrinsic (a rowspan table renders a tree; genuine reuse
 * is a DAG) and only Phase-2 authored spans close it.
 */
function deriveInstructions(
  sortedInstructions: TabularRecipeInstructionInput[],
  sortedIngredients: TabularRecipeIngredientInput[],
): {
  ingredientDisplayOrder: number[];
  instructions: TabularRecipeInstructionMatrix[];
} {
  const n = sortedInstructions.length;
  const rowCount = sortedIngredients.length;

  // Precompute each ingredient row's token sequence + its token sets for name
  // matching. `all` = every token (core + modifier); `core` = anchoring tokens
  // only (a modifier can never establish a match by itself).
  const ingredientSets = sortedIngredients.map((ing) => {
    const all = new Set<string>();
    const core = new Set<string>();
    for (const { t, mod } of tokenize(ing.name)) {
      all.add(t);
      if (!mod) core.add(t);
    }
    return { all, core };
  });

  /**
   * Position-row indices whose ingredient name is mentioned by the step text,
   * resolved by *phrase specificity* so that a shared token ("beef" in both
   * "Ground beef" and "Beef broth") is claimed by the longer contiguous phrase.
   *
   * Algorithm (spec §3.4.5):
   *   1. Tokenize the step into an ordered list of significant tokens.
   *   2. For each ingredient, find every maximal run of step tokens that all
   *      belong to that ingredient AND are truly adjacent (no gap); a run is a
   *      candidate "occurrence" iff it contains ≥1 CORE token (a modifier alone
   *      can't anchor). Occurrence specificity = number of DISTINCT ingredient
   *      tokens in it.
   *   3. Each step position is won by the max-specificity occurrence covering it.
   *      An ingredient matches iff it has an occurrence that ties the winning
   *      specificity at ≥1 of its positions.
   *
   * Ties (equal max specificity — genuine ambiguity, e.g. "combine the flours"
   * with two `… flour` rows, or Birria's scattered "beef … broth") resolve to
   * "match both": we only ever DROP a match when a strictly more specific phrase
   * explains the exact region — never on a guess. This follows the established
   * principle from the label work: prefer the error that doesn't state something
   * false. A wrongly-suppressed match under-brackets; a wrongly-added one
   * corrupts the first-use permutation and over-brackets.
   */
  const mentionedRows = (text: string): number[] => {
    const step = tokenize(text);
    const m = step.length;
    if (m === 0) return [];

    interface Occ {
      start: number;
      end: number;
      spec: number;
    }

    const occurrences: Occ[][] = ingredientSets.map(({ all, core }) => {
      const occs: Occ[] = [];
      let s = 0;
      while (s < m) {
        if (!all.has(step[s].t)) {
          s++;
          continue;
        }
        let e = s;
        const seen = new Set<string>();
        let hasCore = false;
        while (e < m && all.has(step[e].t) && (e === s || !step[e].gapBefore)) {
          seen.add(step[e].t);
          if (core.has(step[e].t)) hasCore = true;
          e++;
        }
        if (hasCore) occs.push({ start: s, end: e - 1, spec: seen.size });
        s = e;
      }
      return occs;
    });

    // Winning (max) specificity claimed at each step position.
    const bestSpec = new Array<number>(m).fill(0);
    for (const occs of occurrences) {
      for (const o of occs) {
        for (let p = o.start; p <= o.end; p++) {
          if (o.spec > bestSpec[p]) bestSpec[p] = o.spec;
        }
      }
    }

    const rows: number[] = [];
    for (let r = 0; r < occurrences.length; r++) {
      let claims = false;
      for (const o of occurrences[r]) {
        for (let p = o.start; p <= o.end; p++) {
          if (o.spec === bestSpec[p]) {
            claims = true;
            break;
          }
        }
        if (claims) break;
      }
      if (claims) rows.push(r);
    }
    return rows;
  };

  // Cache each step's matched position-rows (used for both first-use and spans).
  const stepRows: number[][] = sortedInstructions.map((ins) =>
    mentionedRows(ins.text),
  );

  const namesNoIngredient = (i: number): boolean => stepRows[i].length === 0;

  // Leading contiguous SETUP band: setup verb + names no ingredient.
  let setupEnd = 0;
  while (
    setupEnd < n &&
    matchesAny(SETUP_PATTERNS, sortedInstructions[setupEnd].text) &&
    namesNoIngredient(setupEnd)
  ) {
    setupEnd++;
  }

  // Trailing contiguous FINISH note: finish verb + names no ingredient, without
  // overrunning the setup band.
  let finishStart = n;
  while (
    finishStart - 1 >= setupEnd &&
    matchesAny(FINISH_PATTERNS, sortedInstructions[finishStart - 1].text) &&
    namesNoIngredient(finishStart - 1)
  ) {
    finishStart--;
  }

  // First-use step index per position-row (min matching-step index). Rows named
  // by no step get the sentinel `n` (> every real step index) so they sort last.
  // Setup/finish steps match nothing, so iterating all steps is equivalent to
  // iterating only PROCESS steps here.
  const firstUse = new Array<number>(rowCount).fill(n);
  for (let i = 0; i < n; i++) {
    for (const r of stepRows[i]) {
      if (i < firstUse[r]) firstUse[r] = i;
    }
  }

  // Display order = rows sorted by (first-use step, then position). Stable via
  // the explicit position tie-break; unreferenced rows (sentinel `n`) land at the
  // end, ordered among themselves by position.
  const ingredientDisplayOrder = Array.from({ length: rowCount }, (_, r) => r);
  ingredientDisplayOrder.sort(
    (a, b) => firstUse[a] - firstUse[b] || a - b,
  );

  // Inverse permutation: display index of each position-row.
  const displayIndexOf = new Array<number>(rowCount);
  ingredientDisplayOrder.forEach((r, k) => {
    displayIndexOf[r] = k;
  });

  const instructions = sortedInstructions.map((ins, i) => {
    if (i < setupEnd) {
      return {
        position: ins.position,
        kind: "SETUP" as const,
        subLabel: extractSubLabel(ins.text),
        spanFrom: null,
        spanTo: null,
      };
    }
    if (i >= finishStart) {
      return {
        position: ins.position,
        kind: "FINISH" as const,
        subLabel: extractSubLabel(ins.text),
        spanFrom: null,
        spanTo: null,
      };
    }

    // PROCESS: span the min/max DISPLAY index of the matched rows. Unmatched →
    // span ALL display rows (the degenerate case); no ingredients → null span.
    const rows = stepRows[i];
    let spanFrom: number | null;
    let spanTo: number | null;
    if (rows.length > 0) {
      const displayIdx = rows.map((r) => displayIndexOf[r]);
      spanFrom = Math.min(...displayIdx);
      spanTo = Math.max(...displayIdx);
    } else if (rowCount > 0) {
      spanFrom = 0;
      spanTo = rowCount - 1;
    } else {
      spanFrom = null;
      spanTo = null;
    }

    return {
      position: ins.position,
      kind: "PROCESS" as const,
      subLabel: extractSubLabel(ins.text),
      spanFrom,
      spanTo,
    };
  });

  return { ingredientDisplayOrder, instructions };
}
