import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import MealDetailPage from './MealDetailPage';

const FAMILY_ID = 'fam-1';

// Family resolution is covered by useFamily's own tests; mock it so the detail
// assertions stay deterministic and focused on rendering the meal.
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
    ...overrides,
  };
}

function renderDetail(mealId = 'm-1') {
  return render(
    <MemoryRouter initialEntries={[`/meals/${mealId}`]}>
      <Routes>
        <Route path="/meals/:mealId" element={<MealDetailPage />} />
        <Route path="/meals" element={<div>MEALS LIST</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MealDetailPage', () => {
  it('shows a loading spinner before the meal resolves', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, async () => {
        await delay();
        return HttpResponse.json(meal());
      }),
    );

    renderDetail();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Tacos' })).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load recipe');
    expect(screen.getByRole('link', { name: /back to meals/i })).toBeInTheDocument();
  });

  it('renders the full recipe metadata for a normal meal', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(
          meal({
            name: 'Chicken Curry',
            description: 'Weeknight favourite',
            difficulty: 'MEDIUM',
            prepTimeMinutes: 15,
            cookTimeMinutes: 30,
            servings: 4,
            sourceUrl: 'https://example.com/curry',
            imageUrl: 'https://cdn.example.com/curry.jpg',
            notes: 'Add extra chili for heat.',
            ingredients: [
              { id: 'i-1', name: 'chicken', quantity: '500', unit: 'g', mealId: 'm-1' },
              { id: 'i-2', name: 'onion', quantity: '1', unit: '', mealId: 'm-1' },
            ],
          }),
        ),
      ),
    );

    renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'Chicken Curry', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Difficulty: Medium')).toBeInTheDocument();
    expect(screen.getByText('15 min')).toBeInTheDocument();
    expect(screen.getByText('30 min')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    const source = screen.getByRole('link', { name: 'https://example.com/curry' });
    expect(source).toHaveAttribute('href', 'https://example.com/curry');
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');

    const image = screen.getByRole('img', { name: 'Chicken Curry' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/curry.jpg');

    expect(screen.getByText('500 g chicken')).toBeInTheDocument();
    expect(screen.getByText('1 onion')).toBeInTheDocument();
    expect(screen.getByText('Add extra chili for heat.')).toBeInTheDocument();
  });

  it('omits optional sections when the meal has no ingredients or notes', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(meal({ name: 'Plain', ingredients: [] })),
      ),
    );

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Plain' })).toBeInTheDocument();
    expect(screen.getByText('No ingredients listed.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument();
    // No imageUrl on this meal → no <img> renders (graceful missing-image).
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a non-recipe state for placeholder meals', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(
          meal({ name: 'Leftovers', placeholderKind: 'LEFTOVERS' }),
        ),
      ),
    );

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Leftovers' })).toBeInTheDocument();
    expect(screen.getByText(/built-in scheduling option/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to meals/i })).toBeInTheDocument();
    // No recipe scaffolding for placeholders.
    expect(screen.queryByRole('heading', { name: 'Ingredients' })).not.toBeInTheDocument();
  });

  it('shows a "Start cooking" CTA linking to cooking mode for a real meal', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(meal({ name: 'Chicken Curry' })),
      ),
    );

    renderDetail();

    const cta = await screen.findByRole('link', { name: /start cooking/i });
    expect(cta).toHaveAttribute('href', '/meals/m-1/cook');
  });

  it('does not show a "Start cooking" CTA for placeholder meals', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(meal({ name: 'Leftovers', placeholderKind: 'LEFTOVERS' })),
      ),
    );

    renderDetail();

    await screen.findByRole('heading', { name: 'Leftovers' });
    expect(screen.queryByRole('link', { name: /start cooking/i })).not.toBeInTheDocument();
  });
});

describe('MealDetailPage collections (#110)', () => {
  it('links each collection the meal belongs to', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(
          meal({
            collections: [
              { id: 'col-1', name: 'Weeknight Winners', familyId: FAMILY_ID, description: null },
              { id: 'col-2', name: 'Freezer Friendly', familyId: FAMILY_ID, description: null },
            ],
          }),
        ),
      ),
    );

    renderDetail();

    await screen.findByRole('heading', { name: 'Tacos' });
    expect(screen.getByText('In collections')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Weeknight Winners/ }),
    ).toHaveAttribute('href', '/collections/col-1');
    expect(
      screen.getByRole('link', { name: /Freezer Friendly/ }),
    ).toHaveAttribute('href', '/collections/col-2');
  });

  it('omits the collections section when the meal is in none', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/:mealId`, () =>
        HttpResponse.json(meal({ collections: [] })),
      ),
    );

    renderDetail();

    await screen.findByRole('heading', { name: 'Tacos' });
    expect(screen.queryByText('In collections')).not.toBeInTheDocument();
  });
});
