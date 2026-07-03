import { INGREDIENT_CATEGORIES } from "@meal-planner/shared";
import prisma from "../config/database.js";
import { normalizeName } from "./taxonomy.js";

/**
 * Family-configurable grocery aisle categories (issue #119).
 *
 * This service manages a family's *custom* grocery categories, which layer on
 * top of the shared {@link INGREDIENT_CATEGORIES} defaults. Unlike the meal
 * Tag/Category taxonomies, ingredient/grocery `category` values are stored as
 * free-form strings and are NOT foreign keys to these rows — the registry is an
 * advisory pick-list, not a constraint. The *effective* list a client offers is
 * `INGREDIENT_CATEGORIES ∪ custom rows` (defaults first in their canonical
 * order, then custom names, deduped case-insensitively). Backward compatibility
 * is total: any legacy category string keeps validating because nothing is
 * tightened to a closed set.
 *
 * The uniqueness/normalization rules mirror the Tag/Category taxonomy so the two
 * behaviors can never drift apart ({@link normalizeName} is reused directly).
 */

/** List a family's custom grocery categories, sorted by display name. */
export async function listGroceryCategories(familyId: string) {
  return prisma.groceryCategory.findMany({
    where: { familyId },
    orderBy: { name: "asc" },
  });
}

/**
 * The effective grocery category list for a family: shared defaults first (in
 * their canonical {@link INGREDIENT_CATEGORIES} order), followed by any custom
 * names not already covered by a default. Deduped case-insensitively; the
 * first-seen display casing wins (defaults keep their canonical casing).
 */
export async function listEffectiveGroceryCategories(
  familyId: string,
): Promise<string[]> {
  const custom = await prisma.groceryCategory.findMany({
    where: { familyId },
    orderBy: { name: "asc" },
  });
  const seen = new Set<string>(INGREDIENT_CATEGORIES.map((c) => c.toLowerCase()));
  const effective: string[] = [...INGREDIENT_CATEGORIES];
  for (const row of custom) {
    const norm = normalizeName(row.name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    effective.push(row.name);
  }
  return effective;
}

/**
 * Create a single custom grocery category by name within a family (idempotent —
 * returns the existing row on a case-insensitive collision). Family-scoped.
 */
export async function createGroceryCategory(familyId: string, name: string) {
  const nameNormalized = normalizeName(name);
  if (!nameNormalized) throw new Error("Grocery category name cannot be empty");
  return prisma.groceryCategory.upsert({
    where: { familyId_nameNormalized: { familyId, nameNormalized } },
    create: { name: name.trim(), nameNormalized, familyId },
    update: {},
  });
}

/**
 * Rename a custom grocery category by id, scoped to the family. Throws if the
 * category does not belong to the family (cross-family rename is impossible). A
 * collision with another category's normalized name in the same family surfaces
 * as a Prisma unique-constraint error (mapped to 409 by the route layer).
 */
export async function renameGroceryCategory(
  familyId: string,
  categoryId: string,
  name: string,
) {
  const nameNormalized = normalizeName(name);
  if (!nameNormalized) throw new Error("Grocery category name cannot be empty");
  const result = await prisma.groceryCategory.updateMany({
    where: { id: categoryId, familyId },
    data: { name: name.trim(), nameNormalized },
  });
  if (result.count === 0) throw new Error("Grocery category not found");
  return prisma.groceryCategory.findFirst({
    where: { id: categoryId, familyId },
  });
}

/**
 * Delete a custom grocery category by id, scoped to the family. Throws if the
 * category does not belong to the family. Because ingredient/grocery categories
 * are stored as raw strings (not FKs), deleting a custom row never orphans any
 * data — existing items keep their string value; the name simply drops out of
 * the effective pick-list and folds back to a plain custom string until re-added.
 */
export async function deleteGroceryCategory(
  familyId: string,
  categoryId: string,
): Promise<void> {
  const result = await prisma.groceryCategory.deleteMany({
    where: { id: categoryId, familyId },
  });
  if (result.count === 0) throw new Error("Grocery category not found");
}
