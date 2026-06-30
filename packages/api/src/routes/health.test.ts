import { describe, it, expect, afterEach } from "vitest";
import { buildReq, buildRes, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler } from "../../tests/helpers/router.js";

const { healthRouter } = await import("./health.js");

const handler = getRouteHandler(healthRouter, "get", "/");

describe("GET /api/health", () => {
  const original = process.env.npm_package_version;

  afterEach(() => {
    if (original === undefined) delete process.env.npm_package_version;
    else process.env.npm_package_version = original;
  });

  it("returns 200 with status: 'ok' and an ISO timestamp", () => {
    const res = buildRes();
    handler(buildReq(), res, buildNext());

    expect(res.statusCode).toBe(200);
    const body = res.body as { status: string; timestamp: string; version: string };
    expect(body.status).toBe("ok");
    // Timestamp round-trips through Date without becoming NaN.
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it("reports the npm_package_version when set", () => {
    process.env.npm_package_version = "9.9.9";
    const res = buildRes();
    handler(buildReq(), res, buildNext());
    expect((res.body as { version: string }).version).toBe("9.9.9");
  });

  it("falls back to '0.1.0' when npm_package_version is unset", () => {
    delete process.env.npm_package_version;
    const res = buildRes();
    handler(buildReq(), res, buildNext());
    expect((res.body as { version: string }).version).toBe("0.1.0");
  });
});
