import { z } from "zod";
import { Difficulty } from "@prisma/client";

/**
 * Shared query schema for the meals list endpoint. Consumed by both:
 *   - `GET /api/families/:familyId/meals`  (authenticateJWT → requireMembership)
 *   - `GET /api/agent/:familyId/meals`     (authenticateAgent → requireScope)
 *
 * Semantics: OR-within-facet (all difficulty[] values are OR'd), AND-across-facets
 * (search AND difficulty[] both apply). Placeholder meals are excluded from results
 * whenever any search/filter param is active; unfiltered pagination includes them.
 */
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
