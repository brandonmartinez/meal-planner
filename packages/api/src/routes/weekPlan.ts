import { Router, Request, Response } from "express";
import { z } from "zod";
import { Difficulty } from "@prisma/client";
import { authenticateJWT, isParentReq, requireRole } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import * as weekPlanService from "../services/weekPlan.js";
import * as randomPlanService from "../services/randomPlan.js";
import * as weekFillService from "../services/weekFill.js";
import { resolveSuggestionChoicesSchema } from "../schemas/mealChoices.js";
import {
  emitWeekPlanChanged,
  emitSuggestionChanged,
} from "../realtime/index.js";

export const weekPlanRouter = Router();

const addSuggestionSchema = z.object({
  mealId: z.string().min(1),
});

const moveSuggestionSchema = z.object({
  dayPlanId: z.string().min(1),
});

// MCP: schedule a meal by calendar date (no dayPlanId needed).
const scheduleMealSchema = z.object({
  mealId: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

// MCP: bounded pagination for the previous-weeks list.
const previousWeeksQuerySchema = z.object({
  before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "before must be YYYY-MM-DD")
    .optional(),
  limit: z.coerce.number().int().min(1).max(52).optional(),
});

// Copy approved meals from a source week into the target week as new unapproved
// suggestions. `existingMode` (default "error") is the deliberate policy for a
// target week that already has suggestions.
const repeatWeekSchema = z.object({
  sourceWeekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "sourceWeekStart must be YYYY-MM-DD"),
  existingMode: z.enum(["error", "skip", "replace"]).optional(),
});

// Pick an ELIGIBLE meal at random by filters and schedule it by calendar date.
// Body is a JSON object, so arrays/booleans arrive natively (no query-string
// coercion). Filters mirror the meals-list vocabulary; all are optional.
const scheduleRandomSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  tags: z.array(z.string()).optional(),
  difficulty: z.array(z.nativeEnum(Difficulty)).optional(),
  favorite: z.boolean().optional(),
  avoidRecentDays: z.number().int().min(0).optional(),
});

// Fill the OPEN days of the target week with meals chosen at random from the
// eligible catalog, filtered by the random-scheduling vocabulary plus recipe
// `collections`. Every created suggestion is UNAPPROVED. `existingMode`
// (default "error") is the deliberate policy for a target week that already has
// suggestions; `allowPartial` (default true) fills as many open days as the
// eligible pool allows.
const fillWeekSchema = z.object({
  tags: z.array(z.string()).optional(),
  collections: z.array(z.string()).optional(),
  difficulty: z.array(z.nativeEnum(Difficulty)).optional(),
  favorite: z.boolean().optional(),
  avoidRecentDays: z.number().int().min(0).optional(),
  existingMode: z.enum(["error", "skip", "replace"]).optional(),
  allowPartial: z.boolean().optional(),
});

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

function isParentReq(req: Request): boolean {
  const membership = (req as unknown as { membership?: { role: string } })
    .membership;
  return membership?.role === "PARENT";
}

// GET /api/families/:familyId/weeks/current
// MCP-friendly current-week read. Resolves "current" in the family timezone and
// returns a fully-formed week (creating the empty week if it doesn't exist).
// MUST be registered before the `/:weekStart` route so "current" is not matched
// as a weekStart param.
weekPlanRouter.get(
  "/:familyId/weeks/current",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const plan = await weekPlanService.getCurrentWeekPlan(familyId);
      res.json(plan);
    } catch {
      res.status(500).json({ error: "Failed to fetch current week plan" });
    }
  },
);

// GET /api/families/:familyId/weeks?before=YYYY-MM-DD&limit=N
// MCP-friendly previous-weeks read with bounded pagination.
weekPlanRouter.get(
  "/:familyId/weeks",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const { before, limit } = previousWeeksQuerySchema.parse(req.query);
      const weeks = await weekPlanService.getPreviousWeekPlans(familyId, {
        before: before ? new Date(`${before}T00:00:00Z`) : undefined,
        limit,
      });
      res.json({ weeks });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to fetch week plans" });
    }
  },
);

// GET /api/families/:familyId/weeks/:weekStart
weekPlanRouter.get(
  "/:familyId/weeks/:weekStart",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const weekStart = new Date(paramStr(req.params.weekStart) + "T00:00:00Z");

      const plan = await weekPlanService.getWeekPlan(familyId, weekStart);
      if (!plan) {
        res.status(404).json({ error: "Week plan not found" });
        return;
      }
      res.json(plan);
    } catch {
      res.status(500).json({ error: "Failed to fetch week plan" });
    }
  },
);

// POST /api/families/:familyId/weeks/:weekStart
weekPlanRouter.post(
  "/:familyId/weeks/:weekStart",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const weekStart = new Date(paramStr(req.params.weekStart) + "T00:00:00Z");

      const plan = await weekPlanService.getOrCreateWeekPlan(
        familyId,
        weekStart,
      );
      res.json(plan);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "weekStart must be a Monday"
      ) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to create week plan" });
    }
  },
);

// POST /api/families/:familyId/weeks/:weekStart/repeat
// Copy the APPROVED meals from `sourceWeekStart` into the `:weekStart` target
// week as new UNAPPROVED suggestions (preserving the parent approval workflow).
// Body: { sourceWeekStart, existingMode? }. `:weekStart` is the target Monday.
// The distinct `/repeat` suffix keeps this off the `/:weekStart` param routes.
// Always 201: the target week is the created/updated resource, even on a no-op
// empty-source copy (the caller still gets the canonical target week back).
weekPlanRouter.post(
  "/:familyId/weeks/:weekStart/repeat",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const targetWeekStart = new Date(
        paramStr(req.params.weekStart) + "T00:00:00Z",
      );
      const { sourceWeekStart, existingMode } = repeatWeekSchema.parse(req.body);
      const user = req.user as { id: string };

      const plan = await weekPlanService.repeatWeek({
        familyId,
        sourceWeekStart: new Date(`${sourceWeekStart}T00:00:00Z`),
        targetWeekStart,
        userId: user.id,
        existingMode,
      });
      emitWeekPlanChanged(familyId);
      res.status(201).json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to repeat week" });
    }
  },
);

// POST /api/families/:familyId/weeks/:weekStart/fill
// Fill the OPEN days of the target week (a Monday) with meals chosen at random
// from the eligible catalog, filtered by tags/collections/etc., as
// new UNAPPROVED suggestions (issue #115). `existingMode` (default "error") is
// the non-destructive policy for an already-populated target week; `allowPartial`
// (default true) fills as many open days as the eligible pool allows. The
// distinct `/fill` suffix keeps this off the `/:weekStart` param routes. 201 on
// success: the target week is the created/updated resource.
weekPlanRouter.post(
  "/:familyId/weeks/:weekStart/fill",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const weekStart = new Date(paramStr(req.params.weekStart) + "T00:00:00Z");
      const { existingMode, allowPartial, ...filters } = fillWeekSchema.parse(
        req.body,
      );
      const user = req.user as { id: string };

      const plan = await weekFillService.fillWeek({
        familyId,
        weekStart,
        userId: user.id,
        filters,
        existingMode,
        allowPartial,
      });
      emitWeekPlanChanged(familyId);
      res.status(201).json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to fill week" });
    }
  },
);

// POST /api/families/:familyId/schedule
// MCP-friendly scheduling by calendar date. Body: { mealId, date }. The service
// finds/creates the WeekPlan + DayPlan for `date`, so the caller need not
// resolve a dayPlanId first. Any family member may schedule (mirrors the
// day-scoped add-suggestion route); approval remains parent-gated separately.
weekPlanRouter.post(
  "/:familyId/schedule",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const { mealId, date } = scheduleMealSchema.parse(req.body);
      const user = req.user as { id: string };

      const suggestion = await weekPlanService.scheduleMealByDate(
        familyId,
        mealId,
        new Date(`${date}T00:00:00Z`),
        user.id,
      );
      emitSuggestionChanged(familyId);
      res.status(201).json(suggestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to schedule meal" });
    }
  },
);

// POST /api/families/:familyId/schedule/random
// Pick an eligible meal at random (by optional filters) and schedule it onto
// `date` as a new UNAPPROVED suggestion. Any family member may schedule;
// approval remains parent-gated separately. 422 when no meal matches.
weekPlanRouter.post(
  "/:familyId/schedule/random",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const { date, ...filters } = scheduleRandomSchema.parse(req.body);
      const user = req.user as { id: string };

      const suggestion = await randomPlanService.scheduleRandomMeal({
        familyId,
        date: new Date(`${date}T00:00:00Z`),
        userId: user.id,
        filters,
      });
      emitSuggestionChanged(familyId);
      res.status(201).json(suggestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to schedule random meal" });
    }
  },
);

// POST /api/families/:familyId/days/:dayPlanId/suggestions
weekPlanRouter.post(
  "/:familyId/days/:dayPlanId/suggestions",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const dayPlanId = paramStr(req.params.dayPlanId);
      const { mealId } = addSuggestionSchema.parse(req.body);
      const user = req.user as { id: string };

      const suggestion = await weekPlanService.addSuggestion(
        familyId,
        dayPlanId,
        mealId,
        user.id,
      );
      emitSuggestionChanged(familyId);
      res.status(201).json(suggestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to add suggestion" });
    }
  },
);

// PATCH /api/families/:familyId/suggestions/:suggestionId/choices
weekPlanRouter.patch(
  "/:familyId/suggestions/:suggestionId/choices",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const suggestionId = paramStr(req.params.suggestionId);
      const { selections } = resolveSuggestionChoicesSchema.parse(req.body);
      const user = req.user as { id: string };
      const suggestion = await weekPlanService.resolveSuggestionChoices(
        familyId,
        suggestionId,
        selections,
        { id: user.id, isParent: isParentReq(req) },
      );
      emitSuggestionChanged(familyId);
      res.json(suggestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to resolve suggestion choices" });
    }
  },
);

// PATCH /api/families/:familyId/suggestions/:suggestionId/approve
weekPlanRouter.patch(
  "/:familyId/suggestions/:suggestionId/approve",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const suggestionId = paramStr(req.params.suggestionId);
      const user = req.user as { id: string };
      const suggestion = await weekPlanService.approveSuggestion(
        familyId,
        suggestionId,
        { actorType: "user", actorId: user.id },
      );
      emitSuggestionChanged(familyId);
      res.json(suggestion);
    } catch (error) {
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to approve suggestion" });
    }
  },
);

// PATCH /api/families/:familyId/suggestions/:suggestionId/unapprove
weekPlanRouter.patch(
  "/:familyId/suggestions/:suggestionId/unapprove",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const suggestionId = paramStr(req.params.suggestionId);
      const suggestion = await weekPlanService.unapproveSuggestion(
        familyId,
        suggestionId,
      );
      emitSuggestionChanged(familyId);
      res.json(suggestion);
    } catch (error) {
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to unapprove suggestion" });
    }
  },
);

// DELETE /api/families/:familyId/suggestions/:suggestionId
weekPlanRouter.delete(
  "/:familyId/suggestions/:suggestionId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const suggestionId = paramStr(req.params.suggestionId);
      const user = req.user as { id: string };

      await weekPlanService.removeSuggestion(familyId, suggestionId, {
        id: user.id,
        isParent: isParentReq(req),
      });
      emitSuggestionChanged(familyId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof weekPlanService.SuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to remove suggestion" });
    }
  },
);

// PATCH /api/families/:familyId/suggestions/:suggestionId/move
weekPlanRouter.patch(
  "/:familyId/suggestions/:suggestionId/move",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const suggestionId = paramStr(req.params.suggestionId);
      const { dayPlanId } = moveSuggestionSchema.parse(req.body ?? {});
      const user = req.user as { id: string };

      const suggestion = await weekPlanService.moveSuggestion(
        familyId,
        suggestionId,
        dayPlanId,
        { id: user.id, isParent: isParentReq(req) },
      );
      emitSuggestionChanged(familyId);
      res.json(suggestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.MoveSuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to move suggestion" });
    }
  },
);
