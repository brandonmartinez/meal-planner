import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateJWT } from '../middleware/auth.js';
import { requireMembership } from '../middleware/membership.js';
import * as groceryService from '../services/grocery.js';
import * as groceryCategoryService from '../services/groceryCategories.js';

export const groceryRouter = Router();

// Family-configurable grocery aisle categories (issue #119). Shape mirrors the
// meal taxonomy create schema so the two stay consistent.
const categoryNameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const patchItemSchema = z
  .object({
    checked: z.boolean().optional(),
    quantity: z.string().optional(),
    unit: z.string().optional(),
    category: z.string().optional(),
  })
  .refine(
    (d) =>
      d.checked !== undefined ||
      d.quantity !== undefined ||
      d.unit !== undefined ||
      d.category !== undefined,
    { message: 'At least one field is required' },
  );

const addItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
});

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || '';
}

// POST /api/families/:familyId/weeks/:weekStart/grocery — generate grocery list
groceryRouter.post(
  '/:familyId/weeks/:weekStart/grocery',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const weekStart = new Date(paramStr(req.params.weekStart) + 'T00:00:00Z');
      const list = await groceryService.generateGroceryList(familyId, weekStart);
      res.status(201).json(list);
    } catch {
      res.status(500).json({ error: 'Failed to generate grocery list' });
    }
  }
);

// GET /api/families/:familyId/weeks/:weekStart/grocery — get grocery list for week
groceryRouter.get(
  '/:familyId/weeks/:weekStart/grocery',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const weekStart = new Date(paramStr(req.params.weekStart) + 'T00:00:00Z');
      const list = await groceryService.getGroceryListByWeek(familyId, weekStart);
      if (!list) {
        res.status(404).json({ error: 'Grocery list not found' });
        return;
      }
      res.json(list);
    } catch {
      res.status(500).json({ error: 'Failed to fetch grocery list' });
    }
  }
);

// GET /api/families/:familyId/grocery/:listId — get grocery list by ID
groceryRouter.get(
  '/:familyId/grocery/:listId',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const listId = paramStr(req.params.listId);
      const list = await groceryService.getGroceryList(listId, familyId);
      if (!list) {
        res.status(404).json({ error: 'Grocery list not found' });
        return;
      }
      res.json(list);
    } catch {
      res.status(500).json({ error: 'Failed to fetch grocery list' });
    }
  }
);

// PATCH /api/families/:familyId/grocery/:listId/items/:itemId — update item fields
groceryRouter.patch(
  '/:familyId/grocery/:listId/items/:itemId',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const listId = paramStr(req.params.listId);
      const itemId = paramStr(req.params.itemId);
      const { checked, quantity, unit, category } = patchItemSchema.parse(req.body);

      let item;
      if (checked !== undefined) {
        item = await groceryService.toggleItem(familyId, listId, itemId, checked);
      }
      if (quantity !== undefined || unit !== undefined || category !== undefined) {
        item = await groceryService.editItemFields(familyId, listId, itemId, {
          quantity,
          unit,
          category,
        });
      }

      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.errors });
        return;
      }
      if (error instanceof groceryService.GroceryError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to update item' });
    }
  }
);

// POST /api/families/:familyId/grocery/:listId/items — add custom item
groceryRouter.post(
  '/:familyId/grocery/:listId/items',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const listId = paramStr(req.params.listId);
      const { name, quantity, unit, category } = addItemSchema.parse(req.body);
      const item = await groceryService.addCustomItem(familyId, listId, { name, quantity, unit, category });
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.errors });
        return;
      }
      if (error instanceof groceryService.GroceryError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to add item' });
    }
  }
);

// DELETE /api/families/:familyId/grocery/:listId/items/:itemId — remove item
groceryRouter.delete(
  '/:familyId/grocery/:listId/items/:itemId',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const listId = paramStr(req.params.listId);
      const itemId = paramStr(req.params.itemId);
      await groceryService.removeItem(familyId, listId, itemId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof groceryService.GroceryError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to remove item' });
    }
  }
);

// ---------------------------------------------------------------------------
// Family-configurable grocery categories (issue #119)
//
// Custom aisle categories layer over the shared INGREDIENT_CATEGORIES defaults.
// The effective list (defaults ∪ custom) drives grocery & meal category selects.
// Management (create/rename/delete) is browser-only (JWT + membership); the
// read-only effective list is additionally exposed on the agent/MCP surface.
// ---------------------------------------------------------------------------

// GET /api/families/:familyId/grocery-categories — effective category list
groceryRouter.get(
  '/:familyId/grocery-categories',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const [categories, custom] = await Promise.all([
        groceryCategoryService.listEffectiveGroceryCategories(familyId),
        groceryCategoryService.listGroceryCategories(familyId),
      ]);
      res.json({ categories, custom });
    } catch {
      res.status(500).json({ error: 'Failed to fetch grocery categories' });
    }
  }
);

// POST /api/families/:familyId/grocery-categories — create a custom category
groceryRouter.post(
  '/:familyId/grocery-categories',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const { name } = categoryNameSchema.parse(req.body);
      const category = await groceryCategoryService.createGroceryCategory(
        familyId,
        name
      );
      res.status(201).json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Failed to create grocery category' });
    }
  }
);

// PATCH /api/families/:familyId/grocery-categories/:categoryId — rename
groceryRouter.patch(
  '/:familyId/grocery-categories/:categoryId',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const categoryId = paramStr(req.params.categoryId);
      const { name } = categoryNameSchema.parse(req.body);
      const category = await groceryCategoryService.renameGroceryCategory(
        familyId,
        categoryId,
        name
      );
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.errors });
        return;
      }
      if (error instanceof Error && error.message === 'Grocery category not found') {
        res.status(404).json({ error: 'Grocery category not found' });
        return;
      }
      // Unique-constraint collision: the new name already exists in the family.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        res.status(409).json({ error: 'A category with that name already exists' });
        return;
      }
      res.status(500).json({ error: 'Failed to rename grocery category' });
    }
  }
);

// DELETE /api/families/:familyId/grocery-categories/:categoryId — delete
groceryRouter.delete(
  '/:familyId/grocery-categories/:categoryId',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const categoryId = paramStr(req.params.categoryId);
      await groceryCategoryService.deleteGroceryCategory(familyId, categoryId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === 'Grocery category not found') {
        res.status(404).json({ error: 'Grocery category not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to delete grocery category' });
    }
  }
);
