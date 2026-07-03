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
 * External recipe image URL. Display-only; rendered in an <img> on web + Magic
 * Mirror. We store the string but never fetch it server-side. Validation mirrors
 * sourceUrl (.url()) and additionally enforces an http(s) scheme allowlist so we
 * never persist javascript:/file:/data: values. Shared by the REST meals route,
 * the agent route, and the CSV import schema. #103.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), {
    message: "imageUrl must use http or https",
  });

export const listMealsQuerySchema = z.object({
  /** Case-insensitive substring search on meal name (ILIKE, pg_trgm-accelerated). */
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
