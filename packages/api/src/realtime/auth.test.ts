import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../../tests/helpers/prisma.js";

// authenticateSocket reads through the same prisma client + credential hashing
// as the HTTP auth chain, so we mock only the database module.
vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { authenticateSocket } = await import("./auth.js");
import type { SocketHandshakeLike } from "./auth.js";

function makeToken(id = "u-1") {
  return jwt.sign(
    { id, email: "a@b.com", name: "Alice" },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" },
  );
}

function handshake(
  overrides: Partial<SocketHandshakeLike> = {},
): SocketHandshakeLike {
  return { headers: {}, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticateSocket — JWT (app users)", () => {
  it("authenticates via the socket.io auth.token field", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-1",
      memberships: [{ familyId: "fam-1" }, { familyId: "fam-2" }],
    } as never);

    const result = await authenticateSocket(
      handshake({ auth: { token: makeToken() } }),
    );

    expect(result).toEqual({
      kind: "user",
      userId: "u-1",
      familyIds: ["fam-1", "fam-2"],
      tokenExp: expect.any(Number),
    });
  });

  it("exposes the JWT exp claim as tokenExp (epoch ms) for expiry-driven disconnect", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-1",
      memberships: [{ familyId: "fam-1" }],
    } as never);

    const before = Date.now();
    const result = await authenticateSocket(
      handshake({ auth: { token: makeToken() } }),
    );

    // makeToken() signs with expiresIn: "1h" → exp ≈ now + 3600s.
    expect(result?.tokenExp).toBeTypeOf("number");
    const expMs = result!.tokenExp!;
    expect(expMs).toBeGreaterThan(before);
    expect(expMs).toBeLessThanOrEqual(before + 3600_000 + 5_000);
  });

  it("authenticates via the Authorization: Bearer header", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-1",
      memberships: [{ familyId: "fam-1" }],
    } as never);

    const result = await authenticateSocket(
      handshake({ headers: { authorization: `Bearer ${makeToken()}` } }),
    );

    expect(result?.kind).toBe("user");
    expect(result?.familyIds).toEqual(["fam-1"]);
  });

  it("authenticates via the token cookie", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u-1",
      memberships: [{ familyId: "fam-9" }],
    } as never);

    const result = await authenticateSocket(
      handshake({ headers: { cookie: `token=${makeToken()}; other=1` } }),
    );

    expect(result?.kind).toBe("user");
    expect(result?.familyIds).toEqual(["fam-9"]);
  });

  it("returns null when the token is invalid (and no other credential)", async () => {
    const result = await authenticateSocket(
      handshake({ auth: { token: "not-a-jwt" } }),
    );
    expect(result).toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("falls through to null when the user record is missing", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const result = await authenticateSocket(
      handshake({ auth: { token: makeToken("ghost") } }),
    );
    expect(result).toBeNull();
  });
});

describe("authenticateSocket — API key (Magic Mirror)", () => {
  it("authenticates via the socket.io auth.apiKey field and bumps lastUsed", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: "k-1",
      familyId: "fam-mm",
      expiresAt: null,
    } as never);
    prismaMock.apiKey.update.mockResolvedValue({} as never);

    const result = await authenticateSocket(
      handshake({ auth: { apiKey: "raw-key" } }),
    );

    expect(result).toEqual({ kind: "apiKey", familyIds: ["fam-mm"] });
    // API-key connections are not JWTs — no exp, so no expiry disconnect is scheduled.
    expect(result?.tokenExp).toBeUndefined();
    expect(prismaMock.apiKey.update).toHaveBeenCalledWith({
      where: { id: "k-1" },
      data: { lastUsed: expect.any(Date) },
    });
  });

  it("authenticates via the x-api-key header", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: "k-2",
      familyId: "fam-mm",
      expiresAt: null,
    } as never);
    prismaMock.apiKey.update.mockResolvedValue({} as never);

    const result = await authenticateSocket(
      handshake({ headers: { "x-api-key": "raw-key" } }),
    );

    expect(result?.kind).toBe("apiKey");
    expect(result?.familyIds).toEqual(["fam-mm"]);
  });

  it("returns null for an expired API key", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: "k-3",
      familyId: "fam-mm",
      expiresAt: new Date("2000-01-01"),
    } as never);

    const result = await authenticateSocket(
      handshake({ headers: { "x-api-key": "raw-key" } }),
    );

    expect(result).toBeNull();
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
  });

  it("returns null for an unknown API key", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null);

    const result = await authenticateSocket(
      handshake({ headers: { "x-api-key": "nope" } }),
    );

    expect(result).toBeNull();
  });
});

describe("authenticateSocket — unauthenticated", () => {
  it("returns null when neither a token nor an API key is present", async () => {
    const result = await authenticateSocket(handshake());
    expect(result).toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
  });
});
