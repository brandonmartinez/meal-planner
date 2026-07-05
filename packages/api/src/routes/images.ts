import { Router, Request, Response, NextFunction, raw } from "express";
import prisma from "../config/database.js";
import { authenticateJWT } from "../middleware/auth.js";
import { requireMembership } from "../middleware/membership.js";
import {
  imageStorage,
  sniffImageMime,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "../services/imageStorage.js";

export const imagesRouter = Router();

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

/**
 * Route-scoped raw-body parser for a single binary image upload.
 *
 * We deliberately do NOT add a multipart library: a single raw body with an
 * explicit byte limit is a much smaller attack surface than a multipart
 * parser. The global `express.json()` in index.ts only consumes
 * `application/json`, so an image body reaches this parser untouched.
 *
 * Express's raw() calls next(err) with a PayloadTooLargeError when the limit is
 * exceeded; there is no global error handler in this app, so we translate that
 * (and any other body error) into a clean JSON response here rather than
 * leaking Express's default HTML error page.
 */
function rawImageBody(req: Request, res: Response, next: NextFunction): void {
  raw({ type: () => true, limit: MAX_IMAGE_BYTES })(req, res, (err?: unknown) => {
    if (err) {
      const e = err as { type?: string; status?: number };
      if (e.type === "entity.too.large" || e.status === 413) {
        res.status(413).json({ error: "Image exceeds maximum size" });
        return;
      }
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    next();
  });
}

// Upload an image asset (optionally associated with a meal via ?mealId=).
imagesRouter.post(
  "/:familyId/images",
  authenticateJWT,
  requireMembership,
  rawImageBody,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const mealId = req.query.mealId
        ? paramStr(req.query.mealId as string | string[])
        : null;

      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Empty image body" });
        return;
      }
      if (body.length > MAX_IMAGE_BYTES) {
        res.status(413).json({ error: "Image exceeds maximum size" });
        return;
      }

      // Trust the bytes, not the client's Content-Type header: sniff the magic
      // bytes and derive both the stored contentType and the on-disk extension
      // from the fixed allowlist. A mismatched or unknown payload is rejected.
      const sniffed = sniffImageMime(body);
      if (!sniffed) {
        res.status(400).json({ error: "Unsupported or invalid image format" });
        return;
      }
      const extension = ALLOWED_IMAGE_TYPES[sniffed];

      // Optional meal association must stay inside the family (cross-family
      // isolation) and must not target a placeholder meal (mirrors the
      // meals-service guard).
      if (mealId) {
        const meal = await prisma.meal.findUnique({ where: { id: mealId } });
        if (!meal || meal.familyId !== familyId) {
          res.status(404).json({ error: "Meal not found" });
          return;
        }
        if (meal.placeholderKind !== null) {
          res
            .status(400)
            .json({ error: "Cannot attach image to placeholder meal" });
          return;
        }
      }

      const user = req.user as unknown as { id: string };
      const asset = await prisma.imageAsset.create({
        data: {
          familyId,
          mealId,
          contentType: sniffed,
          extension,
          byteSize: body.length,
          createdBy: user.id,
        },
      });

      try {
        await imageStorage.put(familyId, asset.id, extension, body);
      } catch (err) {
        // Roll the row back if the file write fails so we never leave a
        // dangling DB record pointing at bytes that were never written.
        await prisma.imageAsset.delete({ where: { id: asset.id } }).catch(() => {});
        throw err;
      }

      res.status(201).json({
        id: asset.id,
        mealId: asset.mealId,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        createdAt: asset.createdAt,
      });
    } catch (err) {
      console.error("[images] upload failed", err);
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

// Stream an image asset back by opaque id. Never serves by filesystem path.
imagesRouter.get(
  "/:familyId/images/:assetId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const assetId = paramStr(req.params.assetId);

      const asset = await prisma.imageAsset.findUnique({
        where: { id: assetId },
      });
      // Cross-family isolation: an asset that belongs to another family is
      // indistinguishable from one that does not exist.
      if (!asset || asset.familyId !== familyId) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      let bytes: Buffer;
      try {
        bytes = await imageStorage.get(familyId, asset.id, asset.extension);
      } catch {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      res.setHeader("Content-Type", asset.contentType);
      res.setHeader("Content-Length", String(bytes.length));
      res.send(bytes);
    } catch (err) {
      console.error("[images] fetch failed", err);
      res.status(500).json({ error: "Failed to fetch image" });
    }
  },
);

// Delete an image asset (row + on-disk file).
imagesRouter.delete(
  "/:familyId/images/:assetId",
  authenticateJWT,
  requireMembership,
  async (req: Request, res: Response) => {
    try {
      const familyId = paramStr(req.params.familyId);
      const assetId = paramStr(req.params.assetId);

      const asset = await prisma.imageAsset.findUnique({
        where: { id: assetId },
      });
      if (!asset || asset.familyId !== familyId) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      await prisma.imageAsset.delete({ where: { id: asset.id } });
      await imageStorage.delete(familyId, asset.id, asset.extension);
      res.status(204).end();
    } catch (err) {
      console.error("[images] delete failed", err);
      res.status(500).json({ error: "Failed to delete image" });
    }
  },
);
