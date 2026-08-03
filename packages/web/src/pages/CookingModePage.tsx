import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTabularMeal } from '../api/meals';
import { useFamily } from '../hooks/useFamily';
import { useRecipeViewMode } from '../hooks/useRecipeViewMode';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { MealInstruction, TabularRecipeMealDTO } from '@meal-planner/shared';
import LoadingSpinner from '../components/LoadingSpinner';
import CookTimer from '../components/CookTimer';
import RecipeViewToggle from '../components/RecipeViewToggle';
import TabularRecipeView from '../components/TabularRecipeView';
import { formatIngredient } from '../utils/formatIngredient';

type LoadedMeal = TabularRecipeMealDTO;

/** Toggle a value's membership in a Set, returning a new Set (immutable update). */
function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/**
 * Immersive, mobile-friendly cooking mode (#102). Renders the recipe as an
 * ingredient checklist plus large, per-step instructions with optional local
 * countdown timers. All progress (checked ingredients, completed steps, running
 * timers) is client-side React state only — nothing is persisted to the server
 * and everything resets on refresh, per the "no backend state" constraint.
 */
export default function CookingModePage() {
  const { mealId } = useParams<{ mealId: string }>();
  const { familyId } = useFamily();
  const [meal, setMeal] = useState<LoadedMeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { viewMode, setViewMode } = useRecipeViewMode();
  // Below `sm` a rowspan grid is unusable, so Grid degrades to List (spec §8).
  const isWideViewport = useMediaQuery('(min-width: 640px)');

  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!familyId || !mealId) return;
    setLoading(true);
    setError('');
    getTabularMeal(familyId, mealId)
      .then(setMeal)
      .catch(() => setError('Failed to load recipe'))
      .finally(() => setLoading(false));
  }, [familyId, mealId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <LoadingSpinner message="Loading recipe..." />
      </div>
    );
  }

  if (error || !meal) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
        >
          {error || 'Recipe not found'}
        </div>
        <div className="mt-4">
          <Link
            to="/meals"
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span aria-hidden="true">←</span> Back to meals
          </Link>
        </div>
      </div>
    );
  }

  const exitTo = `/meals/${meal.id}`;

  // Placeholder meals (Free Day, Leftovers, etc.) are scheduling options, not
  // recipes — there is nothing to cook, so send the user back to the detail view.
  if (meal.placeholderKind !== null) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          This is a built-in scheduling option, not a recipe — there is nothing to cook.
        </div>
        <div className="mt-4">
          <Link
            to={exitTo}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span aria-hidden="true">←</span> Back to recipe
          </Link>
        </div>
      </div>
    );
  }

  const ingredients = meal.ingredients ?? [];
  const steps: MealInstruction[] = [...(meal.instructions ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  const toggleIngredient = (id: string) =>
    setCheckedIngredients(prev => toggleInSet(prev, id));
  const toggleStep = (id: string) =>
    setCompletedSteps(prev => toggleInSet(prev, id));

  // Grid is only legible with room to spread; on phones we always show List even
  // when Grid is the persisted preference (the toggle still reflects it).
  const showGrid = viewMode === 'grid' && isWideViewport;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4">
        <Link
          to={exitTo}
          className="inline-flex min-h-[44px] items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <span aria-hidden="true">←</span> Exit cooking mode
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{meal.name}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Cooking mode — check off ingredients and steps as you go. Timers run on
            this device only.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RecipeViewToggle value={viewMode} onChange={setViewMode} />
          {viewMode === 'grid' && !isWideViewport && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Grid view opens on larger screens.
            </p>
          )}
        </div>
      </header>

      {showGrid ? (
        <section className="mt-8" aria-labelledby="cook-grid-heading">
          <h2 id="cook-grid-heading" className="text-xl font-semibold">
            Recipe grid
          </h2>
          <div className="mt-3">
            <TabularRecipeView meal={meal} />
          </div>
        </section>
      ) : (
        <>
          <section className="mt-8" aria-labelledby="cook-ingredients-heading">
        <h2 id="cook-ingredients-heading" className="text-xl font-semibold">
          Ingredients
        </h2>
        {ingredients.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {ingredients.map(ingredient => {
              const checked = checkedIngredients.has(ingredient.id);
              return (
                <li key={ingredient.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIngredient(ingredient.id)}
                      className="h-6 w-6 flex-shrink-0 rounded border-gray-300 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-gray-600"
                    />
                    <span
                      className={`text-lg ${
                        checked
                          ? 'text-gray-400 line-through dark:text-gray-500'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {formatIngredient(ingredient)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No ingredients listed.
          </p>
        )}
      </section>

      <section className="mt-8" aria-labelledby="cook-steps-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cook-steps-heading" className="text-xl font-semibold">
            Steps
          </h2>
          {steps.length > 0 && (
            <p
              aria-live="polite"
              className="text-sm font-medium text-gray-600 dark:text-gray-300"
            >
              {completedSteps.size} of {steps.length} steps done
            </p>
          )}
        </div>

        {steps.length > 0 ? (
          <ol className="mt-3 space-y-4">
            {steps.map((step, index) => {
              const done = completedSteps.has(step.id);
              const stepLabel = `step ${index + 1}`;
              return (
                <li
                  key={step.id}
                  className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="flex items-start gap-3">
                    <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
                      <span className="sr-only">Mark {stepLabel} complete</span>
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => toggleStep(step.id)}
                        className="mt-1 h-6 w-6 flex-shrink-0 rounded border-gray-300 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-gray-600"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xl leading-relaxed ${
                          done
                            ? 'text-gray-400 line-through dark:text-gray-500'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span className="mr-2 font-semibold">{index + 1}.</span>
                        {step.text}
                      </p>
                      {typeof step.timerMinutes === 'number' && step.timerMinutes > 0 && (
                        <CookTimer minutes={step.timerMinutes} label={stepLabel} />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No steps listed for this recipe yet.
          </p>
        )}
      </section>
        </>
      )}
    </div>
  );
}
