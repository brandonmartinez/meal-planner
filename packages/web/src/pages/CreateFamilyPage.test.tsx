import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { server } from '../../tests/msw/server';
import { render, screen, waitFor } from '../test-utils/render';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { WeekProvider } from '../context/WeekContext';
import CreateFamilyPage from './CreateFamilyPage';

const FAMILY_ID = 'fam-1';

const baseUser = {
  id: 'u-1',
  email: 'a@b.com',
  name: 'Alice',
  avatarUrl: null,
};

function membership() {
  return {
    id: 'm-1',
    role: 'PARENT' as const,
    familyId: FAMILY_ID,
    userId: baseUser.id,
    family: { id: FAMILY_ID, name: 'The Smiths', timezone: 'UTC' },
  };
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/family/create']}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <WeekProvider>
              <Routes>
                <Route path="/family/create" element={<CreateFamilyPage />} />
                <Route path="/" element={<div>HOME</div>} />
              </Routes>
            </WeekProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('CreateFamilyPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a family and navigates home once the new membership is observable', async () => {
    let meCalls = 0;
    let sentName: unknown;
    server.use(
      // First /me (initial AuthProvider mount) has no families; after refresh()
      // it includes the newly created family.
      http.get('/api/auth/me', () => {
        meCalls += 1;
        if (meCalls === 1) {
          return HttpResponse.json({ ...baseUser, memberships: [] });
        }
        return HttpResponse.json({ ...baseUser, memberships: [membership()] });
      }),
      http.post('/api/families', async ({ request }) => {
        const body = (await request.json()) as { name?: unknown };
        sentName = body.name;
        return HttpResponse.json({
          id: FAMILY_ID,
          name: 'The Smiths',
          timezone: 'UTC',
          createdAt: '2026-01-01T00:00:00.000Z',
          members: [],
        });
      }),
    );

    renderCreate();

    await userEvent.type(screen.getByRole('textbox'), '  The Smiths  ');
    await userEvent.click(screen.getByRole('button', { name: /create family/i }));

    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
    // Name is trimmed before being sent to the API.
    expect(sentName).toBe('The Smiths');
    expect(meCalls).toBeGreaterThanOrEqual(2);
  });

  it('shows the server error and stays on the page when creation fails', async () => {
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json({ ...baseUser, memberships: [] })),
      http.post('/api/families', () =>
        HttpResponse.json({ error: 'Family name already taken' }, { status: 400 }),
      ),
    );

    renderCreate();

    await userEvent.type(screen.getByRole('textbox'), 'Dupes');
    await userEvent.click(screen.getByRole('button', { name: /create family/i }));

    expect(await screen.findByText(/family name already taken/i)).toBeInTheDocument();
    expect(screen.queryByText('HOME')).not.toBeInTheDocument();
    // The form is still interactive (loading state reset after the failure).
    expect(screen.getByRole('button', { name: /create family/i })).toBeEnabled();
  });

  it('does not submit when the name is empty', async () => {
    let createCalled = false;
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json({ ...baseUser, memberships: [] })),
      http.post('/api/families', () => {
        createCalled = true;
        return HttpResponse.json({ id: FAMILY_ID });
      }),
    );

    renderCreate();

    await userEvent.click(screen.getByRole('button', { name: /create family/i }));

    expect(createCalled).toBe(false);
    expect(screen.queryByText('HOME')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /create a family/i })).toBeInTheDocument();
  });
});
