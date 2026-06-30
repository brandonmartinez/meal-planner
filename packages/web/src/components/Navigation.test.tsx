import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen } from '../test-utils/render';
import Navigation from './Navigation';

const FAMILY_USER = {
    id: 'u-1',
    email: 'alice@example.com',
    name: 'Alice Smith',
    avatarUrl: null,
    memberships: [{ familyId: 'f-1', family: { id: 'f-1', name: 'Test Family' } }],
};

function signedIn() {
    server.use(http.get('/api/auth/me', () => HttpResponse.json(FAMILY_USER)));
}

describe('Navigation', () => {
    it('shows only the brand link when signed out (no family routes)', async () => {
        // Default handler returns 401 → no user, no family.
        renderWithProviders(<Navigation />);

        expect(await screen.findByRole('link', { name: /meal planner/i })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'This Week' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Meals' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Grocery' })).not.toBeInTheDocument();
    });

    it('renders the family navigation links once a user with a family loads', async () => {
        signedIn();
        renderWithProviders(<Navigation />);

        expect(await screen.findByRole('link', { name: 'This Week' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Meals' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Grocery' })).toBeInTheDocument();
    });

    it('marks a navigation link active after it is followed', async () => {
        signedIn();
        const user = userEvent.setup();
        renderWithProviders(<Navigation />);

        const mealsLink = await screen.findByRole('link', { name: 'Meals' });
        expect(mealsLink).not.toHaveAttribute('aria-current', 'page');

        await user.click(mealsLink);

        expect(screen.getByRole('link', { name: 'Meals' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: 'This Week' })).not.toHaveAttribute('aria-current', 'page');
    });

    it('reveals the signed-in user identity in the account menu', async () => {
        signedIn();
        const user = userEvent.setup();
        renderWithProviders(<Navigation />);

        // Wait for auth to resolve before opening the menu.
        await screen.findByRole('link', { name: 'This Week' });
        await user.click(screen.getByRole('button', { name: /open menu/i }));

        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
        expect(screen.getByText('alice@example.com')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
});
