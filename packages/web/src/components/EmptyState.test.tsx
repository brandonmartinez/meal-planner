import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
    it('renders title and default icon', () => {
        render(<EmptyState title="Nothing here" />);
        expect(screen.getByText('Nothing here')).toBeInTheDocument();
        expect(screen.getByText('📭')).toBeInTheDocument();
    });

    it('renders description and action when provided', () => {
        render(
            <EmptyState
                title="Nothing"
                description="Add something"
                action={<button>Go</button>}
            />,
        );
        expect(screen.getByText('Add something')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    });

    it('uses a custom icon when provided', () => {
        render(<EmptyState title="X" icon="🚀" />);
        expect(screen.getByText('🚀')).toBeInTheDocument();
    });
});
