import { describe, it, expect } from "vitest";

import {
  canonicalUnit,
  displayIngredientName,
  normalizeIngredientName,
  normalizeUnit,
} from "./ingredientNormalize.js";

describe("normalizeIngredientName", () => {
  it("case-folds for the grouping key", () => {
    expect(normalizeIngredientName("Tomato Sauce")).toBe("tomato sauce");
    expect(normalizeIngredientName("tomato sauce")).toBe("tomato sauce");
  });

  it("collapses internal and edge whitespace", () => {
    expect(normalizeIngredientName("  Olive   Oil ")).toBe("olive oil");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeIngredientName("Basil,")).toBe("basil");
    expect(normalizeIngredientName("Garlic.")).toBe("garlic");
    expect(normalizeIngredientName("Thyme;")).toBe("thyme");
  });

  it("does NOT stem or singularize (out of scope)", () => {
    expect(normalizeIngredientName("Tomatoes")).not.toBe(
      normalizeIngredientName("Tomato"),
    );
  });
});

describe("displayIngredientName", () => {
  it("preserves first-seen casing", () => {
    expect(displayIngredientName("Tomato Sauce")).toBe("Tomato Sauce");
    expect(displayIngredientName("olive OIL")).toBe("olive OIL");
  });

  it("collapses whitespace without changing case", () => {
    expect(displayIngredientName("  Olive   Oil ")).toBe("Olive Oil");
  });
});

describe("canonicalUnit", () => {
  it("folds spoon aliases", () => {
    for (const v of ["teaspoon", "teaspoons", "tsp", "TSP"]) {
      expect(canonicalUnit(v)).toBe("tsp");
    }
    for (const v of ["tablespoon", "Tablespoons", "tbsp", "tbs", "tbl"]) {
      expect(canonicalUnit(v)).toBe("tbsp");
    }
  });

  it("folds weight aliases", () => {
    for (const v of ["ounce", "ounces", "oz"]) expect(canonicalUnit(v)).toBe("oz");
    for (const v of ["pound", "pounds", "lb", "lbs"])
      expect(canonicalUnit(v)).toBe("lb");
    for (const v of ["gram", "grams", "gr", "g"]) expect(canonicalUnit(v)).toBe("g");
    for (const v of ["kilogram", "kilograms", "kg"])
      expect(canonicalUnit(v)).toBe("kg");
  });

  it("folds volume aliases", () => {
    for (const v of ["cup", "cups"]) expect(canonicalUnit(v)).toBe("cup");
    for (const v of ["milliliter", "milliliters", "millilitre", "millilitres", "ml"])
      expect(canonicalUnit(v)).toBe("ml");
    for (const v of ["liter", "liters", "litre", "litres", "l"])
      expect(canonicalUnit(v)).toBe("l");
  });

  it("folds countable aliases", () => {
    for (const v of ["clove", "cloves"]) expect(canonicalUnit(v)).toBe("clove");
    for (const v of ["can", "cans"]) expect(canonicalUnit(v)).toBe("can");
    for (const v of ["pinch", "pinches"]) expect(canonicalUnit(v)).toBe("pinch");
  });

  it("tolerates a trailing period", () => {
    expect(canonicalUnit("tbsp.")).toBe("tbsp");
    expect(canonicalUnit("oz.")).toBe("oz");
  });

  it("passes unknown units through, trimmed with original case", () => {
    expect(canonicalUnit("Bunch")).toBe("Bunch");
    expect(canonicalUnit("  sprig ")).toBe("sprig");
  });

  it("returns empty string for missing/empty unit", () => {
    expect(canonicalUnit()).toBe("");
    expect(canonicalUnit("")).toBe("");
    expect(canonicalUnit("   ")).toBe("");
  });
});

describe("normalizeUnit", () => {
  it("lowercases the canonical token", () => {
    expect(normalizeUnit("Tablespoon")).toBe("tbsp");
    expect(normalizeUnit("Bunch")).toBe("bunch");
    expect(normalizeUnit()).toBe("");
  });
});
