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
 * the two behaviours the whole "ship derived vs. wait for the Phase-2 authoring
 * editor" decision turns on, so a future change to the heuristic can't silently
 * shift them:
 *
 *   1. OVER-INCLUSIVE SPANS (the min..max sweep). A derived PROCESS step spans
 *      from its first matched ingredient to its last, so when co-used ingredients
 *      are NOT adjacent in the list the bracket sweeps in ingredients the step
 *      never names. Measured across the real library: 26 of 61 PROCESS steps
 *      (43%) over-bracket; 15 of the 16 meals that have any instructions render
 *      at least one over-inclusive span. Only recipes whose ingredient list is
 *      already in use-order (e.g. Miso-Glazed Cod) render clean.
 *
 *   2. The CLEAN case still works, so the format is sound when the data lines up.
 *
 * This is expected, documented derived behaviour (Livingston's flagged weakness
 * (b)), NOT a bug — the test asserts the CURRENT truth so the product decision is
 * anchored to numbers, and so a regression that widens/narrows it is caught.
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

  it('over-brackets: "Braise the beef ... and broth" sweeps in tortillas & cheese it never names', () => {
    const m = deriveRecipeMatrix(ingredients, instructions);
    const braise = m.instructions[1];
    expect(braise.kind).toBe("PROCESS");
    // beef@0 .. broth@6 — spans the whole middle of the list.
    expect(braise.spanFrom).toBe(0);
    expect(braise.spanTo).toBe(6);
    // The step names only beef and broth; rows 1-5 are swept in unnamed.
    const swept = sweptInRows(braise, [0, 6]);
    expect(swept).toEqual([1, 2, 3, 4, 5]);
    // Concretely: corn tortillas (4) and oaxaca cheese (5) — you do not braise them.
    expect(swept).toContain(4);
    expect(swept).toContain(5);
  });

  it("renders at least one over-inclusive PROCESS span (matches the measured 15/16 meals)", () => {
    const m = deriveRecipeMatrix(ingredients, instructions);
    const named = (t: string): number[] => {
      // faithful mirror of the matcher: any shared significant token
      const norm = (p: string) =>
        p.toLowerCase().split(/[^a-z]+/).filter(Boolean).map((w) =>
          w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w,
        );
      const stop = new Set(["of","the","a","an","and","or","to","with","into","for","in","on","dried","fresh","large","small"]);
      const stepTk = new Set(norm(t).filter((w) => !stop.has(w)));
      return ingredients
        .map((i, r) => ({ r, tk: norm(i.name).filter((w) => !stop.has(w)) }))
        .filter(({ tk }) => tk.some((w) => stepTk.has(w)))
        .map(({ r }) => r);
    };
    const anyOver = m.instructions.some(
      (s) => s.kind === "PROCESS" && sweptInRows(s, named(instructions[s.position].text)).length > 0,
    );
    expect(anyOver).toBe(true);
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
