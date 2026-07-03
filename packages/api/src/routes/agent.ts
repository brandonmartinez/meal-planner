import { Router, Request, Response } from "express";
import { z } from "zod";
import { Difficulty } from "@prisma/client";
import {
  INGREDIENT_CATEGORIES,
  MEAL_DIFFICULTIES,
} from "@meal-planner/shared";
import { authenticateAgent, requireScope } from "../middleware/agentAuth.js";
import {
  AGENT_SCOPES,
  safeRecordAgentAudit,
} from "../services/agentCredential.js";
import * as weekPlanService from "../services/weekPlan.js";
import * as randomPlanService from "../services/randomPlan.js";
import * as mealService from "../services/meals.js";
import * as collectionService from "../services/recipeCollections.js";
import * as templateService from "../services/planningTemplates.js";
import * as groceryService from "../services/grocery.js";
import { imageUrlSchema, listMealsQuerySchema } from "../schemas/meals.js";

/**
 * MCP agent surface. Mounted at `/api/agent` (NOT `/api/families`) so it has
 * its own rate limiter and never inherits the browser/JWT middleware. Every
 * route is gated by `authenticateAgent` (family scope) + `requireScope`
 * (per-operation grant). The handler records the allowed/denied audit entry
 * with concrete target resource ids; the middleware records auth/scope denials.
 *
 * Agents may read/schedule/approve meal plans, read the family's meal catalog,
 * create/edit meals in that catalog (meal:write), and read the current-week
 * grocery list. There is intentionally no agent route for members, roles,
 * invites, API keys, auth/session, OAuth, or secrets — those surfaces live
 * under `/api/families` and `/api/auth` behind the JWT chain and are
 * unreachable with an agent credential. There is deliberately no meal DELETE.
 *
 * Routes come in two shapes: legacy `/:familyId/*` routes cross-check the path
 * family against the credential, while the family-from-key routes (`/me`,
 * `/meals`, `/grocery/current`) derive the family from the key alone — the
 * basis for a hosted, multi-tenant MCP server.
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

// MCP: copy approved meals from a source week into the target week as new
// unapproved suggestions. `existingMode` (default "error") is the deliberate
// policy for a target week that already has suggestions.
const repeatWeekSchema = z.object({
  sourceWeekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "sourceWeekStart must be YYYY-MM-DD"),
  existingMode: z.enum(["error", "skip", "replace"]).optional(),
});

// MCP: apply a family-scoped planning template into a target week as new
// UNAPPROVED suggestions. `targetWeekStart` must be a Monday; `existingMode`
// (default "error") is the deliberate policy for a target week that already has
// suggestions. Applying a template IS scheduling — reuses meal_plan:schedule.
const applyTemplateSchema = z.object({
  targetWeekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "targetWeekStart must be YYYY-MM-DD"),
  existingMode: z.enum(["error", "skip", "replace"]).optional(),
});

// MCP: pick an ELIGIBLE meal at random by filters and schedule it by calendar
// date. Body is a JSON object, so arrays/booleans arrive natively (no query-
// string coercion). Filters mirror the meals-list vocabulary; all are optional.
const scheduleRandomSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  difficulty: z.array(z.nativeEnum(Difficulty)).optional(),
  favorite: z.boolean().optional(),
  avoidRecentDays: z.number().int().min(0).optional(),
});

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

// --- Family-from-key routes (no `:familyId` segment) ----------------------
// These derive the family from the presented agent key alone (via
// `authenticateAgent`, which authenticates purely from the key when the route
// carries no `:familyId`). This is what lets a HOSTED MCP server operate
// without a family id ever being configured or passed into a tool.

// Meal catalog write shape an AI produces after parsing a recipe (CSV / scan /
// pasted text). Parsing/OCR is the calling model's job — we only accept the
// structured result and validate it at the boundary.
const ingredientInputSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  category: z.enum(INGREDIENT_CATEGORIES).optional(),
});

const instructionInputSchema = z.object({
  text: z.string().min(1),
  timerMinutes: z.number().int().min(0).nullable().optional(),
});

const createMealSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: imageUrlSchema.nullable().optional(),
  difficulty: z.enum(MEAL_DIFFICULTIES).optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  servings: z.number().int().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  notes: z.string().optional(),
  favorite: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  ingredients: z.array(ingredientInputSchema).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  collections: z.array(z.string()).optional(),
  instructions: z.array(instructionInputSchema).optional(),
});

const updateMealSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    difficulty: z.enum(MEAL_DIFFICULTIES).nullable().optional(),
    prepTimeMinutes: z.number().int().min(0).nullable().optional(),
    cookTimeMinutes: z.number().int().min(0).nullable().optional(),
    servings: z.number().int().min(1).nullable().optional(),
    sourceUrl: z.string().url().nullable().optional(),
    notes: z.string().nullable().optional(),
    favorite: z.boolean().optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    ingredients: z.array(ingredientInputSchema).optional(),
    tags: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    collections: z.array(z.string()).optional(),
    instructions: z.array(instructionInputSchema).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

// GET /api/agent/me — any valid credential; no scope required.
// Resolves the family + granted scopes for the presented key so the hosted MCP
// server can bind its tools to that family. Authenticated purely from the key
// (no `:familyId` in the path). The read is audited.
agentRouter.get(
  "/me",
  authenticateAgent,
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    await safeRecordAgentAudit({
      credentialId: agent.id,
      familyId: agent.familyId,
      action: "identify",
      outcome: "allowed",
      targetType: "agent",
      targetIds: [agent.id],
    });
    res.json({
      familyId: agent.familyId,
      scopes: agent.scopes,
      name: agent.name,
    });
  },
);

// POST /api/agent/meals — scope: meal:write
// Create a meal in the family resolved from the key. Full shape: name,
// description?, difficulty?, ingredients[]. Distinct from meal-plan scheduling.
agentRouter.post(
  "/meals",
  authenticateAgent,
  requireScope(AGENT_SCOPES.WRITE),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    try {
      const data = createMealSchema.parse(req.body);
      const meal = await mealService.createMeal(agent.familyId, data);
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId: agent.familyId,
        action: AGENT_SCOPES.WRITE,
        outcome: "allowed",
        targetType: "meal",
        targetIds: [meal.id],
      });
      res.status(201).json(meal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to create meal" });
    }
  },
);

// PATCH /api/agent/meals/:mealId — scope: meal:write
// Edit a meal in the family resolved from the key. Preserves service guardrails:
// a meal from another family yields 404 (no existence leak); a placeholder meal
// cannot be edited (403). Both denials are audited with the target meal id.
agentRouter.patch(
  "/meals/:mealId",
  authenticateAgent,
  requireScope(AGENT_SCOPES.WRITE),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const mealId = paramStr(req.params.mealId);
    try {
      const data = updateMealSchema.parse(req.body);
      const meal = await mealService.updateMeal(mealId, agent.familyId, data);
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId: agent.familyId,
        action: AGENT_SCOPES.WRITE,
        outcome: "allowed",
        targetType: "meal",
        targetIds: [mealId],
      });
      res.json(meal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      const message = error instanceof Error ? error.message : "";
      if (message === "Meal not found") {
        await safeRecordAgentAudit({
          credentialId: agent.id,
          familyId: agent.familyId,
          action: AGENT_SCOPES.WRITE,
          outcome: "denied",
          targetType: "meal",
          targetIds: [mealId],
          reason: "not_found",
        });
        res.status(404).json({ error: "Meal not found" });
        return;
      }
      if (message === "Cannot modify placeholder meal") {
        await safeRecordAgentAudit({
          credentialId: agent.id,
          familyId: agent.familyId,
          action: AGENT_SCOPES.WRITE,
          outcome: "denied",
          targetType: "meal",
          targetIds: [mealId],
          reason: "placeholder",
        });
        res.status(403).json({ error: "Cannot modify placeholder meal" });
        return;
      }
      res.status(500).json({ error: "Failed to update meal" });
    }
  },
);

// GET /api/agent/grocery/current — scope: meal_plan:read
// Returns the family's CURRENT-week grocery list, resolving "this week"
// Monday-anchored in the family timezone (same as get_current_week_plan).
// Behavior: generates the list on demand from approved suggestions when none
// exists yet (more useful for an agent asking "what do I need to buy"), else
// returns the stored list.
agentRouter.get(
  "/grocery/current",
  authenticateAgent,
  requireScope(AGENT_SCOPES.READ),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    try {
      const { monday } = await weekPlanService.getCurrentWeekStart(
        agent.familyId,
      );
      let list = await groceryService.getGroceryListByWeek(
        agent.familyId,
        monday,
      );
      if (!list) {
        list = await groceryService.generateGroceryList(agent.familyId, monday);
      }
      if (!list) {
        res.status(404).json({ error: "No grocery list available for this week" });
        return;
      }
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId: agent.familyId,
        action: AGENT_SCOPES.READ,
        outcome: "allowed",
        targetType: "groceryList",
        targetIds: [list.id],
      });
      res.json(list);
    } catch {
      res.status(500).json({ error: "Failed to fetch grocery list" });
    }
  },
);

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
      const parsed = listMealsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
        return;
      }
      const result = await mealService.listMeals(familyId, parsed.data);
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.READ,
        outcome: "allowed",
        targetType: "meal",
        targetIds: result.items.map((m) => m.id),
      });
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to fetch meals" });
    }
  },
);

// GET /api/agent/:familyId/collections — scope: meal_plan:read
// Lists the family's recipe collections (issue #109) so an agent can reference
// them by id/name when curating meals. Read-only; there is intentionally no
// agent create/update/delete surface for collections.
agentRouter.get(
  "/:familyId/collections",
  authenticateAgent,
  requireScope(AGENT_SCOPES.READ),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    try {
      const collections = await collectionService.listCollections(familyId);
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.READ,
        outcome: "allowed",
        targetType: "collection",
        targetIds: collections.map((c) => c.id),
      });
      res.json({ collections });
    } catch {
      res.status(500).json({ error: "Failed to fetch collections" });
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
      await safeRecordAgentAudit({
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
      await safeRecordAgentAudit({
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
        await safeRecordAgentAudit({
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
      await safeRecordAgentAudit({
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
    let mealId: string | undefined;
    try {
      const parsed = scheduleMealSchema.parse(req.body);
      mealId = parsed.mealId;
      const suggestion = await weekPlanService.scheduleMealByDate(
        familyId,
        mealId,
        new Date(`${parsed.date}T00:00:00Z`),
        agent.createdBy,
      );
      await safeRecordAgentAudit({
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
        await safeRecordAgentAudit({
          credentialId: agent.id,
          familyId,
          action: AGENT_SCOPES.SCHEDULE,
          outcome: "denied",
          targetType: "mealSuggestion",
          targetIds: mealId ? [mealId] : [],
          reason: `error_${error.status}`,
        });
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to schedule meal" });
    }
  },
);

// POST /api/agent/:familyId/schedule/random — scope: meal_plan:schedule
// Pick an ELIGIBLE meal at random (by optional filters) and schedule it onto
// `date` as a new UNAPPROVED suggestion. Reuses meal_plan:schedule — random-pick
// + schedule IS scheduling. `suggestedBy` is attributed to the provisioning
// parent; the audit trail records the agent credential as the true actor.
agentRouter.post(
  "/:familyId/schedule/random",
  authenticateAgent,
  requireScope(AGENT_SCOPES.SCHEDULE),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    try {
      const { date, ...filters } = scheduleRandomSchema.parse(req.body);
      const suggestion = await randomPlanService.scheduleRandomMeal({
        familyId,
        date: new Date(`${date}T00:00:00Z`),
        userId: agent.createdBy,
        filters,
      });
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.SCHEDULE,
        outcome: "allowed",
        targetType: "mealSuggestion",
        targetIds: [suggestion.id, suggestion.mealId],
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
        await safeRecordAgentAudit({
          credentialId: agent.id,
          familyId,
          action: AGENT_SCOPES.SCHEDULE,
          outcome: "denied",
          targetType: "mealSuggestion",
          targetIds: [],
          reason: `error_${error.status}`,
        });
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to schedule random meal" });
    }
  },
);

// POST /api/agent/:familyId/weeks/:weekStart/repeat — scope: meal_plan:schedule
// Copy the APPROVED meals from `sourceWeekStart` into the `:weekStart` target
// week as new UNAPPROVED suggestions (preserving the parent approval workflow).
// Reuses meal_plan:schedule — copying unapproved suggestions IS scheduling.
// `suggestedBy` is attributed to the provisioning parent; the audit trail
// records the agent credential as the true actor.
agentRouter.post(
  "/:familyId/weeks/:weekStart/repeat",
  authenticateAgent,
  requireScope(AGENT_SCOPES.SCHEDULE),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    const targetWeekStart = paramStr(req.params.weekStart);
    let sourceWeekStart: string | undefined;
    try {
      const parsed = repeatWeekSchema.parse(req.body);
      sourceWeekStart = parsed.sourceWeekStart;
      const plan = await weekPlanService.repeatWeek({
        familyId,
        sourceWeekStart: new Date(`${sourceWeekStart}T00:00:00Z`),
        targetWeekStart: new Date(`${targetWeekStart}T00:00:00Z`),
        userId: agent.createdBy,
        existingMode: parsed.existingMode,
      });
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.SCHEDULE,
        outcome: "allowed",
        targetType: "weekPlan",
        targetIds: [targetWeekStart, sourceWeekStart],
      });
      res.status(201).json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof weekPlanService.SuggestionError) {
        await safeRecordAgentAudit({
          credentialId: agent.id,
          familyId,
          action: AGENT_SCOPES.SCHEDULE,
          outcome: "denied",
          targetType: "weekPlan",
          targetIds: sourceWeekStart
            ? [targetWeekStart, sourceWeekStart]
            : [targetWeekStart],
          reason: `error_${error.status}`,
        });
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to repeat week" });
    }
  },
);
// GET /api/agent/:familyId/templates — scope: meal_plan:read
// List the family's reusable planning templates (with entries). Read-only,
// family-scoped. Authoring (create/edit/delete) is browser-JWT-only by design.
agentRouter.get(
  "/:familyId/templates",
  authenticateAgent,
  requireScope(AGENT_SCOPES.READ),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    try {
      const templates = await templateService.listTemplates(familyId);
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.READ,
        outcome: "allowed",
        targetType: "planningTemplate",
        targetIds: templates.map((t) => t.id),
      });
      res.json({ templates });
    } catch {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  },
);

// POST /api/agent/:familyId/templates/:templateId/apply — scope: meal_plan:schedule
// Apply a planning template into a target week as new UNAPPROVED suggestions
// (preserving the parent approval workflow). Reuses meal_plan:schedule —
// materializing unapproved suggestions IS scheduling. `suggestedBy` is
// attributed to the provisioning parent; the audit trail records the agent
// credential as the true actor.
agentRouter.post(
  "/:familyId/templates/:templateId/apply",
  authenticateAgent,
  requireScope(AGENT_SCOPES.SCHEDULE),
  async (req: Request, res: Response) => {
    const agent = req.agent!;
    const familyId = paramStr(req.params.familyId);
    const templateId = paramStr(req.params.templateId);
    try {
      const parsed = applyTemplateSchema.parse(req.body);
      const plan = await templateService.applyTemplate({
        familyId,
        templateId,
        targetWeekStart: new Date(`${parsed.targetWeekStart}T00:00:00Z`),
        userId: agent.createdBy,
        existingMode: parsed.existingMode,
      });
      await safeRecordAgentAudit({
        credentialId: agent.id,
        familyId,
        action: AGENT_SCOPES.SCHEDULE,
        outcome: "allowed",
        targetType: "planningTemplate",
        targetIds: [templateId, parsed.targetWeekStart],
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
        await safeRecordAgentAudit({
          credentialId: agent.id,
          familyId,
          action: AGENT_SCOPES.SCHEDULE,
          outcome: "denied",
          targetType: "planningTemplate",
          targetIds: [templateId],
          reason: `error_${error.status}`,
        });
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to apply template" });
    }
  },
);
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
      await safeRecordAgentAudit({
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
        await safeRecordAgentAudit({
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
      await safeRecordAgentAudit({
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
        await safeRecordAgentAudit({
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
