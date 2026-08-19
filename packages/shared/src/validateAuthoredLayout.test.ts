import { describe, it, expect } from "vitest";
import {
  validateAuthoredLayout,
  AUTHORED_LAYOUT_CODES,
} from "./validateAuthoredLayout.js";
import type {
  AuthoredLayoutIngredientInput,
  AuthoredLayoutInstructionInput,
} from "./validateAuthoredLayout.js";

/** n ungrouped ingredient rows — only the count matters to the validator. */
function ings(n: number): AuthoredLayoutIngredientInput[] {
  return Array.from({ length: n }, () => ({ groupLabel: null }));
}

function step(
  overrides: Partial<AuthoredLayoutInstructionInput> = {},
): AuthoredLayoutInstructionInput {
  return {
    kind: "PROCESS",
    column: null,
    spanFrom: null,
    spanTo: null,
    ...overrides,
  };
}

describe("validateAuthoredLayout", () => {
  describe("derived / non-authored writes (all spans null)", () => {
    it("accepts a meal with no spans at all (the common, derived case)", () => {
      const result = validateAuthoredLayout(ings(4), [
        step(),
        step(),
        step(),
      ]);
      expect(result).toEqual({ ok: true });
    });

    // Load-bearing: omit ⇒ null ⇒ derived. A normal save that never mentions
    // spans must pass validation AND stay non-authored — the validator must not
    // invent a span or reject an unauthored meal.
    it("proves omit ⇒ stays derived: no span fields anywhere is valid", () => {
      const instructions: AuthoredLayoutInstructionInput[] = [
        { text: "Chop" } as unknown as AuthoredLayoutInstructionInput,
        { text: "Mix" } as unknown as AuthoredLayoutInstructionInput,
      ];
      const result = validateAuthoredLayout(ings(3), instructions);
      expect(result).toEqual({ ok: true });
      // No instruction carries a span → the meal would read as `derived`.
      expect(instructions.every((i) => i.spanFrom == null)).toBe(true);
    });

    it("accepts an empty meal (no ingredients, no instructions)", () => {
      expect(validateAuthoredLayout([], [])).toEqual({ ok: true });
    });
  });

  describe("invariant 1 — range", () => {
    it("accepts a full-coverage authored meal", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ spanFrom: 0, spanTo: 1 }),
        step({ spanFrom: 2, spanTo: 2 }),
      ]);
      expect(result).toEqual({ ok: true });
    });

    it("rejects spanTo beyond the last ingredient index", () => {
      const result = validateAuthoredLayout(ings(2), [
        step({ spanFrom: 0, spanTo: 2 }),
      ]);
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        code: AUTHORED_LAYOUT_CODES.SPAN_OUT_OF_RANGE,
      });
    });

    it("rejects a negative spanFrom", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ spanFrom: -1, spanTo: 1 }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_OUT_OF_RANGE,
      });
    });

    it("rejects spanFrom > spanTo (inverted span)", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ spanFrom: 2, spanTo: 1 }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_OUT_OF_RANGE,
      });
    });

    it("rejects a non-integer span endpoint", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ spanFrom: 0, spanTo: 1.5 }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_OUT_OF_RANGE,
      });
    });
  });

  describe("invariant 2 — pairing", () => {
    it("rejects a span with spanFrom set but spanTo null", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ spanFrom: 0, spanTo: null }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_PAIR_INCOMPLETE,
      });
    });

    it("rejects a span with spanTo set but spanFrom null", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ spanFrom: null, spanTo: 2 }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_PAIR_INCOMPLETE,
      });
    });
  });

  describe("invariant 3 — all-or-nothing per meal", () => {
    it("rejects a partially-authored PROCESS set", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ spanFrom: 0, spanTo: 1 }),
        step({ spanFrom: null, spanTo: null }), // PROCESS without a span
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_PROCESS_INCOMPLETE,
      });
    });

    it("allows SETUP / FINISH steps to carry null spans on an authored meal", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ kind: "SETUP", spanFrom: null, spanTo: null }),
        step({ kind: "PROCESS", spanFrom: 0, spanTo: 1 }),
        step({ kind: "PROCESS", spanFrom: 2, spanTo: 2 }),
        step({ kind: "FINISH", spanFrom: null, spanTo: null }),
      ]);
      expect(result).toEqual({ ok: true });
    });

    it("treats a missing kind as PROCESS for the all-or-nothing rule", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ kind: null, spanFrom: 0, spanTo: 1 }),
        step({ kind: null, spanFrom: null, spanTo: null }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_PROCESS_INCOMPLETE,
      });
    });
  });

  describe("invariant 4 — per-column non-overlap / the cascade", () => {
    it("rejects two overlapping spans in the SAME column", () => {
      const result = validateAuthoredLayout(ings(4), [
        step({ column: 0, spanFrom: 0, spanTo: 2 }),
        step({ column: 0, spanFrom: 1, spanTo: 3 }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_COLUMN_OVERLAP,
      });
    });

    it("treats null columns as one shared lane (column 0) for overlap", () => {
      const result = validateAuthoredLayout(ings(4), [
        step({ column: null, spanFrom: 0, spanTo: 2 }),
        step({ column: null, spanFrom: 2, spanTo: 3 }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.SPAN_COLUMN_OVERLAP,
      });
    });

    // The crux: cross-column overlap is REQUIRED — column N+1 re-spans rows that
    // column N already covered. This must be accepted, never flagged.
    it("ACCEPTS cross-column overlap (the cascade)", () => {
      const result = validateAuthoredLayout(ings(4), [
        step({ column: 0, spanFrom: 0, spanTo: 1 }),
        step({ column: 0, spanFrom: 2, spanTo: 3 }),
        step({ column: 1, spanFrom: 0, spanTo: 3 }), // spans everything col 0 did
      ]);
      expect(result).toEqual({ ok: true });
    });

    it("accepts disjoint, adjacent spans in the same column (tiling)", () => {
      const result = validateAuthoredLayout(ings(4), [
        step({ column: 0, spanFrom: 0, spanTo: 1 }),
        step({ column: 0, spanFrom: 2, spanTo: 3 }),
      ]);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("invariant 5 — coverage gaps are allowed", () => {
    it("accepts an authored meal that leaves ingredient rows uncovered", () => {
      // Row 3 (a garnish) is never combined — a valid gap cell, not an error.
      const result = validateAuthoredLayout(ings(4), [
        step({ spanFrom: 0, spanTo: 1 }),
        step({ spanFrom: 2, spanTo: 2 }),
      ]);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("invariant 6 — column sanity", () => {
    it("rejects a negative column", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ column: -1, spanFrom: 0, spanTo: 1 }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.COLUMN_INVALID,
      });
    });

    it("rejects a non-integer column", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ column: 1.5, spanFrom: 0, spanTo: 1 }),
      ]);
      expect(result).toMatchObject({
        ok: false,
        code: AUTHORED_LAYOUT_CODES.COLUMN_INVALID,
      });
    });

    it("accepts a sparse (non-dense) column index", () => {
      const result = validateAuthoredLayout(ings(3), [
        step({ column: 5, spanFrom: 0, spanTo: 2 }),
      ]);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("distinct codes", () => {
    it("uses five distinct code strings", () => {
      const codes = Object.values(AUTHORED_LAYOUT_CODES);
      expect(new Set(codes).size).toBe(codes.length);
      expect(codes.length).toBe(5);
    });
  });
});
