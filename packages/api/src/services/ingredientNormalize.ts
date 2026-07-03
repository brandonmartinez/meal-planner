/**
 * Ingredient name/unit normalization for grocery generation (issue #120).
 *
 * COMPUTED, not persisted: these helpers run in-memory at grocery-generation
 * time only. There is no schema column and no migration — the canonical form is
 * derived from the stored `name`/`unit` every time a list is generated.
 *
 * Conservative first pass:
 *  - Names: trim, case-fold (key only), collapse internal whitespace, strip
 *    trailing punctuation. Display casing is preserved (first-seen wins upstream,
 *    mirroring the `taxonomy.ts` convention). No stemming/singularization.
 *  - Units: fold a small allow-list of common aliases to a canonical token
 *    (e.g. `tablespoon` → `tbsp`). Unknown units pass through unchanged.
 *
 * No unit conversion is performed here (e.g. 3 tsp is NOT converted to 1 tbsp) —
 * quantity math across differing units is intentionally out of scope for the
 * first pass.
 */

/**
 * Canonical unit aliases: every variant on the right folds to the token on the
 * left. Keys and values are lowercase; lookups lowercase the input first.
 * Trailing `.` (e.g. `tbsp.`) is tolerated by stripping it before lookup.
 */
const UNIT_ALIASES: Record<string, string> = {
  // volume — spoons
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  tbs: "tbsp",
  tbl: "tbsp",
  // volume — cups
  cup: "cup",
  cups: "cup",
  // weight — imperial
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  // weight — metric
  gram: "g",
  grams: "g",
  gr: "g",
  g: "g",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  // volume — metric
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  ml: "ml",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  l: "l",
  // countable
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  pinch: "pinch",
  pinches: "pinch",
};

/**
 * Collapse runs of internal whitespace to a single space and trim the ends.
 * Shared by both the key and display helpers so spacing never splits a group.
 */
function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Grouping key for an ingredient name. Case-folded and punctuation-stripped so
 * that `"Tomato sauce"`, `"tomato Sauce"`, and `"Tomato sauce,"` all collapse to
 * the same key. Never used for display.
 */
export function normalizeIngredientName(name: string): string {
  return collapseWhitespace(name)
    .toLowerCase()
    .replace(/[.,;]+$/, "")
    .trimEnd();
}

/**
 * Display form of an ingredient name: whitespace-normalized but case-PRESERVING.
 * The first-seen variant of a group supplies the display casing (mirrors the
 * `taxonomy.ts` "case-insensitive key, first-seen display" convention), so we do
 * not title-case or otherwise mangle acronyms here.
 */
export function displayIngredientName(name: string): string {
  return collapseWhitespace(name);
}

/**
 * Canonical unit token, preserving display for unknown units. Known aliases fold
 * to their canonical token (e.g. `Tablespoons` → `tbsp`); unknown units are
 * returned trimmed with their original casing intact. Empty/missing → `""`.
 */
export function canonicalUnit(unit?: string): string {
  const trimmed = (unit ?? "").trim();
  if (!trimmed) return "";
  // Tolerate a single trailing period (e.g. "tbsp.") when matching aliases.
  const lookup = trimmed.toLowerCase().replace(/\.+$/, "");
  return UNIT_ALIASES[lookup] ?? trimmed;
}

/**
 * Grouping key for a unit: the canonical token, lowercased. Empty → `""`. Used
 * only for the merge key so that `tbsp` and `Tablespoon` group together.
 */
export function normalizeUnit(unit?: string): string {
  return canonicalUnit(unit).toLowerCase();
}

export { UNIT_ALIASES };
