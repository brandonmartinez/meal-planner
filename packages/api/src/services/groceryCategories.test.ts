import { describe, it, expect, vi } from "vitest";
import { INGREDIENT_CATEGORIES } from "@meal-planner/shared";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  listGroceryCategories,
  listEffectiveGroceryCategories,
  createGroceryCategory,
  renameGroceryCategory,
  deleteGroceryCategory,
} = await import("./groceryCategories.js");

describe("groceryCategories service (#119)", () => {
  describe("listGroceryCategories", () => {
    it("lists custom categories scoped to the family, sorted by display name", async () => {
      prismaMock.groceryCategory.findMany.mockResolvedValue([] as never);
      await listGroceryCategories("fam-1");
      expect(prismaMock.groceryCategory.findMany).toHaveBeenCalledWith({
        where: { familyId: "fam-1" },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("listEffectiveGroceryCategories", () => {
    it("returns the shared defaults first, in canonical order, when no custom rows exist", async () => {
      prismaMock.groceryCategory.findMany.mockResolvedValue([] as never);
      const effective = await listEffectiveGroceryCategories("fam-1");
      expect(effective).toEqual([...INGREDIENT_CATEGORIES]);
    });

    it("appends custom names after the defaults", async () => {
      prismaMock.groceryCategory.findMany.mockResolvedValue([
        { name: "Bulk Bins" },
        { name: "International" },
      ] as never);
      const effective = await listEffectiveGroceryCategories("fam-1");
      expect(effective).toEqual([
        ...INGREDIENT_CATEGORIES,
        "Bulk Bins",
        "International",
      ]);
    });

    it("dedupes a custom row that collides case-insensitively with a default (default casing wins)", async () => {
      // A family "adds" a category whose normalized name matches an existing
      // default — the default is kept, the custom duplicate is dropped.
      const firstDefault = INGREDIENT_CATEGORIES[0];
      prismaMock.groceryCategory.findMany.mockResolvedValue([
        { name: firstDefault.toUpperCase() },
        { name: "Bulk Bins" },
      ] as never);
      const effective = await listEffectiveGroceryCategories("fam-1");
      // No duplicate of the default; only the genuinely-new custom is appended.
      expect(effective).toEqual([...INGREDIENT_CATEGORIES, "Bulk Bins"]);
      expect(
        effective.filter((c) => c.toLowerCase() === firstDefault.toLowerCase()),
      ).toEqual([firstDefault]);
    });

    it("dedupes case-insensitive duplicates among custom rows (first-seen casing wins)", async () => {
      prismaMock.groceryCategory.findMany.mockResolvedValue([
        { name: "Bulk Bins" },
        { name: "BULK BINS" },
      ] as never);
      const effective = await listEffectiveGroceryCategories("fam-1");
      expect(effective).toEqual([...INGREDIENT_CATEGORIES, "Bulk Bins"]);
    });

    it("skips blank/whitespace-only custom names", async () => {
      prismaMock.groceryCategory.findMany.mockResolvedValue([
        { name: "   " },
        { name: "Bulk Bins" },
      ] as never);
      const effective = await listEffectiveGroceryCategories("fam-1");
      expect(effective).toEqual([...INGREDIENT_CATEGORIES, "Bulk Bins"]);
    });
  });

  describe("createGroceryCategory", () => {
    it("upserts a category within the family (idempotent by normalized name)", async () => {
      prismaMock.groceryCategory.upsert.mockResolvedValue({
        id: "gc-1",
      } as never);
      await createGroceryCategory("fam-1", "  Bulk Bins  ");
      const arg = prismaMock.groceryCategory.upsert.mock.calls[0][0] as {
        where: { familyId_nameNormalized: unknown };
        create: { name: string; nameNormalized: string; familyId: string };
        update: Record<string, unknown>;
      };
      expect(arg.where.familyId_nameNormalized).toEqual({
        familyId: "fam-1",
        nameNormalized: "bulk bins",
      });
      // Display name is trimmed but keeps its original casing; update is a no-op
      // so a collision returns the existing row unchanged.
      expect(arg.create).toEqual({
        name: "Bulk Bins",
        nameNormalized: "bulk bins",
        familyId: "fam-1",
      });
      expect(arg.update).toEqual({});
    });

    it("throws on an empty category name", async () => {
      await expect(createGroceryCategory("fam-1", "   ")).rejects.toThrow(
        /Grocery category name cannot be empty/,
      );
      expect(prismaMock.groceryCategory.upsert).not.toHaveBeenCalled();
    });
  });

  describe("renameGroceryCategory", () => {
    it("renames a category scoped to the family and returns the updated row", async () => {
      prismaMock.groceryCategory.updateMany.mockResolvedValue({
        count: 1,
      } as never);
      prismaMock.groceryCategory.findFirst.mockResolvedValue({
        id: "gc-1",
        name: "Bulk Bins",
      } as never);

      const row = await renameGroceryCategory("fam-1", "gc-1", "  Bulk Bins  ");

      expect(prismaMock.groceryCategory.updateMany).toHaveBeenCalledWith({
        where: { id: "gc-1", familyId: "fam-1" },
        data: { name: "Bulk Bins", nameNormalized: "bulk bins" },
      });
      expect(prismaMock.groceryCategory.findFirst).toHaveBeenCalledWith({
        where: { id: "gc-1", familyId: "fam-1" },
      });
      expect(row).toEqual({ id: "gc-1", name: "Bulk Bins" });
    });

    it("throws on an empty new name (before touching the database)", async () => {
      await expect(
        renameGroceryCategory("fam-1", "gc-1", "   "),
      ).rejects.toThrow(/Grocery category name cannot be empty/);
      expect(prismaMock.groceryCategory.updateMany).not.toHaveBeenCalled();
    });

    it("throws when the category does not belong to the family (count 0)", async () => {
      prismaMock.groceryCategory.updateMany.mockResolvedValue({
        count: 0,
      } as never);
      // Family B trying to rename Family A's category id resolves to 0 rows.
      await expect(
        renameGroceryCategory("fam-B", "gc-owned-by-A", "Bulk Bins"),
      ).rejects.toThrow(/Grocery category not found/);
      expect(prismaMock.groceryCategory.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("deleteGroceryCategory", () => {
    it("deletes a category scoped to the family", async () => {
      prismaMock.groceryCategory.deleteMany.mockResolvedValue({
        count: 1,
      } as never);
      await deleteGroceryCategory("fam-1", "gc-1");
      expect(prismaMock.groceryCategory.deleteMany).toHaveBeenCalledWith({
        where: { id: "gc-1", familyId: "fam-1" },
      });
    });

    it("throws when the category does not belong to the family (count 0)", async () => {
      prismaMock.groceryCategory.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      await expect(
        deleteGroceryCategory("fam-B", "gc-owned-by-A"),
      ).rejects.toThrow(/Grocery category not found/);
    });
  });
});
