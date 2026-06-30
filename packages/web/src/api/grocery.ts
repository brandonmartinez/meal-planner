import type { GroceryList, GroceryItem } from '@meal-planner/shared';
import { ApiError, request } from './client';

const BASE = '/api/families';

export async function generateGroceryList(familyId: string, weekStart: string): Promise<GroceryList> {
  return request<GroceryList>(`${BASE}/${familyId}/weeks/${weekStart}/grocery`, {
    method: 'POST',
  });
}

export async function getGroceryListByWeek(familyId: string, weekStart: string): Promise<GroceryList | null> {
  try {
    return await request<GroceryList>(`${BASE}/${familyId}/weeks/${weekStart}/grocery`);
  } catch (err) {
    // A week with no generated list yet returns 404 — treat that as "none".
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function toggleGroceryItem(familyId: string, listId: string, itemId: string, checked: boolean): Promise<void> {
  return request<void>(`${BASE}/${familyId}/grocery/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ checked }),
  });
}

export async function addCustomItem(familyId: string, listId: string, data: { name: string; quantity?: string; unit?: string; category?: string }): Promise<GroceryItem> {
  return request<GroceryItem>(`${BASE}/${familyId}/grocery/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeGroceryItem(familyId: string, listId: string, itemId: string): Promise<void> {
  return request<void>(`${BASE}/${familyId}/grocery/${listId}/items/${itemId}`, {
    method: 'DELETE',
  });
}
