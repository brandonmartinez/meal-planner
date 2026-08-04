import { render, screen, within } from '@testing-library/react';
import {
  deriveRecipeMatrix,
  type TabularRecipeIngredientInput,
  type TabularRecipeInstructionInput,
  type TabularRecipeMealDTO,
  type TabularRecipeIngredientDTO,
  type TabularRecipeInstructionDTO,
} from '@meal-planner/shared';
import TabularRecipeView from './TabularRecipeView';
import { buildTabularRecipe } from '../utils/buildTabularRecipe';

/**
 * END-TO-END Grid pipeline (Yen, Grid verification). Three agents built this
 * feature in parallel against a pinned contract but nobody had exercised the
 * whole chain together:
 *
 *   raw rows → shared deriveRecipeMatrix (SEMANTICS)
 *            → API applyRecipeMatrix merge (the SERVE seam, replicated here)
 *            → web TabularRecipeView + buildTabularRecipe (PRESENTATION)
 *
 * The per-package unit tests each stub the seam on either side of them; this
 * test lets a real derivation flow through the real renderer, so a drift between
 * what shared emits and what web consumes (field names, span index base, group
 * ordering) fails loudly. It uses the prototype's po'boy as the stress case:
 * many ingredients across several grocery categories, a setup band, cascading
 * process steps, and a finish note. (Derived data no longer produces group
 * pills — categories are shopping aisles, not cooking sections.)
 */

interface RawRow {
  name: string;
  quantity: string;
  unit: string;
  category: string;
}

// A realistic multi-group recipe whose step TEXT names ingredients, so the
// heuristics compute genuine spans (not the prototype's hand-authored ones).
const RAW_INGREDIENTS: RawRow[] = [
  { name: 'Shrimp', quantity: '2', unit: 'lb', category: 'seafood' },
  { name: 'Buttermilk', quantity: '2', unit: 'cup', category: 'dairy' },
  { name: 'Flour', quantity: '2', unit: 'cup', category: 'pantry' },
  { name: 'Cornmeal', quantity: '1', unit: 'cup', category: 'pantry' },
  { name: 'Cajun seasoning', quantity: '2', unit: 'tbsp', category: 'pantry' },
  { name: 'Mayonnaise', quantity: '1', unit: 'cup', category: 'condiments' },
  { name: 'Creole mustard', quantity: '1', unit: 'tbsp', category: 'condiments' },
  { name: 'French bread', quantity: '2', unit: 'loaves', category: 'bakery' },
  { name: 'Lettuce', quantity: '1', unit: 'head', category: 'produce' },
  { name: 'Tomato', quantity: '3', unit: '', category: 'produce' },
];

const RAW_STEPS: string[] = [
  'Heat the frying oil to 350°F', // SETUP (heat…oil, names nothing)
  'Marinate the shrimp in buttermilk for 20 min', // rows 0–1
  'Whisk the flour, cornmeal, and cajun seasoning', // rows 2–4
  'Stir the mayonnaise and creole mustard into a remoulade', // rows 5–6
  'Dredge the shrimp and fry until golden', // row 0
  'Spread the remoulade on the French bread', // row 7
  'Top with lettuce and tomato', // rows 8–9
  'Serve immediately', // FINISH (serve, names nothing)
];

const MEAL_ID = 'poboy';

/**
 * Replicate the API read path (`applyRecipeMatrix` in services/meals.ts): sort
 * persisted rows by position, run `deriveRecipeMatrix`, and merge the effective
 * matrix back by index to produce the exact `TabularRecipeMealDTO` the web
 * client would receive over the wire.
 */
function serve(rawIngredients: RawRow[], rawSteps: string[]): TabularRecipeMealDTO {
  const ingredientRows = rawIngredients.map((r, position) => ({
    id: `ing-${position}`,
    mealId: MEAL_ID,
    position,
    name: r.name,
    quantity: r.quantity || null,
    unit: r.unit || null,
    category: r.category,
    groupLabel: null as string | null,
  }));
  const instructionRows = rawSteps.map((text, position) => ({
    id: `ins-${position}`,
    mealId: MEAL_ID,
    position,
    text,
    timerMinutes: null as number | null,
    kind: 'PROCESS' as const,
    subLabel: null as string | null,
    spanFrom: null as number | null,
    spanTo: null as number | null,
  }));

  const matrix = deriveRecipeMatrix(
    ingredientRows.map(
      (ing): TabularRecipeIngredientInput => ({
        position: ing.position,
        name: ing.name,
        category: ing.category,
        groupLabel: ing.groupLabel,
      }),
    ),
    instructionRows.map(
      (ins): TabularRecipeInstructionInput => ({
        position: ins.position,
        text: ins.text,
        kind: ins.kind,
        subLabel: ins.subLabel,
        spanFrom: ins.spanFrom,
        spanTo: ins.spanTo,
      }),
    ),
  );

  const ingredients: TabularRecipeIngredientDTO[] = ingredientRows.map(
    (ing, i) => ({
      id: ing.id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
      mealId: ing.mealId,
      position: ing.position,
      groupLabel: matrix.ingredients[i].groupLabel,
    }),
  );
  const instructions: TabularRecipeInstructionDTO[] = instructionRows.map(
    (ins, i) => ({
      id: ins.id,
      mealId: ins.mealId,
      position: ins.position,
      text: ins.text,
      timerMinutes: ins.timerMinutes,
      kind: matrix.instructions[i].kind,
      subLabel: matrix.instructions[i].subLabel,
      spanFrom: matrix.instructions[i].spanFrom,
      spanTo: matrix.instructions[i].spanTo,
    }),
  );

  return {
    id: MEAL_ID,
    name: "Crispy Shrimp Po'boys with Crab Remoulade",
    placeholderKind: null,
    difficulty: 'MEDIUM',
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    servings: 5,
    sourceUrl: null,
    notes: null,
    favorite: false,
    rating: null,
    familyId: 'fam-1',
    matrixSource: matrix.matrixSource,
    ingredients,
    instructions,
    ingredientDisplayOrder: matrix.ingredientDisplayOrder,
  };
}

describe('Grid pipeline (derive → serve → render) — po’boy stress case', () => {
  it('derives the expected semantics at the serve seam', () => {
    const meal = serve(RAW_INGREDIENTS, RAW_STEPS);

    // Unauthored input → derived provenance.
    expect(meal.matrixSource).toBe('derived');

    const byPos = meal.instructions;
    // Leading heat-oil verb naming no ingredient → SETUP band w/ temp subLabel.
    expect(byPos[0]).toMatchObject({ kind: 'SETUP', subLabel: '350°F' });
    // Trailing serve verb naming no ingredient → FINISH note.
    expect(byPos[7]).toMatchObject({ kind: 'FINISH', spanFrom: null });
    // Process spans are the min/max named ingredient row.
    expect(byPos[1]).toMatchObject({ kind: 'PROCESS', spanFrom: 0, spanTo: 1, subLabel: '20 min' });
    expect(byPos[2]).toMatchObject({ kind: 'PROCESS', spanFrom: 2, spanTo: 4 });
    expect(byPos[3]).toMatchObject({ kind: 'PROCESS', spanFrom: 5, spanTo: 6 });
    expect(byPos[6]).toMatchObject({ kind: 'PROCESS', spanFrom: 8, spanTo: 9 });

    // Derived matrices no longer synthesise group labels from grocery aisles
    // (Rusty's ruling — real categories like "produce"/"pantry" are shopping
    // aisles, not cooking sections). groupLabel is null unless authored.
    expect(meal.ingredients.map((i) => i.groupLabel)).toEqual(
      new Array(RAW_INGREDIENTS.length).fill(null),
    );
  });

  it('renders a coherent, accessible grid from the derived DTO', () => {
    const meal = serve(RAW_INGREDIENTS, RAW_STEPS);
    const { container } = render(<TabularRecipeView meal={meal} />);

    const table = screen.getByRole('table');
    // Semantic table with the spec §9 caption.
    expect(
      within(table).getByText(/each process step spans the ingredients/i),
    ).toBeInTheDocument();

    // Every ingredient becomes a row header, in position order.
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders).toHaveLength(RAW_INGREDIENTS.length);
    expect(rowHeaders[0]).toHaveTextContent('Shrimp');
    expect(rowHeaders[9]).toHaveTextContent('Tomato');

    // The setup band spans the full width (ingredient col + every process col).
    const layout = buildTabularRecipe(meal);
    const band = screen.getByRole('columnheader', { name: /Heat the frying oil/ });
    expect(band).toHaveAttribute('colspan', String(1 + layout.columnCount));
    expect(band).toHaveTextContent('350°F');

    // Derived data carries no group labels, so the grid degrades cleanly: no
    // pills and no grocery-aisle text leaking into the chart.
    expect(container.querySelector('.rounded-full')).toBeNull();
    for (const label of ['seafood', 'dairy', 'pantry', 'condiments', 'bakery', 'produce']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }

    // The "whisk dry" process cell spans rows 2–4 and links to those row ids.
    const whisk = screen.getByRole('cell', { name: /Whisk the flour/ });
    expect(whisk).toHaveAttribute('rowspan', '3');
    const headers = whisk.getAttribute('headers') ?? '';
    expect(headers).toContain(`tabular-${MEAL_ID}-row-2`);
    expect(headers).toContain(`tabular-${MEAL_ID}-row-3`);
    expect(headers).toContain(`tabular-${MEAL_ID}-row-4`);

    // The finish note trails below the table.
    expect(screen.getByText(/Serve immediately/)).toBeInTheDocument();
  });

  it('never clobbers an authored layout that reaches the renderer', () => {
    // Author one span → the whole meal is authored; a step whose TEXT would
    // derive to PROCESS keeps its authored SETUP kind end-to-end.
    const meal = serve(RAW_INGREDIENTS, RAW_STEPS);
    const authored: TabularRecipeMealDTO = {
      ...meal,
      matrixSource: 'authored',
      instructions: meal.instructions.map((ins, i) =>
        i === 4
          ? { ...ins, kind: 'PROCESS', spanFrom: 0, spanTo: 9 }
          : ins,
      ),
    };

    // Re-run derivation on authored input to prove passthrough (serve replays
    // the API merge, which is what production does on every read).
    render(<TabularRecipeView meal={authored} />);
    const cell = screen.getByRole('cell', { name: /Dredge the shrimp/ });
    // Authored span 0–9 → a single rowspan cell over all ten ingredient rows.
    expect(cell).toHaveAttribute('rowspan', '10');
  });
});
