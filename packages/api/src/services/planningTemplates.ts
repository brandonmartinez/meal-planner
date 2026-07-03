import { Prisma } from "@prisma/client";
import prisma from "../config/database.js";
import {
  getOrCreateWeekPlan,
  type RepeatWeekExistingMode,
} from "./weekPlan.js";

/**
 * Domain error for planning-template operations. Carries an HTTP status so
 * routes can map known failures (not-found / bad-input / conflict /
 * unprocessable) to the right code instead of a generic 500. Mirrors
 * {@link SuggestionError} in weekPlan.ts.
 */
export class TemplateError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

/** Case-insensitive uniqueness key for a planning template — a template is
 *  unique per family by this value while `name` preserves display casing.
 *  Mirrors the recipe-collection / taxonomy `normalizeName` convention. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Entry payload accepted when creating/replacing template entries. `dayOfWeek`
 *  is a RELATIVE offset (0=Monday .. 6=Sunday), NOT a calendar date. */
export interface TemplateEntryInput {
  dayOfWeek: number;
  mealId: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  entries: TemplateEntryInput[];
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  entries?: TemplateEntryInput[];
}

export interface ApplyTemplateParams {
  familyId: string;
  templateId: string;
  targetWeekStart: Date;
  userId: string;
  existingMode?: RepeatWeekExistingMode;
}

const templateInclude = Prisma.validator<Prisma.PlanningTemplateInclude>()({
  entries: {
    orderBy: [{ dayOfWeek: "asc" }, { mealId: "asc" }],
  },
});

/** Validate `dayOfWeek` is an integer in 0..6 (Monday..Sunday). */
function assertValidDayOfWeek(dayOfWeek: number): void {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new TemplateError(
      400,
      "dayOfWeek must be an integer between 0 (Monday) and 6 (Sunday)",
    );
  }
}

/** Dedupe entry inputs by the `(dayOfWeek, mealId)` uniqueness key so a caller
 *  can't trip the `@@unique([templateId, dayOfWeek, mealId])` constraint.
 *  Validates each `dayOfWeek` and returns the deduped list. */
function dedupeEntries(entries: TemplateEntryInput[]): TemplateEntryInput[] {
  const seen = new Set<string>();
  const out: TemplateEntryInput[] = [];
  for (const entry of entries) {
    assertValidDayOfWeek(entry.dayOfWeek);
    const key = `${entry.dayOfWeek}:${entry.mealId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ dayOfWeek: entry.dayOfWeek, mealId: entry.mealId });
  }
  return out;
}

/** Assert every referenced meal exists and belongs to `familyId`. A meal from
 *  another family (or a bogus id) yields a 404 so cross-family references are
 *  indistinguishable from missing — no template can ever point at meals it does
 *  not own. */
async function assertMealsInFamily(
  tx: Prisma.TransactionClient,
  familyId: string,
  mealIds: string[],
): Promise<void> {
  if (mealIds.length === 0) return;
  const unique = [...new Set(mealIds)];
  const found = await tx.meal.findMany({
    where: { id: { in: unique }, familyId },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new TemplateError(404, "One or more meals not found");
  }
}

/** List every planning template for a family, entries included, sorted by
 *  display name. Family-scoped. */
export async function listTemplates(familyId: string) {
  return prisma.planningTemplate.findMany({
    where: { familyId },
    orderBy: { name: "asc" },
    include: templateInclude,
  });
}

/** Fetch a single template by id, scoped to the family. Returns `null` when the
 *  template does not exist OR belongs to another family — callers map `null` to
 *  a 404 so cross-family reads are indistinguishable from missing. */
export async function getTemplate(familyId: string, templateId: string) {
  return prisma.planningTemplate.findFirst({
    where: { id: templateId, familyId },
    include: templateInclude,
  });
}

/** Create a planning template with its entries in one transaction. Normalizes
 *  the name (case-insensitive unique per family — a collision throws 409),
 *  validates every entry meal is family-scoped, and dedupes entries. */
export async function createTemplate(
  familyId: string,
  input: CreateTemplateInput,
) {
  const nameNormalized = normalizeName(input.name);
  if (!nameNormalized) {
    throw new TemplateError(400, "Template name cannot be empty");
  }
  const entries = dedupeEntries(input.entries);

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertMealsInFamily(
        tx,
        familyId,
        entries.map((e) => e.mealId),
      );
      return tx.planningTemplate.create({
        data: {
          name: input.name.trim(),
          nameNormalized,
          description: input.description ?? null,
          familyId,
          entries: {
            create: entries.map((e) => ({
              dayOfWeek: e.dayOfWeek,
              mealId: e.mealId,
            })),
          },
        },
        include: templateInclude,
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new TemplateError(
        409,
        "A template with this name already exists in this family",
      );
    }
    throw error;
  }
}

/** Update a template's `name`, `description`, and/or `entries`, scoped to the
 *  family. Passing `entries` REPLACES the entire entry set (delete-all +
 *  recreate) — mirrors the taxonomy/instructions replace-all convention. A
 *  cross-family or missing template yields 404; a name collision yields 409. */
export async function updateTemplate(
  familyId: string,
  templateId: string,
  input: UpdateTemplateInput,
) {
  const data: Prisma.PlanningTemplateUpdateInput = {};
  if (input.name !== undefined) {
    const nameNormalized = normalizeName(input.name);
    if (!nameNormalized) {
      throw new TemplateError(400, "Template name cannot be empty");
    }
    data.name = input.name.trim();
    data.nameNormalized = nameNormalized;
  }
  if (input.description !== undefined) {
    data.description = input.description;
  }

  const entries =
    input.entries !== undefined ? dedupeEntries(input.entries) : undefined;

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.planningTemplate.findFirst({
        where: { id: templateId, familyId },
        select: { id: true },
      });
      if (!existing) {
        throw new TemplateError(404, "Template not found");
      }

      if (entries !== undefined) {
        await assertMealsInFamily(
          tx,
          familyId,
          entries.map((e) => e.mealId),
        );
        await tx.planningTemplateEntry.deleteMany({
          where: { templateId: existing.id },
        });
        if (entries.length > 0) {
          await tx.planningTemplateEntry.createMany({
            data: entries.map((e) => ({
              templateId: existing.id,
              dayOfWeek: e.dayOfWeek,
              mealId: e.mealId,
            })),
          });
        }
      }

      return tx.planningTemplate.update({
        where: { id: existing.id },
        data,
        include: templateInclude,
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new TemplateError(
        409,
        "A template with this name already exists in this family",
      );
    }
    throw error;
  }
}

/** Delete a template by id, scoped to the family. Throws a 404 `TemplateError`
 *  when the template does not belong to the family (cross-family delete is
 *  impossible). Entries cascade. */
export async function deleteTemplate(
  familyId: string,
  templateId: string,
): Promise<void> {
  const result = await prisma.planningTemplate.deleteMany({
    where: { id: templateId, familyId },
  });
  if (result.count === 0) {
    throw new TemplateError(404, "Template not found");
  }
}

/**
 * Apply a template to a target week, materializing its entries as UNAPPROVED
 * `MealSuggestion` rows so the result flows through the SAME parent approval
 * workflow as `repeatWeek` / `scheduleMeal` (every created row starts
 * `approved: false` with `suggestedBy = userId`). Blueprint: {@link repeatWeek}.
 *
 * `targetWeekStart` must be a Monday (UTC-midnight) or 400. The template is
 * loaded family-scoped; a missing/cross-family template is 404 and an empty
 * template (no entries) is 422. Each entry's `dayOfWeek` (0=Mon..6=Sun) maps
 * directly to the target day at that offset from the target Monday.
 *
 * `existingMode` (default "error") is the deliberate policy for a target week
 * that already contains suggestions — mirrors {@link RepeatWeekExistingMode}.
 */
export async function applyTemplate(params: ApplyTemplateParams) {
  const { familyId, templateId, userId } = params;
  const existingMode: RepeatWeekExistingMode = params.existingMode ?? "error";

  const target = new Date(params.targetWeekStart);
  target.setUTCHours(0, 0, 0, 0);
  if (target.getUTCDay() !== 1) {
    throw new TemplateError(400, "targetWeekStart must be a Monday");
  }

  const template = await prisma.planningTemplate.findFirst({
    where: { id: templateId, familyId },
    include: templateInclude,
  });
  if (!template) {
    throw new TemplateError(404, "Template not found");
  }
  if (template.entries.length === 0) {
    throw new TemplateError(422, "Template has no entries to apply");
  }

  // Ensure the target week exists with its 7 days. `create` is keyed on
  // familyId, so a cross-family target is impossible.
  const targetWeek = await getOrCreateWeekPlan(familyId, target);

  // Index target days by their offset from the target Monday (0=Mon..6=Sun).
  const targetDayByOffset = new Map<number, (typeof targetWeek.days)[number]>();
  for (const day of targetWeek.days) {
    const dayDate = new Date(day.date);
    dayDate.setUTCHours(0, 0, 0, 0);
    const offset = Math.round((dayDate.getTime() - target.getTime()) / MS_PER_DAY);
    targetDayByOffset.set(offset, day);
  }

  const targetHasSuggestions = targetWeek.days.some(
    (d) => d.suggestions.length > 0,
  );
  if (existingMode === "error" && targetHasSuggestions) {
    throw new TemplateError(
      409,
      "Target week already has suggestions; retry with existingMode 'skip' or 'replace'",
    );
  }

  const rows: Prisma.MealSuggestionCreateManyInput[] = [];
  for (const entry of template.entries) {
    const targetDay = targetDayByOffset.get(entry.dayOfWeek);
    if (!targetDay) continue; // defensive: offsets 0..6 always exist
    if (existingMode === "skip" && targetDay.suggestions.length > 0) {
      continue;
    }
    rows.push({
      dayPlanId: targetDay.id,
      mealId: entry.mealId,
      userId,
      approved: false,
    });
  }

  const targetDayIds = targetWeek.days.map((d) => d.id);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (existingMode === "replace") {
      await tx.mealSuggestion.deleteMany({
        where: { dayPlanId: { in: targetDayIds } },
      });
    }
    if (rows.length > 0) {
      await tx.mealSuggestion.createMany({ data: rows });
    }
  });

  // Re-fetch so the returned week reflects the newly created suggestions.
  return getOrCreateWeekPlan(familyId, target);
}
