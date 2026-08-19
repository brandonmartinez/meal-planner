import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test-utils/render';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import MealPicker from './MealPicker';

const meals = [
    { id: 'm-1', name: 'Tacos', description: 'Yum', placeholderKind: null, familyId: 'f-1', difficulty: 'HARD', _count: { ingredients: 3 }, recentlyScheduled: true, lastScheduledOn: '2026-06-29', lastCookedOn: '2026-06-29', timesCooked: 5 },
    { id: 'm-2', name: 'Pizza', description: null, placeholderKind: null, familyId: 'f-1', difficulty: null, _count: { ingredients: 0 }, recentlyScheduled: false, lastScheduledOn: null, lastCookedOn: null, timesCooked: 0 },
    { id: 'p-1', name: 'Takeout / Delivery', description: null, placeholderKind: 'TAKEOUT', familyId: 'f-1', difficulty: null, _count: { ingredients: 0 }, recentlyScheduled: false, lastScheduledOn: null, lastCookedOn: null, timesCooked: 0 },
];

function mealsEnvelope(items: typeof meals) {
    return { items, total: items.length, limit: 25, offset: 0, hasMore: false };
}

/** Harness with a real trigger button so we can assert focus return on close. */
function PickerHarness({ onSelect = () => { } }: { onSelect?: (id: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)}>Open picker</button>
            {open && (
                <MealPicker familyId="f-1" onSelect={onSelect} onClose={() => setOpen(false)} />
            )}
        </>
    );
}

describe('MealPicker', () => {
    it('renders meals fetched from the API including placeholders', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(meals))),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );

        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());
        expect(screen.getByText('Pizza')).toBeInTheDocument();
        expect(screen.getByText(/takeout \/ delivery/i)).toBeInTheDocument();
        expect(screen.getByText(/quick options/i)).toBeInTheDocument();
    });

    it('passes the search input as a query parameter', async () => {
        let lastUrl = '';
        server.use(
            http.get('/api/families/f-1/meals', ({ request }) => {
                lastUrl = request.url;
                return HttpResponse.json(mealsEnvelope([]));
            }),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(lastUrl).toBeTruthy());

        await userEvent.type(screen.getByPlaceholderText(/search meals/i), 'pizza');
        await waitFor(() => expect(lastUrl).toContain('search=pizza'));
    });

    it('sends the difficulty filter as a query parameter', async () => {
        let lastUrl = '';
        server.use(
            http.get('/api/families/f-1/meals', ({ request }) => {
                lastUrl = request.url;
                return HttpResponse.json(mealsEnvelope(meals));
            }),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'HARD');

        await waitFor(() =>
            expect(new URL(lastUrl).searchParams.getAll('difficulty')).toEqual(['HARD']),
        );
        expect(screen.getByLabelText('Difficulty')).toHaveValue('HARD');
    });

    it('describes name, tag, and ingredient-category search', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(meals))),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        expect(
            screen.getByPlaceholderText('Search meals by name, tag, or category…'),
        ).toBeInTheDocument();
    });

    it('hides advanced filters until the toggle is expanded', async () => {
        server.use(
            ...taxonomyHandlers([tag('t-1', 'Weeknight')]),
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(meals))),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        // Collapsed by default: the tag facet is not in the DOM yet.
        const toggle = await screen.findByRole('button', { name: /show more filters/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        // With tags as the only advanced facet, the whole affordance is
        // mobile-hidden but retained from sm upward.
        expect(toggle.parentElement).toHaveClass('hidden', 'sm:block');
        expect(screen.queryByRole('group', { name: /filter by tag/i })).not.toBeInTheDocument();

        // Difficulty stays always-visible even while collapsed.
        expect(screen.getByLabelText('Difficulty')).toBeInTheDocument();

        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const tagFacet = await screen.findByRole('group', { name: /filter by tag/i });
        expect(tagFacet).toHaveClass('hidden', 'sm:flex');
    });

    it('invokes onSelect with the chosen meal id', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(meals))),
        );
        const onSelect = vi.fn();

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={onSelect} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        await userEvent.click(screen.getByText('Tacos'));
        expect(onSelect).toHaveBeenCalledWith('m-1');
    });

    it('surfaces recent and difficulty badges on meal rows', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(meals))),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        // Recent meal (Tacos) shows a text-bearing Recent badge with an
        // accessible label carrying the last-scheduled date.
        expect(screen.getByText('Recent')).toBeInTheDocument();
        expect(
            screen.getByLabelText('Recent — last scheduled 2026-06-29'),
        ).toBeInTheDocument();
        // …and its difficulty pill.
        expect(screen.getByLabelText('Difficulty: Hard')).toBeInTheDocument();

        // Non-recent meal (Pizza) has neither badge.
        expect(screen.queryAllByText('Recent')).toHaveLength(1);
        expect(screen.queryByLabelText('Difficulty: Easy')).not.toBeInTheDocument();

        // Cook history (issue #99): Tacos (timesCooked 5) shows a text-bearing
        // cook badge with the last-cooked date in its accessible label…
        expect(screen.getByText('Cooked 5\u00d7')).toBeInTheDocument();
        expect(
            screen.getByLabelText('Cooked 5 times — last on 2026-06-29'),
        ).toBeInTheDocument();
        // …and a never-cooked meal (Pizza, timesCooked 0) shows no cook badge.
        expect(screen.queryAllByText(/^Cooked /)).toHaveLength(1);
    });

    it('renders a thumbnail image on rows that have an imageUrl', async () => {
        const withImage = [
            {
                id: 'm-1',
                name: 'Tacos',
                description: 'Yum',
                placeholderKind: null,
                familyId: 'f-1',
                difficulty: 'HARD',
                _count: { ingredients: 3 },
                recentlyScheduled: false,
                lastScheduledOn: null,
                lastCookedOn: null,
                imageUrl: 'https://cdn.example.com/tacos.jpg',
            },
        ];
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(withImage))),
        );

        const { container } = renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        expect(img).toHaveAttribute('src', 'https://cdn.example.com/tacos.jpg');
    });

    it('invokes onClose when the close button is clicked', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope([]))),
        );
        const onClose = vi.fn();

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={onClose} />,
        );
        await waitFor(() => expect(screen.getByText(/no meals found/i)).toBeInTheDocument());
        await userEvent.click(screen.getByRole('button', { name: /close meal picker/i }));
        expect(onClose).toHaveBeenCalled();
    });

    describe('accessibility', () => {
        it('exposes dialog semantics labelled by its visible heading', async () => {
            server.use(
                http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope([]))),
            );

            renderWithProviders(
                <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
            );

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            // The accessible name comes from the visible "Pick a Meal" heading via aria-labelledby.
            expect(dialog).toHaveAccessibleName('Pick a Meal');
        });

        it('gives the close button a descriptive accessible name', async () => {
            server.use(
                http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope([]))),
            );

            renderWithProviders(
                <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
            );

            expect(screen.getByRole('button', { name: /close meal picker/i })).toBeInTheDocument();
        });

        it('moves initial focus to the search field when opened', async () => {
            server.use(
                http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope([]))),
            );

            renderWithProviders(
                <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
            );

            await waitFor(() =>
                expect(screen.getByPlaceholderText(/search meals/i)).toHaveFocus(),
            );
        });

        it('closes when Escape is pressed', async () => {
            server.use(
                http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope([]))),
            );
            const onClose = vi.fn();

            renderWithProviders(
                <MealPicker familyId="f-1" onSelect={() => { }} onClose={onClose} />,
            );
            await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

            await userEvent.keyboard('{Escape}');
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('returns focus to the trigger when the dialog closes', async () => {
            server.use(
                http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope([]))),
            );

            renderWithProviders(<PickerHarness />);

            const trigger = screen.getByRole('button', { name: /open picker/i });
            await userEvent.click(trigger);
            await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

            await userEvent.keyboard('{Escape}');

            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
            expect(trigger).toHaveFocus();
        });

        it('traps Tab focus within the dialog', async () => {
            server.use(
                http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(meals))),
            );

            renderWithProviders(
                <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
            );
            await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

            const dialog = screen.getByRole('dialog');
            const focusables = Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
            );
            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            // Tabbing forward off the last element wraps to the first.
            last.focus();
            await userEvent.tab();
            expect(first).toHaveFocus();

            // Shift+Tab off the first element wraps to the last.
            first.focus();
            await userEvent.tab({ shift: true });
            expect(last).toHaveFocus();
        });
    });
});

function tag(id: string, name: string) {
    return { id, name, familyId: 'f-1' };
}

function taxonomyHandlers(tags: ReturnType<typeof tag>[]) {
    return [
        http.get('/api/families/f-1/tags', () => HttpResponse.json({ tags })),
    ];
}

describe('MealPicker tags', () => {
    it('renders compact tag pills on meal rows with +N overflow', async () => {
        const withTags = [
            {
                ...meals[0],
                tags: [tag('t-1', 'Weeknight'), tag('t-2', 'Spicy'), tag('t-3', 'Fresh')],
            },
        ];
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(withTags))),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        // max=2 → first two tag chips show; the third collapses into +1.
        const firstPill = screen.getByText('Weeknight');
        expect(firstPill).toBeInTheDocument();
        expect(screen.getByText('Spicy')).toBeInTheDocument();
        expect(screen.getByLabelText('1 more')).toBeInTheDocument();

        // Keep the desktop pills in the DOM while hiding their wrapper below sm.
        expect(firstPill.parentElement?.parentElement).toHaveClass('hidden', 'sm:block');
    });

    it('row tag pills are non-interactive spans nested in the option button', async () => {
        const withTags = [{ ...meals[0], tags: [tag('t-1', 'Weeknight')] }];
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(withTags))),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        const pill = screen.getByText('Weeknight');
        expect(pill.tagName).toBe('SPAN');
        // The pill lives inside the meal option button but adds no nested control.
        const row = pill.closest('button');
        expect(row).not.toBeNull();
        expect(row!.querySelector('button')).toBeNull();
    });

    it('filters by tag and sends repeated tags params', async () => {
        let lastUrl = '';
        server.use(
            ...taxonomyHandlers([tag('t-1', 'Weeknight')]),
            http.get('/api/families/f-1/meals', ({ request }) => {
                lastUrl = request.url;
                return HttpResponse.json(mealsEnvelope(meals));
            }),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        // Advanced facets are collapsed by default; reveal them first (#208).
        await userEvent.click(screen.getByRole('button', { name: /show more filters/i }));
        await userEvent.click(await screen.findByRole('button', { name: 'Weeknight' }));

        await waitFor(() =>
            expect(new URL(lastUrl).searchParams.getAll('tags')).toEqual(['Weeknight']),
        );
        expect(screen.getByRole('button', { name: 'Weeknight' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });

    it('still invokes onSelect when a taxonomy filter is present', async () => {
        server.use(
            ...taxonomyHandlers([tag('t-1', 'Weeknight')]),
            http.get('/api/families/f-1/meals', () => HttpResponse.json(mealsEnvelope(meals))),
        );
        const onSelect = vi.fn();

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={onSelect} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        await userEvent.click(screen.getByText('Tacos'));
        expect(onSelect).toHaveBeenCalledWith('m-1');
    });
});

describe('MealPicker collection filter', () => {
    it('sends the selected collection as a `collections` query param', async () => {
        let lastUrl = '';
        server.use(
            http.get('/api/families/f-1/collections', () =>
                HttpResponse.json({
                    collections: [
                        { id: 'col-1', name: 'Weeknight', familyId: 'f-1', description: null },
                    ],
                }),
            ),
            http.get('/api/families/f-1/meals', ({ request }) => {
                lastUrl = request.url;
                return HttpResponse.json(mealsEnvelope(meals));
            }),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        // Distinct dropdown affordance (not a chip row), rendered once a
        // collection exists for the family. Advanced facets are collapsed by
        // default, so reveal them first (#208).
        const toggle = screen.getByRole('button', { name: /show more filters/i });
        // Collections remain reachable on mobile, so their toggle is not hidden.
        expect(toggle.parentElement).not.toHaveClass('hidden');
        await userEvent.click(toggle);
        await userEvent.selectOptions(await screen.findByLabelText('Collection'), 'Weeknight');

        await waitFor(() =>
            expect(new URL(lastUrl).searchParams.getAll('collections')).toEqual([
                'Weeknight',
            ]),
        );
    });
});
