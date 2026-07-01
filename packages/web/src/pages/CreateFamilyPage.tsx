import { useEffect, useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFamily } from '../api/families.js';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';

export default function CreateFamilyPage() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdFamilyId, setCreatedFamilyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { families, switchFamily } = useFamily();
  const nameId = useId();

  // After createFamily + refresh, the AuthContext re-renders with the new
  // membership. Wait for it to be observable before navigating, otherwise
  // HomeRedirect / WeekPlanPage may render with the still-stale user state
  // and bounce the user back here.
  useEffect(() => {
    if (!createdFamilyId) return;
    if (families.some(f => f.id === createdFamilyId)) {
      switchFamily(createdFamilyId);
      navigate('/', { replace: true });
    }
  }, [createdFamilyId, families, navigate, switchFamily]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const family = await createFamily(name.trim());
      await refresh();
      setCreatedFamilyId(family.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create family');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Create a Family</h1>
        {error && <div role="alert" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label htmlFor={nameId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Family Name</label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. The Smiths"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded mb-4"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Family'}
          </button>
        </form>
      </div>
    </div>
  );
}
