import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { joinFamily } from '../api/families.js';

export default function JoinFamilyPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [decoded, setDecoded] = useState<{ familyId: string; role: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setDecoded({ familyId: payload.familyId, role: payload.role });
    } catch {
      setError('Invalid invite link');
    }
  }, [token]);

  const handleJoin = async () => {
    if (!token || !decoded) return;
    setLoading(true);
    setError('');
    try {
      await joinFamily(decoded.familyId, token);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join family');
    } finally {
      setLoading(false);
    }
  };

  if (error && !decoded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Join Family</h1>
        {decoded && (
          <p className="text-gray-600 mb-6">
            You've been invited to join as a <strong>{decoded.role}</strong>.
          </p>
        )}
        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4">{error}</div>}
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
