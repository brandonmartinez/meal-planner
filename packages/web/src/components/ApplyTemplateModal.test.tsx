import { vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, fireEvent, waitFor } from '../test-utils/render';
import ApplyTemplateModal from './ApplyTemplateModal';

const FAMILY_ID = 'fam-1';
const WEEK_START = '2026-07-06'; // a Monday
const templatesUrl = `/api/families/${FAMILY_ID}/templates`;
const applyUrl = `${templatesUrl}/t-1/apply`;

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    name: 'Busy Weeknights',
    familyId: FAMILY_ID,
    description: null,
    entries: [
      { id: 'e-1', templateId: 't-1', dayOfWeek: 0, mealId: 'm-1' },
      { id: 'e-2', templateId: 't-1', dayOfWeek: 1, mealId: 'm-2' },
    ],
    ...overrides,
  };
}

function weekPlan() {
  return { id: 'w-1', familyId: FAMILY_ID, weekStart: WEEK_START, days: [] };
}

function renderModal(onApplied = vi.fn(), onClose = vi.fn()) {
  renderWithProviders(
    <ApplyTemplateModal
      familyId={FAMILY_ID}
      weekStart={WEEK_START}
      onApplied={onApplied}
      onClose={onClose}
    />,
  );
  return { onApplied, onClose };
}

describe('ApplyTemplateModal', () => {
  it('shows a loading state while templates resolve', async () => {
    server.use(
      http.get(templatesUrl, async () => {
        await delay();
        return HttpResponse.json({ templates: [] });
      }),
    );

    renderModal();

    expect(await screen.findByText('Loading templates…')).toBeInTheDocument();
  });

  it('shows a hint when there are no templates', async () => {
    server.use(http.get(templatesUrl, () => HttpResponse.json({ templates: [] })));

    renderModal();

    expect(
      await screen.findByText('No templates yet. Create one on the Templates page first.'),
    ).toBeInTheDocument();
  });

  it('surfaces a load error and retries', async () => {
    let attempt = 0;
    server.use(
      http.get(templatesUrl, () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json({ error: 'kaboom' }, { status: 500 });
        }
        return HttpResponse.json({ templates: [template()] });
      }),
    );

    renderModal();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('kaboom');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Busy Weeknights')).toBeInTheDocument();
  });

  it('lists templates with a meal/day count summary', async () => {
    server.use(http.get(templatesUrl, () => HttpResponse.json({ templates: [template()] })));

    renderModal();

    expect(await screen.findByText('Busy Weeknights')).toBeInTheDocument();
    expect(screen.getByText('2 meals across 2 days')).toBeInTheDocument();
  });

  it('applies with existingMode "error" and calls onApplied on success', async () => {
    const modes: unknown[] = [];
    server.use(
      http.get(templatesUrl, () => HttpResponse.json({ templates: [template()] })),
      http.post(applyUrl, async ({ request }) => {
        const body = (await request.json()) as { existingMode?: string };
        modes.push(body.existingMode);
        return HttpResponse.json(weekPlan());
      }),
    );

    const { onApplied } = renderModal();

    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to this week' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(modes).toEqual(['error']);
  });

  it('on a 409 conflict, shows a confirmation instead of clobbering, then applies "skip"', async () => {
    const modes: string[] = [];
    server.use(
      http.get(templatesUrl, () => HttpResponse.json({ templates: [template()] })),
      http.post(applyUrl, async ({ request }) => {
        const body = (await request.json()) as { existingMode: string };
        modes.push(body.existingMode);
        if (body.existingMode === 'error') {
          return HttpResponse.json(
            { error: 'week already has suggestions' },
            { status: 409 },
          );
        }
        return HttpResponse.json(weekPlan());
      }),
    );

    const { onApplied } = renderModal();

    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to this week' }));

    // The destructive path is NOT taken automatically — a confirmation appears.
    expect(
      await screen.findByText('This week already has meals planned.'),
    ).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Keep existing meals, fill empty days' }),
    );

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(modes).toEqual(['error', 'skip']);
  });

  it('lets the user choose the destructive "replace" path from the confirmation', async () => {
    const modes: string[] = [];
    server.use(
      http.get(templatesUrl, () => HttpResponse.json({ templates: [template()] })),
      http.post(applyUrl, async ({ request }) => {
        const body = (await request.json()) as { existingMode: string };
        modes.push(body.existingMode);
        if (body.existingMode === 'error') {
          return HttpResponse.json({ error: 'conflict' }, { status: 409 });
        }
        return HttpResponse.json(weekPlan());
      }),
    );

    const { onApplied } = renderModal();

    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to this week' }));

    fireEvent.click(
      await screen.findByRole('button', { name: "Replace this week's meals" }),
    );

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    expect(modes).toEqual(['error', 'replace']);
  });

  it('can back out of the confirmation without applying', async () => {
    const modes: string[] = [];
    server.use(
      http.get(templatesUrl, () => HttpResponse.json({ templates: [template()] })),
      http.post(applyUrl, async ({ request }) => {
        const body = (await request.json()) as { existingMode: string };
        modes.push(body.existingMode);
        return HttpResponse.json({ error: 'conflict' }, { status: 409 });
      }),
    );

    const { onApplied } = renderModal();

    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to this week' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));

    // Back to the picker; no further apply attempted.
    expect(await screen.findByText('Busy Weeknights')).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
    expect(modes).toEqual(['error']);
  });
});
