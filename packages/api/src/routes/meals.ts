import { Router, Request, Response } from "express";
import { z } from "zod";
import { MEAL_DIFFICULTIES } from "@meal-planner/shared";
import { authenticateJWT, requireRole } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import * as mealService from "../services/meals.js";
import * as taxonomyService from "../services/taxonomy.js";
import * as collectionService from "../services/recipeCollections.js";
import { imageUrlSchema, listMealsQuerySchema } from "../schemas/meals.js";

export const mealsRouter = Router();

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

// Re-exported from schemas/meals.ts so both the REST route and the agent route
// share one validator. See that file for the http(s) scheme-allowlist rationale. #103.
export { imageUrlSchema };

/** A single ordered preparation step (issue #100). `text` is required;
 *  `timerMinutes` is an optional non-negative countdown for the step. Order is
 *  taken from array position, not encoded here. */
const instructionInputSchema = z.object({
  text: z.string().min(1),
  timerMinutes: z.number().int().min(0).nullable().optional(),
});

export const createMealSchema = z.object({
  name: z.string().min(1),
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
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  collections: z.array(z.string()).optional(),
  instructions: z.array(instructionInputSchema).optional(),
});

export const updateMealSchema = z.object({
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
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  collections: z.array(z.string()).optional(),
  instructions: z.array(instructionInputSchema).optional(),
});

const importMealsSchema = z.object({
  mode: z.enum(["skip", "replace"]).optional(),
  meals: z
    .array(
      z.object({
        name: z.string().min(1),
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
        tags: z.array(z.string()).optional(),
        categories: z.array(z.string()).optional(),
        collections: z.array(z.string()).optional(),
        instructions: z.array(instructionInputSchema).optional(),
      }),
    )
    .min(1)
    .max(500),
});

// Family-scoped create for a single tag/category. Name is trimmed & non-empty;
// case-insensitive uniqueness is enforced in the service via nameNormalized.
const taxonomyCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// Recipe collection create/update bodies (issue #109). A collection is a curated,
// family-scoped list a meal can belong to; `description` is an optional blurb.
const collectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
});

const collectionUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => d.name !== undefined || d.description !== undefined, {
    message: "At least one of name or description is required",
  });

// List meals for a family
mealsRouter.get(
  "/:familyId/meals",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const parsed = listMealsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
        return;
      }
      const result = await mealService.listMeals(familyId, parsed.data);
      res.json(result);
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

// ---------------------------------------------------------------------------
// Taxonomy routes (tags + categories). Family-scoped; needed by the tags UI
// (#108). List is available to any member; create/delete require meal:write,
// which for JWT users maps to family membership (parents & children can both
// manage the family catalog, matching meal create/update).
// ---------------------------------------------------------------------------

// List tags
mealsRouter.get(
  "/:familyId/tags",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const tags = await taxonomyService.listTags(familyId);
      res.json({ tags });
    } catch {
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  },
);

// Create tag
mealsRouter.post(
  "/:familyId/tags",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = taxonomyCreateSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const tag = await taxonomyService.createTag(familyId, data.name);
      res.status(201).json(tag);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to create tag" });
    }
  },
);

// Delete tag
mealsRouter.delete(
  "/:familyId/tags/:tagId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const tagId = paramStr(req.params.tagId);
      await taxonomyService.deleteTag(familyId, tagId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === "Tag not found") {
        res.status(404).json({ error: "Tag not found" });
        return;
      }
      res.status(500).json({ error: "Failed to delete tag" });
    }
  },
);

// List categories
mealsRouter.get(
  "/:familyId/categories",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const categories = await taxonomyService.listCategories(familyId);
      res.json({ categories });
    } catch {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  },
);

// Create category
mealsRouter.post(
  "/:familyId/categories",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = taxonomyCreateSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const category = await taxonomyService.createCategory(
        familyId,
        data.name,
      );
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to create category" });
    }
  },
);

// Delete category
mealsRouter.delete(
  "/:familyId/categories/:categoryId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const categoryId = paramStr(req.params.categoryId);
      await taxonomyService.deleteCategory(familyId, categoryId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === "Category not found") {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      res.status(500).json({ error: "Failed to delete category" });
    }
  },
);

// ---------------------------------------------------------------------------
// Recipe collection routes (issue #109). Family-scoped curated lists. List /
// get / create / update are member-level (parents & children both curate the
// family catalog, matching the tags/categories convention). DELETE is gated by
// requireRole(PARENT): removing a curated collection is more consequential than
// dropping a single tag, so it matches the meal-delete gate rather than the
// tag-delete one.
// ---------------------------------------------------------------------------

// List collections
mealsRouter.get(
  "/:familyId/collections",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const collections = await collectionService.listCollections(familyId);
      res.json({ collections });
    } catch {
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  },
);

// Create collection
mealsRouter.post(
  "/:familyId/collections",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = collectionCreateSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const collection = await collectionService.createCollection(
        familyId,
        data.name,
        data.description,
      );
      res.status(201).json(collection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      res.status(500).json({ error: "Failed to create collection" });
    }
  },
);

// Get collection detail
mealsRouter.get(
  "/:familyId/collections/:collectionId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const collectionId = paramStr(req.params.collectionId);
      const collection = await collectionService.getCollection(
        familyId,
        collectionId,
      );
      if (!collection) {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      res.json(collection);
    } catch {
      res.status(500).json({ error: "Failed to fetch collection" });
    }
  },
);

// Update collection
mealsRouter.patch(
  "/:familyId/collections/:collectionId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const data = collectionUpdateSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const collectionId = paramStr(req.params.collectionId);
      const collection = await collectionService.updateCollection(
        familyId,
        collectionId,
        data,
      );
      res.json(collection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof Error && error.message === "Collection not found") {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      res.status(500).json({ error: "Failed to update collection" });
    }
  },
);

// Delete collection (parents only)
mealsRouter.delete(
  "/:familyId/collections/:collectionId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const collectionId = paramStr(req.params.collectionId);
      await collectionService.deleteCollection(familyId, collectionId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === "Collection not found") {
        res.status(404).json({ error: "Collection not found" });
        return;
      }
      res.status(500).json({ error: "Failed to delete collection" });
    }
  },
);
