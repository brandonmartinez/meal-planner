import { z } from "zod";
import { INGREDIENT_CATEGORIES, INSTRUCTION_KINDS } from "@meal-planner/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MealPlannerApiClient } from "./apiClient.js";
import { ApiError, ApiTransportError } from "./errors.js";

/** The MCP tool result shape (a subset of the SDK's `CallToolResult`). */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  /** Index signature to satisfy the SDK's `CallToolResult` structural type. */
  [key: string]: unknown;
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

/** Difficulty enum shared by the meal-write tool schemas. */
const difficultyEnum = z.enum(["EASY", "MEDIUM", "HARD"]);

/** A single parsed ingredient the model produced from a recipe. */
const ingredientSchema = z.object({
  name: z.string().min(1).describe("Ingredient name, e.g. 'olive oil'."),
  quantity: z
    .string()
    .min(1)
    .optional()
    .describe("Amount as free text, e.g. '2' or '1/2'."),
  unit: z
    .string()
    .min(1)
    .optional()
    .describe("Unit for the quantity, e.g. 'cups', 'g', 'tbsp'."),
  category: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Grocery aisle/category as free text. Family-configurable (#119): the " +
        "shared defaults are " +
        INGREDIENT_CATEGORIES.join(", ") +
        ", but any custom family category name is also accepted.",
    ),
  groupLabel: z
    .string()
    .max(60)
    .nullable()
    .optional()
    .describe(
      "Authored tabular ('Grid') group-pill label for this ingredient row " +
        "(e.g. 'For the sauce'). Optional: omit (or null) to leave the meal's " +
        "grouping derived — do NOT set it unless you are deliberately authoring " +
        "the recipe's Grid layout.",
    ),
});

const instructionSchema = z.object({
  text: z.string().min(1).describe("The instruction step text."),
  timerMinutes: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe("Optional timer for this step, in minutes."),
  kind: z
    .enum(INSTRUCTION_KINDS)
    .optional()
    .describe(
      "Authored tabular ('Grid') step classification: PROCESS (default — a " +
        "step that combines ingredient rows, gets a span), SETUP (a full-width " +
        "prep band above the grid, e.g. 'Preheat oven'), or FINISH (a trailing " +
        "note, e.g. 'Serve'). SETUP/FINISH carry no span. Omit to leave derived.",
    ),
  subLabel: z
    .string()
    .max(80)
    .nullable()
    .optional()
    .describe(
      "Authored short column heading for this step in the Grid (e.g. 'whisk'). " +
        "Optional; omit (or null) to leave derived.",
    ),
  column: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe(
      "Authored process-column (lane) index, 0-based. Parallel prep tracks use " +
        "different columns; a later column that re-combines rows an earlier " +
        "column already covered is the intended cascade. Omit (or null) for the " +
        "single default lane. Same-column spans must NOT overlap.",
    ),
  spanFrom: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe(
      "Authored span START: the 0-based index (into the meal's ingredient " +
        "order) of the FIRST ingredient row this step combines, INCLUSIVE. " +
        "Pair with spanTo (both set or both omitted). Range: 0 ≤ spanFrom ≤ " +
        "spanTo ≤ ingredientCount-1. Setting any span authors the meal's " +
        "layout, so EVERY PROCESS step must then carry one — omit spans entirely " +
        "to leave the Grid auto-derived.",
    ),
  spanTo: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe(
      "Authored span END: the 0-based index (into the meal's ingredient order) " +
        "of the LAST ingredient row this step combines, INCLUSIVE. Pair with " +
        "spanFrom. Spans in the same column must be disjoint; spans in " +
        "different columns MAY overlap (the cascade). Omit to leave derived.",
    ),
});

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
    list_meals: (args: {
      search?: string;
      difficulty?: string[];
      favorite?: boolean;
      minRating?: number;
      tags?: string[];
      collections?: string[];
      sort?: string;
      order?: string;
      limit?: number;
      offset?: number;
    }): Promise<ToolResult> =>
      run(() =>
        client.listMeals(familyId, {
          search: args.search,
          difficulty: args.difficulty,
          favorite: args.favorite,
          minRating: args.minRating,
          tags: args.tags,
          collections: args.collections,
          sort: args.sort,
          order: args.order,
          limit: args.limit,
          offset: args.offset,
        }),
      ),

    list_collections: (): Promise<ToolResult> =>
      run(() => client.listCollections(familyId)),

    list_templates: (): Promise<ToolResult> =>
      run(() => client.listTemplates(familyId)),

    list_grocery_categories: (): Promise<ToolResult> =>
      run(() => client.listGroceryCategories(familyId)),

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

    schedule_random_meal: (args: {
      date: string;
      tags?: string[];
      difficulty?: ("EASY" | "MEDIUM" | "HARD")[];
      favorite?: boolean;
      avoidRecentDays?: number;
    }): Promise<ToolResult> =>
      run(() =>
        client.scheduleRandomMeal(familyId, {
          date: args.date,
          tags: args.tags,
          difficulty: args.difficulty,
          favorite: args.favorite,
          avoidRecentDays: args.avoidRecentDays,
        }),
      ),

    repeat_week: (args: {
      targetWeekStart: string;
      sourceWeekStart: string;
      existingMode?: "error" | "skip" | "replace";
    }): Promise<ToolResult> =>
      run(() =>
        client.repeatWeek(
          familyId,
          args.targetWeekStart,
          args.sourceWeekStart,
          args.existingMode,
        ),
      ),

    approve_suggestion: (args: {
      suggestionId: string;
    }): Promise<ToolResult> =>
      run(() => client.approveSuggestion(familyId, args.suggestionId)),

    unapprove_suggestion: (args: {
      suggestionId: string;
    }): Promise<ToolResult> =>
      run(() => client.unapproveSuggestion(familyId, args.suggestionId)),

    apply_template: (args: {
      templateId: string;
      targetWeekStart: string;
      existingMode?: "error" | "skip" | "replace";
    }): Promise<ToolResult> =>
      run(() =>
        client.applyTemplate(
          familyId,
          args.templateId,
          args.targetWeekStart,
          args.existingMode,
        ),
      ),

    fill_week: (args: {
      weekStart: string;
      tags?: string[];
      collections?: string[];
      difficulty?: ("EASY" | "MEDIUM" | "HARD")[];
      favorite?: boolean;
      avoidRecentDays?: number;
      existingMode?: "error" | "skip" | "replace";
      allowPartial?: boolean;
    }): Promise<ToolResult> => {
      const { weekStart, ...input } = args;
      return run(() => client.fillWeek(familyId, weekStart, input));
    },

    // Family-from-key tools: the API resolves the family from the presented
    // key, so these do not thread `familyId` into the request path.
    create_meal: (args: {
      name: string;
      description?: string;
      imageUrl?: string | null;
      difficulty?: "EASY" | "MEDIUM" | "HARD";
      prepTimeMinutes?: number;
      cookTimeMinutes?: number;
      servings?: number;
      sourceUrl?: string;
      notes?: string;
      favorite?: boolean;
      rating?: number;
      ingredients?: {
        name: string;
        quantity?: string;
        unit?: string;
        category?: string;
        groupLabel?: string | null;
      }[];
      tags?: string[];
      collections?: string[];
      instructions?: {
        text: string;
        timerMinutes?: number | null;
        kind?: "SETUP" | "PROCESS" | "FINISH";
        subLabel?: string | null;
        column?: number | null;
        spanFrom?: number | null;
        spanTo?: number | null;
      }[];
    }): Promise<ToolResult> => run(() => client.createMeal(args)),

    update_meal: (args: {
      mealId: string;
      name?: string;
      description?: string;
      imageUrl?: string | null;
      difficulty?: "EASY" | "MEDIUM" | "HARD" | null;
      prepTimeMinutes?: number | null;
      cookTimeMinutes?: number | null;
      servings?: number | null;
      sourceUrl?: string | null;
      notes?: string | null;
      favorite?: boolean;
      rating?: number | null;
      ingredients?: {
        name: string;
        quantity?: string;
        unit?: string;
        category?: string;
        groupLabel?: string | null;
      }[];
      tags?: string[];
      collections?: string[];
      instructions?: {
        text: string;
        timerMinutes?: number | null;
        kind?: "SETUP" | "PROCESS" | "FINISH";
        subLabel?: string | null;
        column?: number | null;
        spanFrom?: number | null;
        spanTo?: number | null;
      }[];
    }): Promise<ToolResult> => {
      const { mealId, ...rest } = args;
      return run(() => client.updateMeal(mealId, rest));
    },

    get_current_grocery_list: (): Promise<ToolResult> =>
      run(() => client.getCurrentGroceryList()),

    create_collection: (args: {
      name: string;
      description?: string | null;
      mealIds?: string[];
    }): Promise<ToolResult> => run(() => client.createCollection(args)),

    update_collection: (args: {
      collectionId: string;
      name?: string;
      description?: string | null;
      mealIds?: string[];
    }): Promise<ToolResult> => {
      const { collectionId, ...rest } = args;
      return run(() => client.updateCollection(collectionId, rest));
    },

    upload_meal_image: (args: {
      mealId: string;
      imageData: string;
      contentType: string;
    }): Promise<ToolResult> =>
      run(() =>
        client.uploadMealImage(args.mealId, args.imageData, args.contentType),
      ),
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;

/** The scope each tool requires on the agent credential (documentation-facing;
 *  the API is the authoritative enforcer). */
export const TOOL_SCOPES: Record<keyof ToolHandlers, string> = {
  list_meals: "meal_plan:read",
  list_collections: "meal_plan:read",
  create_collection: "meal:write",
  update_collection: "meal:write",
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
  unapprove_suggestion: "meal_plan:approve",
  create_meal: "meal:write",
  update_meal: "meal:write",
  upload_meal_image: "meal:image",
  get_current_grocery_list: "meal_plan:read",
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
        "indicator, last-cooked date, and all-time times-cooked count. " +
        "Supports name search, difficulty " +
        "filter, favorite filter, minimum-rating filter, tag filter, " +
        "collection filter, sort " +
        "(name|lastCooked|created), pagination " +
        "(limit/offset), and sort order (asc|desc). Multiple values within " +
        "the tags (or collections) filter are OR'd; the tags " +
        "and collections filters are AND'd together and with the " +
        "other filters. Requires the " +
        "meal_plan:read scope.",
      inputSchema: {
        search: z
          .string()
          .min(1)
          .optional()
          .describe("Case-insensitive substring to filter meal names by."),
        difficulty: z
          .array(z.enum(["EASY", "MEDIUM", "HARD"]))
          .optional()
          .describe("Filter by one or more difficulty levels."),
        favorite: z
          .boolean()
          .optional()
          .describe("Filter to only favorite meals when true."),
        minRating: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("Only meals rated at least this value (1–5)."),
        tags: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Filter by tag names (case-insensitive). Multiple tags are OR'd.",
          ),
        collections: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Filter by recipe collection names (case-insensitive). Multiple collections are OR'd.",
          ),
        sort: z
          .enum(["name", "lastCooked", "created"])
          .optional()
          .describe("Sort field. Defaults to 'name'."),
        order: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort direction. Defaults to 'asc'."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of results to return (1–100, default 25)."),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Number of results to skip for pagination (default 0)."),
      },
    },
    (args) => handlers.list_meals(args),
  );

  server.registerTool(
    "list_collections",
    {
      title: "List recipe collections",
      description:
        "List the family's recipe collections — curated, named lists a meal " +
        "can belong to (e.g. 'Weeknight Dinners'). Returns each collection's " +
        "id, name, and optional description. Use the names with the " +
        "collections filter on list_meals, or with create_meal/update_meal to " +
        "assign a meal to collections. Requires the meal_plan:read scope.",
      inputSchema: {},
    },
    () => handlers.list_collections(),
  );

  server.registerTool(
    "create_collection",
    {
      title: "Create recipe collection",
      description:
        "Create a new recipe collection in the family the key resolves to. " +
        "Idempotent by name: if a collection with the same name already exists " +
        "it is returned unchanged. Optionally supply mealIds to REPLACE-SET the " +
        "collection's meal membership immediately. Requires the meal:write scope.",
      inputSchema: {
        name: z.string().min(1).max(100).describe("Collection name (1–100 chars)"),
        description: z
          .string()
          .max(500)
          .nullable()
          .optional()
          .describe("Optional description (≤500 chars)"),
        mealIds: z
          .array(z.string())
          .optional()
          .describe(
            "Optional list of meal ids to assign to this collection " +
              "(REPLACE-SET: clears existing membership first). All ids must " +
              "belong to the same family. Pass [] to clear membership.",
          ),
      },
    },
    (args: { name: string; description?: string | null; mealIds?: string[] }) =>
      handlers.create_collection(args),
  );

  server.registerTool(
    "update_collection",
    {
      title: "Update recipe collection",
      description:
        "Update an existing recipe collection by id. Supply any combination of " +
        "name, description, or mealIds. When mealIds is provided it REPLACE-SETS " +
        "the collection's meal membership (pass [] to clear). Omit mealIds to " +
        "leave membership unchanged. Requires the meal:write scope.",
      inputSchema: {
        collectionId: z.string().describe("Id of the collection to update"),
        name: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe("New collection name (1–100 chars)"),
        description: z
          .string()
          .max(500)
          .nullable()
          .optional()
          .describe("New description (≤500 chars); null to clear"),
        mealIds: z
          .array(z.string())
          .optional()
          .describe(
            "REPLACE-SET meal membership: all supplied ids must belong to " +
              "the family. Omit to leave membership unchanged. Pass [] to clear.",
          ),
      },
    },
    (args: {
      collectionId: string;
      name?: string;
      description?: string | null;
      mealIds?: string[];
    }) => handlers.update_collection(args),
  );

  server.registerTool(
    "list_templates",
    {
      title: "List planning templates",
      description:
        "List the family's reusable week planning templates — named sets of " +
        "(day-of-week → meal) entries that can be applied to any week. Returns " +
        "each template's id, name, optional description, and its entries " +
        "(dayOfWeek 0=Monday..6=Sunday with the referenced meal). Use a " +
        "template's id with apply_template to materialize it into a week. " +
        "Requires the meal_plan:read scope.",
      inputSchema: {},
    },
    () => handlers.list_templates(),
  );

  server.registerTool(
    "list_grocery_categories",
    {
      title: "List grocery categories",
      description:
        "List the family's effective grocery aisle categories (#119) — the " +
        "shared defaults (produce, dairy, meat, etc.) unioned with any custom " +
        "categories the family has added. Returns a flat list of category " +
        "name strings. Use these names for the category field on ingredients " +
        "when calling create_meal/update_meal. Management (add/rename/delete) " +
        "is browser-only. Requires the meal_plan:read scope.",
      inputSchema: {},
    },
    () => handlers.list_grocery_categories(),
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
    "schedule_random_meal",
    {
      title: "Schedule a random meal",
      description:
        "Pick an ELIGIBLE meal at random and schedule it onto a calendar " +
        "date. Creates an unapproved meal suggestion; a parent (or an agent " +
        "with the approve scope) must approve it separately. Optional filters " +
        "narrow the candidate pool before the random pick: tags, " +
        "difficulty, favorite-only, and avoid-recent (exclude meals cooked " +
        "within the last N days). Multiple values within the tags " +
        "(or difficulty) filter are OR'd; the filters are AND'd together. " +
        "Fails with a 422 when no meal matches. Requires the meal_plan:schedule " +
        "scope.",
      inputSchema: {
        date: dateString.describe(
          "The calendar date to schedule the meal on (YYYY-MM-DD).",
        ),
        tags: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Restrict candidates to these tag names (case-insensitive). " +
              "Multiple tags are OR'd.",
          ),
        difficulty: z
          .array(difficultyEnum)
          .optional()
          .describe("Restrict candidates to one or more difficulty levels."),
        favorite: z
          .boolean()
          .optional()
          .describe("Restrict candidates to favorite meals when true."),
        avoidRecentDays: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Exclude meals cooked within this many days before the target " +
              "date. Omit or 0 to disable avoid-recent.",
          ),
      },
    },
    (args) => handlers.schedule_random_meal(args),
  );

  server.registerTool(
    "repeat_week",
    {
      title: "Repeat a previous week",
      description:
        "Copy the approved meals from a source week into a target week as new " +
        "unapproved suggestions, preserving the parent approval workflow. " +
        "`existingMode` controls what happens when the target week already has " +
        "suggestions: 'error' (default) refuses and changes nothing, 'skip' " +
        "only fills days that have no suggestions, 'replace' clears the target " +
        "week's suggestions first. Requires the meal_plan:schedule scope.",
      inputSchema: {
        targetWeekStart: dateString.describe(
          "The Monday (YYYY-MM-DD) of the week to copy meals INTO.",
        ),
        sourceWeekStart: dateString.describe(
          "The Monday (YYYY-MM-DD) of the week to copy approved meals FROM.",
        ),
        existingMode: z
          .enum(["error", "skip", "replace"])
          .optional()
          .describe(
            "How to handle a target week that already has suggestions. " +
              "Defaults to 'error'.",
          ),
      },
    },
    (args) => handlers.repeat_week(args),
  );

  server.registerTool(
    "apply_template",
    {
      title: "Apply a planning template",
      description:
        "Apply a reusable planning template into a target week: each of the " +
        "template's (day-of-week → meal) entries becomes a new unapproved " +
        "suggestion on the matching day, preserving the parent approval " +
        "workflow. `existingMode` controls what happens when the target week " +
        "already has suggestions: 'error' (default) refuses and changes " +
        "nothing, 'skip' only fills days that have no suggestions, 'replace' " +
        "clears the target week's suggestions first. Requires the " +
        "meal_plan:schedule scope.",
      inputSchema: {
        templateId: z
          .string()
          .min(1)
          .describe("The id of the planning template to apply."),
        targetWeekStart: dateString.describe(
          "The Monday (YYYY-MM-DD) of the week to apply the template INTO.",
        ),
        existingMode: z
          .enum(["error", "skip", "replace"])
          .optional()
          .describe(
            "How to handle a target week that already has suggestions. " +
              "Defaults to 'error'.",
          ),
      },
    },
    (args) => handlers.apply_template(args),
  );

  server.registerTool(
    "fill_week",
    {
      title: "Fill a week from tags/collections",
      description:
        "Fill the OPEN days of a target week (a Monday) with meals chosen at " +
        "random from the eligible catalog, filtered by tags, " +
        "collections, difficulty, and favorite status. Each chosen meal becomes " +
        "a new UNAPPROVED suggestion on an open day, preserving the parent " +
        "approval workflow. Recently-cooked meals are avoided when " +
        "`avoidRecentDays` is set. `existingMode` controls what happens when the " +
        "target week already has suggestions: 'error' (default) refuses and " +
        "changes nothing, 'skip' only fills days that have no suggestions, " +
        "'replace' clears the target week's suggestions first. `allowPartial` " +
        "(default true) fills as many open days as the eligible pool allows; set " +
        "it false to require enough eligible meals for every open day. Requires " +
        "the meal_plan:schedule scope.",
      inputSchema: {
        weekStart: dateString.describe(
          "The Monday (YYYY-MM-DD) of the week to fill.",
        ),
        tags: z
          .array(z.string())
          .optional()
          .describe("Only choose meals in ANY of these tags."),
        collections: z
          .array(z.string())
          .optional()
          .describe("Only choose meals in ANY of these collections."),
        difficulty: z
          .array(difficultyEnum)
          .optional()
          .describe("Only choose meals with one of these difficulties."),
        favorite: z
          .boolean()
          .optional()
          .describe("If true, only choose favorite meals."),
        avoidRecentDays: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Avoid meals cooked within this many days of the target week " +
              "when the eligible pool allows.",
          ),
        existingMode: z
          .enum(["error", "skip", "replace"])
          .optional()
          .describe(
            "How to handle a target week that already has suggestions. " +
              "Defaults to 'error'.",
          ),
        allowPartial: z
          .boolean()
          .optional()
          .describe(
            "Fill as many open days as the eligible pool allows (default " +
              "true); set false to require enough eligible meals for every " +
              "open day.",
          ),
      },
    },
    (args) => handlers.fill_week(args),
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

  server.registerTool(
    "unapprove_suggestion",
    {
      title: "Unapprove suggestion",
      description:
        "Revert approval of a meal suggestion. This is a privileged, parent-equivalent " +
        "action and requires the meal_plan:approve scope.",
      inputSchema: {
        suggestionId: z
          .string()
          .min(1)
          .describe("The id of the meal suggestion to unapprove."),
      },
    },
    (args) => handlers.unapprove_suggestion(args),
  );

  server.registerTool(
    "create_meal",
    {
      title: "Create meal",
      description:
        "Create a meal in the family's catalog from a recipe you have already " +
        "parsed (from a CSV, a photo/scan, or pasted text — you do the " +
        "parsing/OCR; this tool only stores the structured result). Provide a " +
        "name and, optionally, a description, a difficulty (EASY/MEDIUM/HARD), " +
        "and a list of ingredients. Requires the meal:write scope. The created " +
        "meal is returned with its tabular \"Grid\" recipe view fields " +
        "(matrixSource, ingredientDisplayOrder, plus per-ingredient " +
        "position/groupLabel and per-instruction kind/subLabel/spanFrom/spanTo). " +
        "You MAY author that Grid layout by setting instruction spans " +
        "(spanFrom/spanTo index into ingredient order, inclusive; same-column " +
        "spans must be disjoint, cross-column spans may overlap as a cascade) " +
        "plus kind/subLabel/column and ingredient groupLabel; omit all of them " +
        "to leave the layout auto-derived. Setting any span authors the whole " +
        "meal, so every PROCESS step must then carry one.",
      inputSchema: {
        name: z.string().min(1).describe("The meal's name (required)."),
        description: z
          .string()
          .optional()
          .describe("Optional short description or notes."),
        imageUrl: z
          .string()
          .url()
          .nullable()
          .optional()
          .describe(
            "Optional external image URL (http/https) for the recipe. " +
              "Display-only — stored as-is and never fetched server-side.",
          ),
        difficulty: difficultyEnum
          .optional()
          .describe("Optional difficulty: EASY, MEDIUM, or HARD."),
        prepTimeMinutes: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Optional prep time in minutes."),
        cookTimeMinutes: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Optional cook time in minutes."),
        servings: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Optional number of servings the recipe yields."),
        sourceUrl: z
          .string()
          .url()
          .optional()
          .describe(
            "Optional source URL for the recipe. Stored only — never fetched.",
          ),
        notes: z
          .string()
          .optional()
          .describe("Optional free-form recipe notes."),
        favorite: z
          .boolean()
          .optional()
          .describe("Optional flag to mark the meal as a favorite."),
        rating: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("Optional rating from 1 to 5."),
        ingredients: z
          .array(ingredientSchema)
          .optional()
          .describe("Optional list of ingredients parsed from the recipe."),
        tags: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Optional tag names to assign (case-insensitive, created within " +
              "the family if new).",
          ),
        collections: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Optional recipe collection names to assign the meal to " +
              "(case-insensitive, created within the family if new).",
          ),
        instructions: z
          .array(instructionSchema)
          .optional()
          .describe(
            "Optional ordered list of preparation steps. Order is preserved.",
          ),
      },
    },
    (args) => handlers.create_meal(args),
  );

  server.registerTool(
    "update_meal",
    {
      title: "Update meal",
      description:
        "Edit an existing meal in the family's catalog. Identify the meal by " +
        "its id (use list_meals to find it) and provide only the fields to " +
        "change. Passing `ingredients` REPLACES the meal's ingredient list. " +
        "Passing `instructions` REPLACES the meal's instruction list. " +
        "Placeholder meals (e.g. Free Day, Leftovers) cannot be edited. " +
        "Requires the meal:write scope. The updated meal is returned with its " +
        "tabular \"Grid\" recipe view fields (matrixSource, " +
        "ingredientDisplayOrder, plus per-ingredient position/groupLabel and " +
        "per-instruction kind/subLabel/spanFrom/spanTo). You MAY author that " +
        "Grid layout by setting instruction spans (spanFrom/spanTo index into " +
        "ingredient order, inclusive; same-column spans must be disjoint, " +
        "cross-column spans may overlap as a cascade) plus kind/subLabel/column " +
        "and ingredient groupLabel. Omit the span fields to leave the layout " +
        "derived — an update that never sends spans will NOT flip the meal to an " +
        "authored layout. Setting any span authors the whole meal, so every " +
        "PROCESS step must then carry one.",
      inputSchema: {
        mealId: z.string().min(1).describe("The id of the meal to edit."),
        name: z.string().min(1).optional().describe("New name."),
        description: z.string().optional().describe("New description."),
        imageUrl: z
          .string()
          .url()
          .nullable()
          .optional()
          .describe(
            "New external image URL (http/https), or null to clear it. " +
              "Display-only — stored as-is and never fetched server-side.",
          ),
        difficulty: difficultyEnum
          .nullable()
          .optional()
          .describe("New difficulty, or null to clear it."),
        prepTimeMinutes: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional()
          .describe("New prep time in minutes, or null to clear it."),
        cookTimeMinutes: z
          .number()
          .int()
          .min(0)
          .nullable()
          .optional()
          .describe("New cook time in minutes, or null to clear it."),
        servings: z
          .number()
          .int()
          .min(1)
          .nullable()
          .optional()
          .describe("New number of servings, or null to clear it."),
        sourceUrl: z
          .string()
          .url()
          .nullable()
          .optional()
          .describe(
            "New source URL, or null to clear it. Stored only — never fetched.",
          ),
        notes: z
          .string()
          .nullable()
          .optional()
          .describe("New recipe notes, or null to clear them."),
        favorite: z
          .boolean()
          .optional()
          .describe("Whether to mark the meal as a favorite."),
        rating: z
          .number()
          .int()
          .min(1)
          .max(5)
          .nullable()
          .optional()
          .describe("New rating from 1 to 5, or null to clear it."),
        ingredients: z
          .array(ingredientSchema)
          .optional()
          .describe("Replacement ingredient list (replaces all existing)."),
        tags: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Replacement tag names (replaces all existing; case-insensitive, " +
              "created within the family if new). Pass [] to clear.",
          ),
        collections: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Replacement recipe collection names (replaces all existing; " +
              "case-insensitive, created within the family if new). Pass [] " +
              "to clear.",
          ),
        instructions: z
          .array(instructionSchema)
          .optional()
          .describe(
            "Replacement ordered list of preparation steps (replaces all " +
              "existing; order is preserved). Pass [] to clear.",
          ),
      },
    },
    (args) => handlers.update_meal(args),
  );

  server.registerTool(
    "get_current_grocery_list",
    {
      title: "Get current grocery list",
      description:
        "Get the family's grocery list for the CURRENT week (resolved in the " +
        "family's timezone, Monday-anchored). The list is generated on demand " +
        "from approved meal suggestions if one does not exist yet. Requires " +
        "the meal_plan:read scope.",
      inputSchema: {},
    },
    () => handlers.get_current_grocery_list(),
  );

  server.registerTool(
    "upload_meal_image",
    {
      title: "Upload meal image",
      description:
        "Upload a binary image FILE for a meal in the family's catalog " +
        "(distinct from setting an external imageUrl on create_meal/" +
        "update_meal). Provide the image as base64-encoded bytes plus its " +
        "content type. Accepted types: image/png, image/jpeg, image/webp, " +
        "image/gif. Maximum size 5 MiB (measured on the decoded bytes). The " +
        "server authoritatively validates the real image type from the file's " +
        "magic bytes and ignores the declared contentType for that security " +
        "decision, so a mismatched or spoofed contentType is rejected. " +
        "Placeholder meals (e.g. Free Day, Leftovers) cannot have images. " +
        "Requires the meal:image scope.",
      inputSchema: {
        mealId: z
          .string()
          .min(1)
          .describe("The id of the meal to attach the image to."),
        imageData: z
          .string()
          .min(1)
          .describe(
            "The image file contents as a standard base64-encoded string " +
              "(no data: URI prefix). Decoded size must not exceed 5 MiB.",
          ),
        contentType: z
          .string()
          .min(1)
          .describe(
            "The declared MIME type of the image (e.g. image/png, " +
              "image/jpeg, image/webp, image/gif). Informational only — the " +
              "server verifies the true type from the file's magic bytes.",
          ),
      },
    },
    (args) => handlers.upload_meal_image(args),
  );
}
