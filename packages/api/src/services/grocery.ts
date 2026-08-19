import { GrocerySource, Prisma } from "@prisma/client";
import prisma from "../config/database.js";
import {
  canonicalUnit,
  displayIngredientName,
  normalizeIngredientName,
  normalizeUnit,
} from "./ingredientNormalize.js";
import { getPantryStapleNameSet } from "./pantryStaples.js";

/**
 * Annotate a grocery list's items with a derived `isPantryStaple` flag (issue
 * #205). An item is a pantry staple when its normalized name matches one of the
 * family's managed {@link file://../services/pantryStaples.ts pantry staples}.
 * The flag is computed at READ time from the current staple set — there is no
 * persisted column and no item is ever mutated or pruned here — so the client
 * can group staples into a distinct "Pantry Staples" section instead of their
 * aisle category. Matching reuses {@link normalizeIngredientName}, the same
 * normalization behind {@link groceryKey}, so it stays case/whitespace-insensitive
 * and consistent with grocery merge keys. A `null` list passes through unchanged.
 */
async function annotatePantryStaples<
  I extends { name: string },
  T extends { items: I[] },
>(
  list: T | null,
  familyId: string,
): Promise<(Omit<T, "items"> & { items: (I & { isPantryStaple: boolean })[] }) | null> {
  if (!list) return null;
  const stapleSet = await getPantryStapleNameSet(familyId);
  return {
    ...list,
    items: (list.items ?? []).map((item) => ({
      ...item,
      isPantryStaple: stapleSet.has(normalizeIngredientName(item.name)),
    })),
  };
}

/**
 * Canonical merge key: normalized name + normalized unit (issue #120).
 *
 * Case-folds, collapses whitespace, strips trailing punctuation on the name, and
 * folds common unit aliases (`tablespoon` → `tbsp`) on the unit. This only ever
 * makes MORE variants merge, never fewer, so source tracking still gathers every
 * contributing meal. Both the computed-item map and the existing-DB reconciliation
 * map key off this function, so matching stays consistent across generations.
 */
export function groceryKey(name: string, unit?: string): string {
  return `${normalizeIngredientName(name)}|${normalizeUnit(unit)}`;
}

/**
 * Parse a quantity string to a number, or `null` when it is not a clean numeric
 * value. Supports plain ints/decimals, simple fractions (`1/2`), and mixed
 * numbers (`1 1/2`). Returns `null` for anything else (e.g. `"to taste"`), and
 * guards against a zero denominator. This is intentionally stricter than
 * `parseFloat`, which wrongly reads `"1/2"` as `1`.
 */
function parseQuantity(value: string): number | null {
  const s = value.trim();
  if (!s) return null;
  // Plain integer or decimal, e.g. "2" or "1.5".
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  // Simple fraction, e.g. "1/2".
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const denom = Number(frac[2]);
    return denom === 0 ? null : Number(frac[1]) / denom;
  }
  // Mixed number, e.g. "1 1/2".
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denom = Number(mixed[3]);
    return denom === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / denom;
  }
  return null;
}

/**
 * Merge two quantity strings for grouped grocery lines (issue #120).
 *
 * Conservative — NO unit conversion (the merge key already guarantees a common
 * canonical unit). When both operands are numeric (incl. fractions/mixed) they
 * are summed and rounded to 3 decimals to shed float noise. An empty operand
 * yields the other. Otherwise the values pass through joined as `"a, b"` so
 * non-numeric quantities are never dropped or crashed on; two identical
 * non-numeric strings collapse to a single value. `_unit` stays reserved for a
 * future (out-of-scope) unit-conversion pass.
 */
export function mergeQuantities(a: string, b: string, _unit?: string): string {
  if (!a) return b;
  if (!b) return a;
  const numA = parseQuantity(a);
  const numB = parseQuantity(b);
  if (numA !== null && numB !== null) {
    return String(Math.round((numA + numB) * 1000) / 1000);
  }
  // Collapse identical non-numeric quantities (e.g. "to taste" + "to taste").
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return a;
  return `${a}, ${b}`;
}

interface ComputedItem {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  sources: string[];
  sourceMealIds: string[];
  sourceDays: number[];
}

/**
 * Weekday offset (0=Monday .. 6=Sunday) for a plan date, matching the
 * `PlanningTemplateEntry.dayOfWeek` convention. JS `getUTCDay()` is
 * 0=Sunday..6=Saturday, so shift by 6 and wrap.
 */
function weekdayOffset(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

export async function generateGroceryList(
  familyId: string,
  weekStart: Date,
  options?: { startDate?: Date; endDate?: Date },
) {
  const start = new Date(weekStart);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  // Short-order date-range generate (issue #206): narrow which suggestions
  // contribute without changing the week the list is keyed to. When a range is
  // active, out-of-range GENERATED items are preserved (orphan pruning below is
  // skipped) so short-order shopping never wipes the rest of the week's list.
  const dateRangeActive = !!(options?.startDate || options?.endDate);
  const queryStart = options?.startDate
    ? (() => {
        const s = new Date(options.startDate);
        s.setUTCHours(0, 0, 0, 0);
        return s < start ? start : s;
      })()
    : start;
  const queryEnd = options?.endDate
    ? (() => {
        const e = new Date(options.endDate);
        e.setUTCHours(23, 59, 59, 999);
        return e > end ? end : e;
      })()
    : end;

  // Find all approved meal suggestions for the (optionally narrowed) range
  const suggestions = await prisma.mealSuggestion.findMany({
    where: {
      approved: true,
      dayPlan: {
        date: { gte: queryStart, lte: queryEnd },
        weekPlan: { familyId },
      },
    },
    include: {
      dayPlan: { select: { date: true } },
      meal: {
        include: { ingredients: true },
      },
      choices: {
        include: {
          ingredients: true,
        },
      },
    },
  });

  // Build computed ingredient map from approved suggestions
  const computedMap = new Map<string, ComputedItem>();
  for (const suggestion of suggestions) {
    const planDate = suggestion.dayPlan?.date;
    const day = planDate ? weekdayOffset(new Date(planDate)) : null;
    const additiveIngredients = (suggestion.choices ?? []).flatMap(
      (choice) => choice.ingredients ?? [],
    );
    for (const ing of [...suggestion.meal.ingredients, ...additiveIngredients]) {
      const key = groceryKey(ing.name, ing.unit ?? undefined);
      const existing = computedMap.get(key);
      if (existing) {
        existing.quantity = mergeQuantities(
          existing.quantity,
          ing.quantity || "",
        );
        if (!existing.sources.includes(suggestion.meal.name)) {
          existing.sources.push(suggestion.meal.name);
        }
        if (!existing.sourceMealIds.includes(suggestion.meal.id)) {
          existing.sourceMealIds.push(suggestion.meal.id);
        }
        if (day !== null && !existing.sourceDays.includes(day)) {
          existing.sourceDays.push(day);
        }
      } else {
        computedMap.set(key, {
          name: displayIngredientName(ing.name),
          quantity: ing.quantity || "",
          unit: canonicalUnit(ing.unit ?? undefined),
          category: ing.category || "other",
          sources: [suggestion.meal.name],
          sourceMealIds: [suggestion.meal.id],
          sourceDays: day !== null ? [day] : [],
        });
      }
    }
  }

  // Normalize sourceDays to Mon→Sun order for deterministic storage
  for (const item of computedMap.values()) {
    item.sourceDays.sort((a, b) => a - b);
  }

  // Fetch or create the grocery list
  const existingList = await prisma.groceryList.findFirst({
    where: { familyId, weekStart: start },
    include: { items: true },
  });

  if (!existingList) {
    // No existing list — create fresh with all GENERATED items
    const created = await prisma.groceryList.create({
      data: {
        familyId,
        weekStart: start,
        items: {
          create: Array.from(computedMap.values()).map((item) => ({
            name: item.name,
            quantity: item.quantity || null,
            unit: item.unit || null,
            category: item.category || null,
            sources: item.sources,
            sourceMealIds: item.sourceMealIds,
            sourceDays: item.sourceDays,
            origin: GrocerySource.GENERATED,
            edited: false,
          })),
        },
      },
      include: {
        items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
      },
    });
    return annotatePantryStaples(created, familyId);
  }

  // Partition existing items: MANUAL items are never touched
  const generatedMap = new Map<string, (typeof existingList.items)[number]>();
  for (const item of existingList.items) {
    if (item.origin === GrocerySource.GENERATED) {
      generatedMap.set(groceryKey(item.name, item.unit ?? undefined), item);
    }
  }

  // Build transaction ops
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  // Reconcile computed items against existing GENERATED items
  for (const [key, computed] of computedMap.entries()) {
    const existing = generatedMap.get(key);
    if (existing) {
      // UPDATE: refresh provenance; preserve user's qty/unit/category if edited
      ops.push(
        prisma.groceryItem.update({
          where: { id: existing.id },
          data: {
            sources: computed.sources,
            sourceMealIds: computed.sourceMealIds,
            sourceDays: computed.sourceDays,
            // Only refresh qty/unit/category for items the user hasn't edited
            ...(existing.edited
              ? {}
              : {
                  quantity: computed.quantity || null,
                  unit: computed.unit || null,
                  category: computed.category || null,
                }),
          },
        }),
      );
    } else {
      // CREATE: new GENERATED item
      ops.push(
        prisma.groceryItem.create({
          data: {
            groceryListId: existingList.id,
            name: computed.name,
            quantity: computed.quantity || null,
            unit: computed.unit || null,
            category: computed.category || null,
            sources: computed.sources,
            sourceMealIds: computed.sourceMealIds,
            sourceDays: computed.sourceDays,
            origin: GrocerySource.GENERATED,
            edited: false,
            checked: false,
          },
        }),
      );
    }
  }

  // Handle orphaned GENERATED items (no longer in any meal plan).
  // Skipped entirely while a short-order date range is active so out-of-range
  // GENERATED items survive a narrowed generate (issue #206).
  if (!dateRangeActive) {
    for (const [key, item] of generatedMap.entries()) {
      if (!computedMap.has(key)) {
        if (item.edited || item.checked) {
          // Promote to MANUAL so the user's edits AND checked-off progress
          // survive regeneration (issue #206). A checked item is never removed.
          // Clear sourceDays on MANUAL promotion (issue #204).
          ops.push(
            prisma.groceryItem.update({
              where: { id: item.id },
              data: {
                origin: GrocerySource.MANUAL,
                sourceMealIds: [],
                sourceDays: [],
              },
            }),
          );
        } else {
          // Unedited, unchecked orphan — safe to delete
          ops.push(prisma.groceryItem.delete({ where: { id: item.id } }));
        }
      }
    }
  }

  await prisma.$transaction(ops);

  // Return the refreshed list
  const refreshed = await prisma.groceryList.findFirst({
    where: { id: existingList.id, familyId },
    include: {
      items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
    },
  });
  return annotatePantryStaples(refreshed, familyId);
}

export async function getGroceryList(listId: string, familyId: string) {
  const list = await prisma.groceryList.findFirst({
    where: { id: listId, familyId },
    include: {
      items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
    },
  });
  return annotatePantryStaples(list, familyId);
}

export async function getGroceryListByWeek(familyId: string, weekStart: Date) {
  const start = new Date(weekStart);
  start.setUTCHours(0, 0, 0, 0);

  const list = await prisma.groceryList.findFirst({
    where: { familyId, weekStart: start },
    include: {
      items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
    },
  });
  return annotatePantryStaples(list, familyId);
}

/**
 * Domain error for grocery mutations. Carries an HTTP status so routes can map
 * known failures (not-found / bad-input) to the right code instead of a 500.
 */
export class GroceryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GroceryError";
  }
}

/**
 * Toggles an item's `checked` flag, enforcing that the item belongs to
 * `listId` AND that the list belongs to `familyId`. A non-owned item/list
 * yields 404 without mutating anything.
 */
export async function toggleItem(
  familyId: string,
  listId: string,
  itemId: string,
  checked: boolean,
) {
  const owned = await prisma.groceryItem.findFirst({
    where: { id: itemId, groceryListId: listId, groceryList: { familyId } },
    select: { id: true },
  });
  if (!owned) {
    throw new GroceryError(404, "Grocery item not found");
  }

  return prisma.groceryItem.update({
    where: { id: itemId },
    data: { checked },
  });
}

/**
 * Adds a custom item to a grocery list, enforcing that the list belongs to
 * `familyId`. A non-owned list yields 404 without creating the item.
 */
export async function addCustomItem(
  familyId: string,
  groceryListId: string,
  data: { name: string; quantity?: string; unit?: string; category?: string },
) {
  const list = await prisma.groceryList.findFirst({
    where: { id: groceryListId, familyId },
    select: { id: true },
  });
  if (!list) {
    throw new GroceryError(404, "Grocery list not found");
  }

  return prisma.groceryItem.create({
    data: {
      groceryListId,
      name: data.name,
      quantity: data.quantity || null,
      unit: data.unit || null,
      category: data.category || "other",
      checked: false,
      origin: GrocerySource.MANUAL,
    },
  });
}

/**
 * Removes a grocery item, enforcing that the item belongs to `listId` AND that
 * the list belongs to `familyId`. A non-owned item/list yields 404 without
 * deleting anything.
 */
export async function removeItem(
  familyId: string,
  listId: string,
  itemId: string,
) {
  const owned = await prisma.groceryItem.findFirst({
    where: { id: itemId, groceryListId: listId, groceryList: { familyId } },
    select: { id: true },
  });
  if (!owned) {
    throw new GroceryError(404, "Grocery item not found");
  }

  await prisma.groceryItem.delete({
    where: { id: itemId },
  });
}

/**
 * Updates editable fields on a grocery item (quantity, unit, category).
 * Sets `edited = true` for GENERATED items so regeneration knows to preserve
 * user intent. MANUAL items are already user-owned — `edited` is not changed.
 */
export async function editItemFields(
  familyId: string,
  listId: string,
  itemId: string,
  data: { quantity?: string; unit?: string; category?: string },
) {
  const item = await prisma.groceryItem.findFirst({
    where: { id: itemId, groceryList: { id: listId, familyId } },
  });
  if (!item) {
    throw new GroceryError(404, "Grocery item not found");
  }

  const updateData: {
    quantity?: string | null;
    unit?: string | null;
    category?: string | null;
    edited?: boolean;
  } = {};

  if (data.quantity !== undefined) updateData.quantity = data.quantity || null;
  if (data.unit !== undefined) updateData.unit = data.unit || null;
  if (data.category !== undefined) updateData.category = data.category || null;

  // Mark as edited for GENERATED items so regeneration preserves user fields
  if (
    Object.keys(updateData).length > 0 &&
    item.origin === GrocerySource.GENERATED
  ) {
    updateData.edited = true;
  }

  return prisma.groceryItem.update({
    where: { id: itemId },
    data: updateData,
  });
}

/**
 * Manually removes GENERATED grocery items whose source meal-days all fall in
 * the past (issue #206). This is an explicit user action and is NEVER called
 * automatically on regenerate. Rules:
 *   - Checked items are always preserved (the user's progress survives).
 *   - MANUAL items (no source meals) are always preserved.
 *   - Items whose source meals no longer appear in the week's plan (dates are
 *     indeterminate) are preserved — when in doubt, keep.
 *   - Only unchecked items whose known source days are ENTIRELY in the past are
 *     dropped.
 * Past-ness is derived from the MealSuggestion → DayPlan.date relationships that
 * already exist; it does not depend on any per-item day column.
 */
export async function removePastDays(familyId: string, listId: string) {
  const list = await prisma.groceryList.findFirst({
    where: { id: listId, familyId },
    include: { items: true },
  });
  if (!list) {
    throw new GroceryError(404, "Grocery list not found");
  }

  const weekStart = new Date(list.weekStart);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  // Map each meal id to the approved suggestion dates within this list's week.
  const suggestions = await prisma.mealSuggestion.findMany({
    where: {
      approved: true,
      dayPlan: {
        date: { gte: weekStart, lte: weekEnd },
        weekPlan: { familyId },
      },
    },
    include: {
      dayPlan: { select: { date: true } },
      meal: { select: { id: true } },
    },
  });

  const mealDates = new Map<string, Date[]>();
  for (const s of suggestions) {
    const arr = mealDates.get(s.meal.id) ?? [];
    arr.push(s.dayPlan.date);
    mealDates.set(s.meal.id, arr);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const toDelete: string[] = [];
  for (const item of list.items) {
    if (item.checked) continue; // never drop checked progress
    if (item.sourceMealIds.length === 0) continue; // MANUAL / no provenance
    const dates = item.sourceMealIds.flatMap((mid) => mealDates.get(mid) ?? []);
    if (dates.length === 0) continue; // indeterminate — keep when in doubt
    const allPast = dates.every((d) => new Date(d) < today);
    if (allPast) {
      toDelete.push(item.id);
    }
  }

  if (toDelete.length > 0) {
    await prisma.$transaction(
      toDelete.map((id) => prisma.groceryItem.delete({ where: { id } })),
    );
  }

  const refreshed = await prisma.groceryList.findFirst({
    where: { id: listId, familyId },
    include: {
      items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
    },
  });
  return annotatePantryStaples(refreshed, familyId);
}
