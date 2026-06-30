/**
 * API response DTOs — the serialized JSON contracts returned by `packages/api`
 * and consumed by `packages/web` (and, going forward, `packages/mcp`).
 *
 * These are intentionally distinct from the Prisma-shaped domain models in
 * ./index.ts, because the wire shape differs from the runtime/Prisma shape:
 *
 *   - `Date` columns serialize as ISO date **strings**, never `Date`.
 *   - Prisma-optional columns (e.g. `avatarUrl`) serialize as `null`, not
 *     `undefined`/absent — so nullable serialized fields are typed `T | null`,
 *     not `T?`.
 *   - API-key secrets are returned exactly once at creation and never again;
 *     the list shape and the created shape are deliberately different.
 *
 * This is the single source of truth for cross-package API contracts. Keep
 * Prisma/service-internal types inside `packages/api`; serialization to these
 * shapes happens at the Express `res.json()` boundary.
 */

import type { Meal } from "./index.js";

/** A user as embedded in family/membership API responses. `avatarUrl` is a
 *  nullable Prisma column and therefore serializes as `string | null`. */
export interface SerializedUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** A family member with its nested user, as returned by the families API
 *  (`GET /families/:id/members`, join/update-role responses, and nested in
 *  {@link FamilyDTO.members}). `role` is the serialized string value. */
export interface FamilyMemberDTO {
  id: string;
  role: "PARENT" | "CHILD";
  familyId: string;
  userId: string;
  user: SerializedUser;
}

/** A family with its members, as returned by `GET /families`,
 *  `GET /families/:id`, and the create/update endpoints.
 *  `createdAt` is an ISO date string. */
export interface FamilyDTO {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  members: FamilyMemberDTO[];
}

/** An API key as returned by `GET /families/:id/api-keys`. The hashed secret
 *  is never included. `createdAt` is an ISO date string; `lastUsed` is an ISO
 *  date string, or `null` until the key is first used. */
export interface ApiKeyListItemDTO {
  id: string;
  name: string;
  createdAt: string;
  lastUsed: string | null;
}

/** The response from `POST /families/:id/api-keys`. The raw `key` is returned
 *  exactly once, at creation, and never again. There is intentionally no
 *  `lastUsed` field — a freshly created key has never been used — which is why
 *  this is a distinct type from {@link ApiKeyListItemDTO}. */
export interface CreatedApiKeyDTO {
  id: string;
  name: string;
  createdAt: string;
  key: string;
}

/** A meal as returned by `GET /families/:id/meals`. The list endpoint does not
 *  embed the full `ingredients` array; instead it returns an aggregate
 *  `_count.ingredients`. This is the expanded wire shape the meals list renders
 *  against — distinct from the plain {@link Meal} domain model. */
export interface MealListItemDTO extends Meal {
  _count: { ingredients: number };
}

/** The response from `POST /families/:id/meals/import`. */
export interface ImportMealsResultDTO {
  created: number;
  updated: number;
  skipped: number;
  errors: { name: string; error: string }[];
}
