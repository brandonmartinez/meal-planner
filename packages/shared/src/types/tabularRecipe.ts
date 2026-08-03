/**
 * Type contract for the tabular ("Grid") recipe view — the Cooking-for-Engineers
 * matrix (spec §3.3). Ingredients read down the left column; each PROCESS step
 * spans the contiguous ingredient rows it combines; SETUP steps are full-width
 * bands above the grid and a FINISH note trails below.
 *
 * These types describe *semantics* only — which ingredient rows a step touches
 * and its setup/finish classification. The rowspan/gap-cell *presentation*
 * (`buildTabularRecipe`) lives in `packages/web` and is intentionally not here.
 *
 * Naming: users see "Grid"; code/types use the `TabularRecipe*` prefix (§6).
 */

import type { InstructionKind } from "../constants/index.js";

/**
 * Provenance of a meal's matrix layout. This is **structural, not a stored
 * boolean** — it is computed on every read from whether any instruction carries
 * an authored span (`spanFrom != null`), never persisted as a flag. See the
 * anti-staleness note at the top of `deriveRecipeMatrix.ts`.
 */
export type MatrixSource = "authored" | "derived";

/* -------------------------------------------------------------------------- */
/* deriveRecipeMatrix() inputs — the persisted rows plus any authored overrides */
/* -------------------------------------------------------------------------- */

/**
 * The subset of a persisted `MealIngredient` that `deriveRecipeMatrix` needs.
 * `groupLabel` is the authored group pill and the ONLY source of effective
 * grouping (`null` → ungrouped; no derived fallback — see below). `category` is
 * the grocery-aisle vocabulary; it is retained here as part of the persisted
 * row but is deliberately NOT used to derive groups (grouping by shopping aisle
 * fights the format). `position` is the durable 0-based row order.
 */
export interface TabularRecipeIngredientInput {
  position: number;
  name: string;
  category: string | null;
  groupLabel: string | null;
}

/**
 * The subset of a persisted `MealInstruction` that `deriveRecipeMatrix` needs.
 * `kind` is the persisted value (schema default `PROCESS`); `subLabel`,
 * `spanFrom`, and `spanTo` are the authored layout overrides (`null` → derive at
 * read time). A meal is "authored" iff any instruction has a non-null `spanFrom`.
 */
export interface TabularRecipeInstructionInput {
  position: number;
  text: string;
  kind: InstructionKind;
  subLabel: string | null;
  spanFrom: number | null;
  spanTo: number | null;
}

/* -------------------------------------------------------------------------- */
/* deriveRecipeMatrix() output — the effective, read-shaped matrix semantics    */
/* -------------------------------------------------------------------------- */

/** Effective group metadata for one ingredient row, ordered by `position`. */
export interface TabularRecipeIngredientMatrix {
  position: number;
  /** Effective group pill label: the authored `groupLabel`, else `null`
   *  (ungrouped). There is NO derived fallback — `category` (grocery aisle) is
   *  never used as a group, so derived meals render ungrouped until Phase-2
   *  authoring. Contiguous rows with an equal non-null value form one group. */
  groupLabel: string | null;
}

/**
 * Effective matrix classification for one instruction, keyed by `position`.
 * `spanFrom`/`spanTo` are inclusive 0-based indices into the ingredients array
 * sorted ascending by `position` (i.e. row indices, not `MealIngredient.id`s),
 * and are non-null only for `PROCESS` steps. `SETUP`/`FINISH` steps carry
 * `null` spans (they are bands/notes, not row-spanning cells).
 */
export interface TabularRecipeInstructionMatrix {
  position: number;
  kind: InstructionKind;
  subLabel: string | null;
  spanFrom: number | null;
  spanTo: number | null;
}

/**
 * The result of `deriveRecipeMatrix`: the meal's provenance plus the effective
 * per-ingredient and per-instruction matrix semantics. Both arrays are ordered
 * ascending by `position`. This is the semantic seam the API read path merges
 * back onto the persisted rows to build {@link TabularRecipeMealDTO}.
 */
export interface TabularRecipeMatrix {
  matrixSource: MatrixSource;
  ingredients: TabularRecipeIngredientMatrix[];
  instructions: TabularRecipeInstructionMatrix[];
}
