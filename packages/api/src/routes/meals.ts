import { Router, Request, Response } from "express";
import { z } from "zod";
import { MEAL_DIFFICULTIES } from "@meal-planner/shared";
import { authenticateJWT, requireRole } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import * as mealService from "../services/meals.js";

export const mealsRouter = Router();

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

export const createMealSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  difficulty: z.enum(MEAL_DIFFICULTIES).nullable().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.string().optional(),
        unit: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .optional(),
});

export const updateMealSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  difficulty: z.enum(MEAL_DIFFICULTIES).nullable().optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.string().optional(),
        unit: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .optional(),
});

const importMealsSchema = z.object({
  mode: z.enum(["skip", "replace"]).optional(),
  meals: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        difficulty: z.enum(MEAL_DIFFICULTIES).nullable().optional(),
        ingredients: z
          .array(
            z.object({
              name: z.string().min(1),
              quantity: z.string().optional(),
              unit: z.string().optional(),
              category: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1)
    .max(500),
});

// List meals for a family
mealsRouter.get(
  "/:familyId/meals",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const search = req.query.search ? String(req.query.search) : undefined;
      const meals = await mealService.listMeals(familyId, { search });
      res.json(meals);
    } catch {
      res.status(500).json({ error: "Failed to fetch meals" });
    }
  },
);

// Create meal
mealsRouter.post(
  "/:familyId/meals",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = createMealSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const meal = await mealService.createMeal(familyId, data);
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

// Import meals (bulk)
mealsRouter.post(
  "/:familyId/meals/import",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = importMealsSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const result = await mealService.importMeals(familyId, data.meals, {
        mode: data.mode,
      });
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to import meals" });
    }
  },
);

// Export all (non-placeholder) meals with ingredients for CSV download
mealsRouter.get(
  "/:familyId/meals/export",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const meals = await mealService.exportMeals(familyId);
      res.json({ meals });
    } catch {
      res.status(500).json({ error: "Failed to export meals" });
    }
  },
);

// Get meal detail
mealsRouter.get(
  "/:familyId/meals/:mealId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const mealId = paramStr(req.params.mealId);
      const meal = await mealService.getMealById(mealId, familyId);
      if (!meal) {
        res.status(404).json({ error: "Meal not found" });
        return;
      }
      res.json(meal);
    } catch {
      res.status(500).json({ error: "Failed to fetch meal" });
    }
  },
);

// Update meal
mealsRouter.put(
  "/:familyId/meals/:mealId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = updateMealSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const mealId = paramStr(req.params.mealId);
      const meal = await mealService.updateMeal(mealId, familyId, data);
      res.json(meal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof Error && error.message === "Meal not found") {
        res.status(404).json({ error: "Meal not found" });
        return;
      }
      res.status(500).json({ error: "Failed to update meal" });
    }
  },
);

// Delete meal (parents only)
mealsRouter.delete(
  "/:familyId/meals/:mealId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const mealId = paramStr(req.params.mealId);
      await mealService.deleteMeal(mealId, familyId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "Meal not found") {
          res.status(404).json({ error: "Meal not found" });
          return;
        }
        if (error.message.includes("approved suggestions")) {
          res.status(409).json({ error: error.message });
          return;
        }
      }
      res.status(500).json({ error: "Failed to delete meal" });
    }
  },
);
