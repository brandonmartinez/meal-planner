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
 * Guiding principle: the short label must never be *wrong* or *misleading* —
 * only *abbreviated*. When in doubt, keep more text. Erring long costs a little
 * column width (the `title`/List carry the rest); erring short costs
 * correctness, and this is a recipe people cook from.
 */

const MAX_WORDS = 6;
/** Never abbreviate down to a bare verb — "Bring"/"Cook" alone are meaningless. */
const MIN_LABEL_WORDS = 2;

/** A temperature fragment, e.g. "350°F", "165 degrees", "200C". */
const TEMPERATURE = /\d+\s*(?:°|℉|℃|degrees?\b|deg\b|°?\s*[fc]\b)/i;
/** A duration fragment, e.g. "20 min", "2 hours", "30 seconds", "5m". */
const DURATION =
  /\d+\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|[smh])\b/i;

/** Trailing "glue" words a truncated label must not end on. */
const CONNECTIVES = new Set([
  'and', 'or', 'with', 'the', 'a', 'an', 'to', 'for',
  'in', 'of', 'into', 'on', 'until', 'then',
]);

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/** True when a `to`/`for` tail carries the redundant measurement the subLabel
 *  already re-displays (a temperature or a duration). */
function isRedundantTail(tail: string): boolean {
  return TEMPERATURE.test(tail) || DURATION.test(tail);
}

/**
 * Derive a terse display label from a full-sentence step:
 *   1. take the leading clause up to the first comma (else the whole text);
 *   2. strip a trailing "to/for <detail>" tail ONLY when that tail is a
 *      redundant measurement (temperature/duration) and at least
 *      `MIN_LABEL_WORDS` survive — so "Heat the oil to 350°F" -> "Heat the oil"
 *      but "Bring to a boil" and "Cook to 165°F" keep their tail;
 *   3. cap at ~MAX_WORDS words on a clean boundary, dropping a dangling
 *      connective so the label never ends mid-phrase on "and"/"with"/etc.
 * Falls back to the trimmed original if the heuristic empties the string.
 */
export function shortStepLabel(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const commaIndex = trimmed.indexOf(',');
  let label = (commaIndex === -1 ? trimmed : trimmed.slice(0, commaIndex)).trim();

  // Greedy head -> matches the LAST "to/for" clause, so we strip minimally.
  const tailMatch = label.match(/^(.*)(\s+(?:to|for)\s+\S.*)$/i);
  if (tailMatch) {
    const head = tailMatch[1].trim();
    const tail = tailMatch[2];
    if (isRedundantTail(tail) && words(head).length >= MIN_LABEL_WORDS) {
      label = head;
    }
  }

  let parts = words(label);
  if (parts.length > MAX_WORDS) {
    parts = parts.slice(0, MAX_WORDS);
    while (
      parts.length > MIN_LABEL_WORDS &&
      CONNECTIVES.has(parts[parts.length - 1].toLowerCase())
    ) {
      parts.pop();
    }
    label = parts.join(' ');
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
