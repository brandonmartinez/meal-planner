import { describe, it, expect, vi } from 'vitest';
import {
  renderWithProviders,
  screen,
  fireEvent,
  waitFor,
  within,
} from '../test-utils/render';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import TemplateFormModal from './TemplateFormModal';
import type { PlanningTemplate } from '../api/templates';

const FAMILY_ID = 'f-1';

const meals = [
  {
    id: 'm-1',
    name: 'Tacos',
    description: null,
    placeholderKind: null,
    familyId: FAMILY_ID,
    difficulty: null,
    _count: { ingredients: 0 },
    recentlyScheduled: false,
    lastScheduledOn: null,
    lastCookedOn: null,
    timesCooked: 0,
  },
  {
    id: 'm-2',
    name: 'Pizza',
    description: null,
    placeholderKind: null,
    familyId: FAMILY_ID,
    difficulty: null,
    _count: { ingredients: 0 },
    recentlyScheduled: false,
    lastScheduledOn: null,
    lastCookedOn: null,
    timesCooked: 0,
  },
];

function mealsEnvelope(
  items: typeof meals,
  extra?: { total?: number; offset?: number; hasMore?: boolean },
) {
  return {
    items,
    total: extra?.total ?? items.length,
    limit: 100,
    offset: extra?.offset ?? 0,
    hasMore: extra?.hasMore ?? false,
  };
}

/** Register a meals handler returning the given list. */
function useMeals(items: typeof meals = meals) {
  server.use(
    http.get(`/api/families/${FAMILY_ID}/meals`, () =>
      HttpResponse.json(mealsEnvelope(items)),
    ),
  );
}

describe('TemplateFormModal', () => {
  it('renders the create heading and loads meals into the day selects', async () => {
    useMeals();
    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByText('New template')).toBeInTheDocument();

    // Meals populate every day select once loaded.
    const monday = await screen.findByLabelText('Add a meal to Monday');
    expect(within(monday).getByRole('option', { name: 'Tacos' })).toBeInTheDocument();
    expect(within(monday).getByRole('option', { name: 'Pizza' })).toBeInTheDocument();
    expect(screen.getByLabelText('Add a meal to Sunday')).toBeInTheDocument();
  });

  it('pages through the list-meals endpoint so >100 meals all load (limit>100 regression)', async () => {
    // The endpoint caps `limit` at 100; a single 500-item request 400s. The modal
    // must page (offset 0 → hasMore:true, offset 100 → hasMore:false) and merge
    // every page, or meals past the first 100 silently vanish.
    const pageOne = { ...meals[0], id: 'p1', name: 'First Page Meal' };
    const pageTwo = { ...meals[0], id: 'p2', name: 'Second Page Meal' };
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals`, ({ request }) => {
        const url = new URL(request.url);
        // Reject over-cap limits the way the real backend does, to prove the
        // client never sends limit>100.
        if (Number(url.searchParams.get('limit')) > 100) {
          return HttpResponse.json({ error: 'limit too high' }, { status: 400 });
        }
        const offset = Number(url.searchParams.get('offset') ?? '0');
        return HttpResponse.json(
          offset === 0
            ? mealsEnvelope([pageOne], { total: 2, offset: 0, hasMore: true })
            : mealsEnvelope([pageTwo], { total: 2, offset: 100, hasMore: false }),
        );
      }),
    );

    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const monday = await screen.findByLabelText('Add a meal to Monday');
    // A meal from the SECOND page proves paging merged both responses.
    expect(
      await within(monday).findByRole('option', { name: 'Second Page Meal' }),
    ).toBeInTheDocument();
    expect(
      within(monday).getByRole('option', { name: 'First Page Meal' }),
    ).toBeInTheDocument();
    // And no error banner surfaced (the over-cap request was never made).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('adds a meal pill to a day and resets the select', async () => {
    useMeals();
    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const monday = (await screen.findByLabelText(
      'Add a meal to Monday',
    )) as HTMLSelectElement;
    fireEvent.change(monday, { target: { value: 'm-1' } });

    expect(
      screen.getByRole('button', { name: 'Remove Tacos from Monday' }),
    ).toBeInTheDocument();
    // Controlled select snaps back to the placeholder.
    expect(monday.value).toBe('');
  });

  it('does not add the same meal to the same day twice', async () => {
    useMeals();
    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const monday = await screen.findByLabelText('Add a meal to Monday');
    fireEvent.change(monday, { target: { value: 'm-1' } });
    fireEvent.change(monday, { target: { value: 'm-1' } });

    expect(
      screen.getAllByRole('button', { name: 'Remove Tacos from Monday' }),
    ).toHaveLength(1);
  });

  it('removes a meal pill', async () => {
    useMeals();
    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    const monday = await screen.findByLabelText('Add a meal to Monday');
    fireEvent.change(monday, { target: { value: 'm-2' } });
    const remove = screen.getByRole('button', {
      name: 'Remove Pizza from Monday',
    });
    fireEvent.click(remove);

    expect(
      screen.queryByRole('button', { name: 'Remove Pizza from Monday' }),
    ).not.toBeInTheDocument();
  });

  it('shows an empty-meals hint when the family has no meals', async () => {
    useMeals([]);
    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(
      await screen.findByText(/no meals yet/i),
    ).toBeInTheDocument();
    // No day selects render without meals to place.
    expect(screen.queryByLabelText('Add a meal to Monday')).not.toBeInTheDocument();
  });

  it('surfaces a gentle note when meals fail to load but keeps the form usable', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /could not load meals/i,
    );
    // Name field is still editable.
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
  });

  it('requires a name before submitting', async () => {
    useMeals();
    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByLabelText('Add a meal to Monday');
    const form = screen.getByRole('button', { name: 'Create' }).closest('form');
    fireEvent.submit(form!);

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i);
  });

  it('creates a template and captures the POST body with entries', async () => {
    let body: {
      name: string;
      description: string | null;
      entries: { dayOfWeek: number; mealId: string }[];
    } | null = null;
    const onSaved = vi.fn();
    useMeals();
    server.use(
      http.post(`/api/families/${FAMILY_ID}/templates`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(
          {
            id: 't-new',
            name: body!.name,
            familyId: FAMILY_ID,
            description: body!.description,
            entries: [],
          },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'Taco Tuesday Week' },
    });
    fireEvent.change(screen.getByLabelText('Add a meal to Monday'), {
      target: { value: 'm-1' },
    });
    fireEvent.change(screen.getByLabelText('Add a meal to Tuesday'), {
      target: { value: 'm-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(body).toEqual({
      name: 'Taco Tuesday Week',
      description: null,
      entries: [
        { dayOfWeek: 0, mealId: 'm-1' },
        { dayOfWeek: 1, mealId: 'm-2' },
      ],
    });
  });

  it('edits an existing template: pre-fills fields and PATCHes changes', async () => {
    const template: PlanningTemplate = {
      id: 't-1',
      name: 'Taco Week',
      familyId: FAMILY_ID,
      description: 'Weekly tacos',
      entries: [{ id: 'e-1', templateId: 't-1', dayOfWeek: 0, mealId: 'm-1' }],
    };
    let body: { name?: string } | null = null;
    const onSaved = vi.fn();
    useMeals();
    server.use(
      http.patch(
        `/api/families/${FAMILY_ID}/templates/t-1`,
        async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json({ ...template, name: body!.name });
        },
      ),
    );

    renderWithProviders(
      <TemplateFormModal
        familyId={FAMILY_ID}
        template={template}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByText('Edit template')).toBeInTheDocument();
    const nameInput = (await screen.findByLabelText(
      /^Name/,
    )) as HTMLInputElement;
    expect(nameInput.value).toBe('Taco Week');
    // Existing entry pre-fills as a removable pill (meal name resolved).
    expect(
      await screen.findByRole('button', { name: 'Remove Tacos from Monday' }),
    ).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Taco Week v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(body!.name).toBe('Taco Week v2');
  });
});
