import { vi } from 'vitest';
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

  it('renders collection rows with their description blurb', async () => {
    server.use(
      authMe('MEMBER'),
      http.get(collectionsUrl, () =>
        HttpResponse.json({
          collections: [collection({ description: 'Fast + reliable dinners' })],
        }),
      ),
    );

    renderWithProviders(<CollectionsPage />);

    expect(
      await screen.findByRole('link', { name: 'Weeknight Winners' }),
    ).toHaveAttribute('href', '/collections/col-1');
    expect(screen.getByText('Fast + reliable dinners')).toBeInTheDocument();
    // Members cannot edit/delete.
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('creates a collection through the modal and refreshes the list', async () => {
    server.use(
      authMe('PARENT'),
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

    fireEvent.change(await screen.findByLabelText('Name *'), {
      target: { value: 'Holiday Baking' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByRole('link', { name: 'Holiday Baking' }),
    ).toBeInTheDocument();
  });

  it('edits an existing collection', async () => {
    server.use(
      authMe('PARENT'),
      http.get(collectionsUrl, () =>
        HttpResponse.json({ collections: [collection({ name: 'Old Name' })] }),
      ),
      http.patch(`${collectionsUrl}/col-1`, async ({ request }) => {
        const body = (await request.json()) as { name?: string };
        return HttpResponse.json(collection({ name: body.name ?? 'Old Name' }));
      }),
    );

    renderWithProviders(<CollectionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(await screen.findByLabelText('Name *'), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('link', { name: 'New Name' })).toBeInTheDocument();
  });

  it('deletes a collection when a parent confirms', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deleted = false;
    server.use(
      authMe('PARENT'),
      http.get(collectionsUrl, () =>
        HttpResponse.json({ collections: [collection({ name: 'Doomed' })] }),
      ),
      http.delete(`${collectionsUrl}/col-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CollectionsPage />);

    fireEvent.click(await screen.findByRole('link', { name: 'Doomed' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Doomed' })).not.toBeInTheDocument(),
    );
    confirmSpy.mockRestore();
  });

  it('surfaces an error when delete is rejected (403)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      authMe('PARENT'),
      http.get(collectionsUrl, () =>
        HttpResponse.json({ collections: [collection({ name: 'Protected' })] }),
      ),
      http.delete(`${collectionsUrl}/col-1`, () =>
        HttpResponse.json({ error: 'parent role required' }, { status: 403 }),
      ),
    );

    renderWithProviders(<CollectionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('parent role required')).toBeInTheDocument();
    // The row is still present since the delete failed.
    expect(screen.getByRole('link', { name: 'Protected' })).toBeInTheDocument();
    confirmSpy.mockRestore();
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

    expect(await screen.findByRole('link', { name: 'Recovered' })).toBeInTheDocument();
  });
});
