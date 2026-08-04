import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import TabularRecipeView from './TabularRecipeView';
import type {
  TabularRecipeMealDTO,
  TabularRecipeIngredientDTO,
  TabularRecipeInstructionDTO,
  InstructionKind,
} from '@meal-planner/shared';

function ing(
  position: number,
  name: string,
  extra: Partial<TabularRecipeIngredientDTO> = {},
): TabularRecipeIngredientDTO {
  return {
    id: `i-${position}`,
    name,
    quantity: null,
    unit: null,
    category: null,
    mealId: 'm-1',
    position,
    groupLabel: null,
    ...extra,
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

function meal(overrides: Partial<TabularRecipeMealDTO> = {}): TabularRecipeMealDTO {
  const base: TabularRecipeMealDTO = {
    id: 'm-1',
    name: 'Cookies',
    placeholderKind: null,
    difficulty: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    servings: null,
    sourceUrl: null,
    notes: null,
    favorite: false,
    rating: null,
    familyId: 'fam-1',
    matrixSource: 'derived',
    ingredients: [],
    instructions: [],
    ingredientDisplayOrder: [],
    ...overrides,
  };
  // Default to identity (Grid order == position order) unless a test pins its
  // own display order, so pre-use-ordering fixtures render exactly as before.
  return {
    ...base,
    ingredientDisplayOrder:
      overrides.ingredientDisplayOrder ?? base.ingredients.map((_, i) => i),
  };
}

describe('TabularRecipeView', () => {
  it('renders a captioned table with an ingredient row header', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Butter', { quantity: '1', unit: 'cup' })],
          instructions: [step(0, 'cream', 'PROCESS', 0, 0)],
        })}
      />,
    );

    const table = screen.getByRole('table');
    expect(
      within(table).getByText(/each process step spans the ingredients/i),
    ).toBeInTheDocument();

    const rowHeader = screen.getByRole('rowheader', { name: /Butter/ });
    expect(rowHeader).toHaveTextContent('1 cup');
  });

  it('renders SETUP instructions as a full-width band', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Butter'), ing(1, 'Sugar')],
          instructions: [
            step(0, 'Preheat oven to 375°F', 'SETUP'),
            step(1, 'cream', 'PROCESS', 0, 1),
          ],
        })}
      />,
    );

    const band = screen.getByRole('columnheader', { name: /Preheat oven to 375/ });
    expect(band).toHaveAttribute('colspan', '2'); // ingredient col + 1 process col
  });

  it('renders a PROCESS step as a rowspan cell linked to the rows it spans', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Butter'), ing(1, 'Sugar'), ing(2, 'Eggs')],
          instructions: [step(0, 'mix', 'PROCESS', 0, 2, 'until smooth')],
        })}
      />,
    );

    const cell = screen.getByRole('cell', { name: /mix/ });
    expect(cell).toHaveAttribute('rowspan', '3');
    expect(cell).toHaveTextContent('until smooth');
    // headers link to the column header plus every spanned ingredient row.
    const headers = cell.getAttribute('headers') ?? '';
    expect(headers).toContain('tabular-m-1-col-0');
    expect(headers).toContain('tabular-m-1-row-0');
    expect(headers).toContain('tabular-m-1-row-1');
    expect(headers).toContain('tabular-m-1-row-2');
  });

  it('renders a merged gap cell where a column skips rows', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Oil'), ing(1, 'Garlic'), ing(2, 'Pasta')],
          // only spans rows 0-1, leaving row 2 as a gap in that column.
          instructions: [step(0, 'sizzle', 'PROCESS', 0, 1)],
        })}
      />,
    );

    const gap = screen
      .getAllByRole('cell', { hidden: true })
      .find((c) => c.getAttribute('rowspan') === '1' && c.textContent === '');
    expect(gap).toBeDefined();
  });

  it('shows a group pill once on the first row of each run', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [
            ing(0, 'Shrimp', { groupLabel: 'Shrimp' }),
            ing(1, 'Buttermilk', { groupLabel: 'Shrimp' }),
            ing(2, 'Flour', { groupLabel: 'Breading' }),
          ],
          instructions: [],
        })}
      />,
    );

    expect(screen.getAllByText('Shrimp')).toHaveLength(2); // ingredient name + pill
    expect(screen.getByText('Breading')).toBeInTheDocument();
    // The pill appears on the run's first row only — Buttermilk carries no pill.
    const buttermilkRow = screen.getByRole('rowheader', { name: /Buttermilk/ });
    expect(within(buttermilkRow).queryByText('Shrimp')).not.toBeInTheDocument();
  });

  it('renders the FINISH note below the table', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Butter')],
          instructions: [
            step(0, 'cream', 'PROCESS', 0, 0),
            step(1, 'Cool on the pan 5 minutes', 'FINISH'),
          ],
        })}
      />,
    );

    expect(screen.getByText('Finish:')).toBeInTheDocument();
    expect(screen.getByText(/Cool on the pan 5 minutes/)).toBeInTheDocument();
  });

  it('renders the degenerate full-span step as a single rowspan cell', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'A'), ing(1, 'B'), ing(2, 'C'), ing(3, 'D')],
          instructions: [step(0, 'combine all', 'PROCESS', 0, 3)],
        })}
      />,
    );

    const cell = screen.getByRole('cell', { name: /combine all/ });
    expect(cell).toHaveAttribute('rowspan', '4');
  });

  it('falls back to a message when the recipe has no ingredients', () => {
    render(
      <TabularRecipeView
        meal={meal({ ingredients: [], instructions: [step(0, 'mix', 'PROCESS')] })}
      />,
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/no ingredients to chart/i)).toBeInTheDocument();
  });

  it('renders a terse short label with the full step text in a title', () => {
    const full =
      'Whisk the flour, cornstarch, cornmeal, cajun seasoning, paprika, and garlic powder';
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Flour'), ing(1, 'Cornstarch'), ing(2, 'Paprika')],
          instructions: [step(0, full, 'PROCESS', 0, 2)],
        })}
      />,
    );

    const cell = screen.getByRole('cell', { name: 'Whisk the flour' });
    expect(cell).toHaveAttribute('title', full);
    // The full sentence is not printed in the cell — only the terse label.
    expect(cell).not.toHaveTextContent('cornstarch');
  });

  it('suppresses a sub-label that merely restates the displayed label', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Shrimp'), ing(1, 'Flour')],
          // Short label becomes "Chill the shrimp"; sub "30 min" is a substring
          // of nothing here, so it is additive and shown...
          instructions: [step(0, 'Chill 30 min', 'PROCESS', 0, 1, '30 min')],
        })}
      />,
    );

    // "Chill 30 min" has no comma/tail, so the label keeps "30 min"; the sub is
    // then redundant and suppressed (shown once, not twice).
    const cell = screen.getByRole('cell', { name: /Chill 30 min/ });
    expect(within(cell).queryAllByText('30 min')).toHaveLength(0);
    expect(cell).toHaveTextContent('Chill 30 min');
  });

  it('keeps a sub-label that is additive once the label is shortened', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Oil')],
          instructions: [step(0, 'Heat the frying oil to 350°F', 'PROCESS', 0, 0, '350°F')],
        })}
      />,
    );

    const cell = screen.getByRole('cell', { name: /Heat the frying oil/ });
    expect(cell).toHaveTextContent('350°F'); // additive: label no longer says it
    expect(cell).toHaveAttribute('title', 'Heat the frying oil to 350°F');
  });

  it('degrades cleanly with no groups: no pills and no coloured borders', () => {
    const { container } = render(
      <TabularRecipeView
        meal={meal({
          // Every ingredient has a null groupLabel (the common case on real data
          // until Phase 2 authoring exists).
          ingredients: [ing(0, 'Butter'), ing(1, 'Sugar'), ing(2, 'Eggs')],
          instructions: [step(0, 'cream', 'PROCESS', 0, 2)],
        })}
      />,
    );

    // No group pill markup at all.
    expect(container.querySelector('.rounded-full')).toBeNull();
    // Row headers carry a transparent left accent (consistent width, no shift)
    // and never a coloured group border.
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders.length).toBeGreaterThan(0);
    for (const th of rowHeaders) {
      expect(th.className).toContain('border-l-transparent');
      expect(th.className).not.toContain('border-l-blue-500');
      expect(th.className).not.toContain('border-l-amber-500');
    }
  });

  it('notes the Grid use-order for derived meals, but not authored ones', () => {
    const { rerender } = render(
      <TabularRecipeView
        meal={meal({
          matrixSource: 'derived',
          ingredients: [ing(0, 'Butter'), ing(1, 'Sugar')],
          instructions: [step(0, 'cream', 'PROCESS', 0, 1)],
        })}
      />,
    );
    expect(
      screen.getByText(/listed in the order the recipe uses them/i),
    ).toBeInTheDocument();

    // Authored meals render in position order (== List), so no divergence note.
    rerender(
      <TabularRecipeView
        meal={meal({
          matrixSource: 'authored',
          ingredients: [ing(0, 'Butter'), ing(1, 'Sugar')],
          instructions: [step(0, 'cream', 'PROCESS', 0, 1)],
        })}
      />,
    );
    expect(
      screen.queryByText(/listed in the order the recipe uses them/i),
    ).not.toBeInTheDocument();
  });

  it('renders rows in ingredientDisplayOrder and links spans to display rows', () => {
    render(
      <TabularRecipeView
        meal={meal({
          ingredients: [ing(0, 'Apple'), ing(1, 'Butter'), ing(2, 'Cocoa')],
          // Display order re-sorts rows to Cocoa, Apple, Butter (use-order).
          ingredientDisplayOrder: [2, 0, 1],
          // Span is in DISPLAY coords: display rows 0–1 (Cocoa, Apple).
          instructions: [step(0, 'melt together', 'PROCESS', 0, 1)],
        })}
      />,
    );

    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders.map((th) => th.textContent)).toEqual([
      expect.stringContaining('Cocoa'),
      expect.stringContaining('Apple'),
      expect.stringContaining('Butter'),
    ]);

    // The step cell spans the first two DISPLAY rows and its a11y `headers`
    // reference the consecutive display row ids (row-0, row-1), never position.
    const cell = screen.getByRole('cell', { name: /melt together/i });
    expect(cell).toHaveAttribute('rowspan', '2');
    const headers = cell.getAttribute('headers') ?? '';
    expect(headers).toContain('tabular-m-1-row-0');
    expect(headers).toContain('tabular-m-1-row-1');
    expect(headers).not.toContain('tabular-m-1-row-2');
  });
});
