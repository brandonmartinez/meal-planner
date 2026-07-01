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
    listMeals: vi.fn(),
    getCurrentWeekPlan: vi.fn(),
    getWeekPlan: vi.fn(),
    getPreviousWeekPlans: vi.fn(),
    scheduleMeal: vi.fn(),
    approveSuggestion: vi.fn(),
  };
}

function textOf(result: ToolResult): string {
  return result.content.map((c) => c.text).join("");
}

const FAMILY = "fam-1";

describe("createToolHandlers", () => {
  it("list_meals forwards the family + search and returns JSON text", async () => {
    const client = stubClient();
    client.listMeals.mockResolvedValue([{ id: "meal-1" }]);
    const handlers = createToolHandlers(
      client as unknown as MealPlannerApiClient,
      FAMILY,
    );

    const result = await handlers.list_meals({ search: "taco" });

    expect(client.listMeals).toHaveBeenCalledWith(FAMILY, "taco");
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual([{ id: "meal-1" }]);
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
  it("registers all six meal-planning tools", () => {
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
    ]);
    // Each registration provides a config with an inputSchema and a handler.
    for (const call of registerTool.mock.calls) {
      expect(call[1]).toHaveProperty("inputSchema");
      expect(typeof call[2]).toBe("function");
    }
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
    });
  });
});
