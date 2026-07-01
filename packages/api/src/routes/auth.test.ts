import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";
import { config } from "../config/index.js";
import { DEMO_USER } from "../config/demo.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { authRouter } = await import("./auth.js");

const logoutHandler = getRouteHandler(authRouter, "post", "/logout");
const meHandler = getRouteHandler(authRouter, "get", "/me");
const callbackHandler = getRouteHandler(authRouter, "get", "/google/callback");
const devLoginHandler = getRouteHandler(authRouter, "post", "/dev-login");
const configHandler = getRouteHandler(authRouter, "get", "/config");

const USER_ID = "user-1";

// `config` is a plain object (`as const` is a TS-only assertion, not
// Object.freeze), so tests can toggle the dev-login/Google feature flags at
// runtime and restore them afterwards. The route handlers read these live.
const devLoginDefault = config.devLogin.enabled;
const googleDefault = { ...config.google };

function setDevLoginEnabled(enabled: boolean): void {
  (config.devLogin as { enabled: boolean }).enabled = enabled;
}

function setGoogleCredentials(clientId: string, clientSecret: string): void {
  (config.google as { clientId: string; clientSecret: string }).clientId =
    clientId;
  (config.google as { clientId: string; clientSecret: string }).clientSecret =
    clientSecret;
}

afterEach(() => {
  setDevLoginEnabled(devLoginDefault);
  setGoogleCredentials(googleDefault.clientId, googleDefault.clientSecret);
});

describe("POST /api/auth/logout", () => {
  it("clears the token cookie and returns the logout message", () => {
    const res = buildFullRes();
    logoutHandler(buildReq(), res, buildNext());

    expect(res.clearedCookies).toContain("token");
    expect(res.body).toEqual({ message: "Logged out" });
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
  });

  it("404s when the authenticated user no longer exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null as never);
    const req = buildReq({ user: { id: USER_ID } as never });
    const res = buildFullRes();
    await meHandler(req, res, buildNext());

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "User not found" });
  });

  it("returns the user profile with flattened memberships", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: "a@b.com",
      name: "Ada",
      avatarUrl: "https://x/a.png",
      memberships: [
        {
          id: "mem-1",
          role: "PARENT",
          familyId: "fam-1",
          userId: USER_ID,
          family: { id: "fam-1", name: "Martinez" },
        },
      ],
    } as never);

    const req = buildReq({ user: { id: USER_ID } as never });
    const res = buildFullRes();
    await meHandler(req, res, buildNext());

    const body = res.body as {
      id: string;
      memberships: { id: string; role: string; family: { name: string } }[];
    };
    expect(body.id).toBe(USER_ID);
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0]).toMatchObject({
      id: "mem-1",
      role: "PARENT",
      familyId: "fam-1",
      family: { id: "fam-1", name: "Martinez" },
    });
  });
});

describe("GET /api/auth/google/callback", () => {
  it("issues an httpOnly token cookie and redirects to the client app", () => {
    const req = buildReq({
      user: { id: USER_ID, email: "a@b.com", name: "Ada" } as never,
    });
    const res = buildFullRes();
    callbackHandler(req, res, buildNext());

    // A signed JWT was set as the `token` cookie...
    expect(typeof res.cookies.token).toBe("string");
    expect((res.cookies.token as string).length).toBeGreaterThan(0);
    // ...with httpOnly hardening, and the user is redirected onward.
    const cookieCall = (res.cookie as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    expect((cookieCall[2] as { httpOnly: boolean }).httpOnly).toBe(true);
    expect(res.redirectedTo).toBeDefined();
  });
});

describe("POST /api/auth/dev-login", () => {
  beforeEach(() => {
    prismaMock.user.upsert.mockReset();
  });

  it("find-or-creates the demo user and sets an httpOnly token cookie when enabled", async () => {
    setDevLoginEnabled(true);
    prismaMock.user.upsert.mockResolvedValue({
      id: USER_ID,
      email: DEMO_USER.email,
      name: DEMO_USER.name,
    } as never);

    const res = buildFullRes();
    await devLoginHandler(buildReq(), res, buildNext());

    // Upserts on the fixed demo identity from config/demo.ts so dev-login works
    // even before the seed has run.
    expect(prismaMock.user.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prismaMock.user.upsert.mock.calls[0][0] as {
      where: { email: string };
      create: { email: string; name: string };
    };
    expect(upsertArg.where.email).toBe(DEMO_USER.email);
    expect(upsertArg.create).toEqual({
      email: DEMO_USER.email,
      name: DEMO_USER.name,
    });

    // A signed JWT was set as the `token` cookie with httpOnly hardening,
    // matching the Google callback's cookie flags.
    expect(typeof res.cookies.token).toBe("string");
    expect((res.cookies.token as string).length).toBeGreaterThan(0);
    const cookieCall = (res.cookie as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    const cookieOpts = cookieCall[2] as {
      httpOnly: boolean;
      sameSite: string;
      secure: boolean;
    };
    expect(cookieOpts.httpOnly).toBe(true);
    expect(cookieOpts.sameSite).toBe("lax");
    // Not production under test → cookie is not marked Secure.
    expect(cookieOpts.secure).toBe(false);

    // Returns the demo user shape (no secrets).
    expect(res.body).toEqual({
      id: USER_ID,
      email: DEMO_USER.email,
      name: DEMO_USER.name,
    });
  });

  // The critical security test: with dev-login disabled (production, or an
  // explicit ENABLE_DEV_LOGIN=false), the route must 404 and leak NO cookie and
  // NO user — production must never advertise or perform a passwordless login.
  it("returns 404 and sets no cookie when disabled", async () => {
    setDevLoginEnabled(false);

    const res = buildFullRes();
    await devLoginHandler(buildReq(), res, buildNext());

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
    // No auth was performed: the demo user was never touched and no cookie set.
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.cookies.token).toBeUndefined();
  });
});

describe("GET /api/auth/config", () => {
  it("reports both sign-in options enabled when available", () => {
    setDevLoginEnabled(true);
    setGoogleCredentials("client-id", "client-secret");

    const res = buildFullRes();
    configHandler(buildReq(), res, buildNext());

    expect(res.body).toEqual({ devLoginEnabled: true, googleEnabled: true });
  });

  it("reports both disabled when dev-login is off and Google is unconfigured", () => {
    setDevLoginEnabled(false);
    setGoogleCredentials("", "");

    const res = buildFullRes();
    configHandler(buildReq(), res, buildNext());

    expect(res.body).toEqual({ devLoginEnabled: false, googleEnabled: false });
  });

  it("reveals only feature flags — never any secret", () => {
    setDevLoginEnabled(true);
    setGoogleCredentials("client-id", "super-secret-value");

    const res = buildFullRes();
    configHandler(buildReq(), res, buildNext());

    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["devLoginEnabled", "googleEnabled"]);
    expect(JSON.stringify(body)).not.toContain("super-secret-value");
  });
});
