import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, waitFor } from '../test-utils/render';
import GroceryListPage from './GroceryListPage';

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

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'it-1',
    name: 'Bananas',
    quantity: '3',
    unit: '',
    category: 'produce',
    checked: false,
    sources: [],
    groceryListId: 'gl-1',
    ...overrides,
  };
}

function listWith(items: ReturnType<typeof item>[]) {
  return { id: 'gl-1', weekStart: '2026-06-29', familyId: FAMILY_ID, items };
}

describe('GroceryListPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the empty state when no list exists for the week', async () => {
    server.use(
      authMeWithFamily(),
      // 404 → getGroceryListByWeek resolves to null.
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(null, { status: 404 }),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByText(/no grocery list for this week yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate grocery list/i })).toBeInTheDocument();
  });

  it('generates a list from the empty state and renders its items', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(null, { status: 404 }),
      ),
      http.post('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([item({ id: 'it-1', name: 'Milk', category: 'dairy' })])),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    await userEvent.click(await screen.findByRole('button', { name: /generate grocery list/i }));

    expect(await screen.findByText('Milk')).toBeInTheDocument();
    expect(screen.getByText(/0 of 1 items checked/i)).toBeInTheDocument();
  });

  it('renders an existing list grouped by category', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({ id: 'it-1', name: 'Bananas', category: 'produce', checked: true }),
            item({ id: 'it-2', name: 'Chicken', category: 'meat', checked: false }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByText('Bananas')).toBeInTheDocument();
    expect(screen.getByText('Chicken')).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 items checked/i)).toBeInTheDocument();
  });

  it('toggles an item checked via the checkbox (optimistic update)', async () => {
    let patched = false;
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([item({ id: 'it-1', name: 'Bananas', checked: false })])),
      ),
      http.patch('/api/families/:familyId/grocery/:listId/items/:itemId', async ({ request }) => {
        const body = (await request.json()) as { checked?: boolean };
        patched = body.checked === true;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Bananas');
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    expect(patched).toBe(true);
  });

  it('adds a custom item through the form', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([])),
      ),
      http.post('/api/families/:familyId/grocery/:listId/items', () =>
        HttpResponse.json(item({ id: 'it-9', name: 'Salt', category: 'condiments' })),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    const nameInput = await screen.findByPlaceholderText(/item name/i);
    await userEvent.type(nameInput, 'Salt');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByText('Salt')).toBeInTheDocument();
  });

  it('removes an item when its remove control is clicked', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([item({ id: 'it-1', name: 'Bananas' })])),
      ),
      http.delete('/api/families/:familyId/grocery/:listId/items/:itemId', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Bananas');
    await userEvent.click(screen.getByRole('button', { name: /remove bananas/i }));

    await waitFor(() => expect(screen.queryByText('Bananas')).not.toBeInTheDocument());
  });

  it('shows an error banner when the list fails to load', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json({ error: 'Failed to load grocery list' }, { status: 500 }),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByText(/failed to load grocery list/i)).toBeInTheDocument();
  });
});

describe('GroceryListPage accessibility', () => {
  it('exposes a labelled status region while the list is loading', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', async () => {
        await delay(40);
        return HttpResponse.json(listWith([item({ id: 'it-1', name: 'Bananas' })]));
      }),
    );

    renderWithProviders(<GroceryListPage />);

    // Before the fetch resolves the page shows an accessible loading status.
    expect(await screen.findByRole('status', { name: /loading grocery list/i })).toBeInTheDocument();

    // Wait for content so the loading region is replaced (use findBy for async).
    expect(await screen.findByText('Bananas')).toBeInTheDocument();
  });

  it('gives each checkbox and remove control an accessible name with the item', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([item({ id: 'it-1', name: 'Bananas', checked: false })])),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    // findBy* waits for the async fetch to resolve before querying.
    expect(await screen.findByRole('checkbox', { name: 'Check Bananas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Bananas' })).toBeInTheDocument();
  });

  it('reflects checked state in the checkbox accessible name', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([item({ id: 'it-1', name: 'Bananas', checked: true })])),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByRole('checkbox', { name: 'Uncheck Bananas' })).toBeInTheDocument();
  });

  it('labels the add-custom-item controls', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([])),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    // The add form is only rendered once the (empty) list resolves.
    expect(await screen.findByRole('textbox', { name: 'New item name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New item quantity' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New item unit' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'New item category' })).toBeInTheDocument();
  });

  it('announces a load failure through an alert region', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json({ error: 'Failed to load grocery list' }, { status: 500 }),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load grocery list');
  });
});
