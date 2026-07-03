import type { RecipeCollection } from "@meal-planner/shared";
import { request } from "./client";

// Re-export the shared collection DTO so components can import RecipeCollection
// from this resource module. Single source of truth lives in
// `@meal-planner/shared` (added by #109) — no local duplication.
export type { RecipeCollection } from "@meal-planner/shared";

const BASE = "/api/families";

/** List a family's recipe collections. The backend wraps the array in a
 *  `{ collections }` envelope (#109); we unwrap it so callers get a plain
 *  `RecipeCollection[]`. */
export async function listCollections(
  familyId: string,
): Promise<RecipeCollection[]> {
  const { collections } = await request<{ collections: RecipeCollection[] }>(
    `${BASE}/${familyId}/collections`,
  );
  return collections;
}

/** Fetch a single collection by id. Throws {@link ApiError} with status 404
 *  when the collection does not exist. */
export async function getCollection(
  familyId: string,
  collectionId: string,
): Promise<RecipeCollection> {
  return request<RecipeCollection>(
    `${BASE}/${familyId}/collections/${collectionId}`,
  );
}

/** Create a collection. `description` is an optional curated blurb. */
export async function createCollection(
  familyId: string,
  data: { name: string; description?: string | null },
): Promise<RecipeCollection> {
  return request<RecipeCollection>(`${BASE}/${familyId}/collections`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Update a collection's name and/or description. The backend requires at
 *  least one field; callers should send only what changed. */
export async function updateCollection(
  familyId: string,
  collectionId: string,
  data: { name?: string; description?: string | null },
): Promise<RecipeCollection> {
  return request<RecipeCollection>(
    `${BASE}/${familyId}/collections/${collectionId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );
}

/** Delete a collection. PARENT-gated on the backend — a 403 is surfaced as an
 *  {@link ApiError} the caller can handle. Returns nothing (204). */
export async function deleteCollection(
  familyId: string,
  collectionId: string,
): Promise<void> {
  return request<void>(`${BASE}/${familyId}/collections/${collectionId}`, {
    method: "DELETE",
  });
}
