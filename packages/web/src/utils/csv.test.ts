import { describe, it, expect } from "vitest";
import { parseCSV, parseMealsCSV } from "./csv";

describe("parseCSV", () => {
  it("parses a simple comma-separated CSV", () => {
    expect(parseCSV("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with embedded commas", () => {
    expect(parseCSV('name,desc\n"a,b","hello, world"')).toEqual([
      ["name", "desc"],
      ["a,b", "hello, world"],
    ]);
  });

  it('handles "" as escaped quote inside a quoted field', () => {
    expect(parseCSV('a\n"He said ""hi"""')).toEqual([["a"], ['He said "hi"']]);
  });

  it("handles embedded newlines in a quoted field", () => {
    expect(parseCSV('a,b\n"line1\nline2",x')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("normalizes CRLF and CR line endings", () => {
    expect(parseCSV("a,b\r\n1,2\r3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("drops fully-empty trailing rows", () => {
    expect(parseCSV("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseCSV("")).toEqual([]);
  });
});

describe("parseMealsCSV", () => {
  it("warns when CSV is missing the meal column", () => {
    const r = parseMealsCSV("foo,bar\n1,2");
    expect(r.meals).toEqual([]);
    expect(r.warnings[0]).toMatch(/missing a required "meal" column/);
  });

  it("parses meals with description and ingredients", () => {
    const csv = `meal,description,ingredient,quantity,unit,category
Tacos,Easy weeknight,Tortillas,6,,produce
Tacos,,Salsa,1,cup,condiments`;
    const r = parseMealsCSV(csv);
    expect(r.meals).toHaveLength(1);
    expect(r.meals[0]).toEqual({
      name: "Tacos",
      description: "Easy weeknight",
      ingredients: [
        { name: "Tortillas", quantity: "6", category: "produce" },
        { name: "Salsa", quantity: "1", unit: "cup", category: "condiments" },
      ],
    });
  });

  it("groups rows sharing a meal name (case-insensitive)", () => {
    const csv = `meal,ingredient
Pizza,Cheese
pizza,Sauce`;
    const r = parseMealsCSV(csv);
    expect(r.meals).toHaveLength(1);
    expect(r.meals[0].ingredients).toHaveLength(2);
  });

  it("supports header aliases (name, item, qty, etc.)", () => {
    const csv = `name,item,qty
Soup,Broth,1`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].name).toBe("Soup");
    expect(r.meals[0].ingredients?.[0]).toEqual({
      name: "Broth",
      quantity: "1",
    });
  });

  it("warns and skips rows with empty meal name", () => {
    const csv = `meal,ingredient
,Lonely
Tacos,Tortillas`;
    const r = parseMealsCSV(csv);
    expect(r.meals).toHaveLength(1);
    expect(r.warnings.some((w) => /Row 2/.test(w))).toBe(true);
  });

  it("lowercases category values", () => {
    const csv = `meal,ingredient,category
Tacos,Tortillas,Produce`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].ingredients?.[0].category).toBe("produce");
  });

  it("handles empty input gracefully", () => {
    const r = parseMealsCSV("");
    expect(r.meals).toEqual([]);
    expect(r.warnings).toContain("CSV is empty");
  });
});
