import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { listMeals, deleteMeal } from '../api/meals';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';
import ImportMealsDialog from '../components/ImportMealsDialog';
import DifficultyBadge from '../components/DifficultyBadge';
import RecentBadge from '../components/RecentBadge';
import type { MealListItemDTO } from '@meal-planner/shared';
import { MEAL_PLACEHOLDERS } from '@meal-planner/shared';

export default function MealsPage() {
  const { familyId, hasFamilies } = useFamily();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meals, setMeals] = useState<MealListItemDTO[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);

  const currentMembership = user?.memberships?.find(m => m.familyId === familyId);
  const isParent = currentMembership?.role === 'PARENT';

  const loadMeals = useCallback(async () => {
    if (!familyId) return;
    try {
      const data = await listMeals(familyId, search || undefined);
      setMeals(data);
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

  if (!hasFamilies) return <Navigate to="/family/create" replace />;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-gray-900 dark:text-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Meal Library</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Import CSV
          </button>
          <button
            onClick={() => navigate('/meals/new')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Meal
          </button>
        </div>
      </div>

      {showImport && familyId && (
        <ImportMealsDialog
          familyId={familyId}
          onClose={() => setShowImport(false)}
          onImported={() => loadMeals()}
        />
      )}

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search meals..."
        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded mb-6"
      />

      {error && <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

      {meals.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No meals yet. Add your first meal!</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meals.map(meal => {
            const isPlaceholder = meal.placeholderKind !== null;
            const meta = isPlaceholder ? MEAL_PLACEHOLDERS[meal.placeholderKind!] : null;
            return (
              <div
                key={meal.id}
                className={`bg-white dark:bg-gray-800 p-4 rounded shadow-sm border border-gray-200 dark:border-gray-700 ${isPlaceholder ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-lg">
                    {meta ? <span className="mr-1">{meta.emoji}</span> : null}
                    {meal.name}
                    {meta && (
                      <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">{meta.name}</span>
                    )}
                  </h3>
                  <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                    <RecentBadge
                      recentlyScheduled={meal.recentlyScheduled}
                      lastScheduledOn={meal.lastScheduledOn}
                    />
                    <DifficultyBadge difficulty={meal.difficulty} />
                  </div>
                </div>
                {meal.description && (
                  <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 line-clamp-2">{meal.description}</p>
                )}
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">
                  {meal._count.ingredients} ingredient{meal._count.ingredients !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2 mt-3">
                  {!isPlaceholder && (
                    <button
                      onClick={() => navigate(`/meals/${meal.id}/edit`)}
                      className="text-sm px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60"
                    >
                      Edit
                    </button>
                  )}
                  {isParent && !isPlaceholder && (
                    <button
                      onClick={() => handleDelete(meal.id)}
                      className="text-sm px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/60"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
