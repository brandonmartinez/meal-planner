import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { authRouter } = await import("./auth.js");

const logoutHandler = getRouteHandler(authRouter, "post", "/logout");
const meHandler = getRouteHandler(authRouter, "get", "/me");
const callbackHandler = getRouteHandler(authRouter, "get", "/google/callback");

const USER_ID = "user-1";

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
