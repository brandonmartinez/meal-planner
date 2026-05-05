import prisma from '../config/database.js';

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

  // Collect all ingredients
  const ingredientMap = new Map<string, { name: string; quantity: string; unit: string; category: string }>();

  for (const suggestion of suggestions) {
    for (const ing of suggestion.meal.ingredients) {
      const key = `${ing.name.toLowerCase()}|${(ing.unit || '').toLowerCase()}`;
      const existing = ingredientMap.get(key);
      if (existing) {
        existing.quantity = mergeQuantities(existing.quantity, ing.quantity || '');
      } else {
        ingredientMap.set(key, {
          name: ing.name,
          quantity: ing.quantity || '',
          unit: ing.unit || '',
          category: ing.category || 'other',
        });
      }
    }
  }

  // Delete existing grocery list for this week/family
  const existingList = await prisma.groceryList.findFirst({
    where: { familyId, weekStart: start },
  });
  if (existingList) {
    await prisma.groceryList.delete({ where: { id: existingList.id } });
  }

  // Create new grocery list
  const items = Array.from(ingredientMap.values()).map(ing => ({
    name: ing.name,
    quantity: ing.quantity || null,
    unit: ing.unit || null,
    category: ing.category || null,
  }));

  const list = await prisma.groceryList.create({
    data: {
      familyId,
      weekStart: start,
      items: { create: items },
    },
    include: {
      items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
    },
  });

  return list;
}

function mergeQuantities(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (!isNaN(numA) && !isNaN(numB)) {
    return String(numA + numB);
  }
  return `${a} + ${b}`;
}

export async function getGroceryList(listId: string, familyId: string) {
  return prisma.groceryList.findFirst({
    where: { id: listId, familyId },
    include: {
      items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
    },
  });
}

export async function getGroceryListByWeek(familyId: string, weekStart: Date) {
  const start = new Date(weekStart);
  start.setUTCHours(0, 0, 0, 0);

  return prisma.groceryList.findFirst({
    where: { familyId, weekStart: start },
    include: {
      items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
    },
  });
}

export async function toggleItem(itemId: string, checked: boolean) {
  return prisma.groceryItem.update({
    where: { id: itemId },
    data: { checked },
  });
}

export async function addCustomItem(groceryListId: string, data: { name: string; quantity?: string; unit?: string; category?: string }) {
  return prisma.groceryItem.create({
    data: {
      groceryListId,
      name: data.name,
      quantity: data.quantity || null,
      unit: data.unit || null,
      category: data.category || 'other',
      checked: false,
    },
  });
}

export async function removeItem(itemId: string) {
  return prisma.groceryItem.delete({
    where: { id: itemId },
  });
}
