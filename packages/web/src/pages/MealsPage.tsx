import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { listMeals, deleteMeal, exportMeals } from '../api/meals';
import { listCollections } from '../api/collections';
import type { RecipeCollection } from '../api/collections';
import { mealsToCSV } from '../utils/csv';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTaxonomy } from '../hooks/useTaxonomy';
import ImportMealsDialog from '../components/ImportMealsDialog';
import Select from '../components/Select';
import TagMultiSelect from '../components/TagMultiSelect';
import DifficultyBadge from '../components/DifficultyBadge';
import RecentBadge from '../components/RecentBadge';
import LastCookedBadge from '../components/LastCookedBadge';
import { MealThumbnail } from '../components/MealThumbnail';
import MealTagList from '../components/MealTagList';
import MealDetailModal from '../components/MealDetailModal';
import LoadingSpinner from '../components/LoadingSpinner';
import type { MealListItemDTO, Difficulty } from '@meal-planner/shared';
import { MEAL_PLACEHOLDERS, MEAL_DIFFICULTIES } from '@meal-planner/shared';

// Page size for the meal library. Passed explicitly so Load-more offset math is
// deterministic and independent of the backend default.
const PAGE_SIZE = 24;

const SORT_OPTIONS: { value: 'name' | 'created' | 'lastCooked'; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Recently added' },
  { value: 'lastCooked', label: 'Recently cooked' },
];

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

export default function MealsPage() {
  const { familyId, hasFamilies } = useFamily();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { mealId: modalMealId } = useParams<{ mealId?: string }>();
  const [meals, setMeals] = useState<MealListItemDTO[]>([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [collectionFilter, setCollectionFilter] = useState('');
  const [collectionOptions, setCollectionOptions] = useState<RecipeCollection[]>([]);
  const [sort, setSort] = useState<'name' | 'created' | 'lastCooked'>('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    const saved = localStorage.getItem('meal-library-view');
    return saved === 'table' ? 'table' : 'card';
  });
  const [hideBuiltins, setHideBuiltins] = useState(false);
  // Collapse the filter controls down to just the search bar (mobile only).
  // Defaults to collapsed so mobile opens to a clean search-only view; the
  // `sm:block` in the wrapper keeps everything expanded on desktop regardless.
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);

  // Debounce the raw search input so fast typing does not spam the list API.
  const debouncedSearch = useDebouncedValue(search, 300);

  // Family taxonomy powers the tag filter group below.
  const { tags: tagOptions } = useTaxonomy(familyId);

  const currentMembership = user?.memberships?.find(m => m.familyId === familyId);
  const isParent = currentMembership?.role === 'PARENT';

  const hasActiveFilters =
    debouncedSearch.trim() !== '' ||
    difficulty.length > 0 ||
    tagFilter.length > 0 ||
    collectionFilter !== '' ||
    hideBuiltins;

  // Load the first page (replaces the grid). Runs whenever any filter/sort input
  // changes; a new search/filter always resets pagination to offset 0.
  const loadMeals = useCallback(async () => {
    if (!familyId) return;
    try {
      const data = await listMeals(familyId, {
        search: debouncedSearch || undefined,
        difficulty: difficulty.length ? difficulty : undefined,
        tags: tagFilter.length ? tagFilter : undefined,
        collections: collectionFilter ? [collectionFilter] : undefined,
        sort,
        order,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setMeals(data.items);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meals');
    } finally {
      setLoading(false);
    }
  }, [familyId, debouncedSearch, difficulty, tagFilter, collectionFilter, sort, order]);

  useEffect(() => { loadMeals(); }, [loadMeals]);

  // Collections power the dedicated collection filter (#110). Loaded separately
  // from taxonomy; fails soft — a load error just leaves the dropdown empty.
  useEffect(() => {
    if (!familyId) return;
    listCollections(familyId)
      .then(setCollectionOptions)
      .catch(() => setCollectionOptions([]));
  }, [familyId]);

  // Append the next page onto the existing grid without clearing it.
  const loadMore = async () => {
    if (!familyId || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await listMeals(familyId, {
        search: debouncedSearch || undefined,
        difficulty: difficulty.length ? difficulty : undefined,
        tags: tagFilter.length ? tagFilter : undefined,
        collections: collectionFilter ? [collectionFilter] : undefined,
        sort,
        order,
        limit: PAGE_SIZE,
        offset: meals.length,
      });
      setMeals(prev => [...prev, ...data.items]);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more meals');
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleDifficulty = (value: Difficulty) => {
    setDifficulty(prev =>
      prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value],
    );
  };

  const clearFilters = () => {
    setSearch('');
    setDifficulty([]);
    setTagFilter([]);
    setCollectionFilter('');
    setHideBuiltins(false);
  };

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

  // Client-side filter: hide placeholder/built-in meals when the toggle is on.
  const displayedMeals = hideBuiltins
    ? meals.filter(m => m.placeholderKind === null)
    : meals;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-gray-900 dark:text-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Meal Library</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div
            role="group"
            aria-label="View mode"
            className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'card'}
              onClick={() => {
                setViewMode('card');
                localStorage.setItem('meal-library-view', 'card');
              }}
              className={`px-3 py-1.5 text-sm transition-colors ${
                viewMode === 'card'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'table'}
              onClick={() => {
                setViewMode('table');
                localStorage.setItem('meal-library-view', 'table');
              }}
              className={`px-3 py-1.5 text-sm border-l border-gray-300 dark:border-gray-600 transition-colors ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Table
            </button>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="hidden sm:inline-block px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="hidden sm:inline-block px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
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

      {/* Discovery filter bar (#112). Search, difficulty[], sort, order, offset
          pagination (#111) plus tag facets (#108). The tag group only renders
          when the family has taxonomy so empty families stay
          clutter-free. Multi-select is OR-within-facet; facets AND together. */}
      <div className="mb-6 space-y-3">
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search meals..."
            aria-label="Search meals"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded"
          />
          <button
            type="button"
            onClick={() => setFiltersCollapsed(prev => !prev)}
            aria-expanded={!filtersCollapsed}
            aria-controls="meal-filters"
            aria-label={filtersCollapsed ? 'Show filters' : 'Hide filters'}
            className="sm:hidden shrink-0 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-2 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg
              className={`h-5 w-5 transition-transform ${filtersCollapsed ? '' : 'rotate-180'}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div
          id="meal-filters"
          className={`space-y-3 ${filtersCollapsed ? 'hidden sm:block' : ''}`}
        >
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div
            role="group"
            aria-label="Filter by difficulty"
            className="flex flex-wrap items-center gap-1.5"
          >
            {MEAL_DIFFICULTIES.map(value => {
              const active = difficulty.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDifficulty(value)}
                  className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {DIFFICULTY_LABELS[value]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
            <label htmlFor="meals-sort" className="text-sm text-gray-600 dark:text-gray-300">
              Sort
            </label>
            <Select
              id="meals-sort"
              selectSize="sm"
              value={sort}
              onChange={e => setSort(e.target.value as typeof sort)}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
              aria-label={order === 'asc' ? 'Sort ascending' : 'Sort descending'}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {order === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>

          {collectionOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="collection-filter"
                className="text-sm text-gray-600 dark:text-gray-300"
              >
                Collection
              </label>
              <Select
                id="collection-filter"
                selectSize="sm"
                value={collectionFilter}
                onChange={e => setCollectionFilter(e.target.value)}
              >
                <option value="">All collections</option>
                {collectionOptions.map(c => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {tagOptions.length > 0 && (
          <div role="group" aria-label="Filter by tag">
            <TagMultiSelect
              label="Filter by tag"
              values={tagFilter}
              options={tagOptions.map(t => t.name)}
              onChange={setTagFilter}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={hideBuiltins}
              onChange={e => setHideBuiltins(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Hide built-ins
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        </div>
      </div>

      {error && <div role="alert" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

      {meals.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          {hasActiveFilters ? 'No meals match your filters.' : 'No meals yet. Add your first meal!'}
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
            Showing {displayedMeals.length} of {total}
          </p>

          {viewMode === 'card' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayedMeals.map(meal => {
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
                  <MealThumbnail
                    src={meal.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded object-cover"
                  />
                  {meta && (
                    <span className="shrink-0 text-lg leading-6" aria-hidden="true">
                      {meta.emoji}
                    </span>
                  )}
                  <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug line-clamp-2 min-h-[2.75rem]">
                    {isPlaceholder ? (
                      meal.name
                    ) : (
                      <Link
                        to={`/meals/${meal.id}`}
                        className="hover:underline focus:outline-none"
                      >
                        {meal.name}
                      </Link>
                    )}
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
                      <LastCookedBadge
                        timesCooked={meal.timesCooked}
                        lastCookedOn={meal.lastCookedOn}
                      />
                      <DifficultyBadge difficulty={meal.difficulty} />
                    </>
                  )}
                </div>

                {/* Zone 2.5 — tags (compact, reserved height) */}
                {!isPlaceholder && (
                  <MealTagList
                    tags={meal.tags}
                    reserveHeight
                    className="mt-2"
                  />
                )}

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
                        <Link
                          to={`/meals/${meal.id}`}
                          aria-label={`View ${meal.name}`}
                          className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        >
                          View
                        </Link>
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <th className="pb-2 pr-4 font-semibold">Name</th>
                    <th className="hidden sm:table-cell pb-2 pr-4 font-semibold">Tags</th>
                    <th className="pb-2 pr-4 text-center font-semibold">Difficulty</th>
                    <th className="pb-2 text-right font-semibold sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {displayedMeals.map(meal => {
                    const isPlaceholder = meal.placeholderKind !== null;
                    return (
                      <tr
                        key={meal.id}
                        onClick={
                          isPlaceholder
                            ? undefined
                            : () => navigate(`/meals/${meal.id}`)
                        }
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                          isPlaceholder ? '' : 'cursor-pointer'
                        }`}
                      >
                        <td className="py-2.5 pr-4">
                          {isPlaceholder ? (
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {meal.name}
                            </span>
                          ) : (
                            <Link
                              to={`/meals/${meal.id}`}
                              className="font-medium text-gray-900 dark:text-gray-100 hover:underline focus:outline-none"
                            >
                              {meal.name}
                            </Link>
                          )}
                        </td>
                        <td className="hidden sm:table-cell py-2.5 pr-4">
                          <MealTagList tags={meal.tags} builtIn={isPlaceholder} />
                        </td>
                        <td className="py-2.5 pr-4 text-center">
                          {!isPlaceholder && (
                            <DifficultyBadge difficulty={meal.difficulty} />
                          )}
                        </td>
                        <td className="py-2.5">
                          {!isPlaceholder && (
                            <div
                              className="flex justify-end gap-2"
                              onClick={e => e.stopPropagation()}
                            >
                              <Link
                                to={`/meals/${meal.id}`}
                                aria-label={`View ${meal.name}`}
                                className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                              >
                                View
                              </Link>
                              <button
                                onClick={() => navigate(`/meals/${meal.id}/edit`)}
                                aria-label={`Edit ${meal.name}`}
                                className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                              >
                                Edit
                              </button>
                              {isParent && (
                                <button
                                  onClick={() => handleDelete(meal.id)}
                                  aria-label={`Delete ${meal.name}`}
                                  className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {modalMealId != null && familyId != null && (
        <MealDetailModal
          familyId={familyId}
          mealId={modalMealId}
          onClose={() => navigate('/meals')}
        />
      )}
    </div>
  );
}
