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

function iconFor(kind: string | null): string | null {
  if (!kind) return null;
  const meta = MEAL_PLACEHOLDERS[kind as MealPlaceholderKind];
  return meta ? meta.emoji : null;
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
          imageUrl: m.imageUrl,
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
