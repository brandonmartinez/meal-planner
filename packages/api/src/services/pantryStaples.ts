import prisma from "../config/database.js";
import { normalizeIngredientName } from "./ingredientNormalize.js";

/**
 * Family-scoped managed pantry staples (issue #205).
 *
 * A pantry staple is a "stock kitchen" item (salt, spices, oil, ...) a family
 * keeps on hand and does not want mixed into the active shopping list. Grocery
 * items whose normalized name matches a staple are auto-separated into a
 * dedicated "Pantry Staples" section on the grocery list (see
 * {@link file://./grocery.ts}) — staple items are never deleted or pruned, only
 * segmented.
 *
 * Names are normalized with {@link normalizeIngredientName} — the SAME
 * normalization used for grocery keys — so that a staple's `nameNormalized`
 * matches a grocery item's key exactly (case/whitespace-insensitive). This keeps
 * the two behaviors from ever drifting apart.
 */

/** Raised when a pantry-staple operation fails in a client-attributable way. */
export class PantryStapleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PantryStapleError";
    this.status = status;
  }
}

/** List a family's pantry staples, sorted by display name. */
export async function listPantryStaples(familyId: string) {
  return prisma.pantryStaple.findMany({
    where: { familyId },
    orderBy: { name: "asc" },
  });
}

/**
 * Create a single pantry staple by name within a family (idempotent — returns
 * the existing row on a normalized collision). Family-scoped. The name is
 * normalized with the grocery normalization so matching against grocery item
 * names is exact.
 */
export async function createPantryStaple(familyId: string, name: string) {
  const nameNormalized = normalizeIngredientName(name);
  if (!nameNormalized) {
    throw new PantryStapleError("Pantry staple name cannot be empty", 400);
  }
  return prisma.pantryStaple.upsert({
    where: { familyId_nameNormalized: { familyId, nameNormalized } },
    create: { name: name.trim(), nameNormalized, familyId },
    update: {},
  });
}

/**
 * Delete a pantry staple by id, scoped to the family. Throws a 404
 * {@link PantryStapleError} if the staple does not belong to the family
 * (cross-family delete is impossible). Deleting a staple never touches grocery
 * items — the "Pantry Staples" flag is derived at read time, so a removed staple
 * simply stops matching and its items fold back into their aisle category.
 */
export async function deletePantryStaple(
  familyId: string,
  stapleId: string,
): Promise<void> {
  const result = await prisma.pantryStaple.deleteMany({
    where: { id: stapleId, familyId },
  });
  if (result.count === 0) {
    throw new PantryStapleError("Pantry staple not found", 404);
  }
}

/**
 * The set of normalized staple names for a family, for O(1) membership checks
 * when annotating grocery items. Returned as a plain Set so callers can test
 * `set.has(normalizeIngredientName(itemName))` directly.
 */
export async function getPantryStapleNameSet(
  familyId: string,
): Promise<Set<string>> {
  const staples = await prisma.pantryStaple.findMany({
    where: { familyId },
    select: { nameNormalized: true },
  });
  return new Set((staples ?? []).map((s) => s.nameNormalized));
}
