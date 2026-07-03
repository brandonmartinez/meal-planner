import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  normalizeName,
  syncMealCollections,
  listCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  setCollectionMeals,
} = await import("./recipeCollections.js");

describe("recipeCollections service", () => {
  describe("normalizeName", () => {
    it("lowercases and trims", () => {
      expect(normalizeName("  Weeknight Dinners  ")).toBe("weeknight dinners");
    });

    it("collapses case-only differences to the same key", () => {
      expect(normalizeName("Holiday Baking")).toBe(
        normalizeName("HOLIDAY BAKING"),
      );
    });
  });

  describe("syncMealCollections", () => {
    it("leaves memberships untouched when collections is undefined", async () => {
      await syncMealCollections(prismaMock, "fam-1", "m-1", undefined);
      expect(prismaMock.mealRecipeCollection.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.recipeCollection.upsert).not.toHaveBeenCalled();
    });

    it("clears all memberships when passed an empty array (delete, no create)", async () => {
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 1,
      } as never);
      await syncMealCollections(prismaMock, "fam-1", "m-1", []);
      expect(prismaMock.mealRecipeCollection.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      expect(prismaMock.mealRecipeCollection.createMany).not.toHaveBeenCalled();
      expect(prismaMock.recipeCollection.upsert).not.toHaveBeenCalled();
    });

    it("resolves collection names to ids and replace-sets the meal joins", async () => {
      prismaMock.recipeCollection.upsert
        .mockResolvedValueOnce({ id: "col-1" } as never)
        .mockResolvedValueOnce({ id: "col-2" } as never);
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.mealRecipeCollection.createMany.mockResolvedValue({
        count: 2,
      } as never);

      await syncMealCollections(prismaMock, "fam-1", "m-1", [
        "Weeknight",
        "Holiday",
      ]);

      // Upsert is keyed by (familyId, nameNormalized) so names can never
      // resolve across families.
      const firstUpsert = prismaMock.recipeCollection.upsert.mock
        .calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
        create: { name: string; nameNormalized: string; familyId: string };
      };
      expect(firstUpsert.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "weeknight",
      });
      expect(firstUpsert.create).toEqual({
        name: "Weeknight",
        nameNormalized: "weeknight",
        familyId: "fam-1",
      });
      // Old joins cleared, new joins created from resolved ids.
      expect(prismaMock.mealRecipeCollection.deleteMany).toHaveBeenCalledWith({
        where: { mealId: "m-1" },
      });
      const createArg = prismaMock.mealRecipeCollection.createMany.mock
        .calls[0][0] as {
        data: { mealId: string; recipeCollectionId: string }[];
      };
      expect(createArg.data).toEqual([
        { mealId: "m-1", recipeCollectionId: "col-1" },
        { mealId: "m-1", recipeCollectionId: "col-2" },
      ]);
    });

    it("dedupes case-insensitive duplicate names to a single upsert (first casing wins)", async () => {
      prismaMock.recipeCollection.upsert.mockResolvedValue({
        id: "col-1",
      } as never);
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.mealRecipeCollection.createMany.mockResolvedValue({
        count: 1,
      } as never);

      await syncMealCollections(prismaMock, "fam-1", "m-1", [
        "Weeknight",
        "weeknight",
        "WEEKNIGHT",
      ]);

      expect(prismaMock.recipeCollection.upsert).toHaveBeenCalledTimes(1);
      const arg = prismaMock.recipeCollection.upsert.mock.calls[0][0] as {
        create: { name: string; nameNormalized: string };
      };
      expect(arg.create.name).toBe("Weeknight");
      expect(arg.create.nameNormalized).toBe("weeknight");
    });

    it("drops blank/whitespace-only names before upserting", async () => {
      prismaMock.recipeCollection.upsert.mockResolvedValue({
        id: "col-1",
      } as never);
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.mealRecipeCollection.createMany.mockResolvedValue({
        count: 1,
      } as never);

      await syncMealCollections(prismaMock, "fam-1", "m-1", ["  ", "", "Real"]);

      expect(prismaMock.recipeCollection.upsert).toHaveBeenCalledTimes(1);
      const arg = prismaMock.recipeCollection.upsert.mock.calls[0][0] as {
        create: { name: string };
      };
      expect(arg.create.name).toBe("Real");
    });

    it("does not create join rows when all names are blank (empty after dedupe)", async () => {
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      await syncMealCollections(prismaMock, "fam-1", "m-1", ["  "]);
      // deleteMany still runs (replace-set), but nothing to create.
      expect(prismaMock.mealRecipeCollection.deleteMany).toHaveBeenCalled();
      expect(prismaMock.mealRecipeCollection.createMany).not.toHaveBeenCalled();
    });
  });

  describe("listCollections", () => {
    it("lists collections scoped to the family, sorted by display name", async () => {
      prismaMock.recipeCollection.findMany.mockResolvedValue([] as never);
      await listCollections("fam-1");
      expect(prismaMock.recipeCollection.findMany).toHaveBeenCalledWith({
        where: { familyId: "fam-1" },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("getCollection (cross-family isolation)", () => {
    it("scopes the lookup to the family (id AND familyId)", async () => {
      prismaMock.recipeCollection.findFirst.mockResolvedValue(null as never);
      await getCollection("fam-1", "col-1");
      expect(prismaMock.recipeCollection.findFirst).toHaveBeenCalledWith({
        where: { id: "col-1", familyId: "fam-1" },
      });
    });

    it("returns null when the collection belongs to another family", async () => {
      // Family B requesting Family A's collection id resolves to null (→404).
      prismaMock.recipeCollection.findFirst.mockResolvedValue(null as never);
      const result = await getCollection("fam-B", "col-owned-by-A");
      expect(result).toBeNull();
    });
  });

  describe("createCollection", () => {
    it("upserts a collection within the family (idempotent by normalized name)", async () => {
      prismaMock.recipeCollection.upsert.mockResolvedValue({
        id: "col-1",
      } as never);
      await createCollection("fam-1", "  Weeknight  ");
      const arg = prismaMock.recipeCollection.upsert.mock.calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
        create: {
          name: string;
          nameNormalized: string;
          description: string | null;
          familyId: string;
        };
      };
      expect(arg.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "weeknight",
      });
      // Display name is trimmed but keeps original casing.
      expect(arg.create).toEqual({
        name: "Weeknight",
        nameNormalized: "weeknight",
        description: null,
        familyId: "fam-1",
      });
    });

    it("stores a supplied description and updates it on collision", async () => {
      prismaMock.recipeCollection.upsert.mockResolvedValue({
        id: "col-1",
      } as never);
      await createCollection("fam-1", "Weeknight", "Fast midweek meals");
      const arg = prismaMock.recipeCollection.upsert.mock.calls[0][0] as {
        create: { description: string | null };
        update: { description?: string | null };
      };
      expect(arg.create.description).toBe("Fast midweek meals");
      expect(arg.update).toEqual({ description: "Fast midweek meals" });
    });

    it("throws on an empty name", async () => {
      await expect(createCollection("fam-1", "   ")).rejects.toThrow(
        /Collection name cannot be empty/,
      );
      expect(prismaMock.recipeCollection.upsert).not.toHaveBeenCalled();
    });
  });

  describe("updateCollection (cross-family isolation)", () => {
    it("renames and recomputes nameNormalized when scoped to the family", async () => {
      prismaMock.recipeCollection.findFirst.mockResolvedValue({
        id: "col-1",
        familyId: "fam-1",
      } as never);
      prismaMock.recipeCollection.update.mockResolvedValue({
        id: "col-1",
      } as never);
      await updateCollection("fam-1", "col-1", { name: "  Holiday Baking  " });
      const arg = prismaMock.recipeCollection.update.mock.calls[0][0] as {
        data: { name: string; nameNormalized: string };
      };
      expect(arg.data.name).toBe("Holiday Baking");
      expect(arg.data.nameNormalized).toBe("holiday baking");
    });

    it("throws when the collection belongs to another family (no update)", async () => {
      prismaMock.recipeCollection.findFirst.mockResolvedValue(null as never);
      await expect(
        updateCollection("fam-B", "col-owned-by-A", { name: "Hijack" }),
      ).rejects.toThrow(/Collection not found/);
      expect(prismaMock.recipeCollection.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteCollection (cross-family isolation)", () => {
    it("deletes a collection scoped to the family", async () => {
      prismaMock.recipeCollection.deleteMany.mockResolvedValue({
        count: 1,
      } as never);
      await deleteCollection("fam-1", "col-1");
      expect(prismaMock.recipeCollection.deleteMany).toHaveBeenCalledWith({
        where: { id: "col-1", familyId: "fam-1" },
      });
    });

    it("throws when the collection does not belong to the family (count 0)", async () => {
      prismaMock.recipeCollection.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      // Family B trying to delete Family A's collection id resolves to 0 rows.
      await expect(
        deleteCollection("fam-B", "col-owned-by-A"),
      ).rejects.toThrow(/Collection not found/);
    });
  });

  describe("setCollectionMeals", () => {
    it("replace-sets meal membership within the family", async () => {
      prismaMock.recipeCollection.findFirst.mockResolvedValue({
        id: "col-1",
      } as never);
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "meal-1" },
        { id: "meal-2" },
      ] as never);
      prismaMock.$transaction.mockImplementation(
        async (fn: (tx: typeof prismaMock) => Promise<void>) =>
          fn(prismaMock),
      );
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 2,
      } as never);
      prismaMock.mealRecipeCollection.createMany.mockResolvedValue({
        count: 2,
      } as never);

      await setCollectionMeals("fam-1", "col-1", ["meal-1", "meal-2"]);

      expect(prismaMock.mealRecipeCollection.deleteMany).toHaveBeenCalledWith({
        where: { recipeCollectionId: "col-1" },
      });
      expect(prismaMock.mealRecipeCollection.createMany).toHaveBeenCalledWith({
        data: [
          { mealId: "meal-1", recipeCollectionId: "col-1" },
          { mealId: "meal-2", recipeCollectionId: "col-1" },
        ],
        skipDuplicates: true,
      });
    });

    it("clears all meal membership when passed an empty array", async () => {
      prismaMock.recipeCollection.findFirst.mockResolvedValue({
        id: "col-1",
      } as never);
      prismaMock.$transaction.mockImplementation(
        async (fn: (tx: typeof prismaMock) => Promise<void>) =>
          fn(prismaMock),
      );
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 3,
      } as never);

      await setCollectionMeals("fam-1", "col-1", []);

      expect(prismaMock.mealRecipeCollection.deleteMany).toHaveBeenCalledWith({
        where: { recipeCollectionId: "col-1" },
      });
      expect(prismaMock.mealRecipeCollection.createMany).not.toHaveBeenCalled();
    });

    it("throws when the collection does not belong to the family", async () => {
      prismaMock.recipeCollection.findFirst.mockResolvedValue(null as never);

      await expect(
        setCollectionMeals("fam-B", "col-owned-by-A", ["meal-1"]),
      ).rejects.toThrow(/Collection not found/);

      expect(prismaMock.mealRecipeCollection.deleteMany).not.toHaveBeenCalled();
    });

    it("throws when any mealId does not belong to the family", async () => {
      prismaMock.recipeCollection.findFirst.mockResolvedValue({
        id: "col-1",
      } as never);
      // Only 1 meal returned — the second id is cross-family
      prismaMock.meal.findMany.mockResolvedValue([{ id: "meal-1" }] as never);

      await expect(
        setCollectionMeals("fam-1", "col-1", ["meal-1", "meal-foreign"]),
      ).rejects.toThrow(/do not belong to this family/);

      expect(prismaMock.mealRecipeCollection.deleteMany).not.toHaveBeenCalled();
    });

    it("deduplicates mealIds before inserting", async () => {
      prismaMock.recipeCollection.findFirst.mockResolvedValue({
        id: "col-1",
      } as never);
      prismaMock.meal.findMany.mockResolvedValue([{ id: "meal-1" }] as never);
      prismaMock.$transaction.mockImplementation(
        async (fn: (tx: typeof prismaMock) => Promise<void>) =>
          fn(prismaMock),
      );
      prismaMock.mealRecipeCollection.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      prismaMock.mealRecipeCollection.createMany.mockResolvedValue({
        count: 1,
      } as never);

      // Pass the same id twice — should be deduped to one
      await setCollectionMeals("fam-1", "col-1", ["meal-1", "meal-1"]);

      expect(prismaMock.meal.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["meal-1"] }, familyId: "fam-1" },
        select: { id: true },
      });
      expect(prismaMock.mealRecipeCollection.createMany).toHaveBeenCalledWith({
        data: [{ mealId: "meal-1", recipeCollectionId: "col-1" }],
        skipDuplicates: true,
      });
    });
  });
});
