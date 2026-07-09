import type { PantryStaple } from '@meal-planner/shared';
import { request } from './client';

// Re-export the shared DTO so components can import PantryStaple from this
// resource module. Single source of truth lives in `@meal-planner/shared` (#205).
export type { PantryStaple } from '@meal-planner/shared';

const BASE = '/api/families';

/**
 * List a family's managed pantry staples (issue #205). The backend wraps the
 * result in a `{ staples }` envelope; this helper unwraps the array. Any family
 * member may read; mutations below require a PARENT.
 */
export async function listPantryStaples(familyId: string): Promise<PantryStaple[]> {
  const { staples } = await request<{ staples: PantryStaple[] }>(
    `${BASE}/${familyId}/pantry-staples`,
  );
  return staples;
}

export async function createPantryStaple(familyId: string, name: string): Promise<PantryStaple> {
  return request<PantryStaple>(`${BASE}/${familyId}/pantry-staples`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function deletePantryStaple(familyId: string, stapleId: string): Promise<void> {
  return request<void>(`${BASE}/${familyId}/pantry-staples/${stapleId}`, {
    method: 'DELETE',
  });
}
