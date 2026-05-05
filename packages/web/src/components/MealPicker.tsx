import { useState, useEffect, useCallback } from 'react';
import { listMeals } from '../api/meals';
import type { Meal, MealPlaceholderKind } from '@meal-planner/shared';
import { MEAL_PLACEHOLDER_KINDS, MEAL_PLACEHOLDERS } from '@meal-planner/shared';

interface MealPickerProps {
  familyId: string;
  onSelect: (mealId: string) => void;
  onClose: () => void;
}

export default function MealPicker({ familyId, onSelect, onClose }: MealPickerProps) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadMeals = useCallback(async () => {
    try {
      const data = await listMeals(familyId, search || undefined);
      setMeals(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [familyId, search]);

  useEffect(() => { loadMeals(); }, [loadMeals]);

  // Index placeholders by kind so we can render them in canonical order.
  const placeholderByKind = new Map<MealPlaceholderKind, Meal>();
  for (const m of meals) {
    if (m.placeholderKind) placeholderByKind.set(m.placeholderKind, m);
  }
  const placeholders = MEAL_PLACEHOLDER_KINDS
    .map((kind) => placeholderByKind.get(kind))
    .filter((m): m is Meal => Boolean(m));
  const regularMeals = meals.filter(m => !m.placeholderKind);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pick a Meal</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl">✕</button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search meals..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
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
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{meal.name}</div>
                  {meal.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{meal.description}</div>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
