import { describe, it, expect, vi } from "vitest";
import {
  createToolHandlers,
  registerTools,
  TOOL_SCOPES,
  type ToolResult,
} from "./tools.js";
import { ApiError, ApiTransportError } from "./errors.js";
import type { MealPlannerApiClient } from "./apiClient.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** A stub API client whose methods are individually mockable. */
function stubClient() {
  return {
    getAgentMe: vi.fn(),
    listMeals: vi.fn(),
    getCurrentWeekPlan: vi.fn(),
    getWeekPlan: vi.fn(),
    getPreviousWeekPlans: vi.fn(),
    scheduleMeal: vi.fn(),
    approveSuggestion: vi.fn(),
    createMeal: vi.fn(),
    updateMeal: vi.fn(),
    getCurrentGroceryList: vi.fn(),
  };
}

function textOf(result: ToolResult): string {
  return result.content.map((c) => c.text).join("");
}

const FAMILY = "fam-1";

describe("createToolHandlers", () => {
  it("list_meals forwards the family + opts and returns envelope JSON text", async () => {
    const client = stubClient();
    const envelope = {
      items: [
        {
          id: "meal-1",
          recentlyScheduled: false,
          lastScheduledOn: null,
          lastCookedOn: "2026-06-15",
          timesCooked: 5,
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    };
    client.listMeals.mockResolvedValue(envelope);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.list_meals({ search: "taco" });

    expect(client.listMeals).toHaveBeenCalledWith(FAMILY, {
      search: "taco",
      difficulty: undefined,
      favorite: undefined,
      minRating: undefined,
      sort: undefined,
      order: undefined,
      limit: undefined,
      offset: undefined,
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual(envelope);
    // Cook-history fields flow through the MCP list_meals surface (parity rows 7/8).
    expect(parsed.items[0].lastCookedOn).toBe("2026-06-15");
    expect(parsed.items[0].timesCooked).toBe(5);
  });

  it("list_meals forwards difficulty, sort, order, limit, offset to the client", async () => {
    const client = stubClient();
    const envelope = { items: [], total: 0, limit: 10, offset: 0, hasMore: false };
    client.listMeals.mockResolvedValue(envelope);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.list_meals({
      difficulty: ["EASY", "HARD"],
      sort: "lastCooked",
      order: "desc",
      limit: 10,
      offset: 0,
    });

    expect(client.listMeals).toHaveBeenCalledWith(FAMILY, {
      search: undefined,
      difficulty: ["EASY", "HARD"],
      favorite: undefined,
      minRating: undefined,
      sort: "lastCooked",
      order: "desc",
      limit: 10,
      offset: 0,
    });
  });

  it("list_meals forwards favorite and minRating to the client", async () => {
    const client = stubClient();
    const envelope = { items: [], total: 0, limit: 25, offset: 0, hasMore: false };
    client.listMeals.mockResolvedValue(envelope);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.list_meals({ favorite: true, minRating: 4 });

    expect(client.listMeals).toHaveBeenCalledWith(FAMILY, {
      search: undefined,
      difficulty: undefined,
      favorite: true,
      minRating: 4,
      sort: undefined,
      order: undefined,
      limit: undefined,
      offset: undefined,
    });
  });

  it("list_meals forwards tag and category filters to the client (#107, parity rows 7/8)", async () => {
    const client = stubClient();
    const envelope = { items: [], total: 0, limit: 25, offset: 0, hasMore: false };
    client.listMeals.mockResolvedValue(envelope);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.list_meals({
      tags: ["Quick", "Weeknight"],
      categories: ["Dinner"],
    });

    expect(client.listMeals).toHaveBeenCalledWith(FAMILY, {
      search: undefined,
      difficulty: undefined,
      favorite: undefined,
      minRating: undefined,
      tags: ["Quick", "Weeknight"],
      categories: ["Dinner"],
      sort: undefined,
      order: undefined,
      limit: undefined,
      offset: undefined,
    });
  });

  it("get_current_week_plan calls the client with the family", async () => {
    const client = stubClient();
    client.getCurrentWeekPlan.mockResolvedValue({ id: "wp-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.get_current_week_plan();
    expect(client.getCurrentWeekPlan).toHaveBeenCalledWith(FAMILY);
  });

  it("get_previous_week_plans passes before + limit through", async () => {
    const client = stubClient();
    client.getPreviousWeekPlans.mockResolvedValue({ weeks: [] });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.get_previous_week_plans({ before: "2026-06-29", limit: 5 });
    expect(client.getPreviousWeekPlans).toHaveBeenCalledWith(FAMILY, {
      before: "2026-06-29",
      limit: 5,
    });
  });

  it("schedule_meal forwards the mealId + date", async () => {
    const client = stubClient();
    client.scheduleMeal.mockResolvedValue({ id: "s-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.schedule_meal({ mealId: "meal-1", date: "2026-06-30" });
    expect(client.scheduleMeal).toHaveBeenCalledWith(FAMILY, {
      mealId: "meal-1",
      date: "2026-06-30",
    });
  });

  it("approve_suggestion forwards the suggestionId", async () => {
    const client = stubClient();
    client.approveSuggestion.mockResolvedValue({ id: "s-1", approved: true });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.approve_suggestion({ suggestionId: "s-1" });
    expect(client.approveSuggestion).toHaveBeenCalledWith(FAMILY, "s-1");
  });

  it("create_meal forwards the structured recipe (no familyId in the call)", async () => {
    const client = stubClient();
    client.createMeal.mockResolvedValue({ id: "meal-new" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

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
    const result = await handlers.create_meal(input);

    expect(client.createMeal).toHaveBeenCalledWith(input);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual({ id: "meal-new" });
  });

  it("create_meal forwards tags and categories by name (#107, parity row 7)", async () => {
    const client = stubClient();
    client.createMeal.mockResolvedValue({ id: "meal-new" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const input = {
      name: "Tacos",
      tags: ["Quick", "Weeknight"],
      categories: ["Dinner"],
    };
    await handlers.create_meal(input);

    expect(client.createMeal).toHaveBeenCalledWith(input);
  });

  it("create_meal forwards ordered instructions (#100, parity row 7)", async () => {
    const client = stubClient();
    client.createMeal.mockResolvedValue({ id: "meal-new" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const input = {
      name: "Tacos",
      instructions: [
        { text: "Warm the tortillas" },
        { text: "Assemble", timerMinutes: 2 },
      ],
    };
    await handlers.create_meal(input);

    // Steps forwarded verbatim, in order — the API assigns position by index.
    expect(client.createMeal).toHaveBeenCalledWith(input);
  });

  it("update_meal splits mealId from the patch body", async () => {
    const client = stubClient();
    client.updateMeal.mockResolvedValue({ id: "meal-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.update_meal({ mealId: "meal-1", name: "Better Tacos" });
    expect(client.updateMeal).toHaveBeenCalledWith("meal-1", {
      name: "Better Tacos",
    });
  });

  it("update_meal forwards core metadata and null-clearing (mealId stripped)", async () => {
    const client = stubClient();
    client.updateMeal.mockResolvedValue({ id: "meal-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.update_meal({
      mealId: "meal-1",
      prepTimeMinutes: 15,
      cookTimeMinutes: null,
      servings: 6,
      sourceUrl: null,
      imageUrl: null,
      notes: "Simmer low",
    });
    expect(client.updateMeal).toHaveBeenCalledWith("meal-1", {
      prepTimeMinutes: 15,
      cookTimeMinutes: null,
      servings: 6,
      sourceUrl: null,
      imageUrl: null,
      notes: "Simmer low",
    });
  });

  it("update_meal forwards favorite and a null-cleared rating (mealId stripped)", async () => {
    const client = stubClient();
    client.updateMeal.mockResolvedValue({ id: "meal-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.update_meal({
      mealId: "meal-1",
      favorite: false,
      rating: null,
    });
    expect(client.updateMeal).toHaveBeenCalledWith("meal-1", {
      favorite: false,
      rating: null,
    });
  });

  it("update_meal forwards tags and clears categories with [] (#107, parity row 7)", async () => {
    const client = stubClient();
    client.updateMeal.mockResolvedValue({ id: "meal-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.update_meal({
      mealId: "meal-1",
      tags: ["Quick"],
      categories: [],
    });
    expect(client.updateMeal).toHaveBeenCalledWith("meal-1", {
      tags: ["Quick"],
      categories: [],
    });
  });

  it("update_meal forwards a replacement instruction list (#100, parity row 7)", async () => {
    const client = stubClient();
    client.updateMeal.mockResolvedValue({ id: "meal-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.update_meal({
      mealId: "meal-1",
      instructions: [{ text: "First" }, { text: "Second", timerMinutes: 5 }],
    });
    expect(client.updateMeal).toHaveBeenCalledWith("meal-1", {
      instructions: [{ text: "First" }, { text: "Second", timerMinutes: 5 }],
    });
  });

  it("get_current_grocery_list calls the family-from-key client method", async () => {
    const client = stubClient();
    client.getCurrentGroceryList.mockResolvedValue({ id: "gl-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.get_current_grocery_list();
    expect(client.getCurrentGroceryList).toHaveBeenCalledWith();
    expect(JSON.parse(textOf(result))).toEqual({ id: "gl-1" });
  });

  it("surfaces an out-of-scope create_meal as a 403 tool error (never throws)", async () => {
    const client = stubClient();
    client.createMeal.mockRejectedValue(
      new ApiError(403, "Insufficient scope"),
    );
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.create_meal({ name: "Tacos" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("API error 403: Insufficient scope");
  });

  it("maps an ApiError to an isError tool result with status + message", async () => {
    const client = stubClient();
    client.approveSuggestion.mockRejectedValue(
      new ApiError(403, "Insufficient scope"),
    );
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.approve_suggestion({ suggestionId: "s-1" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("API error 403: Insufficient scope");
  });

  it("maps a transport error to an isError 'API unreachable' result", async () => {
    const client = stubClient();
    client.getCurrentWeekPlan.mockRejectedValue(
      new ApiTransportError("ECONNREFUSED"),
    );
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.get_current_week_plan();
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("API unreachable: ECONNREFUSED");
  });

  it("never leaks the agent key: only ApiError/message text is surfaced", async () => {
    const client = stubClient();
    // Even if an unexpected error carried a message, the handler only prints
    // its `.message` — the client owns the key and never puts it in errors.
    client.listMeals.mockRejectedValue(new Error("boom"));
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );
    const result = await handlers.list_meals({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unexpected error: boom");
  });
});

describe("registerTools", () => {
  it("registers all nine meal-planning tools", () => {
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;
    const client = stubClient();

    registerTools(fakeServer, client as unknown as MealPlannerApiClient, FAMILY);

    const names = registerTool.mock.calls.map((c) => c[0]);
    expect(names).toEqual([
      "list_meals",
      "get_current_week_plan",
      "get_week_plan",
      "get_previous_week_plans",
      "schedule_meal",
      "approve_suggestion",
      "create_meal",
      "update_meal",
      "get_current_grocery_list",
    ]);
    // Each registration provides a config with an inputSchema and a handler.
    for (const call of registerTool.mock.calls) {
      expect(call[1]).toHaveProperty("inputSchema");
      expect(typeof call[2]).toBe("function");
    }
  });

  it("documents the tag/category filter facets in the list_meals description (#107, parity row 8)", () => {
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;
    const client = stubClient();

    registerTools(fakeServer, client as unknown as MealPlannerApiClient, FAMILY);

    const listMealsCall = registerTool.mock.calls.find(
      (c) => c[0] === "list_meals",
    );
    expect(listMealsCall).toBeDefined();
    const description = (listMealsCall?.[1] as { description: string })
      .description;
    // Row 8: the tool description must advertise the new filter facets so an
    // agent knows tag/category filtering exists and how it composes.
    expect(description).toContain("tag filter");
    expect(description).toContain("category filter");
    // OR-within-facet / AND-across-facets semantics are documented.
    expect(description).toMatch(/OR'd/);
    expect(description).toMatch(/AND'd/);

    // The input schema exposes tags + categories filter params.
    const schema = (listMealsCall?.[1] as { inputSchema: Record<string, unknown> })
      .inputSchema;
    expect(schema).toHaveProperty("tags");
    expect(schema).toHaveProperty("categories");
  });

  it("documents instruction replace-all in the update_meal description and schema (#100, parity row 8)", () => {
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;
    const client = stubClient();

    registerTools(fakeServer, client as unknown as MealPlannerApiClient, FAMILY);

    const updateMealCall = registerTool.mock.calls.find(
      (c) => c[0] === "update_meal",
    );
    expect(updateMealCall).toBeDefined();
    const description = (updateMealCall?.[1] as { description: string })
      .description;
    // Row 8: agents must be told that passing instructions REPLACES the list.
    expect(description).toContain("instructions` REPLACES");

    // Both write tools expose an instructions param in their input schema.
    const updateSchema = (
      updateMealCall?.[1] as { inputSchema: Record<string, unknown> }
    ).inputSchema;
    expect(updateSchema).toHaveProperty("instructions");
    const createMealCall = registerTool.mock.calls.find(
      (c) => c[0] === "create_meal",
    );
    const createSchema = (
      createMealCall?.[1] as { inputSchema: Record<string, unknown> }
    ).inputSchema;
    expect(createSchema).toHaveProperty("instructions");
  });
});

describe("TOOL_SCOPES", () => {
  it("documents the least-privilege scope for each tool", () => {
    expect(TOOL_SCOPES).toEqual({
      list_meals: "meal_plan:read",
      get_current_week_plan: "meal_plan:read",
      get_week_plan: "meal_plan:read",
      get_previous_week_plans: "meal_plan:read",
      schedule_meal: "meal_plan:schedule",
      approve_suggestion: "meal_plan:approve",
      create_meal: "meal:write",
      update_meal: "meal:write",
      get_current_grocery_list: "meal_plan:read",
    });
  });
});
