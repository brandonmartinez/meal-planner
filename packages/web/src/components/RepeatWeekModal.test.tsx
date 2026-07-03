import { vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, fireEvent, waitFor } from '../test-utils/render';
import RepeatWeekModal from './RepeatWeekModal';

const FAMILY_ID = 'fam-1';
const WEEK_START = '2026-07-06'; // a Monday
const PREV_WEEK = '2026-06-29'; // the default source: shiftWeek(WEEK_START, -1)
const repeatUrl = `/api/families/${FAMILY_ID}/weeks/${WEEK_START}/repeat`;

function weekPlan() {
  return { id: 'w-1', familyId: FAMILY_ID, weekStart: WEEK_START, days: [] };
}

function renderModal(onApplied = vi.fn(), onClose = vi.fn()) {
  renderWithProviders(
    <RepeatWeekModal
      familyId={FAMILY_ID}
      weekStart={WEEK_START}
      onApplied={onApplied}
      onClose={onClose}
    />,
  );
  return { onApplied, onClose };
}

describe('RepeatWeekModal', () => {
  it('renders the source-week field, existing-mode select, and copy button', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Copy meals from week of')).toBeInTheDocument();
    expect(screen.getByText('If this week has meals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy meals' })).toBeInTheDocument();

    // Defaults: source is the previous week, mode is the non-destructive "error".
    const dateInput = screen.getByLabelText('Copy meals from week of') as HTMLInputElement;
    expect(dateInput.value).toBe(PREV_WEEK);
    const modeSelect = screen.getByLabelText('If this week has meals') as HTMLSelectElement;
    expect(modeSelect.value).toBe('error');
  });

  it('copies with the default source week and existingMode "error", then calls onApplied', async () => {
    let body: { sourceWeekStart?: unknown; existingMode?: unknown } | undefined;
    server.use(
      http.post(repeatUrl, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(weekPlan());
      }),
    );

    const { onApplied } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Copy meals' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(body?.sourceWeekStart).toBe(PREV_WEEK);
    expect(body?.existingMode).toBe('error');
  });

  it('sends the selected existing-mode when the user picks "replace"', async () => {
    let body: { existingMode?: unknown } | undefined;
    server.use(
      http.post(repeatUrl, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(weekPlan());
      }),
    );

    const { onApplied } = renderModal();

    fireEvent.change(screen.getByLabelText('If this week has meals'), {
      target: { value: 'replace' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy meals' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(body?.existingMode).toBe('replace');
  });

  it('sends the edited source week', async () => {
    let body: { sourceWeekStart?: unknown } | undefined;
    server.use(
      http.post(repeatUrl, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(weekPlan());
      }),
    );

    const { onApplied } = renderModal();

    fireEvent.change(screen.getByLabelText('Copy meals from week of'), {
      target: { value: '2026-06-22' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy meals' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(body?.sourceWeekStart).toBe('2026-06-22');
  });

  it('shows a busy label while the copy is in flight', async () => {
    server.use(
      http.post(repeatUrl, async () => {
        await delay();
        return HttpResponse.json(weekPlan());
      }),
    );

    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Copy meals' }));

    expect(await screen.findByRole('button', { name: 'Copying…' })).toBeDisabled();
  });

  it('surfaces a 409 conflict in an alert and keeps the modal open', async () => {
    server.use(
      http.post(repeatUrl, () =>
        HttpResponse.json(
          { error: 'Target week already has suggestions' },
          { status: 409 },
        ),
      ),
    );

    const { onApplied } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Copy meals' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Target week already has suggestions');
    expect(onApplied).not.toHaveBeenCalled();
    // Still open — the user can adjust the mode and retry.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes without copying when Cancel is clicked', () => {
    const { onClose, onApplied } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApplied).not.toHaveBeenCalled();
  });
});
