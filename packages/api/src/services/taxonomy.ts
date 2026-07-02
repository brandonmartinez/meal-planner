import prisma from "../config/database.js";
import type { Prisma } from "@prisma/client";

/** The two family-scoped taxonomies meals can be assigned to. Kept as a shared
 *  helper (rather than two copy-pasted services) so tag and category behavior
 *  can never drift apart. */
export type TaxonomyKind = "tag" | "category";

/** Case-insensitive uniqueness key. A tag/category is unique per family by this
 *  value; the original casing is preserved separately in `name` for display. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Normalize + dedupe a raw name list, dropping blanks. Preserves the
 *  first-seen display casing for each normalized key (later duplicates that
 *  differ only in case are folded into the first). */
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

/** Resolve a list of tag names to ids within a family, creating any that don't
 *  exist yet. Case-insensitive: "Quick" and "quick" resolve to one tag. Every
 *  upsert is keyed by `(familyId, nameNormalized)` so names can NEVER resolve
 *  across families. */
async function resolveTagIds(
  tx: Prisma.TransactionClient,
  familyId: string,
  names: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const { name, nameNormalized } of dedupeNames(names)) {
    const tag = await tx.tag.upsert({
      where: { familyId_nameNormalized: { familyId, nameNormalized } },
      create: { name, nameNormalized, familyId },
      update: {},
    });
    ids.push(tag.id);
  }
  return ids;
}

/** Category counterpart of {@link resolveTagIds}. */
async function resolveCategoryIds(
  tx: Prisma.TransactionClient,
  familyId: string,
  names: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const { name, nameNormalized } of dedupeNames(names)) {
    const category = await tx.category.upsert({
      where: { familyId_nameNormalized: { familyId, nameNormalized } },
      create: { name, nameNormalized, familyId },
      update: {},
    });
    ids.push(category.id);
  }
  return ids;
}

/** Replace-set the tag assignments for a meal. Clears existing joins then
 *  re-creates from `tagIds`. Caller must have already verified the meal is
 *  family-scoped and non-placeholder. */
async function assignTags(
  tx: Prisma.TransactionClient,
  mealId: string,
  tagIds: string[],
): Promise<void> {
  await tx.mealTag.deleteMany({ where: { mealId } });
  if (tagIds.length > 0) {
    await tx.mealTag.createMany({
      data: tagIds.map((tagId) => ({ mealId, tagId })),
      skipDuplicates: true,
    });
  }
}

/** Category counterpart of {@link assignTags}. */
async function assignCategories(
  tx: Prisma.TransactionClient,
  mealId: string,
  categoryIds: string[],
): Promise<void> {
  await tx.mealCategory.deleteMany({ where: { mealId } });
  if (categoryIds.length > 0) {
    await tx.mealCategory.createMany({
      data: categoryIds.map((categoryId) => ({ mealId, categoryId })),
      skipDuplicates: true,
    });
  }
}

/** Resolve + assign tags and/or categories for a meal by name, within a family
 *  transaction. `undefined` means "leave untouched"; an empty array means
 *  "clear all". Intended to be called from inside the meal create/update
 *  `$transaction` after the meal row exists and the placeholder guard has run. */
export async function syncMealTaxonomy(
  tx: Prisma.TransactionClient,
  familyId: string,
  mealId: string,
  tags: string[] | undefined,
  categories: string[] | undefined,
): Promise<void> {
  if (tags !== undefined) {
    const tagIds = await resolveTagIds(tx, familyId, tags);
    await assignTags(tx, mealId, tagIds);
  }
  if (categories !== undefined) {
    const categoryIds = await resolveCategoryIds(tx, familyId, categories);
    await assignCategories(tx, mealId, categoryIds);
  }
}

/** List every tag for a family, sorted by display name. Family-scoped. */
export async function listTags(familyId: string) {
  return prisma.tag.findMany({
    where: { familyId },
    orderBy: { name: "asc" },
  });
}

/** List every category for a family, sorted by display name. Family-scoped. */
export async function listCategories(familyId: string) {
  return prisma.category.findMany({
    where: { familyId },
    orderBy: { name: "asc" },
  });
}

/** Create a single tag by name within a family (idempotent — returns the
 *  existing tag on a case-insensitive collision). Family-scoped. */
export async function createTag(familyId: string, name: string) {
  const nameNormalized = normalizeName(name);
  if (!nameNormalized) throw new Error("Tag name cannot be empty");
  return prisma.tag.upsert({
    where: { familyId_nameNormalized: { familyId, nameNormalized } },
    create: { name: name.trim(), nameNormalized, familyId },
    update: {},
  });
}

/** Create a single category by name within a family. See {@link createTag}. */
export async function createCategory(familyId: string, name: string) {
  const nameNormalized = normalizeName(name);
  if (!nameNormalized) throw new Error("Category name cannot be empty");
  return prisma.category.upsert({
    where: { familyId_nameNormalized: { familyId, nameNormalized } },
    create: { name: name.trim(), nameNormalized, familyId },
    update: {},
  });
}

/** Delete a tag by id, scoped to the family. Throws if the tag does not belong
 *  to the family (cross-family delete is impossible). Cascade removes joins. */
export async function deleteTag(familyId: string, tagId: string): Promise<void> {
  const result = await prisma.tag.deleteMany({ where: { id: tagId, familyId } });
  if (result.count === 0) throw new Error("Tag not found");
}

/** Delete a category by id, scoped to the family. See {@link deleteTag}. */
export async function deleteCategory(
  familyId: string,
  categoryId: string,
): Promise<void> {
  const result = await prisma.category.deleteMany({
    where: { id: categoryId, familyId },
  });
  if (result.count === 0) throw new Error("Category not found");
}
