import type {
  MealListItemDTO,
  WeekPlanDTO,
  PreviousWeeksResponseDTO,
  MealSuggestionDTO,
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
  query?: Record<string, string | number | undefined>;
  body?: unknown;
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

  /** List the family's meals, including the recently-scheduled indicator. */
  listMeals(familyId: string, search?: string): Promise<MealListItemDTO[]> {
    return this.request<MealListItemDTO[]>(
      "GET",
      `/api/agent/${encodeURIComponent(familyId)}/meals`,
      { query: { search } },
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

  // --- Transport ------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
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
