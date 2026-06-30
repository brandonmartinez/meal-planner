import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../test-utils/render';
import WeekSelector from './WeekSelector';
import { formatWeekRange, getCurrentWeekStart } from '../utils/date';

// localStorage is cleared between tests (setup.ts), so the WeekProvider always
// starts on the current week.
describe('WeekSelector', () => {
    it('starts on the current week with the "jump to today" control disabled', () => {
        renderWithProviders(<WeekSelector />);

        // The center control shows the current week range and is disabled while current.
        const current = screen.getByTitle('Current week');
        expect(current).toBeDisabled();
        expect(current).toHaveTextContent(formatWeekRange(getCurrentWeekStart()));
        // No "Today" affordance is shown while already on the current week.
        expect(screen.queryByText('Today')).not.toBeInTheDocument();
    });

    it('moves to the previous week and surfaces a "Today" jump affordance', async () => {
        const user = userEvent.setup();
        renderWithProviders(<WeekSelector />);

        const currentLabel = formatWeekRange(getCurrentWeekStart());
        await user.click(screen.getByRole('button', { name: /previous week/i }));

        // Range label changed away from the current week and the jump control is now enabled.
        const jump = screen.getByTitle('Jump to current week');
        expect(jump).toBeEnabled();
        expect(jump).not.toHaveTextContent(currentLabel);
        expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('moves to the next week from the current week', async () => {
        const user = userEvent.setup();
        renderWithProviders(<WeekSelector />);

        const currentLabel = formatWeekRange(getCurrentWeekStart());
        await user.click(screen.getByRole('button', { name: /next week/i }));

        const jump = screen.getByTitle('Jump to current week');
        expect(jump).not.toHaveTextContent(currentLabel);
        expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('returns to the current week when the jump control is clicked', async () => {
        const user = userEvent.setup();
        renderWithProviders(<WeekSelector />);

        await user.click(screen.getByRole('button', { name: /previous week/i }));
        // Now off the current week — click the jump-to-today control.
        await user.click(screen.getByTitle('Jump to current week'));

        const current = screen.getByTitle('Current week');
        expect(current).toBeDisabled();
        expect(current).toHaveTextContent(formatWeekRange(getCurrentWeekStart()));
        expect(screen.queryByText('Today')).not.toBeInTheDocument();
    });

    it('supports prev/next navigation in the mobile variant', async () => {
        const user = userEvent.setup();
        renderWithProviders(<WeekSelector variant="mobile" />);

        expect(screen.queryByText('Today')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /next week/i }));
        expect(screen.getByText('Today')).toBeInTheDocument();
    });
});
