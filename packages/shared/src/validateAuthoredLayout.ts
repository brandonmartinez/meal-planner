/**
 * `validateAuthoredLayout` — the single source of truth for the CROSS-FIELD
 * invariants of an authored tabular ("Grid") recipe layout (spec P2.5). Pure: no
 * Prisma, no I/O, fully unit-testable. Called from BOTH the REST route
 * (`routes/meals.ts`) and the agent route (`routes/agent.ts`) after each Zod
 * parse, and defensively in `services/meals.ts` — so REST and the agent surface
 * enforce byte-identical rules and MCP (which writes through the API) inherits
 * the same enforcement for free.
 *
 * WHY SHARED, NOT A DUPLICATED ROUTE-LEVEL `superRefine`: per-object Zod cannot
 * express constraints that reference `ingredients.length` or that relate
 * multiple instructions to each other. Two hand-maintained copies of a numeric
 * refinement is exactly the drift surface parity exists to prevent (#96).
 *
 * RUNS ON EVERY WRITE — authored or not. Meal writes are replace-all for both
 * `ingredients[]` and `instructions[]`, so a caller can desync them (e.g. shrink
 * the ingredient list while leaving authored spans that now dangle). The rules
 * below are therefore checked against the *resulting* (ingredients, instructions)
 * pair, never against the delta.
 *
 * ANTI-STALENESS: this validator never persists or derives anything. Provenance
 * stays structural (`matrixSource` = any `spanFrom != null`). It only ACCEPTS or
 * REJECTS a proposed write; the derived matrix is still recomputed on every read
 * by `deriveRecipeMatrix`.
 *
 * Each distinct invariant returns its own STABLE `code` so callers (and the
 * adversarial suite) can tell violations apart. On the first violation found the
 * function returns immediately — the whole write is rejected and nothing is
 * applied (belt-and-suspenders with the editor's pre-submit clamp).
 */

import type { InstructionKind } from "./constants/index.js";

/** The ingredient fields the layout validator inspects. Only the row COUNT is
 *  load-bearing for span range checks; `groupLabel` length is a per-object Zod
 *  concern, not a cross-field one. Extra fields on the caller's objects are
 *  ignored, so the persisted/DTO ingredient shapes can be passed directly. */
export interface AuthoredLayoutIngredientInput {
  groupLabel?: string | null;
}

/** The instruction fields the layout validator inspects. `kind` defaults to
 *  `PROCESS` when omitted (mirrors the schema default). `column` groups spans
 *  into process lanes; `spanFrom`/`spanTo` are inclusive 0-based indices into
 *  the ingredient row order. All optional/nullable: omitted ⇒ null ⇒ derived. */
export interface AuthoredLayoutInstructionInput {
  kind?: InstructionKind | null;
  column?: number | null;
  spanFrom?: number | null;
  spanTo?: number | null;
}

/**
 * Distinct, STABLE codes — one per invariant. Callers assert on these; do not
 * collapse two invariants onto one code, and do not rename an existing one
 * (the agent surface and the adversarial suite pin them).
 */
export const AUTHORED_LAYOUT_CODES = {
  /** Invariant 2 — a span is one-sided (exactly one of spanFrom/spanTo null). */
  SPAN_PAIR_INCOMPLETE: "SPAN_PAIR_INCOMPLETE",
  /** Invariant 1 — a span is not `0 ≤ spanFrom ≤ spanTo ≤ ingredients.length-1`
   *  (also covers non-integer / negative span endpoints). */
  SPAN_OUT_OF_RANGE: "SPAN_OUT_OF_RANGE",
  /** Invariant 3 — the meal is authored (some instruction has a span) but a
   *  `PROCESS` step is missing one. All-or-nothing across PROCESS steps. */
  SPAN_PROCESS_INCOMPLETE: "SPAN_PROCESS_INCOMPLETE",
  /** Invariant 4 — two spans in the SAME column have overlapping ranges.
   *  Cross-column overlap is REQUIRED (the cascade) and never flagged. */
  SPAN_COLUMN_OVERLAP: "SPAN_COLUMN_OVERLAP",
  /** Invariant 6 — `column` is present but not a non-negative integer. */
  COLUMN_INVALID: "COLUMN_INVALID",
} as const;

export type AuthoredLayoutCode =
  (typeof AUTHORED_LAYOUT_CODES)[keyof typeof AUTHORED_LAYOUT_CODES];

/** Result of {@link validateAuthoredLayout}: `ok` or a single distinct
 *  violation. Only the first violation encountered is reported — the entire
 *  write is rejected regardless, so there is no value in accumulating more. */
export type AuthoredLayoutResult =
  | { ok: true }
  | { ok: false; code: AuthoredLayoutCode; message: string };

function isNonNegativeInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

/**
 * Validate the cross-field invariants of a proposed authored layout (spec P2.5).
 *
 * Invariants enforced (each with its own {@link AUTHORED_LAYOUT_CODES} code):
 *  1. **Range.** For every span, `0 ≤ spanFrom ≤ spanTo ≤ ingredients.length-1`.
 *  2. **Pairing.** `spanFrom`/`spanTo` are both-null or both-non-null.
 *  3. **All-or-nothing per meal.** If ANY instruction carries a span, EVERY
 *     `PROCESS` instruction must carry one. `SETUP`/`FINISH` may carry null.
 *  4. **Per-column non-overlap.** Same `column` ⇒ disjoint ranges. Cross-column
 *     overlap is the intended cascade and is always allowed.
 *  6. **`column` sanity.** When present, `column` is a non-negative integer.
 *
 * NOT enforced (deliberate, per spec):
 *  5. **Coverage gaps are allowed** — an uncovered ingredient row is a valid gap
 *     cell (garnish/uncombined), never a rejection.
 *  7. **Placeholder meals** are a meal-level guard (403), enforced by the
 *     service/route, not by this pure span validator.
 */
export function validateAuthoredLayout(
  ingredients: readonly AuthoredLayoutIngredientInput[],
  instructions: readonly AuthoredLayoutInstructionInput[],
): AuthoredLayoutResult {
  const ingredientCount = ingredients.length;

  // Does the resulting meal read as authored? (any span present anywhere)
  const anySpan = instructions.some((ins) => ins.spanFrom != null);

  // Collect the (column → spans) map as we go, for the per-column overlap pass.
  const spansByColumn = new Map<number, Array<{ from: number; to: number }>>();

  for (let i = 0; i < instructions.length; i++) {
    const ins = instructions[i];
    const hasFrom = ins.spanFrom != null;
    const hasTo = ins.spanTo != null;

    // Invariant 2 — pairing. A one-sided span is always invalid.
    if (hasFrom !== hasTo) {
      return {
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_PAIR_INCOMPLETE,
        message: `Instruction at index ${i} has a one-sided span: spanFrom and spanTo must both be set or both be null.`,
      };
    }

    // Invariant 6 — column sanity (checked whether or not this step is spanned;
    // a stray non-negative-int column is malformed input regardless).
    if (ins.column != null && !isNonNegativeInt(ins.column)) {
      return {
        ok: false,
        code: AUTHORED_LAYOUT_CODES.COLUMN_INVALID,
        message: `Instruction at index ${i} has an invalid column ${ins.column}: column must be a non-negative integer.`,
      };
    }

    if (hasFrom && hasTo) {
      const from = ins.spanFrom as number;
      const to = ins.spanTo as number;

      // Invariant 1 — range (folds in non-integer / negative endpoints).
      if (
        !isNonNegativeInt(from) ||
        !isNonNegativeInt(to) ||
        from > to ||
        to > ingredientCount - 1
      ) {
        return {
          ok: false,
          code: AUTHORED_LAYOUT_CODES.SPAN_OUT_OF_RANGE,
          message: `Instruction at index ${i} has span [${from}, ${to}] outside the valid range [0, ${ingredientCount - 1}] for ${ingredientCount} ingredient(s).`,
        };
      }

      // A null/omitted column on an authored write means the default single
      // lane (column 0), matching the schema/derivation default.
      const column = ins.column ?? 0;
      const bucket = spansByColumn.get(column);
      if (bucket) bucket.push({ from, to });
      else spansByColumn.set(column, [{ from, to }]);
    }
  }

  // Invariant 3 — authoring is all-or-nothing across PROCESS steps.
  if (anySpan) {
    for (let i = 0; i < instructions.length; i++) {
      const ins = instructions[i];
      const kind = ins.kind ?? "PROCESS";
      if (kind === "PROCESS" && ins.spanFrom == null) {
        return {
          ok: false,
          code: AUTHORED_LAYOUT_CODES.SPAN_PROCESS_INCOMPLETE,
          message: `Meal is authored (some steps carry spans) but the PROCESS instruction at index ${i} has no span. Every PROCESS step must carry a span, or none may.`,
        };
      }
    }
  }

  // Invariant 4 — per-column non-overlap. Sort each column's spans by start and
  // reject any pair whose ranges intersect. Overlap ACROSS columns is the
  // cascade and is intentionally never inspected here.
  for (const [column, spans] of spansByColumn) {
    const sorted = [...spans].sort((a, b) => a.from - b.from);
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k].from <= sorted[k - 1].to) {
        return {
          ok: false,
          code: AUTHORED_LAYOUT_CODES.SPAN_COLUMN_OVERLAP,
          message: `Column ${column} has overlapping spans [${sorted[k - 1].from}, ${sorted[k - 1].to}] and [${sorted[k].from}, ${sorted[k].to}]. Spans in the same column must be disjoint (cross-column overlap is allowed).`,
        };
      }
    }
  }

  return { ok: true };
}
