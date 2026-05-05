import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { createApiKey, listApiKeys, revokeApiKey, validateApiKey } =
  await import("./apiKey.js");

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

describe("apiKey service", () => {
  describe("createApiKey", () => {
    it("returns the raw key once and stores only the hash", async () => {
      const stored: { key?: string; name?: string; familyId?: string } = {};
      prismaMock.apiKey.create.mockImplementation(async (args: unknown) => {
        const a = args as {
          data: { key: string; name: string; familyId: string };
        };
        stored.key = a.data.key;
        stored.name = a.data.name;
        stored.familyId = a.data.familyId;
        return {
          id: "key-1",
          name: a.data.name,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        } as never;
      });

      const result = await createApiKey("fam-1", "user-1", "CI Bot");

      expect(result.key).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.key).toBe(sha256(result.key));
      expect(stored.key).not.toBe(result.key);
      expect(result.name).toBe("CI Bot");
    });
  });

  describe("listApiKeys", () => {
    it("orders by createdAt desc and excludes the hashed key", async () => {
      prismaMock.apiKey.findMany.mockResolvedValue([] as never);
      await listApiKeys("fam-1");
      const arg = prismaMock.apiKey.findMany.mock.calls[0][0] as {
        select: Record<string, boolean>;
        orderBy: { createdAt: string };
        where: { familyId: string };
      };
      expect(arg.where).toEqual({ familyId: "fam-1" });
      expect(arg.orderBy).toEqual({ createdAt: "desc" });
      expect(arg.select.key).toBeUndefined();
    });
  });

  describe("revokeApiKey", () => {
    it("scopes delete by familyId", async () => {
      prismaMock.apiKey.delete.mockResolvedValue({} as never);
      await revokeApiKey("k-1", "fam-1");
      expect(prismaMock.apiKey.delete).toHaveBeenCalledWith({
        where: { id: "k-1", familyId: "fam-1" },
      });
    });
  });

  describe("validateApiKey", () => {
    it("returns null on unknown key", async () => {
      prismaMock.apiKey.findUnique.mockResolvedValue(null);
      const out = await validateApiKey("does-not-exist");
      expect(out).toBeNull();
    });

    it("returns null on expired key", async () => {
      prismaMock.apiKey.findUnique.mockResolvedValue({
        id: "k-1",
        familyId: "fam-1",
        expiresAt: new Date("2000-01-01"),
      } as never);
      const out = await validateApiKey("rawkey");
      expect(out).toBeNull();
      expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
    });

    it("returns familyId and bumps lastUsed on a valid key", async () => {
      prismaMock.apiKey.findUnique.mockResolvedValue({
        id: "k-1",
        familyId: "fam-1",
        expiresAt: null,
      } as never);
      prismaMock.apiKey.update.mockResolvedValue({} as never);

      const out = await validateApiKey("rawkey");

      expect(out).toEqual({ familyId: "fam-1" });
      const lookup = prismaMock.apiKey.findUnique.mock.calls[0][0] as {
        where: { key: string };
      };
      expect(lookup.where.key).toBe(sha256("rawkey"));
      expect(prismaMock.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "k-1" },
          data: { lastUsed: expect.any(Date) },
        }),
      );
    });
  });
});
