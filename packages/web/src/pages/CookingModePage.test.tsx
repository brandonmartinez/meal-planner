import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import CookingModePage from './CookingModePage';

const FAMILY_ID = 'fam-1';

// Family resolution has its own tests; mock it so cooking-mode assertions stay
// deterministic and focused on the checklist/step/timer behavior.
vi.mock('../hooks/useFamily', () => ({
  useFamily: () => ({
    familyId: FAMILY_ID,
    family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
    families: [{ id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' }],
    switchFamily: vi.fn(),
    hasFamilies: true,
  }),
}));

function meal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    name: 'Tacos',
    description: '',
    placeholderKind: null,
    difficulty: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    servings: null,
    sourceUrl: null,
    notes: null,
    familyId: FAMILY_ID,
    ingredients: [],
    instructions: [],
    ...overrides,
  };
}

function renderCooking(mealId = 'm-1') {
  return render(
    <MemoryRouter initialEntries={[`/meals/${mealId}/cook`]}>
      <Routes>
        <Route path="/meals/:mealId/cook" element={<CookingModePage />} />
        <Route path="/meals/:mealId" element={<div>DETAIL</div>} />
        <Route path="/meals" element={<div>MEALS LIST</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CookingModePage', () => {
  it('shows a loading spinner before the meal resolves', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, async () => {
        await delay();
        return HttpResponse.json(meal());
      }),
    );

    renderCooking();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Tacos', level: 1 })).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    renderCooking();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load recipe');
  });

  it('renders the ingredient checklist and cooking steps', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(
          meal({
            name: 'Chicken Curry',
            ingredients: [
              { id: 'i-1', name: 'chicken', quantity: '500', unit: 'g', mealId: 'm-1' },
              { id: 'i-2', name: 'onion', quantity: '1', unit: '', mealId: 'm-1' },
            ],
            instructions: [
              { id: 's-1', mealId: 'm-1', position: 0, text: 'Chop the onion', timerMinutes: null },
              { id: 's-2', mealId: 'm-1', position: 1, text: 'Simmer the curry', timerMinutes: 10 },
            ],
          }),
        ),
      ),
    );

    renderCooking();

    expect(
      await screen.findByRole('heading', { name: 'Chicken Curry', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '500 g chicken' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '1 onion' })).toBeInTheDocument();
    expect(screen.getByText('Chop the onion')).toBeInTheDocument();
    expect(screen.getByText('Simmer the curry')).toBeInTheDocument();
    // Only the step with timerMinutes gets a timer control.
    expect(
      screen.getByRole('button', { name: 'Start 10-minute timer for step 2' }),
    ).toBeInTheDocument();
  });

  it('renders steps in position order even when the payload is unsorted', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(
          meal({
            instructions: [
              { id: 's-2', mealId: 'm-1', position: 1, text: 'Second step', timerMinutes: null },
              { id: 's-1', mealId: 'm-1', position: 0, text: 'First step', timerMinutes: null },
            ],
          }),
        ),
      ),
    );

    renderCooking();

    await screen.findByRole('heading', { name: 'Tacos', level: 1 });
    const items = screen.getAllByRole('listitem').map(el => el.textContent);
    const first = items.findIndex(t => t?.includes('First step'));
    const second = items.findIndex(t => t?.includes('Second step'));
    expect(first).toBeLessThan(second);
  });

  it('toggles an ingredient on and off via the checklist', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(
          meal({
            ingredients: [
              { id: 'i-1', name: 'chicken', quantity: '500', unit: 'g', mealId: 'm-1' },
            ],
          }),
        ),
      ),
    );

    renderCooking();

    const box = await screen.findByRole('checkbox', { name: '500 g chicken' });
    expect(box).not.toBeChecked();

    await user.click(box);
    expect(box).toBeChecked();

    await user.click(box);
    expect(box).not.toBeChecked();
  });

  it('updates the progress summary as steps are completed', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(
          meal({
            instructions: [
              { id: 's-1', mealId: 'm-1', position: 0, text: 'Step one', timerMinutes: null },
              { id: 's-2', mealId: 'm-1', position: 1, text: 'Step two', timerMinutes: null },
            ],
          }),
        ),
      ),
    );

    renderCooking();

    expect(await screen.findByText('0 of 2 steps done')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Mark step 1 complete' }));
    expect(screen.getByText('1 of 2 steps done')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Mark step 2 complete' }));
    expect(screen.getByText('2 of 2 steps done')).toBeInTheDocument();
  });

  it('offers an exit link back to the recipe detail page', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(meal()),
      ),
    );

    renderCooking();

    const exit = await screen.findByRole('link', { name: /exit cooking mode/i });
    expect(exit).toHaveAttribute('href', '/meals/m-1');
  });

  it('shows a non-recipe message for placeholder meals', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(meal({ name: 'Leftovers', placeholderKind: 'LEFTOVERS' })),
      ),
    );

    renderCooking();

    expect(await screen.findByText(/nothing to cook/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ingredients' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to recipe/i })).toHaveAttribute(
      'href',
      '/meals/m-1',
    );
  });

  it('notes when a recipe has no ingredients or steps', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(meal({ ingredients: [], instructions: [] })),
      ),
    );

    renderCooking();

    await screen.findByRole('heading', { name: 'Tacos', level: 1 });
    expect(screen.getByText('No ingredients listed.')).toBeInTheDocument();
    expect(screen.getByText(/no steps listed/i)).toBeInTheDocument();
  });
});

describe('CookingModePage — List/Grid toggle', () => {
  const realMatchMedia = window.matchMedia;

  /** Force the `(min-width: 640px)` probe used by CookingModePage to a fixed
   *  result so we can exercise the wide (Grid) and narrow (degrade) branches. */
  function setViewportWide(wide: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width') ? wide : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  /** A meal carrying the effective tabular fields the Grid renderer consumes. */
  function tabularMeal() {
    return meal({
      name: 'Cookies',
      ingredients: [
        {
          id: 'i-1',
          name: 'Butter',
          quantity: '1',
          unit: 'cup',
          mealId: 'm-1',
          position: 0,
          groupLabel: null,
        },
        {
          id: 'i-2',
          name: 'Sugar',
          quantity: '1',
          unit: 'cup',
          mealId: 'm-1',
          position: 1,
          groupLabel: null,
        },
      ],
      instructions: [
        {
          id: 's-1',
          mealId: 'm-1',
          position: 0,
          text: 'cream together',
          timerMinutes: null,
          kind: 'PROCESS',
          subLabel: null,
          spanFrom: 0,
          spanTo: 1,
        },
      ],
      matrixSource: 'derived',
      ingredientDisplayOrder: [0, 1],
    });
  }

  it('defaults to List and switches to Grid, persisting the choice', async () => {
    setViewportWide(true);
    const user = userEvent.setup();
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(tabularMeal()),
      ),
    );

    renderCooking();

    // List is the default: the ingredient checklist renders, no grid table.
    await screen.findByRole('heading', { name: 'Cookies', level: 1 });
    expect(
      screen.getByRole('checkbox', { name: '1 cup Butter' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Grid' }));

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '1 cup Butter' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('recipeViewMode')).toBe('grid');
  });

  it('opens in Grid on a wide screen when Grid is the persisted preference', async () => {
    setViewportWide(true);
    window.localStorage.setItem('recipeViewMode', 'grid');
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(tabularMeal()),
      ),
    );

    renderCooking();

    await screen.findByRole('heading', { name: 'Cookies', level: 1 });
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('degrades Grid to List on a narrow screen', async () => {
    setViewportWide(false);
    window.localStorage.setItem('recipeViewMode', 'grid');
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(tabularMeal()),
      ),
    );

    renderCooking();

    await screen.findByRole('heading', { name: 'Cookies', level: 1 });
    // Even though Grid is selected, the narrow viewport shows List.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: '1 cup Butter' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/opens on larger screens/i)).toBeInTheDocument();
  });

  it('shows the full step text in List but a terse label in Grid', async () => {
    setViewportWide(true);
    const user = userEvent.setup();
    const full = 'Cream the butter and sugar, then beat in the eggs';
    const withFullStep = () => {
      const base = tabularMeal();
      base.instructions[0] = { ...base.instructions[0], text: full };
      return base;
    };
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(withFullStep()),
      ),
    );

    renderCooking();

    // List (default) is the lossless equivalent: full sentence is present.
    await screen.findByRole('heading', { name: 'Cookies', level: 1 });
    expect(screen.getByText(full)).toBeInTheDocument();

    // Grid shortens to the leading clause; full text stays in the cell title.
    await user.click(screen.getByRole('button', { name: 'Grid' }));
    expect(screen.queryByText(full)).not.toBeInTheDocument();
    const cell = screen.getByRole('cell', { name: 'Cream the butter and sugar' });
    expect(cell).toHaveAttribute('title', full);
  });
});
