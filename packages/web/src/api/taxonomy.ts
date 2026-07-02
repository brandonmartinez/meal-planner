import type { Tag, Category } from '@meal-planner/shared';
import { request } from './client';

// Re-export the shared taxonomy DTOs so components can import Tag/Category from
// this resource module. Single source of truth lives in `@meal-planner/shared`
// (added by #107) — no local duplication.
export type { Tag, Category } from '@meal-planner/shared';

const BASE = '/api/families';

/** List a family's tags. The backend wraps the array in a `{ tags }` envelope
 *  (#107); we unwrap it so callers get a plain `Tag[]`. */
export async function listTags(familyId: string): Promise<Tag[]> {
  const { tags } = await request<{ tags: Tag[] }>(`${BASE}/${familyId}/tags`);
  return tags;
}

/** List a family's categories. Mirrors {@link listTags} — unwraps the
 *  `{ categories }` envelope into a plain `Category[]`. */
export async function listCategories(familyId: string): Promise<Category[]> {
  const { categories } = await request<{ categories: Category[] }>(
    `${BASE}/${familyId}/categories`,
  );
  return categories;
}
