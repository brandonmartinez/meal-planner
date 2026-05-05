import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ToastContainer from './Toast';
import { ToastProvider, useToast } from '../context/ToastContext';

function Trigger() {
    const { showToast } = useToast();
    return (
        <button onClick={() => showToast('Saved!', 'success')}>show</button>
    );
}

describe('Toast component', () => {
    it('renders nothing when there are no toasts', () => {
        render(
            <ToastProvider>
                <ToastContainer />
            </ToastProvider>,
        );
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('renders a toast after showToast is called', async () => {
        const user = userEvent.setup();
        render(
            <ToastProvider>
                <Trigger />
                <ToastContainer />
            </ToastProvider>,
        );
        await user.click(screen.getByRole('button', { name: 'show' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Saved!');
    });

    it('dismiss button removes the toast', async () => {
        const user = userEvent.setup();
        render(
            <ToastProvider>
                <Trigger />
                <ToastContainer />
            </ToastProvider>,
        );
        await user.click(screen.getByRole('button', { name: 'show' }));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /dismiss/i }));
        expect(screen.queryByRole('alert')).toBeNull();
    });
});

// Quiet unused-import warnings if any tooling complains.
void act;
