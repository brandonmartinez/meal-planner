import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { WeekProvider } from '../context/WeekContext';

function AllProviders({ children }: { children: ReactNode }) {
    return (
        <MemoryRouter>
            <AuthProvider>
                <ThemeProvider>
                    <ToastProvider>
                        <WeekProvider>{children}</WeekProvider>
                    </ToastProvider>
                </ThemeProvider>
            </AuthProvider>
        </MemoryRouter>
    );
}

export function renderWithProviders(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>,
) {
    return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export RTL helpers for convenience.
export * from '@testing-library/react';
