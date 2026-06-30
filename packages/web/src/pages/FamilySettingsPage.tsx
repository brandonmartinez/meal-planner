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
} from '../api/families.js';
import type { FamilyDTO, FamilyMemberDTO, ApiKeyListItemDTO, CreatedApiKeyDTO } from '../api/families.js';
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
        const keys = await listApiKeys(familyId);
        setApiKeys(keys);
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
      setNewKeyName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
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
              <p className="font-medium text-yellow-800 dark:text-yellow-200">Save this key — it won't be shown again:</p>
              <code className="block mt-1 break-all">{createdKey.key}</code>
            </div>
          )}

          <ul className="space-y-2">
            {apiKeys.map(k => (
              <li key={k.id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-transparent dark:border-gray-700">
                <div>
                  <span className="font-medium">{k.name}</span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">Created {new Date(k.createdAt).toLocaleDateString()}</span>
                </div>
                <button
                  onClick={() => handleRevokeKey(k.id)}
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
    </div>
  );
}
