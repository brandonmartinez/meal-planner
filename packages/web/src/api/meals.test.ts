import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import * as mealsApi from "./meals";

describe("meals api client", () => {
  it("listMeals encodes the search query string", async () => {
    let url = "";
    server.use(
      http.get("/api/families/f-1/meals", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [], total: 0, limit: 25, offset: 0, hasMore: false });
      }),
    );
    await mealsApi.listMeals("f-1", { search: "pizza & pasta" });
    expect(url).toContain("search=pizza+%26+pasta");
  });

  it("listMeals omits the query string when no search is provided", async () => {
    let url = "";
    server.use(
      http.get("/api/families/f-1/meals", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [], total: 0, limit: 25, offset: 0, hasMore: false });
      }),
    );
    await mealsApi.listMeals("f-1");
    expect(url).not.toContain("search=");
  });

  it("surfaces the parsed backend error message on non-OK", async () => {
    server.use(
      http.get("/api/families/f-1/meals", () =>
        HttpResponse.json({ error: "family not found" }, { status: 404 }),
      ),
    );
    await expect(mealsApi.listMeals("f-1")).rejects.toThrow(
      "family not found",
    );
  });

  it("falls back to an HTTP status message when the error body has none", async () => {
    server.use(
      http.get("/api/families/f-1/meals", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    await expect(mealsApi.listMeals("f-1")).rejects.toThrow(/HTTP 500/);
  });

  it("createMeal POSTs the payload", async () => {
    let body: unknown;
    server.use(
      http.post("/api/families/f-1/meals", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "m-1" });
      }),
    );
    await mealsApi.createMeal("f-1", { name: "Tacos" });
    expect(body).toEqual({ name: "Tacos" });
  });

  it("createMeal sends a chosen difficulty", async () => {
    let body: { difficulty?: unknown } = {};
    server.use(
      http.post("/api/families/f-1/meals", async ({ request }) => {
        body = (await request.json()) as { difficulty?: unknown };
        return HttpResponse.json({ id: "m-1" });
      }),
    );
    await mealsApi.createMeal("f-1", { name: "Tacos", difficulty: "MEDIUM" });
    expect(body.difficulty).toBe("MEDIUM");
  });

  it("updateMeal sends a null difficulty to clear it", async () => {
    let body: { difficulty?: unknown } = {};
    server.use(
      http.put("/api/families/f-1/meals/m-1", async ({ request }) => {
        body = (await request.json()) as { difficulty?: unknown };
        return HttpResponse.json({ id: "m-1" });
      }),
    );
    await mealsApi.updateMeal("f-1", "m-1", { name: "Soup", difficulty: null });
    expect(body.difficulty).toBeNull();
  });

  it("deleteMeal succeeds on 200", async () => {
    server.use(
      http.delete(
        "/api/families/f-1/meals/m-1",
        () => new HttpResponse(null, { status: 200 }),
      ),
    );
    await expect(mealsApi.deleteMeal("f-1", "m-1")).resolves.toBeUndefined();
  });

  it("importMeals returns the result body", async () => {
    server.use(
      http.post("/api/families/f-1/meals/import", () =>
        HttpResponse.json({ created: 2, updated: 0, skipped: 1, errors: [] }),
      ),
    );
    const r = await mealsApi.importMeals("f-1", [{ name: "A" }]);
    expect(r.created).toBe(2);
    expect(r.skipped).toBe(1);
  });

  it("importMeals surfaces server-provided error message", async () => {
    server.use(
      http.post("/api/families/f-1/meals/import", () =>
        HttpResponse.json({ error: "bad payload" }, { status: 400 }),
      ),
    );
    await expect(mealsApi.importMeals("f-1", [])).rejects.toThrow(
      "bad payload",
    );
  });

  it("listMeals appends a repeated tags param for each value (OR within facet)", async () => {
    let url = "";
    server.use(
      http.get("/api/families/f-1/meals", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [], total: 0, limit: 25, offset: 0, hasMore: false });
      }),
    );
    await mealsApi.listMeals("f-1", { tags: ["Weeknight", "Vegetarian"] });
    const params = new URL(url).searchParams;
    expect(params.getAll("tags")).toEqual(["Weeknight", "Vegetarian"]);
  });

  it("listMeals appends a repeated categories param for each value", async () => {
    let url = "";
    server.use(
      http.get("/api/families/f-1/meals", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [], total: 0, limit: 25, offset: 0, hasMore: false });
      }),
    );
    await mealsApi.listMeals("f-1", { categories: ["Dinner"] });
    expect(new URL(url).searchParams.getAll("categories")).toEqual(["Dinner"]);
  });

  it("listMeals combines tags, categories and difficulty facets (AND across facets)", async () => {
    let url = "";
    server.use(
      http.get("/api/families/f-1/meals", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [], total: 0, limit: 25, offset: 0, hasMore: false });
      }),
    );
    await mealsApi.listMeals("f-1", {
      tags: ["Weeknight"],
      categories: ["Dinner"],
      difficulty: ["EASY"],
    });
    const params = new URL(url).searchParams;
    expect(params.getAll("tags")).toEqual(["Weeknight"]);
    expect(params.getAll("categories")).toEqual(["Dinner"]);
    expect(params.getAll("difficulty")).toEqual(["EASY"]);
  });

  it("listMeals omits tags/categories params when none are provided", async () => {
    let url = "";
    server.use(
      http.get("/api/families/f-1/meals", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ items: [], total: 0, limit: 25, offset: 0, hasMore: false });
      }),
    );
    await mealsApi.listMeals("f-1", { tags: [], categories: [] });
    expect(url).not.toContain("tags=");
    expect(url).not.toContain("categories=");
  });

  it("createMeal includes tags and categories arrays in the body", async () => {
    let body: { tags?: unknown; categories?: unknown } = {};
    server.use(
      http.post("/api/families/f-1/meals", async ({ request }) => {
        body = (await request.json()) as { tags?: unknown; categories?: unknown };
        return HttpResponse.json({ id: "m-1" });
      }),
    );
    await mealsApi.createMeal("f-1", {
      name: "Tacos",
      tags: ["Weeknight"],
      categories: ["Dinner"],
    });
    expect(body.tags).toEqual(["Weeknight"]);
    expect(body.categories).toEqual(["Dinner"]);
  });

  it("updateMeal sends emptied tags/categories arrays to clear assignments", async () => {
    let body: { tags?: unknown; categories?: unknown } = {};
    server.use(
      http.put("/api/families/f-1/meals/m-1", async ({ request }) => {
        body = (await request.json()) as { tags?: unknown; categories?: unknown };
        return HttpResponse.json({ id: "m-1" });
      }),
    );
    await mealsApi.updateMeal("f-1", "m-1", { name: "Soup", tags: [], categories: [] });
    expect(body.tags).toEqual([]);
    expect(body.categories).toEqual([]);
  });
});
