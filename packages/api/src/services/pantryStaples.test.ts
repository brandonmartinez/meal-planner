import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  PantryStapleError,
  listPantryStaples,
  createPantryStaple,
  deletePantryStaple,
  getPantryStapleNameSet,
} = await import("./pantryStaples.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pantryStaples service", () => {
  describe("listPantryStaples", () => {
    it("scopes the query to the family and orders by name", async () => {
      prismaMock.pantryStaple.findMany.mockResolvedValue([] as never);
      await listPantryStaples("fam-1");
      expect(prismaMock.pantryStaple.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: "fam-1" },
          orderBy: { name: "asc" },
        }),
      );
    });
  });

  describe("createPantryStaple", () => {
    it("upserts using the normalized name as the family-scoped key", async () => {
      prismaMock.pantryStaple.upsert.mockResolvedValue({
        id: "s1",
        name: "Salt",
        nameNormalized: "salt",
        familyId: "fam-1",
      } as never);

      await createPantryStaple("fam-1", "  Salt  ");

      expect(prismaMock.pantryStaple.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            familyId_nameNormalized: { familyId: "fam-1", nameNormalized: "salt" },
          },
          create: { name: "Salt", nameNormalized: "salt", familyId: "fam-1" },
          update: {},
        }),
      );
    });

    it("normalizes case and whitespace to the same key (idempotent)", async () => {
      prismaMock.pantryStaple.upsert.mockResolvedValue({} as never);

      await createPantryStaple("fam-1", "Olive Oil");
      await createPantryStaple("fam-1", "  olive   OIL ");

      const [firstCall, secondCall] =
        prismaMock.pantryStaple.upsert.mock.calls;
      expect(
        (firstCall[0] as { where: { familyId_nameNormalized: { nameNormalized: string } } })
          .where.familyId_nameNormalized.nameNormalized,
      ).toBe(
        (secondCall[0] as { where: { familyId_nameNormalized: { nameNormalized: string } } })
          .where.familyId_nameNormalized.nameNormalized,
      );
    });

    it("rejects an empty/blank name with a 400", async () => {
      await expect(createPantryStaple("fam-1", "   ")).rejects.toMatchObject({
        status: 400,
      });
      expect(prismaMock.pantryStaple.upsert).not.toHaveBeenCalled();
    });
  });

  describe("deletePantryStaple", () => {
    it("deletes scoped to both id and family", async () => {
      prismaMock.pantryStaple.deleteMany.mockResolvedValue({ count: 1 } as never);
      await deletePantryStaple("fam-1", "s1");
      expect(prismaMock.pantryStaple.deleteMany).toHaveBeenCalledWith({
        where: { id: "s1", familyId: "fam-1" },
      });
    });

    it("throws a 404 when nothing was deleted (cross-family or missing)", async () => {
      prismaMock.pantryStaple.deleteMany.mockResolvedValue({ count: 0 } as never);
      await expect(deletePantryStaple("fam-1", "nope")).rejects.toBeInstanceOf(
        PantryStapleError,
      );
      await expect(
        deletePantryStaple("fam-1", "nope"),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("getPantryStapleNameSet", () => {
    it("returns a Set of normalized names for O(1) matching", async () => {
      prismaMock.pantryStaple.findMany.mockResolvedValue([
        { nameNormalized: "salt" },
        { nameNormalized: "olive oil" },
      ] as never);

      const set = await getPantryStapleNameSet("fam-1");

      expect(set.has("salt")).toBe(true);
      expect(set.has("olive oil")).toBe(true);
      expect(set.has("chicken")).toBe(false);
      expect(prismaMock.pantryStaple.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: "fam-1" } }),
      );
    });
  });
});
