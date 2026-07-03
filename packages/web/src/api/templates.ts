import type {
  PlanningTemplate,
  PlanningTemplateEntry,
  WeekPlan,
  RepeatWeekExistingMode,
} from "@meal-planner/shared";
import { request } from "./client";

// Re-export the shared planning-template DTOs so components can import them from
// this resource module. Single source of truth lives in `@meal-planner/shared`
// (added by #116) — no local duplication.
export type {
  PlanningTemplate,
  PlanningTemplateEntry,
} from "@meal-planner/shared";

const BASE = "/api/families";

/** A relative day→meal entry to send when creating/updating a template. The
 *  backend derives ids server-side, so callers only supply `dayOfWeek`
 *  (0=Monday..6=Sunday) and `mealId`. */
export interface TemplateEntryInput {
  dayOfWeek: number;
  mealId: string;
}

/** List a family's planning templates. The backend wraps the array in a
 *  `{ templates }` envelope (#116); we unwrap it so callers get a plain
 *  `PlanningTemplate[]`. Each template includes its `entries` (relative
 *  day→meal rows); entries carry `mealId` only (no joined meal), so callers
 *  resolve meal names against the family's meal list. */
export async function listTemplates(
  familyId: string,
): Promise<PlanningTemplate[]> {
  const { templates } = await request<{ templates: PlanningTemplate[] }>(
    `${BASE}/${familyId}/templates`,
  );
  return templates;
}

/** Fetch a single template by id. Throws {@link ApiError} with status 404 when
 *  the template does not exist or belongs to another family. */
export async function getTemplate(
  familyId: string,
  templateId: string,
): Promise<PlanningTemplate> {
  return request<PlanningTemplate>(
    `${BASE}/${familyId}/templates/${templateId}`,
  );
}

/** Create a planning template. `entries` default to `[]` (an empty template can
 *  be authored first, then filled in) — but note the backend rejects APPLYING
 *  an empty template with 422. Name collisions surface as a 409 ApiError. */
export async function createTemplate(
  familyId: string,
  data: {
    name: string;
    description?: string | null;
    entries?: TemplateEntryInput[];
  },
): Promise<PlanningTemplate> {
  return request<PlanningTemplate>(`${BASE}/${familyId}/templates`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Update a template's name, description, and/or entries. Supplying `entries`
 *  REPLACES the whole set (the backend does a replace-all in a transaction);
 *  send only what changed. At least one field is required. */
export async function updateTemplate(
  familyId: string,
  templateId: string,
  data: {
    name?: string;
    description?: string | null;
    entries?: TemplateEntryInput[];
  },
): Promise<PlanningTemplate> {
  return request<PlanningTemplate>(
    `${BASE}/${familyId}/templates/${templateId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );
}

/** Delete a template. PARENT-gated on the backend — a 403 is surfaced as an
 *  {@link ApiError} the caller can handle. Returns nothing (204). */
export async function deleteTemplate(
  familyId: string,
  templateId: string,
): Promise<void> {
  return request<void>(`${BASE}/${familyId}/templates/${templateId}`, {
    method: "DELETE",
  });
}

/** Apply a template to a target week, materializing UNAPPROVED meal suggestions
 *  (a parent approves separately). `existingMode` governs what happens when the
 *  target week already has suggestions:
 *  - `'error'` (default) → the backend returns 409 BEFORE any write, so the UI
 *    can surface a clear skip-vs-replace confirmation. NON-DESTRUCTIVE.
 *  - `'skip'` → only fill days that have no existing suggestions.
 *  - `'replace'` → clear ALL of the target week's suggestions first, then apply.
 *
 *  `targetWeekStart` must be a Monday (else the backend returns 400). Applying
 *  an empty template returns 422; a missing/cross-family template returns 404. */
export async function applyTemplate(
  familyId: string,
  templateId: string,
  targetWeekStart: string,
  existingMode?: RepeatWeekExistingMode,
): Promise<WeekPlan> {
  return request<WeekPlan>(
    `${BASE}/${familyId}/templates/${templateId}/apply`,
    {
      method: "POST",
      body: JSON.stringify({ targetWeekStart, existingMode }),
    },
  );
}

/** Convenience: total number of day→meal entries across a template. */
export function templateEntryCount(template: PlanningTemplate): number {
  return template.entries?.length ?? 0;
}

/** Convenience: distinct days (0-6) that a template places at least one meal on. */
export function templateDayCount(template: PlanningTemplate): number {
  const days = new Set<number>();
  for (const e of template.entries ?? ([] as PlanningTemplateEntry[])) {
    days.add(e.dayOfWeek);
  }
  return days.size;
}
