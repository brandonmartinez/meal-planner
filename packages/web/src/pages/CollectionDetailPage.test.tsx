import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import CollectionDetailPage from './CollectionDetailPage';

const FAMILY_ID = 'fam-1';

// useFamily has its own tests; mock it so these assertions stay focused on the
// collection detail rendering and the #109 list-meals filter integration.
vi.mock('../hooks/useFamily', () => ({
  useFamily: () => ({
    familyId: FAMILY_ID,
    family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
    families: [{ id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' }],
    switchFamily: vi.fn(),
    hasFamilies: true,
  }),
}));

function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'col-1',
    name: 'Weeknight Winners',
    familyId: FAMILY_ID,
    description: null,
    ...overrides,
  };
}

function mealItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    name: 'Tacos',
    description: '',
    placeholderKind: null,
    difficulty: null,
    imageUrl: null,
    familyId: FAMILY_ID,
    _count: { ingredients: 0 },
    recentlyScheduled: false,
    lastScheduledOn: null,
    lastCookedOn: null,
    timesCooked: 0,
    ...overrides,
  };
}

function mealsEnvelope(items: ReturnType<typeof mealItem>[]) {
  return { items, total: items.length, limit: 25, offset: 0, hasMore: false };
}

function renderDetail(collectionId = 'col-1') {
  return render(
    <MemoryRouter initialEntries={[`/collections/${collectionId}`]}>
      <Routes>
        <Route path="/collections/:collectionId" element={<CollectionDetailPage />} />
        <Route path="/collections" element={<div>COLLECTIONS LIST</div>} />
        <Route path="/meals/:mealId" element={<div>MEAL DETAIL</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CollectionDetailPage', () => {
  it('shows a loading spinner before the collection resolves', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/collections/:collectionId`, async () => {
        await delay();
        return HttpResponse.json(collection());
      }),
    );

    renderDetail();

    expect(await screen.findByText('Loading collection…')).toBeInTheDocument();
  });

  it('renders the collection name, description and its member meals', async () => {
    let mealsQuery: string[] = [];
    server.use(
      http.get(`/api/families/${FAMILY_ID}/collections/:collectionId`, () =>
        HttpResponse.json(collection({ description: 'Fast + reliable dinners' })),
      ),
      http.get(`/api/families/${FAMILY_ID}/meals`, ({ request }) => {
        mealsQuery = new URL(request.url).searchParams.getAll('collections');
        return HttpResponse.json(mealsEnvelope([mealItem({ name: 'Tacos' })]));
      }),
    );

    renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'Weeknight Winners' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Fast + reliable dinners')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Tacos/ })).toHaveAttribute(
      'href',
      '/meals/m-1',
    );
    // The shelf is populated via the #109 list-meals `collections` filter by name.
    expect(mealsQuery).toEqual(['Weeknight Winners']);
  });

  it('shows an empty state when the collection has no meals', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/collections/:collectionId`, () =>
        HttpResponse.json(collection()),
      ),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json(mealsEnvelope([])),
      ),
    );

    renderDetail();

    expect(
      await screen.findByText('No meals in this collection yet'),
    ).toBeInTheDocument();
  });

  it('shows a friendly not-found state on 404', async () => {
    server.use(
      http.get(`/api/families/${FAMILY_ID}/collections/:collectionId`, () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 }),
      ),
    );

    renderDetail('missing');

    expect(await screen.findByText('Collection not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to collections/ })).toBeInTheDocument();
  });
});
