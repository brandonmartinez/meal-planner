import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DayCard from './DayCard';
import type { DayPlan } from '@meal-planner/shared';

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

describe('DayCard', () => {
    it('shows the day name and "No suggestions" when empty', () => {
        render(
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
        render(
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
        render(
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
        render(
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
        render(
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
        render(
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
        render(
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
