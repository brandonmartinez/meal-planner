/**
 * `buildTabularRecipe` — the PRESENTATION half of the Grid view. It turns the
 * effective, semantics-only read DTO (`TabularRecipeMealDTO`, produced by the
 * API using shared's `deriveRecipeMatrix`) into concrete rowspan/gap table cells
 * (spec §3.3). The *semantics* — which ingredient rows a step touches, and its
 * setup/finish classification — are decided upstream; nothing here re-derives
 * them. This is the port of the prototype's `buildColumnCells()` plus the
 * column-assignment the prototype hand-authored.
 *
 * Row order (Grid use-order, contract `ad63eb8`): the k-th Grid row is
 * `ingredients[ingredientDisplayOrder[k]]`, top→bottom. Derived meals get a
 * first-use permutation (so a step brackets only the ingredients it names);
 * authored meals get the identity permutation (display == position). We walk
 * `ingredientDisplayOrder` and index into the canonical, `position`-ordered
 * `ingredients` array — we never re-sort `ingredients`, because it is the shared
 * coordinate system for List / Grocery / Cooking-Mode / `MealDetailModal`.
 * `spanFrom`/`spanTo` are already in DISPLAY coordinates (indices into
 * `ingredientDisplayOrder`), so the rowspan/cascade math below is unchanged —
 * `TabularRow.rowIndex` is the display walk index `k`, which keeps every step
 * cell's `headers`/`scope` a11y linkage referencing consecutive display rows.
 *
 * Column assignment (the cascade): PROCESS steps are visited in `position`
 * order. Each step sits one column to the RIGHT of the right-most EARLIER step
 * whose ingredient-row range it overlaps — because a later stage acts on the
 * *output* of the earlier stage it overlaps (mix → fold in → bake). A step that
 * overlaps no earlier step stays in column 0, so disjoint first-stage steps
 * (cream / beat in / whisk) share the leftmost column. Two steps that overlap
 * can never land in the same column, and every column 0..max is guaranteed
 * non-empty, so gaps only ever appear where a stage legitimately skips rows.
 */

import type {
  TabularRecipeIngredientDTO,
  TabularRecipeInstructionDTO,
  TabularRecipeMealDTO,
} from '@meal-planner/shared';

/** A rowspan process-step cell — the coloured "verb" box of the grid. */
export interface TabularStepCell {
  kind: 'step';
  rowSpan: number;
  instruction: TabularRecipeInstructionDTO;
}

/** A merged filler cell covering contiguous rows no step in this column touches. */
export interface TabularGapCell {
  kind: 'gap';
  rowSpan: number;
}

export type TabularCell = TabularStepCell | TabularGapCell;

/** A cell that STARTS at a given row, tagged with its 0-based process column. */
export interface TabularColumnCell {
  column: number;
  cell: TabularCell;
}

/** One ingredient row plus the process cells that begin on it. Rows covered by a
 *  rowspan from above contribute no cell for that column. */
export interface TabularRow {
  rowIndex: number;
  ingredient: TabularRecipeIngredientDTO;
  /** Effective group pill label (already resolved by the API), or `null`. */
  groupLabel: string | null;
  /** True on the first row of each contiguous equal-`groupLabel` run. */
  isGroupStart: boolean;
  /** 0-based run index (for colour rotation); `null` for ungrouped rows. */
  groupIndex: number | null;
  cells: TabularColumnCell[];
}

/** The fully laid-out grid, ready for `TabularRecipeView` to render as a table. */
export interface TabularRecipeLayout {
  /** Full-width header bands (kind `SETUP`), in `position` order. */
  setup: TabularRecipeInstructionDTO[];
  /** Trailing notes (kind `FINISH`), in `position` order. */
  finish: TabularRecipeInstructionDTO[];
  /** Number of PROCESS columns (excludes the ingredient column). */
  columnCount: number;
  ingredientCount: number;
  rows: TabularRow[];
}

interface PlacedStep {
  instruction: TabularRecipeInstructionDTO;
  from: number;
  to: number;
  column: number;
}

/** Clamp a raw span to `[0, n-1]`, normalising a reversed range, or return
 *  `null` when it is unusable (null endpoints, or no ingredient rows). */
function clampSpan(
  from: number | null,
  to: number | null,
  n: number,
): [number, number] | null {
  if (from == null || to == null || n === 0) return null;
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(n - 1, Math.max(from, to));
  if (lo > hi) return null;
  return [lo, hi];
}

function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/**
 * Resolve the Grid display order to a trusted permutation of `0..n-1`. The
 * contract guarantees `ingredientDisplayOrder` is exactly that, but we validate
 * defensively: a missing, wrong-length, or non-permutation value (e.g. an older
 * API that predates `ad63eb8`, or a malformed fixture) falls back to the
 * identity order so the Grid degrades to `position` order instead of dropping or
 * duplicating rows. Under identity, display == position and behaviour is
 * unchanged from before the use-ordering contract.
 */
function resolveDisplayOrder(order: number[] | undefined, n: number): number[] {
  const identity = Array.from({ length: n }, (_, i) => i);
  if (!order || order.length !== n) return identity;
  const seen = new Array(n).fill(false);
  for (const idx of order) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= n || seen[idx]) return identity;
    seen[idx] = true;
  }
  return order;
}

/**
 * Port of the prototype's `buildColumnCells`: paint each row with its owning
 * segment, then compress contiguous equal owners into cells. Returns a map from
 * a starting row index to the cell that begins there (rows with no entry are
 * covered by a rowspan above). Segments within a single column never overlap.
 */
function buildColumnCells(segments: PlacedStep[], n: number): Map<number, TabularCell> {
  const owner: (PlacedStep | null)[] = new Array(n).fill(null);
  for (const seg of segments) {
    for (let r = seg.from; r <= seg.to; r++) owner[r] = seg;
  }

  const startAt = new Map<number, TabularCell>();
  let r = 0;
  while (r < n) {
    const cur = owner[r];
    let span = 1;
    while (r + span < n && owner[r + span] === cur) span++;
    startAt.set(
      r,
      cur
        ? { kind: 'step', rowSpan: span, instruction: cur.instruction }
        : { kind: 'gap', rowSpan: span },
    );
    r += span;
  }
  return startAt;
}

export function buildTabularRecipe(
  meal: Pick<TabularRecipeMealDTO, 'ingredients' | 'instructions'> & {
    ingredientDisplayOrder?: number[];
  },
): TabularRecipeLayout {
  // `ingredients` is the canonical, position-ordered coordinate system shared
  // with List/Grocery/Cooking-Mode — never re-sort it. The Grid row order comes
  // from `ingredientDisplayOrder`; spans already index into that display order.
  const { ingredients } = meal;
  const instructions = [...meal.instructions].sort((a, b) => a.position - b.position);
  const n = ingredients.length;
  const displayOrder = resolveDisplayOrder(meal.ingredientDisplayOrder, n);

  const setup = instructions.filter((i) => i.kind === 'SETUP');
  const finish = instructions.filter((i) => i.kind === 'FINISH');

  // PROCESS steps carrying a usable span, in position order.
  const processSteps = instructions
    .filter((i) => i.kind === 'PROCESS')
    .map((instruction) => {
      const span = clampSpan(instruction.spanFrom, instruction.spanTo, n);
      return span ? { instruction, from: span[0], to: span[1] } : null;
    })
    .filter((s): s is { instruction: TabularRecipeInstructionDTO; from: number; to: number } => s !== null);

  // Cascade column assignment (see file header).
  const placed: PlacedStep[] = [];
  for (const step of processSteps) {
    let column = 0;
    for (const prior of placed) {
      if (overlaps(prior, step)) column = Math.max(column, prior.column + 1);
    }
    placed.push({ ...step, column });
  }
  const columnCount = placed.reduce((max, p) => Math.max(max, p.column + 1), 0);

  const columnStartCells: Array<Map<number, TabularCell>> = [];
  for (let c = 0; c < columnCount; c++) {
    columnStartCells.push(buildColumnCells(placed.filter((p) => p.column === c), n));
  }

  // Group = contiguous run of equal, non-null groupLabel — contiguous in the
  // DISPLAY order the cook actually sees, so runs and colour rotation follow the
  // rendered rows, not position. A null breaks a run, so an equal label after a
  // gap starts a fresh (recoloured) run.
  let runIndex = -1;
  let prevLabel: string | null = null;

  const rows: TabularRow[] = displayOrder.map((ingredientIndex, r) => {
    const ingredient = ingredients[ingredientIndex];
    const label = ingredient.groupLabel;
    const isGroupStart = label != null && label !== prevLabel;
    if (isGroupStart) runIndex++;
    const groupIndex = label != null ? runIndex : null;
    prevLabel = label;

    const cells: TabularColumnCell[] = [];
    for (let c = 0; c < columnCount; c++) {
      const cell = columnStartCells[c].get(r);
      if (cell) cells.push({ column: c, cell });
    }

    return {
      rowIndex: r,
      ingredient,
      groupLabel: label,
      isGroupStart,
      groupIndex,
      cells,
    };
  });

  return { setup, finish, columnCount, ingredientCount: n, rows };
}
