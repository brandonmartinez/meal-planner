import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import ImportMealsDialog from './ImportMealsDialog';

const IMPORT_URL = '/api/families/f-1/meals/import';

function renderDialog(overrides?: { onClose?: () => void; onImported?: () => void }) {
    const onClose = overrides?.onClose ?? vi.fn();
    const onImported = overrides?.onImported ?? vi.fn();
    render(<ImportMealsDialog familyId="f-1" onClose={onClose} onImported={onImported} />);
    return { onClose, onImported };
}

describe('ImportMealsDialog', () => {
    it('renders the dialog heading and an initially-disabled import action', () => {
        renderDialog();

        expect(screen.getByRole('heading', { name: /import meals from csv/i })).toBeInTheDocument();
        // Nothing parsed yet, so the import button is disabled.
        expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled();
    });

    it('invokes onClose from both the header close button and the Cancel button', async () => {
        const user = userEvent.setup();
        const { onClose } = renderDialog();

        await user.click(screen.getByRole('button', { name: /close/i }));
        expect(onClose).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('parses pasted/loaded CSV into a preview and enables import', async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole('button', { name: /^load example$/i }));

        // The sample CSV contains two meals.
        expect(screen.getByText('Spaghetti Bolognese')).toBeInTheDocument();
        expect(screen.getByText('Taco Tuesday')).toBeInTheDocument();
        expect(screen.getByText(/preview: 2 meals/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /import 2 meals/i })).toBeEnabled();
    });

    it('submits the import and shows a success summary, calling onImported', async () => {
        const user = userEvent.setup();
        server.use(
            http.post(IMPORT_URL, () =>
                HttpResponse.json({ created: 2, updated: 0, skipped: 0, errors: [] }),
            ),
        );
        const { onImported } = renderDialog();

        await user.click(screen.getByRole('button', { name: /^load example$/i }));
        await user.click(screen.getByRole('button', { name: /import 2 meals/i }));

        await waitFor(() => expect(screen.getByText(/import complete/i)).toBeInTheDocument());
        expect(screen.getByText(/created: 2/i)).toBeInTheDocument();
        expect(onImported).toHaveBeenCalledTimes(1);
        // The footer "Cancel" action collapses to "Close" once a result exists,
        // and the import button is removed.
        expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /import 2 meals/i })).not.toBeInTheDocument();
    });

    it('surfaces a server error and does not call onImported', async () => {
        const user = userEvent.setup();
        server.use(
            http.post(IMPORT_URL, () =>
                HttpResponse.json({ error: 'Import blew up' }, { status: 500 }),
            ),
        );
        const { onImported } = renderDialog();

        await user.click(screen.getByRole('button', { name: /^load example$/i }));
        await user.click(screen.getByRole('button', { name: /import 2 meals/i }));

        await waitFor(() => expect(screen.getByText(/import blew up/i)).toBeInTheDocument());
        expect(onImported).not.toHaveBeenCalled();
        // Import action remains available to retry.
        expect(screen.getByRole('button', { name: /import 2 meals/i })).toBeInTheDocument();
    });
});
