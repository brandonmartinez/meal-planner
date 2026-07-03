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
    repeatWeek: vi.fn(),
    approveSuggestion: vi.fn(),
    createMeal: vi.fn(),
    updateMeal: vi.fn(),
    getCurrentGroceryList: vi.fn(),
    listCollections: vi.fn(),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    listTemplates: vi.fn(),
    listGroceryCategories: vi.fn(),
    applyTemplate: vi.fn(),
    fillWeek: vi.fn(),
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

  it("repeat_week forwards target/source week starts + existingMode (row 7/8)", async () => {
    const client = stubClient();
    client.repeatWeek.mockResolvedValue({ weekStart: "2026-07-06", days: [] });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.repeat_week({
      targetWeekStart: "2026-07-06",
      sourceWeekStart: "2026-06-29",
      existingMode: "skip",
    });
    // Positional client signature: (familyId, target, source, existingMode?).
    expect(client.repeatWeek).toHaveBeenCalledWith(
      FAMILY,
      "2026-07-06",
      "2026-06-29",
      "skip",
    );
  });

  it("repeat_week omits existingMode when not provided (defaults server-side)", async () => {
    const client = stubClient();
    client.repeatWeek.mockResolvedValue({ weekStart: "2026-07-06", days: [] });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.repeat_week({
      targetWeekStart: "2026-07-06",
      sourceWeekStart: "2026-06-29",
    });
    expect(client.repeatWeek).toHaveBeenCalledWith(
      FAMILY,
      "2026-07-06",
      "2026-06-29",
      undefined,
    );
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

  it("create_meal forwards a custom (non-default) ingredient category string (#119, backward-compat contract)", async () => {
    const client = stubClient();
    client.createMeal.mockResolvedValue({ id: "meal-new" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    // #119 relaxed the ingredient category from a closed enum to an open
    // string: a family-defined category outside INGREDIENT_CATEGORIES must
    // pass through untouched (no enum rejection, no coercion).
    const input = {
      name: "Tacos",
      ingredients: [{ name: "hot sauce", category: "brandon's condiments" }],
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

  it("create_meal forwards collections by name (#109, parity row 7)", async () => {
    const client = stubClient();
    client.createMeal.mockResolvedValue({ id: "meal-new" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const input = {
      name: "Tacos",
      collections: ["Weeknight Dinners", "Family Favorites"],
    };
    await handlers.create_meal(input);

    expect(client.createMeal).toHaveBeenCalledWith(input);
  });

  it("update_meal forwards collections and clears them with [] (#109, parity row 7)", async () => {
    const client = stubClient();
    client.updateMeal.mockResolvedValue({ id: "meal-1" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.update_meal({
      mealId: "meal-1",
      collections: [],
    });
    expect(client.updateMeal).toHaveBeenCalledWith("meal-1", {
      collections: [],
    });
  });

  it("list_collections forwards the family and returns the envelope JSON (#109, parity row 8)", async () => {
    const client = stubClient();
    const collections = [
      { id: "col-1", name: "Weeknight Dinners", description: "Fast meals" },
      { id: "col-2", name: "Holiday Baking", description: null },
    ];
    client.listCollections.mockResolvedValue(collections);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.list_collections();

    expect(client.listCollections).toHaveBeenCalledWith(FAMILY);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual(collections);
    // Row 8: the description surface exposes each collection's blurb.
    expect(parsed[0].description).toBe("Fast meals");
  });

  it("create_collection creates a collection with name/description (#112, parity row 8)", async () => {
    const client = stubClient();
    const collection = { id: "col-new", name: "Summer Grilling", description: "BBQ meals" };
    client.createCollection.mockResolvedValue(collection);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.create_collection({ name: "Summer Grilling", description: "BBQ meals" });

    expect(client.createCollection).toHaveBeenCalledWith({
      name: "Summer Grilling",
      description: "BBQ meals",
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual(collection);
  });

  it("create_collection with mealIds sets membership (#112)", async () => {
    const client = stubClient();
    const collection = { id: "col-new", name: "Weeknight", description: null };
    client.createCollection.mockResolvedValue(collection);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.create_collection({ name: "Weeknight", mealIds: ["meal-1", "meal-2"] });

    expect(client.createCollection).toHaveBeenCalledWith({
      name: "Weeknight",
      mealIds: ["meal-1", "meal-2"],
    });
    expect(result.isError).toBeUndefined();
  });

  it("create_collection surfaces a 422 cross-family meal error as isError (#112)", async () => {
    const client = stubClient();
    client.createCollection.mockRejectedValue(
      new ApiError(422, "One or more meals do not belong to this family"),
    );
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.create_collection({ name: "Bad", mealIds: ["foreign-meal"] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/422|meals do not belong/i);
  });

  it("update_collection updates a collection by id (#112, parity row 8)", async () => {
    const client = stubClient();
    const collection = { id: "col-1", name: "Renamed", description: null };
    client.updateCollection.mockResolvedValue(collection);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.update_collection({ collectionId: "col-1", name: "Renamed" });

    expect(client.updateCollection).toHaveBeenCalledWith("col-1", {
      name: "Renamed",
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual(collection);
  });

  it("update_collection with mealIds replace-sets membership (#112)", async () => {
    const client = stubClient();
    client.updateCollection.mockResolvedValue({ id: "col-1", name: "Weeknight" });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.update_collection({ collectionId: "col-1", mealIds: ["meal-1"] });

    expect(client.updateCollection).toHaveBeenCalledWith("col-1", {
      mealIds: ["meal-1"],
    });
    expect(result.isError).toBeUndefined();
  });

  it("update_collection surfaces a 404 not-found as isError (#112)", async () => {
    const client = stubClient();
    client.updateCollection.mockRejectedValue(new ApiError(404, "Collection not found"));
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.update_collection({ collectionId: "missing", name: "X" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/404|not found/i);
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

  it("list_templates forwards the family and returns the template JSON", async () => {
    const client = stubClient();
    const templates = [
      {
        id: "tmpl-1",
        familyId: FAMILY,
        name: "Taco Tuesday",
        description: null,
        entries: [{ id: "e-1", dayOfWeek: 1, mealId: "meal-1" }],
      },
    ];
    client.listTemplates.mockResolvedValue(templates);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.list_templates();

    expect(client.listTemplates).toHaveBeenCalledWith(FAMILY);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual(templates);
  });

  it("list_grocery_categories forwards the family and returns the effective category names (#119, parity row 8)", async () => {
    const client = stubClient();
    const categories = ["produce", "dairy", "meat", "brandon's snacks"];
    client.listGroceryCategories.mockResolvedValue(categories);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.list_grocery_categories();

    expect(client.listGroceryCategories).toHaveBeenCalledWith(FAMILY);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual(categories);
    // #119: the custom family category rides alongside the shared defaults.
    expect(parsed).toContain("brandon's snacks");
  });

  it("apply_template threads templateId, targetWeekStart, existingMode to the client", async () => {
    const client = stubClient();
    const weekPlan = { id: "wp-1", weekStart: "2026-07-06", days: [] };
    client.applyTemplate.mockResolvedValue(weekPlan);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.apply_template({
      templateId: "tmpl-1",
      targetWeekStart: "2026-07-06",
      existingMode: "replace",
    });

    expect(client.applyTemplate).toHaveBeenCalledWith(
      FAMILY,
      "tmpl-1",
      "2026-07-06",
      "replace",
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual(weekPlan);
  });

  it("apply_template omits existingMode when not provided", async () => {
    const client = stubClient();
    client.applyTemplate.mockResolvedValue({ id: "wp-1", days: [] });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.apply_template({
      templateId: "tmpl-1",
      targetWeekStart: "2026-07-06",
    });

    expect(client.applyTemplate).toHaveBeenCalledWith(
      FAMILY,
      "tmpl-1",
      "2026-07-06",
      undefined,
    );
  });

  it("fill_week threads weekStart + filters/existingMode/allowPartial to the client (row 7/8)", async () => {
    const client = stubClient();
    const weekPlan = { id: "wp-1", weekStart: "2026-07-06", days: [] };
    client.fillWeek.mockResolvedValue(weekPlan);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.fill_week({
      weekStart: "2026-07-06",
      categories: ["dinner"],
      tags: ["quick"],
      collections: ["Weeknights"],
      difficulty: ["EASY"],
      favorite: true,
      avoidRecentDays: 14,
      existingMode: "skip",
      allowPartial: false,
    });

    expect(client.fillWeek).toHaveBeenCalledWith(FAMILY, "2026-07-06", {
      categories: ["dinner"],
      tags: ["quick"],
      collections: ["Weeknights"],
      difficulty: ["EASY"],
      favorite: true,
      avoidRecentDays: 14,
      existingMode: "skip",
      allowPartial: false,
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual(weekPlan);
  });

  it("fill_week forwards only weekStart when no filters are provided", async () => {
    const client = stubClient();
    client.fillWeek.mockResolvedValue({ id: "wp-1", days: [] });
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    await handlers.fill_week({ weekStart: "2026-07-06" });

    expect(client.fillWeek).toHaveBeenCalledWith(FAMILY, "2026-07-06", {});
  });
});

describe("registerTools", () => {
  it("registers all meal-planning tools", () => {
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;
    const client = stubClient();

    registerTools(fakeServer, client as unknown as MealPlannerApiClient, FAMILY);

    const names = registerTool.mock.calls.map((c) => c[0]);
    expect(names).toEqual([
      "list_meals",
      "list_collections",
      "create_collection",
      "update_collection",
      "list_templates",
      "list_grocery_categories",
      "get_current_week_plan",
      "get_week_plan",
      "get_previous_week_plans",
      "schedule_meal",
      "schedule_random_meal",
      "repeat_week",
      "apply_template",
      "fill_week",
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

  it("registers list_collections and documents the collection surface (#109, parity row 8)", () => {
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;
    const client = stubClient();

    registerTools(fakeServer, client as unknown as MealPlannerApiClient, FAMILY);

    // A dedicated list_collections tool exposes the list/get description surface.
    const listCollectionsCall = registerTool.mock.calls.find(
      (c) => c[0] === "list_collections",
    );
    expect(listCollectionsCall).toBeDefined();
    const collDescription = (
      listCollectionsCall?.[1] as { description: string }
    ).description;
    expect(collDescription).toContain("recipe collections");
    expect(collDescription).toContain("optional description");
    expect(collDescription).toContain("meal_plan:read");

    // Row 8: list_meals advertises the collection filter facet + schema param.
    const listMealsCall = registerTool.mock.calls.find(
      (c) => c[0] === "list_meals",
    );
    const listMealsDescription = (
      listMealsCall?.[1] as { description: string }
    ).description;
    expect(listMealsDescription).toContain("collection filter");
    const listMealsSchema = (
      listMealsCall?.[1] as { inputSchema: Record<string, unknown> }
    ).inputSchema;
    expect(listMealsSchema).toHaveProperty("collections");

    // Both write tools expose a collections param so agents can assign membership.
    const createMealCall = registerTool.mock.calls.find(
      (c) => c[0] === "create_meal",
    );
    const createSchema = (
      createMealCall?.[1] as { inputSchema: Record<string, unknown> }
    ).inputSchema;
    expect(createSchema).toHaveProperty("collections");
    const updateMealCall = registerTool.mock.calls.find(
      (c) => c[0] === "update_meal",
    );
    const updateSchema = (
      updateMealCall?.[1] as { inputSchema: Record<string, unknown> }
    ).inputSchema;
    expect(updateSchema).toHaveProperty("collections");
  });

  it("documents repeat_week policy + exposes its schema (#114, parity row 8)", () => {
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;
    const client = stubClient();

    registerTools(fakeServer, client as unknown as MealPlannerApiClient, FAMILY);

    const repeatCall = registerTool.mock.calls.find(
      (c) => c[0] === "repeat_week",
    );
    expect(repeatCall).toBeDefined();
    const description = (repeatCall?.[1] as { description: string }).description;
    // Row 8: agents must be told the copy is approved→unapproved and that
    // existingMode is the deliberate collision policy.
    expect(description).toContain("approved meals");
    expect(description).toContain("unapproved suggestions");
    expect(description).toContain("existingMode");
    expect(description).toContain("meal_plan:schedule scope");

    const schema = (
      repeatCall?.[1] as { inputSchema: Record<string, unknown> }
    ).inputSchema;
    expect(schema).toHaveProperty("targetWeekStart");
    expect(schema).toHaveProperty("sourceWeekStart");
    expect(schema).toHaveProperty("existingMode");
  });

  it("documents the planning-template tools + exposes their schemas (#116, parity row 8)", () => {
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;
    const client = stubClient();

    registerTools(fakeServer, client as unknown as MealPlannerApiClient, FAMILY);

    // list_templates advertises the read surface + least-privilege scope.
    const listCall = registerTool.mock.calls.find(
      (c) => c[0] === "list_templates",
    );
    expect(listCall).toBeDefined();
    const listDescription = (listCall?.[1] as { description: string })
      .description;
    expect(listDescription).toContain("apply_template");
    expect(listDescription).toContain("meal_plan:read");

    // apply_template documents the unapproved-suggestion + existingMode policy.
    const applyCall = registerTool.mock.calls.find(
      (c) => c[0] === "apply_template",
    );
    expect(applyCall).toBeDefined();
    const applyDescription = (applyCall?.[1] as { description: string })
      .description;
    expect(applyDescription).toContain("unapproved");
    expect(applyDescription).toContain("existingMode");
    expect(applyDescription).toContain("meal_plan:schedule scope");

    const applySchema = (
      applyCall?.[1] as { inputSchema: Record<string, unknown> }
    ).inputSchema;
    expect(applySchema).toHaveProperty("templateId");
    expect(applySchema).toHaveProperty("targetWeekStart");
    expect(applySchema).toHaveProperty("existingMode");
  });

  it("documents the grocery-categories read tool + least-privilege scope (#119, parity row 8)", () => {
    const registerTool = vi.fn();
    const fakeServer = { registerTool } as unknown as McpServer;
    const client = stubClient();

    registerTools(fakeServer, client as unknown as MealPlannerApiClient, FAMILY);

    const listCall = registerTool.mock.calls.find(
      (c) => c[0] === "list_grocery_categories",
    );
    expect(listCall).toBeDefined();
    const description = (listCall?.[1] as { description: string }).description;
    // Advertises the effective (defaults ∪ custom) surface + read scope, and
    // notes that management is browser-only.
    expect(description).toContain("custom");
    expect(description).toContain("meal_plan:read");
    expect(description).toContain("browser-only");
    // A read-only tool takes no inputs.
    expect(
      (listCall?.[1] as { inputSchema: Record<string, unknown> }).inputSchema,
    ).toEqual({});
  });
});

describe("TOOL_SCOPES", () => {
  it("documents the least-privilege scope for each tool", () => {
    expect(TOOL_SCOPES).toEqual({
      list_meals: "meal_plan:read",
      list_collections: "meal_plan:read",
      list_templates: "meal_plan:read",
      list_grocery_categories: "meal_plan:read",
      get_current_week_plan: "meal_plan:read",
      get_week_plan: "meal_plan:read",
      get_previous_week_plans: "meal_plan:read",
      schedule_meal: "meal_plan:schedule",
      schedule_random_meal: "meal_plan:schedule",
      repeat_week: "meal_plan:schedule",
      apply_template: "meal_plan:schedule",
      fill_week: "meal_plan:schedule",
      approve_suggestion: "meal_plan:approve",
      create_meal: "meal:write",
      update_meal: "meal:write",
      create_collection: "meal:write",
      update_collection: "meal:write",
      get_current_grocery_list: "meal_plan:read",
    });
  });
});
