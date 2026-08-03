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
 */

const MAX_WORDS = 6;

/**
 * Derive a terse display label from a full-sentence step:
 *   1. take the leading clause up to the first comma (else the whole text);
 *   2. strip a trailing "to/for <detail>" tail (e.g. "…to 350°F", "…for 20 min");
 *   3. cap at ~6 words as a final safety net.
 * Falls back to the trimmed original if the heuristic empties the string, so a
 * label is never blank.
 */
export function shortStepLabel(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const commaIndex = trimmed.indexOf(',');
  let label = commaIndex === -1 ? trimmed : trimmed.slice(0, commaIndex);

  // Drop a trailing purpose/target clause ("…to 350°F", "…for 20 minutes").
  label = label.replace(/\s+(?:to|for)\s+\S.*$/i, '').trim();

  const words = label.split(/\s+/);
  if (words.length > MAX_WORDS) label = words.slice(0, MAX_WORDS).join(' ');

  return label.trim() || trimmed;
}

/**
 * True when a sub-label merely restates part of the already-displayed label
 * (case-insensitive substring), so it should be suppressed to avoid the
 * "Heat the frying oil … / 350°F" double-print. Once the label is shortened a
 * genuinely additive sub-label (a temperature/time the short label no longer
 * mentions) is kept; a redundant one is dropped.
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
