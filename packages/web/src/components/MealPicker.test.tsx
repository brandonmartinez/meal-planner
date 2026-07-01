import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test-utils/render';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import MealPicker from './MealPicker';

const meals = [
    { id: 'm-1', name: 'Tacos', description: 'Yum', placeholderKind: null, familyId: 'f-1', difficulty: 'HARD', _count: { ingredients: 3 }, recentlyScheduled: true, lastScheduledOn: '2026-06-29' },
    { id: 'm-2', name: 'Pizza', description: null, placeholderKind: null, familyId: 'f-1', difficulty: null, _count: { ingredients: 0 }, recentlyScheduled: false, lastScheduledOn: null },
    { id: 'p-1', name: 'Takeout / Delivery', description: null, placeholderKind: 'TAKEOUT', familyId: 'f-1', difficulty: null, _count: { ingredients: 0 }, recentlyScheduled: false, lastScheduledOn: null },
];

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
            http.get('/api/families/f-1/meals', () => HttpResponse.json(meals)),
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
                return HttpResponse.json([]);
            }),
        );

        renderWithProviders(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
        );
        await waitFor(() => expect(lastUrl).toBeTruthy());

        await userEvent.type(screen.getByPlaceholderText(/search meals/i), 'pizza');
        await waitFor(() => expect(lastUrl).toContain('search=pizza'));
    });

    it('invokes onSelect with the chosen meal id', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(meals)),
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
            http.get('/api/families/f-1/meals', () => HttpResponse.json(meals)),
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
    });

    it('invokes onClose when the close button is clicked', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json([])),
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
                http.get('/api/families/f-1/meals', () => HttpResponse.json([])),
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
                http.get('/api/families/f-1/meals', () => HttpResponse.json([])),
            );

            renderWithProviders(
                <MealPicker familyId="f-1" onSelect={() => { }} onClose={() => { }} />,
            );

            expect(screen.getByRole('button', { name: /close meal picker/i })).toBeInTheDocument();
        });

        it('moves initial focus to the search field when opened', async () => {
            server.use(
                http.get('/api/families/f-1/meals', () => HttpResponse.json([])),
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
                http.get('/api/families/f-1/meals', () => HttpResponse.json([])),
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
                http.get('/api/families/f-1/meals', () => HttpResponse.json([])),
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
                http.get('/api/families/f-1/meals', () => HttpResponse.json(meals)),
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
