import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MealPlannerApiClient } from "./apiClient.js";
import { ApiError, ApiTransportError } from "./errors.js";

/** The MCP tool result shape (a subset of the SDK's `CallToolResult`). */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Runs an API call and maps outcomes to clean MCP tool results:
 *  - success            → JSON payload as text
 *  - {@link ApiError}   → `API error <status>: <message>` (isError)
 *  - transport failure  → `API unreachable: <reason>` (isError)
 *  - anything else      → `Unexpected error: <message>` (isError)
 *
 * The agent credential never appears in any branch — {@link ApiError} and
 * {@link ApiTransportError} are constructed without it upstream.
 */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof ApiError) {
      const suffix =
        err.details !== undefined
          ? ` (${JSON.stringify(err.details)})`
          : "";
      return fail(`API error ${err.status}: ${err.message}${suffix}`);
    }
    if (err instanceof ApiTransportError) {
      return fail(`API unreachable: ${err.message}`);
    }
    return fail(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD date");

/**
 * Pure, testable tool handlers bound to a client + family. Each returns an MCP
 * {@link ToolResult}. Kept separate from {@link registerTools} so unit tests
 * can invoke handlers directly without constructing an `McpServer`.
 */
export function createToolHandlers(
  client: MealPlannerApiClient,
  familyId: string,
) {
  return {
    list_meals: (args: { search?: string }): Promise<ToolResult> =>
      run(() => client.listMeals(familyId, args.search)),

    get_current_week_plan: (): Promise<ToolResult> =>
      run(() => client.getCurrentWeekPlan(familyId)),

    get_week_plan: (args: { weekStart: string }): Promise<ToolResult> =>
      run(() => client.getWeekPlan(familyId, args.weekStart)),

    get_previous_week_plans: (args: {
      before?: string;
      limit?: number;
    }): Promise<ToolResult> =>
      run(() =>
        client.getPreviousWeekPlans(familyId, {
          before: args.before,
          limit: args.limit,
        }),
      ),

    schedule_meal: (args: {
      mealId: string;
      date: string;
    }): Promise<ToolResult> =>
      run(() =>
        client.scheduleMeal(familyId, { mealId: args.mealId, date: args.date }),
      ),

    approve_suggestion: (args: {
      suggestionId: string;
    }): Promise<ToolResult> =>
      run(() => client.approveSuggestion(familyId, args.suggestionId)),
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;

/** The scope each tool requires on the agent credential (documentation-facing;
 *  the API is the authoritative enforcer). */
export const TOOL_SCOPES: Record<keyof ToolHandlers, string> = {
  list_meals: "meal_plan:read",
  get_current_week_plan: "meal_plan:read",
  get_week_plan: "meal_plan:read",
  get_previous_week_plans: "meal_plan:read",
  schedule_meal: "meal_plan:schedule",
  approve_suggestion: "meal_plan:approve",
};

/**
 * Registers every meal-planning tool on the given MCP server. Input validation
 * is delegated to the SDK via each tool's Zod schema; the API performs the
 * authoritative auth/scope/family checks server-side.
 */
export function registerTools(
  server: McpServer,
  client: MealPlannerApiClient,
  familyId: string,
): void {
  const handlers = createToolHandlers(client, familyId);

  server.registerTool(
    "list_meals",
    {
      title: "List meals",
      description:
        "List the family's meal catalog, including a recently-scheduled " +
        "indicator. Optionally filter by a name search term. Requires the " +
        "meal_plan:read scope.",
      inputSchema: {
        search: z
          .string()
          .min(1)
          .optional()
          .describe("Case-insensitive substring to filter meal names by."),
      },
    },
    (args) => handlers.list_meals(args),
  );

  server.registerTool(
    "get_current_week_plan",
    {
      title: "Get current week plan",
      description:
        "Get the current week's meal plan, resolved in the family's " +
        "timezone. Returns a fully-formed week (Mon–Sun) with each day's " +
        "suggestions. Requires the meal_plan:read scope.",
      inputSchema: {},
    },
    () => handlers.get_current_week_plan(),
  );

  server.registerTool(
    "get_week_plan",
    {
      title: "Get week plan",
      description:
        "Get a specific week's meal plan by its Monday start date " +
        "(YYYY-MM-DD). Requires the meal_plan:read scope.",
      inputSchema: {
        weekStart: dateString.describe(
          "The Monday of the target week, as YYYY-MM-DD.",
        ),
      },
    },
    (args) => handlers.get_week_plan(args),
  );

  server.registerTool(
    "get_previous_week_plans",
    {
      title: "Get previous week plans",
      description:
        "List previous week plans in reverse-chronological order, with " +
        "bounded pagination. Requires the meal_plan:read scope.",
      inputSchema: {
        before: dateString
          .optional()
          .describe(
            "Only weeks strictly before this date (YYYY-MM-DD). Defaults to " +
              "the current week.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(52)
          .optional()
          .describe("Max number of weeks to return (1–52, default 8)."),
      },
    },
    (args) => handlers.get_previous_week_plans(args),
  );

  server.registerTool(
    "schedule_meal",
    {
      title: "Schedule meal",
      description:
        "Schedule a meal onto a calendar date. Creates an unapproved meal " +
        "suggestion; a parent (or an agent with the approve scope) must " +
        "approve it separately. Requires the meal_plan:schedule scope.",
      inputSchema: {
        mealId: z.string().min(1).describe("The id of the meal to schedule."),
        date: dateString.describe(
          "The calendar date to schedule the meal on (YYYY-MM-DD).",
        ),
      },
    },
    (args) => handlers.schedule_meal(args),
  );

  server.registerTool(
    "approve_suggestion",
    {
      title: "Approve suggestion",
      description:
        "Approve a meal suggestion. This is a privileged, parent-equivalent " +
        "action and requires the meal_plan:approve scope.",
      inputSchema: {
        suggestionId: z
          .string()
          .min(1)
          .describe("The id of the meal suggestion to approve."),
      },
    },
    (args) => handlers.approve_suggestion(args),
  );
}
