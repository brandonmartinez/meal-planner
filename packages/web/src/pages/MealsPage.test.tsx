import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, fireEvent, waitFor } from '../test-utils/render';
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
    lastCookedOn: null,
    ...overrides,
  };
}

function mealsEnvelope(items: ReturnType<typeof meal>[]) {
  return { items, total: items.length, limit: 25, offset: 0, hasMore: false };
}

describe('MealsPage difficulty', () => {
  it('shows a difficulty badge when the meal has one set', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json(mealsEnvelope([meal({ id: 'm-1', name: 'Tacos', difficulty: 'HARD' })])),
      ),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByText('Tacos')).toBeInTheDocument();
    // Scope to the card badge (a non-button element); the discovery filter bar
    // also renders "Hard" as an aria-pressed toggle button.
    expect(screen.getByText('Hard', { selector: ':not(button)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Difficulty: Hard')).toBeInTheDocument();
  });

  it('omits the difficulty badge when difficulty is null', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json(mealsEnvelope([meal({ id: 'm-2', name: 'Soup', difficulty: null })])),
      ),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByText('Soup')).toBeInTheDocument();
    // No difficulty badge should render for a null-difficulty meal. Scope to
    // non-button elements so the discovery filter toggles (which always render
    // "Easy"/"Medium"/"Hard") don't produce false positives.
    expect(screen.queryByText('Easy', { selector: ':not(button)' })).not.toBeInTheDocument();
    expect(screen.queryByText('Medium', { selector: ':not(button)' })).not.toBeInTheDocument();
    expect(screen.queryByText('Hard', { selector: ':not(button)' })).not.toBeInTheDocument();
  });

  it('renders a View link to the recipe detail page on non-placeholder cards', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json(mealsEnvelope([meal({ id: 'm-9', name: 'Ramen' })])),
      ),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByText('Ramen')).toBeInTheDocument();
    const view = screen.getByRole('link', { name: 'View Ramen' });
    expect(view).toHaveAttribute('href', '/meals/m-9');
  });
});

describe('MealsPage export', () => {
  it('downloads a CSV of all meals when Export CSV is clicked', async () => {
    let capturedBlob: Blob | undefined;
    const revokeObjectURL = vi.fn();
    // jsdom doesn't implement object URLs; stub them for the download path.
    Object.defineProperty(URL, 'createObjectURL', {
      value: (b: Blob) => {
        capturedBlob = b;
        return 'blob:mock';
      },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    });
    // Prevent jsdom "navigation not implemented" noise from the anchor click.
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json(mealsEnvelope([meal({ id: 'm-1', name: 'Tacos', difficulty: 'EASY' })])),
      ),
      http.get(`/api/families/${FAMILY_ID}/meals/export`, () =>
        HttpResponse.json({
          meals: [
            {
              name: 'Tacos',
              description: 'Yum',
              difficulty: 'EASY',
              ingredients: [
                { name: 'Tortillas', quantity: '6', unit: null, category: 'produce' },
              ],
            },
          ],
        }),
      ),
    );

    renderWithProviders(<MealsPage />);

    const exportBtn = await screen.findByRole('button', { name: 'Export CSV' });
    fireEvent.click(exportBtn);

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(capturedBlob).toBeInstanceOf(Blob);
    expect(capturedBlob!.type).toBe('text/csv;charset=utf-8');
    // jsdom's Blob has no .text(); read it via FileReader.
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(capturedBlob!);
    });
    expect(text.split('\n')[0]).toBe(
      'meal,description,difficulty,ingredient,quantity,unit,category,prepTimeMinutes,cookTimeMinutes,servings,sourceUrl,notes,favorite,rating',
    );
    expect(text).toContain('Tacos,Yum,EASY,Tortillas,6,,produce');

    clickSpy.mockRestore();
  });

  it('surfaces an error when there are no meals to export', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () => HttpResponse.json(mealsEnvelope([]))),
      http.get(`/api/families/${FAMILY_ID}/meals/export`, () =>
        HttpResponse.json({ meals: [] }),
      ),
    );

    renderWithProviders(<MealsPage />);

    const exportBtn = await screen.findByRole('button', { name: 'Export CSV' });
    fireEvent.click(exportBtn);

    expect(await screen.findByText('No meals to export yet.')).toBeInTheDocument();
  });
});

describe('MealsPage recent indicator', () => {
  it('shows a Recent badge with the last-scheduled date when the meal is recent', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json(mealsEnvelope([
          meal({
            id: 'm-1',
            name: 'Tacos',
            recentlyScheduled: true,
            lastScheduledOn: '2026-06-29',
          }),
        ])),
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
        HttpResponse.json(mealsEnvelope([
          meal({
            id: 'm-2',
            name: 'Soup',
            recentlyScheduled: false,
            lastScheduledOn: null,
          }),
        ])),
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
      http.get(`/api/families/${FAMILY_ID}/meals`, async () => {
        await delay(40);
        return HttpResponse.json(mealsEnvelope([meal({ id: 'm-1', name: 'Tacos' })]));
      }),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByRole('status', { name: /loading meals/i })).toBeInTheDocument();
    expect(await screen.findByText('Tacos')).toBeInTheDocument();
  });

  it('gives the search field an accessible name', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () => HttpResponse.json(mealsEnvelope([]))),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByRole('textbox', { name: 'Search meals' })).toBeInTheDocument();
  });

  it('names the edit and delete controls after the meal they act on', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () =>
        HttpResponse.json(mealsEnvelope([meal({ id: 'm-1', name: 'Tacos' })])),
      ),
    );

    renderWithProviders(<MealsPage />);

    // Wait for the async list before asserting on the per-meal controls.
    expect(await screen.findByText('Tacos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Tacos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Tacos' })).toBeInTheDocument();
  });
});

describe('MealsPage discovery filters', () => {
  it('filters by difficulty and sends difficulty[] params', async () => {
    const urls: string[] = [];
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, ({ request }) => {
        urls.push(request.url);
        const diffs = new URL(request.url).searchParams.getAll('difficulty');
        const items = diffs.includes('MEDIUM')
          ? [meal({ id: 'm-2', name: 'Stew', difficulty: 'MEDIUM' })]
          : [meal({ id: 'm-1', name: 'Tacos', difficulty: 'HARD' })];
        return HttpResponse.json(mealsEnvelope(items));
      }),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByText('Tacos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));

    expect(await screen.findByText('Stew')).toBeInTheDocument();
    const lastUrl = new URL(urls[urls.length - 1]);
    expect(lastUrl.searchParams.getAll('difficulty')).toEqual(['MEDIUM']);
    // The toggle is a pressable, keyboard-accessible control.
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sends sort and order params when those controls change', async () => {
    const urls: string[] = [];
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(mealsEnvelope([meal({ id: 'm-1', name: 'Tacos' })]));
      }),
    );

    renderWithProviders(<MealsPage />);
    expect(await screen.findByText('Tacos')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
      target: { value: 'created' },
    });
    await waitFor(() =>
      expect(new URL(urls[urls.length - 1]).searchParams.get('sort')).toBe('created'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sort ascending' }));
    await waitFor(() =>
      expect(new URL(urls[urls.length - 1]).searchParams.get('order')).toBe('desc'),
    );
  });

  it('debounces the search box into a single trailing request', async () => {
    const searchUrls: string[] = [];
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, ({ request }) => {
        const q = new URL(request.url).searchParams.get('search');
        if (q) searchUrls.push(q);
        return HttpResponse.json(mealsEnvelope([meal({ id: 'm-1', name: 'Tacos' })]));
      }),
    );

    renderWithProviders(<MealsPage />);
    expect(await screen.findByText('Tacos')).toBeInTheDocument();

    const box = screen.getByRole('textbox', { name: 'Search meals' });
    fireEvent.change(box, { target: { value: 'p' } });
    fireEvent.change(box, { target: { value: 'pi' } });
    fireEvent.change(box, { target: { value: 'piz' } });
    fireEvent.change(box, { target: { value: 'pizza' } });

    await waitFor(() => expect(searchUrls).toContain('pizza'));
    // Debounce collapses the fast keystrokes into exactly one trailing request.
    expect(searchUrls).toEqual(['pizza']);
  });

  it('appends the next page when Load more is clicked', async () => {
    const urls: string[] = [];
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, ({ request }) => {
        urls.push(request.url);
        const offset = Number(new URL(request.url).searchParams.get('offset') ?? '0');
        if (offset > 0) {
          return HttpResponse.json({
            items: [meal({ id: 'm-2', name: 'Soup' })],
            total: 2,
            limit: 24,
            offset,
            hasMore: false,
          });
        }
        return HttpResponse.json({
          items: [meal({ id: 'm-1', name: 'Tacos' })],
          total: 2,
          limit: 24,
          offset: 0,
          hasMore: true,
        });
      }),
    );

    renderWithProviders(<MealsPage />);
    expect(await screen.findByText('Tacos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    // Both pages are now visible — appended, not replaced.
    expect(await screen.findByText('Soup')).toBeInTheDocument();
    expect(screen.getByText('Tacos')).toBeInTheDocument();
    expect(new URL(urls[urls.length - 1]).searchParams.get('offset')).toBe('1');
  });

  it('names the discovery controls for assistive tech', async () => {
    server.use(
      authMeWithFamily(),
      http.get(`/api/families/${FAMILY_ID}/meals`, () => HttpResponse.json(mealsEnvelope([]))),
    );

    renderWithProviders(<MealsPage />);

    expect(await screen.findByRole('group', { name: 'Filter by difficulty' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort ascending' })).toBeInTheDocument();
  });
});
