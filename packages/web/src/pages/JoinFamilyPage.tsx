import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { joinFamily } from '../api/families.js';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';

export default function JoinFamilyPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { families, switchFamily } = useFamily();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [decoded, setDecoded] = useState<{ familyId: string; role: string } | null>(null);
  const [joinedFamilyId, setJoinedFamilyId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setDecoded({ familyId: payload.familyId, role: payload.role });
    } catch {
      setError('Invalid invite link');
    }
  }, [token]);

  // After joinFamily + refresh, the AuthContext re-renders with the new
  // membership. Wait for it to be observable before navigating, otherwise
  // HomeRedirect renders with the still-stale user state and bounces the
  // user to /family/create.
  useEffect(() => {
    if (!joinedFamilyId) return;
    if (families.some(f => f.id === joinedFamilyId)) {
      switchFamily(joinedFamilyId);
      navigate('/', { replace: true });
    }
  }, [joinedFamilyId, families, navigate, switchFamily]);

  const handleJoin = async () => {
    if (!token || !decoded) return;
    setLoading(true);
    setError('');
    try {
      await joinFamily(decoded.familyId, token);
      await refresh();
      setJoinedFamilyId(decoded.familyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join family');
      setLoading(false);
    }
  };

  if (error && !decoded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
          <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Join Family</h1>
        {decoded && (
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            You've been invited to join as a <strong>{decoded.role}</strong>.
          </p>
        )}
        {error && <div role="alert" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}
        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Joining...' : 'Join Family'}
        </button>
      </div>
    </div>
  );
}
