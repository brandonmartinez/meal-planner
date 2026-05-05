import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
    it('renders with the default message and a status role', () => {
        render(<LoadingSpinner />);
        const status = screen.getByRole('status');
        expect(status).toBeInTheDocument();
        expect(status).toHaveAttribute('aria-label', 'Loading...');
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders a custom message', () => {
        render(<LoadingSpinner message="Fetching meals" />);
        expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Fetching meals');
        expect(screen.getByText('Fetching meals')).toBeInTheDocument();
    });
});
