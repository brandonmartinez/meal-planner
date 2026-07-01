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
import type { AgentScope, Difficulty } from "../constants/index.js";

/**
 * The actor type recorded when a suggestion is approved. A family member
 * approves as `"user"`; an MCP agent credential approves as `"agent"`.
 */
export type ApprovalActorType = "user" | "agent";

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

/** A scoped MCP agent credential as returned by
 *  `GET /families/:id/agent-credentials` (issue #6). Metadata only — the
 *  hashed secret is never included, and the raw key is never present on the
 *  list shape. All `Date` columns serialize as ISO strings; `expiresAt`,
 *  `lastUsed`, and `revokedAt` are nullable and serialize as `string | null`.
 *  `scopes` is the set of granted per-operation scopes. */
export interface AgentCredentialListItemDTO {
  id: string;
  name: string;
  scopes: AgentScope[];
  /** User.id of the parent who provisioned the credential. */
  createdBy: string;
  expiresAt: string | null;
  lastUsed: string | null;
  /** Set (ISO string) once the credential is soft-revoked; `null` while live. */
  revokedAt: string | null;
  createdAt: string;
}

/** The response from `POST /families/:id/agent-credentials` (create) and
 *  `POST /families/:id/agent-credentials/:credentialId/rotate` (rotate). The
 *  raw `key` is returned exactly once and never again — there is intentionally
 *  no `lastUsed`/`revokedAt`, which is why this is distinct from
 *  {@link AgentCredentialListItemDTO}. */
export interface CreatedAgentCredentialDTO {
  id: string;
  name: string;
  scopes: AgentScope[];
  /** Raw key — shown to the parent exactly once. Never retrievable again. */
  key: string;
  expiresAt: string | null;
  createdAt: string;
}

/** The response from `DELETE /families/:id/agent-credentials/:credentialId`
 *  (soft revoke). Carries only the id and the revocation timestamp. */
export interface RevokedAgentCredentialDTO {
  id: string;
  revokedAt: string | null;
}

/** A meal as returned by `GET /families/:id/meals`. The list endpoint does not
 *  embed the full `ingredients` array; instead it returns an aggregate
 *  `_count.ingredients`. This is the expanded wire shape the meals list renders
 *  against — distinct from the plain {@link Meal} domain model.
 *
 *  Recent-scheduling metadata (issue #27): a meal is "recent" when it has at
 *  least one **approved** `MealSuggestion` scheduled in the family's current or
 *  immediately previous week, resolved in `Family.timezone`. `lastScheduledOn`
 *  is the calendar date (`YYYY-MM-DD`) of the most recent such approved
 *  suggestion, or `null` when the meal is not recent. */
export interface MealListItemDTO extends Meal {
  _count: { ingredients: number };
  recentlyScheduled: boolean;
  lastScheduledOn: string | null;
}

/** The response from `POST /families/:id/meals/import`. */
export interface ImportMealsResultDTO {
  created: number;
  updated: number;
  skipped: number;
  errors: { name: string; error: string }[];
}

/** A single meal in the CSV-export payload — a real (non-placeholder) meal with
 *  its ingredients. Nullable Prisma columns serialize as `T | null`. Column
 *  order for the CSV is owned by the web `mealsToCSV` serializer so the file
 *  round-trips through the import parser. */
export interface ExportMealDTO {
  name: string;
  description: string | null;
  difficulty: Difficulty | null;
  ingredients: {
    name: string;
    quantity: string | null;
    unit: string | null;
    category: string | null;
  }[];
}

/** The response from `GET /families/:id/meals/export`. */
export interface ExportMealsResponseDTO {
  meals: ExportMealDTO[];
}

/* -------------------------------------------------------------------------- */
/* Week-plan / MCP scheduling contracts                                       */
/*                                                                            */
/* These are the typed wire contracts the MCP server (#5) and the web app     */
/* both consume for reading week plans and scheduling/approving meals. They   */
/* mirror the Prisma `weekPlanInclude` shape after JSON serialization:        */
/* `Date` columns become ISO strings, and nullable Prisma columns serialize   */
/* as `T | null` (never absent/`undefined`).                                  */
/* -------------------------------------------------------------------------- */

/** The user who created a suggestion, as embedded in suggestion responses. */
export interface SuggestedByDTO {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** A single meal suggestion on a day, with its embedded meal and the user who
 *  suggested it. Approval metadata is polymorphic: `approvedByActorType` is the
 *  actor kind, `approvedById` the User.id or AgentCredential.id, both `null`
 *  until approved. `approvedAt`/`createdAt` are ISO date strings. */
export interface MealSuggestionDTO {
  id: string;
  mealId: string;
  dayPlanId: string;
  userId: string;
  approved: boolean;
  approvedByActorType: ApprovalActorType | null;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  meal: Meal;
  suggestedBy: SuggestedByDTO;
}

/** A single day within a week plan, with its ordered suggestions. `date` is an
 *  ISO date string (UTC midnight of the calendar day). */
export interface DayPlanDTO {
  id: string;
  date: string;
  weekPlanId: string;
  suggestions: MealSuggestionDTO[];
}

/** A full week plan with its seven day plans. `weekStart` is always a Monday
 *  (ISO date string); `createdAt`/`updatedAt` are ISO date strings. This is the
 *  shape returned by `GET .../weeks/:weekStart`, `GET .../weeks/current`, and
 *  each entry of `GET .../weeks`. */
export interface WeekPlanDTO {
  id: string;
  weekStart: string;
  familyId: string;
  createdAt: string;
  updatedAt: string;
  days: DayPlanDTO[];
}

/** The response from `GET /families/:id/weeks?before=&limit=` — previous week
 *  plans in reverse-chronological order, bounded by `limit`. */
export interface PreviousWeeksResponseDTO {
  weeks: WeekPlanDTO[];
}

/** The request body for `POST /families/:id/schedule` — schedule a meal onto a
 *  calendar date without first resolving a `dayPlanId`. The service finds (or
 *  creates) the WeekPlan and DayPlan for `date`. `date` is `YYYY-MM-DD`. */
export interface ScheduleMealRequestDTO {
  mealId: string;
  date: string;
}
