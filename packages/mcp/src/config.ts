import { z } from "zod";

/**
 * Runtime configuration for the MCP server. Every value is sourced from the
 * environment — nothing is hardcoded, and the agent credential in particular is
 * NEVER written to a config file, a log line, or an error message.
 *
 * There are two modes:
 *  - stdio (local, single-tenant): {@link loadConfig} requires a KEY + FAMILY
 *    baked into the environment. Kept for backward-compat and the #77 smoke
 *    tests.
 *  - hosted HTTP (multi-tenant): {@link loadHttpConfig} requires NEITHER — the
 *    agent key is supplied per request via the `x-agent-key` header and the
 *    family is resolved from it. Only the API base URL (+ optional port /
 *    timeout) is needed at boot.
 */
export interface McpConfig {
  /** Base URL of the meal-planner API, e.g. `http://localhost:3001`. No
   *  trailing slash (normalized on load). */
  apiBaseUrl: string;
  /** The raw scoped agent credential key, sent as the `x-agent-key` header.
   *  Treated as a secret: never logged, never serialized. */
  agentKey: string;
  /** The family the agent credential is scoped to. All tool calls operate
   *  within this family; the API independently rejects cross-family use. */
  familyId: string;
  /** Per-request timeout in milliseconds. */
  requestTimeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

const envSchema = z.object({
  MEAL_PLANNER_API_BASE_URL: z
    .string()
    .url("MEAL_PLANNER_API_BASE_URL must be a valid URL"),
  MEAL_PLANNER_AGENT_KEY: z
    .string()
    .min(1, "MEAL_PLANNER_AGENT_KEY is required"),
  MEAL_PLANNER_FAMILY_ID: z
    .string()
    .min(1, "MEAL_PLANNER_FAMILY_ID is required"),
  MEAL_PLANNER_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
});

/** The env var names the config reads. Exposed so error messages and docs stay
 *  in sync with the schema. */
export const CONFIG_ENV_VARS = [
  "MEAL_PLANNER_API_BASE_URL",
  "MEAL_PLANNER_AGENT_KEY",
  "MEAL_PLANNER_FAMILY_ID",
  "MEAL_PLANNER_REQUEST_TIMEOUT_MS",
] as const;

/**
 * Loads and validates configuration from the environment. Throws a single
 * aggregated error (listing the offending variable NAMES only — never their
 * values) when required variables are missing or malformed, so a misconfigured
 * secret can never leak through a validation message.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Report field names + messages only. Zod's default message does not echo
    // the input value, and we deliberately do not include `env` contents.
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid MCP configuration: ${issues}`);
  }

  const data = parsed.data;
  return {
    apiBaseUrl: data.MEAL_PLANNER_API_BASE_URL.replace(/\/+$/, ""),
    agentKey: data.MEAL_PLANNER_AGENT_KEY,
    familyId: data.MEAL_PLANNER_FAMILY_ID,
    requestTimeoutMs:
      data.MEAL_PLANNER_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  };
}

const DEFAULT_HTTP_PORT = 3100;

/**
 * Runtime configuration for the HOSTED (Streamable HTTP) MCP server. Crucially
 * it does NOT read an agent key or family id: those arrive per request in the
 * `x-agent-key` header and the family is resolved from the key via
 * `GET /api/agent/me`. Only the API base URL is required.
 */
export interface HttpMcpConfig {
  /** Base URL of the meal-planner API, e.g. `http://localhost:3001`. */
  apiBaseUrl: string;
  /** TCP port the hosted MCP HTTP server listens on. */
  port: number;
  /** Per-request timeout in milliseconds for calls to the API. */
  requestTimeoutMs: number;
}

const httpEnvSchema = z.object({
  MEAL_PLANNER_API_BASE_URL: z
    .string()
    .url("MEAL_PLANNER_API_BASE_URL must be a valid URL"),
  MEAL_PLANNER_MCP_PORT: z.coerce.number().int().positive().optional(),
  MEAL_PLANNER_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
});

/** The env var names the hosted config reads. */
export const HTTP_CONFIG_ENV_VARS = [
  "MEAL_PLANNER_API_BASE_URL",
  "MEAL_PLANNER_MCP_PORT",
  "MEAL_PLANNER_REQUEST_TIMEOUT_MS",
] as const;

/**
 * Loads and validates the hosted-server configuration. Deliberately NEVER reads
 * an agent key or family id — a hosted server must not carry an ambient
 * credential. Throws an aggregated error listing offending variable NAMES only.
 */
export function loadHttpConfig(
  env: NodeJS.ProcessEnv = process.env,
): HttpMcpConfig {
  const parsed = httpEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid MCP HTTP configuration: ${issues}`);
  }

  const data = parsed.data;
  return {
    apiBaseUrl: data.MEAL_PLANNER_API_BASE_URL.replace(/\/+$/, ""),
    port: data.MEAL_PLANNER_MCP_PORT ?? DEFAULT_HTTP_PORT,
    requestTimeoutMs:
      data.MEAL_PLANNER_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  };
}
