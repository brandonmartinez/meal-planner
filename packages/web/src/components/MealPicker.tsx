import { useState, useEffect, useCallback, useId } from 'react';
import { listMeals } from '../api/meals';
import { listCollections } from '../api/collections';
import type { RecipeCollection } from '../api/collections';
import type { MealListItemDTO, MealPlaceholderKind, Difficulty } from '@meal-planner/shared';
import { MEAL_PLACEHOLDER_KINDS, MEAL_PLACEHOLDERS, MEAL_DIFFICULTIES } from '@meal-planner/shared';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useTaxonomy } from '../hooks/useTaxonomy';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';
import Select from './Select';
import RecentBadge from './RecentBadge';
import LastCookedBadge from './LastCookedBadge';
import DifficultyBadge from './DifficultyBadge';
import MealTagList from './MealTagList';
import { MealThumbnail } from './MealThumbnail';

interface MealPickerProps {
  familyId: string;
  onSelect: (mealId: string) => void;
  onClose: () => void;
}

const PICKER_PAGE_SIZE = 25;

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

export default function MealPicker({ familyId, onSelect, onClose }: MealPickerProps) {
  const [meals, setMeals] = useState<MealListItemDTO[]>([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [collectionFilter, setCollectionFilter] = useState('');
  const [collectionOptions, setCollectionOptions] = useState<RecipeCollection[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const headingId = useId();

  const { tags: tagOptions } = useTaxonomy(familyId);

  // Debounce the raw search input so fast typing does not spam the list API.
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadMeals = useCallback(async () => {
    try {
      const data = await listMeals(familyId, {
        search: debouncedSearch || undefined,
        difficulty: difficulty.length ? difficulty : undefined,
        tags: tagFilter.length ? tagFilter : undefined,
        collections: collectionFilter ? [collectionFilter] : undefined,
        limit: PICKER_PAGE_SIZE,
        offset: 0,
      });
      setMeals(data.items);
      setHasMore(data.hasMore);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [familyId, debouncedSearch, difficulty, tagFilter, collectionFilter]);

  useEffect(() => { loadMeals(); }, [loadMeals]);

  // Collections power the dedicated collection filter (#110). Loaded separately;
  // fails soft — a load error just leaves the dropdown empty.
  useEffect(() => {
    listCollections(familyId)
      .then(setCollectionOptions)
      .catch(() => setCollectionOptions([]));
  }, [familyId]);

  // Append the next page onto the existing list without clearing it.
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await listMeals(familyId, {
        search: debouncedSearch || undefined,
        difficulty: difficulty.length ? difficulty : undefined,
        tags: tagFilter.length ? tagFilter : undefined,
        collections: collectionFilter ? [collectionFilter] : undefined,
        limit: PICKER_PAGE_SIZE,
        offset: meals.length,
      });
      setMeals(prev => [...prev, ...data.items]);
      setHasMore(data.hasMore);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleDifficulty = (value: Difficulty) => {
    setDifficulty(prev =>
      prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value],
    );
  };

  const toggleTag = (value: string) => {
    setTagFilter(prev =>
      prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value],
    );
  };

  // Index placeholders by kind so we can render them in canonical order.
  const placeholderByKind = new Map<MealPlaceholderKind, MealListItemDTO>();
  for (const m of meals) {
    if (m.placeholderKind) placeholderByKind.set(m.placeholderKind, m);
  }
  const placeholders = MEAL_PLACEHOLDER_KINDS
    .map((kind) => placeholderByKind.get(kind))
    .filter((m): m is MealListItemDTO => Boolean(m));
  const regularMeals = meals.filter(m => !m.placeholderKind);

  return (
    <Modal
      onClose={onClose}
      labelledBy={headingId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 id={headingId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pick a Meal</h2>
        <button onClick={onClose} aria-label="Close meal picker" className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl">✕</button>
      </div>

      <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search meals..."
          aria-label="Search meals"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-autofocus
        />
        {/* Difficulty is the most relevant planning filter; kept compact so the
            picker stays lean. Tag facets (#108) render only when the family has
            taxonomy so the picker stays uncluttered. */}
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
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
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

        {tagOptions.length > 0 && (
          <div
            role="group"
            aria-label="Filter by tag"
            className="flex flex-wrap items-center gap-1.5"
          >
            {tagOptions.map(tag => {
              const active = tagFilter.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleTag(tag.name)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}

        {collectionOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="picker-collection-filter"
              className="text-xs font-medium text-gray-600 dark:text-gray-300"
            >
              Collection
            </label>
            <Select
              id="picker-collection-filter"
              selectSize="sm"
              value={collectionFilter}
              onChange={e => setCollectionFilter(e.target.value)}
              className="flex-1"
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

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <LoadingSpinner message="Loading meals…" size="sm" hideLabel className="py-8" />
        ) : (
          <>
            {placeholders.length > 0 && (
              <div className="mb-2">
                <div className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Quick options
                </div>
                {placeholders.map(meal => {
                  const meta = MEAL_PLACEHOLDERS[meal.placeholderKind!];
                  return (
                    <button
                      key={meal.id}
                      onClick={() => onSelect(meal.id)}
                      className="w-full text-left p-3 rounded mb-1 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <div className="font-medium flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <span>{meta.emoji}</span> {meta.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{meta.description}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {regularMeals.length === 0 && placeholders.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">No meals found</p>
            )}

            {regularMeals.map(meal => (
              <button
                key={meal.id}
                onClick={() => onSelect(meal.id)}
                className="w-full text-left p-3 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
              >
                <div className="flex items-start gap-2">
                  <MealThumbnail
                    src={meal.imageUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{meal.name}</div>
                      <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                        <RecentBadge
                          recentlyScheduled={meal.recentlyScheduled}
                          lastScheduledOn={meal.lastScheduledOn}
                        />
                        <LastCookedBadge
                          timesCooked={meal.timesCooked}
                          lastCookedOn={meal.lastCookedOn}
                        />
                        <DifficultyBadge difficulty={meal.difficulty} />
                      </div>
                    </div>
                    {meal.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{meal.description}</div>
                    )}
                    <MealTagList
                      tags={meal.tags}
                      max={2}
                      className="mt-1"
                    />
                  </div>
                </div>
              </button>
            ))}

            {hasMore && (
              <div className="p-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full rounded border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
