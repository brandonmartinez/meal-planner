import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from '../../tests/msw/server';
import { renderWithProviders, screen, waitFor } from '../test-utils/render';
import FamilySettingsPage from './FamilySettingsPage';

const FAMILY_ID = 'fam-1';
const SELF_ID = 'u-1';

function authMe(role: 'PARENT' | 'CHILD' = 'PARENT') {
  return http.get('/api/auth/me', () =>
    HttpResponse.json({
      id: SELF_ID,
      email: 'a@b.com',
      name: 'Alice',
      avatarUrl: null,
      memberships: [
        {
          id: 'm-1',
          role,
          familyId: FAMILY_ID,
          userId: SELF_ID,
          family: { id: FAMILY_ID, name: 'Smiths', timezone: 'UTC' },
        },
      ],
    }),
  );
}

function familyDto(overrides: Record<string, unknown> = {}) {
  return {
    id: FAMILY_ID,
    name: 'Smiths',
    timezone: 'UTC',
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [],
    ...overrides,
  };
}

function member(id: string, name: string, role: 'PARENT' | 'CHILD', userId: string) {
  return {
    id,
    role,
    familyId: FAMILY_ID,
    userId,
    user: { id: userId, name, email: `${name}@x.com`, avatarUrl: null },
  };
}

/** The self member is a PARENT so the parent-only sections render. */
function parentMembers() {
  return [
    member('mem-1', 'Alice', 'PARENT', SELF_ID),
    member('mem-2', 'Bobby', 'CHILD', 'u-2'),
  ];
}

describe('FamilySettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the family name, members, and parent-only sections for a parent', async () => {
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
    );

    renderWithProviders(<FamilySettingsPage />);

    expect(await screen.findByRole('heading', { name: /smiths — settings/i })).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bobby')).toBeInTheDocument();
    // Parent-only sections.
    expect(screen.getByRole('heading', { name: /^timezone$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /invite members/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /api keys/i })).toBeInTheDocument();
  });

  it('hides parent-only sections for a child member', async () => {
    server.use(
      authMe('CHILD'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      // Self is a CHILD here.
      http.get('/api/families/:id/members', () =>
        HttpResponse.json([
          member('mem-1', 'Alice', 'CHILD', SELF_ID),
          member('mem-2', 'Bobby', 'PARENT', 'u-2'),
        ]),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^timezone$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /invite members/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /api keys/i })).not.toBeInTheDocument();
  });

  it('shows "Family not found" when the family fails to load', async () => {
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json({ error: 'nope' }, { status: 500 })),
      http.get('/api/families/:id/members', () => HttpResponse.json([])),
    );

    renderWithProviders(<FamilySettingsPage />);

    expect(await screen.findByText(/family not found/i)).toBeInTheDocument();
  });

  it('toggles a member role', async () => {
    let patchedRole: unknown;
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
      http.patch('/api/families/:id/members/:memberId', async ({ request }) => {
        const body = (await request.json()) as { role?: unknown };
        patchedRole = body.role;
        return HttpResponse.json(member('mem-2', 'Bobby', 'PARENT', 'u-2'));
      }),
    );

    renderWithProviders(<FamilySettingsPage />);

    await screen.findByText('Bobby');
    await userEvent.click(screen.getByRole('button', { name: /toggle role/i }));

    // Bobby is a CHILD, so toggling promotes them to PARENT.
    await waitFor(() => expect(patchedRole).toBe('PARENT'));
  });

  it('removes a member after confirmation', async () => {
    let deleted = false;
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
      http.delete('/api/families/:id/members/:memberId', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<FamilySettingsPage />);

    await screen.findByText('Bobby');
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(deleted).toBe(true));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('generates an invite link and copies it to the clipboard', async () => {
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
      http.post('/api/families/:id/invite', () => HttpResponse.json({ token: 'tok-123' })),
    );

    renderWithProviders(<FamilySettingsPage />);

    await screen.findByRole('heading', { name: /invite members/i });
    await userEvent.click(screen.getByRole('button', { name: /invite as parent/i }));

    expect(await screen.findByText(/link copied to clipboard/i)).toBeInTheDocument();
    expect(screen.getByText(/family\/join\/tok-123/)).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/family/join/tok-123'),
    );
  });

  it('saves a new timezone and confirms the update', async () => {
    let savedTz: unknown;
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
      http.patch('/api/families/:id', async ({ request }) => {
        const body = (await request.json()) as { timezone?: unknown };
        savedTz = body.timezone;
        return HttpResponse.json(familyDto({ timezone: body.timezone as string }));
      }),
    );

    renderWithProviders(<FamilySettingsPage />);

    const select = await screen.findByLabelText<HTMLSelectElement>('Family timezone');
    await userEvent.selectOptions(select, 'America/Chicago');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/timezone updated/i)).toBeInTheDocument();
    expect(savedTz).toBe('America/Chicago');
  });

  it('creates an API key and reveals the secret once', async () => {
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
      http.post('/api/families/:id/api-keys', () =>
        HttpResponse.json({
          id: 'key-1',
          name: 'CI',
          createdAt: '2026-01-01T00:00:00.000Z',
          key: 'secret-abc-123',
        }),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    await userEvent.type(await screen.findByPlaceholderText(/key name/i), 'CI');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText(/only time it will be shown/i)).toBeInTheDocument();
    expect(screen.getByText('secret-abc-123')).toBeInTheDocument();
  });

  it('copies the freshly created key and shows a confirmation', async () => {
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
      http.post('/api/families/:id/api-keys', () =>
        HttpResponse.json({
          id: 'key-1',
          name: 'CI',
          createdAt: '2026-01-01T00:00:00.000Z',
          key: 'secret-abc-123',
        }),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    await userEvent.type(await screen.findByPlaceholderText(/key name/i), 'CI');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    const copyBtn = await screen.findByRole('button', { name: /copy api key ci/i });
    await userEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-abc-123');
    expect(await screen.findByText(/key copied to clipboard/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy api key ci/i })).toHaveTextContent(/copied/i);
  });

  it('shows a failure message when copying the created key fails', async () => {
    // Override the clipboard mock so writeText rejects.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
      http.post('/api/families/:id/api-keys', () =>
        HttpResponse.json({
          id: 'key-1',
          name: 'CI',
          createdAt: '2026-01-01T00:00:00.000Z',
          key: 'secret-abc-123',
        }),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    await userEvent.type(await screen.findByPlaceholderText(/key name/i), 'CI');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /copy api key ci/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/copy it manually/i);
  });

  it('renders existing keys masked with created and last-used info, never the raw secret', async () => {
    server.use(
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () =>
        HttpResponse.json([
          {
            id: 'key-used',
            name: 'Mirror',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastUsed: '2026-02-15T00:00:00.000Z',
            // A defensive payload: even if the server ever leaked a secret on
            // the list endpoint, the UI must never render it for stored keys.
            key: 'leaked-secret-should-not-render',
          },
          {
            id: 'key-fresh',
            name: 'Unused',
            createdAt: '2026-01-05T00:00:00.000Z',
            lastUsed: null,
          },
        ]),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    expect(await screen.findByText('Mirror')).toBeInTheDocument();
    // Last-used surfaced for a used key, "Never used" for an unused one.
    expect(screen.getByText(/Last used/i)).toBeInTheDocument();
    expect(screen.getByText(/Never used/i)).toBeInTheDocument();
    // Masked indicator is present, raw secret is never rendered.
    expect(screen.getAllByText('••••••••').length).toBe(2);
    expect(screen.queryByText('leaked-secret-should-not-render')).not.toBeInTheDocument();
    // Revoke action is clearly tied to each key by name.
    expect(screen.getByRole('button', { name: /revoke mirror/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revoke unused/i })).toBeInTheDocument();
  });

  /* ---- Agent credentials (issue #6) --------------------------------------- */

  function agentCred(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cred-1',
      name: 'Planner Bot',
      scopes: ['meal_plan:read', 'meal_plan:schedule'],
      createdBy: SELF_ID,
      expiresAt: null,
      lastUsed: null,
      revokedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  /** Base handlers a parent needs for the page to load with no API keys. */
  function parentBase() {
    return [
      authMe('PARENT'),
      http.get('/api/families/:id', () => HttpResponse.json(familyDto())),
      http.get('/api/families/:id/members', () => HttpResponse.json(parentMembers())),
      http.get('/api/families/:id/api-keys', () => HttpResponse.json([])),
    ];
  }

  it('renders agent credentials with scopes and metadata, never a raw key', async () => {
    server.use(
      ...parentBase(),
      http.get('/api/families/:id/agent-credentials', () =>
        HttpResponse.json([
          agentCred({
            id: 'cred-used',
            name: 'Planner Bot',
            scopes: ['meal_plan:read', 'meal_plan:approve'],
            lastUsed: '2026-02-20T00:00:00.000Z',
            expiresAt: '2026-12-31T00:00:00.000Z',
          }),
          agentCred({
            id: 'cred-fresh',
            name: 'Scheduler',
            scopes: ['meal_plan:schedule'],
            lastUsed: null,
            expiresAt: null,
          }),
        ]),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    expect(await screen.findByRole('heading', { name: /agent credentials/i })).toBeInTheDocument();
    expect(await screen.findByText('Planner Bot')).toBeInTheDocument();
    expect(screen.getByText('Scheduler')).toBeInTheDocument();
    // Scope labels render as badges (appear in both the create form and the list).
    expect(screen.getAllByText(/read meal plans/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/approve meals/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/schedule meals/i).length).toBeGreaterThan(0);
    // Metadata surfaced.
    expect(screen.getByText(/Last used/i)).toBeInTheDocument();
    expect(screen.getByText(/Never used/i)).toBeInTheDocument();
    expect(screen.getByText(/Expires \d/i)).toBeInTheDocument();
    expect(screen.getByText(/No expiry/i)).toBeInTheDocument();
    // Manage actions tied to each credential by name.
    expect(screen.getByRole('button', { name: /rotate planner bot/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revoke planner bot/i })).toBeInTheDocument();
  });

  it('never renders a key even if the list endpoint leaks one (guard)', async () => {
    server.use(
      ...parentBase(),
      http.get('/api/families/:id/agent-credentials', () =>
        HttpResponse.json([
          {
            ...agentCred({ id: 'cred-leak', name: 'Leaky' }),
            // Defensive: the list shape has no `key`, but if the server ever
            // leaked one the UI must never render it.
            key: 'agent-secret-should-not-render',
          },
        ]),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    expect(await screen.findByText('Leaky')).toBeInTheDocument();
    // Masked indicator present; the leaked raw key is never rendered.
    expect(screen.getAllByText('••••••••').length).toBeGreaterThan(0);
    expect(screen.queryByText('agent-secret-should-not-render')).not.toBeInTheDocument();
  });

  it('creates an agent credential and reveals the key exactly once', async () => {
    let createdBody: { name?: unknown; scopes?: unknown; expiresAt?: unknown } | undefined;
    server.use(
      ...parentBase(),
      http.get('/api/families/:id/agent-credentials', () => HttpResponse.json([])),
      http.post('/api/families/:id/agent-credentials', async ({ request }) => {
        createdBody = (await request.json()) as typeof createdBody;
        return HttpResponse.json(
          {
            id: 'cred-new',
            name: 'Planner Bot',
            scopes: ['meal_plan:read'],
            key: 'agent-raw-key-xyz',
            expiresAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<FamilySettingsPage />);

    await userEvent.type(
      await screen.findByPlaceholderText(/credential name/i),
      'Planner Bot',
    );
    await userEvent.click(screen.getByRole('button', { name: /create credential/i }));

    // The raw key is revealed once with the "only time" messaging.
    expect(await screen.findByText(/only time it will be shown/i)).toBeInTheDocument();
    expect(screen.getByText('agent-raw-key-xyz')).toBeInTheDocument();
    // Default scope (read) was sent.
    await waitFor(() => expect(createdBody?.name).toBe('Planner Bot'));
    expect(createdBody?.scopes).toEqual(['meal_plan:read']);
  });

  it('copies the freshly revealed agent key and confirms', async () => {
    server.use(
      ...parentBase(),
      http.get('/api/families/:id/agent-credentials', () => HttpResponse.json([])),
      http.post('/api/families/:id/agent-credentials', () =>
        HttpResponse.json(
          {
            id: 'cred-new',
            name: 'Planner Bot',
            scopes: ['meal_plan:read'],
            key: 'agent-raw-key-xyz',
            expiresAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          { status: 201 },
        ),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    await userEvent.type(
      await screen.findByPlaceholderText(/credential name/i),
      'Planner Bot',
    );
    await userEvent.click(screen.getByRole('button', { name: /create credential/i }));

    const copyBtn = await screen.findByRole('button', { name: /copy agent key planner bot/i });
    await userEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('agent-raw-key-xyz');
    expect(await screen.findByText(/key copied to clipboard/i)).toBeInTheDocument();
  });

  it('rotates a credential and reveals the new key once', async () => {
    let rotated = false;
    server.use(
      ...parentBase(),
      http.get('/api/families/:id/agent-credentials', () =>
        HttpResponse.json([agentCred({ id: 'cred-1', name: 'Planner Bot' })]),
      ),
      http.post('/api/families/:id/agent-credentials/:credentialId/rotate', () => {
        rotated = true;
        return HttpResponse.json({
          id: 'cred-1',
          name: 'Planner Bot',
          scopes: ['meal_plan:read', 'meal_plan:schedule'],
          key: 'rotated-raw-key-789',
          expiresAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        });
      }),
    );

    renderWithProviders(<FamilySettingsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /rotate planner bot/i }));

    await waitFor(() => expect(rotated).toBe(true));
    expect(await screen.findByText(/only time it will be shown/i)).toBeInTheDocument();
    expect(screen.getByText('rotated-raw-key-789')).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalled();
  });

  it('revokes a credential via DELETE after confirmation', async () => {
    let deletedId: string | undefined;
    server.use(
      ...parentBase(),
      http.get('/api/families/:id/agent-credentials', () =>
        HttpResponse.json([agentCred({ id: 'cred-1', name: 'Planner Bot' })]),
      ),
      http.delete('/api/families/:id/agent-credentials/:credentialId', ({ params }) => {
        deletedId = params.credentialId as string;
        return HttpResponse.json({ id: 'cred-1', revokedAt: '2026-03-01T00:00:00.000Z' });
      }),
    );

    renderWithProviders(<FamilySettingsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /revoke planner bot/i }));

    await waitFor(() => expect(deletedId).toBe('cred-1'));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('marks a revoked credential and hides its manage actions', async () => {
    server.use(
      ...parentBase(),
      http.get('/api/families/:id/agent-credentials', () =>
        HttpResponse.json([
          agentCred({
            id: 'cred-revoked',
            name: 'Old Bot',
            revokedAt: '2026-02-01T00:00:00.000Z',
          }),
        ]),
      ),
    );

    renderWithProviders(<FamilySettingsPage />);

    expect(await screen.findByText('Old Bot')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    // No rotate/revoke actions for an already-revoked credential.
    expect(screen.queryByRole('button', { name: /rotate old bot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revoke old bot/i })).not.toBeInTheDocument();
  });
});
