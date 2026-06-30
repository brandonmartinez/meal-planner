/**
 * Shared typed fetch helper for every `src/api/*.ts` client.
 *
 * It sets `credentials: 'include'` and JSON headers, parses backend error
 * messages consistently, and throws a typed {@link ApiError} carrying the HTTP
 * status. Call this instead of `fetch()` directly from api clients, components,
 * or pages (see `.github/instructions/web.instructions.md`).
 */

/** Error thrown by {@link request} for any non-2xx response. The `status`
 *  lets callers branch on specific codes (e.g. treat 404 as "not found"). */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const { headers, ...rest } = options;
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers },
    ...rest,
  });

  if (!res.ok) {
    throw new ApiError(await parseErrorMessage(res), res.status);
  }

  // 204 No Content (and other empty bodies) have nothing to parse.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Pull the backend-provided `{ error: string }` message out of a failed
 *  response, falling back to `HTTP <status>` when the body is missing or not
 *  the expected shape. */
async function parseErrorMessage(res: Response): Promise<string> {
  const fallback = `HTTP ${res.status}`;
  const text = await res.text().catch(() => "");
  if (!text) return fallback;
  try {
    const body: unknown = JSON.parse(text);
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    /* non-JSON error body — use the fallback */
  }
  return fallback;
}
