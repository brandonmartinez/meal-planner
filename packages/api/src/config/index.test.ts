import { describe, it, expect } from "vitest";
import {
  config,
  parseTrustProxy,
  findMissingProductionVars,
  assertProductionConfig,
  validateConfigForEnvironment,
} from "./index.js";

// A fully-populated production environment with real (non-default) values.
// Tests clone and mutate this so cases stay isolated — no process.env writes.
function fullProdEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    JWT_SECRET: "a-real-strong-production-secret",
    DATABASE_URL: "postgresql://prod:prodpw@db.internal:5432/meal_planner",
    GOOGLE_CLIENT_ID: "real-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "real-google-client-secret",
    GOOGLE_CALLBACK_URL: "https://app.example.com/api/auth/google/callback",
    CLIENT_URL: "https://app.example.com",
  };
}

// The repo-known development defaults the guard must reject in production.
const DEV_JWT_SECRET = "dev-secret-change-in-production";
const DEV_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/meal_planner";
const DEV_CLIENT_URL = "http://localhost:5173";
const DEV_CALLBACK_URL = "http://localhost:3001/api/auth/google/callback";

describe("config production fail-closed guard", () => {
  describe("findMissingProductionVars", () => {
    it("returns no offenders when every required var is set to a real value", () => {
      expect(findMissingProductionVars(fullProdEnv())).toEqual([]);
    });

    it("flags JWT_SECRET when unset", () => {
      const env = fullProdEnv();
      delete env.JWT_SECRET;
      expect(findMissingProductionVars(env)).toContain("JWT_SECRET");
    });

    it("flags JWT_SECRET when it equals the development default", () => {
      const env = fullProdEnv();
      env.JWT_SECRET = DEV_JWT_SECRET;
      expect(findMissingProductionVars(env)).toContain("JWT_SECRET");
    });

    it("flags DATABASE_URL when unset or still the dev default", () => {
      const unset = fullProdEnv();
      delete unset.DATABASE_URL;
      expect(findMissingProductionVars(unset)).toContain("DATABASE_URL");

      const dev = fullProdEnv();
      dev.DATABASE_URL = DEV_DATABASE_URL;
      expect(findMissingProductionVars(dev)).toContain("DATABASE_URL");
    });

    it("flags missing Google OAuth credentials", () => {
      const noId = fullProdEnv();
      delete noId.GOOGLE_CLIENT_ID;
      expect(findMissingProductionVars(noId)).toContain("GOOGLE_CLIENT_ID");

      const noSecret = fullProdEnv();
      delete noSecret.GOOGLE_CLIENT_SECRET;
      expect(findMissingProductionVars(noSecret)).toContain(
        "GOOGLE_CLIENT_SECRET",
      );
    });

    it("flags an empty-string Google client id (default-equivalent)", () => {
      const env = fullProdEnv();
      env.GOOGLE_CLIENT_ID = "";
      expect(findMissingProductionVars(env)).toContain("GOOGLE_CLIENT_ID");
    });

    it("flags callback and client URLs when still the dev defaults", () => {
      const env = fullProdEnv();
      env.GOOGLE_CALLBACK_URL = DEV_CALLBACK_URL;
      env.CLIENT_URL = DEV_CLIENT_URL;
      const missing = findMissingProductionVars(env);
      expect(missing).toContain("GOOGLE_CALLBACK_URL");
      expect(missing).toContain("CLIENT_URL");
    });

    it("reports every offender at once, not just the first", () => {
      const env = fullProdEnv();
      delete env.JWT_SECRET;
      delete env.DATABASE_URL;
      const missing = findMissingProductionVars(env);
      expect(missing).toEqual(
        expect.arrayContaining(["JWT_SECRET", "DATABASE_URL"]),
      );
      expect(missing.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("assertProductionConfig", () => {
    it("does not throw when all production secrets are present and real", () => {
      expect(() => assertProductionConfig(fullProdEnv())).not.toThrow();
    });

    it("throws and names the offending variable when a secret is missing", () => {
      const env = fullProdEnv();
      delete env.JWT_SECRET;
      expect(() => assertProductionConfig(env)).toThrow(/JWT_SECRET/);
    });

    it("never includes the secret value in the error message", () => {
      const env = fullProdEnv();
      env.JWT_SECRET = DEV_JWT_SECRET;
      env.DATABASE_URL = "postgresql://leaky:SUPERSECRETPW@host:5432/db";
      // DATABASE_URL here is non-default so it should NOT be flagged; the only
      // offender is JWT_SECRET (== dev default). Either way, no value leaks.
      let message = "";
      try {
        assertProductionConfig(env);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain("JWT_SECRET");
      expect(message).not.toContain(DEV_JWT_SECRET);
      expect(message).not.toContain("SUPERSECRETPW");
    });
  });

  describe("validateConfigForEnvironment", () => {
    it("throws in production when required secrets are missing", () => {
      expect(() =>
        validateConfigForEnvironment({ NODE_ENV: "production" }),
      ).toThrow();
    });

    it("does not throw in production when all secrets are present", () => {
      expect(() => validateConfigForEnvironment(fullProdEnv())).not.toThrow();
    });

    it("is a no-op in development even with no secrets set (dev fallback)", () => {
      expect(() =>
        validateConfigForEnvironment({ NODE_ENV: "development" }),
      ).not.toThrow();
    });

    it("is a no-op in test even with no secrets set", () => {
      expect(() =>
        validateConfigForEnvironment({ NODE_ENV: "test" }),
      ).not.toThrow();
    });
  });

  describe("development/test config object is unchanged", () => {
    it("exposes the test-env values wired up by tests/setup.ts", () => {
      // setup.ts sets NODE_ENV=test plus test JWT/DB values; the config object
      // still resolves via the same `||` fallbacks as before.
      expect(config.jwt.secret).toBe(process.env.JWT_SECRET);
      expect(config.databaseUrl).toBe(process.env.DATABASE_URL);
      expect(typeof config.port).toBe("number");
      expect(config.clientUrl).toBeTruthy();
    });
  });
});

describe("parseTrustProxy", () => {
  it("defaults to a single ingress hop when TRUST_PROXY is unset", () => {
    expect(parseTrustProxy(undefined)).toBe(1);
  });

  it("defaults to a single hop for empty/whitespace values", () => {
    expect(parseTrustProxy("")).toBe(1);
    expect(parseTrustProxy("   ")).toBe(1);
  });

  it("parses a bare integer as a finite hop count", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy(" 3 ")).toBe(3);
  });

  it("never blanket-trusts by default (finite hop count, not `true`)", () => {
    // The default must be a finite number so X-Forwarded-For cannot be fully
    // client-controlled and so express-rate-limit does not raise its
    // permissive-trust error.
    const value = parseTrustProxy(undefined);
    expect(typeof value).toBe("number");
    expect(value).not.toBe(true);
    expect(Number.isFinite(value as number)).toBe(true);
  });

  it("supports Express presets and subnet lists verbatim", () => {
    expect(parseTrustProxy("loopback")).toBe("loopback");
    expect(parseTrustProxy("10.0.0.0/8, 127.0.0.1")).toBe(
      "10.0.0.0/8, 127.0.0.1",
    );
  });

  it("supports explicit boolean opt-in/opt-out forms", () => {
    // `true` is accepted for completeness but discouraged; `false` disables
    // proxy trust entirely (req.ip == socket address).
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("resolves config.trustProxy to the safe single-hop default under test", () => {
    // TRUST_PROXY is unset in the test env, so the live config must use the
    // finite single-hop default rather than any permissive value.
    expect(config.trustProxy).toBe(1);
  });
});
