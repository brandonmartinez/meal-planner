import type { GroceryList, GroceryItem } from '@meal-planner/shared';

const BASE = '/api/families';

export async function generateGroceryList(familyId: string, weekStart: string): Promise<GroceryList> {
  const res = await fetch(`${BASE}/${familyId}/weeks/${weekStart}/grocery`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to generate grocery list');
  return res.json();
}

export async function getGroceryListByWeek(familyId: string, weekStart: string): Promise<GroceryList | null> {
  const res = await fetch(`${BASE}/${familyId}/weeks/${weekStart}/grocery`, { credentials: 'include' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch grocery list');
  return res.json();
}

export async function toggleGroceryItem(familyId: string, listId: string, itemId: string, checked: boolean): Promise<void> {
  const res = await fetch(`${BASE}/${familyId}/grocery/${listId}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ checked }),
  });
  if (!res.ok) throw new Error('Failed to toggle item');
}

export async function addCustomItem(familyId: string, listId: string, data: { name: string; quantity?: string; unit?: string; category?: string }): Promise<GroceryItem> {
  const res = await fetch(`${BASE}/${familyId}/grocery/${listId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add item');
  return res.json();
}

export async function removeGroceryItem(familyId: string, listId: string, itemId: string): Promise<void> {
  const res = await fetch(`${BASE}/${familyId}/grocery/${listId}/items/${itemId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to remove item');
}
