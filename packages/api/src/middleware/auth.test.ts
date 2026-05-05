import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildRes, buildNext } from "../../tests/helpers/express.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { authenticateJWT, requireRole, authenticateApiKey } =
  await import("./auth.js");

function makeToken(id = "u-1") {
  return jwt.sign(
    { id, email: "a@b.com", name: "Alice" },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" },
  );
}

describe("authenticateJWT", () => {
  it("responds 401 when no token is present", async () => {
    const req = buildReq();
    const res = buildRes();
    const next = buildNext();
    await authenticateJWT(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("reads a Bearer token from the Authorization header", async () => {
    const req = buildReq({
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    const res = buildRes();
    const next = buildNext();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-1",
      memberships: [],
    } as never);

    await authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as { user: { id: string } }).user.id).toBe("u-1");
  });

  it("falls back to the cookie when no Authorization header is present", async () => {
    const req = buildReq({ cookies: { token: makeToken() } });
    const res = buildRes();
    const next = buildNext();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-1" } as never);

    await authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("responds 401 on an invalid token", async () => {
    const req = buildReq({ headers: { authorization: "Bearer not-a-jwt" } });
    const res = buildRes();
    const next = buildNext();
    await authenticateJWT(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 401 when the user record is missing", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const req = buildReq({
      headers: { authorization: `Bearer ${makeToken()}` },
    });
    const res = buildRes();
    const next = buildNext();
    await authenticateJWT(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "User not found" });
  });
});

describe("requireRole", () => {
  it("responds 400 when no familyId is on the request", () => {
    const handler = requireRole("PARENT");
    const req = buildReq();
    const res = buildRes();
    const next = buildNext();
    handler(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("responds 403 when user is not a member of the family", () => {
    const handler = requireRole("PARENT");
    const req = buildReq({ params: { familyId: "fam-1" } });
    (req as unknown as { user: unknown }).user = { memberships: [] };
    const res = buildRes();
    const next = buildNext();
    handler(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it("responds 403 when PARENT is required but membership is CHILD", () => {
    const handler = requireRole("PARENT");
    const req = buildReq({ params: { familyId: "fam-1" } });
    (req as unknown as { user: unknown }).user = {
      memberships: [{ familyId: "fam-1", role: "CHILD" }],
    };
    const res = buildRes();
    const next = buildNext();
    handler(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Parent role required" });
  });

  it("passes through when PARENT is required and membership is PARENT", () => {
    const handler = requireRole("PARENT");
    const req = buildReq({ params: { familyId: "fam-1" } });
    (req as unknown as { user: unknown }).user = {
      memberships: [{ familyId: "fam-1", role: "PARENT" }],
    };
    const res = buildRes();
    const next = buildNext();
    handler(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("CHILD role tolerates either role membership", () => {
    const handler = requireRole("CHILD");
    const req = buildReq({ params: { familyId: "fam-1" } });
    (req as unknown as { user: unknown }).user = {
      memberships: [{ familyId: "fam-1", role: "CHILD" }],
    };
    const res = buildRes();
    const next = buildNext();
    handler(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("authenticateApiKey", () => {
  it("responds 401 when x-api-key is missing", async () => {
    const req = buildReq();
    const res = buildRes();
    const next = buildNext();
    await authenticateApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "API key required" });
  });

  it("responds 401 on unknown key", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null);
    const req = buildReq({ headers: { "x-api-key": "abc" } });
    const res = buildRes();
    const next = buildNext();
    await authenticateApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
  });

  it("responds 401 on expired key", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: "k",
      familyId: "fam",
      expiresAt: new Date("2000-01-01"),
    } as never);
    const req = buildReq({ headers: { "x-api-key": "abc" } });
    const res = buildRes();
    const next = buildNext();
    await authenticateApiKey(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "API key expired" });
  });

  it("attaches familyId, bumps lastUsed and calls next on a valid key", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: "k",
      familyId: "fam-1",
      expiresAt: null,
    } as never);
    prismaMock.apiKey.update.mockResolvedValue({} as never);

    const rawKey = "raw-key-value";
    const req = buildReq({ headers: { "x-api-key": rawKey } });
    const res = buildRes();
    const next = buildNext();

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as { familyId: string }).familyId).toBe("fam-1");
    const lookup = prismaMock.apiKey.findUnique.mock.calls[0][0] as {
      where: { key: string };
    };
    expect(lookup.where.key).toBe(
      crypto.createHash("sha256").update(rawKey).digest("hex"),
    );
  });
});
