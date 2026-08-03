import { describe, it, expect } from 'vitest';
import {
  buildTabularRecipe,
  type TabularStepCell,
} from './buildTabularRecipe';
import type {
  TabularRecipeIngredientDTO,
  TabularRecipeInstructionDTO,
  InstructionKind,
} from '@meal-planner/shared';

function ing(
  position: number,
  name: string,
  groupLabel: string | null = null,
): TabularRecipeIngredientDTO {
  return {
    id: `i-${position}`,
    name,
    quantity: null,
    unit: null,
    category: null,
    mealId: 'm-1',
    position,
    groupLabel,
  };
}

function step(
  position: number,
  text: string,
  kind: InstructionKind,
  spanFrom: number | null = null,
  spanTo: number | null = null,
  subLabel: string | null = null,
): TabularRecipeInstructionDTO {
  return {
    id: `s-${position}`,
    mealId: 'm-1',
    position,
    text,
    timerMinutes: null,
    kind,
    subLabel,
    spanFrom,
    spanTo,
  };
}

/** Reconstruct, for a column, the ordered (rowStart, span, text|GAP) list so
 *  tests can assert the exact rowspan/gap compression per column. */
function columnCells(
  layout: ReturnType<typeof buildTabularRecipe>,
  column: number,
): { row: number; span: number; label: string }[] {
  return layout.rows
    .flatMap((row) =>
      row.cells
        .filter((c) => c.column === column)
        .map((c) => ({
          row: row.rowIndex,
          span: c.cell.rowSpan,
          label:
            c.cell.kind === 'step'
              ? (c.cell as TabularStepCell).instruction.text
              : 'GAP',
        })),
    )
    .sort((a, b) => a.row - b.row);
}

describe('buildTabularRecipe', () => {
  it('classifies setup bands and finish notes out of the process columns', () => {
    const layout = buildTabularRecipe({
      ingredients: [ing(0, 'Butter'), ing(1, 'Sugar')],
      instructions: [
        step(0, 'Preheat oven to 375°F', 'SETUP'),
        step(1, 'Cream together', 'PROCESS', 0, 1),
        step(2, 'Cool before serving', 'FINISH'),
      ],
    });

    expect(layout.setup.map((s) => s.text)).toEqual(['Preheat oven to 375°F']);
    expect(layout.finish.map((s) => s.text)).toEqual(['Cool before serving']);
    // Only the single PROCESS step forms a column.
    expect(layout.columnCount).toBe(1);
  });

  it('reproduces the cascade columns of the cookies prototype', () => {
    // 9 ingredients; the classic cream → mix → fold in → bake cascade.
    const ingredients = Array.from({ length: 9 }, (_, i) => ing(i, `ing-${i}`));
    const layout = buildTabularRecipe({
      ingredients,
      instructions: [
        step(0, 'cream', 'PROCESS', 0, 2),
        step(1, 'beat in', 'PROCESS', 3, 4),
        step(2, 'whisk', 'PROCESS', 5, 7),
        step(3, 'mix', 'PROCESS', 0, 7),
        step(4, 'fold in', 'PROCESS', 0, 8),
        step(5, 'scoop & bake', 'PROCESS', 0, 8),
      ],
    });

    // Four cascade columns: the three disjoint first-stage steps share col 0.
    expect(layout.columnCount).toBe(4);

    expect(columnCells(layout, 0)).toEqual([
      { row: 0, span: 3, label: 'cream' },
      { row: 3, span: 2, label: 'beat in' },
      { row: 5, span: 3, label: 'whisk' },
      { row: 8, span: 1, label: 'GAP' }, // row 8 is untouched by column 0
    ]);
    // Later columns legitimately re-span rows earlier columns already covered.
    expect(columnCells(layout, 1)).toEqual([
      { row: 0, span: 8, label: 'mix' },
      { row: 8, span: 1, label: 'GAP' },
    ]);
    expect(columnCells(layout, 2)).toEqual([{ row: 0, span: 9, label: 'fold in' }]);
    expect(columnCells(layout, 3)).toEqual([
      { row: 0, span: 9, label: 'scoop & bake' },
    ]);
  });

  it('places a later step that only overlaps a col-0 step one column right (spread-on-bread cascade)', () => {
    // Mirrors the po'boy: two disjoint col-0 steps, then two col-1 steps that
    // each overlap only one of them, then a full-span col-2 finish.
    const ingredients = Array.from({ length: 4 }, (_, i) => ing(i, `ing-${i}`));
    const layout = buildTabularRecipe({
      ingredients,
      instructions: [
        step(0, 'a', 'PROCESS', 0, 1),
        step(1, 'b', 'PROCESS', 2, 3),
        step(2, 'c', 'PROCESS', 0, 1), // overlaps a → col 1
        step(3, 'd', 'PROCESS', 2, 3), // overlaps b (col 0) not c → col 1
        step(4, 'e', 'PROCESS', 0, 3), // overlaps everything → col 2
      ],
    });

    expect(layout.columnCount).toBe(3);
    expect(columnCells(layout, 0)).toEqual([
      { row: 0, span: 2, label: 'a' },
      { row: 2, span: 2, label: 'b' },
    ]);
    expect(columnCells(layout, 1)).toEqual([
      { row: 0, span: 2, label: 'c' },
      { row: 2, span: 2, label: 'd' },
    ]);
    expect(columnCells(layout, 2)).toEqual([{ row: 0, span: 4, label: 'e' }]);
  });

  it('handles the degenerate full-span step as one rowspan cell', () => {
    const ingredients = Array.from({ length: 3 }, (_, i) => ing(i, `ing-${i}`));
    const layout = buildTabularRecipe({
      ingredients,
      instructions: [step(0, 'mix everything', 'PROCESS', 0, 2)],
    });

    expect(layout.columnCount).toBe(1);
    expect(columnCells(layout, 0)).toEqual([
      { row: 0, span: 3, label: 'mix everything' },
    ]);
  });

  it('compresses a leading uncovered run into a single gap cell', () => {
    const ingredients = Array.from({ length: 4 }, (_, i) => ing(i, `ing-${i}`));
    const layout = buildTabularRecipe({
      ingredients,
      instructions: [step(0, 'sizzle', 'PROCESS', 2, 3)],
    });

    expect(columnCells(layout, 0)).toEqual([
      { row: 0, span: 2, label: 'GAP' },
      { row: 2, span: 2, label: 'sizzle' },
    ]);
  });

  it('marks the first row of each contiguous group run and rotates colours', () => {
    const layout = buildTabularRecipe({
      ingredients: [
        ing(0, 'Shrimp', 'Shrimp'),
        ing(1, 'Buttermilk', 'Shrimp'),
        ing(2, 'Flour', 'Breading'),
        ing(3, 'Cornstarch', 'Breading'),
      ],
      instructions: [],
    });

    const starts = layout.rows.filter((r) => r.isGroupStart).map((r) => r.rowIndex);
    expect(starts).toEqual([0, 2]);
    expect(layout.rows[0].groupIndex).toBe(0);
    expect(layout.rows[1].groupIndex).toBe(0);
    expect(layout.rows[2].groupIndex).toBe(1);
    expect(layout.rows[3].groupIndex).toBe(1);
  });

  it('starts a fresh group run when an equal label reappears after a null gap', () => {
    const layout = buildTabularRecipe({
      ingredients: [
        ing(0, 'A', 'Sauce'),
        ing(1, 'B', null),
        ing(2, 'C', 'Sauce'),
      ],
      instructions: [],
    });

    expect(layout.rows.map((r) => r.isGroupStart)).toEqual([true, false, true]);
    expect(layout.rows.map((r) => r.groupIndex)).toEqual([0, null, 1]);
  });

  it('clamps an out-of-range span and drops null-span process steps', () => {
    const ingredients = Array.from({ length: 3 }, (_, i) => ing(i, `ing-${i}`));
    const layout = buildTabularRecipe({
      ingredients,
      instructions: [
        step(0, 'wild span', 'PROCESS', -5, 99),
        step(1, 'no span', 'PROCESS', null, null),
      ],
    });

    // Only the clamped step survives, spanning all rows.
    expect(layout.columnCount).toBe(1);
    expect(columnCells(layout, 0)).toEqual([
      { row: 0, span: 3, label: 'wild span' },
    ]);
  });

  it('orders setup bands and finish notes by instruction position', () => {
    const layout = buildTabularRecipe({
      ingredients: [ing(0, 'A')],
      instructions: [
        step(3, 'setup B', 'SETUP'),
        step(1, 'setup A', 'SETUP'),
        step(4, 'finish', 'FINISH'),
      ],
    });

    // Instructions are still normalised to position order for setup/finish and
    // the PROCESS cascade, independent of the ingredient display order.
    expect(layout.setup.map((s) => s.text)).toEqual(['setup A', 'setup B']);
    expect(layout.finish.map((s) => s.text)).toEqual(['finish']);
  });

  it('walks ingredientDisplayOrder to order Grid rows (Birria use-order fix)', () => {
    // Ingredients are stored in shopping (position) order; the Grid renders them
    // in use order so a step brackets only the rows it names. Names encode the
    // source position so the permutation is visible.
    const ingredients = Array.from({ length: 8 }, (_, i) => ing(i, `pos-${i}`));
    const layout = buildTabularRecipe({
      ingredients,
      ingredientDisplayOrder: [1, 2, 3, 0, 6, 4, 5, 7],
      instructions: [step(0, 'Braise', 'PROCESS', 0, 4)],
    });

    // Grid rows follow the display permutation, not position.
    expect(layout.rows.map((r) => r.ingredient.name)).toEqual([
      'pos-1',
      'pos-2',
      'pos-3',
      'pos-0',
      'pos-6',
      'pos-4',
      'pos-5',
      'pos-7',
    ]);
    // rowIndex is the consecutive display walk index — the a11y `headers` wiring
    // in TabularRecipeView references ingRowId(rowIndex + i) across a rowspan.
    expect(layout.rows.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // The braise spans display rows 0..4 (its used ingredients); the trailing
    // rows (the shopping-order tail it never mentions) fall outside the bracket.
    expect(columnCells(layout, 0)).toEqual([
      { row: 0, span: 5, label: 'Braise' },
      { row: 5, span: 3, label: 'GAP' },
    ]);
  });

  it('falls back to position order when ingredientDisplayOrder is absent (authored/identity)', () => {
    const ingredients = Array.from({ length: 3 }, (_, i) => ing(i, `pos-${i}`));
    const layout = buildTabularRecipe({
      ingredients,
      instructions: [step(0, 'mix', 'PROCESS', 0, 2)],
    });

    expect(layout.rows.map((r) => r.ingredient.name)).toEqual(['pos-0', 'pos-1', 'pos-2']);
    expect(columnCells(layout, 0)).toEqual([{ row: 0, span: 3, label: 'mix' }]);
  });

  it('falls back to identity for a malformed (non-permutation) display order', () => {
    const ingredients = Array.from({ length: 3 }, (_, i) => ing(i, `pos-${i}`));
    for (const bad of [[0, 1], [0, 1, 1], [0, 1, 3], [2, 1, 0, 2]]) {
      const layout = buildTabularRecipe({
        ingredients,
        ingredientDisplayOrder: bad,
        instructions: [],
      });
      expect(layout.rows.map((r) => r.ingredient.name)).toEqual(['pos-0', 'pos-1', 'pos-2']);
    }
  });

  it('computes group runs over the display order, not position', () => {
    // Positions interleave two groups; the display order de-interleaves them, so
    // the pills must form two contiguous runs in the rendered (display) order.
    const layout = buildTabularRecipe({
      ingredients: [
        ing(0, 'A', 'Sauce'),
        ing(1, 'B', 'Rub'),
        ing(2, 'C', 'Sauce'),
        ing(3, 'D', 'Rub'),
      ],
      ingredientDisplayOrder: [0, 2, 1, 3],
      instructions: [],
    });

    expect(layout.rows.map((r) => r.ingredient.name)).toEqual(['A', 'C', 'B', 'D']);
    expect(layout.rows.map((r) => r.groupLabel)).toEqual(['Sauce', 'Sauce', 'Rub', 'Rub']);
    expect(layout.rows.map((r) => r.isGroupStart)).toEqual([true, false, true, false]);
    expect(layout.rows.map((r) => r.groupIndex)).toEqual([0, 0, 1, 1]);
  });

  it('returns an empty layout for a recipe with no ingredients', () => {
    const layout = buildTabularRecipe({
      ingredients: [],
      instructions: [step(0, 'mix', 'PROCESS', null, null)],
    });

    expect(layout.ingredientCount).toBe(0);
    expect(layout.columnCount).toBe(0);
    expect(layout.rows).toEqual([]);
  });
});
