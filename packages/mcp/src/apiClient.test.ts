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
    const { client, fetchFn } = makeClient(jsonResponse([]));
    await client.listMeals("fam-1", "taco");

    const { url } = lastCall(fetchFn);
    expect(url.toString()).not.toContain(AGENT_KEY);
  });

  it("listMeals GETs the agent meals endpoint with a search query", async () => {
    const meals = [{ id: "meal-1" }];
    const { client, fetchFn } = makeClient(jsonResponse(meals));

    const result = await client.listMeals("fam-1", "taco");

    const { url, init } = lastCall(fetchFn);
    expect(init.method).toBe("GET");
    expect(url.pathname).toBe("/api/agent/fam-1/meals");
    expect(url.searchParams.get("search")).toBe("taco");
    expect(result).toEqual(meals);
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
});
