import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, waitFor, within } from '../test-utils/render';
import userEvent from '@testing-library/user-event';
import DayCard from './DayCard';
import type { DayPlan } from '@meal-planner/shared';

const FAMILY_ID = 'fam-1';

function makeDay(overrides: Partial<DayPlan> = {}): DayPlan {
    return {
        id: 'd-1',
        date: '2026-05-04',
        weekPlanId: 'wp-1',
        suggestions: [],
        ...overrides,
    } as DayPlan;
}

const baseSuggestion = {
    id: 's-1',
    dayPlanId: 'd-1',
    mealId: 'm-1',
    userId: 'user-1',
    approved: false,
    meal: {
        id: 'm-1',
        name: 'Tacos',
        description: null,
        placeholderKind: null,
    },
    suggestedBy: {
        id: 'user-1',
        name: 'Alice',
        email: 'a@b.com',
        avatarUrl: null,
    },
};

// Seeds a signed-in parent whose active family is FAMILY_ID, so the
// SuggestionChip's useFamily() resolves a non-null familyId and the meal body
// becomes a clickable "View details" button.
function authMeWithFamily() {
    return http.get('/api/auth/me', () =>
        HttpResponse.json({
            id: 'user-1',
            email: 'a@b.com',
            name: 'Alice',
            avatarUrl: null,
            memberships: [
                {
                    id: 'fm-1',
                    role: 'PARENT',
                    familyId: FAMILY_ID,
                    userId: 'user-1',
                    family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
                },
            ],
        }),
    );
}

// A complete meal payload for the detail-modal fetch.
function fullMeal(overrides: Record<string, unknown> = {}) {
    return {
        id: 'm-1',
        name: 'Tacos',
        description: 'Weeknight tacos',
        imageUrl: null,
        placeholderKind: null,
        difficulty: 'HARD',
        prepTimeMinutes: 10,
        cookTimeMinutes: 15,
        servings: 4,
        sourceUrl: null,
        notes: null,
        favorite: true,
        rating: 5,
        familyId: FAMILY_ID,
        tags: [],
        categories: [],
        collections: [],
        ingredients: [
            { id: 'i-1', name: 'olive oil', quantity: '2', unit: 'tbsp' },
        ],
        ...overrides,
    };
}

describe('DayCard', () => {
    it('shows the day name and "No suggestions" when empty', () => {
        renderWithProviders(
            <DayCard
                day={makeDay()}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
            />,
        );
        expect(screen.getByText('Monday')).toBeInTheDocument();
        expect(screen.getByText(/no suggestions/i)).toBeInTheDocument();
    });

    it('renders suggestions and triggers onAddMeal', async () => {
        const onAddMeal = vi.fn();
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={onAddMeal}
                onApprove={() => { }}
                onRemove={() => { }}
            />,
        );
        expect(screen.getByText('Tacos')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /add meal/i }));
        expect(onAddMeal).toHaveBeenCalledTimes(1);
    });

    it('shows the approve button to a parent for unapproved suggestions and calls onApprove', async () => {
        const onApprove = vi.fn();
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={onApprove}
                onRemove={() => { }}
            />,
        );
        await userEvent.click(screen.getByTitle('Approve'));
        expect(onApprove).toHaveBeenCalledWith('s-1');
    });

    it('hides the approve button for non-parents', () => {
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent={false}
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
            />,
        );
        expect(screen.queryByTitle('Approve')).toBeNull();
    });

    it('hides the remove button for a child viewing another user\'s suggestion', () => {
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent={false}
                currentUserId="other-user"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
            />,
        );
        expect(screen.queryByTitle('Remove')).toBeNull();
    });

    it('shows the remove button to a child viewing their own suggestion', async () => {
        const onRemove = vi.fn();
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent={false}
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={onRemove}
            />,
        );
        await userEvent.click(screen.getByTitle('Remove'));
        expect(onRemove).toHaveBeenCalledWith('s-1');
    });

    it('renders an emoji for placeholder meals', () => {
        const placeholderSuggestion = {
            ...baseSuggestion,
            meal: { ...baseSuggestion.meal, placeholderKind: 'TAKEOUT' as const },
        };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [placeholderSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
            />,
        );
        expect(screen.getByText('🍕')).toBeInTheDocument();
    });
});

describe('DayCard — meal detail modal', () => {
    it('opens the meal-detail modal when the card body is clicked', async () => {
        server.use(
            authMeWithFamily(),
            http.get(`/api/families/${FAMILY_ID}/meals/m-1`, () =>
                HttpResponse.json(fullMeal()),
            ),
        );

        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
            />,
        );

        const body = await screen.findByRole('button', {
            name: /view details for tacos/i,
        });
        await userEvent.click(body);

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByRole('heading', { name: 'Tacos' }),
        ).toBeInTheDocument();
        // Detail fetched from the meal endpoint (not present on the card itself).
        expect(await within(dialog).findByText(/olive oil/i)).toBeInTheDocument();
        expect(
            within(dialog).getByRole('link', { name: /cooking mode/i }),
        ).toHaveAttribute('href', '/meals/m-1/cook');
    });

    it('keeps approve/remove working and does NOT open the modal', async () => {
        const onApprove = vi.fn();
        const onRemove = vi.fn();
        server.use(authMeWithFamily());

        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={onApprove}
                onRemove={onRemove}
            />,
        );

        // Wait until familyId resolves so the body is a clickable button —
        // this proves stopPropagation, not merely a non-clickable card.
        await screen.findByRole('button', { name: /view details for tacos/i });

        await userEvent.click(screen.getByTitle('Approve'));
        expect(onApprove).toHaveBeenCalledWith('s-1');
        expect(screen.queryByRole('dialog')).toBeNull();

        await userEvent.click(screen.getByTitle('Remove'));
        expect(onRemove).toHaveBeenCalledWith('s-1');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('does not open a detail modal for placeholder suggestions', async () => {
        const placeholderSuggestion = {
            ...baseSuggestion,
            meal: { ...baseSuggestion.meal, placeholderKind: 'TAKEOUT' as const },
        };
        // Seed a resolvable family so the ONLY reason the body stays inert is the
        // placeholder guard, not a missing familyId.
        server.use(authMeWithFamily());

        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [placeholderSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
            />,
        );

        expect(await screen.findByText('🍕')).toBeInTheDocument();
        // No clickable details affordance for a placeholder.
        expect(
            screen.queryByRole('button', { name: /view details/i }),
        ).toBeNull();
        // Clicking the placeholder body does nothing.
        await userEvent.click(screen.getByText('🍕'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
