import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const {
  normalizeName,
  TemplateError,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
} = await import("./planningTemplates.js");

// Emulate prisma.$transaction(fn) by invoking fn with prismaMock as tx.
function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cb: any) => Promise.resolve(cb(prismaMock)),
  );
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "6.0.0",
  });
}

describe("planningTemplates service", () => {
  describe("normalizeName", () => {
    it("lowercases and trims", () => {
      expect(normalizeName("  Weeknight Faves  ")).toBe("weeknight faves");
    });

    it("collapses case-only differences to the same key", () => {
      expect(normalizeName("Taco Tuesday")).toBe(normalizeName("TACO TUESDAY"));
    });
  });

  describe("listTemplates", () => {
    it("scopes the query to the family and orders by name", async () => {
      prismaMock.planningTemplate.findMany.mockResolvedValue([] as never);
      await listTemplates("fam-1");
      expect(prismaMock.planningTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: "fam-1" },
          orderBy: { name: "asc" },
        }),
      );
    });
  });

  describe("getTemplate", () => {
    it("reads scoped to (id, familyId) so cross-family is indistinguishable from missing", async () => {
      prismaMock.planningTemplate.findFirst.mockResolvedValue(null as never);
      const result = await getTemplate("fam-1", "tmpl-x");
      expect(result).toBeNull();
      expect(prismaMock.planningTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tmpl-x", familyId: "fam-1" },
        }),
      );
    });
  });

  describe("createTemplate", () => {
    it("normalizes the name, validates meals, dedupes entries, and nests them", async () => {
      stubTransaction();
      prismaMock.meal.findMany.mockResolvedValue([
        { id: "m-1" },
        { id: "m-2" },
      ] as never);
      prismaMock.planningTemplate.create.mockResolvedValue({
        id: "tmpl-1",
      } as never);

      await createTemplate("fam-1", {
        name: "  Weeknight Faves  ",
        description: "Go-to dinners",
        entries: [
          { dayOfWeek: 0, mealId: "m-1" },
          { dayOfWeek: 0, mealId: "m-1" }, // exact duplicate → deduped
          { dayOfWeek: 1, mealId: "m-2" },
        ],
      });

      // meals validated against the family
      expect(prismaMock.meal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["m-1", "m-2"] }, familyId: "fam-1" },
        }),
      );

      const createArg = prismaMock.planningTemplate.create.mock.calls[0][0];
      expect(createArg.data.name).toBe("Weeknight Faves");
      expect(createArg.data.nameNormalized).toBe("weeknight faves");
      expect(createArg.data.familyId).toBe("fam-1");
      // duplicate removed → only 2 nested entries
      expect(createArg.data.entries.create).toEqual([
        { dayOfWeek: 0, mealId: "m-1" },
        { dayOfWeek: 1, mealId: "m-2" },
      ]);
    });

    it("rejects an empty name with 400", async () => {
      await expect(
        createTemplate("fam-1", { name: "   ", entries: [] }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("rejects an out-of-range dayOfWeek with 400", async () => {
      await expect(
        createTemplate("fam-1", {
          name: "Bad",
          entries: [{ dayOfWeek: 7, mealId: "m-1" }],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("maps a cross-family / missing meal to 404", async () => {
      stubTransaction();
      // only 1 of 2 requested meals found in the family
      prismaMock.meal.findMany.mockResolvedValue([{ id: "m-1" }] as never);
      await expect(
        createTemplate("fam-1", {
          name: "Mixed",
          entries: [
            { dayOfWeek: 0, mealId: "m-1" },
            { dayOfWeek: 1, mealId: "m-other-family" },
          ],
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(prismaMock.planningTemplate.create).not.toHaveBeenCalled();
    });

    it("maps a unique-name collision (P2002) to 409", async () => {
      stubTransaction();
      prismaMock.meal.findMany.mockResolvedValue([] as never);
      prismaMock.planningTemplate.create.mockRejectedValue(p2002() as never);
      await expect(
        createTemplate("fam-1", { name: "Dupe", entries: [] }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe("updateTemplate", () => {
    it("throws 404 when the template is missing or cross-family", async () => {
      stubTransaction();
      prismaMock.planningTemplate.findFirst.mockResolvedValue(null as never);
      await expect(
        updateTemplate("fam-1", "tmpl-x", { name: "New" }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("replaces all entries when entries are provided (delete-all + recreate)", async () => {
      stubTransaction();
      prismaMock.planningTemplate.findFirst.mockResolvedValue({
        id: "tmpl-1",
      } as never);
      prismaMock.meal.findMany.mockResolvedValue([{ id: "m-9" }] as never);
      prismaMock.planningTemplateEntry.deleteMany.mockResolvedValue({
        count: 3,
      } as never);
      prismaMock.planningTemplateEntry.createMany.mockResolvedValue({
        count: 1,
      } as never);
      prismaMock.planningTemplate.update.mockResolvedValue({
        id: "tmpl-1",
      } as never);

      await updateTemplate("fam-1", "tmpl-1", {
        entries: [{ dayOfWeek: 2, mealId: "m-9" }],
      });

      expect(prismaMock.planningTemplateEntry.deleteMany).toHaveBeenCalledWith({
        where: { templateId: "tmpl-1" },
      });
      expect(prismaMock.planningTemplateEntry.createMany).toHaveBeenCalledWith({
        data: [{ templateId: "tmpl-1", dayOfWeek: 2, mealId: "m-9" }],
      });
    });

    it("does not touch entries when entries is omitted", async () => {
      stubTransaction();
      prismaMock.planningTemplate.findFirst.mockResolvedValue({
        id: "tmpl-1",
      } as never);
      prismaMock.planningTemplate.update.mockResolvedValue({
        id: "tmpl-1",
      } as never);

      await updateTemplate("fam-1", "tmpl-1", { description: "just notes" });

      expect(
        prismaMock.planningTemplateEntry.deleteMany,
      ).not.toHaveBeenCalled();
      expect(
        prismaMock.planningTemplateEntry.createMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("deleteTemplate", () => {
    it("throws 404 when nothing was deleted (missing / cross-family)", async () => {
      prismaMock.planningTemplate.deleteMany.mockResolvedValue({
        count: 0,
      } as never);
      await expect(deleteTemplate("fam-1", "tmpl-x")).rejects.toMatchObject({
        status: 404,
      });
      expect(prismaMock.planningTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: "tmpl-x", familyId: "fam-1" },
      });
    });

    it("resolves when a row was deleted", async () => {
      prismaMock.planningTemplate.deleteMany.mockResolvedValue({
        count: 1,
      } as never);
      await expect(deleteTemplate("fam-1", "tmpl-1")).resolves.toBeUndefined();
    });
  });

  describe("applyTemplate", () => {
    const TARGET = "2026-05-11"; // Monday

    // Build a target week fixture (offset 0=Mon..6=Sun) matching weekPlanInclude.
    function buildWeek(
      id: string,
      mondayLabel: string,
      suggestionsByOffset: Record<number, { mealId: string }[]> = {},
    ) {
      const monday = new Date(`${mondayLabel}T00:00:00Z`);
      const days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(monday);
        date.setUTCDate(date.getUTCDate() + i);
        const suggestions = (suggestionsByOffset[i] ?? []).map((s, j) => ({
          id: `${id}-s-${i}-${j}`,
          mealId: s.mealId,
        }));
        return { id: `${id}-day-${i}`, date, suggestions };
      });
      return { id, weekStart: monday, days };
    }

    function routeTargetWeek(week: ReturnType<typeof buildWeek>) {
      // getOrCreateWeekPlan reads via weekPlan.findFirst (existing week).
      prismaMock.weekPlan.findFirst.mockResolvedValue(week as never);
    }

    function template(
      entries: { dayOfWeek: number; mealId: string }[],
    ): unknown {
      return { id: "tmpl-1", familyId: "fam-1", entries };
    }

    it("rejects a non-Monday target week with 400", async () => {
      await expect(
        applyTemplate({
          familyId: "fam-1",
          templateId: "tmpl-1",
          targetWeekStart: new Date("2026-05-12T00:00:00Z"), // Tuesday
          userId: "user-1",
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(prismaMock.mealSuggestion.createMany).not.toHaveBeenCalled();
    });

    it("throws 404 for a missing / cross-family template", async () => {
      prismaMock.planningTemplate.findFirst.mockResolvedValue(null as never);
      await expect(
        applyTemplate({
          familyId: "fam-1",
          templateId: "tmpl-x",
          targetWeekStart: new Date(`${TARGET}T00:00:00Z`),
          userId: "user-1",
        }),
      ).rejects.toMatchObject({ status: 404 });
      // scoped read proves cross-family isolation
      expect(prismaMock.planningTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tmpl-x", familyId: "fam-1" },
        }),
      );
    });

    it("throws 422 for an empty template", async () => {
      prismaMock.planningTemplate.findFirst.mockResolvedValue(
        template([]) as never,
      );
      await expect(
        applyTemplate({
          familyId: "fam-1",
          templateId: "tmpl-1",
          targetWeekStart: new Date(`${TARGET}T00:00:00Z`),
          userId: "user-1",
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("creates UNAPPROVED suggestions mapped by day offset", async () => {
      stubTransaction();
      prismaMock.planningTemplate.findFirst.mockResolvedValue(
        template([
          { dayOfWeek: 0, mealId: "m-mon" },
          { dayOfWeek: 4, mealId: "m-fri" },
        ]) as never,
      );
      routeTargetWeek(buildWeek("tgt", TARGET));
      prismaMock.mealSuggestion.createMany.mockResolvedValue({
        count: 2,
      } as never);

      await applyTemplate({
        familyId: "fam-1",
        templateId: "tmpl-1",
        targetWeekStart: new Date(`${TARGET}T00:00:00Z`),
        userId: "user-1",
      });

      const rows = prismaMock.mealSuggestion.createMany.mock.calls[0][0]
        .data as Array<{
        dayPlanId: string;
        mealId: string;
        userId: string;
        approved: boolean;
      }>;
      // every created row is UNAPPROVED
      expect(rows.every((r) => r.approved === false)).toBe(true);
      expect(rows.every((r) => r.userId === "user-1")).toBe(true);
      // offset 0 → Monday day, offset 4 → Friday day
      expect(rows).toEqual(
        expect.arrayContaining([
          { dayPlanId: "tgt-day-0", mealId: "m-mon", userId: "user-1", approved: false },
          { dayPlanId: "tgt-day-4", mealId: "m-fri", userId: "user-1", approved: false },
        ]),
      );
    });

    it("defaults to existingMode 'error' → 409 when the target week already has suggestions", async () => {
      prismaMock.planningTemplate.findFirst.mockResolvedValue(
        template([{ dayOfWeek: 0, mealId: "m-mon" }]) as never,
      );
      routeTargetWeek(buildWeek("tgt", TARGET, { 2: [{ mealId: "m-existing" }] }));

      await expect(
        applyTemplate({
          familyId: "fam-1",
          templateId: "tmpl-1",
          targetWeekStart: new Date(`${TARGET}T00:00:00Z`),
          userId: "user-1",
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(prismaMock.mealSuggestion.createMany).not.toHaveBeenCalled();
    });

    it("existingMode 'skip' leaves days that already have suggestions untouched", async () => {
      stubTransaction();
      prismaMock.planningTemplate.findFirst.mockResolvedValue(
        template([
          { dayOfWeek: 0, mealId: "m-mon" }, // Monday already has a suggestion → skip
          { dayOfWeek: 1, mealId: "m-tue" }, // Tuesday empty → created
        ]) as never,
      );
      routeTargetWeek(buildWeek("tgt", TARGET, { 0: [{ mealId: "m-existing" }] }));
      prismaMock.mealSuggestion.createMany.mockResolvedValue({
        count: 1,
      } as never);

      await applyTemplate({
        familyId: "fam-1",
        templateId: "tmpl-1",
        targetWeekStart: new Date(`${TARGET}T00:00:00Z`),
        userId: "user-1",
        existingMode: "skip",
      });

      const rows = prismaMock.mealSuggestion.createMany.mock.calls[0][0]
        .data as Array<{ dayPlanId: string; mealId: string }>;
      expect(rows).toEqual([
        expect.objectContaining({ dayPlanId: "tgt-day-1", mealId: "m-tue" }),
      ]);
      expect(prismaMock.mealSuggestion.deleteMany).not.toHaveBeenCalled();
    });

    it("existingMode 'replace' clears the target week before creating", async () => {
      stubTransaction();
      prismaMock.planningTemplate.findFirst.mockResolvedValue(
        template([{ dayOfWeek: 0, mealId: "m-mon" }]) as never,
      );
      routeTargetWeek(buildWeek("tgt", TARGET, { 3: [{ mealId: "m-old" }] }));
      prismaMock.mealSuggestion.deleteMany.mockResolvedValue({
        count: 1,
      } as never);
      prismaMock.mealSuggestion.createMany.mockResolvedValue({
        count: 1,
      } as never);

      await applyTemplate({
        familyId: "fam-1",
        templateId: "tmpl-1",
        targetWeekStart: new Date(`${TARGET}T00:00:00Z`),
        userId: "user-1",
        existingMode: "replace",
      });

      // deletes across all 7 target day ids, then creates the new row
      expect(prismaMock.mealSuggestion.deleteMany).toHaveBeenCalledWith({
        where: {
          dayPlanId: {
            in: [
              "tgt-day-0",
              "tgt-day-1",
              "tgt-day-2",
              "tgt-day-3",
              "tgt-day-4",
              "tgt-day-5",
              "tgt-day-6",
            ],
          },
        },
      });
      expect(prismaMock.mealSuggestion.createMany).toHaveBeenCalled();
    });
  });

  describe("TemplateError", () => {
    it("carries an HTTP status", () => {
      const err = new TemplateError(422, "empty");
      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(422);
      expect(err.name).toBe("TemplateError");
    });
  });
});
