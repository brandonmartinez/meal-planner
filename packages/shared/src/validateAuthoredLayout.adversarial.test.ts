/**
 * Adversarial suite for the shared authored-layout validator (Slice 2b, spec
 * §P2.5). Written by Yen (QA) against the PINNED contract *before* Livingston's
 * implementation lands — same pre-implementation pattern as Phase 1.
 *
 * Pinned contract (do not deviate):
 *   validateAuthoredLayout(ingredients, instructions)
 *     : { ok: true } | { ok: false; code: string; message: string }
 *   exported from `@meal-planner/shared` (this package).
 *
 * The seven invariants under test (task framing):
 *   1. Range        — 0 ≤ spanFrom ≤ spanTo ≤ ingredients.length − 1.
 *   2. Pairing      — spanFrom/spanTo both-null or both-non-null.
 *   3. All-or-nothing — if ANY instruction carries a span, EVERY PROCESS must
 *                       carry one; SETUP/FINISH null spans must NOT trip this.
 *   4. Per-column non-overlap — same column ⇒ disjoint ranges.
 *   5. Cross-column overlap is REQUIRED and MUST be accepted (the cascade).
 *   6. Coverage gaps are ALLOWED (uncovered garnish row is legal).
 *   7. column — non-negative int; sparse columns legal.
 *
 * Assertion philosophy (per the spawn brief):
 *   - Do NOT hardcode `code` string values — Livingston names them, guessing
 *     creates false failures. Assert behaviourally: ok === false, code is a
 *     non-empty string, message is a non-empty string, and — critically — that
 *     SEMANTICALLY DIFFERENT violations yield DIFFERENT codes (catches the real
 *     risk of collapsing every failure onto one useless generic code).
 *   - Fixtures are adversarial, not flattering. In Phase 1, twice a self-authored
 *     fixture masked a real defect; these are built to expose, not to pass.
 */
import { describe, it, expect } from "vitest";
import { validateAuthoredLayout } from "./validateAuthoredLayout.js";

/* -------------------------------------------------------------------------- */
/* Decouple from Livingston's exact parameter type NAMES: derive the element   */
/* shapes straight from the function signature. Factories build a superset of   */
/* every plausible field and cast, so we neither collide with his naming nor    */
/* break if his input type omits/renames a field. The validator only reads what */
/* it reads at runtime.                                                         */
/* -------------------------------------------------------------------------- */
type Ingredients = Parameters<typeof validateAuthoredLayout>[0];
type Instructions = Parameters<typeof validateAuthoredLayout>[1];
type Instruction = Instructions extends readonly (infer T)[] ? T : never;

type Kind = "SETUP" | "PROCESS" | "FINISH";

interface StepOverrides {
  kind?: Kind;
  subLabel?: string | null;
  spanFrom?: number | null;
  spanTo?: number | null;
  column?: number | null;
}

/** Build `n` ingredient rows in identity `position` order (0..n-1). */
function ings(n: number): Ingredients {
  const rows = Array.from({ length: n }, (_, position) => ({
    position,
    name: `ing${position}`,
    category: null,
    groupLabel: null,
  }));
  return rows as unknown as Ingredients;
}

/** Build one instruction with sensible defaults for every field the validator
 *  might inspect. Defaults: PROCESS, null span, column 0. */
function step(position: number, overrides: StepOverrides = {}): Instruction {
  const {
    kind = "PROCESS",
    subLabel = null,
    spanFrom = null,
    spanTo = null,
    column = 0,
  } = overrides;
  return {
    position,
    text: `step ${position}`,
    kind,
    subLabel,
    spanFrom,
    spanTo,
    column,
  } as unknown as Instruction;
}

function steps(...items: Instruction[]): Instructions {
  return items as unknown as Instructions;
}

/* -------------------------------------------------------------------------- */
/* Behavioural assertion helpers — never couples to a specific code string.     */
/* -------------------------------------------------------------------------- */
type Result = ReturnType<typeof validateAuthoredLayout>;

function expectOk(result: Result): void {
  expect(result.ok).toBe(true);
  // A pass must not smuggle a code/message.
  expect((result as { code?: unknown }).code).toBeUndefined();
}

/** Assert a rejection and return its (non-empty) code for cross-case comparison. */
function expectReject(result: Result): string {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected rejection but validator returned ok: true");
  }
  expect(typeof result.code).toBe("string");
  expect(result.code.length).toBeGreaterThan(0);
  expect(typeof result.message).toBe("string");
  expect(result.message.length).toBeGreaterThan(0);
  return result.code;
}

/* ========================================================================== */
/* Invariant 5 — CROSS-COLUMN OVERLAP IS REQUIRED (highest-value assertion).    */
/* The natural implementation instinct is a GLOBAL overlap check, which         */
/* silently breaks every cascade and would reject every valid authored recipe.  */
/* ========================================================================== */
describe("validateAuthoredLayout — invariant 5: cross-column overlap MUST be accepted (the cascade)", () => {
  it("accepts column 1 spanning rows already covered by column 0 (the canonical cascade)", () => {
    // 5 ingredients. col0 combines rows 0..2; col1 folds that result together
    // with rows 3..4 — col1 span [0,4] fully OVERLAPS col0 span [0,2].
    const result = validateAuthoredLayout(
      ings(5),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 2 }),
        step(1, { column: 1, spanFrom: 0, spanTo: 4 }),
      ),
    );
    expectOk(result);
  });

  it("accepts a three-column cascade where each later column re-spans earlier rows", () => {
    const result = validateAuthoredLayout(
      ings(6),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 1 }),
        step(1, { column: 1, spanFrom: 0, spanTo: 3 }),
        step(2, { column: 2, spanFrom: 0, spanTo: 5 }),
      ),
    );
    expectOk(result);
  });

  it("accepts IDENTICAL ranges when they live in different columns", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { column: 0, spanFrom: 1, spanTo: 3 }),
        step(1, { column: 1, spanFrom: 1, spanTo: 3 }),
      ),
    );
    expectOk(result);
  });

  it("accepts partial cross-column overlap (col1 [1,3] overlaps col0 [0,2] on rows 1..2)", () => {
    const result = validateAuthoredLayout(
      ings(5),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 2 }),
        step(1, { column: 1, spanFrom: 1, spanTo: 3 }),
      ),
    );
    expectOk(result);
  });

  it("accepts many same-row single-cell spans stacked across distinct columns", () => {
    // Every column touches row 0 — a pure global check would reject this.
    const result = validateAuthoredLayout(
      ings(3),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 0 }),
        step(1, { column: 1, spanFrom: 0, spanTo: 0 }),
        step(2, { column: 2, spanFrom: 0, spanTo: 0 }),
      ),
    );
    expectOk(result);
  });
});

/* ========================================================================== */
/* Invariant 3 — ALL-OR-NOTHING (second highest risk).                          */
/* SETUP/FINISH null spans must NOT trip it; a partial PROCESS set MUST reject.  */
/* ========================================================================== */
describe("validateAuthoredLayout — invariant 3: authoring is all-or-nothing per meal", () => {
  it("rejects a partially-authored PROCESS set (one PROCESS spanned, one not)", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { kind: "PROCESS", spanFrom: 0, spanTo: 1 }),
        step(1, { kind: "PROCESS", spanFrom: null, spanTo: null }),
      ),
    );
    expectReject(result);
  });

  it("does NOT trip when SETUP and FINISH carry null spans alongside spanned PROCESS steps", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(
        step(0, { kind: "SETUP", spanFrom: null, spanTo: null, column: 0 }),
        step(1, { kind: "PROCESS", spanFrom: 0, spanTo: 2, column: 0 }),
        step(2, { kind: "FINISH", spanFrom: null, spanTo: null, column: 0 }),
      ),
    );
    expectOk(result);
  });

  it("accepts a fully-derived meal where NO instruction carries a span", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(
        step(0, { kind: "PROCESS", spanFrom: null, spanTo: null }),
        step(1, { kind: "PROCESS", spanFrom: null, spanTo: null }),
      ),
    );
    expectOk(result);
  });

  it("accepts an authored meal where EVERY PROCESS step carries a span", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { kind: "PROCESS", spanFrom: 0, spanTo: 1, column: 0 }),
        step(1, { kind: "PROCESS", spanFrom: 2, spanTo: 3, column: 0 }),
      ),
    );
    expectOk(result);
  });

  it("rejects when a SETUP band carries a span but a PROCESS step is left un-spanned", () => {
    // The trigger 'any instruction carries a span' is satisfied; the un-spanned
    // PROCESS then makes the authored set ambiguous.
    const result = validateAuthoredLayout(
      ings(3),
      steps(
        step(0, { kind: "SETUP", spanFrom: 0, spanTo: 0, column: 0 }),
        step(1, { kind: "PROCESS", spanFrom: null, spanTo: null, column: 0 }),
      ),
    );
    expectReject(result);
  });

  it("rejects the last PROCESS missing a span among several spanned PROCESS steps", () => {
    const result = validateAuthoredLayout(
      ings(6),
      steps(
        step(0, { kind: "PROCESS", spanFrom: 0, spanTo: 1, column: 0 }),
        step(1, { kind: "PROCESS", spanFrom: 2, spanTo: 3, column: 0 }),
        step(2, { kind: "PROCESS", spanFrom: null, spanTo: null, column: 0 }),
      ),
    );
    expectReject(result);
  });
});

/* ========================================================================== */
/* Invariant 2 — PAIRING (spanFrom/spanTo both-null or both-non-null).          */
/* ========================================================================== */
describe("validateAuthoredLayout — invariant 2: span pairing", () => {
  it("rejects spanFrom set with spanTo null (one-sided low)", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: 1, spanTo: null })),
    );
    expectReject(result);
  });

  it("rejects spanTo set with spanFrom null (one-sided high)", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: null, spanTo: 1 })),
    );
    expectReject(result);
  });

  it("accepts both-null (no authored span on this step)", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: null, spanTo: null })),
    );
    expectOk(result);
  });

  it("accepts both-non-null within range", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: 0, spanTo: 2 })),
    );
    expectOk(result);
  });

  it("rejects one-sided span even when the present index is otherwise in range", () => {
    const result = validateAuthoredLayout(
      ings(5),
      steps(step(0, { spanFrom: 2, spanTo: null })),
    );
    expectReject(result);
  });
});

/* ========================================================================== */
/* Invariant 1 — RANGE (0 ≤ spanFrom ≤ spanTo ≤ length − 1) + boundaries.        */
/* ========================================================================== */
describe("validateAuthoredLayout — invariant 1: range & boundary conditions", () => {
  it("rejects a negative spanFrom", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: -1, spanTo: 1 })),
    );
    expectReject(result);
  });

  it("rejects spanTo greater than length − 1 (one past the last valid index)", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: 0, spanTo: 3 })),
    );
    expectReject(result);
  });

  it("rejects an inverted range (spanFrom > spanTo)", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(step(0, { spanFrom: 2, spanTo: 1 })),
    );
    expectReject(result);
  });

  it("accepts a span whose spanTo touches the last valid index (length − 1)", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: 0, spanTo: 2 })),
    );
    expectOk(result);
  });

  it("rejects a span exactly one past the last valid index", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: 0, spanTo: 3 })),
    );
    expectReject(result);
  });

  it("accepts a single-row span where spanFrom === spanTo", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { spanFrom: 1, spanTo: 1 })),
    );
    expectOk(result);
  });

  it("accepts spanFrom === spanTo === 0 on a single-ingredient meal", () => {
    const result = validateAuthoredLayout(
      ings(1),
      steps(step(0, { spanFrom: 0, spanTo: 0 })),
    );
    expectOk(result);
  });

  it("rejects any span on an empty ingredient list (length − 1 = −1, nothing is in range)", () => {
    const result = validateAuthoredLayout(
      ings(0),
      steps(step(0, { spanFrom: 0, spanTo: 0 })),
    );
    expectReject(result);
  });

  it("accepts an empty ingredient list when no instruction carries a span", () => {
    const result = validateAuthoredLayout(
      ings(0),
      steps(step(0, { spanFrom: null, spanTo: null })),
    );
    expectOk(result);
  });

  it("rejects a single-ingredient meal whose span reaches index 1 (one past)", () => {
    const result = validateAuthoredLayout(
      ings(1),
      steps(step(0, { spanFrom: 0, spanTo: 1 })),
    );
    expectReject(result);
  });

  it("accepts a full-width span covering every row (0 .. length − 1)", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(step(0, { spanFrom: 0, spanTo: 3 })),
    );
    expectOk(result);
  });
});

/* ========================================================================== */
/* Invariant 4 — PER-COLUMN NON-OVERLAP (same column ⇒ disjoint ranges).        */
/* ========================================================================== */
describe("validateAuthoredLayout — invariant 4: per-column non-overlap", () => {
  it("rejects two overlapping ranges in the SAME column", () => {
    const result = validateAuthoredLayout(
      ings(5),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 2 }),
        step(1, { column: 0, spanFrom: 2, spanTo: 4 }),
      ),
    );
    expectReject(result);
  });

  it("rejects two IDENTICAL ranges in the same column", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { column: 0, spanFrom: 1, spanTo: 3 }),
        step(1, { column: 0, spanFrom: 1, spanTo: 3 }),
      ),
    );
    expectReject(result);
  });

  it("accepts adjacent-but-not-overlapping ranges in the same column ([0,1] then [2,3])", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 1 }),
        step(1, { column: 0, spanFrom: 2, spanTo: 3 }),
      ),
    );
    expectOk(result);
  });

  it("accepts same-column ranges separated by a gap ([0,1] then [4,5])", () => {
    const result = validateAuthoredLayout(
      ings(6),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 1 }),
        step(1, { column: 0, spanFrom: 4, spanTo: 5 }),
      ),
    );
    expectOk(result);
  });

  it("rejects same-column overlap of just a single shared row (touching endpoints)", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 1 }),
        step(1, { column: 0, spanFrom: 1, spanTo: 2 }),
      ),
    );
    expectReject(result);
  });

  it("rejects a same-column range fully nested inside another", () => {
    const result = validateAuthoredLayout(
      ings(6),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 5 }),
        step(1, { column: 0, spanFrom: 2, spanTo: 3 }),
      ),
    );
    expectReject(result);
  });

  it("accepts three disjoint tiling segments in one column ([0,0],[1,2],[3,4])", () => {
    const result = validateAuthoredLayout(
      ings(5),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 0 }),
        step(1, { column: 0, spanFrom: 1, spanTo: 2 }),
        step(2, { column: 0, spanFrom: 3, spanTo: 4 }),
      ),
    );
    expectOk(result);
  });
});

/* ========================================================================== */
/* Invariant 6 — COVERAGE GAPS ARE ALLOWED.                                     */
/* ========================================================================== */
describe("validateAuthoredLayout — invariant 6: coverage gaps are allowed", () => {
  it("accepts an authored meal that leaves a trailing garnish row uncovered", () => {
    // 4 ingredients, spans only cover rows 0..2 — row 3 (garnish) is an
    // intentional gap and must NOT reject.
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 1 }),
        step(1, { column: 0, spanFrom: 2, spanTo: 2 }),
      ),
    );
    expectOk(result);
  });

  it("accepts a gap in the MIDDLE of the covered rows (rows 0 and 3 covered, 1..2 bare)", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 0 }),
        step(1, { column: 0, spanFrom: 3, spanTo: 3 }),
      ),
    );
    expectOk(result);
  });

  it("accepts an authored meal where a leading row is uncovered", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(step(0, { column: 0, spanFrom: 1, spanTo: 3 })),
    );
    expectOk(result);
  });
});

/* ========================================================================== */
/* Invariant 7 — column non-negative int; sparse columns legal.                 */
/* ========================================================================== */
describe("validateAuthoredLayout — invariant 7: column sanity", () => {
  it("rejects a negative column on a spanned PROCESS step", () => {
    const result = validateAuthoredLayout(
      ings(3),
      steps(step(0, { column: -1, spanFrom: 0, spanTo: 1 })),
    );
    expectReject(result);
  });

  it("accepts sparse (non-contiguous) column indices — densification is the editor's job", () => {
    const result = validateAuthoredLayout(
      ings(4),
      steps(
        step(0, { column: 0, spanFrom: 0, spanTo: 1 }),
        step(1, { column: 5, spanFrom: 0, spanTo: 3 }),
      ),
    );
    expectOk(result);
  });

  it("accepts column 0 as a valid non-negative index", () => {
    const result = validateAuthoredLayout(
      ings(2),
      steps(step(0, { column: 0, spanFrom: 0, spanTo: 1 })),
    );
    expectOk(result);
  });
});

/* ========================================================================== */
/* CODE DISTINCTNESS — the real risk is collapsing every failure onto one       */
/* generic code, which makes API error messages useless. Assert that            */
/* semantically different violation categories yield DIFFERENT codes. We do NOT  */
/* assert any specific string value.                                            */
/* ========================================================================== */
describe("validateAuthoredLayout — distinct codes for distinct violation classes", () => {
  it("emits a distinct code for each of five semantically different violations", () => {
    const rangeCode = expectReject(
      validateAuthoredLayout(ings(3), steps(step(0, { spanFrom: 0, spanTo: 9 }))),
    );
    const pairingCode = expectReject(
      validateAuthoredLayout(ings(3), steps(step(0, { spanFrom: 1, spanTo: null }))),
    );
    const allOrNothingCode = expectReject(
      validateAuthoredLayout(
        ings(4),
        steps(
          step(0, { kind: "PROCESS", spanFrom: 0, spanTo: 1 }),
          step(1, { kind: "PROCESS", spanFrom: null, spanTo: null }),
        ),
      ),
    );
    const overlapCode = expectReject(
      validateAuthoredLayout(
        ings(5),
        steps(
          step(0, { column: 0, spanFrom: 0, spanTo: 2 }),
          step(1, { column: 0, spanFrom: 2, spanTo: 4 }),
        ),
      ),
    );
    const columnCode = expectReject(
      validateAuthoredLayout(
        ings(3),
        steps(step(0, { column: -1, spanFrom: 0, spanTo: 1 })),
      ),
    );

    const codes = [
      rangeCode,
      pairingCode,
      allOrNothingCode,
      overlapCode,
      columnCode,
    ];
    // Every violation class must be individually addressable — no collapsing.
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("keeps range and pairing violations under different codes (both are span-shape errors)", () => {
    const rangeCode = expectReject(
      validateAuthoredLayout(ings(3), steps(step(0, { spanFrom: 0, spanTo: 9 }))),
    );
    const pairingCode = expectReject(
      validateAuthoredLayout(ings(3), steps(step(0, { spanFrom: null, spanTo: 2 }))),
    );
    expect(rangeCode).not.toBe(pairingCode);
  });

  it("keeps same-column overlap and all-or-nothing under different codes", () => {
    const overlapCode = expectReject(
      validateAuthoredLayout(
        ings(4),
        steps(
          step(0, { column: 0, spanFrom: 0, spanTo: 2 }),
          step(1, { column: 0, spanFrom: 1, spanTo: 3 }),
        ),
      ),
    );
    const allOrNothingCode = expectReject(
      validateAuthoredLayout(
        ings(4),
        steps(
          step(0, { kind: "PROCESS", spanFrom: 0, spanTo: 1 }),
          step(1, { kind: "PROCESS", spanFrom: null, spanTo: null }),
        ),
      ),
    );
    expect(overlapCode).not.toBe(allOrNothingCode);
  });
});
