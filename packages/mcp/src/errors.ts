/**
 * A failed HTTP call to the meal-planner API. Carries the HTTP status and the
 * API's error message (parsed from the JSON body when present) so tool handlers
 * can map it to a clean MCP tool error without exposing transport internals or
 * the agent credential.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * A network/transport failure (DNS, connection refused, timeout/abort) — i.e.
 * the request never produced an HTTP response. Distinct from {@link ApiError},
 * which represents a non-2xx HTTP response.
 */
export class ApiTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiTransportError";
  }
}
