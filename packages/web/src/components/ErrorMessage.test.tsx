import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorMessage from './ErrorMessage';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

describe('ErrorMessage', () => {
    it('renders the message inside an alert', () => {
        render(<ErrorMessage message="Boom" />);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Boom');
    });

    it('does not render a retry button when onRetry is not provided', () => {
        render(<ErrorMessage message="Boom" />);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('invokes onRetry when the retry button is clicked', async () => {
        const onRetry = vi.fn();
        render(<ErrorMessage message="Boom" onRetry={onRetry} />);
        await userEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});
