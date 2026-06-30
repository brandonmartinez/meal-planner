import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateJWT, requireRole } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import * as weekPlanService from "../services/weekPlan.js";

export const weekPlanRouter = Router();

const addSuggestionSchema = z.object({
  mealId: z.string().min(1),
});

const moveSuggestionSchema = z.object({
  dayPlanId: z.string().min(1),
});

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

function isParentReq(req: Request): boolean {
  const membership = (req as unknown as { membership?: { role: string } })
    .membership;
  return membership?.role === "PARENT";
}

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
      const suggestion = await weekPlanService.approveSuggestion(
        familyId,
        suggestionId,
      );
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
