import { describe, it, expect } from "vitest";
import { deriveRecipeMatrix } from "./deriveRecipeMatrix.js";
import type {
  TabularRecipeIngredientInput,
  TabularRecipeInstructionInput,
} from "./types/tabularRecipe.js";

/**
 * REAL-DATA CHARACTERIZATION (Yen, 2026-08-03, end-to-end pass against Brandon's
 * live dev DB: 74 meals / 365 ingredients / 61 instructions, all `derived`).
 *
 * These fixtures are trimmed copies of ACTUAL meals in that database. They pin
 * how derived Grid ordering behaves on real, shopping-ordered ingredient lists:
 *
 *   1. USE-ORDERING (`ingredientDisplayOrder`). Ingredients are stored in
 *      SHOPPING order, but Chu's Grid needs USE order. The derivation sorts rows
 *      by first-use step (ties by position) and parks never-named rows at the
 *      end. Measured before this change: 26 of 61 PROCESS steps (43%) over-
 *      bracketed and 15 of 16 instruction-bearing meals showed a sweep, because
 *      min..max spanned everything between non-adjacent co-used rows. Use-ordering
 *      pulls unrelated rows out from between co-used ones (e.g. Birria's braise no
 *      longer brackets corn tortillas / oaxaca cheese).
 *
 *   2. The RESIDUAL is intrinsic, not a bug. A rowspan table renders a tree while
 *      genuine ingredient reuse is a DAG: a row first-used early but reused by a
 *      later step still falls inside that later step's min..max. Only Phase-2
 *      authored spans close it. These tests pin the win AND the residual so a
 *      regression in either direction is caught.
 *
 *   3. The CLEAN case (already in use order) is unaffected — spans stay exact.
 */

function ing(
  position: number,
  name: string,
  category: string | null = null,
): TabularRecipeIngredientInput {
  return { position, name, category, groupLabel: null };
}

function step(position: number, text: string): TabularRecipeInstructionInput {
  return { position, text, kind: "PROCESS", subLabel: null, spanFrom: null, spanTo: null };
}

/** Indices inside a derived span that the step text does NOT name. */
function sweptInRows(
  span: { spanFrom: number | null; spanTo: number | null },
  namedRows: number[],
): number[] {
  if (span.spanFrom == null || span.spanTo == null) return [];
  const named = new Set(namedRows);
  const out: number[] = [];
  for (let r = span.spanFrom; r <= span.spanTo; r++) if (!named.has(r)) out.push(r);
  return out;
}

describe("deriveRecipeMatrix — real-data over-bracketing (Birria Tacos)", () => {
  // Verbatim ingredient order + step text from the live DB.
  const ingredients = [
    ing(0, "beef chuck roast", "meat"),
    ing(1, "dried guajillo chiles", "pantry"),
    ing(2, "dried ancho chiles", "pantry"),
    ing(3, "white onion", "produce"),
    ing(4, "corn tortillas", "pantry"),
    ing(5, "oaxaca cheese", "dairy"),
    ing(6, "beef broth", "pantry"),
    ing(7, "cilantro", "produce"),
  ];
  const instructions = [
    step(0, "Toast and rehydrate the chiles, then blend with onion."),
    step(1, "Braise the beef in the chile sauce and broth until shreddable."),
    step(2, "Shred the beef and skim the consommé fat."),
    step(3, "Dip tortillas in fat, fill with beef and cheese, crisp on a griddle."),
  ];

  it("is derived (no authored spans in the real library) with all-null group labels", () => {
    const m = deriveRecipeMatrix(ingredients, instructions);
    expect(m.matrixSource).toBe("derived");
    // grocery-aisle categories never become recipe-section pills.
    expect(m.ingredients.every((i) => i.groupLabel === null)).toBe(true);
  });

  it("use-ordering pulls corn tortillas & oaxaca cheese OUT of the braise bracket", () => {
    const m = deriveRecipeMatrix(ingredients, instructions);

    // First-use permutation: step0 uses chiles+onion, step1 adds beef+broth,
    // step3 adds tortillas+cheese; cilantro (named by nothing) is parked last.
    expect(m.ingredientDisplayOrder).toEqual([1, 2, 3, 0, 6, 4, 5, 7]);

    const braise = m.instructions[1];
    expect(braise.kind).toBe("PROCESS");
    // Spans index into ingredientDisplayOrder. Braise matches beef(0), the two
    // chiles(1,2) and broth(6) → display rows {3,0,1,4} ⇒ 0..4.
    expect(braise.spanFrom).toBe(0);
    expect(braise.spanTo).toBe(4);

    const displayIndexOf = new Map(
      m.ingredientDisplayOrder.map((r, k) => [r, k] as const),
    );
    // corn tortillas (pos 4) and oaxaca cheese (pos 5) now sit at display rows
    // 5 and 6 — OUTSIDE the braise span. The prior 0..6 sweep is gone.
    expect(displayIndexOf.get(4)).toBeGreaterThan(braise.spanTo!);
    expect(displayIndexOf.get(5)).toBeGreaterThan(braise.spanTo!);
  });

  it("cilantro (named by no step) is parked at the END of the display order", () => {
    const m = deriveRecipeMatrix(ingredients, instructions);
    const order = m.ingredientDisplayOrder;
    expect(order[order.length - 1]).toBe(7); // cilantro @ position 7
  });

  it("residual cross-step reuse still over-brackets onion (intrinsic, not a bug)", () => {
    const m = deriveRecipeMatrix(ingredients, instructions);
    const braise = m.instructions[1];
    const displayIndexOf = new Map(
      m.ingredientDisplayOrder.map((r, k) => [r, k] as const),
    );
    // white onion (pos 3) is first-used in step0 with the chiles, but the braise
    // reuses the chiles, so onion lands at display row 2 — inside the braise
    // span 0..4 though the braise never names it. Only authored spans close this.
    const onionDisplay = displayIndexOf.get(3)!;
    expect(onionDisplay).toBe(2);
    expect(braise.spanFrom!).toBeLessThanOrEqual(onionDisplay);
    expect(onionDisplay).toBeLessThanOrEqual(braise.spanTo!);
  });
});

describe("deriveRecipeMatrix — real-data clean case (Miso-Glazed Cod with Bok Choy)", () => {
  // The lone fully-clean instruction-bearing meal: ingredients happen to be
  // listed in the order they are used, so every span is exactly its named rows.
  const ingredients = [
    ing(0, "cod fillets", "seafood"),
    ing(1, "white miso", "condiments"),
    ing(2, "mirin", "condiments"),
    ing(3, "baby bok choy", "produce"),
    ing(4, "sesame oil", "pantry"),
    ing(5, "ginger", "produce"),
  ];
  const instructions = [
    step(0, "Broil the cod."),
    step(1, "Whisk miso and mirin."),
    step(2, "Stir-fry bok choy with ginger and sesame oil."),
  ];

  it("brackets each step to exactly its contiguous named rows — no sweep", () => {
    const m = deriveRecipeMatrix(ingredients, instructions);
    expect(m.matrixSource).toBe("derived");
    expect(m.instructions[0]).toMatchObject({ kind: "PROCESS", spanFrom: 0, spanTo: 0 }); // cod
    expect(m.instructions[1]).toMatchObject({ kind: "PROCESS", spanFrom: 1, spanTo: 2 }); // miso+mirin
    expect(m.instructions[2]).toMatchObject({ kind: "PROCESS", spanFrom: 3, spanTo: 5 }); // bok choy..ginger
    // No swept-in rows anywhere.
    expect(sweptInRows(m.instructions[1], [1, 2])).toEqual([]);
    expect(sweptInRows(m.instructions[2], [3, 4, 5])).toEqual([]);
  });
});

describe("deriveRecipeMatrix — real-data dominant shape (no instructions)", () => {
  // 58 of 74 real meals (78%) have ZERO instructions: the Grid is an ingredient
  // column with no process cells. Renders without error, but adds nothing over
  // the List. This pins that the derivation stays empty and non-crashing.
  it("produces zero PROCESS steps and preserves ingredient rows when a meal has no instructions", () => {
    const m = deriveRecipeMatrix(
      [ing(0, "ground beef", "meat"), ing(1, "taco seasoning", "condiments"), ing(2, "tortillas", "pantry")],
      [],
    );
    expect(m.matrixSource).toBe("derived");
    expect(m.instructions).toHaveLength(0);
    expect(m.ingredients).toHaveLength(3);
  });
});
