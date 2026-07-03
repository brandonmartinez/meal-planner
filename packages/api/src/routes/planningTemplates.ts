import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateJWT, requireRole } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import * as templateService from "../services/planningTemplates.js";

export const planningTemplatesRouter = Router();

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

/** A single template entry: a meal placed on a relative day of the week.
 *  `dayOfWeek` is 0=Monday .. 6=Sunday — an offset from the target week's
 *  Monday, NOT a calendar date. */
const entrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  mealId: z.string().min(1),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  entries: z.array(entrySchema).default([]),
});

const updateTemplateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    entries: z.array(entrySchema).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });

// `existingMode` (default "error") is the deliberate policy for a target week
// that already contains suggestions — mirrors the repeat-week route.
const applyTemplateSchema = z.object({
  targetWeekStart: z.string().min(1),
  existingMode: z.enum(["error", "skip", "replace"]).optional(),
});

// ---------------------------------------------------------------------------
// Planning template routes (issue #116). Family-scoped, reusable week planning
// templates. List / get / create / update are member-level (parents & children
// both curate the family's planning templates, matching the collections
// convention). DELETE is gated by requireRole(PARENT) — removing a curated
// template mirrors the collection-delete gate. Applying a template creates
// UNAPPROVED MealSuggestion rows, respecting the same approval workflow as
// scheduling / repeat-week.
// ---------------------------------------------------------------------------

// List templates
planningTemplatesRouter.get(
  "/:familyId/templates",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const templates = await templateService.listTemplates(familyId);
      res.json({ templates });
    } catch {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  },
);

// Create template
planningTemplatesRouter.post(
  "/:familyId/templates",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = createTemplateSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const template = await templateService.createTemplate(familyId, data);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof templateService.TemplateError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to create template" });
    }
  },
);

// Get template detail
planningTemplatesRouter.get(
  "/:familyId/templates/:templateId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const templateId = paramStr(req.params.templateId);
      const template = await templateService.getTemplate(familyId, templateId);
      if (!template) {
        res.status(404).json({ error: "Template not found" });
        return;
      }
      res.json(template);
    } catch {
      res.status(500).json({ error: "Failed to fetch template" });
    }
  },
);

// Update template (replaces entries when `entries` supplied)
planningTemplatesRouter.patch(
  "/:familyId/templates/:templateId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = updateTemplateSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const templateId = paramStr(req.params.templateId);
      const template = await templateService.updateTemplate(
        familyId,
        templateId,
        data,
      );
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof templateService.TemplateError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to update template" });
    }
  },
);

// Delete template (parents only)
planningTemplatesRouter.delete(
  "/:familyId/templates/:templateId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const templateId = paramStr(req.params.templateId);
      await templateService.deleteTemplate(familyId, templateId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof templateService.TemplateError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to delete template" });
    }
  },
);

// Apply template → creates UNAPPROVED suggestions into the target week
planningTemplatesRouter.post(
  "/:familyId/templates/:templateId/apply",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const { targetWeekStart, existingMode } = applyTemplateSchema.parse(
        req.body,
      );
      const familyId = paramStr(req.params.familyId);
      const templateId = paramStr(req.params.templateId);
      const user = req.user as { id: string };

      const plan = await templateService.applyTemplate({
        familyId,
        templateId,
        targetWeekStart: new Date(`${targetWeekStart}T00:00:00Z`),
        userId: user.id,
        existingMode,
      });
      res.status(201).json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof templateService.TemplateError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to apply template" });
    }
  },
);
