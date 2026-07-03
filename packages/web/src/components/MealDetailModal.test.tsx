import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen } from '../test-utils/render';
import MealDetailModal from './MealDetailModal';

const FAMILY_ID = 'fam-1';
const MEAL_ID = 'm-1';
const mealUrl = `/api/families/${FAMILY_ID}/meals/${MEAL_ID}`;

function fullMeal(overrides: Record<string, unknown> = {}) {
    return {
        id: MEAL_ID,
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

function renderModal(props: Partial<React.ComponentProps<typeof MealDetailModal>> = {}) {
    const onClose = vi.fn();
    renderWithProviders(
        <MealDetailModal
            familyId={FAMILY_ID}
            mealId={MEAL_ID}
            mealName="Tacos"
            onClose={onClose}
            {...props}
        />,
    );
    return { onClose };
}

describe('MealDetailModal', () => {
    it('fetches and renders the meal details', async () => {
        server.use(http.get(mealUrl, () => HttpResponse.json(fullMeal())));

        renderModal();

        expect(
            await screen.findByRole('heading', { name: 'Tacos' }),
        ).toBeInTheDocument();
        expect(screen.getByText(/olive oil/i)).toBeInTheDocument();
        expect(screen.getByLabelText('Favorite')).toBeInTheDocument();
    });

    it('links the cooking-mode button to /meals/{id}/cook', async () => {
        server.use(http.get(mealUrl, () => HttpResponse.json(fullMeal())));

        renderModal();

        const link = await screen.findByRole('link', { name: /cooking mode/i });
        expect(link).toHaveAttribute('href', `/meals/${MEAL_ID}/cook`);
    });

    it('shows a loading state while the meal is fetching', async () => {
        server.use(
            http.get(mealUrl, async () => {
                await delay(30);
                return HttpResponse.json(fullMeal());
            }),
        );

        renderModal();

        // LoadingSpinner exposes role="status" while the request is in flight.
        expect(screen.getByRole('status')).toBeInTheDocument();
        // ...and resolves to the detail view once the fetch completes.
        expect(
            await screen.findByRole('heading', { name: 'Tacos' }),
        ).toBeInTheDocument();
    });

    it('shows a friendly error when the meal fetch fails', async () => {
        server.use(
            http.get(mealUrl, () =>
                HttpResponse.json({ error: 'boom' }, { status: 500 }),
            ),
        );

        renderModal();

        expect(await screen.findByRole('alert')).toHaveTextContent(
            /failed to load recipe/i,
        );
    });
});
