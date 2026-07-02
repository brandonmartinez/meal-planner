import { GrocerySource, Prisma } from "@prisma/client";
import prisma from "../config/database.js";

/** Canonical merge key: name+unit, case-folded. Exported for #120 seam. */
export function groceryKey(name: string, unit?: string): string {
  return `${name.toLowerCase()}|${(unit ?? "").toLowerCase()}`;
}

/** Merge two quantity strings. _unit param reserved for #120 normalization. */
export function mergeQuantities(a: string, b: string, _unit?: string): string {
  if (!a) return b;
  if (!b) return a;
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (!isNaN(numA) && !isNaN(numB)) return String(numA + numB);
  return `${a}, ${b}`;
}

interface ComputedItem {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  sources: string[];
  sourceMealIds: string[];
}

export async function generateGroceryList(familyId: string, weekStart: Date) {
  const start = new Date(weekStart);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  // Find all approved meal suggestions for the week
  const suggestions = await prisma.mealSuggestion.findMany({
    where: {
      approved: true,
      dayPlan: {
        date: { gte: start, lte: end },
        weekPlan: { familyId },
      },
    },
    include: {
      meal: {
        include: { ingredients: true },
      },
    },
  });

  // Build computed ingredient map from approved suggestions
  const computedMap = new Map<string, ComputedItem>();
  for (const suggestion of suggestions) {
    for (const ing of suggestion.meal.ingredients) {
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
      } else {
        computedMap.set(key, {
          name: ing.name,
          quantity: ing.quantity || "",
          unit: ing.unit || "",
          category: ing.category || "other",
          sources: [suggestion.meal.name],
          sourceMealIds: [suggestion.meal.id],
        });
      }
    }
  }

  // Fetch or create the grocery list
  const existingList = await prisma.groceryList.findFirst({
    where: { familyId, weekStart: start },
    include: { items: true },
  });

  if (!existingList) {
    // No existing list — create fresh with all GENERATED items
    return prisma.groceryList.create({
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
            origin: GrocerySource.GENERATED,
            edited: false,
          })),
        },
      },
      include: {
        items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
      },
    });
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
            origin: GrocerySource.GENERATED,
            edited: false,
            checked: false,
          },
        }),
      );
    }
  }

  // Handle orphaned GENERATED items (no longer in any meal plan)
  for (const [key, item] of generatedMap.entries()) {
    if (!computedMap.has(key)) {
      if (item.edited) {
        // Promote to MANUAL so user's edits survive
        ops.push(
          prisma.groceryItem.update({
            where: { id: item.id },
            data: { origin: GrocerySource.MANUAL, sourceMealIds: [] },
          }),
        );
      } else {
        // Unedited orphan — delete it
        ops.push(prisma.groceryItem.delete({ where: { id: item.id } }));
      }
    }
  }

  await prisma.$transaction(ops);

  // Return the refreshed list
  return prisma.groceryList.findFirst({
    where: { id: existingList.id, familyId },
    include: {
      items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
    },
  });
}

export async function getGroceryList(listId: string, familyId: string) {
  return prisma.groceryList.findFirst({
    where: { id: listId, familyId },
    include: {
      items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
    },
  });
}

export async function getGroceryListByWeek(familyId: string, weekStart: Date) {
  const start = new Date(weekStart);
  start.setUTCHours(0, 0, 0, 0);

  return prisma.groceryList.findFirst({
    where: { familyId, weekStart: start },
    include: {
      items: { orderBy: [{ category: "asc" }, { name: "asc" }] },
    },
  });
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
