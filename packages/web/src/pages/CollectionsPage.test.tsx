import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, fireEvent, waitFor } from '../test-utils/render';
import CollectionsPage from './CollectionsPage';

const FAMILY_ID = 'fam-1';

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

function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'col-1',
    name: 'Weeknight Winners',
    familyId: FAMILY_ID,
    description: null,
    ...overrides,
  };
}

function mealsPage(items: Array<{ id: string; name: string }> = []) {
  return http.get(`/api/families/${FAMILY_ID}/meals`, () =>
    HttpResponse.json({
      items,
      total: items.length,
      limit: 100,
      offset: 0,
      hasMore: false,
    }),
  );
}

const collectionsUrl = `/api/families/${FAMILY_ID}/collections`;

describe('CollectionsPage', () => {
  it('shows a loading spinner while collections resolve', async () => {
    server.use(
      authMe('PARENT'),
      http.get(collectionsUrl, async () => {
        await delay();
        return HttpResponse.json({ collections: [] });
      }),
    );

    renderWithProviders(<CollectionsPage />);

    expect(await screen.findByText('Loading collections…')).toBeInTheDocument();
  });

  it('renders an empty state with a create CTA for parents', async () => {
    server.use(
      authMe('PARENT'),
      http.get(collectionsUrl, () => HttpResponse.json({ collections: [] })),
    );

    renderWithProviders(<CollectionsPage />);

    expect(await screen.findByText('No collections yet')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'New collection' }).length,
    ).toBeGreaterThan(0);
  });

  it('hides create/manage controls for non-parent members', async () => {
    server.use(
      authMe('MEMBER'),
      http.get(collectionsUrl, () => HttpResponse.json({ collections: [] })),
    );

    renderWithProviders(<CollectionsPage />);

    expect(await screen.findByText('No collections yet')).toBeInTheDocument();
    expect(
      screen.getByText('A parent can create collections to organize recipes into shelves.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New collection' })).not.toBeInTheDocument();
  });

  it('renders member rows as navigation links with their description blurb', async () => {
    server.use(
      authMe('MEMBER'),
      http.get(collectionsUrl, () =>
        HttpResponse.json({
          collections: [collection({ description: 'Fast + reliable dinners' })],
        }),
      ),
    );

    renderWithProviders(<CollectionsPage />);

    // Members keep the read-only detail-page link on the collection name.
    expect(
      await screen.findByRole('link', { name: 'Weeknight Winners' }),
    ).toHaveAttribute('href', '/collections/col-1');
    expect(screen.getByText('Fast + reliable dinners')).toBeInTheDocument();
    // Members cannot edit/delete — no per-row controls.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('renders parent rows as clickable buttons with no per-row edit/delete controls', async () => {
    server.use(
      authMe('PARENT'),
      http.get(collectionsUrl, () =>
        HttpResponse.json({ collections: [collection({ name: 'Weeknight Winners' })] }),
      ),
    );

    renderWithProviders(<CollectionsPage />);

    // The whole row is the control.
    expect(
      await screen.findByRole('button', { name: 'Weeknight Winners' }),
    ).toBeInTheDocument();
    // The per-row Edit/Delete buttons are gone from the list view.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    // Parents no longer get a separate navigation link on the row — the row
    // opens the modal instead of navigating.
    expect(screen.queryByRole('link', { name: 'Weeknight Winners' })).not.toBeInTheDocument();
  });

  it('opens the edit modal (pre-populated) when a parent clicks a row', async () => {
    server.use(
      authMe('PARENT'),
      mealsPage(),
      http.get(collectionsUrl, () =>
        HttpResponse.json({ collections: [collection({ name: 'Weeknight Winners' })] }),
      ),
    );

    renderWithProviders(<CollectionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Weeknight Winners' }));

    // The shared modal opens in edit mode, pre-populated with the row's data.
    expect(
      await screen.findByRole('heading', { name: 'Edit collection' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name *')).toHaveValue('Weeknight Winners');
  });

  it('creates a collection through the modal and refreshes the list', async () => {
    server.use(
      authMe('PARENT'),
      mealsPage(),
      http.get(collectionsUrl, () => HttpResponse.json({ collections: [] })),
      http.post(collectionsUrl, async ({ request }) => {
        const body = (await request.json()) as { name: string; description: string | null };
        return HttpResponse.json(
          collection({ id: 'col-new', name: body.name, description: body.description }),
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<CollectionsPage />);

    await screen.findByText('No collections yet');
    fireEvent.click(screen.getAllByRole('button', { name: 'New collection' })[0]);

    // Create mode shows the New collection heading and the Create button.
    expect(
      await screen.findByRole('heading', { name: 'New collection' }),
    ).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Name *'), {
      target: { value: 'Holiday Baking' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    // The new collection appears as a clickable parent row (button, not link).
    expect(
      await screen.findByRole('button', { name: 'Holiday Baking' }),
    ).toBeInTheDocument();
  });

  it('edits an existing collection through the row modal', async () => {
    server.use(
      authMe('PARENT'),
      mealsPage(),
      http.get(collectionsUrl, () =>
        HttpResponse.json({ collections: [collection({ name: 'Old Name' })] }),
      ),
      http.patch(`${collectionsUrl}/col-1`, async ({ request }) => {
        const body = (await request.json()) as { name?: string };
        return HttpResponse.json(collection({ name: body.name ?? 'Old Name' }));
      }),
    );

    renderWithProviders(<CollectionsPage />);

    // Row click opens the edit modal.
    fireEvent.click(await screen.findByRole('button', { name: 'Old Name' }));
    fireEvent.change(await screen.findByLabelText('Name *'), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('button', { name: 'New Name' })).toBeInTheDocument();
  });

  it('deletes a collection through the in-modal confirmation flow', async () => {
    let deleted = false;
    server.use(
      authMe('PARENT'),
      mealsPage(),
      http.get(collectionsUrl, () =>
        HttpResponse.json({ collections: [collection({ name: 'Doomed' })] }),
      ),
      http.delete(`${collectionsUrl}/col-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CollectionsPage />);

    // Row click opens the edit modal; Delete reveals the inline confirm.
    fireEvent.click(await screen.findByRole('button', { name: 'Doomed' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    // The inline confirmation is in-modal (no window.confirm).
    expect(
      await screen.findByRole('alertdialog', { name: 'Confirm delete collection' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Doomed' })).not.toBeInTheDocument(),
    );
  });

  it('keeps the collection and surfaces an error when delete is rejected (403)', async () => {
    server.use(
      authMe('PARENT'),
      mealsPage(),
      http.get(collectionsUrl, () =>
        HttpResponse.json({ collections: [collection({ name: 'Protected' })] }),
      ),
      http.delete(`${collectionsUrl}/col-1`, () =>
        HttpResponse.json({ error: 'parent role required' }, { status: 403 }),
      ),
    );

    renderWithProviders(<CollectionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Protected' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    // The error shows inside the still-open modal and the row is untouched.
    expect(await screen.findByText('parent role required')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit collection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Protected' })).toBeInTheDocument();
  });

  it('shows an error state with a working retry', async () => {
    let attempt = 0;
    server.use(
      authMe('PARENT'),
      http.get(collectionsUrl, () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json({ error: 'boom' }, { status: 500 });
        }
        return HttpResponse.json({ collections: [collection({ name: 'Recovered' })] });
      }),
    );

    renderWithProviders(<CollectionsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom');

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    // Recovered appears as a parent row button.
    expect(await screen.findByRole('button', { name: 'Recovered' })).toBeInTheDocument();
  });
});
