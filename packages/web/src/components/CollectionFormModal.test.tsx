import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import {
  renderWithProviders,
  screen,
  fireEvent,
  waitFor,
  within,
} from '../test-utils/render';
import CollectionFormModal from './CollectionFormModal';
import type { RecipeCollection } from '../api/collections';

const FAMILY_ID = 'fam-1';
const mealsUrl = `/api/families/${FAMILY_ID}/meals`;
const collectionsUrl = `/api/families/${FAMILY_ID}/collections`;

type Meal = { id: string; name: string };

/**
 * Meals handler that answers BOTH modal reads on the same endpoint:
 *  - the full catalog (no `collections` query param) → `catalog`
 *  - the current-membership read (`collections=<name>`) → `membership`
 * Pass `membershipStatus` to force the membership read to fail (data-loss guard).
 */
function mealsHandler({
  catalog = [],
  membership = [],
  membershipStatus = 200,
}: {
  catalog?: Meal[];
  membership?: Meal[];
  membershipStatus?: number;
}) {
  return http.get(mealsUrl, ({ request }) => {
    const url = new URL(request.url);
    const isMembershipRead = url.searchParams.has('collections');
    if (isMembershipRead) {
      if (membershipStatus !== 200) {
        return HttpResponse.json({ error: 'membership boom' }, { status: membershipStatus });
      }
      return HttpResponse.json({
        items: membership,
        total: membership.length,
        limit: 100,
        offset: 0,
        hasMore: false,
      });
    }
    return HttpResponse.json({
      items: catalog,
      total: catalog.length,
      limit: 100,
      offset: 0,
      hasMore: false,
    });
  });
}

function editCollection(overrides: Partial<RecipeCollection> = {}): RecipeCollection {
  return {
    id: 'col-1',
    name: 'Weeknight Winners',
    familyId: FAMILY_ID,
    description: null,
    ...overrides,
  } as RecipeCollection;
}

async function waitForMealsLoaded() {
  await waitFor(() =>
    expect(screen.queryByText('Loading meals…')).not.toBeInTheDocument(),
  );
}

describe('CollectionFormModal', () => {
  it('adds a meal via the picker and sends mealIds on create (#152)', async () => {
    let body: { name?: string; description?: string | null; mealIds?: string[] } = {};
    server.use(
      mealsHandler({ catalog: [{ id: 'm-1', name: 'Tacos' }, { id: 'm-2', name: 'Pizza' }] }),
      http.post(collectionsUrl, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(editCollection({ id: 'col-new', name: body.name ?? '' }), {
          status: 201,
        });
      }),
    );

    const onSaved = vi.fn();
    renderWithProviders(
      <CollectionFormModal familyId={FAMILY_ID} onClose={() => {}} onSaved={onSaved} />,
    );

    expect(screen.getByRole('heading', { name: 'New collection' })).toBeInTheDocument();
    await waitForMealsLoaded();

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Taco Night' } });
    // Pick a meal through the Combobox.
    fireEvent.change(screen.getByRole('combobox', { name: 'Meals' }), {
      target: { value: 'Tacos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: 'Remove Tacos' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(body).toEqual({ name: 'Taco Night', description: null, mealIds: ['m-1'] });
  });

  it('pre-populates membership and sends the trimmed set after a removal (#152)', async () => {
    let body: { name?: string; mealIds?: string[] } = {};
    server.use(
      mealsHandler({
        catalog: [{ id: 'm-1', name: 'Tacos' }, { id: 'm-2', name: 'Pizza' }],
        membership: [{ id: 'm-1', name: 'Tacos' }, { id: 'm-2', name: 'Pizza' }],
      }),
      http.patch(`${collectionsUrl}/col-1`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(editCollection());
      }),
    );

    const onSaved = vi.fn();
    renderWithProviders(
      <CollectionFormModal
        familyId={FAMILY_ID}
        collection={editCollection()}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    // Existing members render as removable pills.
    expect(await screen.findByRole('button', { name: 'Remove Tacos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Pizza' })).toBeInTheDocument();

    // Drop one and save — the replace-set should be just the survivor.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pizza' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(body.mealIds).toEqual(['m-1']);
  });

  it('omits mealIds when the membership read fails, protecting existing meals (#152)', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      mealsHandler({
        catalog: [{ id: 'm-1', name: 'Tacos' }],
        membershipStatus: 500,
      }),
      http.patch(`${collectionsUrl}/col-1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(editCollection());
      }),
    );

    const onSaved = vi.fn();
    renderWithProviders(
      <CollectionFormModal
        familyId={FAMILY_ID}
        collection={editCollection()}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    // The guard surfaces a warning that membership will be left unchanged.
    expect(
      await screen.findByText(/meal membership will be left unchanged on save/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(body).not.toHaveProperty('mealIds');
    expect(body).toMatchObject({ name: 'Weeknight Winners' });
  });

  it('deletes through the in-modal confirmation (no window.confirm) and calls onDeleted', async () => {
    let deleted = false;
    server.use(
      mealsHandler({}),
      http.delete(`${collectionsUrl}/col-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const onDeleted = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <CollectionFormModal
        familyId={FAMILY_ID}
        collection={editCollection()}
        onClose={onClose}
        onSaved={() => {}}
        onDeleted={onDeleted}
      />,
    );

    await waitForMealsLoaded();

    // Delete reveals the inline confirmation rather than a native dialog.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Confirm delete collection' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(deleted).toBe(true));
    expect(onDeleted).toHaveBeenCalledWith('col-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('cancels the inline delete confirmation without deleting', async () => {
    let deleteCalled = false;
    server.use(
      mealsHandler({}),
      http.delete(`${collectionsUrl}/col-1`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(
      <CollectionFormModal
        familyId={FAMILY_ID}
        collection={editCollection()}
        onClose={() => {}}
        onSaved={() => {}}
        onDeleted={() => {}}
      />,
    );

    await waitForMealsLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Confirm delete collection',
    });
    // The confirm block owns its own Cancel button; clicking it retracts.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'Confirm delete collection' }),
      ).not.toBeInTheDocument(),
    );
    expect(deleteCalled).toBe(false);
  });
});
