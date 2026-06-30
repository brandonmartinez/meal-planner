import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen } from '../test-utils/render';
import MealsPage from './MealsPage';

const FAMILY_ID = 'fam-1';

function authMeWithFamily() {
  return http.get('/api/auth/me', () =>
    HttpResponse.json({
      id: 'u-1',
      email: 'a@b.com',
      name: 'Alice',
      avatarUrl: null,
      memberships: [
        {
          id: 'm-1',
          role: 'PARENT',
          familyId: FAMILY_ID,
          userId: 'u-1',
          family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
        },
      ],
    }),
  );
}

function meal(overrides: Record<string, unknown>) {
  return {
    id: 'm-1',
    name: 'Tacos',
    description: '',
    placeholderKind: null,
    difficulty: null,
    familyId: FAMILY_ID,
    _count: { ingredients: 0 },
    recentlyScheduled: false,
    lastScheduledOn: null,
    ...overrides,
  };
}

describe('MealsPage difficulty', () => {
  it('shows a difficulty badge when the meal has one set', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json([meal({ id: 'm-1', name: 'Tacos', difficulty: 'HARD' })]),
      ),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByText('Tacos')).toBeInTheDocument();
    expect(screen.getByText('Hard')).toBeInTheDocument();
    expect(screen.getByLabelText('Difficulty: Hard')).toBeInTheDocument();
  });

  it('omits the difficulty badge when difficulty is null', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json([meal({ id: 'm-2', name: 'Soup', difficulty: null })]),
      ),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByText('Soup')).toBeInTheDocument();
    expect(screen.queryByText('Easy')).not.toBeInTheDocument();
    expect(screen.queryByText('Medium')).not.toBeInTheDocument();
    expect(screen.queryByText('Hard')).not.toBeInTheDocument();
  });
});

describe('MealsPage recent indicator', () => {
  it('shows a Recent badge with the last-scheduled date when the meal is recent', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json([
          meal({
            id: 'm-1',
            name: 'Tacos',
            recentlyScheduled: true,
            lastScheduledOn: '2026-06-29',
          }),
        ]),
      ),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByText('Tacos')).toBeInTheDocument();
    // Visible, text-bearing badge (not color-only).
    expect(screen.getByText('Recent')).toBeInTheDocument();
    // Help text / accessible label surfaces the last-scheduled date.
    expect(screen.getByTitle('Last scheduled 2026-06-29')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Recent — last scheduled 2026-06-29'),
    ).toBeInTheDocument();
  });

  it('does not show a Recent badge when the meal is not recent', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json([
          meal({
            id: 'm-2',
            name: 'Soup',
            recentlyScheduled: false,
            lastScheduledOn: null,
          }),
        ]),
      ),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByText('Soup')).toBeInTheDocument();
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });
});

describe('MealsPage accessibility', () => {
  it('exposes a labelled status region while meals load', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json([meal({ id: 'm-1', name: 'Tacos' })]),
      ),
    );

    renderWithProviders(<MealsPage />);

    expect(screen.getByRole('status', { name: /loading meals/i })).toBeInTheDocument();
    expect(await screen.findByText('Tacos')).toBeInTheDocument();
  });

  it('gives the search field an accessible name', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () => HttpResponse.json([])),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByRole('textbox', { name: 'Search meals' })).toBeInTheDocument();
  });

  it('names the edit and delete controls after the meal they act on', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json([meal({ id: 'm-1', name: 'Tacos' })]),
      ),
    );

    renderWithProviders(<MealsPage />);

    // Wait for the async list before asserting on the per-meal controls.
    expect(await screen.findByText('Tacos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Tacos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Tacos' })).toBeInTheDocument();
  });
});
