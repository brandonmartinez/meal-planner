import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, waitFor, fireEvent, within } from '../test-utils/render';
import { formatWeekRange, getCurrentWeekStart } from '../utils/date';
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

  it('generates a list for a specific date range from the empty state', async () => {
    let capturedBody: { startDate?: string; endDate?: string } | null = null;
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(null, { status: 404 }),
      ),
      http.post('/api/families/:familyId/weeks/:weekStart/grocery', async ({ request }) => {
        capturedBody = (await request.json()) as { startDate?: string; endDate?: string };
        return HttpResponse.json(listWith([item({ id: 'it-1', name: 'Eggs', category: 'dairy' })]));
      }),
    );

    renderWithProviders(<GroceryListPage />);

    fireEvent.change(await screen.findByLabelText(/range start date/i), {
      target: { value: '2026-06-29' },
    });
    fireEvent.change(screen.getByLabelText(/range end date/i), {
      target: { value: '2026-07-01' },
    });
    await userEvent.click(screen.getByRole('button', { name: /generate range/i }));

    expect(await screen.findByText('Eggs')).toBeInTheDocument();
    expect(capturedBody).toEqual({ startDate: '2026-06-29', endDate: '2026-07-01' });
  });

  it('removes past days via a distinct action, separate from regenerate', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({ id: 'it-1', name: 'Bananas', category: 'produce' }),
            item({ id: 'it-2', name: 'Old Bread', category: 'bakery' }),
          ]),
        ),
      ),
      http.post('/api/families/:familyId/grocery/:listId/remove-past-days', () =>
        HttpResponse.json(listWith([item({ id: 'it-1', name: 'Bananas', category: 'produce' })])),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByText('Old Bread')).toBeInTheDocument();
    // Both actions are present and distinct — remove-past-days is NOT folded into regenerate.
    expect(screen.getByRole('button', { name: /remove past days/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^regenerate$/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove past days/i }));

    await waitFor(() => expect(screen.queryByText('Old Bread')).not.toBeInTheDocument());
    expect(screen.getByText('Bananas')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('renders an existing list grouped by category by default', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({ id: 'it-1', name: 'Bananas', quantity: '12', unit: 'oz', category: 'produce', checked: true }),
            item({ id: 'it-2', name: 'Chicken', category: 'meat', checked: false }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByText('Bananas')).toBeInTheDocument();
    expect(screen.getByText('Chicken')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /group by/i })).toHaveValue('category');
    expect(screen.getByText(/1 of 2 items checked/i)).toBeInTheDocument();
    expect(screen.queryByText(formatWeekRange(getCurrentWeekStart()))).not.toBeInTheDocument();

    const quantity = screen.getByText('12 oz');
    expect(quantity).toHaveClass('text-right');
    expect(quantity).toHaveClass('pr-2');
  });

  it('renders the source-day annotation for items with sourceDays', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            // 0=Mon, 3=Thu — provided out of order to verify sorting.
            item({ id: 'it-1', name: 'Salt', category: 'condiments', sourceDays: [3, 0] }),
            item({ id: 'it-2', name: 'Butter', category: 'dairy', sourceDays: [] }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByText('Salt')).toBeInTheDocument();
    // Sorted Mon→Sun and prefixed with a middot.
    expect(screen.getByText('· Mon, Thu')).toBeInTheDocument();
    // Butter has no sourceDays → only one annotation on the page.
    expect(screen.getAllByText(/·\s*\w{3}/)).toHaveLength(1);
  });

  it('renders the meal source inline with item provenance while keeping quantity right-aligned', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({
              id: 'it-1',
              name: 'Salmon fillet',
              quantity: '2',
              unit: 'lbs',
              category: 'seafood',
              sourceDays: [1],
              sources: ['Baked Salmon with Asparagus'],
            }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    const checkbox = await screen.findByRole('checkbox', { name: 'Check Salmon fillet' });
    const row = checkbox.closest('li');
    expect(row).not.toBeNull();

    const sourceDay = screen.getByText('· Tue');
    const mealSource = screen.getByText('Baked Salmon with Asparagus');
    expect(mealSource.parentElement).toBe(sourceDay.parentElement);
    expect(mealSource.parentElement).toHaveClass('flex-1');
    expect(mealSource.parentElement).toHaveClass('min-w-0');
    expect(mealSource.parentElement?.textContent).toMatch(/Salmon fillet\s*· Tue\s*—\s*Baked Salmon with Asparagus/);
    expect([...row!.children]).not.toContain(mealSource);
    expect(mealSource).toHaveClass('hidden');
    expect(mealSource).toHaveClass('sm:inline-block');
    expect(mealSource).toHaveClass('max-w-[40%]');
    expect(mealSource).toHaveClass('truncate');
    expect(mealSource).toHaveAttribute('title', 'Baked Salmon with Asparagus');

    const quantity = screen.getByText('2 lbs');
    expect(quantity).toHaveClass('ml-auto');
    expect(quantity).toHaveClass('text-right');
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

  it('places checked-count text below the progress bar and centers it', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({ id: 'it-1', name: 'Bananas', checked: true }),
            item({ id: 'it-2', name: 'Chicken', checked: false }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    const checkedText = await screen.findByText(/1 of 2 items checked/i);
    const progress = screen.getByRole('progressbar', { name: /grocery completion/i });

    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress.compareDocumentPosition(checkedText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(checkedText).toHaveClass('text-center');
  });

  it('styles remove-past-days and regenerate as standard responsive action buttons', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([item({ id: 'it-1', name: 'Bananas' })])),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Bananas');
    const actions = screen.getByRole('group', { name: /grocery list actions/i });
    expect(actions).toHaveClass('grid');
    expect(actions).toHaveClass('grid-cols-2');
    expect(actions).toHaveClass('sm:flex');

    for (const name of [/remove past days/i, /^regenerate$/i]) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveClass('rounded');
      expect(button).toHaveClass('bg-blue-600');
      expect(button).toHaveClass('w-full');
      expect(button).toHaveClass('sm:w-auto');
    }
  });

  it('groups by day and duplicates multi-day items into each weekday bucket', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({ id: 'it-1', name: 'Salt', category: 'condiments', sourceDays: [3, 0] }),
            item({ id: 'it-2', name: 'Napkins', category: 'paper', origin: 'MANUAL', sourceDays: [] }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Salt');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /group by/i }),
      'day',
    );

    expect(screen.getByRole('heading', { name: 'Mon' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Check Salt' })).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Check Napkins' })).toBeInTheDocument();
  });

  it('toggles the underlying item from duplicated day groups', async () => {
    let patched: { itemId: string; checked?: boolean } | null = null;
    let patchRequests = 0;
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({ id: 'it-1', name: 'Salt', category: 'condiments', sourceDays: [0, 3] }),
          ]),
        ),
      ),
      http.patch('/api/families/:familyId/grocery/:listId/items/:itemId', async ({ params, request }) => {
        patchRequests += 1;
        const body = (await request.json()) as { checked?: boolean };
        patched = { itemId: String(params.itemId), checked: body.checked };
        return new HttpResponse(null, { status: 200 });
      }),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Salt');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /group by/i }),
      'day',
    );

    const duplicatedChecks = screen.getAllByRole('checkbox', { name: 'Check Salt' });
    expect(duplicatedChecks).toHaveLength(2);
    await userEvent.click(duplicatedChecks[0]);

    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: 'Uncheck Salt' })).toHaveLength(2));
    expect(patched).toEqual({ itemId: 'it-1', checked: true });
    expect(patchRequests).toBe(1);
  });

  it('groups by source meal and buckets manual items as unassigned', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({
              id: 'it-1',
              name: 'Cheese',
              category: 'dairy',
              sources: ['Taco Night', 'Pasta Night'],
              sourceMealIds: ['meal-taco', 'meal-pasta'],
            }),
            item({ id: 'it-2', name: 'Napkins', category: 'paper', sources: [], sourceMealIds: [] }),
            item({ id: 'it-3', name: 'Paper Towels', category: 'paper', sources: [''], sourceMealIds: [''] }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Cheese');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /group by/i }),
      'meal',
    );

    expect(screen.getByRole('heading', { name: 'Pasta Night' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Taco Night' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Check Cheese' })).toHaveLength(2);
    const unassigned = screen.getByRole('heading', { name: 'Unassigned' }).closest('div');
    expect(unassigned).not.toBeNull();
    expect(within(unassigned!).getByRole('checkbox', { name: 'Check Napkins' })).toBeInTheDocument();
    expect(within(unassigned!).getByRole('checkbox', { name: 'Check Paper Towels' })).toBeInTheDocument();
  });

  it('does not use stale source labels as meal provenance for manual items', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({
              id: 'it-1',
              name: 'Paper Towels',
              category: 'paper',
              origin: 'MANUAL',
              sources: ['Taco Night'],
              sourceMealIds: [],
              sourceDays: [],
            }),
            item({
              id: 'it-2',
              name: 'Cheese',
              category: 'dairy',
              sources: ['Taco Night'],
              sourceMealIds: ['meal-taco'],
            }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Paper Towels');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /group by/i }),
      'meal',
    );

    const tacoNight = screen.getByRole('heading', { name: 'Taco Night' }).closest('div');
    const unassigned = screen.getByRole('heading', { name: 'Unassigned' }).closest('div');
    expect(tacoNight).not.toBeNull();
    expect(unassigned).not.toBeNull();
    expect(within(tacoNight!).getByRole('checkbox', { name: 'Check Cheese' })).toBeInTheDocument();
    expect(within(tacoNight!).queryByRole('checkbox', { name: 'Check Paper Towels' })).not.toBeInTheDocument();
    expect(within(unassigned!).getByRole('checkbox', { name: 'Check Paper Towels' })).toBeInTheDocument();
    expect(within(unassigned!).getByText('Taco Night')).toBeInTheDocument();
  });

  it('shows a single alphabetical group sorted by item name case-insensitively', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({ id: 'it-1', name: 'Banana' }),
            item({ id: 'it-2', name: 'apple' }),
            item({ id: 'it-3', name: 'carrot' }),
            item({ id: 'it-4', name: 'Apricot' }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Banana');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /group by/i }),
      'alphabetical',
    );

    const group = screen.getByRole('heading', { name: 'All Items' }).closest('div');
    expect(group).not.toBeNull();
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(within(group!).getAllByRole('checkbox').map(checkbox => checkbox.getAttribute('aria-label'))).toEqual([
      'Check apple',
      'Check Apricot',
      'Check Banana',
      'Check carrot',
    ]);
  });

  it('preserves checked state and distinct item count when switching grouping modes', async () => {
    let patchRequests = 0;
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({
              id: 'it-1',
              name: 'Salt',
              category: 'condiments',
              sourceDays: [0, 3],
              sources: ['Taco Night', 'Pasta Night'],
              sourceMealIds: ['meal-taco', 'meal-pasta'],
            }),
            item({
              id: 'it-2',
              name: 'Bananas',
              category: 'produce',
              checked: true,
              sourceDays: [1],
              sources: ['Smoothies'],
              sourceMealIds: ['meal-smoothies'],
            }),
            item({
              id: 'it-3',
              name: 'Apples',
              category: 'produce',
              sourceDays: [4],
              sources: ['Snacks'],
              sourceMealIds: ['meal-snacks'],
            }),
            item({ id: 'it-4', name: 'Napkins', category: 'paper', origin: 'MANUAL', sourceDays: [], sources: [], sourceMealIds: [] }),
          ]),
        ),
      ),
      http.patch('/api/families/:familyId/grocery/:listId/items/:itemId', () => {
        patchRequests += 1;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    renderWithProviders(<GroceryListPage />);

    await screen.findByText('Salt');
    const groupSelect = screen.getByRole('combobox', { name: /group by/i });
    const expectedNames = ['Apples', 'Bananas', 'Napkins', 'Salt'];
    const visibleDistinctNames = () => [
      ...new Set(
        screen.getAllByRole('checkbox')
          .map(checkbox => checkbox.getAttribute('aria-label')?.replace(/^(Check|Uncheck) /, ''))
          .filter((name): name is string => !!name),
      ),
    ].sort();

    expect(visibleDistinctNames()).toEqual(expectedNames);

    await userEvent.selectOptions(groupSelect, 'day');
    expect(visibleDistinctNames()).toEqual(expectedNames);
    expect(screen.getAllByRole('checkbox', { name: 'Check Salt' })).toHaveLength(2);

    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Check Salt' })[0]);
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: 'Uncheck Salt' })).toHaveLength(2));
    expect(patchRequests).toBe(1);

    for (const mode of ['meal', 'alphabetical', 'category', 'day'] as const) {
      await userEvent.selectOptions(groupSelect, mode);
      expect(visibleDistinctNames()).toEqual(expectedNames);
      expect(screen.getAllByRole('checkbox', { name: /Uncheck Salt/ }).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders an empty grocery list without items and a zero progress count', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([])),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByText(/no items in the list/i)).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: /grocery completion/i });
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '0');
    expect(screen.getByText(/0 of 0 items checked/i)).toBeInTheDocument();
  });

  it('shows complete progress when every grocery item is checked', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(
          listWith([
            item({ id: 'it-1', name: 'Bananas', checked: true }),
            item({ id: 'it-2', name: 'Chicken', checked: true }),
          ]),
        ),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    expect(await screen.findByText(/2 of 2 items checked/i)).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: /grocery completion/i });
    expect(progress).toHaveAttribute('aria-valuenow', '2');
    expect(progress).toHaveAttribute('aria-valuemax', '2');
    expect(progress.firstElementChild).toHaveStyle({ width: '100%' });
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

  it('opts the new-item name field out of password-manager autofill', async () => {
    server.use(
      authMeWithFamily(),
      http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
        HttpResponse.json(listWith([])),
      ),
    );

    renderWithProviders(<GroceryListPage />);

    const name = await screen.findByRole('textbox', { name: 'New item name' });
    expect(name).toHaveAttribute('data-1p-ignore');
    expect(name).toHaveAttribute('autocomplete', 'off');
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

  // --- Pantry staples auto-separation (issue #205) -----------------------
  describe('pantry staples section', () => {
    it('separates isPantryStaple items into a collapsible Pantry Staples group', async () => {
      server.use(
        authMeWithFamily(),
        http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
          HttpResponse.json(
            listWith([
              item({ id: 'it-1', name: 'Bananas', category: 'produce' }),
              item({
                id: 'it-2',
                name: 'Salt',
                category: 'pantry',
                isPantryStaple: true,
              }),
            ]),
          ),
        ),
      );

      renderWithProviders(<GroceryListPage />);

      // Non-staple renders immediately in its aisle group.
      expect(await screen.findByText('Bananas')).toBeInTheDocument();

      // The Pantry Staples section header exists and is collapsed by default,
      // so the staple item is hidden until expanded.
      const toggle = screen.getByRole('button', { name: /pantry staples/i });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Salt')).not.toBeInTheDocument();

      // Expand → the staple item appears under the Pantry Staples section.
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(await screen.findByText('Salt')).toBeInTheDocument();
    });

    it('does not render a Pantry Staples section when no items are staples', async () => {
      server.use(
        authMeWithFamily(),
        http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
          HttpResponse.json(
            listWith([item({ id: 'it-1', name: 'Bananas', category: 'produce' })]),
          ),
        ),
      );

      renderWithProviders(<GroceryListPage />);

      expect(await screen.findByText('Bananas')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /pantry staples/i }),
      ).not.toBeInTheDocument();
    });

    it.each(['day', 'meal', 'alphabetical'] as const)(
      'keeps pantry staples separated when grouped by %s',
      async (mode) => {
        server.use(
          authMeWithFamily(),
          http.get('/api/families/:familyId/weeks/:weekStart/grocery', () =>
            HttpResponse.json(
              listWith([
                item({
                  id: 'it-1',
                  name: 'Bananas',
                  category: 'produce',
                  sourceDays: [0],
                  sources: ['Smoothies'],
                  sourceMealIds: ['meal-smoothies'],
                }),
                item({
                  id: 'it-2',
                  name: 'Salt',
                  category: 'pantry',
                  isPantryStaple: true,
                  sourceDays: [0],
                  sources: ['Taco Night'],
                  sourceMealIds: ['meal-taco'],
                }),
              ]),
            ),
          ),
        );

        renderWithProviders(<GroceryListPage />);

        expect(await screen.findByText('Bananas')).toBeInTheDocument();
        await userEvent.selectOptions(
          screen.getByRole('combobox', { name: /group by/i }),
          mode,
        );

        expect(screen.queryByText('Salt')).not.toBeInTheDocument();
        const toggle = screen.getByRole('button', { name: /pantry staples/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        await userEvent.click(toggle);

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const pantrySection = toggle.closest('div');
        expect(pantrySection).not.toBeNull();
        expect(within(pantrySection!).getByText('Salt')).toBeInTheDocument();
        expect(screen.getAllByRole('checkbox', { name: 'Check Salt' })).toHaveLength(1);
        expect(screen.getAllByRole('checkbox', { name: 'Check Bananas' })).toHaveLength(1);
      },
    );
  });
});
