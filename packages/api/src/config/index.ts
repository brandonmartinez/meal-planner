/**
 * Application configuration.
 *
 * Local development and tests fall back to safe-by-default dev values so the
 * app boots with zero setup. In production we refuse to start with missing
 * required secrets or known development defaults — see
 * `validateConfigForEnvironment` / `assertProductionConfig`, which run at
 * module load and fail fast.
 */

/**
 * Known development defaults. Centralised here so the `config` object and the
 * production guard agree on exactly what counts as "still the dev default".
 */
const DEV_DEFAULTS = {
  CLIENT_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/meal_planner",
  JWT_SECRET: "dev-secret-change-in-production",
  GOOGLE_CALLBACK_URL: "http://localhost:3001/api/auth/google/callback",
  // Server-side pepper for keyed credential hashing (agent credentials +
  // display API keys). Like JWT_SECRET, this dev value MUST be overridden in
  // production — the guard below fails closed if it is still the default.
  CREDENTIAL_PEPPER: "dev-pepper-change-in-production",
} as const;

/**
 * Parse the Express `trust proxy` setting from `TRUST_PROXY`.
 *
 * The app runs behind a SINGLE reverse-proxy hop — the Traefik Kubernetes
 * ingress (see `k8s/ingress.yaml`) terminates TLS and forwards to the pod,
 * appending the real client address to `X-Forwarded-For`. Express must be told
 * how many hops to trust so `req.ip` (and therefore the IP-keyed rate
 * limiters) resolve the real client instead of the proxy's address.
 *
 * We deliberately DO NOT default to the blanket `true`: trusting every proxy
 * makes `X-Forwarded-For` fully client-controlled, letting an attacker spoof
 * their IP to dodge rate limits. A finite hop count only trusts the
 * infrastructure directly in front of us, and also avoids express-rate-limit's
 * permissive-trust validation error (`ERR_ERL_PERMISSIVE_TRUST_PROXY`).
 *
 * Supported `TRUST_PROXY` forms (matching what Express accepts):
 *  - a hop count, e.g. `"1"` (default), `"2"`
 *  - a preset or subnet list, e.g. `"loopback"`, `"10.0.0.0/8, 127.0.0.1"`
 *  - `"false"` to disable proxy trust entirely (`req.ip` = socket address)
 *  - `"true"` is accepted for completeness but STRONGLY discouraged (see above)
 *
 * Default when unset: `1` — the single ingress hop.
 */
export function parseTrustProxy(
  raw: string | undefined = process.env.TRUST_PROXY,
): boolean | number | string {
  if (raw === undefined || raw.trim() === "") {
    return 1;
  }
  const value = raw.trim();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  // A bare non-negative integer is a hop count.
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  // Otherwise treat it as an Express preset ("loopback", "linklocal",
  // "uniquelocal") or a comma-separated list of trusted IPs/subnets.
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  // How many reverse-proxy hops to trust when resolving the client IP from
  // `X-Forwarded-For`. Behind the single Traefik ingress hop this is `1`.
  // See `parseTrustProxy` for the security rationale (never blanket-`true`).
  trustProxy: parseTrustProxy(),
  clientUrl: process.env.CLIENT_URL || DEV_DEFAULTS.CLIENT_URL,
  databaseUrl: process.env.DATABASE_URL || DEV_DEFAULTS.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET || DEV_DEFAULTS.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  // Never logged. Consumed by utils/credentialHash.ts to key the HMAC used for
  // agent-credential and display-API-key hashing.
  credentialPepper:
    process.env.CREDENTIAL_PEPPER || DEV_DEFAULTS.CREDENTIAL_PEPPER,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL || DEV_DEFAULTS.GOOGLE_CALLBACK_URL,
  },
} as const;

/**
 * A secret/URL that must hold a real, non-default value before the API is
 * allowed to boot in production. When `devDefault` is set, a value equal to it
 * is treated as "still the dev default" and therefore unsafe for production.
 */
interface RequiredVar {
  name: string;
  devDefault?: string;
}

/**
 * Environment variables required in production. Each is checked for being
 * unset, empty, or equal to its known development default. Only the variable
 * NAME is ever surfaced in errors — values are never read into output.
 */
const PRODUCTION_REQUIRED_VARS: readonly RequiredVar[] = [
  { name: "JWT_SECRET", devDefault: DEV_DEFAULTS.JWT_SECRET },
  { name: "CREDENTIAL_PEPPER", devDefault: DEV_DEFAULTS.CREDENTIAL_PEPPER },
  { name: "DATABASE_URL", devDefault: DEV_DEFAULTS.DATABASE_URL },
  { name: "GOOGLE_CLIENT_ID" },
  { name: "GOOGLE_CLIENT_SECRET" },
  { name: "GOOGLE_CALLBACK_URL", devDefault: DEV_DEFAULTS.GOOGLE_CALLBACK_URL },
  { name: "CLIENT_URL", devDefault: DEV_DEFAULTS.CLIENT_URL },
];

/**
 * Returns the names of required production variables that are unset, empty, or
 * still set to a known development default. Reads raw env so it can tell a
 * provided value apart from a defaulted one. Never returns or logs values.
 */
export function findMissingProductionVars(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return PRODUCTION_REQUIRED_VARS.filter(({ name, devDefault }) => {
    const value = env[name];
    if (value === undefined || value.trim() === "") {
      return true;
    }
    if (devDefault !== undefined && value === devDefault) {
      return true;
    }
    return false;
  }).map(({ name }) => name);
}

/**
 * Throws if any required production secret is missing or still a development
 * default. The error names ONLY the offending variables — never their values,
 * so secrets are never written to logs or stack traces.
 */
export function assertProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing = findMissingProductionVars(env);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: ${missing.length} required production environment ` +
        `variable(s) are missing or set to a known development default: ` +
        `${missing.join(", ")}. Set each to a secure production value.`,
    );
  }
}

/**
 * Startup guard. In production (`NODE_ENV === "production"`) this enforces that
 * all required secrets are present and non-default. In any other environment
 * it is a no-op, so local development and tests keep their fallbacks.
 */
export function validateConfigForEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === "production") {
    assertProductionConfig(env);
  }
}

// Fail fast at startup: importing this module in production with missing or
// default secrets throws before any route, DB, or auth code can run.
validateConfigForEnvironment();
