import { vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, fireEvent, waitFor } from '../test-utils/render';
import TemplatesPage from './TemplatesPage';

const FAMILY_ID = 'fam-1';
const templatesUrl = `/api/families/${FAMILY_ID}/templates`;
const mealsUrl = `/api/families/${FAMILY_ID}/meals`;

function authMe(role: 'PARENT' | 'MEMBER') {
  return http.get('/api/auth/me', () =>
    HttpResponse.json({
      id: 'u-1',
      email: 'a@b.com',
      name: 'Alice',
      avatarUrl: null,
      memberships: [
        {
          id: 'm-1',
          role,
          familyId: FAMILY_ID,
          userId: 'u-1',
          family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
        },
      ],
    }),
  );
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    name: 'Busy Weeknights',
    familyId: FAMILY_ID,
    description: null,
    entries: [],
    ...overrides,
  };
}

/** Empty meals list so the create/edit modal can open without a real catalog. */
function emptyMeals() {
  return http.get(mealsUrl, () =>
    HttpResponse.json({ items: [], total: 0, limit: 500, offset: 0, hasMore: false }),
  );
}

describe('TemplatesPage', () => {
  it('shows a loading spinner while templates resolve', async () => {
    server.use(
      authMe('PARENT'),
      http.get(templatesUrl, async () => {
        await delay();
        return HttpResponse.json({ templates: [] });
      }),
    );

    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByText('Loading templates…')).toBeInTheDocument();
  });

  it('renders an empty state with a create CTA for parents', async () => {
    server.use(
      authMe('PARENT'),
      http.get(templatesUrl, () => HttpResponse.json({ templates: [] })),
    );

    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'New template' }).length,
    ).toBeGreaterThan(0);
  });

  it('hides create/manage controls for non-parent members', async () => {
    server.use(
      authMe('MEMBER'),
      http.get(templatesUrl, () => HttpResponse.json({ templates: [] })),
    );

    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(
      screen.getByText('A parent can create templates to save reusable week blueprints.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New template' })).not.toBeInTheDocument();
  });

  it('renders template rows with a blurb and a meal/day count summary', async () => {
    server.use(
      authMe('MEMBER'),
      http.get(templatesUrl, () =>
        HttpResponse.json({
          templates: [
            template({
              name: 'Sunday Reset',
              description: 'Comfort food to start the week',
              entries: [
                { id: 'e-1', templateId: 't-1', dayOfWeek: 0, mealId: 'm-1' },
                { id: 'e-2', templateId: 't-1', dayOfWeek: 1, mealId: 'm-2' },
              ],
            }),
          ],
        }),
      ),
    );

    renderWithProviders(<TemplatesPage />);

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Sunday Reset' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Comfort food to start the week')).toBeInTheDocument();
    expect(screen.getByText('2 meals across 2 days')).toBeInTheDocument();
    // Members cannot edit/delete.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('singularizes the count summary for a one-meal, one-day template', async () => {
    server.use(
      authMe('MEMBER'),
      http.get(templatesUrl, () =>
        HttpResponse.json({
          templates: [
            template({
              name: 'Solo',
              entries: [{ id: 'e-1', templateId: 't-1', dayOfWeek: 3, mealId: 'm-1' }],
            }),
          ],
        }),
      ),
    );

    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByText('1 meal across 1 day')).toBeInTheDocument();
  });

  it('creates a template through the modal and refreshes the list', async () => {
    server.use(
      authMe('PARENT'),
      emptyMeals(),
      http.get(templatesUrl, () => HttpResponse.json({ templates: [] })),
      http.post(templatesUrl, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json(
          template({ id: 't-new', name: body.name, entries: [] }),
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<TemplatesPage />);

    await screen.findByText('No templates yet');
    fireEvent.click(screen.getAllByRole('button', { name: 'New template' })[0]);

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'Holiday Week' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Holiday Week' }),
    ).toBeInTheDocument();
  });

  it('edits an existing template', async () => {
    server.use(
      authMe('PARENT'),
      emptyMeals(),
      http.get(templatesUrl, () =>
        HttpResponse.json({ templates: [template({ name: 'Old Name' })] }),
      ),
      http.patch(`${templatesUrl}/t-1`, async ({ request }) => {
        const body = (await request.json()) as { name?: string };
        return HttpResponse.json(template({ name: body.name ?? 'Old Name' }));
      }),
    );

    renderWithProviders(<TemplatesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'New Name' }),
    ).toBeInTheDocument();
  });

  it('deletes a template when a parent confirms', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleted = false;
    server.use(
      authMe('PARENT'),
      http.get(templatesUrl, () =>
        HttpResponse.json({ templates: [template({ name: 'Doomed' })] }),
      ),
      http.delete(`${templatesUrl}/t-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<TemplatesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { level: 2, name: 'Doomed' }),
      ).not.toBeInTheDocument(),
    );
    confirmSpy.mockRestore();
  });

  it('surfaces an error when delete is rejected (403)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      authMe('PARENT'),
      http.get(templatesUrl, () =>
        HttpResponse.json({ templates: [template({ name: 'Protected' })] }),
      ),
      http.delete(`${templatesUrl}/t-1`, () =>
        HttpResponse.json({ error: 'parent role required' }, { status: 403 }),
      ),
    );

    renderWithProviders(<TemplatesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('parent role required')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Protected' }),
    ).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('shows an error state with a working retry', async () => {
    let attempt = 0;
    server.use(
      authMe('PARENT'),
      http.get(templatesUrl, () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json({ error: 'boom' }, { status: 500 });
        }
        return HttpResponse.json({ templates: [template({ name: 'Recovered' })] });
      }),
    );

    renderWithProviders(<TemplatesPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom');

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Recovered' }),
    ).toBeInTheDocument();
  });
});
