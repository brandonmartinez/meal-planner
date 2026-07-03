import prisma from "../config/database.js";
import type { Prisma } from "@prisma/client";

/** Case-insensitive uniqueness key for a recipe collection. A collection is
 *  unique per family by this value; the original casing is preserved separately
 *  in `name` for display. Mirrors the taxonomy `normalizeName` convention so a
 *  "Weeknight Dinners" and "weeknight dinners" collision folds to one. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Normalize + dedupe a raw collection-name list, dropping blanks. Preserves the
 *  first-seen display casing for each normalized key (later duplicates that
 *  differ only in case fold into the first). Mirrors taxonomy `dedupeNames`. */
function dedupeNames(
  names: string[],
): { name: string; nameNormalized: string }[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const nameNormalized = name.toLowerCase();
    if (!seen.has(nameNormalized)) seen.set(nameNormalized, name);
  }
  return [...seen.entries()].map(([nameNormalized, name]) => ({
    name,
    nameNormalized,
  }));
}

/** Resolve a list of collection names to ids within a family, creating any that
 *  don't exist yet. Case-insensitive: "Weeknight" and "weeknight" resolve to one
 *  collection. Every upsert is keyed by `(familyId, nameNormalized)` so names
 *  can NEVER resolve across families. */
async function resolveCollectionIds(
  tx: Prisma.TransactionClient,
  familyId: string,
  names: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const { name, nameNormalized } of dedupeNames(names)) {
    const collection = await tx.recipeCollection.upsert({
      where: { familyId_nameNormalized: { familyId, nameNormalized } },
      create: { name, nameNormalized, familyId },
      update: {},
    });
    ids.push(collection.id);
  }
  return ids;
}

/** Replace-set the collection memberships for a meal. Clears existing joins then
 *  re-creates from `collectionIds`. Caller must have already verified the meal
 *  is family-scoped and non-placeholder. */
async function assignCollections(
  tx: Prisma.TransactionClient,
  mealId: string,
  collectionIds: string[],
): Promise<void> {
  await tx.mealRecipeCollection.deleteMany({ where: { mealId } });
  if (collectionIds.length > 0) {
    await tx.mealRecipeCollection.createMany({
      data: collectionIds.map((recipeCollectionId) => ({
        mealId,
        recipeCollectionId,
      })),
      skipDuplicates: true,
    });
  }
}

/** Resolve + assign collection memberships for a meal by name, within a family
 *  transaction. `undefined` means "leave untouched"; an empty array means "clear
 *  all". Intended to be called from inside the meal create/update/import
 *  `$transaction` after the meal row exists and the placeholder guard has run —
 *  same call-site contract as {@link syncMealTaxonomy}. */
export async function syncMealCollections(
  tx: Prisma.TransactionClient,
  familyId: string,
  mealId: string,
  collections: string[] | undefined,
): Promise<void> {
  if (collections === undefined) return;
  const collectionIds = await resolveCollectionIds(tx, familyId, collections);
  await assignCollections(tx, mealId, collectionIds);
}

/** List every recipe collection for a family, sorted by display name.
 *  Family-scoped. */
export async function listCollections(familyId: string) {
  return prisma.recipeCollection.findMany({
    where: { familyId },
    orderBy: { name: "asc" },
  });
}

/** Fetch a single collection by id, scoped to the family. Returns `null` when
 *  the collection does not exist OR belongs to another family — callers map
 *  `null` to a 404 so cross-family reads are indistinguishable from missing. */
export async function getCollection(familyId: string, collectionId: string) {
  return prisma.recipeCollection.findFirst({
    where: { id: collectionId, familyId },
  });
}

/** Create a single collection by name within a family (idempotent — returns the
 *  existing collection on a case-insensitive collision, updating its
 *  `description` when one is supplied). Family-scoped. */
export async function createCollection(
  familyId: string,
  name: string,
  description?: string | null,
) {
  const nameNormalized = normalizeName(name);
  if (!nameNormalized) throw new Error("Collection name cannot be empty");
  return prisma.recipeCollection.upsert({
    where: { familyId_nameNormalized: { familyId, nameNormalized } },
    create: {
      name: name.trim(),
      nameNormalized,
      description: description ?? null,
      familyId,
    },
    update: description === undefined ? {} : { description },
  });
}

/** Update a collection's `name` and/or `description`, scoped to the family.
 *  Renaming recomputes `nameNormalized`. Throws "Collection not found" when the
 *  collection does not belong to the family (cross-family update impossible). */
export async function updateCollection(
  familyId: string,
  collectionId: string,
  data: { name?: string; description?: string | null },
) {
  const existing = await prisma.recipeCollection.findFirst({
    where: { id: collectionId, familyId },
  });
  if (!existing) throw new Error("Collection not found");

  const update: Prisma.RecipeCollectionUpdateInput = {};
  if (data.name !== undefined) {
    const nameNormalized = normalizeName(data.name);
    if (!nameNormalized) throw new Error("Collection name cannot be empty");
    update.name = data.name.trim();
    update.nameNormalized = nameNormalized;
  }
  if (data.description !== undefined) {
    update.description = data.description;
  }

  return prisma.recipeCollection.update({
    where: { id: existing.id },
    data: update,
  });
}

/** Delete a collection by id, scoped to the family. Throws "Collection not
 *  found" if the collection does not belong to the family (cross-family delete
 *  is impossible). Cascade removes the meal join rows. */
export async function deleteCollection(
  familyId: string,
  collectionId: string,
): Promise<void> {
  const result = await prisma.recipeCollection.deleteMany({
    where: { id: collectionId, familyId },
  });
  if (result.count === 0) throw new Error("Collection not found");
}
