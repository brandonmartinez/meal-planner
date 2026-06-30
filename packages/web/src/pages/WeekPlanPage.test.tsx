import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, waitFor } from '../test-utils/render';
import WeekPlanPage from './WeekPlanPage';

const FAMILY_ID = 'fam-1';
const USER_ID = 'u-1';

function authMe(role: 'PARENT' | 'CHILD' = 'PARENT') {
  return http.get('/api/auth/me', () =>
    HttpResponse.json({
      id: USER_ID,
      email: 'a@b.com',
      name: 'Alice',
      avatarUrl: null,
      memberships: [
        {
          id: 'm-1',
          role,
          familyId: FAMILY_ID,
          userId: USER_ID,
          family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
        },
      ],
    }),
  );
}

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug-1',
    mealId: 'meal-1',
    dayPlanId: 'day-1',
    userId: USER_ID,
    approved: false,
    meal: { id: 'meal-1', name: 'Tacos', placeholderKind: null },
    suggestedBy: { id: USER_ID, name: 'Alice' },
    ...overrides,
  };
}

function weekPlan(suggestions: ReturnType<typeof suggestion>[]) {
  return {
    id: 'wp-1',
    weekStart: '2026-06-29',
    familyId: FAMILY_ID,
    days: [
      {
        id: 'day-1',
        date: '2026-06-29T00:00:00.000Z',
        weekPlanId: 'wp-1',
        suggestions,
      },
    ],
  };
}

describe('WeekPlanPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the week plan with its day cards and suggestions', async () => {
    server.use(
      authMe('PARENT'),
      http.post('/api/families/:familyId/weeks/:weekStart', () =>
        HttpResponse.json(weekPlan([suggestion()])),
      ),
    );

    renderWithProviders(<WeekPlanPage />);

    expect(await screen.findByText('Tacos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /week plan/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /grocery list/i })).toBeInTheDocument();
  });

  it('shows an error banner when the week plan fails to load', async () => {
    server.use(
      authMe('PARENT'),
      http.post('/api/families/:familyId/weeks/:weekStart', () =>
        HttpResponse.json({ error: 'Boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<WeekPlanPage />);

    expect(await screen.findByText(/failed to load week plan/i)).toBeInTheDocument();
  });

  it('approves a suggestion as a parent', async () => {
    let approved = false;
    server.use(
      authMe('PARENT'),
      http.post('/api/families/:familyId/weeks/:weekStart', () =>
        HttpResponse.json(weekPlan([suggestion({ approved: false })])),
      ),
      http.patch('/api/families/:familyId/suggestions/:suggestionId/approve', () => {
        approved = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    renderWithProviders(<WeekPlanPage />);

    await screen.findByText('Tacos');
    await userEvent.click(screen.getByRole('button', { name: /approve suggestion/i }));

    await waitFor(() => expect(approved).toBe(true));
  });

  it('removes a suggestion as a parent', async () => {
    let removed = false;
    server.use(
      authMe('PARENT'),
      http.post('/api/families/:familyId/weeks/:weekStart', () =>
        HttpResponse.json(weekPlan([suggestion()])),
      ),
      http.delete('/api/families/:familyId/suggestions/:suggestionId', () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<WeekPlanPage />);

    await screen.findByText('Tacos');
    await userEvent.click(screen.getByRole('button', { name: /remove suggestion/i }));

    await waitFor(() => expect(removed).toBe(true));
  });

  it('adds a suggestion through the meal picker', async () => {
    let addedMealId: unknown;
    server.use(
      authMe('PARENT'),
      http.post('/api/families/:familyId/weeks/:weekStart', () =>
        HttpResponse.json(weekPlan([])),
      ),
      http.get('/api/families/:familyId/meals', () =>
        HttpResponse.json([
          {
            id: 'meal-9',
            name: 'Pizza',
            description: '',
            placeholderKind: null,
            difficulty: null,
            familyId: FAMILY_ID,
            _count: { ingredients: 0 },
          },
        ]),
      ),
      http.post('/api/families/:familyId/days/:dayPlanId/suggestions', async ({ request, params }) => {
        const body = (await request.json()) as { mealId?: unknown };
        addedMealId = body.mealId;
        expect(params.dayPlanId).toBe('day-1');
        return HttpResponse.json(
          suggestion({ id: 'sug-new', meal: { id: 'meal-9', name: 'Pizza', placeholderKind: null } }),
        );
      }),
    );

    renderWithProviders(<WeekPlanPage />);

    // Open the picker for the (empty) day.
    await userEvent.click(await screen.findByRole('button', { name: /\+ add meal/i }));
    expect(await screen.findByText(/pick a meal/i)).toBeInTheDocument();

    // Choose a meal from the library; the picker closes and the suggestion is posted.
    await userEvent.click(await screen.findByRole('button', { name: /pizza/i }));

    await waitFor(() => expect(screen.queryByText(/pick a meal/i)).not.toBeInTheDocument());
    expect(addedMealId).toBe('meal-9');
  });

  it('redirects to family creation when the user has no family', async () => {
    server.use(http.get('/api/auth/me', () => HttpResponse.json(null, { status: 401 })));

    renderWithProviders(<WeekPlanPage />);

    // With no families, the page renders nothing of its own (it issues a
    // <Navigate> to /family/create); the Week Plan heading never appears.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /week plan/i })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Tacos')).not.toBeInTheDocument();
  });
});
