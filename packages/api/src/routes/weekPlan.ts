import { Router, Request, Response } from "express";
import { authenticateJWT, requireRole } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import * as weekPlanService from "../services/weekPlan.js";

export const weekPlanRouter = Router();

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
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
      const dayPlanId = paramStr(req.params.dayPlanId);
      const { mealId } = req.body;
      const user = req.user as { id: string };

      if (!mealId) {
        res.status(400).json({ error: "mealId is required" });
        return;
      }

      const suggestion = await weekPlanService.addSuggestion(
        dayPlanId,
        mealId,
        user.id,
      );
      res.status(201).json(suggestion);
    } catch {
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
      const suggestionId = paramStr(req.params.suggestionId);
      const suggestion = await weekPlanService.approveSuggestion(suggestionId);
      res.json(suggestion);
    } catch {
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
      const suggestionId = paramStr(req.params.suggestionId);
      await weekPlanService.removeSuggestion(suggestionId);
      res.status(204).send();
    } catch {
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
      const suggestionId = paramStr(req.params.suggestionId);
      const { dayPlanId } = req.body ?? {};
      if (typeof dayPlanId !== "string" || dayPlanId.length === 0) {
        res.status(400).json({ error: "dayPlanId is required" });
        return;
      }
      const user = req.user as { id: string };
      const membership = (req as unknown as { membership?: { role: string } })
        .membership;
      const isParent = membership?.role === "PARENT";

      const suggestion = await weekPlanService.moveSuggestion(
        suggestionId,
        dayPlanId,
        { id: user.id, isParent },
      );
      res.json(suggestion);
    } catch (error) {
      if (error instanceof weekPlanService.MoveSuggestionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to move suggestion" });
    }
  },
);
