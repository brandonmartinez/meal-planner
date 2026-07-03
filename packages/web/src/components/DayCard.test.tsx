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
                onUnapprove={() => { }}
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
                onUnapprove={() => { }}
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
                onUnapprove={() => { }}
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
                onUnapprove={() => { }}
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
                onUnapprove={() => { }}
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
                onUnapprove={() => { }}
            />,
        );
        expect(screen.getByText('🍕')).toBeInTheDocument();
    });

    it('approved suggestion shows the ↺ un-approve button and calls onUnapprove', async () => {
        const onUnapprove = vi.fn();
        const approvedSuggestion = { ...baseSuggestion, approved: true };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [approvedSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={onUnapprove}
            />,
        );
        const btn = screen.getByTitle('Un-approve');
        expect(btn).toBeInTheDocument();
        await userEvent.click(btn);
        expect(onUnapprove).toHaveBeenCalledWith('s-1');
    });

    it('approved suggestion shows no ✓ approve button (replaced by ↺)', () => {
        const approvedSuggestion = { ...baseSuggestion, approved: true };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [approvedSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.queryByTitle('Approve')).toBeNull();
        expect(screen.getByTitle('Un-approve')).toBeInTheDocument();
    });

    it('approved suggestion does not show a leading ✓ badge in the meal name', () => {
        const approvedSuggestion = { ...baseSuggestion, approved: true };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [approvedSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        // The name is present but no standalone ✓ span before it
        expect(screen.getByText('Tacos')).toBeInTheDocument();
        expect(screen.queryByText('✓')).toBeNull();
    });

    it('remove button is still present when suggestion is approved', () => {
        const approvedSuggestion = { ...baseSuggestion, approved: true };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [approvedSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        expect(screen.getByTitle('Remove')).toBeInTheDocument();
    });

    it('renders a photo stamp when meal has imageUrl (non-placeholder)', () => {
        const suggestionWithImage = {
            ...baseSuggestion,
            meal: { ...baseSuggestion.meal, imageUrl: 'https://example.com/tacos.jpg' },
        };
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [suggestionWithImage] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        const stamp = screen.getByRole('img', { name: /tacos/i });
        expect(stamp).toBeInTheDocument();
        // Image fills its container with object-cover (no distortion)
        expect(stamp).toHaveClass('object-cover');
        // Container is a square flush to the chip's left/top/bottom edges
        const container = stamp.parentElement!;
        expect(container).toHaveClass('aspect-square');
        expect(container).toHaveClass('self-stretch');
    });

    it('shows no stamp img when meal has no imageUrl', () => {
        // baseSuggestion has no imageUrl → showStamp is false → compact inline layout
        renderWithProviders(
            <DayCard
                day={makeDay({ suggestions: [baseSuggestion] as DayPlan['suggestions'] })}
                isParent
                currentUserId="user-1"
                onAddMeal={() => { }}
                onApprove={() => { }}
                onRemove={() => { }}
                onUnapprove={() => { }}
            />,
        );
        // No named stamp image — MealThumbnail returns null when src is absent
        expect(screen.queryByRole('img', { name: /tacos/i })).toBeNull();
        // Meal name still present in the compact layout
        expect(screen.getByText('Tacos')).toBeInTheDocument();
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
                onUnapprove={() => { }}
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
                onUnapprove={() => { }}
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
