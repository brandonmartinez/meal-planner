import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateJWT } from '../middleware/auth.js';
import { requireMembership } from '../middleware/membership.js';
import * as groceryService from '../services/grocery.js';

export const groceryRouter = Router();

const toggleItemSchema = z.object({
  checked: z.boolean(),
});

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

// PATCH /api/families/:familyId/grocery/:listId/items/:itemId — toggle checked
groceryRouter.patch(
  '/:familyId/grocery/:listId/items/:itemId',
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const listId = paramStr(req.params.listId);
      const itemId = paramStr(req.params.itemId);
      const { checked } = toggleItemSchema.parse(req.body);
      const item = await groceryService.toggleItem(familyId, listId, itemId, checked);
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
      res.status(500).json({ error: 'Failed to toggle item' });
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
