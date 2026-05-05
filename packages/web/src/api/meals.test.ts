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
        return HttpResponse.json([]);
      }),
    );
    await mealsApi.listMeals("f-1", "pizza & pasta");
    expect(url).toContain("search=pizza%20%26%20pasta");
  });

  it("listMeals omits the query string when no search is provided", async () => {
    let url = "";
    server.use(
      http.get("/api/families/f-1/meals", ({ request }) => {
        url = request.url;
        return HttpResponse.json([]);
      }),
    );
    await mealsApi.listMeals("f-1");
    expect(url).not.toContain("search=");
  });

  it("throws when the server returns non-OK", async () => {
    server.use(
      http.get("/api/families/f-1/meals", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    await expect(mealsApi.listMeals("f-1")).rejects.toThrow(/Failed to fetch/);
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
});
