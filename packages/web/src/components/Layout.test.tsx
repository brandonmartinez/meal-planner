import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from '../test-utils/render';
import Layout from './Layout';

describe('Layout', () => {
    it('renders its children inside the main content area', () => {
        renderWithProviders(
            <Layout>
                <p>Hello from a page</p>
            </Layout>,
        );

        const main = screen.getByRole('main');
        expect(main).toBeInTheDocument();
        expect(screen.getByText('Hello from a page')).toBeInTheDocument();
        expect(main).toContainElement(screen.getByText('Hello from a page'));
    });

    it('renders the navigation shell and footer around the content', () => {
        renderWithProviders(
            <Layout>
                <div>child</div>
            </Layout>,
        );

        // Navigation landmark comes from the <Navigation /> shell.
        expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
        // Footer (contentinfo landmark) carries the brand + copyright line.
        const footer = screen.getByRole('contentinfo');
        expect(footer).toHaveTextContent(/meal planner/i);
        expect(footer).toHaveTextContent(/©/);
    });
});
