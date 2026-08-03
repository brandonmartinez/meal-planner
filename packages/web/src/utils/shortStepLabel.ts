/**
 * Presentation-only helpers for the Grid view's process cells (Findings 1 & 2,
 * Rusty's ruling — issue #96 gate). Chu's tabular format only works when the
 * rowspan bracket carries the meaning and the cell label is a terse verb; a full
 * sentence forces wide columns and re-states the very ingredients the rowspan
 * already shows. So the Grid derives a SHORT DISPLAY LABEL at render time.
 *
 * This is deliberately NOT persisted and adds NO DTO field: the instruction
 * `text` stays the single semantic source of truth (which is what keeps this at
 * zero MCP/API impact and dodges the staleness trap). The List view always
 * renders the full `text` and remains the lossless equivalent; the Grid keeps
 * the full text one hover away via a `title` attribute. Smart verb extraction
 * and user-authored labels are Phase 2 — this is the light heuristic only.
 *
 * THE UNIFYING RULE (we have relitigated this three times — please don't again):
 * never emit a label that a cook would read as a DIFFERENT or INCOMPLETE
 * instruction. Abbreviate only by dropping genuinely REDUNDANT detail — detail
 * the rowspan bracket or the subLabel already conveys — never by truncating into
 * a fragment or by promoting a non-instruction (an adverbial/temporal opener) to
 * the whole label. When the heuristic cannot produce something clean, KEEP MORE
 * TEXT: erring long costs a little column width (the title/List carry the rest);
 * erring short costs correctness, and this is a recipe people cook from.
 */

/** Runaway guard only — most labels are far shorter after clause selection.
 *  Deliberately generous: a complete 7–8 word phrase beats a terse fragment. */
const MAX_WORDS = 9;
/** Never abbreviate down to a bare verb — "Bring"/"Cook" alone are meaningless. */
const MIN_LABEL_WORDS = 2;

/**
 * Measurements we may strip from a `to`/`for` tail. These MUST match what
 * shared's `extractSubLabel` re-surfaces as the subLabel — temperature and
 * minutes/hours ONLY. Seconds and days are intentionally excluded: the subLabel
 * never shows them, so stripping them would delete a cook-critical timing from
 * the Grid entirely (invisible on a touch tablet with no hover). Keep those.
 */
const STRIPPABLE_TEMPERATURE = /\d+\s*(?:°|degrees?\b)/i;
const STRIPPABLE_DURATION = /\d+\s*(?:min(?:ute)?s?|h(?:ou)?rs?)\b/i;

/** Adverbial / temporal / conditional openers that are NOT the instruction.
 *  A leading comma-clause starting with one of these is skipped so the actual
 *  imperative that follows becomes the label ("Meanwhile, cook the pasta"). */
const OPENERS = new Set([
  'meanwhile', 'once', 'after', 'before', 'while', 'when', 'whenever',
  'carefully', 'gently', 'slowly', 'immediately', 'quickly', 'then', 'next',
  'first', 'finally', 'using', 'if', 'as',
]);

/** Closed set of "glue" words a label must never END on — an article,
 *  preposition, or conjunction trailing after truncation reads as unfinished. */
const WEAK_ENDINGS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'with', 'to', 'for', 'in', 'of',
  'into', 'onto', 'on', 'at', 'by', 'from', 'over', 'under', 'until', 'then',
  'as', 'up', 'off', 'about', 'through',
]);

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/** Lowercase and strip surrounding punctuation for set membership tests. */
function normWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z°]/g, '');
}

function isOpenerClause(clause: string): boolean {
  return OPENERS.has(normWord(words(clause)[0] ?? ''));
}

function isStrippableMeasurement(tail: string): boolean {
  return STRIPPABLE_TEMPERATURE.test(tail) || STRIPPABLE_DURATION.test(tail);
}

/**
 * Derive a terse display label from a full-sentence step:
 *   1. pick the first comma-clause that actually carries the instruction —
 *      skipping leading adverbial/temporal/conditional openers ("Meanwhile,",
 *      "After 5 minutes,", "Carefully,") so the imperative survives;
 *   2. strip a trailing "to/for <detail>" tail ONLY when the tail is a
 *      redundant, subLabel-mirrored measurement (temperature or minutes/hours)
 *      and at least MIN_LABEL_WORDS survive — so "Heat the oil to 350°F" becomes
 *      "Heat the oil", while "Bring to a boil", "Cook to 165°F" (floor), and
 *      "Blanch the beans for 90 seconds" (seconds aren't re-shown) keep the tail;
 *   3. only as a runaway guard, cap at MAX_WORDS words, trimming trailing glue
 *      words so a rare very long label never ends mid-phrase on "and"/"the".
 * Falls back to the trimmed original if the heuristic empties the string.
 */
export function shortStepLabel(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // (1) First clause that is a real instruction, not an adverbial opener.
  const clauses = trimmed.split(',').map((c) => c.trim()).filter(Boolean);
  const instruction = clauses.find((c) => !isOpenerClause(c));
  let label = instruction ?? trimmed;

  // (2) Redundant-measurement tail strip (greedy head → strip the LAST tail).
  const tailMatch = label.match(/^(.*)(\s+(?:to|for)\s+\S.*)$/i);
  if (tailMatch) {
    const head = tailMatch[1].trim();
    const tail = tailMatch[2];
    if (isStrippableMeasurement(tail) && words(head).length >= MIN_LABEL_WORDS) {
      label = head;
    }
  }

  // (3) Runaway guard, on a clean boundary.
  const parts = words(label);
  if (parts.length > MAX_WORDS) {
    const cut = parts.slice(0, MAX_WORDS);
    while (cut.length > MIN_LABEL_WORDS && WEAK_ENDINGS.has(normWord(cut[cut.length - 1]))) {
      cut.pop();
    }
    label = cut.join(' ');
  }

  return label.trim() || trimmed;
}

/**
 * True when a sub-label merely restates part of the already-displayed label
 * (case-insensitive substring), so it should be suppressed to avoid the
 * "Heat the frying oil … / 350°F" double-print. This also catches the cases
 * where the label deliberately KEEPS a measurement (e.g. "Cook to 165°F"): the
 * tail stays for legibility, and the redundant subLabel drops out here instead.
 */
export function isRedundantSubLabel(
  subLabel: string | null,
  displayedLabel: string,
): boolean {
  if (!subLabel) return false;
  const needle = subLabel.trim().toLowerCase();
  if (!needle) return false;
  return displayedLabel.toLowerCase().includes(needle);
}
