import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getFamily,
  getMembers,
  generateInvite,
  updateMemberRole,
  updateFamily,
  removeMember,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  listAgentCredentials,
  createAgentCredential,
  rotateAgentCredential,
  revokeAgentCredential,
} from '../api/families.js';
import type {
  FamilyDTO,
  FamilyMemberDTO,
  ApiKeyListItemDTO,
  CreatedApiKeyDTO,
  AgentCredentialListItemDTO,
  CreatedAgentCredentialDTO,
  AgentScope,
} from '../api/families.js';
import { AGENT_SCOPES, AGENT_SCOPE_METADATA } from '@meal-planner/shared';
import { useAuth } from '../context/AuthContext.js';
import { useFamily } from '../hooks/useFamily';

export default function FamilySettingsPage() {
  const { familyId, hasFamilies } = useFamily();
  const { user } = useAuth();
  const [family, setFamily] = useState<FamilyDTO | null>(null);
  const [members, setMembers] = useState<FamilyMemberDTO[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyListItemDTO[]>([]);
  const [inviteLink, setInviteLink] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<CreatedApiKeyDTO | null>(null);
  const [keyCopyState, setKeyCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  // Agent credentials (issue #6) — scoped, least-privilege MCP credentials.
  const [agentCreds, setAgentCreds] = useState<AgentCredentialListItemDTO[]>([]);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentScopes, setNewAgentScopes] = useState<AgentScope[]>(['meal_plan:read']);
  const [newAgentExpiry, setNewAgentExpiry] = useState('');
  // The raw key revealed exactly once after a create or rotate. Never sourced
  // from the list endpoint — only from a create/rotate response.
  const [revealedAgentCred, setRevealedAgentCred] = useState<CreatedAgentCredentialDTO | null>(null);
  const [agentKeyCopyState, setAgentKeyCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tzDraft, setTzDraft] = useState('UTC');
  const [tzSaving, setTzSaving] = useState(false);
  const [tzSaved, setTzSaved] = useState(false);

  const currentMembership = members.find(m => m.user.id === user?.id);
  const isParent = currentMembership?.role === 'PARENT';

  const loadData = useCallback(async () => {
    if (!familyId) return;
    try {
      const [f, m] = await Promise.all([getFamily(familyId), getMembers(familyId)]);
      setFamily(f);
      setTzDraft(f.timezone || 'UTC');
      setMembers(m);
      if (isParent) {
        const [keys, creds] = await Promise.all([
          listApiKeys(familyId),
          listAgentCredentials(familyId),
        ]);
        setApiKeys(keys);
        setAgentCreds(creds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [familyId, isParent]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInvite = async (role: 'PARENT' | 'CHILD') => {
    if (!familyId) return;
    try {
      const { token } = await generateInvite(familyId, role);
      const link = `${window.location.origin}/family/join/${token}`;
      setInviteLink(link);
      await navigator.clipboard.writeText(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite');
    }
  };

  const handleRoleChange = async (memberId: string, role: 'PARENT' | 'CHILD') => {
    if (!familyId) return;
    try {
      await updateMemberRole(familyId, memberId, role);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!familyId || !confirm('Remove this member?')) return;
    try {
      await removeMember(familyId, memberId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyId || !newKeyName.trim()) return;
    try {
      const key = await createApiKey(familyId, newKeyName.trim());
      setCreatedKey(key);
      setKeyCopyState('idle');
      setNewKeyName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    }
  };

  const handleCopyCreatedKey = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setKeyCopyState('copied');
    } catch {
      setKeyCopyState('error');
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!familyId || !confirm('Revoke this API key?')) return;
    try {
      await revokeApiKey(familyId, keyId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    }
  };

  const toggleAgentScope = (scope: AgentScope) => {
    setNewAgentScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope],
    );
  };

  const handleCreateAgentCred = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyId || !newAgentName.trim() || newAgentScopes.length === 0) return;
    try {
      const cred = await createAgentCredential(familyId, {
        name: newAgentName.trim(),
        scopes: newAgentScopes,
        // A bare date input is a calendar day; send it as end-of-day UTC so the
        // backend "must be in the future" check passes for today's date too.
        expiresAt: newAgentExpiry ? new Date(`${newAgentExpiry}T23:59:59.999Z`).toISOString() : null,
      });
      setRevealedAgentCred(cred);
      setAgentKeyCopyState('idle');
      setNewAgentName('');
      setNewAgentScopes(['meal_plan:read']);
      setNewAgentExpiry('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent credential');
    }
  };

  const handleCopyRevealedAgentCred = async () => {
    if (!revealedAgentCred) return;
    try {
      await navigator.clipboard.writeText(revealedAgentCred.key);
      setAgentKeyCopyState('copied');
    } catch {
      setAgentKeyCopyState('error');
    }
  };

  const handleRotateAgentCred = async (credentialId: string) => {
    if (!familyId || !confirm('Rotate this credential? The current key stops working immediately.')) return;
    try {
      const rotated = await rotateAgentCredential(familyId, credentialId);
      setRevealedAgentCred(rotated);
      setAgentKeyCopyState('idle');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate agent credential');
    }
  };

  const handleRevokeAgentCred = async (credentialId: string) => {
    if (!familyId || !confirm('Revoke this agent credential? This cannot be undone.')) return;
    try {
      await revokeAgentCredential(familyId, credentialId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke agent credential');
    }
  };

  const handleSaveTimezone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyId) return;
    setTzSaving(true);
    setTzSaved(false);
    try {
      const updated = await updateFamily(familyId, { timezone: tzDraft });
      setFamily(updated);
      setTzSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update timezone');
    } finally {
      setTzSaving(false);
    }
  };

  const tzOptions = (() => {
    type IntlWithTz = typeof Intl & { supportedValuesOf?: (k: string) => string[] };
    const intlAny = Intl as IntlWithTz;
    const list = intlAny.supportedValuesOf?.('timeZone');
    if (list && list.length > 0) return list;
    return ['UTC', 'America/Chicago', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo'];
  })();

  if (!hasFamilies) return <Navigate to="/family/create" replace />;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (!family) {
    return <div className="text-center py-12 text-red-600 dark:text-red-400">Family not found</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-bold mb-6">{family.name} — Settings</h1>

      {error && <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

      {/* Timezone */}
      {isParent && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Timezone</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Used by the public Display API to compute the rolling day window
            for connected MagicMirror² displays.
          </p>
          <form onSubmit={handleSaveTimezone} className="flex gap-2 items-center">
            <select
              aria-label="Family timezone"
              value={tzDraft}
              onChange={(e) => { setTzDraft(e.target.value); setTzSaved(false); }}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={tzSaving || tzDraft === family.timezone}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tzSaving ? 'Saving…' : 'Save'}
            </button>
          </form>
          {tzSaved && (
            <p className="mt-2 text-sm text-green-700 dark:text-green-400">Timezone updated.</p>
          )}
        </section>
      )}

      {/* Members */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Members</h2>
        <ul className="space-y-2">
          {members.map(m => (
            <li key={m.id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-transparent dark:border-gray-700">
              <div>
                <span className="font-medium">{m.user.name}</span>
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({m.role})</span>
              </div>
              {isParent && m.user.id !== user?.id && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRoleChange(m.id, m.role === 'PARENT' ? 'CHILD' : 'PARENT')}
                    className="text-sm px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60"
                  >
                    Toggle Role
                  </button>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-sm px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/60"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Invite */}
      {isParent && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Invite Members</h2>
          <div className="flex gap-2">
            <button onClick={() => handleInvite('CHILD')} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              Invite as Child
            </button>
            <button onClick={() => handleInvite('PARENT')} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Invite as Parent
            </button>
          </div>
          {inviteLink && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm break-all border border-transparent dark:border-gray-700">
              <p className="text-green-700 dark:text-green-400 font-medium mb-1">Link copied to clipboard!</p>
              <code>{inviteLink}</code>
            </div>
          )}
        </section>
      )}

      {/* API Keys */}
      {isParent && (
        <section>
          <h2 className="text-lg font-semibold mb-3">API Keys</h2>
          <form onSubmit={handleCreateKey} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="Key name"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded"
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Create
            </button>
          </form>

          {createdKey && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Copy this key now — this is the only time it will be shown:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all bg-yellow-100/60 dark:bg-yellow-950/40 px-2 py-1 rounded">
                  {createdKey.key}
                </code>
                <button
                  type="button"
                  onClick={handleCopyCreatedKey}
                  aria-label={`Copy API key ${createdKey.name}`}
                  className="shrink-0 px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  {keyCopyState === 'copied' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              {keyCopyState === 'copied' && (
                <p role="status" className="mt-2 text-green-700 dark:text-green-400">
                  Key copied to clipboard.
                </p>
              )}
              {keyCopyState === 'error' && (
                <p role="alert" className="mt-2 text-red-700 dark:text-red-400">
                  Couldn’t copy automatically — select the key above and copy it manually.
                </p>
              )}
            </div>
          )}

          <ul className="space-y-2">
            {apiKeys.map(k => (
              <li key={k.id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-transparent dark:border-gray-700">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    <span aria-hidden="true" className="font-mono text-xs text-gray-400 dark:text-gray-500 tracking-widest">
                      ••••••••
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {' · '}
                    {k.lastUsed
                      ? `Last used ${new Date(k.lastUsed).toLocaleDateString()}`
                      : 'Never used'}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeKey(k.id)}
                  aria-label={`Revoke ${k.name}`}
                  className="text-sm px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/60"
                >
                  Revoke
                </button>
              </li>
            ))}
            {apiKeys.length === 0 && <p className="text-gray-500 dark:text-gray-400 text-sm">No API keys yet.</p>}
          </ul>
        </section>
      )}

      {/* Agent Credentials (issue #6) — scoped, least-privilege MCP credentials */}
      {isParent && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-1">Agent Credentials</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Scoped, least-privilege credentials for AI meal-planning agents (MCP).
            Grant only the permissions an agent needs. Keys are shown once at
            creation and can be rotated or revoked at any time.
          </p>

          <form onSubmit={handleCreateAgentCred} className="mb-4 space-y-3">
            <input
              type="text"
              value={newAgentName}
              onChange={e => setNewAgentName(e.target.value)}
              placeholder="Credential name (e.g. Planner Bot)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded"
            />

            <fieldset className="border border-gray-200 dark:border-gray-700 rounded p-3">
              <legend className="text-sm font-medium px-1">Scopes</legend>
              <div className="space-y-2">
                {AGENT_SCOPES.map(scope => (
                  <label key={scope} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newAgentScopes.includes(scope)}
                      onChange={() => toggleAgentScope(scope)}
                      aria-label={AGENT_SCOPE_METADATA[scope].label}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{AGENT_SCOPE_METADATA[scope].label}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {AGENT_SCOPE_METADATA[scope].description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm flex flex-col gap-1">
                <span className="text-gray-600 dark:text-gray-300">Expires (optional)</span>
                <input
                  type="date"
                  value={newAgentExpiry}
                  onChange={e => setNewAgentExpiry(e.target.value)}
                  aria-label="Credential expiry date"
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
                />
              </label>
              <button
                type="submit"
                disabled={!newAgentName.trim() || newAgentScopes.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Credential
              </button>
            </div>
          </form>

          {revealedAgentCred && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Copy this credential key now — this is the only time it will be shown:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all bg-yellow-100/60 dark:bg-yellow-950/40 px-2 py-1 rounded">
                  {revealedAgentCred.key}
                </code>
                <button
                  type="button"
                  onClick={handleCopyRevealedAgentCred}
                  aria-label={`Copy agent key ${revealedAgentCred.name}`}
                  className="shrink-0 px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  {agentKeyCopyState === 'copied' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              {agentKeyCopyState === 'copied' && (
                <p role="status" className="mt-2 text-green-700 dark:text-green-400">
                  Key copied to clipboard.
                </p>
              )}
              {agentKeyCopyState === 'error' && (
                <p role="alert" className="mt-2 text-red-700 dark:text-red-400">
                  Couldn’t copy automatically — select the key above and copy it manually.
                </p>
              )}
            </div>
          )}

          <ul className="space-y-2">
            {agentCreds.map(c => {
              const revoked = c.revokedAt != null;
              const expired = c.expiresAt != null && new Date(c.expiresAt).getTime() < Date.now();
              return (
                <li
                  key={c.id}
                  className={`flex items-start justify-between bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-transparent dark:border-gray-700 ${revoked ? 'opacity-60' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name}</span>
                      <span aria-hidden="true" className="font-mono text-xs text-gray-400 dark:text-gray-500 tracking-widest">
                        ••••••••
                      </span>
                      {revoked && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded">
                          Revoked
                        </span>
                      )}
                      {!revoked && expired && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                          Expired
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.scopes.map(scope => (
                        <span
                          key={scope}
                          className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded"
                        >
                          {AGENT_SCOPE_METADATA[scope]?.label ?? scope}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Created {new Date(c.createdAt).toLocaleDateString()}
                      {' · '}
                      {c.lastUsed
                        ? `Last used ${new Date(c.lastUsed).toLocaleDateString()}`
                        : 'Never used'}
                      {' · '}
                      {c.expiresAt
                        ? `Expires ${new Date(c.expiresAt).toLocaleDateString()}`
                        : 'No expiry'}
                    </div>
                  </div>
                  {!revoked && (
                    <div className="flex gap-2 shrink-0 ml-2">
                      <button
                        onClick={() => handleRotateAgentCred(c.id)}
                        aria-label={`Rotate ${c.name}`}
                        className="text-sm px-2 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/60"
                      >
                        Rotate
                      </button>
                      <button
                        onClick={() => handleRevokeAgentCred(c.id)}
                        aria-label={`Revoke ${c.name}`}
                        className="text-sm px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/60"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {agentCreds.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No agent credentials yet.</p>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
