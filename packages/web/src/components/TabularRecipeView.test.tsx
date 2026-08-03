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
  return {
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
    ...overrides,
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
});
