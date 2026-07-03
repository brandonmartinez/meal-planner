import { describe, it, expect } from "vitest";
import { parseCSV, parseMealsCSV, mealsToCSV } from "./csv";

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

  it("parses a difficulty column (case-insensitive)", () => {
    const csv = `meal,difficulty
Tacos,easy
Stew,HARD`;
    const r = parseMealsCSV(csv);
    expect(r.meals.find((m) => m.name === "Tacos")?.difficulty).toBe("EASY");
    expect(r.meals.find((m) => m.name === "Stew")?.difficulty).toBe("HARD");
  });

  it("keeps the first non-empty difficulty across grouped rows", () => {
    const csv = `meal,difficulty,ingredient
Tacos,MEDIUM,Tortillas
Tacos,,Salsa`;
    const r = parseMealsCSV(csv);
    expect(r.meals).toHaveLength(1);
    expect(r.meals[0].difficulty).toBe("MEDIUM");
  });

  it("warns and ignores an unrecognized difficulty value", () => {
    const csv = `meal,difficulty
Tacos,EXTREME`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].difficulty).toBeUndefined();
    expect(r.warnings.some((w) => /unknown difficulty "EXTREME"/.test(w))).toBe(
      true,
    );
  });

  it("supports the difficulty header alias", () => {
    const csv = `meal,diff
Soup,easy`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].difficulty).toBe("EASY");
  });

  it("parses integer metadata columns (prep, cook, servings)", () => {
    const csv = `meal,prepTimeMinutes,cookTimeMinutes,servings
Tacos,10,20,4`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0]).toMatchObject({
      name: "Tacos",
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      servings: 4,
    });
  });

  it("parses sourceUrl and notes columns", () => {
    const csv = `meal,sourceUrl,notes
Tacos,https://example.com/tacos,Use fresh cilantro`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].sourceUrl).toBe("https://example.com/tacos");
    expect(r.meals[0].notes).toBe("Use fresh cilantro");
  });

  it("parses the imageUrl column and its aliases", () => {
    const canonical = parseMealsCSV(
      `meal,imageUrl\nTacos,https://cdn.example.com/tacos.jpg`,
    );
    expect(canonical.meals[0].imageUrl).toBe(
      "https://cdn.example.com/tacos.jpg",
    );

    const aliased = parseMealsCSV(
      `meal,photo\nPizza,https://cdn.example.com/pizza.png`,
    );
    expect(aliased.meals[0].imageUrl).toBe(
      "https://cdn.example.com/pizza.png",
    );
  });

  it("supports metadata header aliases", () => {
    const csv = `meal,prep,cook,serves,source,note
Tacos,5,15,2,https://ex.com,quick`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0]).toMatchObject({
      prepTimeMinutes: 5,
      cookTimeMinutes: 15,
      servings: 2,
      sourceUrl: "https://ex.com",
      notes: "quick",
    });
  });

  it("warns and ignores non-numeric integer metadata", () => {
    const csv = `meal,prepTimeMinutes,servings
Tacos,abc,4.5`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].prepTimeMinutes).toBeUndefined();
    expect(r.meals[0].servings).toBeUndefined();
    expect(r.warnings.some((w) => /non-numeric prep time "abc"/.test(w))).toBe(
      true,
    );
    expect(r.warnings.some((w) => /non-numeric servings "4.5"/.test(w))).toBe(
      true,
    );
  });

  it("rejects servings below its minimum of 1", () => {
    const csv = `meal,servings
Tacos,0`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].servings).toBeUndefined();
    expect(r.warnings.some((w) => /non-numeric servings "0"/.test(w))).toBe(
      true,
    );
  });

  it("keeps the first non-empty metadata across grouped rows", () => {
    const csv = `meal,prepTimeMinutes,ingredient
Tacos,10,Tortillas
Tacos,99,Salsa`;
    const r = parseMealsCSV(csv);
    expect(r.meals).toHaveLength(1);
    expect(r.meals[0].prepTimeMinutes).toBe(10);
  });

  it("parses the rating column within its 1–5 range", () => {
    const csv = `meal,rating
Tacos,4`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].rating).toBe(4);
    expect(r.warnings).toEqual([]);
  });

  it("warns and ignores an out-of-range or non-integer rating", () => {
    const csv = `meal,rating
Tacos,6
Soup,0
Stew,abc`;
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    const soup = r.meals.find((m) => m.name === "Soup");
    const stew = r.meals.find((m) => m.name === "Stew");
    expect(tacos?.rating).toBeUndefined();
    expect(soup?.rating).toBeUndefined();
    expect(stew?.rating).toBeUndefined();
    expect(r.warnings.filter((w) => /non-numeric rating/.test(w))).toHaveLength(
      3,
    );
  });

  it("supports rating header aliases", () => {
    const csv = `meal,stars
Tacos,3`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].rating).toBe(3);
  });

  it("parses truthy favorite tokens", () => {
    const csv = `meal,favorite
True,true
Yes,yes
Y,y
One,1`;
    const r = parseMealsCSV(csv);
    for (const m of r.meals) expect(m.favorite).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("parses falsy favorite tokens", () => {
    const csv = `meal,favorite
False,false
No,no
N,n
Zero,0`;
    const r = parseMealsCSV(csv);
    for (const m of r.meals) expect(m.favorite).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it("supports favorite header aliases", () => {
    const csv = `meal,starred
Tacos,yes`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].favorite).toBe(true);
  });

  it("warns and ignores an unrecognized favorite token", () => {
    const csv = `meal,favorite
Tacos,maybe`;
    const r = parseMealsCSV(csv);
    expect(r.meals[0].favorite).toBeUndefined();
    expect(
      r.warnings.some((w) => /unrecognized favorite "maybe"/.test(w)),
    ).toBe(true);
  });

  it("handles empty input gracefully", () => {
    const r = parseMealsCSV("");
    expect(r.meals).toEqual([]);
    expect(r.warnings).toContain("CSV is empty");
  });
});

describe("mealsToCSV", () => {
  it("emits the canonical header", () => {
    const csv = mealsToCSV([]);
    expect(csv.split("\n")[0]).toBe(
      "meal,description,difficulty,ingredient,quantity,unit,category,prepTimeMinutes,cookTimeMinutes,servings,sourceUrl,imageUrl,notes,favorite,rating,tags,categories,collections,instructions",
    );
  });

  it("emits one row per ingredient, repeating meal-level fields", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        description: "Yum",
        difficulty: "EASY",
        ingredients: [
          { name: "Tortillas", quantity: "6", unit: "", category: "produce" },
          { name: "Salsa", quantity: "1", unit: "cup", category: "condiments" },
        ],
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe("Tacos,Yum,EASY,Tortillas,6,,produce,,,,,,,,,,,");
    expect(lines[2]).toBe("Tacos,Yum,EASY,Salsa,1,cup,condiments,,,,,,,,,,,");
  });

  it("emits a single row for a meal with no ingredients", () => {
    const csv = mealsToCSV([
      { name: "Cereal", description: null, difficulty: null },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Cereal,,,,,,,,,,,,,,,,,");
  });

  it("emits meal-level metadata columns, repeating them per ingredient row", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        description: "Yum",
        difficulty: "EASY",
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        servings: 4,
        sourceUrl: "https://example.com/tacos",
        notes: "Use fresh cilantro",
        ingredients: [
          { name: "Tortillas", quantity: "6", unit: "", category: "produce" },
          { name: "Salsa", quantity: "1", unit: "cup", category: "condiments" },
        ],
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe(
      "Tacos,Yum,EASY,Tortillas,6,,produce,10,20,4,https://example.com/tacos,,Use fresh cilantro,,,,,",
    );
    expect(lines[2]).toBe(
      "Tacos,Yum,EASY,Salsa,1,cup,condiments,10,20,4,https://example.com/tacos,,Use fresh cilantro,,,,,",
    );
  });

  it("emits favorite and rating in the trailing columns", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        favorite: true,
        rating: 5,
        ingredients: [
          { name: "Tortillas", quantity: "6", unit: "", category: "produce" },
        ],
      },
      { name: "Cereal", favorite: false, rating: null },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toBe("Tacos,,,Tortillas,6,,produce,,,,,,,true,5,,,");
    expect(lines[2]).toBe("Cereal,,,,,,,,,,,,,false,,,,");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = mealsToCSV([
      { name: 'Mac, Cheese', description: 'He said "hi"', difficulty: null },
    ]);
    expect(csv).toContain('"Mac, Cheese"');
    expect(csv).toContain('"He said ""hi"""');
  });

  it("round-trips through parseMealsCSV", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        description: "Yum",
        difficulty: "MEDIUM",
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        servings: 4,
        sourceUrl: "https://example.com/tacos",
        notes: "Use fresh cilantro",
        imageUrl: "https://cdn.example.com/tacos.jpg",
        favorite: true,
        rating: 5,
        ingredients: [
          { name: "Tortillas", quantity: "6", unit: "", category: "produce" },
        ],
      },
      { name: "Cereal", description: null, difficulty: null },
    ]);
    const r = parseMealsCSV(csv);
    expect(r.warnings).toEqual([]);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.difficulty).toBe("MEDIUM");
    expect(tacos?.description).toBe("Yum");
    expect(tacos?.prepTimeMinutes).toBe(10);
    expect(tacos?.cookTimeMinutes).toBe(20);
    expect(tacos?.servings).toBe(4);
    expect(tacos?.sourceUrl).toBe("https://example.com/tacos");
    expect(tacos?.notes).toBe("Use fresh cilantro");
    expect(tacos?.imageUrl).toBe("https://cdn.example.com/tacos.jpg");
    expect(tacos?.favorite).toBe(true);
    expect(tacos?.rating).toBe(5);
    expect(tacos?.ingredients).toEqual([
      { name: "Tortillas", quantity: "6", category: "produce" },
    ]);
    const cereal = r.meals.find((m) => m.name === "Cereal");
    expect(cereal?.difficulty).toBeUndefined();
    expect(cereal?.prepTimeMinutes).toBeUndefined();
    expect(cereal?.ingredients).toBeUndefined();
  });
});

describe("parseMealsCSV — tags & categories (#107)", () => {
  it("parses semicolon-delimited tag and category name lists", () => {
    const csv =
      "meal,tags,categories\nTacos,Quick;Weeknight,Dinner;Mexican\n";
    const r = parseMealsCSV(csv);
    expect(r.warnings).toEqual([]);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.tags).toEqual(["Quick", "Weeknight"]);
    expect(tacos?.categories).toEqual(["Dinner", "Mexican"]);
  });

  it("trims whitespace and drops empty segments in name lists", () => {
    const csv = "meal,tags\nTacos, Quick ; ;Weeknight; \n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.tags).toEqual(["Quick", "Weeknight"]);
  });

  it("dedupes case-insensitively within a single cell, preserving first casing", () => {
    const csv = "meal,categories\nTacos,Dinner;dinner;DINNER\n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.categories).toEqual(["Dinner"]);
  });

  it("supports tag and category header aliases", () => {
    const csv = "meal,tag,cats\nTacos,Quick,Dinner\n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.tags).toEqual(["Quick"]);
    expect(tacos?.categories).toEqual(["Dinner"]);
  });

  it("keeps the first non-empty tag/category list across grouped rows", () => {
    const csv =
      "meal,ingredient,tags\nTacos,Tortillas,Quick;Weeknight\nTacos,Salsa,Ignored\n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.tags).toEqual(["Quick", "Weeknight"]);
  });

  it("leaves tags/categories undefined when the columns are absent or empty", () => {
    const csv = "meal,tags,categories\nCereal,,\n";
    const r = parseMealsCSV(csv);
    const cereal = r.meals.find((m) => m.name === "Cereal");
    expect(cereal?.tags).toBeUndefined();
    expect(cereal?.categories).toBeUndefined();
  });
});

describe("mealsToCSV — tags & categories (#107)", () => {
  it("emits semicolon-joined tag and category name lists", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        tags: ["Quick", "Weeknight"],
        categories: ["Dinner", "Mexican"],
      },
    ]);
    const dataRow = csv.trim().split("\n")[1];
    // tags,categories,collections,instructions — this meal has no collections
    // or instructions, so both trailing cells are empty.
    expect(dataRow.endsWith("Quick;Weeknight,Dinner;Mexican,,")).toBe(true);
  });

  it("round-trips tag and category assignments by name", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        difficulty: "MEDIUM",
        tags: ["Quick", "Weeknight"],
        categories: ["Dinner"],
        ingredients: [
          { name: "Tortillas", quantity: "6", unit: "", category: "produce" },
          { name: "Salsa", quantity: "1", unit: "cup", category: "produce" },
        ],
      },
      { name: "Cereal", tags: ["Breakfast"], categories: [] },
    ]);
    const r = parseMealsCSV(csv);
    expect(r.warnings).toEqual([]);

    const tacos = r.meals.find((m) => m.name === "Tacos");
    // Multi-ingredient meal repeats tag/category columns on every row;
    // the first-non-empty guard keeps a single deduped assignment.
    expect(tacos?.tags).toEqual(["Quick", "Weeknight"]);
    expect(tacos?.categories).toEqual(["Dinner"]);

    const cereal = r.meals.find((m) => m.name === "Cereal");
    expect(cereal?.tags).toEqual(["Breakfast"]);
    // An empty category list exports as an empty cell → undefined on re-import.
    expect(cereal?.categories).toBeUndefined();
  });

  it("re-resolves names case-insensitively on round-trip (normalized dedupe is a service concern)", () => {
    // Export preserves original casing; the importer only dedupes exact
    // case-insensitive repeats within a cell. Distinct casings survive as
    // separate names for the service layer to normalize/upsert per family.
    const csv = mealsToCSV([
      { name: "Tacos", tags: ["Quick", "quick"] },
    ]);
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.tags).toEqual(["Quick"]);
  });
});

describe("parseMealsCSV — collections (#109)", () => {
  it("parses semicolon-delimited collection name lists", () => {
    const csv =
      "meal,collections\nTacos,Weeknight Dinners;Family Favorites\n";
    const r = parseMealsCSV(csv);
    expect(r.warnings).toEqual([]);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.collections).toEqual([
      "Weeknight Dinners",
      "Family Favorites",
    ]);
  });

  it("trims whitespace and drops empty segments", () => {
    const csv = "meal,collections\nTacos, Weeknight ; ;Favorites; \n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.collections).toEqual(["Weeknight", "Favorites"]);
  });

  it("dedupes case-insensitively within a cell, preserving first casing", () => {
    const csv = "meal,collections\nTacos,Weeknight;weeknight;WEEKNIGHT\n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.collections).toEqual(["Weeknight"]);
  });

  it("supports collection header aliases", () => {
    const csv = "meal,collection\nTacos,Weeknight Dinners\n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.collections).toEqual(["Weeknight Dinners"]);
  });

  it("keeps the first non-empty collection list across grouped rows", () => {
    const csv =
      "meal,ingredient,collections\nTacos,Tortillas,Weeknight Dinners\nTacos,Salsa,Ignored\n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.collections).toEqual(["Weeknight Dinners"]);
  });

  it("leaves collections undefined when the column is absent or empty", () => {
    const csv = "meal,collections\nCereal,\n";
    const r = parseMealsCSV(csv);
    const cereal = r.meals.find((m) => m.name === "Cereal");
    expect(cereal?.collections).toBeUndefined();
  });
});

describe("mealsToCSV — collections (#109)", () => {
  it("emits a semicolon-joined collection name list", () => {
    const csv = mealsToCSV([
      { name: "Tacos", collections: ["Weeknight Dinners", "Family Favorites"] },
    ]);
    const dataRow = csv.trim().split("\n")[1];
    // collections is the penultimate column (instructions trails empty).
    expect(
      dataRow.endsWith("Weeknight Dinners;Family Favorites,"),
    ).toBe(true);
  });

  it("round-trips collection assignments by name", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        collections: ["Weeknight Dinners", "Family Favorites"],
        ingredients: [
          { name: "Tortillas", quantity: "6", unit: "", category: "produce" },
          { name: "Salsa", quantity: "1", unit: "cup", category: "produce" },
        ],
      },
      { name: "Cereal", collections: [] },
    ]);
    const r = parseMealsCSV(csv);
    expect(r.warnings).toEqual([]);

    const tacos = r.meals.find((m) => m.name === "Tacos");
    // Multi-ingredient meal repeats the collections column on every row;
    // the first-non-empty guard keeps a single assignment.
    expect(tacos?.collections).toEqual([
      "Weeknight Dinners",
      "Family Favorites",
    ]);

    const cereal = r.meals.find((m) => m.name === "Cereal");
    // An empty collection list exports as an empty cell → undefined on re-import.
    expect(cereal?.collections).toBeUndefined();
  });
});

describe("parseMealsCSV — instructions (#100)", () => {
  it("parses newline-delimited ordered steps, stripping enumerators", () => {
    const csv =
      'meal,instructions\nTacos,"1. Warm the tortillas\n2. Assemble\n3. Serve"\n';
    const r = parseMealsCSV(csv);
    expect(r.warnings).toEqual([]);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.instructions).toEqual([
      { text: "Warm the tortillas" },
      { text: "Assemble" },
      { text: "Serve" },
    ]);
  });

  it("preserves step ORDER as written, independent of any numbering", () => {
    // Enumerators are stripped; order comes from line position, not the digits.
    const csv = 'meal,instructions\nTacos,"3. Third\n1. First\n2. Second"\n';
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.instructions?.map((s) => s.text)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
  });

  it("keeps steps containing commas and semicolons intact", () => {
    const csv =
      'meal,instructions,tags\nStew,"1. Add carrots, celery; then onions\n2. Simmer 1 hour",Dinner\n';
    const r = parseMealsCSV(csv);
    const stew = r.meals.find((m) => m.name === "Stew");
    expect(stew?.instructions).toEqual([
      { text: "Add carrots, celery; then onions" },
      { text: "Simmer 1 hour" },
    ]);
    // Adjacent semicolon-delimited tag column is unaffected by step content.
    expect(stew?.tags).toEqual(["Dinner"]);
  });

  it("drops blank lines and trims surrounding whitespace", () => {
    const csv = 'meal,instructions\nTacos,"1. Warm\n\n  2. Assemble  \n"\n';
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.instructions).toEqual([
      { text: "Warm" },
      { text: "Assemble" },
    ]);
  });

  it("supports instruction header aliases", () => {
    const csv = "meal,steps\nTacos,1. Warm\n";
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.instructions).toEqual([{ text: "Warm" }]);
  });

  it("keeps the first non-empty instruction list across grouped rows", () => {
    const csv =
      'meal,ingredient,instructions\nTacos,Tortillas,"1. Warm\n2. Assemble"\nTacos,Salsa,"9. Ignored"\n';
    const r = parseMealsCSV(csv);
    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.instructions?.map((s) => s.text)).toEqual([
      "Warm",
      "Assemble",
    ]);
  });

  it("leaves instructions undefined when the column is absent or empty", () => {
    const csv = "meal,instructions\nCereal,\n";
    const r = parseMealsCSV(csv);
    const cereal = r.meals.find((m) => m.name === "Cereal");
    expect(cereal?.instructions).toBeUndefined();
  });
});

describe("mealsToCSV — instructions (#100)", () => {
  it("emits numbered, newline-delimited steps in a quoted cell", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        instructions: [{ text: "Warm the tortillas" }, { text: "Assemble" }],
      },
    ]);
    expect(csv).toContain('"1. Warm the tortillas\n2. Assemble"');
  });

  it("round-trips instruction text and ORDER by name", () => {
    const csv = mealsToCSV([
      {
        name: "Tacos",
        instructions: [
          { text: "Warm the tortillas" },
          { text: "Add filling, then fold" },
          { text: "Serve" },
        ],
      },
      { name: "Cereal", instructions: [] },
    ]);
    const r = parseMealsCSV(csv);
    expect(r.warnings).toEqual([]);

    const tacos = r.meals.find((m) => m.name === "Tacos");
    expect(tacos?.instructions).toEqual([
      { text: "Warm the tortillas" },
      { text: "Add filling, then fold" },
      { text: "Serve" },
    ]);

    // An empty instruction list exports as an empty cell → undefined on import.
    const cereal = r.meals.find((m) => m.name === "Cereal");
    expect(cereal?.instructions).toBeUndefined();
  });

  it("round-trips steps with commas and semicolons through the quoted cell", () => {
    const csv = mealsToCSV([
      {
        name: "Stew",
        instructions: [
          { text: "Add carrots, celery; then onions" },
          { text: "Simmer, covered, 1 hour" },
        ],
      },
    ]);
    const r = parseMealsCSV(csv);
    const stew = r.meals.find((m) => m.name === "Stew");
    expect(stew?.instructions).toEqual([
      { text: "Add carrots, celery; then onions" },
      { text: "Simmer, covered, 1 hour" },
    ]);
  });
});
