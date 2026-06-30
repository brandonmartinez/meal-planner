import { describe, it, expect, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '../test-utils/render';
import ThemeToggle from './ThemeToggle';

// ThemeProvider mutates the documentElement class; clear it between tests so
// resolved-theme assertions don't leak across cases.
afterEach(() => {
    document.documentElement.classList.remove('dark');
});

describe('ThemeToggle', () => {
    describe('icon variant', () => {
        it('toggles the resolved theme via ThemeContext when clicked', async () => {
            const user = userEvent.setup();
            renderWithProviders(<ThemeToggle />);

            // Default theme is "system" → light, so the control offers to switch to dark.
            const toggle = screen.getByRole('button', { name: /switch to dark mode/i });
            expect(document.documentElement.classList.contains('dark')).toBe(false);

            await user.click(toggle);

            // After toggling, the context resolves to dark and the label flips.
            expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
            expect(document.documentElement.classList.contains('dark')).toBe(true);

            await user.click(screen.getByRole('button', { name: /switch to light mode/i }));
            expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
            expect(document.documentElement.classList.contains('dark')).toBe(false);
        });
    });

    describe('menu variant', () => {
        it('exposes Light/Dark/System options with System pressed by default', () => {
            renderWithProviders(<ThemeToggle variant="menu" />);

            expect(screen.getByRole('button', { name: /light/i })).toHaveAttribute('aria-pressed', 'false');
            expect(screen.getByRole('button', { name: /dark/i })).toHaveAttribute('aria-pressed', 'false');
            expect(screen.getByRole('button', { name: /system/i })).toHaveAttribute('aria-pressed', 'true');
        });

        it('selecting Dark routes through ThemeContext and applies the dark class', async () => {
            const user = userEvent.setup();
            renderWithProviders(<ThemeToggle variant="menu" />);

            await user.click(screen.getByRole('button', { name: /dark/i }));

            expect(screen.getByRole('button', { name: /dark/i })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByRole('button', { name: /system/i })).toHaveAttribute('aria-pressed', 'false');
            expect(document.documentElement.classList.contains('dark')).toBe(true);
            expect(window.localStorage.getItem('theme')).toBe('dark');

            await user.click(screen.getByRole('button', { name: /light/i }));
            expect(screen.getByRole('button', { name: /light/i })).toHaveAttribute('aria-pressed', 'true');
            expect(document.documentElement.classList.contains('dark')).toBe(false);
            expect(window.localStorage.getItem('theme')).toBe('light');
        });
    });
});
