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

  it('opts the meal name field out of password-manager autofill', async () => {
    renderForm('/meals/new');

    const name = screen.getByRole('textbox', { name: 'Name *' });
    expect(name).toHaveAttribute('data-1p-ignore');
    expect(name).toHaveAttribute('autocomplete', 'off');
  });
});

describe('MealFormPage instructions', () => {
  it('renders the steps section with an editable first row', async () => {
    renderForm('/meals/new');

    expect(screen.getByText('Steps')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Step 1 text' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Timer for step 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove step 1' }),
    ).toBeInTheDocument();
  });

  it('loads existing steps and timers when editing a meal', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Lasagna',
          description: '',
          placeholderKind: null,
          difficulty: null,
          familyId: FAMILY_ID,
          ingredients: [],
          instructions: [
            { id: 'step-1', mealId: 'm-1', position: 0, text: 'Boil noodles', timerMinutes: 12 },
            { id: 'step-2', mealId: 'm-1', position: 1, text: 'Assemble layers', timerMinutes: null },
          ],
        }),
      ),
    );

    renderForm('/meals/m-1/edit');

    const firstStep = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'Step 1 text',
    });
    await waitFor(() => expect(firstStep.value).toBe('Boil noodles'));
    expect(
      screen.getByRole<HTMLInputElement>('spinbutton', {
        name: 'Timer for Boil noodles',
      }).value,
    ).toBe('12');
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: 'Step 2 text' }).value,
    ).toBe('Assemble layers');
  });

  it('submits instructions with timers when creating a meal', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Tacos');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Step 1 text' }),
      'Warm the tortillas',
    );
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Timer for Warm the tortillas' }),
      '2',
    );
    await userEvent.click(screen.getByRole('button', { name: /\+ add step/i }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Step 2 text' }),
      'Assemble the tacos',
    );
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.instructions).toEqual([
      { text: 'Warm the tortillas', timerMinutes: 2 },
      { text: 'Assemble the tacos', timerMinutes: null },
    ]);
  });

  it('sends an empty instructions array when all steps are removed on update', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Lasagna',
          description: '',
          placeholderKind: null,
          difficulty: null,
          familyId: FAMILY_ID,
          ingredients: [],
          instructions: [
            { id: 'step-1', mealId: 'm-1', position: 0, text: 'Bake until bubbly', timerMinutes: 35 },
          ],
        }),
      ),
      http.put(`/api/families/${FAMILY_ID}/meals/m-1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/m-1/edit');

    expect(
      await screen.findByRole('button', { name: 'Remove Bake until bubbly' }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Bake until bubbly' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /update meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.instructions).toEqual([]);
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
    await userEvent.click(screen.getByRole('radio', { name: '5 stars' }));
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
    // 4th star should be active (aria-checked=true); 5th should not be.
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true'),
    );
    expect(screen.getByRole('radio', { name: '5 stars' })).toHaveAttribute('aria-checked', 'false');

    // Untoggle favorite and clear the rating by clicking the active (4th) star again.
    await userEvent.click(favorite);
    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
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

describe('MealFormPage tags', () => {
  it('sends a tags array when creating a meal', async () => {
    let body: { tags?: unknown } = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as { tags?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Tacos');
    await userEvent.type(screen.getByRole('combobox', { name: 'Tags' }), 'Weeknight{Enter}');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.tags).toEqual(['Weeknight']);
  });

  it('sends an empty tags array when none are assigned', async () => {
    let body: { tags?: unknown } = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as { tags?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Soup');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.tags).toEqual([]);
  });

  it('seeds existing tags and persists a removal on edit', async () => {
    let body: { tags?: unknown } = {};
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Lasagna',
          description: '',
          placeholderKind: null,
          difficulty: null,
          familyId: FAMILY_ID,
          tags: [
            { id: 't-1', name: 'Weeknight', familyId: FAMILY_ID },
            { id: 't-2', name: 'Vegetarian', familyId: FAMILY_ID },
          ],
          ingredients: [],
        }),
      ),
      http.put(`/api/families/${FAMILY_ID}/meals/m-1`, async ({ request }) => {
        body = (await request.json()) as { tags?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/m-1/edit');

    // Existing assignments hydrate as removable pills.
    expect(await screen.findByRole('button', { name: 'Remove Weeknight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Vegetarian' })).toBeInTheDocument();

    // Drop one tag, then save — the reduced array is sent.
    await userEvent.click(screen.getByRole('button', { name: 'Remove Vegetarian' }));
    await userEvent.click(screen.getByRole('button', { name: /update meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.tags).toEqual(['Weeknight']);
  });
});

describe('MealFormPage collections (#110)', () => {
  it('sends the collections array when creating a meal', async () => {
    let body: { collections?: unknown } = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as { collections?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Tacos');
    await userEvent.type(
      screen.getByRole('combobox', { name: /Collections/ }),
      'Weeknight Winners{Enter}',
    );
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.collections).toEqual(['Weeknight Winners']);
  });

  it('seeds existing collections and persists a removal on edit', async () => {
    let body: { collections?: unknown } = {};
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Lasagna',
          description: '',
          placeholderKind: null,
          difficulty: null,
          familyId: FAMILY_ID,
          collections: [
            { id: 'col-1', name: 'Weeknight Winners', familyId: FAMILY_ID, description: null },
            { id: 'col-2', name: 'Freezer Friendly', familyId: FAMILY_ID, description: null },
          ],
          ingredients: [],
        }),
      ),
      http.put(`/api/families/${FAMILY_ID}/meals/m-1`, async ({ request }) => {
        body = (await request.json()) as { collections?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/m-1/edit');

    // Existing memberships hydrate as removable pills.
    expect(
      await screen.findByRole('button', { name: 'Remove Weeknight Winners' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Freezer Friendly' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Freezer Friendly' }));
    await userEvent.click(screen.getByRole('button', { name: /update meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());
    expect(body.collections).toEqual(['Weeknight Winners']);
  });
});
