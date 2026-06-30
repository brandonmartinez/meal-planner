import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateAgent, requireScope } from "../middleware/agentAuth.js";
import {
  AGENT_SCOPES,
  recordAgentAudit,
} from "../services/agentCredential.js";
import * as weekPlanService from "../services/weekPlan.js";

/**
 * MCP agent surface. Mounted at `/api/agent` (NOT `/api/families`) so it has
 * its own rate limiter and never inherits the browser/JWT middleware. Every
 * route is gated by `authenticateAgent` (family scope) + `requireScope`
 * (per-operation grant). The handler records the allowed/denied audit entry
 * with concrete target resource ids; the middleware records auth/scope denials.
 *
 * Agents may ONLY read/schedule/approve meal plans. There is intentionally no
 * agent route for members, roles, invites, API keys, auth/session, OAuth, or
 * secrets — those surfaces live under `/api/families` and `/api/auth` behind
 * the JWT chain and are unreachable with an agent credential.
 */
export const agentRouter = Router();

const addSuggestionSchema = z.object({
  mealId: z.string().min(1),
});

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

// GET /api/agent/:familyId/weeks/:weekStart  — scope: meal_plan:read
agentRouter.get(
  "/:familyId/weeks/:weekStart",
  authenticateAgent,
  requireScope(AGENT_SCOPES.READ),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    try {
      const weekStart = new Date(paramStr(req.params.weekStart) + "T00:00:00Z");
      const plan = await weekPlanService.getWeekPlan(familyId, weekStart);
      if (!plan) {
        await recordAgentAudit({
          credentialId: agent.id,
          familyId,
          action: AGENT_SCOPES.READ,
          outcome: "denied",
          targetType: "weekPlan",
          reason: "not_found",
        });
        res.status(404).json({ error: "Week plan not found" });
        return;
      }
      await recordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.READ,
        outcome: "allowed",
        targetType: "weekPlan",
        targetIds: [plan.id],
      });
      res.json(plan);
    } catch {
      res.status(500).json({ error: "Failed to fetch week plan" });
    }
  },
);

// POST /api/agent/:familyId/days/:dayPlanId/suggestions — scope: meal_plan:schedule
agentRouter.post(
  "/:familyId/days/:dayPlanId/suggestions",
  authenticateAgent,
  requireScope(AGENT_SCOPES.SCHEDULE),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    const dayPlanId = paramStr(req.params.dayPlanId);
    try {
      const { mealId } = addSuggestionSchema.parse(req.body);

      // Attribute `suggestedBy` to the provisioning parent; the audit trail
      // records the agent credential as the true actor.
      const suggestion = await weekPlanService.addSuggestion(
        familyId,
        dayPlanId,
        mealId,
        agent.createdBy,
      );
      await recordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.SCHEDULE,
        outcome: "allowed",
        targetType: "mealSuggestion",
        targetIds: [suggestion.id, dayPlanId, mealId],
      });
      res.status(201).json(suggestion);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.SuggestionError) {
        await recordAgentAudit({
          credentialId: agent.id,
          familyId,
          action: AGENT_SCOPES.SCHEDULE,
          outcome: "denied",
          targetType: "mealSuggestion",
          targetIds: [dayPlanId],
          reason: `error_${error.status}`,
        });
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to add suggestion" });
    }
  },
);

// PATCH /api/agent/:familyId/suggestions/:suggestionId/approve — scope: meal_plan:approve
agentRouter.patch(
  "/:familyId/suggestions/:suggestionId/approve",
  authenticateAgent,
  requireScope(AGENT_SCOPES.APPROVE),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    const suggestionId = paramStr(req.params.suggestionId);
    try {
      const suggestion = await weekPlanService.approveSuggestion(
        familyId,
        suggestionId,
        { actorType: "agent", actorId: agent.id },
      );
      await recordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.APPROVE,
        outcome: "allowed",
        targetType: "mealSuggestion",
        targetIds: [suggestionId],
      });
      res.json(suggestion);
    } catch (error) {
      if (error instanceof weekPlanService.SuggestionError) {
        await recordAgentAudit({
          credentialId: agent.id,
          familyId,
          action: AGENT_SCOPES.APPROVE,
          outcome: "denied",
          targetType: "mealSuggestion",
          targetIds: [suggestionId],
          reason: `error_${error.status}`,
        });
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to approve suggestion" });
    }
  },
);
