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

// ---------------------------------------------------------------------------
// Choice slot authoring (#226)
// ---------------------------------------------------------------------------

describe('MealFormPage choice slots (#226)', () => {
  it('renders no choice slots by default and shows the "Add Slot" button', () => {
    renderForm('/meals/new');
    expect(screen.getByRole('button', { name: /add slot/i })).toBeInTheDocument();
    expect(screen.getByText(/no choice slots yet/i)).toBeInTheDocument();
  });

  it('adds a slot section with slot name input when "Add Slot" is clicked', async () => {
    renderForm('/meals/new');
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    expect(screen.getByLabelText('Slot name')).toBeInTheDocument();
    // first slot comes with one option and an Add Option button
    expect(screen.getByRole('button', { name: /add option/i })).toBeInTheDocument();
  });

  it('adds a second option when "Add Option" is clicked', async () => {
    renderForm('/meals/new');
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    await userEvent.click(screen.getByRole('button', { name: /add option/i }));
    expect(screen.getAllByLabelText('Option name')).toHaveLength(2);
  });

  it('removes an option when its Remove button is clicked', async () => {
    renderForm('/meals/new');
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    await userEvent.click(screen.getByRole('button', { name: /add option/i }));
    expect(screen.getAllByLabelText('Option name')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Remove option 2' }));
    expect(screen.getAllByLabelText('Option name')).toHaveLength(1);
  });

  it('removes the slot when its Remove button is clicked', async () => {
    renderForm('/meals/new');
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    expect(screen.getByLabelText('Slot name')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove slot 1' }));
    expect(screen.queryByLabelText('Slot name')).toBeNull();
    expect(screen.getByText(/no choice slots yet/i)).toBeInTheDocument();
  });

  it('adds an additive ingredient row to an option', async () => {
    renderForm('/meals/new');
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    // There are two "Add Ingredient" buttons: one for the main list, one for the option.
    // The option's button is always last in the DOM.
    const addIngBtn = screen.getAllByRole('button', { name: /add ingredient/i }).at(-1)!;
    await userEvent.click(addIngBtn);
    expect(screen.getByLabelText('Name for option ingredient 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity for option ingredient 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit for option ingredient 1')).toBeInTheDocument();
  });

  it('removes an additive ingredient row from an option', async () => {
    renderForm('/meals/new');
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    const addIngBtn = screen.getAllByRole('button', { name: /add ingredient/i }).at(-1)!;
    await userEvent.click(addIngBtn);
    await userEvent.click(screen.getByRole('button', { name: 'Remove option ingredient 1' }));
    expect(screen.queryByLabelText('Name for option ingredient 1')).toBeNull();
    expect(screen.getByText(/no additive ingredients/i)).toBeInTheDocument();
  });

  it('serializes choiceSlots with options and additive ingredients on create', async () => {
    let body: { choiceSlots?: unknown } = {};
    server.use(
      http.post(`/api/families/${FAMILY_ID}/meals`, async ({ request }) => {
        body = (await request.json()) as { choiceSlots?: unknown };
        return HttpResponse.json({ id: 'm-new' });
      }),
    );

    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Pasta');

    // Add a slot named "Protein"
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    await userEvent.type(screen.getByLabelText('Slot name'), 'Protein');

    // Name the first option "Chicken"
    await userEvent.type(screen.getByLabelText('Option name'), 'Chicken');

    // Add an ingredient to that option
    const addIngBtn = screen.getAllByRole('button', { name: /add ingredient/i }).at(-1)!;
    await userEvent.click(addIngBtn);
    // Type qty/unit before name — typing the name updates the aria-label to use it
    await userEvent.type(screen.getByLabelText('Quantity for option ingredient 1'), '200');
    await userEvent.type(screen.getByLabelText('Unit for option ingredient 1'), 'g');
    await userEvent.type(screen.getByLabelText('Name for option ingredient 1'), 'chicken breast');

    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));
    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());

    expect(body.choiceSlots).toEqual([
      {
        name: 'Protein',
        options: [
          {
            name: 'Chicken',
            ingredients: [
              { name: 'chicken breast', quantity: '200', unit: 'g', category: undefined },
            ],
          },
        ],
      },
    ]);
  });

  it('validates that a slot without a name shows an error before submitting', async () => {
    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Pasta');
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    // leave slot name blank, fill option name
    await userEvent.type(screen.getByLabelText('Option name'), 'Chicken');
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/choice slot 1 needs a name/i);
  });

  it('validates that an option without a name shows an error before submitting', async () => {
    renderForm('/meals/new');

    await userEvent.type(screen.getByRole('textbox', { name: 'Name *' }), 'Pasta');
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    await userEvent.type(screen.getByLabelText('Slot name'), 'Protein');
    // leave option name blank
    await userEvent.click(screen.getByRole('button', { name: /create meal/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/every option in "Protein" needs a name/i);
  });

  it('hydrates existing choice slots from the API on edit', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Pasta',
          description: '',
          placeholderKind: null,
          difficulty: null,
          familyId: FAMILY_ID,
          ingredients: [],
          slots: [
            {
              id: 'slot-1',
              mealId: 'm-1',
              name: 'Protein',
              position: 0,
              options: [
                {
                  id: 'opt-1',
                  slotId: 'slot-1',
                  name: 'Chicken',
                  position: 0,
                  ingredients: [
                    {
                      id: 'oi-1',
                      optionId: 'opt-1',
                      name: 'chicken breast',
                      quantity: '200',
                      unit: 'g',
                      category: null,
                      position: 0,
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );

    renderForm('/meals/m-1/edit');

    // Wait for the form to hydrate
    const slotNameInput = await screen.findByLabelText('Slot name');
    expect((slotNameInput as HTMLInputElement).value).toBe('Protein');

    const optionNameInput = screen.getByLabelText('Option name');
    expect((optionNameInput as HTMLInputElement).value).toBe('Chicken');

    // Additive ingredient is hydrated
    const ingredientNameInput = screen.getByLabelText('Name for chicken breast');
    expect((ingredientNameInput as HTMLInputElement).value).toBe('chicken breast');
  });

  it('sends the full choiceSlots array on update (including removals)', async () => {
    let body: { choiceSlots?: unknown } = {};
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
        HttpResponse.json({
          id: 'm-1',
          name: 'Pasta',
          description: '',
          placeholderKind: null,
          difficulty: null,
          familyId: FAMILY_ID,
          ingredients: [],
          slots: [
            {
              id: 'slot-1',
              mealId: 'm-1',
              name: 'Protein',
              position: 0,
              options: [
                {
                  id: 'opt-1',
                  slotId: 'slot-1',
                  name: 'Chicken',
                  position: 0,
                  ingredients: [],
                },
                {
                  id: 'opt-2',
                  slotId: 'slot-1',
                  name: 'Tofu',
                  position: 1,
                  ingredients: [],
                },
              ],
            },
          ],
        }),
      ),
      http.put(`/api/families/${FAMILY_ID}/meals/m-1`, async ({ request }) => {
        body = (await request.json()) as { choiceSlots?: unknown };
        return HttpResponse.json({ id: 'm-1' });
      }),
    );

    renderForm('/meals/m-1/edit');

    // Wait for hydration
    await screen.findByLabelText('Slot name');

    // Remove the second option (Tofu)
    await userEvent.click(screen.getByRole('button', { name: 'Remove option 2' }));
    await userEvent.click(screen.getByRole('button', { name: /update meal/i }));

    await waitFor(() => expect(screen.getByText('MEALS LIST')).toBeInTheDocument());

    expect(body.choiceSlots).toEqual([
      {
        name: 'Protein',
        options: [{ name: 'Chicken', ingredients: [] }],
      },
    ]);
  });

  it('moves slots up and down via reorder buttons', async () => {
    renderForm('/meals/new');

    // Add two slots
    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    const slotNames = screen.getAllByLabelText('Slot name');
    await userEvent.type(slotNames[0], 'Protein');

    await userEvent.click(screen.getByRole('button', { name: /add slot/i }));
    const slotNames2 = screen.getAllByLabelText('Slot name');
    await userEvent.type(slotNames2[1], 'Sauce');

    // Slot 1 up arrow disabled, slot 2 down arrow disabled
    expect(screen.getByRole('button', { name: 'Move slot 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move slot 2 down' })).toBeDisabled();

    // Move slot 2 up → Sauce becomes slot 1
    await userEvent.click(screen.getByRole('button', { name: 'Move slot 2 up' }));
    const reorderedInputs = screen.getAllByLabelText('Slot name');
    expect((reorderedInputs[0] as HTMLInputElement).value).toBe('Sauce');
    expect((reorderedInputs[1] as HTMLInputElement).value).toBe('Protein');
  });
});
