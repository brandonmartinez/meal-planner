import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { listMeals, deleteMeal, exportMeals } from '../api/meals';
import { mealsToCSV } from '../utils/csv';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';
import ImportMealsDialog from '../components/ImportMealsDialog';
import DifficultyBadge from '../components/DifficultyBadge';
import RecentBadge from '../components/RecentBadge';
import LoadingSpinner from '../components/LoadingSpinner';
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
  const [exporting, setExporting] = useState(false);

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

  const handleExport = async () => {
    if (!familyId) return;
    setExporting(true);
    setError('');
    try {
      const { meals: exported } = await exportMeals(familyId);
      if (exported.length === 0) {
        setError('No meals to export yet.');
        return;
      }
      const csv = mealsToCSV(exported);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'meals.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export meals');
    } finally {
      setExporting(false);
    }
  };

  if (!hasFamilies) return <Navigate to="/family/create" replace />;

  if (loading) {
    return <LoadingSpinner message="Loading meals…" />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-gray-900 dark:text-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Meal Library</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
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
        aria-label="Search meals"
        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded mb-6"
      />

      {error && <div role="alert" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

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
                className={`flex h-full flex-col rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md ${
                  isPlaceholder
                    ? 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                {/* Zone 1 — title */}
                <div className="flex items-start gap-2">
                  {meta && (
                    <span className="shrink-0 text-lg leading-6" aria-hidden="true">
                      {meta.emoji}
                    </span>
                  )}
                  <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug line-clamp-2 min-h-[2.75rem]">
                    {meal.name}
                  </h3>
                </div>

                {/* Zone 2 — badges (reserved row keeps cards aligned) */}
                <div className="mt-2 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
                  {isPlaceholder ? (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      Built-in
                    </span>
                  ) : (
                    <>
                      <RecentBadge
                        recentlyScheduled={meal.recentlyScheduled}
                        lastScheduledOn={meal.lastScheduledOn}
                      />
                      <DifficultyBadge difficulty={meal.difficulty} />
                    </>
                  )}
                </div>

                {/* Zone 3 — description (reserved 2-line height) */}
                <p className="mt-2 min-h-[2.5rem] text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                  {meal.description || (
                    <span className="text-gray-400 dark:text-gray-500">No description</span>
                  )}
                </p>

                {/* Zone 4 + 5 — meta and actions, pinned to the bottom */}
                <div className="mt-auto pt-3">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {isPlaceholder
                      ? 'Automatic option'
                      : `${meal._count.ingredients} ingredient${meal._count.ingredients !== 1 ? 's' : ''}`}
                  </p>
                  <div className="mt-3 flex min-h-[2rem] gap-2 border-t border-gray-100 pt-3 dark:border-gray-700/60">
                    {isPlaceholder ? (
                      <span className="self-center text-xs text-gray-400 dark:text-gray-500">
                        Managed automatically
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => navigate(`/meals/${meal.id}/edit`)}
                          aria-label={`Edit ${meal.name}`}
                          className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                        >
                          Edit
                        </button>
                        {isParent && (
                          <button
                            onClick={() => handleDelete(meal.id)}
                            aria-label={`Delete ${meal.name}`}
                            className="rounded bg-red-100 px-3 py-1 text-sm text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                          >
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
