import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { normalizeName, syncMealTaxonomy, listTags, createTag, deleteTag } =
  await import("./taxonomy.js");

describe("taxonomy service", () => {
  describe("normalizeName", () => {
    it("lowercases and trims", () => {
      expect(normalizeName("  Quick Meals  ")).toBe("quick meals");
    });

    it("collapses case-only differences to the same key", () => {
      expect(normalizeName("Vegetarian")).toBe(normalizeName("VEGETARIAN"));
    });
  });

  describe("syncMealTaxonomy", () => {
    it("leaves tags untouched when tags is undefined (no delete/upsert)", async () => {
      await syncMealTaxonomy(prismaMock, "fam-1", "m-1", undefined);
      expect(prismaMock.mealTag.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.tag.upsert).not.toHaveBeenCalled();
    });

    it("clears all tags when passed an empty array (delete, no create)", async () => {
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 1 } as never);
      await syncMealTaxonomy(prismaMock, "fam-1", "m-1", []);
      expect(prismaMock.mealTag.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      expect(prismaMock.mealTag.createMany).not.toHaveBeenCalled();
      expect(prismaMock.tag.upsert).not.toHaveBeenCalled();
    });

    it("resolves tag names to ids and replace-sets the meal joins", async () => {
      prismaMock.tag.upsert
        .mockResolvedValueOnce({ id: "t-1" } as never)
        .mockResolvedValueOnce({ id: "t-2" } as never);
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.mealTag.createMany.mockResolvedValue({ count: 2 } as never);

      await syncMealTaxonomy(prismaMock, "fam-1", "m-1", ["Quick", "Vegetarian"]);

      // Upsert is keyed by (familyId, nameNormalized) so names can never
      // resolve across families.
      const firstUpsert = prismaMock.tag.upsert.mock.calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
        create: { name: string; nameNormalized: string; familyId: string };
      };
      expect(firstUpsert.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "quick",
      });
      expect(firstUpsert.create).toEqual({
        name: "Quick",
        nameNormalized: "quick",
        familyId: "fam-1",
      });
      // Old joins cleared, new joins created from resolved ids.
      expect(prismaMock.mealTag.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      const createArg = prismaMock.mealTag.createMany.mock.calls[0][0] as {
        data: { mealId: string; tagId: string }[];
      };
      expect(createArg.data).toEqual([
        { mealId: "m-1", tagId: "t-1" },
        { mealId: "m-1", tagId: "t-2" },
      ]);
    });

    it("dedupes case-insensitive duplicate names to a single upsert (first casing wins)", async () => {
      prismaMock.tag.upsert.mockResolvedValue({ id: "t-1" } as never);
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.mealTag.createMany.mockResolvedValue({ count: 1 } as never);

      await syncMealTaxonomy(prismaMock, "fam-1", "m-1", ["Quick", "quick", "QUICK"]);

      // Only one upsert despite three case variants.
      expect(prismaMock.tag.upsert).toHaveBeenCalledTimes(1);
      const arg = prismaMock.tag.upsert.mock.calls[0][0] as {
        create: { name: string; nameNormalized: string };
      };
      // First-seen casing is preserved for display.
      expect(arg.create.name).toBe("Quick");
      expect(arg.create.nameNormalized).toBe("quick");
    });

    it("drops blank/whitespace-only names before upserting", async () => {
      prismaMock.tag.upsert.mockResolvedValue({ id: "t-1" } as never);
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 0 } as never);
      prismaMock.mealTag.createMany.mockResolvedValue({ count: 1 } as never);

      await syncMealTaxonomy(prismaMock, "fam-1", "m-1", ["  ", "", "Real"]);

      expect(prismaMock.tag.upsert).toHaveBeenCalledTimes(1);
      const arg = prismaMock.tag.upsert.mock.calls[0][0] as {
        create: { name: string };
      };
      expect(arg.create.name).toBe("Real");
    });

    it("does not create join rows when all resolved names are blank (empty after dedupe)", async () => {
      prismaMock.mealTag.deleteMany.mockResolvedValue({ count: 0 } as never);
      await syncMealTaxonomy(prismaMock, "fam-1", "m-1", ["  "]);
      // deleteMany still runs (replace-set), but nothing to create.
      expect(prismaMock.mealTag.deleteMany).toHaveBeenCalled();
      expect(prismaMock.mealTag.createMany).not.toHaveBeenCalled();
    });
  });

  describe("listTags", () => {
    it("lists tags scoped to the family, sorted by display name", async () => {
      prismaMock.tag.findMany.mockResolvedValue([] as never);
      await listTags("fam-1");
      expect(prismaMock.tag.findMany).toHaveBeenCalledWith({
        where: { familyId: "fam-1" },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("createTag", () => {
    it("upserts a tag within the family (idempotent by normalized name)", async () => {
      prismaMock.tag.upsert.mockResolvedValue({ id: "t-1" } as never);
      await createTag("fam-1", "  Quick  ");
      const arg = prismaMock.tag.upsert.mock.calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
        create: { name: string; nameNormalized: string; familyId: string };
      };
      expect(arg.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "quick",
      });
      // Display name is trimmed but keeps original casing.
      expect(arg.create).toEqual({
        name: "Quick",
        nameNormalized: "quick",
        familyId: "fam-1",
      });
    });

    it("throws on an empty tag name", async () => {
      await expect(createTag("fam-1", "   ")).rejects.toThrow(
        /Tag name cannot be empty/,
      );
      expect(prismaMock.tag.upsert).not.toHaveBeenCalled();
    });
  });

  describe("deleteTag (cross-family isolation)", () => {
    it("deletes a tag scoped to the family", async () => {
      prismaMock.tag.deleteMany.mockResolvedValue({ count: 1 } as never);
      await deleteTag("fam-1", "t-1");
      expect(prismaMock.tag.deleteMany).toHaveBeenCalledWith({
        where: { id: "t-1", familyId: "fam-1" },
      });
    });

    it("throws when the tag does not belong to the family (count 0)", async () => {
      prismaMock.tag.deleteMany.mockResolvedValue({ count: 0 } as never);
      // Family B trying to delete Family A's tag id resolves to 0 rows.
      await expect(deleteTag("fam-B", "t-owned-by-A")).rejects.toThrow(
        /Tag not found/,
      );
    });
  });
});
