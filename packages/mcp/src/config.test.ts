import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const BASE_ENV = {
  MEAL_PLANNER_API_BASE_URL: "http://localhost:3001",
  MEAL_PLANNER_AGENT_KEY: "super-secret-agent-key",
  MEAL_PLANNER_FAMILY_ID: "fam-1",
} as NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("parses a valid environment", () => {
    const config = loadConfig(BASE_ENV);
    expect(config).toEqual({
      apiBaseUrl: "http://localhost:3001",
      agentKey: "super-secret-agent-key",
      familyId: "fam-1",
      requestTimeoutMs: 15_000,
    });
  });

  it("strips a trailing slash from the base URL", () => {
    const config = loadConfig({
      ...BASE_ENV,
      MEAL_PLANNER_API_BASE_URL: "https://api.example.com/",
    });
    expect(config.apiBaseUrl).toBe("https://api.example.com");
  });

  it("honors a custom request timeout", () => {
    const config = loadConfig({
      ...BASE_ENV,
      MEAL_PLANNER_REQUEST_TIMEOUT_MS: "5000",
    });
    expect(config.requestTimeoutMs).toBe(5000);
  });

  it("throws when the agent key is missing", () => {
    const env = { ...BASE_ENV };
    delete env.MEAL_PLANNER_AGENT_KEY;
    expect(() => loadConfig(env)).toThrow(/MEAL_PLANNER_AGENT_KEY/);
  });

  it("throws when the base URL is not a URL", () => {
    expect(() =>
      loadConfig({ ...BASE_ENV, MEAL_PLANNER_API_BASE_URL: "not-a-url" }),
    ).toThrow(/MEAL_PLANNER_API_BASE_URL/);
  });

  it("never echoes the agent key value in a validation error", () => {
    // Trigger a validation failure (bad URL) while a real key is present, and
    // assert the secret does not leak into the error message.
    let message = "";
    try {
      loadConfig({ ...BASE_ENV, MEAL_PLANNER_API_BASE_URL: "nope" });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toContain("super-secret-agent-key");
  });
});
