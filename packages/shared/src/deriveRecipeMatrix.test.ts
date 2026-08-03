import { describe, it, expect } from "vitest";
import { deriveRecipeMatrix } from "./deriveRecipeMatrix.js";
import type {
  TabularRecipeIngredientInput,
  TabularRecipeInstructionInput,
} from "./types/tabularRecipe.js";

function ing(
  position: number,
  name: string,
  category: string | null = null,
  groupLabel: string | null = null,
): TabularRecipeIngredientInput {
  return { position, name, category, groupLabel };
}

function step(
  position: number,
  text: string,
  overrides: Partial<TabularRecipeInstructionInput> = {},
): TabularRecipeInstructionInput {
  return {
    position,
    text,
    kind: "PROCESS",
    subLabel: null,
    spanFrom: null,
    spanTo: null,
    ...overrides,
  };
}

describe("deriveRecipeMatrix — ordering", () => {
  it("sorts ingredients and instructions ascending by position regardless of input order", () => {
    const ingredients = [ing(2, "flour"), ing(0, "butter"), ing(1, "sugar")];
    const instructions = [
      step(1, "Cream the butter and sugar"),
      step(0, "Add the flour"),
    ];

    const matrix = deriveRecipeMatrix(ingredients, instructions);

    expect(matrix.ingredients.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(matrix.instructions.map((i) => i.position)).toEqual([0, 1]);
  });
});

describe("deriveRecipeMatrix — group runs (effective groupLabel)", () => {
  it("does NOT derive a group from category — a derived meal is ungrouped (all null)", () => {
    // `category` is the grocery-aisle vocabulary; it must never become a group
    // pill (P1-9 ruling). With no authored groupLabel the row is ungrouped.
    const matrix = deriveRecipeMatrix(
      [ing(0, "shrimp", "seafood"), ing(1, "flour", "pantry")],
      [],
    );
    expect(matrix.ingredients).toEqual([
      { position: 0, groupLabel: null },
      { position: 1, groupLabel: null },
    ]);
  });

  it("null category → null (ungrouped)", () => {
    const matrix = deriveRecipeMatrix([ing(0, "mystery", null)], []);
    expect(matrix.ingredients[0].groupLabel).toBeNull();
  });

  it("uses an authored groupLabel (the only source of grouping) and ignores category", () => {
    const matrix = deriveRecipeMatrix(
      [ing(0, "shrimp", "seafood", "Shrimp Mix")],
      [],
    );
    expect(matrix.ingredients[0].groupLabel).toBe("Shrimp Mix");
  });

  it("passes authored group labels through per row; unauthored rows stay null (renderer builds runs)", () => {
    // Grouping now comes only from authored labels. Category is present on every
    // row but is intentionally ignored, so unlabeled rows are ungrouped.
    const matrix = deriveRecipeMatrix(
      [
        ing(0, "beef", "meat", "Filling"),
        ing(1, "chicken", "meat", "Filling"),
        ing(2, "lettuce", "produce"),
        ing(3, "pork", "meat", "Filling"),
      ],
      [step(0, "Combine the filling", { spanFrom: 0, spanTo: 3 })],
    );
    expect(matrix.ingredients.map((i) => i.groupLabel)).toEqual([
      "Filling",
      "Filling",
      null,
      "Filling",
    ]);
  });
});

describe("deriveRecipeMatrix — setup detection", () => {
  it("classifies leading setup-verb steps that name no ingredient as SETUP", () => {
    const ingredients = [ing(0, "flour"), ing(1, "sugar")];
    const instructions = [
      step(0, "Preheat the oven to 350°F"),
      step(1, "Line a baking sheet with parchment"),
      step(2, "Mix the flour and sugar"),
    ];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    const kinds = matrix.instructions.map((i) => i.kind);

    expect(kinds).toEqual(["SETUP", "SETUP", "PROCESS"]);
  });

  it("a setup-verb step that DOES name an ingredient is not SETUP", () => {
    const ingredients = [ing(0, "oil")];
    const instructions = [step(0, "Heat the oil in a pan")];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    // "heat…oil" matches a setup pattern but it names the "oil" row → PROCESS.
    expect(matrix.instructions[0].kind).toBe("PROCESS");
    expect(matrix.instructions[0].spanFrom).toBe(0);
  });

  it("only LEADING setup steps count; a later setup verb is not a band", () => {
    const ingredients = [ing(0, "flour")];
    const instructions = [
      step(0, "Mix the flour"),
      step(1, "Preheat the broiler"),
    ];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.instructions.map((i) => i.kind)).toEqual([
      "PROCESS",
      "PROCESS",
    ]);
  });
});

describe("deriveRecipeMatrix — finish detection", () => {
  it("classifies a trailing finish-verb step that names no ingredient as FINISH", () => {
    const ingredients = [ing(0, "flour")];
    const instructions = [
      step(0, "Bake the flour mixture"),
      step(1, "Let cool before serving"),
    ];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.instructions.map((i) => i.kind)).toEqual([
      "PROCESS",
      "FINISH",
    ]);
    expect(matrix.instructions[1].spanFrom).toBeNull();
    expect(matrix.instructions[1].spanTo).toBeNull();
  });

  it("marks multiple contiguous trailing finish notes", () => {
    const ingredients = [ing(0, "dough")];
    const instructions = [
      step(0, "Shape the dough"),
      step(1, "Let rest 10 min"),
      step(2, "Serve warm"),
    ];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.instructions.map((i) => i.kind)).toEqual([
      "PROCESS",
      "FINISH",
      "FINISH",
    ]);
  });
});

describe("deriveRecipeMatrix — name matching & spans", () => {
  it("spans the min/max mentioned ingredient rows", () => {
    const ingredients = [
      ing(0, "butter"),
      ing(1, "sugar"),
      ing(2, "flour"),
      ing(3, "salt"),
    ];
    const instructions = [step(0, "Combine the butter, sugar and flour")];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.instructions[0].spanFrom).toBe(0);
    expect(matrix.instructions[0].spanTo).toBe(2);
  });

  it("normalizes plurals when matching (eggs → egg)", () => {
    const ingredients = [ing(0, "egg"), ing(1, "milk")];
    const instructions = [step(0, "Whisk the eggs")];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.instructions[0].spanFrom).toBe(0);
    expect(matrix.instructions[0].spanTo).toBe(0);
  });

  it("strips quantity words so '1/2 cup of the butter' still matches butter", () => {
    const ingredients = [ing(0, "butter"), ing(1, "flour")];
    const instructions = [step(0, "Melt 1/2 cup of the butter")];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.instructions[0].spanFrom).toBe(0);
    expect(matrix.instructions[0].spanTo).toBe(0);
  });

  it("matches a multi-word ingredient by a shared content token", () => {
    const ingredients = [ing(0, "olive oil"), ing(1, "onion")];
    const instructions = [step(0, "Warm the oil")];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.instructions[0].spanFrom).toBe(0);
    expect(matrix.instructions[0].spanTo).toBe(0);
  });
});

describe("deriveRecipeMatrix — degenerate no-match case", () => {
  it("a PROCESS step naming no ingredient spans ALL rows (intentional, not a bug)", () => {
    const ingredients = [ing(0, "flour"), ing(1, "sugar"), ing(2, "eggs")];
    const instructions = [step(0, "Stir everything together thoroughly")];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.instructions[0].kind).toBe("PROCESS");
    expect(matrix.instructions[0].spanFrom).toBe(0);
    expect(matrix.instructions[0].spanTo).toBe(2);
  });

  it("no ingredients → null spans", () => {
    const matrix = deriveRecipeMatrix([], [step(0, "Do the thing")]);
    expect(matrix.instructions[0].spanFrom).toBeNull();
    expect(matrix.instructions[0].spanTo).toBeNull();
  });

  it("empty inputs → derived with empty arrays", () => {
    const matrix = deriveRecipeMatrix([], []);
    expect(matrix).toEqual({
      matrixSource: "derived",
      ingredients: [],
      instructions: [],
      ingredientDisplayOrder: [],
    });
  });
});

describe("deriveRecipeMatrix — subLabel extraction", () => {
  it("extracts a temperature fragment, preferring it over duration", () => {
    const matrix = deriveRecipeMatrix(
      [],
      [step(0, "Bake at 350°F for 20 min")],
    );
    expect(matrix.instructions[0].subLabel).toBe("350°F");
  });

  it("normalizes 'degrees' to °F", () => {
    const matrix = deriveRecipeMatrix([], [step(0, "Heat oven to 425 degrees")]);
    expect(matrix.instructions[0].subLabel).toBe("425°F");
  });

  it("extracts a minute duration when no temperature", () => {
    const ingredients = [ing(0, "dough")];
    const matrix = deriveRecipeMatrix(ingredients, [
      step(0, "Knead the dough for 5 minutes"),
    ]);
    expect(matrix.instructions[0].subLabel).toBe("5 min");
  });

  it("extracts an hour duration", () => {
    const ingredients = [ing(0, "roast")];
    const matrix = deriveRecipeMatrix(ingredients, [
      step(0, "Braise the roast 2 hours"),
    ]);
    expect(matrix.instructions[0].subLabel).toBe("2 hr");
  });

  it("null when no temperature or duration present", () => {
    const ingredients = [ing(0, "flour")];
    const matrix = deriveRecipeMatrix(ingredients, [step(0, "Sift the flour")]);
    expect(matrix.instructions[0].subLabel).toBeNull();
  });
});

describe("deriveRecipeMatrix — provenance & authored passthrough (never clobber)", () => {
  it("matrixSource is 'derived' when no instruction has a span", () => {
    const matrix = deriveRecipeMatrix(
      [ing(0, "flour")],
      [step(0, "Mix the flour")],
    );
    expect(matrix.matrixSource).toBe("derived");
  });

  it("matrixSource is 'authored' when any instruction has a non-null spanFrom", () => {
    const matrix = deriveRecipeMatrix(
      [ing(0, "flour"), ing(1, "sugar")],
      [step(0, "Anything", { spanFrom: 0, spanTo: 1 })],
    );
    expect(matrix.matrixSource).toBe("authored");
  });

  it("passes authored kind/subLabel/spanFrom/spanTo through untouched and does NOT re-derive", () => {
    const ingredients = [ing(0, "butter"), ing(1, "sugar"), ing(2, "flour")];
    // Authored: step names only 'flour' but authored span says rows 0..1, and
    // kind/subLabel are hand-set. Derivation must NOT overwrite any of this.
    const instructions: TabularRecipeInstructionInput[] = [
      step(0, "Preheat the oven to 350°F", {
        kind: "SETUP",
        subLabel: "custom",
        spanFrom: null,
        spanTo: null,
      }),
      step(1, "Work in the flour", {
        kind: "PROCESS",
        subLabel: "authored sub",
        spanFrom: 0,
        spanTo: 1,
      }),
    ];

    const matrix = deriveRecipeMatrix(ingredients, instructions);

    expect(matrix.matrixSource).toBe("authored");
    // Authored matrices are NEVER reordered: display order is the identity
    // permutation, so authored spans (which index into it) stay valid unchanged.
    expect(matrix.ingredientDisplayOrder).toEqual([0, 1, 2]);
    expect(matrix.instructions[0]).toEqual({
      position: 0,
      kind: "SETUP",
      subLabel: "custom",
      spanFrom: null,
      spanTo: null,
    });
    expect(matrix.instructions[1]).toEqual({
      position: 1,
      kind: "PROCESS",
      subLabel: "authored sub",
      spanFrom: 0,
      spanTo: 1,
    });
  });

  it("authored mode leaves a null ingredient groupLabel null (no category fallback)", () => {
    const matrix = deriveRecipeMatrix(
      [ing(0, "shrimp", "seafood", null), ing(1, "flour", "pantry", "Breading")],
      [step(0, "Coat", { spanFrom: 0, spanTo: 1 })],
    );
    expect(matrix.ingredients).toEqual([
      { position: 0, groupLabel: null },
      { position: 1, groupLabel: "Breading" },
    ]);
  });

  it("does not mutate the caller's input arrays", () => {
    const ingredients = [ing(1, "sugar"), ing(0, "butter")];
    const instructions = [step(1, "b"), step(0, "a")];
    const ingCopy = structuredClone(ingredients);
    const stepCopy = structuredClone(instructions);

    deriveRecipeMatrix(ingredients, instructions);

    expect(ingredients).toEqual(ingCopy);
    expect(instructions).toEqual(stepCopy);
  });
});

describe("deriveRecipeMatrix — ingredientDisplayOrder (Grid use-ordering)", () => {
  it("is a valid permutation of 0..n-1 (identity when nothing to reorder)", () => {
    const matrix = deriveRecipeMatrix(
      [ing(0, "a"), ing(1, "b"), ing(2, "c")],
      [],
    );
    // No instructions: every row is unreferenced, so they stay in position order.
    expect(matrix.ingredientDisplayOrder).toEqual([0, 1, 2]);
    expect([...matrix.ingredientDisplayOrder].sort((x, y) => x - y)).toEqual([
      0, 1, 2,
    ]);
  });

  it("parks ingredients no step names at the END, in position order among themselves", () => {
    // Shopping order: garnish (unused) sits BETWEEN two co-used rows.
    const ingredients = [
      ing(0, "chicken"),
      ing(1, "parsley garnish"),
      ing(2, "rice"),
    ];
    const instructions = [step(0, "Cook the chicken and rice together")];

    const matrix = deriveRecipeMatrix(ingredients, instructions);

    // chicken@0 and rice@2 are first-used at step 0 → lead in position order;
    // parsley (named by nothing) is parked last.
    expect(matrix.ingredientDisplayOrder).toEqual([0, 2, 1]);
    // The step's span is now contiguous over its two named rows (display 0..1),
    // no longer sweeping the parsley that used to sit between them.
    expect(matrix.instructions[0]).toMatchObject({ spanFrom: 0, spanTo: 1 });
  });

  it("first use wins: a row's display slot follows the FIRST step that names it", () => {
    // Ingredients listed in a non-use order; steps use them in a different order.
    const ingredients = [
      ing(0, "flour"), // first used in step 1
      ing(1, "onion"), // first used in step 0
      ing(2, "stock"), // first used in step 0
    ];
    const instructions = [
      step(0, "Sweat the onion in the stock"),
      step(1, "Whisk in the flour"),
    ];

    const matrix = deriveRecipeMatrix(ingredients, instructions);

    // step 0 rows (onion@1, stock@2) come first in position order, then flour@0.
    expect(matrix.ingredientDisplayOrder).toEqual([1, 2, 0]);
    // spanFrom/spanTo index into ingredientDisplayOrder (DISPLAY rows), not
    // position: the flour step lands on display row 2, not position 0.
    const displayIndexOf = new Map(
      matrix.ingredientDisplayOrder.map((r, k) => [r, k] as const),
    );
    expect(matrix.instructions[1]).toMatchObject({ spanFrom: 2, spanTo: 2 });
    expect(displayIndexOf.get(0)).toBe(2);
  });

  it("ties on first-use step break by position (stable)", () => {
    const ingredients = [ing(0, "butter"), ing(1, "sugar"), ing(2, "flour")];
    // All three named by the same single step → same first-use; order by position.
    const instructions = [step(0, "Combine the butter, sugar and flour")];

    const matrix = deriveRecipeMatrix(ingredients, instructions);
    expect(matrix.ingredientDisplayOrder).toEqual([0, 1, 2]);
  });
});
