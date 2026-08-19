import type {
  MealListResponseDTO,
  WeekPlanDTO,
  PreviousWeeksResponseDTO,
  MealSuggestionDTO,
  RandomScheduleInputDTO,
  RepeatWeekExistingMode,
  FillWeekRequestDTO,
  AgentIdentityDTO,
  GroceryList,
  Difficulty,
  RecipeCollection,
  PlanningTemplate,
  TabularRecipeMealDTO,
} from "@meal-planner/shared";
import { ApiError, ApiTransportError } from "./errors.js";

/** Header carrying the raw scoped agent key. Matches the API's
 *  `agentAuth` middleware (distinct from the display `x-api-key`). */
const AGENT_KEY_HEADER = "x-agent-key";

export interface ApiClientOptions {
  /** Base URL with no trailing slash, e.g. `http://localhost:3001`. */
  baseUrl: string;
  /** Raw scoped agent credential — sent as `x-agent-key`. Secret. */
  agentKey: string;
  /** Injectable fetch, primarily for tests. Defaults to global `fetch`. */
  fetchFn?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 15s. */
  timeoutMs?: number;
}

interface RequestOptions {
  query?: Record<string, string | string[] | number | boolean | undefined>;
  body?: unknown;
}

/** The structured meal shape a caller (e.g. an AI that parsed a recipe) sends
 *  to create a meal. `ingredients` are optional; each needs at least a name. */
export interface CreateMealInput {
  name: string;
  description?: string;
  /** External recipe image URL (http/https). Display-only; stored as-is. #103. */
  imageUrl?: string | null;
  difficulty?: Difficulty;
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
    /** Authored tabular ("Grid") group-pill label; null/omitted ⇒ derived. */
    groupLabel?: string | null;
  }[];
  /** Tag names to assign (family-scoped, resolved/created by name). #107. */
  tags?: string[];
  /** Collection names to assign (family-scoped, resolved/created by name). #109. */
  collections?: string[];
  /** Ordered preparation steps; order is preserved as `position`. #100.
   *  Authored Grid layout fields (`kind`/`subLabel`/`column`/`spanFrom`/`spanTo`)
   *  are optional and omit-defaulting — omit them entirely to leave the meal's
   *  layout derived (never authored). Spans index into ingredient order. */
  instructions?: {
    text: string;
    timerMinutes?: number | null;
    kind?: "SETUP" | "PROCESS" | "FINISH";
    subLabel?: string | null;
    column?: number | null;
    spanFrom?: number | null;
    spanTo?: number | null;
  }[];
}

/** The 201 response returned when a binary meal image is uploaded on the agent
 *  surface (`meal:image` scope). The image itself is served back only by opaque
 *  id via the browser GET route; this shape carries no raw bytes. */
export interface UploadMealImageResult {
  /** Opaque image asset id. */
  id: string;
  /** The meal the image is associated with. */
  mealId: string | null;
  /** The authoritative content type as sniffed from the magic bytes by the API
   *  (NOT the caller-declared type). */
  contentType: string;
  /** Stored byte size of the decoded image. */
  byteSize: number;
  /** ISO timestamp the asset row was created. */
  createdAt: string;
}

/** Partial edit of an existing meal. Every field is optional; `difficulty` may
 *  be `null` to clear it. At least one field must be provided. */
export interface UpdateMealInput {
  name?: string;
  description?: string;
  /** External recipe image URL (http/https), or `null` to clear it. #103. */
  imageUrl?: string | null;
  difficulty?: Difficulty | null;
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
    /** Authored tabular ("Grid") group-pill label; null/omitted ⇒ derived. */
    groupLabel?: string | null;
  }[];
  /** Tag names to replace the meal's tags with (by name). #107. */
  tags?: string[];
  /** Collection names to replace the meal's collections with (by name). #109. */
  collections?: string[];
  /** Ordered steps to replace the meal's instructions with; order preserved. #100.
   *  Authored Grid layout fields (`kind`/`subLabel`/`column`/`spanFrom`/`spanTo`)
   *  are optional and omit-defaulting — an update that omits spans leaves the
   *  layout derived and never flips the meal to authored. Spans index into
   *  ingredient order. */
  instructions?: {
    text: string;
    timerMinutes?: number | null;
    kind?: "SETUP" | "PROCESS" | "FINISH";
    subLabel?: string | null;
    column?: number | null;
    spanFrom?: number | null;
    spanTo?: number | null;
  }[];
}

/**
 * Thin, typed HTTP client for the meal-planner API's MCP agent surface
 * (`/api/agent/*`). It is a pure CLIENT of the API: it never imports Prisma,
 * `@prisma/client`, or any `packages/api` service — it only speaks HTTP.
 *
 * Every request carries the scoped agent credential in the `x-agent-key`
 * header. The key is held in memory only and is never placed in the URL, query
 * string, or any log/error output.
 */
export class MealPlannerApiClient {
  private readonly baseUrl: string;
  private readonly agentKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.agentKey = options.agentKey;
    // Node's global `fetch` does not depend on `this`, so it can be used
    // directly; tests inject a mock via `fetchFn`.
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  // --- Read tools -----------------------------------------------------------

  /** Resolve the family + granted scopes for the presented key. The hosted
   *  server calls this once per request so no family id is ever configured. */
  getAgentMe(): Promise<AgentIdentityDTO> {
    return this.request<AgentIdentityDTO>("GET", `/api/agent/me`);
  }

  /** List the family's meals, including case-insensitive substring search across
   *  meal name, description, tag name, collection name, and ingredient category,
   *  plus filters, sorting, and pagination. */
  listMeals(
    familyId: string,
    opts?: {
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
    },
  ): Promise<MealListResponseDTO> {
    const query: Record<string, string | string[] | number | boolean | undefined> = {
      search: opts?.search,
      favorite: opts?.favorite,
      minRating: opts?.minRating,
      sort: opts?.sort,
      order: opts?.order,
      limit: opts?.limit,
      offset: opts?.offset,
    };
    if (opts?.difficulty?.length) query["difficulty"] = opts.difficulty;
    if (opts?.tags?.length) query["tags"] = opts.tags;
    if (opts?.collections?.length) query["collections"] = opts.collections;
    return this.request<MealListResponseDTO>(
      "GET",
      `/api/agent/${encodeURIComponent(familyId)}/meals`,
      { query },
    );
  }

  /** Get the current week's plan (resolved in the family timezone). */
  getCurrentWeekPlan(familyId: string): Promise<WeekPlanDTO> {
    return this.request<WeekPlanDTO>(
      "GET",
      `/api/agent/${encodeURIComponent(familyId)}/weeks/current`,
    );
  }

  /** Get a specific week's plan by its Monday `weekStart` (YYYY-MM-DD). */
  getWeekPlan(familyId: string, weekStart: string): Promise<WeekPlanDTO> {
    return this.request<WeekPlanDTO>(
      "GET",
      `/api/agent/${encodeURIComponent(familyId)}/weeks/${encodeURIComponent(
        weekStart,
      )}`,
    );
  }

  /** List previous week plans (reverse-chronological, bounded pagination). */
  getPreviousWeekPlans(
    familyId: string,
    options: { before?: string; limit?: number } = {},
  ): Promise<PreviousWeeksResponseDTO> {
    return this.request<PreviousWeeksResponseDTO>(
      "GET",
      `/api/agent/${encodeURIComponent(familyId)}/weeks`,
      { query: { before: options.before, limit: options.limit } },
    );
  }

  /** List the family's recipe collections (#109). Read-only surface. */
  async listCollections(familyId: string): Promise<RecipeCollection[]> {
    const res = await this.request<{ collections: RecipeCollection[] }>(
      "GET",
      `/api/agent/${encodeURIComponent(familyId)}/collections`,
    );
    return res.collections;
  }

  /** List the family's reusable planning templates (#116). Read-only surface. */
  async listTemplates(familyId: string): Promise<PlanningTemplate[]> {
    const res = await this.request<{ templates: PlanningTemplate[] }>(
      "GET",
      `/api/agent/${encodeURIComponent(familyId)}/templates`,
    );
    return res.templates;
  }

  /**
   * List the family's *effective* grocery categories (#119): the shared
   * INGREDIENT_CATEGORIES defaults unioned with the family's custom categories.
   * Read-only surface — category management stays browser-only.
   */
  async listGroceryCategories(familyId: string): Promise<string[]> {
    const res = await this.request<{ categories: string[] }>(
      "GET",
      `/api/agent/${encodeURIComponent(familyId)}/grocery-categories`,
    );
    return res.categories;
  }

  // --- Mutation tools -------------------------------------------------------

  /** Schedule a meal onto a calendar date (creates an unapproved suggestion). */
  scheduleMeal(
    familyId: string,
    input: { mealId: string; date: string },
  ): Promise<MealSuggestionDTO> {
    return this.request<MealSuggestionDTO>(
      "POST",
      `/api/agent/${encodeURIComponent(familyId)}/schedule`,
      { body: input },
    );
  }

  /** Pick an eligible meal at random (by optional filters) and schedule it onto
   *  a calendar date (creates an unapproved suggestion). */
  scheduleRandomMeal(
    familyId: string,
    input: RandomScheduleInputDTO,
  ): Promise<MealSuggestionDTO> {
    return this.request<MealSuggestionDTO>(
      "POST",
      `/api/agent/${encodeURIComponent(familyId)}/schedule/random`,
      { body: input },
    );
  }

  /** Repeat a previous week: copy its approved meals into the target week as
   *  new unapproved suggestions. `existingMode` (default "error") decides how a
   *  target week that already has suggestions is treated. */
  repeatWeek(
    familyId: string,
    targetWeekStart: string,
    sourceWeekStart: string,
    existingMode?: RepeatWeekExistingMode,
  ): Promise<WeekPlanDTO> {
    return this.request<WeekPlanDTO>(
      "POST",
      `/api/agent/${encodeURIComponent(familyId)}/weeks/${encodeURIComponent(
        targetWeekStart,
      )}/repeat`,
      { body: { sourceWeekStart, existingMode } },
    );
  }

  /** Apply a planning template into a target week: materialize its entries as
   *  new unapproved suggestions (#116). `existingMode` (default "error") decides
   *  how a target week that already has suggestions is treated. */
  applyTemplate(
    familyId: string,
    templateId: string,
    targetWeekStart: string,
    existingMode?: RepeatWeekExistingMode,
  ): Promise<WeekPlanDTO> {
    return this.request<WeekPlanDTO>(
      "POST",
      `/api/agent/${encodeURIComponent(familyId)}/templates/${encodeURIComponent(
        templateId,
      )}/apply`,
      { body: { targetWeekStart, existingMode } },
    );
  }

  /** Fill the OPEN days of a target week with meals chosen at random by
   *  tag/collection/etc. filters, as new unapproved suggestions (#115).
   *  `existingMode` (default "error") decides how a target week that already has
   *  suggestions is treated; `allowPartial` (default true) fills as many open
   *  days as the eligible pool allows. */
  fillWeek(
    familyId: string,
    weekStart: string,
    input: FillWeekRequestDTO,
  ): Promise<WeekPlanDTO> {
    return this.request<WeekPlanDTO>(
      "POST",
      `/api/agent/${encodeURIComponent(familyId)}/weeks/${encodeURIComponent(
        weekStart,
      )}/fill`,
      { body: input },
    );
  }

  /** Approve a suggestion (privileged, parent-equivalent — approve scope). */
  approveSuggestion(
    familyId: string,
    suggestionId: string,
  ): Promise<MealSuggestionDTO> {
    return this.request<MealSuggestionDTO>(
      "PATCH",
      `/api/agent/${encodeURIComponent(familyId)}/suggestions/${encodeURIComponent(
        suggestionId,
      )}/approve`,
    );
  }

  /** Revert approval of a suggestion (privileged, parent-equivalent — approve scope). */
  unapproveSuggestion(
    familyId: string,
    suggestionId: string,
  ): Promise<MealSuggestionDTO> {
    return this.request<MealSuggestionDTO>(
      "PATCH",
      `/api/agent/${encodeURIComponent(familyId)}/suggestions/${encodeURIComponent(
        suggestionId,
      )}/unapprove`,
    );
  }

  // --- Meal catalog write (family-from-key; meal:write scope) ---------------

  /** Create a meal in the family the key resolves to (no family in the path).
   *  The returned meal carries the tabular ("Grid") recipe read fields
   *  (`matrixSource`, `ingredientDisplayOrder`, per-ingredient
   *  `position`/`groupLabel`, per-instruction effective
   *  `kind`/`subLabel`/`spanFrom`/`spanTo`) derived on read — Phase-1 MCP read
   *  parity. No matrix authoring input is accepted yet (Phase 2). */
  createMeal(input: CreateMealInput): Promise<TabularRecipeMealDTO> {
    return this.request<TabularRecipeMealDTO>("POST", `/api/agent/meals`, {
      body: input,
    });
  }

  /** Edit an existing meal by id in the family the key resolves to. The returned
   *  meal carries the same tabular ("Grid") recipe read fields as
   *  {@link createMeal} (derived on read; Phase-1 MCP read parity). */
  updateMeal(
    mealId: string,
    input: UpdateMealInput,
  ): Promise<TabularRecipeMealDTO> {
    return this.request<TabularRecipeMealDTO>(
      "PATCH",
      `/api/agent/meals/${encodeURIComponent(mealId)}`,
      { body: input },
    );
  }

  /**
   * Upload a binary image FOR a meal (agent surface; `meal:image` scope).
   *
   * MCP tool calls carry JSON, so the caller supplies the image as
   * base64-encoded bytes plus a declared content type. This method decodes the
   * base64 to raw bytes and POSTs them as `application/octet-stream` — NOT as a
   * JSON body — so a multi-megabyte image is never inflated into JSON and
   * rejected by the API's global 100kb json limit. The declared content type
   * rides along in the informational `x-image-content-type` header only; the
   * API authoritatively sniffs the magic bytes and ignores that header for its
   * security decision.
   *
   * `imageData` MUST be standard base64. The raw agent key is sent only in the
   * `x-agent-key` header and never placed in the URL or any log/error output.
   */
  async uploadMealImage(
    mealId: string,
    imageData: string,
    contentType: string,
  ): Promise<UploadMealImageResult> {
    const bytes = Buffer.from(imageData, "base64");
    const url = new URL(
      `${this.baseUrl}/api/agent/meals/${encodeURIComponent(mealId)}/image`,
    );

    const headers: Record<string, string> = {
      [AGENT_KEY_HEADER]: this.agentKey,
      accept: "application/json",
      "content-type": "application/octet-stream",
      // Informational only — the API trusts magic-byte sniffing, not this.
      "x-image-content-type": contentType,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers,
        body: new Uint8Array(bytes),
        signal: controller.signal,
      });
    } catch (err) {
      // Never surface the URL/headers (which carry the key) — just the reason.
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? `Request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : "Network request failed";
      throw new ApiTransportError(reason);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    try {
      return (await response.json()) as UploadMealImageResult;
    } catch {
      throw new ApiError(
        response.status,
        "API returned a non-JSON response body",
      );
    }
  }

  // --- Collection write (family-from-key; meal:write scope) -----------------

  /** Create a collection in the family the key resolves to. When `mealIds` is
   *  provided, the new collection's meal membership is replace-set to those ids.
   *  Idempotent by name: if a collection with the same name already exists it is
   *  returned unchanged. */
  createCollection(input: {
    name: string;
    description?: string | null;
    mealIds?: string[];
  }): Promise<RecipeCollection> {
    return this.request<RecipeCollection>("POST", `/api/agent/collections`, {
      body: input,
    });
  }

  /** Update an existing collection by id in the family the key resolves to.
   *  When `mealIds` is provided, the membership is REPLACE-SET. Pass `[]` to
   *  clear all members. Omit `mealIds` to leave membership untouched. */
  updateCollection(
    collectionId: string,
    input: {
      name?: string;
      description?: string | null;
      mealIds?: string[];
    },
  ): Promise<RecipeCollection> {
    return this.request<RecipeCollection>(
      "PATCH",
      `/api/agent/collections/${encodeURIComponent(collectionId)}`,
      { body: input },
    );
  }

  // --- Grocery read (family-from-key; meal_plan:read scope) -----------------

  /** Get the family's CURRENT-week grocery list (generated on demand if none
   *  exists yet). Family + week are resolved server-side from the key. */
  getCurrentGroceryList(): Promise<GroceryList> {
    return this.request<GroceryList>("GET", `/api/agent/grocery/current`);
  }

  // --- Transport ------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, v);
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      [AGENT_KEY_HEADER]: this.agentKey,
      accept: "application/json",
    };
    const hasBody = options.body !== undefined;
    if (hasBody) {
      headers["content-type"] = "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      // Never surface the URL/headers (which carry the key) — just the reason.
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? `Request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : "Network request failed";
      throw new ApiTransportError(reason);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(
        response.status,
        "API returned a non-JSON response body",
      );
    }
  }

  /** Convert a non-2xx response into an {@link ApiError}, extracting the API's
   *  `{ error, details }` shape when present. */
  private async toApiError(response: Response): Promise<ApiError> {
    let message = `Request failed with status ${response.status}`;
    let details: unknown;
    try {
      const body = (await response.json()) as {
        error?: unknown;
        details?: unknown;
      };
      if (typeof body?.error === "string" && body.error.length > 0) {
        message = body.error;
      }
      details = body?.details;
    } catch {
      // Non-JSON error body — keep the generic status message.
    }
    return new ApiError(response.status, message, details);
  }
}
