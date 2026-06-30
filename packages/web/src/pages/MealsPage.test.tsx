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
