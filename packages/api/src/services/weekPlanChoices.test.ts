/**
 * Tests for `resolveSuggestionChoices` — the choice-slot snapshot write path
 * introduced in issue #226.
 *
 * Colocated with the weekPlan service; kept in a separate file to avoid
 * exceeding 500 lines in weekPlan.test.ts (already at ~1 063 lines).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));

const { resolveSuggestionChoices, SuggestionError } = await import(
  "./weekPlan.js"
);

const FAMILY_ID = "fam-1";
const SUGGESTION_ID = "sug-1";
const SLOT_ID = "slot-1";
const OPTION_ID = "opt-1";

/** Build a minimal MealSuggestion row that findFirst returns. */
function buildSuggestion(overrides: {
  approved?: boolean;
  userId?: string;
  slots?: Array<{
    id: string;
    name: string;
    options: Array<{
      id: string;
      name: string;
      ingredients?: Array<{
        name: string;
        quantity?: string | null;
        unit?: string | null;
        category?: string | null;
        position: number;
      }>;
    }>;
  }>;
}) {
  return {
    id: SUGGESTION_ID,
    userId: overrides.userId ?? "user-1",
    approved: overrides.approved ?? false,
    meal: {
      slots: overrides.slots ?? [],
    },
  };
}

/** Emulate prisma.$transaction(fn) by invoking fn with prismaMock as tx. */
function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cb: any) => Promise.resolve(cb(prismaMock)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubTransaction();
  // Default: re-fetch returns the suggestion (tests that care override this).
  prismaMock.mealSuggestion.findUniqueOrThrow.mockResolvedValue({
    id: SUGGESTION_ID,
  } as never);
  prismaMock.suggestionChoiceSnapshot.deleteMany.mockResolvedValue({
    count: 0,
  } as never);
  prismaMock.suggestionChoiceSnapshot.createMany.mockResolvedValue({
    count: 1,
  } as never);
  prismaMock.suggestionChoiceIngredientSnapshot.createMany.mockResolvedValue({
    count: 0,
  } as never);
});

describe("resolveSuggestionChoices", () => {
  describe("happy path", () => {
    it("creates a snapshot for each slot selection and returns the refetched suggestion", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [{ id: OPTION_ID, name: "Chicken", ingredients: [] }],
            },
          ],
        }) as never,
      );

      const result = await resolveSuggestionChoices(
        FAMILY_ID,
        SUGGESTION_ID,
        [{ slotId: SLOT_ID, optionId: OPTION_ID }],
        { id: "user-1", isParent: false },
      );

      expect(result).toEqual({ id: SUGGESTION_ID });

      // Old snapshots are cleared first.
      expect(
        prismaMock.suggestionChoiceSnapshot.deleteMany,
      ).toHaveBeenCalledWith({ where: { suggestionId: SUGGESTION_ID } });

      // One choice row is created.
      const [createArg] =
        prismaMock.suggestionChoiceSnapshot.createMany.mock.calls[0];
      expect(createArg.data).toHaveLength(1);
      expect(createArg.data[0]).toMatchObject({
        suggestionId: SUGGESTION_ID,
        slotId: SLOT_ID,
        optionId: OPTION_ID,
        slotName: "Protein",
        optionName: "Chicken",
      });
    });

    it("creates ingredient snapshot rows for additive ingredients on the chosen option", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [
                {
                  id: OPTION_ID,
                  name: "Chicken",
                  ingredients: [
                    { name: "Chicken breast", quantity: "200", unit: "g", category: "Meat", position: 0 },
                    { name: "Marinade", quantity: "2", unit: "tbsp", category: null, position: 1 },
                  ],
                },
              ],
            },
          ],
        }) as never,
      );

      await resolveSuggestionChoices(
        FAMILY_ID,
        SUGGESTION_ID,
        [{ slotId: SLOT_ID, optionId: OPTION_ID }],
        { id: "user-1", isParent: false },
      );

      const [ingArg] =
        prismaMock.suggestionChoiceIngredientSnapshot.createMany.mock.calls[0];
      expect(ingArg.data).toHaveLength(2);
      expect(ingArg.data[0]).toMatchObject({
        name: "Chicken breast",
        quantity: "200",
        unit: "g",
        category: "Meat",
        position: 0,
      });
      expect(ingArg.data[1]).toMatchObject({
        name: "Marinade",
        category: null,
      });
    });

    it("creates no ingredient snapshot rows when the chosen option has no ingredients", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [{ id: OPTION_ID, name: "None", ingredients: [] }],
            },
          ],
        }) as never,
      );

      await resolveSuggestionChoices(
        FAMILY_ID,
        SUGGESTION_ID,
        [{ slotId: SLOT_ID, optionId: OPTION_ID }],
        { id: "user-1", isParent: false },
      );

      expect(
        prismaMock.suggestionChoiceIngredientSnapshot.createMany,
      ).not.toHaveBeenCalled();
    });

    it("allows a PARENT to resolve another user's suggestion", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          userId: "user-OTHER",
          slots: [
            {
              id: SLOT_ID,
              name: "Side",
              options: [{ id: OPTION_ID, name: "Salad", ingredients: [] }],
            },
          ],
        }) as never,
      );

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [{ slotId: SLOT_ID, optionId: OPTION_ID }],
          { id: "parent-1", isParent: true },
        ),
      ).resolves.not.toThrow();
    });

    it("no-ops (deleteMany only) when the meal has zero slots and selections is empty", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({ slots: [] }) as never,
      );

      await resolveSuggestionChoices(
        FAMILY_ID,
        SUGGESTION_ID,
        [],
        { id: "user-1", isParent: false },
      );

      expect(
        prismaMock.suggestionChoiceSnapshot.createMany,
      ).not.toHaveBeenCalled();
      expect(
        prismaMock.suggestionChoiceIngredientSnapshot.createMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("error cases — lookup failures", () => {
    it("throws 404 when the suggestion is not found or belongs to another family", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(null);

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          "sug-MISSING",
          [{ slotId: SLOT_ID, optionId: OPTION_ID }],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 404 });

      expect(
        prismaMock.suggestionChoiceSnapshot.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it("throws 404 as a SuggestionError instance", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(null);

      await expect(
        resolveSuggestionChoices(FAMILY_ID, "sug-x", [], {
          id: "user-1",
          isParent: false,
        }),
      ).rejects.toBeInstanceOf(SuggestionError);
    });
  });

  describe("error cases — immutability", () => {
    it("throws 409 when the suggestion is already approved", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({ approved: true }) as never,
      );

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 409 });

      expect(
        prismaMock.suggestionChoiceSnapshot.deleteMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("error cases — authorization", () => {
    it("throws 403 when a non-parent tries to resolve someone else's choices", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          userId: "user-OTHER",
          slots: [
            {
              id: SLOT_ID,
              name: "Side",
              options: [{ id: OPTION_ID, name: "Rice", ingredients: [] }],
            },
          ],
        }) as never,
      );

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [{ slotId: SLOT_ID, optionId: OPTION_ID }],
          { id: "user-CHILD", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 403 });

      expect(
        prismaMock.suggestionChoiceSnapshot.deleteMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("error cases — slot validation", () => {
    it("throws 422 when the meal has no slots but selections is non-empty", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({ slots: [] }) as never,
      );

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [{ slotId: SLOT_ID, optionId: OPTION_ID }],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("throws 422 when selections count does not match slot count (too few)", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          slots: [
            {
              id: "slot-A",
              name: "Protein",
              options: [{ id: "opt-A", name: "Chicken", ingredients: [] }],
            },
            {
              id: "slot-B",
              name: "Side",
              options: [{ id: "opt-B", name: "Rice", ingredients: [] }],
            },
          ],
        }) as never,
      );

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [{ slotId: "slot-A", optionId: "opt-A" }], // only 1 of 2 slots
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("throws 422 when selections count does not match slot count (too many)", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [{ id: OPTION_ID, name: "Chicken", ingredients: [] }],
            },
          ],
        }) as never,
      );

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [
            { slotId: SLOT_ID, optionId: OPTION_ID },
            { slotId: "slot-EXTRA", optionId: "opt-EXTRA" }, // extra
          ],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("throws 422 when a selection references an unknown slot id", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [{ id: OPTION_ID, name: "Chicken", ingredients: [] }],
            },
          ],
        }) as never,
      );

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [{ slotId: "slot-BOGUS", optionId: OPTION_ID }],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("throws 422 when the same slot is selected more than once (duplicate slot)", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [
                { id: "opt-A", name: "Chicken", ingredients: [] },
                { id: "opt-B", name: "Tofu", ingredients: [] },
              ],
            },
            {
              id: "slot-B",
              name: "Side",
              options: [{ id: "opt-C", name: "Rice", ingredients: [] }],
            },
          ],
        }) as never,
      );

      // Both selections reference the same slot id.
      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [
            { slotId: SLOT_ID, optionId: "opt-A" },
            { slotId: SLOT_ID, optionId: "opt-B" },
          ],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("throws 422 when the chosen option does not belong to its slot", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [{ id: OPTION_ID, name: "Chicken", ingredients: [] }],
            },
          ],
        }) as never,
      );

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [{ slotId: SLOT_ID, optionId: "opt-WRONG" }],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  /**
   * TOCTOU regression — issue #226
   *
   * The pre-check on `suggestion.approved` (outside the transaction) cannot
   * prevent a concurrent approval from racing in between the check and the
   * snapshot writes. The transactional re-read inside `$transaction` must
   * catch this and throw 409 without touching the snapshots.
   */
  describe("TOCTOU guard — transactional approval recheck (#226)", () => {
    it("throws 409 inside the transaction when the suggestion was approved concurrently", async () => {
      // Pre-check sees unapproved — passes through to the transaction.
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          approved: false,
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [{ id: OPTION_ID, name: "Chicken", ingredients: [] }],
            },
          ],
        }) as never,
      );

      // Concurrent approval races in: the live re-read inside the tx sees approved=true.
      prismaMock.mealSuggestion.findUnique.mockResolvedValue({
        approved: true,
      } as never);

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [{ slotId: SLOT_ID, optionId: OPTION_ID }],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 409 });

      // No snapshots should be written after the guard fires.
      expect(
        prismaMock.suggestionChoiceSnapshot.deleteMany,
      ).not.toHaveBeenCalled();
      expect(
        prismaMock.suggestionChoiceSnapshot.createMany,
      ).not.toHaveBeenCalled();
      expect(
        prismaMock.suggestionChoiceIngredientSnapshot.createMany,
      ).not.toHaveBeenCalled();
    });

    it("throws 409 as a SuggestionError instance when the concurrent-approval guard fires", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({ approved: false, slots: [] }) as never,
      );
      prismaMock.mealSuggestion.findUnique.mockResolvedValue({
        approved: true,
      } as never);

      await expect(
        resolveSuggestionChoices(FAMILY_ID, SUGGESTION_ID, [], {
          id: "user-1",
          isParent: false,
        }),
      ).rejects.toBeInstanceOf(SuggestionError);
    });

    it("throws 404 inside the transaction when the suggestion was deleted concurrently", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          approved: false,
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [{ id: OPTION_ID, name: "Chicken", ingredients: [] }],
            },
          ],
        }) as never,
      );

      // Suggestion deleted between the pre-check and the tx re-read.
      prismaMock.mealSuggestion.findUnique.mockResolvedValue(null);

      await expect(
        resolveSuggestionChoices(
          FAMILY_ID,
          SUGGESTION_ID,
          [{ slotId: SLOT_ID, optionId: OPTION_ID }],
          { id: "user-1", isParent: false },
        ),
      ).rejects.toMatchObject({ status: 404 });

      expect(
        prismaMock.suggestionChoiceSnapshot.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it("still creates snapshots when the transactional recheck confirms unapproved (happy path integrity)", async () => {
      prismaMock.mealSuggestion.findFirst.mockResolvedValue(
        buildSuggestion({
          approved: false,
          slots: [
            {
              id: SLOT_ID,
              name: "Protein",
              options: [{ id: OPTION_ID, name: "Chicken", ingredients: [] }],
            },
          ],
        }) as never,
      );

      // Re-read inside tx also returns unapproved — no race.
      prismaMock.mealSuggestion.findUnique.mockResolvedValue({
        approved: false,
      } as never);

      const result = await resolveSuggestionChoices(
        FAMILY_ID,
        SUGGESTION_ID,
        [{ slotId: SLOT_ID, optionId: OPTION_ID }],
        { id: "user-1", isParent: false },
      );

      expect(result).toEqual({ id: SUGGESTION_ID });
      expect(
        prismaMock.suggestionChoiceSnapshot.deleteMany,
      ).toHaveBeenCalledOnce();
      expect(
        prismaMock.suggestionChoiceSnapshot.createMany,
      ).toHaveBeenCalledOnce();
    });
  });
});
