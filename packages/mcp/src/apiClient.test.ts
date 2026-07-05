import { describe, it, expect, vi } from "vitest";
import { MealPlannerApiClient } from "./apiClient.js";
import { ApiError, ApiTransportError } from "./errors.js";

const AGENT_KEY = "secret-agent-key";
const BASE_URL = "http://localhost:3001";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Build a client whose fetch is a mock returning `response`, plus a handle to
 *  the mock so the test can inspect the request that was made. */
function makeClient(response: Response | (() => Promise<Response>)) {
  const fetchFn = vi.fn(async () =>
    typeof response === "function" ? response() : response,
  ) as unknown as typeof fetch;
  const client = new MealPlannerApiClient({
    baseUrl: BASE_URL,
    agentKey: AGENT_KEY,
    fetchFn,
    timeoutMs: 1000,
  });
  return { client, fetchFn: fetchFn as unknown as ReturnType<typeof vi.fn> };
}

/** Extract the (url, init) the client passed to fetch. */
function lastCall(fetchFn: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
  return { url, init };
}

describe("MealPlannerApiClient", () => {
  it("attaches the x-agent-key header on every request", async () => {
    const { client, fetchFn } = makeClient(jsonResponse([]));
    await client.listMeals("fam-1");

    const { init } = lastCall(fetchFn);
    const headers = init.headers as Record<string, string>;
    expect(headers["x-agent-key"]).toBe(AGENT_KEY);
  });

  it("never places the agent key in the URL or query string", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ items: [], total: 0, limit: 25, offset: 0, hasMore: false }));
    await client.listMeals("fam-1", { search: "taco" });

    const { url } = lastCall(fetchFn);
    expect(url.toString()).not.toContain(AGENT_KEY);
  });

  it("listMeals GETs the agent meals endpoint with a search query and returns the envelope", async () => {
    const envelope = { items: [{ id: "meal-1" }], total: 1, limit: 25, offset: 0, hasMore: false };
    const { client, fetchFn } = makeClient(jsonResponse(envelope));

    const result = await client.listMeals("fam-1", { search: "taco" });

    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("GET");
    expect(url.pathname).toBe("/api/agent/fam-1/meals");
    expect(url.searchParams.get("search")).toBe("taco");
    expect(result).toEqual(envelope);
  });

  it("listMeals serialises difficulty as repeated query params", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ items: [], total: 0, limit: 25, offset: 0, hasMore: false }));
    await client.listMeals("fam-1", { difficulty: ["EASY", "HARD"] });

    const { url } = lastCall(fetchFn);
    expect(url.searchParams.getAll("difficulty")).toEqual(["EASY", "HARD"]);
  });

  it("listMeals serialises tags as repeated query params (#107)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ items: [], total: 0, limit: 25, offset: 0, hasMore: false }));
    await client.listMeals("fam-1", {
      tags: ["Quick", "Weeknight"],
    });

    const { url } = lastCall(fetchFn);
    expect(url.searchParams.getAll("tags")).toEqual(["Quick", "Weeknight"]);
  });

  it("listMeals serialises collections as repeated query params (#109)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ items: [], total: 0, limit: 25, offset: 0, hasMore: false }));
    await client.listMeals("fam-1", {
      collections: ["Weeknight Dinners", "Family Favorites"],
    });

    const { url } = lastCall(fetchFn);
    expect(url.searchParams.getAll("collections")).toEqual([
      "Weeknight Dinners",
      "Family Favorites",
    ]);
  });

  it("listMeals omits collections when empty or absent (#109)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ items: [], total: 0, limit: 25, offset: 0, hasMore: false }));
    await client.listMeals("fam-1", { collections: [] });

    const { url } = lastCall(fetchFn);
    expect(url.searchParams.has("collections")).toBe(false);
  });

  it("listMeals serialises sort, order, limit, offset as query params", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ items: [], total: 0, limit: 10, offset: 5, hasMore: false }));
    await client.listMeals("fam-1", { sort: "lastCooked", order: "desc", limit: 10, offset: 5 });

    const { url } = lastCall(fetchFn);
    expect(url.searchParams.get("sort")).toBe("lastCooked");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("5");
  });

  it("listMeals serialises favorite and minRating as query params", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ items: [], total: 0, limit: 25, offset: 0, hasMore: false }));
    await client.listMeals("fam-1", { favorite: true, minRating: 4 });

    const { url } = lastCall(fetchFn);
    expect(url.searchParams.get("favorite")).toBe("true");
    expect(url.searchParams.get("minRating")).toBe("4");
  });

  it("listMeals omits favorite and minRating when not provided", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ items: [], total: 0, limit: 25, offset: 0, hasMore: false }));
    await client.listMeals("fam-1", { search: "taco" });

    const { url } = lastCall(fetchFn);
    expect(url.searchParams.has("favorite")).toBe(false);
    expect(url.searchParams.has("minRating")).toBe(false);
  });

  it("listMeals omits the search param when not provided", async () => {
    const { client, fetchFn } = makeClient(jsonResponse([]));
    await client.listMeals("fam-1");
    const { url } = lastCall(fetchFn);
    expect(url.searchParams.has("search")).toBe(false);
  });

  it("getCurrentWeekPlan GETs /weeks/current", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "wp-1" }));
    await client.getCurrentWeekPlan("fam-1");
    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("GET");
    expect(url.pathname).toBe("/api/agent/fam-1/weeks/current");
  });

  it("getWeekPlan GETs /weeks/:weekStart", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "wp-1" }));
    await client.getWeekPlan("fam-1", "2026-06-29");
    const { url } = lastCall(fetchFn);
    expect(url.pathname).toBe("/api/agent/fam-1/weeks/2026-06-29");
  });

  it("getPreviousWeekPlans GETs /weeks with before + limit", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ weeks: [] }));
    await client.getPreviousWeekPlans("fam-1", {
      before: "2026-06-29",
      limit: 5,
    });
    const { url } = lastCall(fetchFn);
    expect(url.pathname).toBe("/api/agent/fam-1/weeks");
    expect(url.searchParams.get("before")).toBe("2026-06-29");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("scheduleMeal POSTs a JSON body with content-type", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "s-1" }, 201));
    await client.scheduleMeal("fam-1", {
      mealId: "meal-1",
      date: "2026-06-30",
    });
    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("POST");
    expect(url.pathname).toBe("/api/agent/fam-1/schedule");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      mealId: "meal-1",
      date: "2026-06-30",
    });
  });

  it("repeatWeek POSTs to the target week's repeat endpoint with source + mode", async () => {
    const { client, fetchFn } = makeClient(
      jsonResponse({ weekStart: "2026-07-06", days: [] }, 201),
    );
    await client.repeatWeek("fam-1", "2026-07-06", "2026-06-29", "skip");
    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("POST");
    expect(url.pathname).toBe("/api/agent/fam-1/weeks/2026-07-06/repeat");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      sourceWeekStart: "2026-06-29",
      existingMode: "skip",
    });
  });

  it("repeatWeek omits existingMode from the body when not provided", async () => {
    const { client, fetchFn } = makeClient(
      jsonResponse({ weekStart: "2026-07-06", days: [] }, 201),
    );
    await client.repeatWeek("fam-1", "2026-07-06", "2026-06-29");
    const { init } = lastCall(fetchFn);
    // undefined existingMode is dropped by JSON serialisation → server default.
    expect(JSON.parse(init.body as string)).toEqual({
      sourceWeekStart: "2026-06-29",
    });
  });

  it("repeatWeek encodes the target week path segment", async () => {
    const { client, fetchFn } = makeClient(
      jsonResponse({ weekStart: "x", days: [] }, 201),
    );
    await client.repeatWeek("fam-1", "a/b", "2026-06-29");
    const { url } = lastCall(fetchFn);
    expect(url.pathname).toBe("/api/agent/fam-1/weeks/a%2Fb/repeat");
  });

  it("listTemplates GETs the family templates and unwraps the envelope (#116)", async () => {
    const templates = [
      {
        id: "tmpl-1",
        familyId: "fam-1",
        name: "Taco Tuesday",
        entries: [{ id: "e-1", dayOfWeek: 1, mealId: "meal-1" }],
      },
    ];
    const { client, fetchFn } = makeClient(jsonResponse({ templates }));

    const result = await client.listTemplates("fam-1");

    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("GET");
    expect(url.pathname).toBe("/api/agent/fam-1/templates");
    // The client unwraps the { templates } envelope and returns the array.
    expect(result).toEqual(templates);
  });

  it("applyTemplate POSTs to the template apply endpoint with target + mode (#116)", async () => {
    const { client, fetchFn } = makeClient(
      jsonResponse({ weekStart: "2026-07-06", days: [] }, 201),
    );
    await client.applyTemplate("fam-1", "tmpl-1", "2026-07-06", "replace");
    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("POST");
    expect(url.pathname).toBe("/api/agent/fam-1/templates/tmpl-1/apply");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      targetWeekStart: "2026-07-06",
      existingMode: "replace",
    });
  });

  it("applyTemplate omits existingMode from the body when not provided (#116)", async () => {
    const { client, fetchFn } = makeClient(
      jsonResponse({ weekStart: "2026-07-06", days: [] }, 201),
    );
    await client.applyTemplate("fam-1", "tmpl-1", "2026-07-06");
    const { init } = lastCall(fetchFn);
    // undefined existingMode is dropped by JSON serialisation → server default.
    expect(JSON.parse(init.body as string)).toEqual({
      targetWeekStart: "2026-07-06",
    });
  });

  it("applyTemplate encodes the template id path segment (#116)", async () => {
    const { client, fetchFn } = makeClient(
      jsonResponse({ weekStart: "x", days: [] }, 201),
    );
    await client.applyTemplate("fam-1", "a/b", "2026-07-06");
    const { url } = lastCall(fetchFn);
    expect(url.pathname).toBe("/api/agent/fam-1/templates/a%2Fb/apply");
  });

  it("approveSuggestion PATCHes the approve endpoint", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "s-1" }));
    await client.approveSuggestion("fam-1", "s-1");
    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("PATCH");
    expect(url.pathname).toBe("/api/agent/fam-1/suggestions/s-1/approve");
  });

  it("encodes path segments to prevent traversal/injection", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "s-1" }));
    await client.approveSuggestion("fam-1", "a/b?x=1");
    const { url } = lastCall(fetchFn);
    expect(url.pathname).toBe("/api/agent/fam-1/suggestions/a%2Fb%3Fx%3D1/approve");
  });

  it("getAgentMe GETs /api/agent/me (no family in the path) and returns identity", async () => {
    const identity = {
      familyId: "fam-1",
      scopes: ["meal:write"],
      name: "planner-bot",
    };
    const { client, fetchFn } = makeClient(jsonResponse(identity));

    const result = await client.getAgentMe();

    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("GET");
    expect(url.pathname).toBe("/api/agent/me");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-agent-key"]).toBe(AGENT_KEY);
    expect(result).toEqual(identity);
  });

  it("createMeal POSTs the structured meal to /api/agent/meals (family-from-key)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-new" }, 201));
    const input = {
      name: "Tacos",
      difficulty: "EASY" as const,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      servings: 4,
      sourceUrl: "https://example.com/tacos",
      imageUrl: "https://cdn.example.com/tacos.jpg",
      notes: "Use fresh cilantro",
      favorite: true,
      rating: 5,
      ingredients: [{ name: "tortillas", category: "bakery" }],
    };

    await client.createMeal(input);

    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("POST");
    expect(url.pathname).toBe("/api/agent/meals");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("createMeal forwards tags by name in the body (#107)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-new" }, 201));
    const input = {
      name: "Tacos",
      tags: ["Quick", "Weeknight"],
    };

    await client.createMeal(input);

    const { init } = lastCall(fetchFn);
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("createMeal forwards ordered instructions in the body (#100)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-new" }, 201));
    const input = {
      name: "Tacos",
      instructions: [
        { text: "Warm the tortillas" },
        { text: "Assemble", timerMinutes: 2 },
      ],
    };

    await client.createMeal(input);

    const { init } = lastCall(fetchFn);
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("updateMeal sends a PATCH with the partial body", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-1" }));

    await client.updateMeal("meal-1", { name: "Better Tacos" });

    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("PATCH");
    expect(url.pathname).toBe("/api/agent/meals/meal-1");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Better Tacos" });
  });

  it("updateMeal forwards core metadata and explicit null-clearing verbatim", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-1" }));

    const patch = {
      prepTimeMinutes: 15,
      cookTimeMinutes: null,
      servings: 6,
      sourceUrl: null,
      imageUrl: null,
      notes: "Simmer low",
    };
    await client.updateMeal("meal-1", patch);

    const { init } = lastCall(fetchFn);
    expect(JSON.parse(init.body as string)).toEqual(patch);
  });

  it("updateMeal forwards favorite and a null-cleared rating verbatim", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-1" }));

    const patch = { favorite: false, rating: null };
    await client.updateMeal("meal-1", patch);

    const { init } = lastCall(fetchFn);
    expect(JSON.parse(init.body as string)).toEqual(patch);
  });

  it("updateMeal forwards tags and clears them with [] verbatim (#107)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-1" }));

    const patch = { tags: [] };
    await client.updateMeal("meal-1", patch);

    const { init } = lastCall(fetchFn);
    expect(JSON.parse(init.body as string)).toEqual(patch);
  });

  it("createMeal forwards collections by name in the body (#109)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-new" }, 201));
    const input = {
      name: "Tacos",
      collections: ["Weeknight Dinners", "Family Favorites"],
    };

    await client.createMeal(input);

    const { init } = lastCall(fetchFn);
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it("updateMeal forwards collections and clears them with [] verbatim (#109)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-1" }));

    const patch = { collections: [] };
    await client.updateMeal("meal-1", patch);

    const { init } = lastCall(fetchFn);
    expect(JSON.parse(init.body as string)).toEqual(patch);
  });

  it("updateMeal forwards a replacement instruction list verbatim (#100)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "meal-1" }));

    const patch = {
      instructions: [{ text: "First" }, { text: "Second", timerMinutes: 5 }],
    };
    await client.updateMeal("meal-1", patch);

    const { init } = lastCall(fetchFn);
    expect(JSON.parse(init.body as string)).toEqual(patch);
  });

  it("updateMeal URL-encodes the meal id in the path", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "x" }));
    await client.updateMeal("a/b", { name: "X" });
    const { url } = lastCall(fetchFn);
    expect(url.pathname).toBe("/api/agent/meals/a%2Fb");
  });

  it("getCurrentGroceryList GETs /api/agent/grocery/current (family-from-key)", async () => {
    const { client, fetchFn } = makeClient(jsonResponse({ id: "gl-1" }));

    const result = await client.getCurrentGroceryList();

    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("GET");
    expect(url.pathname).toBe("/api/agent/grocery/current");
    expect(result).toEqual({ id: "gl-1" });
  });

  it("listCollections GETs the family collections and unwraps the envelope (#109)", async () => {
    const collections = [
      { id: "c-1", name: "Weeknight Dinners", familyId: "fam-1" },
      { id: "c-2", name: "Holiday Baking", familyId: "fam-1", description: "Cookies" },
    ];
    const { client, fetchFn } = makeClient(jsonResponse({ collections }));

    const result = await client.listCollections("fam-1");

    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("GET");
    expect(url.pathname).toBe("/api/agent/fam-1/collections");
    // The client unwraps the { collections } envelope and returns the array.
    expect(result).toEqual(collections);
  });

  it("maps a non-2xx response to an ApiError carrying status + message", async () => {
    const { client } = makeClient(
      jsonResponse({ error: "Insufficient scope" }, 403),
    );
    await expect(client.scheduleMeal("fam-1", {
      mealId: "m",
      date: "2026-06-30",
    })).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: "Insufficient scope",
    });
  });

  it("maps validation details from the API error body", async () => {
    const { client } = makeClient(
      jsonResponse(
        { error: "Validation failed", details: [{ path: ["date"] }] },
        400,
      ),
    );
    let caught: unknown;
    try {
      await client.scheduleMeal("fam-1", { mealId: "m", date: "bad" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).details).toEqual([{ path: ["date"] }]);
  });

  it("maps a thrown fetch (network failure) to an ApiTransportError", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new MealPlannerApiClient({
      baseUrl: BASE_URL,
      agentKey: AGENT_KEY,
      fetchFn,
    });
    await expect(client.getCurrentWeekPlan("fam-1")).rejects.toBeInstanceOf(
      ApiTransportError,
    );
  });

  describe("uploadMealImage (meal:image)", () => {
    // Base64 for a short PNG magic-byte sequence.
    const PNG_B64 = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
    ]).toString("base64");

    it("POSTs decoded bytes as application/octet-stream to the meal image endpoint", async () => {
      const { client, fetchFn } = makeClient(
        jsonResponse(
          {
            id: "asset-1",
            mealId: "meal-1",
            contentType: "image/png",
            byteSize: 10,
            createdAt: "2026-07-05T00:00:00.000Z",
          },
          201,
        ),
      );

      const result = await client.uploadMealImage(
        "meal-1",
        PNG_B64,
        "image/png",
      );

      const { url, init } = lastCall(fetchFn);
      expect(init.method).toBe("POST");
      expect(url.pathname).toBe("/api/agent/meals/meal-1/image");
      const headers = init.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("application/octet-stream");
      // The declared type rides along only as an informational header.
      expect(headers["x-image-content-type"]).toBe("image/png");
      expect(headers["x-agent-key"]).toBe(AGENT_KEY);
      // The body is the DECODED bytes, not the base64 string.
      const sentBytes = new Uint8Array(init.body as ArrayBuffer);
      expect(Array.from(sentBytes)).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
      ]);
      expect(result).toMatchObject({ id: "asset-1", mealId: "meal-1" });
    });

    it("never places the agent key in the URL", async () => {
      const { client, fetchFn } = makeClient(
        jsonResponse({ id: "asset-1" }, 201),
      );
      await client.uploadMealImage("meal-1", PNG_B64, "image/png");
      const { url } = lastCall(fetchFn);
      expect(url.toString()).not.toContain(AGENT_KEY);
    });

    it("percent-encodes the meal id in the path", async () => {
      const { client, fetchFn } = makeClient(
        jsonResponse({ id: "asset-1" }, 201),
      );
      await client.uploadMealImage("a/b", PNG_B64, "image/png");
      const { url } = lastCall(fetchFn);
      expect(url.pathname).toBe("/api/agent/meals/a%2Fb/image");
    });

    it("maps a non-ok response to an ApiError", async () => {
      const { client } = makeClient(
        jsonResponse({ error: "Image exceeds maximum size" }, 413),
      );
      await expect(
        client.uploadMealImage("meal-1", PNG_B64, "image/png"),
      ).rejects.toBeInstanceOf(ApiError);
    });
  });
});
