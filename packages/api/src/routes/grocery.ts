import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { requireMembership } from '../middleware/membership.js';
import * as groceryService from '../services/grocery.js';

export const groceryRouter = Router();

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
      const itemId = paramStr(req.params.itemId);
      const { checked } = req.body;
      if (typeof checked !== 'boolean') {
        res.status(400).json({ error: 'checked must be a boolean' });
        return;
      }
      const item = await groceryService.toggleItem(itemId, checked);
      res.json(item);
    } catch {
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
      const listId = paramStr(req.params.listId);
      const { name, quantity, unit, category } = req.body;
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const item = await groceryService.addCustomItem(listId, { name, quantity, unit, category });
      res.status(201).json(item);
    } catch {
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
      const itemId = paramStr(req.params.itemId);
      await groceryService.removeItem(itemId);
      res.status(204).send();
    } catch {
      res.status(500).json({ error: 'Failed to remove item' });
    }
  }
);
