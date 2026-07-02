import { vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import MealFormPage from './MealFormPage';

const FAMILY_ID = 'fam-1';

// Focus these tests on the form behaviour; family resolution is covered by
// useFamily's own tests. Mocking it keeps the difficulty assertions deterministic.
vi.mock('../hooks/useFamily', () => ({
  useFamily: () => ({
    familyId: FAMILY_ID,
    family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
    families: [{ id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' }],
    switchFamily: vi.fn(),
    hasFamilies: true,
  }),
}));

function renderForm(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meals/new" element={<MealFormPage />} />
        <Route path="/meals/:mealId/edit" element={<MealFormPage />} />
        <Route path="/meals" element={<div>MEALS LIST</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MealFormPage difficulty', () => {
  it('sends the selected difficulty when creating a meal', async () => {
    let body: { difficulty?: unknown } = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as { difficulty?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getAllByRole('textbox')[0], 'Tacos');
    await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'MEDIUM');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.difficulty).toBe('MEDIUM');
  });

  it('defaults to None and sends null difficulty', async () => {
    let body: { difficulty?: unknown } = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as { difficulty?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getAllByRole('textbox')[0], 'Soup');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.difficulty).toBeNull();
  });

  it('loads an existing difficulty and can clear it back to null', async () => {
    let body: { difficulty?: unknown } = {};
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Lasagna',
          description: '',
          placeholderKind: null,
          difficulty: 'MEDIUM',
          familyId: FAMILY_ID,
          ingredients: [],
        }),
      ),
      http.put(`/api/families/${FAMILY_ID}/meals/m-1`, async ({ request }) => {
        body = (await request.json()) as { difficulty?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/m-1/edit');

    // The select should reflect the persisted difficulty once the meal loads.
    const select = await screen.findByLabelText<HTMLSelectElement>('Difficulty');
    await waitFor(() => expect(select.value).toBe('MEDIUM'));

    // Clear it back to "None" and save.
    await userEvent.selectOptions(select, '');
    await userEvent.click(screen.getByRole('button', { name: /update meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.difficulty).toBeNull();
  });
});

describe('MealFormPage core metadata', () => {
  it('sends prep/cook/servings/sourceUrl/notes when creating a meal', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Tacos');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Prep time (min)' }), '10');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Cook time (min)' }), '20');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Servings' }), '4');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Source URL' }),
      'https://example.com/tacos',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Image URL' }),
      'https://cdn.example.com/tacos.jpg',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'Use fresh cilantro');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body).toMatchObject({
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      servings: 4,
      sourceUrl: 'https://example.com/tacos',
      imageUrl: 'https://cdn.example.com/tacos.jpg',
      notes: 'Use fresh cilantro',
    });
  });

  it('sends nulls for blank metadata fields on create', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Soup');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body).toMatchObject({
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      servings: null,
      sourceUrl: null,
      imageUrl: null,
      notes: null,
    });
  });

  it('populates metadata inputs from an existing meal and can clear them', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Lasagna',
          description: '',
          placeholderKind: null,
          difficulty: null,
          prepTimeMinutes: 15,
          cookTimeMinutes: 45,
          servings: 6,
          sourceUrl: 'https://example.com/lasagna',
          imageUrl: 'https://cdn.example.com/lasagna.jpg',
          notes: 'Rest before slicing',
          familyId: FAMILY_ID,
          ingredients: [],
        }),
      ),
      http.put(`/api/families/${FAMILY_ID}/meals/m-1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/m-1/edit');

    const prep = await screen.findByRole<HTMLInputElement>('spinbutton', {
      name: 'Prep time (min)',
    });
    await waitFor(() => expect(prep.value).toBe('15'));
    expect(
      screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Servings' }).value,
    ).toBe('6');
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: 'Source URL' }).value,
    ).toBe('https://example.com/lasagna');
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: 'Image URL' }).value,
    ).toBe('https://cdn.example.com/lasagna.jpg');

    // Clear source URL + image URL + notes, then save — cleared strings become null.
    await userEvent.clear(screen.getByRole('textbox', { name: 'Source URL' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Image URL' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Notes' }));
    await userEvent.click(screen.getByRole('button', { name: /update meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body).toMatchObject({
      prepTimeMinutes: 15,
      servings: 6,
      sourceUrl: null,
      imageUrl: null,
      notes: null,
    });
  });
});

describe('MealFormPage favorite and rating', () => {
  it('sends favorite=true and a rating when creating a meal', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Tacos');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Favorite' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Rating (1–5)' }), '5');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body).toMatchObject({ favorite: true, rating: 5 });
  });

  it('defaults favorite to false and rating to null on create', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Soup');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body).toMatchObject({ favorite: false, rating: null });
  });

  it('populates favorite and rating from an existing meal and can clear the rating', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Lasagna',
          description: '',
          placeholderKind: null,
          difficulty: null,
          favorite: true,
          rating: 4,
          familyId: FAMILY_ID,
          ingredients: [],
        }),
      ),
      http.put(`/api/families/${FAMILY_ID}/meals/m-1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/m-1/edit');

    const favorite = await screen.findByRole<HTMLInputElement>('checkbox', {
      name: 'Favorite',
    });
    await waitFor(() => expect(favorite.checked).toBe(true));
    const ratingInput = screen.getByRole<HTMLInputElement>('spinbutton', {
      name: 'Rating (1–5)',
    });
    expect(ratingInput.value).toBe('4');

    // Untoggle favorite and clear the rating, then save.
    await userEvent.click(favorite);
    await userEvent.clear(ratingInput);
    await userEvent.click(screen.getByRole('button', { name: /update meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body).toMatchObject({ favorite: false, rating: null });
  });
});

describe('MealFormPage accessibility', () => {
  it('associates accessible names with the meal name and description controls', async () => {
    renderForm('/meals/new');

    // Labels are programmatically associated via htmlFor/id, so each control is
    // reachable by its accessible name rather than DOM order.
    expect(screen.getByRole('textbox', { name: 'Name *' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Difficulty' })).toBeInTheDocument();
  });

  it('gives each ingredient control and its remove button an accessible name', async () => {
    renderForm('/meals/new');

    // First ingredient row uses positional labels until the user names it.
    expect(screen.getByRole('textbox', { name: 'Ingredient 1 name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Quantity for ingredient 1' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Unit for ingredient 1' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Category for ingredient 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove ingredient 1' })).toBeInTheDocument();

    // Once named, the remove control announces the ingredient by name.
    await userEvent.type(screen.getByRole('textbox', { name: 'Ingredient 1 name' }), 'Garlic');
    expect(screen.getByRole('button', { name: 'Remove Garlic' })).toBeInTheDocument();
  });

  it('announces a save failure through an alert region', async () => {
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json({ error: 'Failed to save meal' }, { status: 500 }),
      ),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Tacos');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to save meal');
  });
});
