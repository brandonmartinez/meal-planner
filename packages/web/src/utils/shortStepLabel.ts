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
 * THE UNIFYING RULE (we have relitigated this five times — please don't again):
 * never emit a label that a cook would read as a DIFFERENT or INCOMPLETE
 * instruction. Abbreviate only by dropping genuinely REDUNDANT detail — detail
 * the rowspan bracket or the subLabel already conveys — never by truncating into
 * a fragment or by promoting a non-instruction (an adverbial/temporal/spatial
 * opener) to the whole label. When the heuristic cannot produce something clean,
 * KEEP MORE TEXT: erring long costs a little column width (the title/List carry
 * the rest); erring short costs correctness, and this is a recipe people cook
 * from.
 *
 * OPENER DETECTION IS STRUCTURAL, NOT A WORD LIST. An English imperative step
 * begins with a bare verb ("Whisk…", "Fold…", "Reduce…"). A leading comma-clause
 * that does NOT begin with a verb is a scene-setter, not the instruction —
 * whether it is adverbial ("Meanwhile,"), prepositional ("In a large bowl,",
 * "For the sauce,", "Off the heat,"), or numeric/timing ("2 minutes before
 * serving,"). We can't POS-tag in the browser, so we invert: a clause is an
 * opener when its head is a NON-VERB — a function word (preposition, conjunction,
 * determiner, or temporal/manner adverb, all closed classes) or a number. Do NOT
 * "fix" a missed opener by appending the specific phrase; if it slips through it
 * means its head belongs in NON_VERB_HEADS (or is a number) — generalize there.
 *
 * SHORTENING HAPPENS ONLY AT REAL SYNTACTIC BOUNDARIES — NEVER A WORD COUNT.
 * A prior version capped the label at N words and trimmed the ragged end. That
 * cannot be made safe: any sentence longer than the cap reproduces the fragment
 * at the new cap forever ("…the seasoned", "…of salted"), so every trim rule
 * patched an instance and left the class (seven defect families). We now cut
 * only where language actually permits: at a comma (clause selection) or by
 * dropping a trailing subordinate/purpose clause introduced by "to <verb>",
 * "until", "while", or "then". If the sentence has no such boundary, it is
 * emitted WHOLE. A long label is a layout inconvenience; a fragment is a wrong
 * instruction — and we have established which error is the cheaper one.
 */

/** Never abbreviate down to a bare verb — "Bring"/"Cook" alone are meaningless.
 *  Also the minimum head a boundary cut may leave behind. */
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

/**
 * Non-verb clause heads: an imperative step begins with a bare verb, so a
 * leading comma-clause headed by one of these function words (or by a number —
 * see `isOpenerClause`) is a scene-setter to skip, not the instruction. These
 * are all CLOSED grammatical classes — prepositions, conjunctions, determiners,
 * and a small set of temporal/manner adverbs — so this set names categories, it
 * does not enumerate phrases. A missed opener means its head belongs here.
 */
const NON_VERB_HEADS = new Set([
  // prepositions / spatial-temporal heads ("In a large bowl,", "Off the heat,")
  'in', 'on', 'at', 'to', 'for', 'with', 'without', 'from', 'into', 'onto',
  'over', 'under', 'by', 'of', 'off', 'up', 'down', 'after', 'before', 'during',
  'through', 'throughout', 'around', 'about', 'above', 'below', 'beside',
  'between', 'near', 'upon', 'within', 'across', 'along', 'toward', 'towards',
  // determiners (cannot head an imperative)
  'the', 'a', 'an', 'each', 'every',
  // conjunctions / subordinators
  'and', 'or', 'but', 'if', 'as', 'so', 'while', 'when', 'whenever', 'once',
  'until', 'unless', 'because', 'since', 'though', 'although',
  // temporal / manner / sequencing adverbs
  'meanwhile', 'then', 'next', 'first', 'firstly', 'finally', 'later', 'soon',
  'now', 'again', 'immediately', 'carefully', 'gently', 'slowly', 'quickly',
  'lightly', 'evenly', 'well', 'just', 'always', 'never',
]);

/**
 * Base-form imperative verbs that happen to END in "-ing" ("Bring to a boil",
 * "String the beans", "Wring out the spinach"). The participle rule below treats
 * an "-ing" head as a manner/means adjunct opener ("Using a slotted spoon,",
 * "Working in batches,", "Stirring constantly,") — but these must be exempted so
 * a real imperative is never mistaken for an adjunct and skipped.
 */
const ING_BASE_VERBS = new Set([
  'bring', 'string', 'wring', 'ring', 'sing', 'cling', 'fling', 'sling',
  'spring', 'ping',
]);

/** Closed set of "glue" words a completed head must never END on — an article,
 *  preposition, or conjunction left trailing reads as unfinished. Used to reject
 *  a boundary cut whose head would end raggedly, not to trim one into shape. */
const WEAK_ENDINGS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'with', 'to', 'for', 'in', 'of',
  'into', 'onto', 'on', 'at', 'by', 'from', 'over', 'under', 'until', 'then',
  'as', 'up', 'off', 'about', 'through',
]);

/**
 * Subordinators that RELIABLY introduce a trailing subordinate / purpose /
 * sequence clause we can drop as a whole ("… to make the sauce", "… until
 * golden", "… while stirring", "… then sear"). Coordinating "and"/"or" are
 * deliberately EXCLUDED: they ambiguously join nouns ("salt and pepper", "dill
 * pickles and mayonnaise") as often as clauses, and we can't tell which without
 * POS tagging — so cutting there risks a fragment. If a sentence's only join is
 * "and", we keep it whole rather than guess.
 */
const SUBORDINATORS = new Set(['to', 'until', 'while', 'then']);
const COORDINATORS = new Set(['and', 'or', 'nor']);

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/** Lowercase and strip surrounding punctuation for set membership tests. */
function normWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z°]/g, '');
}

function startsWithDigit(word: string): boolean {
  return /^[\d¼½¾⅓⅔⅛]/.test(word);
}

/** A "content" word can head the clause a subordinator introduces (i.e. a verb
 *  or its object) — as opposed to a determiner/number that makes the phrase a
 *  prepositional complement to KEEP ("to a boil", "to 165°F", "to the pan"). */
function isContentWord(word: string): boolean {
  return !startsWithDigit(word) && !NON_VERB_HEADS.has(normWord(word));
}

/** Sentence-case the first character (used after an opener clause is skipped,
 *  so a promoted lowercase continuation matches the capitalized grid column). */
function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** A present-participle head ("Using…", "Working…", "Stirring…") marks a
 *  manner/means adjunct, not an imperative — except base-form verbs in
 *  ING_BASE_VERBS ("Bring", "String"), which really are imperatives. */
function isParticipleHead(head: string): boolean {
  return head.length > 4 && head.endsWith('ing') && !ING_BASE_VERBS.has(head);
}

/**
 * A leading clause is an opener (skip it) when it is NOT headed by a verb:
 *   - a number / measurement head ("2 minutes before serving,", "30 seconds
 *     later,") — imperatives never start with a digit;
 *   - a function-word / adverb head from NON_VERB_HEADS; or
 *   - a present-participle adjunct head ("Using a slotted spoon,").
 * Everything else is assumed to be a verb-headed instruction and kept.
 */
function isOpenerClause(clause: string): boolean {
  const first = words(clause)[0] ?? '';
  if (startsWithDigit(first)) return true;
  const head = normWord(first);
  return NON_VERB_HEADS.has(head) || isParticipleHead(head);
}

function isStrippableMeasurement(tail: string): boolean {
  return STRIPPABLE_TEMPERATURE.test(tail) || STRIPPABLE_DURATION.test(tail);
}

/**
 * Shorten by dropping a trailing subordinate/purpose clause, but ONLY at a
 * genuine boundary — a SUBORDINATOR that introduces a droppable clause. Scans
 * from the end so only the LAST (outermost) clause is dropped, keeping the most
 * text. A candidate boundary at index i is taken only when it cannot leave a
 * fragment behind:
 *   - the head keeps at least MIN_LABEL_WORDS words;
 *   - the subordinator introduces a clause (its next word is a content word, not
 *     a determiner/number — so "to a boil" / "to 165°F" stay intact);
 *   - the head does not end on a glue word or connective; and
 *   - the head does not end on a coordinated verb ("… and fry | until golden"),
 *     which would drop that verb's object.
 * If nothing qualifies, the label is returned unchanged (whole > fragment).
 */
function dropTrailingClause(label: string): string {
  const parts = words(label);
  for (let i = parts.length - 2; i >= MIN_LABEL_WORDS; i -= 1) {
    if (!SUBORDINATORS.has(normWord(parts[i]))) continue;
    if (!isContentWord(parts[i + 1])) continue;
    const prev = normWord(parts[i - 1]);
    if (WEAK_ENDINGS.has(prev) || SUBORDINATORS.has(prev) || COORDINATORS.has(prev)) continue;
    if (COORDINATORS.has(normWord(parts[i - 2] ?? ''))) continue;
    return parts.slice(0, i).join(' ').replace(/[\s,;:]+$/, '');
  }
  return label;
}

/**
 * Derive a terse display label from a full-sentence step:
 *   1. pick the first comma-clause that actually carries the instruction —
 *      skipping any leading clause NOT headed by a verb: adverbial ("Meanwhile,",
 *      "Carefully,"), prepositional ("In a large bowl,", "Off the heat,"),
 *      numeric/timing ("2 minutes before serving,"), or participial ("Using a
 *      slotted spoon,") — so the imperative survives;
 *   2. strip a trailing "to/for <detail>" tail ONLY when the tail is a
 *      redundant, subLabel-mirrored measurement (temperature or minutes/hours)
 *      and at least MIN_LABEL_WORDS survive — so "Heat the oil to 350°F" becomes
 *      "Heat the oil", while "Bring to a boil", "Cook to 165°F" (floor), and
 *      "Blanch the beans for 90 seconds" (seconds aren't re-shown) keep the tail;
 *   3. drop a trailing subordinate/purpose clause at a genuine boundary
 *      ("… to make the sauce", "… until golden") — never mid-phrase; a sentence
 *      with no such boundary ("Cook the spaghetti in a large pot of salted
 *      water") is kept WHOLE;
 *   4. if an opener clause was skipped, sentence-case the promoted continuation
 *      so it matches the capitalized grid column ("cook the pasta" → "Cook …").
 * Falls back to the trimmed original if the heuristic empties the string.
 */
export function shortStepLabel(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // (1) First clause that is a real instruction, not an adverbial opener.
  const clauses = trimmed.split(',').map((c) => c.trim()).filter(Boolean);
  const instruction = clauses.find((c) => !isOpenerClause(c));
  const skippedOpener = instruction !== undefined && instruction !== clauses[0];
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

  // (3) Drop a trailing subordinate clause at a real boundary, or keep whole.
  label = dropTrailingClause(label);

  label = label.trim() || trimmed;
  return skippedOpener ? capitalizeFirst(label) : label;
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
