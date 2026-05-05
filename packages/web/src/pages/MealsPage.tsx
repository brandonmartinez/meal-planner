import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listMeals, deleteMeal } from '../api/meals';
import { useAuth } from '../context/AuthContext';
import type { Meal } from '@meal-planner/shared';

export default function MealsPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meals, setMeals] = useState<(Meal & { _count?: { ingredients: number } })[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const currentMembership = user?.memberships?.find(m => m.familyId === familyId);
  const isParent = currentMembership?.role === 'PARENT';

  const loadMeals = useCallback(async () => {
    if (!familyId) return;
    try {
      const data = await listMeals(familyId, search || undefined);
      setMeals(data as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meals');
    } finally {
      setLoading(false);
    }
  }, [familyId, search]);

  useEffect(() => { loadMeals(); }, [loadMeals]);

  const handleDelete = async (mealId: string) => {
    if (!familyId || !confirm('Delete this meal?')) return;
    try {
      await deleteMeal(familyId, mealId);
      await loadMeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete meal');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Meal Library</h1>
        <button
          onClick={() => navigate(`/meals/${familyId}/new`)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Meal
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search meals..."
        className="w-full px-4 py-2 border rounded mb-6"
      />

      {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4">{error}</div>}

      {meals.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No meals yet. Add your first meal!</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meals.map(meal => (
            <div
              key={meal.id}
              className={`bg-white p-4 rounded shadow-sm border ${meal.isFreeDayPlaceholder ? 'border-yellow-300 bg-yellow-50' : ''}`}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-lg">
                  {meal.name}
                  {meal.isFreeDayPlaceholder && (
                    <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">Free Day</span>
                  )}
                </h3>
              </div>
              {meal.description && (
                <p className="text-gray-600 text-sm mt-1 line-clamp-2">{meal.description}</p>
              )}
              <p className="text-gray-400 text-xs mt-2">
                {(meal as any)._count?.ingredients ?? 0} ingredient{((meal as any)._count?.ingredients ?? 0) !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => navigate(`/meals/${familyId}/${meal.id}/edit`)}
                  className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Edit
                </button>
                {isParent && !meal.isFreeDayPlaceholder && (
                  <button
                    onClick={() => handleDelete(meal.id)}
                    className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
