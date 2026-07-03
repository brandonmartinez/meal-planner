import prisma from "../config/database.js";
import type { Prisma } from "@prisma/client";

/** The family-scoped taxonomy meals can be assigned to. Kept as a shared helper
 *  (rather than an inline service) so tag behavior lives in one place. */
export type TaxonomyKind = "tag";

/** Case-insensitive uniqueness key. A tag is unique per family by this value;
 *  the original casing is preserved separately in `name` for display. */
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

/** Resolve + assign tags for a meal by name, within a family transaction.
 *  `undefined` means "leave untouched"; an empty array means "clear all".
 *  Intended to be called from inside the meal create/update `$transaction`
 *  after the meal row exists and the placeholder guard has run. */
export async function syncMealTaxonomy(
  tx: Prisma.TransactionClient,
  familyId: string,
  mealId: string,
  tags: string[] | undefined,
): Promise<void> {
  if (tags !== undefined) {
    const tagIds = await resolveTagIds(tx, familyId, tags);
    await assignTags(tx, mealId, tagIds);
  }
}

/** List every tag for a family, sorted by display name. Family-scoped. */
export async function listTags(familyId: string) {
  return prisma.tag.findMany({
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

/** Delete a tag by id, scoped to the family. Throws if the tag does not belong
 *  to the family (cross-family delete is impossible). Cascade removes joins. */
export async function deleteTag(familyId: string, tagId: string): Promise<void> {
  const result = await prisma.tag.deleteMany({ where: { id: tagId, familyId } });
  if (result.count === 0) throw new Error("Tag not found");
}
