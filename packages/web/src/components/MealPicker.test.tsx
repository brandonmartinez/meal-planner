import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import MealPicker from './MealPicker';

const meals = [
    { id: 'm-1', name: 'Tacos', description: 'Yum', placeholderKind: null, familyId: 'f-1' },
    { id: 'm-2', name: 'Pizza', description: null, placeholderKind: null, familyId: 'f-1' },
    { id: 'p-1', name: 'Takeout / Delivery', description: null, placeholderKind: 'TAKEOUT', familyId: 'f-1' },
];

describe('MealPicker', () => {
    it('renders meals fetched from the API including placeholders', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json(meals)),
        );

        render(
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

        render(
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

        render(
            <MealPicker familyId="f-1" onSelect={onSelect} onClose={() => { }} />,
        );
        await waitFor(() => expect(screen.getByText('Tacos')).toBeInTheDocument());

        await userEvent.click(screen.getByText('Tacos'));
        expect(onSelect).toHaveBeenCalledWith('m-1');
    });

    it('invokes onClose when the close button is clicked', async () => {
        server.use(
            http.get('/api/families/f-1/meals', () => HttpResponse.json([])),
        );
        const onClose = vi.fn();

        render(
            <MealPicker familyId="f-1" onSelect={() => { }} onClose={onClose} />,
        );
        await waitFor(() => expect(screen.getByText(/no meals found/i)).toBeInTheDocument());
        await userEvent.click(screen.getByRole('button', { name: '✕' }));
        expect(onClose).toHaveBeenCalled();
    });
});
