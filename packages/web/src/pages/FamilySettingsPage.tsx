import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  getFamily,
  getMembers,
  generateInvite,
  updateMemberRole,
  removeMember,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../api/families.js';
import type { Family, FamilyMember, ApiKeyInfo, ApiKeyCreated } from '../api/families.js';
import { useAuth } from '../context/AuthContext.js';

export default function FamilySettingsPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [inviteLink, setInviteLink] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const currentMembership = members.find(m => m.user.id === user?.id);
  const isParent = currentMembership?.role === 'PARENT';

  const loadData = useCallback(async () => {
    if (!familyId) return;
    try {
      const [f, m] = await Promise.all([getFamily(familyId), getMembers(familyId)]);
      setFamily(f);
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

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  if (!family) {
    return <div className="text-center py-12 text-red-600">Family not found</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{family.name} — Settings</h1>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4">{error}</div>}

      {/* Members */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Members</h2>
        <ul className="space-y-2">
          {members.map(m => (
            <li key={m.id} className="flex items-center justify-between bg-white p-3 rounded shadow-sm">
              <div>
                <span className="font-medium">{m.user.name}</span>
                <span className="ml-2 text-sm text-gray-500">({m.role})</span>
              </div>
              {isParent && m.user.id !== user?.id && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRoleChange(m.id, m.role === 'PARENT' ? 'CHILD' : 'PARENT')}
                    className="text-sm px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Toggle Role
                  </button>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-sm px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
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
            <div className="mt-3 p-3 bg-gray-50 rounded text-sm break-all">
              <p className="text-green-700 font-medium mb-1">Link copied to clipboard!</p>
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
              className="flex-1 px-3 py-2 border rounded"
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Create
            </button>
          </form>

          {createdKey && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
              <p className="font-medium text-yellow-800">Save this key — it won't be shown again:</p>
              <code className="block mt-1 break-all">{createdKey.key}</code>
            </div>
          )}

          <ul className="space-y-2">
            {apiKeys.map(k => (
              <li key={k.id} className="flex items-center justify-between bg-white p-3 rounded shadow-sm">
                <div>
                  <span className="font-medium">{k.name}</span>
                  <span className="ml-2 text-xs text-gray-400">Created {new Date(k.createdAt).toLocaleDateString()}</span>
                </div>
                <button
                  onClick={() => handleRevokeKey(k.id)}
                  className="text-sm px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  Revoke
                </button>
              </li>
            ))}
            {apiKeys.length === 0 && <p className="text-gray-500 text-sm">No API keys yet.</p>}
          </ul>
        </section>
      )}
    </div>
  );
}
