import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateAgent, requireScope } from "../middleware/agentAuth.js";
import {
  AGENT_SCOPES,
  recordAgentAudit,
} from "../services/agentCredential.js";
import * as weekPlanService from "../services/weekPlan.js";
import * as mealService from "../services/meals.js";

/**
 * MCP agent surface. Mounted at `/api/agent` (NOT `/api/families`) so it has
 * its own rate limiter and never inherits the browser/JWT middleware. Every
 * route is gated by `authenticateAgent` (family scope) + `requireScope`
 * (per-operation grant). The handler records the allowed/denied audit entry
 * with concrete target resource ids; the middleware records auth/scope denials.
 *
 * Agents may ONLY read/schedule/approve meal plans (and read the family's meal
 * catalog to choose what to schedule). There is intentionally no agent route
 * for members, roles, invites, API keys, auth/session, OAuth, or secrets —
 * those surfaces live under `/api/families` and `/api/auth` behind the JWT
 * chain and are unreachable with an agent credential.
 */
export const agentRouter = Router();

const addSuggestionSchema = z.object({
  mealId: z.string().min(1),
});

// MCP: schedule a meal by calendar date (no dayPlanId needed).
const scheduleMealSchema = z.object({
  mealId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

// MCP: bounded pagination for the previous-weeks list.
const previousWeeksQuerySchema = z.object({
  before: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "before must be YYYY-MM-DD")
    .optional(),
  limit: z.coerce.number().int().min(1).max(52).optional(),
});

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

// GET /api/agent/:familyId/meals — scope: meal_plan:read
// Lists the family's meals (with the #27 recently-scheduled indicator) so an
// agent can pick a meal to schedule. Read-only; no meal mutation surface is
// exposed to agents.
agentRouter.get(
  "/:familyId/meals",
  authenticateAgent,
  requireScope(AGENT_SCOPES.READ),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    try {
      const search =
        typeof req.query.search === "string" ? req.query.search : undefined;
      const meals = await mealService.listMeals(familyId, { search });
      await recordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.READ,
        outcome: "allowed",
        targetType: "meal",
        targetIds: meals.map((m) => m.id),
      });
      res.json(meals);
    } catch {
      res.status(500).json({ error: "Failed to fetch meals" });
    }
  },
);

// GET /api/agent/:familyId/weeks/current — scope: meal_plan:read
// MCP-friendly current-week read. Resolves "current" in the family timezone and
// returns a fully-formed week (creating the empty week if it doesn't exist).
// MUST be registered before the `/:weekStart` route so "current" is not matched
// as a weekStart param.
agentRouter.get(
  "/:familyId/weeks/current",
  authenticateAgent,
  requireScope(AGENT_SCOPES.READ),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    try {
      const plan = await weekPlanService.getCurrentWeekPlan(familyId);
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
      res.status(500).json({ error: "Failed to fetch current week plan" });
    }
  },
);

// GET /api/agent/:familyId/weeks?before=YYYY-MM-DD&limit=N — scope: meal_plan:read
// MCP-friendly previous-weeks read with bounded pagination. MUST be registered
// before `/:weekStart` (the bare `/weeks` collection path is distinct, but this
// keeps all `/weeks*` reads grouped ahead of the param route).
agentRouter.get(
  "/:familyId/weeks",
  authenticateAgent,
  requireScope(AGENT_SCOPES.READ),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    try {
      const { before, limit } = previousWeeksQuerySchema.parse(req.query);
      const weeks = await weekPlanService.getPreviousWeekPlans(familyId, {
        before: before ? new Date(`${before}T00:00:00Z`) : undefined,
        limit,
      });
      await recordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.READ,
        outcome: "allowed",
        targetType: "weekPlan",
        targetIds: weeks.map((w) => w.id),
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

// POST /api/agent/:familyId/schedule — scope: meal_plan:schedule
// MCP-friendly scheduling by calendar date. Body: { mealId, date }. The service
// finds/creates the WeekPlan + DayPlan for `date`, so the agent need not resolve
// a dayPlanId first. `suggestedBy` is attributed to the provisioning parent; the
// audit trail records the agent credential as the true actor.
agentRouter.post(
  "/:familyId/schedule",
  authenticateAgent,
  requireScope(AGENT_SCOPES.SCHEDULE),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    try {
      const { mealId, date } = scheduleMealSchema.parse(req.body);
      const suggestion = await weekPlanService.scheduleMealByDate(
        familyId,
        mealId,
        new Date(`${date}T00:00:00Z`),
        agent.createdBy,
      );
      await recordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.SCHEDULE,
        outcome: "allowed",
        targetType: "mealSuggestion",
        targetIds: [suggestion.id, mealId],
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
          targetIds: [mealId],
          reason: `error_${error.status}`,
        });
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to schedule meal" });
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
