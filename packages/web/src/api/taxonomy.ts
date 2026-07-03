import type { Tag } from '@meal-planner/shared';
import { request } from './client';

// Re-export the shared taxonomy DTO so components can import Tag from
// this resource module. Single source of truth lives in `@meal-planner/shared`
// (added by #107) — no local duplication.
export type { Tag } from '@meal-planner/shared';

const BASE = '/api/families';

/** List a family's tags. The backend wraps the array in a `{ tags }` envelope
 *  (#107); we unwrap it so callers get a plain `Tag[]`. */
export async function listTags(familyId: string): Promise<Tag[]> {
  const { tags } = await request<{ tags: Tag[] }>(`${BASE}/${familyId}/tags`);
  return tags;
}
