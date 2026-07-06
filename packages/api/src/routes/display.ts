import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { authenticateApiKey } from "../middleware/auth.js";
import prisma from "../config/database.js";
import {
  formatDateInTz,
  getDisplayDays,
  getMondayOfWeek,
  isValidTimezone,
  type DisplayDayResult,
} from "../services/weekPlan.js";
import {
  MEAL_PLACEHOLDERS,
  type DisplayMealsResponse,
  type MealPlaceholderKind,
} from "@meal-planner/shared";
import { sendDisplayError } from "../utils/displayError.js";
import { imageStorage } from "../services/imageStorage.js";
import { ASSET_PATH_RE, isAbsoluteHttpUrl } from "../schemas/meals.js";

export const displayRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z
  .object({
    from: z.string().regex(DATE_RE).optional(),
    to: z.string().regex(DATE_RE).optional(),
    days: z.coerce.number().int().min(1).max(60).optional(),
    weekStart: z.string().regex(DATE_RE).optional(),
    tz: z.string().min(1).max(64).optional(),
  })
  .refine(
    (v) => (v.from && v.to) || (!v.from && !v.to),
    { message: "from and to must be provided together" },
  );

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val || "";
}

function iconFor(kind: string | null): string | null {
  if (!kind) return null;
  const meta = MEAL_PLACEHOLDERS[kind as MealPlaceholderKind];
  return meta ? meta.emoji : null;
}

/**
 * Rewrite a stored imageUrl for the display surface.
 *
 * Uploaded asset references are rewritten to the API-key-accessible display
 * route (`/api/display/images/{assetId}`), in BOTH stored forms:
 *   - relative: `/api/families/{familyId}/images/{assetId}`
 *   - absolute: `https://{host}/api/families/{familyId}/images/{assetId}`
 *
 * The absolute form matters because the JWT-protected `/api/families/.../images/...`
 * route 401s for the Magic Mirror (which authenticates by API key, not JWT), and
 * the browser surfaces that 401 as a CORS error. We match on path SHAPE (via the
 * WHATWG `URL` parser + `ASSET_PATH_RE` against `pathname`) so the rewrite is
 * robust to staging/prod host differences, and carry only the `assetId` forward —
 * family scoping is enforced by the API key on the display route. #201
 *
 * Genuine external/third-party image URLs (whose path does not match the asset
 * shape) pass through unchanged; `null` stays `null`.
 */
function rewriteDisplayImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;

  // Relative uploaded-asset path — rewrite to the API-key display route.
  // Safe: ASSET_PATH_RE guarantees the last segment is the assetId.
  if (ASSET_PATH_RE.test(imageUrl)) {
    const assetId = imageUrl.split("/").pop()!;
    return `/api/display/images/${assetId}`;
  }

  // Absolute http(s) URL whose PATH matches the uploaded-asset shape — rewrite
  // by assetId regardless of host. isAbsoluteHttpUrl already parsed it safely,
  // so `new URL()` here cannot throw.
  if (isAbsoluteHttpUrl(imageUrl)) {
    const { pathname } = new URL(imageUrl);
    if (ASSET_PATH_RE.test(pathname)) {
      const assetId = pathname.split("/").pop()!;
      return `/api/display/images/${assetId}`;
    }
  }

  // Genuine external URL (or anything else) — pass through unchanged.
  return imageUrl;
}

// GET /api/display/meals
displayRouter.get(
  "/meals",
  authenticateApiKey,
  async (req: Request, res: Response) => {
    const familyId = req.familyId!;

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      sendDisplayError(
        res,
        400,
        "INVALID_QUERY",
        parsed.error.issues[0]?.message ?? "Invalid query parameters",
      );
      return;
    }
    const { from, to, days, weekStart, tz: tzParam } = parsed.data;

    let family;
    try {
      family = await prisma.family.findUnique({
        where: { id: familyId },
        select: { id: true, name: true, timezone: true },
      });
    } catch {
      sendDisplayError(res, 500, "INTERNAL_ERROR", "Failed to load family");
      return;
    }
    if (!family) {
      sendDisplayError(res, 500, "INTERNAL_ERROR", "Family not found");
      return;
    }

    // Resolve timezone: explicit ?tz= > family.timezone > "UTC".
    let tz = "UTC";
    if (tzParam) {
      if (!isValidTimezone(tzParam)) {
        sendDisplayError(
          res,
          400,
          "INVALID_TIMEZONE",
          `Unknown IANA timezone: ${tzParam}`,
        );
        return;
      }
      tz = tzParam;
    } else if (family.timezone && isValidTimezone(family.timezone)) {
      tz = family.timezone;
    }

    let startDate: Date;
    let endDate: Date;

    try {
      if (from && to) {
        startDate = new Date(from + "T00:00:00Z");
        endDate = new Date(to + "T00:00:00Z");
        if (endDate.getTime() < startDate.getTime()) {
          sendDisplayError(
            res,
            400,
            "INVALID_DATE_RANGE",
            "`to` must not be earlier than `from`",
          );
          return;
        }
      } else if (days) {
        // Anchor to "today" in the resolved timezone.
        const todayLabel = formatDateInTz(new Date(), tz);
        startDate = new Date(todayLabel + "T00:00:00Z");
        endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + Number(days) - 1);
      } else if (weekStart) {
        startDate = new Date(weekStart + "T00:00:00Z");
        endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + 6);
      } else {
        // Default: current week in the resolved tz, anchored on Monday.
        const todayLabel = formatDateInTz(new Date(), tz);
        const today = new Date(todayLabel + "T00:00:00Z");
        startDate = getMondayOfWeek(today);
        endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + 6);
      }
    } catch {
      sendDisplayError(res, 400, "INVALID_DATE_RANGE", "Invalid date range");
      return;
    }

    let result: { days: DisplayDayResult[]; maxUpdatedAt: Date | null };
    try {
      result = await getDisplayDays(familyId, startDate, endDate, tz);
    } catch {
      sendDisplayError(
        res,
        500,
        "INTERNAL_ERROR",
        "Failed to fetch display meals",
      );
      return;
    }

    const responseBody: DisplayMealsResponse = {
      family: {
        id: family.id,
        name: family.name,
        timezone: tz,
      },
      meals: result.days.map((d) => ({
        date: d.date,
        dayOfWeek: d.dayOfWeek,
        status: d.status,
        meals: d.meals.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          placeholderKind: m.placeholderKind as MealPlaceholderKind | null,
          icon: iconFor(m.placeholderKind),
          imageUrl: rewriteDisplayImageUrl(m.imageUrl),
        })),
      })),
    };

    // Strong ETag: hash of the inputs that determine the response body.
    const etagSeed = [
      familyId,
      startDate.toISOString(),
      endDate.toISOString(),
      tz,
      result.maxUpdatedAt?.toISOString() ?? "none",
    ].join("|");
    const etag =
      '"' +
      crypto.createHash("sha256").update(etagSeed).digest("hex") +
      '"';

    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("ETag", etag);
    res.setHeader("Vary", "x-api-key");

    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res.json(responseBody);
  },
);

// GET /api/display/images/:assetId
// Serves uploaded meal images to the Magic Mirror display surface.
// Guarded by API key; derives family from the key (no familyId in the path).
displayRouter.get(
  "/images/:assetId",
  authenticateApiKey,
  async (req: Request, res: Response) => {
    const familyId = req.familyId!;
    const assetId = paramStr(req.params["assetId"]);

    const asset = await prisma.imageAsset
      .findUnique({
        where: { id: assetId },
        select: { id: true, familyId: true, extension: true, contentType: true },
      })
      .catch(() => null);

    if (!asset || asset.familyId !== familyId) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    // ETag: deterministic hash of stable, immutable asset fields.
    const etagSeed = [familyId, asset.id, asset.extension].join("|");
    const etag =
      '"' + crypto.createHash("sha256").update(etagSeed).digest("hex") + '"';

    const ifNoneMatch = req.headers["if-none-match"];
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.setHeader("Vary", "x-api-key");
      res.status(304).end();
      return;
    }

    let bytes: Buffer;
    try {
      bytes = await imageStorage.get(familyId, asset.id, asset.extension);
    } catch (err) {
      console.error("[display] image storage failed", { assetId: asset.id }, err);
      res.status(404).json({ error: "Image not found" });
      return;
    }

    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Vary", "x-api-key");
    res.send(bytes);
  },
);
