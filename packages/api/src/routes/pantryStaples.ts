import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateJWT, requireRole } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import * as pantryStapleService from "../services/pantryStaples.js";

export const pantryStaplesRouter = Router();

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

const createStapleSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Managed pantry staples routes (issue #205). Family-scoped list of "stock
// kitchen" items that auto-separate matching grocery items into a dedicated
// "Pantry Staples" section. List is member-level (any member views the family's
// staples); create/delete are gated by requireRole(PARENT) — mutating the
// family's managed settings mirrors the grocery-category / template gate.
// ---------------------------------------------------------------------------

// List pantry staples
pantryStaplesRouter.get(
  "/:familyId/pantry-staples",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const staples = await pantryStapleService.listPantryStaples(familyId);
      res.json({ staples });
    } catch {
      res.status(500).json({ error: "Failed to fetch pantry staples" });
    }
  },
);

// Create pantry staple (parents only)
pantryStaplesRouter.post(
  "/:familyId/pantry-staples",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const { name } = createStapleSchema.parse(req.body);
      const familyId = paramStr(req.params.familyId);
      const staple = await pantryStapleService.createPantryStaple(
        familyId,
        name,
      );
      res.status(201).json(staple);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Validation failed", details: error.errors });
        return;
      }
      if (error instanceof pantryStapleService.PantryStapleError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to create pantry staple" });
    }
  },
);

// Delete pantry staple (parents only)
pantryStaplesRouter.delete(
  "/:familyId/pantry-staples/:stapleId",
  authenticateJWT,
  requireMembership,
  requireRole("PARENT"),
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const stapleId = paramStr(req.params.stapleId);
      await pantryStapleService.deletePantryStaple(familyId, stapleId);
      res.status(204).send();
    } catch (error) {
      if (error instanceof pantryStapleService.PantryStapleError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Failed to delete pantry staple" });
    }
  },
);
