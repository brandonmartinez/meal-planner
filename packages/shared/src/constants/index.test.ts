import { describe, it, expect } from "vitest";
import {
  DAYS_OF_WEEK,
  MEAL_PLACEHOLDER_KINDS,
  MEAL_PLACEHOLDERS,
  PLACEHOLDER_NAMES_LOWER,
  INGREDIENT_CATEGORIES,
} from "./index.js";

describe("shared constants", () => {
  it("DAYS_OF_WEEK has 7 unique entries starting with Sunday", () => {
    expect(DAYS_OF_WEEK).toHaveLength(7);
    expect(DAYS_OF_WEEK[0]).toBe("Sunday");
    expect(new Set(DAYS_OF_WEEK).size).toBe(7);
  });

  it("every MEAL_PLACEHOLDER_KIND has matching metadata", () => {
    for (const kind of MEAL_PLACEHOLDER_KINDS) {
      const meta = MEAL_PLACEHOLDERS[kind];
      expect(meta).toBeDefined();
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.emoji.length).toBeGreaterThan(0);
    }
  });

  it("PLACEHOLDER_NAMES_LOWER mirrors MEAL_PLACEHOLDERS", () => {
    expect(PLACEHOLDER_NAMES_LOWER.size).toBe(MEAL_PLACEHOLDER_KINDS.length);
    for (const kind of MEAL_PLACEHOLDER_KINDS) {
      expect(
        PLACEHOLDER_NAMES_LOWER.has(MEAL_PLACEHOLDERS[kind].name.toLowerCase()),
      ).toBe(true);
    }
  });

  it('INGREDIENT_CATEGORIES has no duplicates and includes "other"', () => {
    expect(new Set(INGREDIENT_CATEGORIES).size).toBe(
      INGREDIENT_CATEGORIES.length,
    );
    expect(INGREDIENT_CATEGORIES).toContain("other");
  });
});
