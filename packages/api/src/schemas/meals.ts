import { z } from "zod";
import { Difficulty } from "@prisma/client";

/**
 * Shared query schema for the meals list endpoint. Consumed by both:
 *   - `GET /api/families/:familyId/meals`  (authenticateJWT → requireMembership)
 *   - `GET /api/agent/:familyId/meals`     (authenticateAgent → requireScope)
 *
 * Semantics: OR-within-facet (all difficulty[]/tags[] values are OR'd within
 * their facet), AND-across-facets (search AND difficulty[] AND tags[] all
 * apply). Placeholder meals are excluded from results whenever any search/filter
 * param is active; unfiltered pagination includes them.
 */
/**
 * Same-origin read path for an uploaded image asset, e.g.
 * `/api/families/{familyId}/images/{assetId}`. Produced by the web upload flow
 * (`imageAssetUrl` in packages/web/src/api/images.ts) and stored verbatim in
 * `Meal.imageUrl`. Both path segments are constrained to an exact RFC-4122 UUID
 * (case-insensitive hex with the standard 8-4-4-4-12 grouping) — no extra path
 * segments, query strings, fragments, dots, whitespace, or backslashes can appear
 * inside a UUID segment. Anchored to the full string (^...$). #186 #188.
 */
const UUID_RE =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export const ASSET_PATH_RE = new RegExp(
  `^\\/api\\/families\\/${UUID_RE}\\/images\\/${UUID_RE}$`,
);

/**
 * Accept an absolute http(s) URL. Uses the WHATWG URL parser and enforces an
 * http(s) scheme allowlist, so `javascript:`, `data:`, `file:`, `ftp:`, and
 * protocol-relative (`//host/...`) values are all rejected.
 */
export function isAbsoluteHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * Accept a same-origin uploaded-asset read path. Strictly anchored to the
 * `/api/families/{familyId}/images/{assetId}` shape where both `familyId` and
 * `assetId` must be RFC-4122 UUIDs. The UUID character class (hex digits and
 * hyphens in the 8-4-4-4-12 grouping) cannot contain dots, percent signs,
 * whitespace, or backslashes, so encoded traversal (%2e%2e, %2f), plain `..`,
 * and internal whitespace/backslashes are all structurally rejected.
 */
function isAssetPath(value: string): boolean {
  return ASSET_PATH_RE.test(value);
}

/**
 * Recipe image reference. Display-only; rendered in an <img> on web + Magic
 * Mirror. We store the string but never fetch it server-side. Accepts EITHER an
 * absolute http(s) URL (external image, #103) OR a same-origin uploaded-asset
 * read path (`/api/families/{familyId}/images/{assetId}`, #186). Both path
 * segments of the asset path must be RFC-4122 UUIDs, which structurally excludes
 * percent-encoded traversal (%2e%2e, %2f), plain `..`, internal whitespace, and
 * backslashes. Shared by the REST meals route, the agent route, and the CSV import
 * schema — loosening it keeps all three surfaces in parity. #188.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .refine((u) => isAbsoluteHttpUrl(u) || isAssetPath(u), {
    message:
      "imageUrl must be an http(s) URL or an uploaded image asset path (/api/families/{uuid}/images/{uuid})",
  });

export const listMealsQuerySchema = z.object({
  /** Case-insensitive substring search across meal name, description, tag names, and collection names. */
  search: z.string().optional(),

  /** Filter to specific difficulty levels; multiple values are OR'd. */
  difficulty: z
    .union([
      z.array(z.nativeEnum(Difficulty)),
      z.nativeEnum(Difficulty).transform((v) => [v]),
    ])
    .optional(),

  /**
   * Filter by favorite flag. Query params arrive as strings, so accept the
   * literal "true"/"false" (coerced) as well as a real boolean.
   */
  favorite: z
    .union([
      z.boolean(),
      z.enum(["true", "false"]).transform((v) => v === "true"),
    ])
    .optional(),

  /**
   * Filter to meals rated at or above this threshold (1–5). Unrated (null)
   * meals are excluded from the result.
   */
  minRating: z.coerce.number().int().min(1).max(5).optional(),

  /**
   * Filter to meals assigned any of these tag names (OR-within-facet,
   * case-insensitive). AND-composed with every other facet. A single repeated
   * query param arrives as a string; normalize to an array. Names are resolved
   * to the family's tags server-side.
   */
  tags: z
    .union([z.array(z.string()), z.string().transform((v) => [v])])
    .optional(),

  /**
   * Filter to meals belonging to any of these collection names (OR-within-facet,
   * case-insensitive). AND-composed with every other facet. Collection joins are
   * transitively family-scoped, so a foreign family's collection never matches.
   * Issue #109.
   */
  collections: z
    .union([z.array(z.string()), z.string().transform((v) => [v])])
    .optional(),

  /**
   * Sort field.
   * - `name`       — alphabetical (DB-side)
   * - `created`    — newest first by default (DB-side)
   * - `lastCooked` — most recently cooked first (app-side after getLastCookedMap;
   *                  nulls last, tiebreak name asc)
   */
  sort: z.enum(["name", "created", "lastCooked"]).optional().default("name"),

  /** Sort direction. */
  order: z.enum(["asc", "desc"]).optional().default("asc"),

  /** Maximum records to return. Capped at 100; defaults to 25. */
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(25),

  /** Zero-based offset for pagination. */
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export type ListMealsQuery = z.infer<typeof listMealsQuerySchema>;
