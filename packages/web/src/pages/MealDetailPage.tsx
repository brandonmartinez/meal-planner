import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMeal } from '../api/meals';
import { useFamily } from '../hooks/useFamily';
import { MEAL_PLACEHOLDERS } from '@meal-planner/shared';
import type { Meal, MealIngredient } from '@meal-planner/shared';
import DifficultyBadge from '../components/DifficultyBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { MealThumbnail } from '../components/MealThumbnail';

type LoadedMeal = Meal & { ingredients: MealIngredient[] };

/** Format an ingredient row into a single readable line (e.g. "2 cups flour"). */
function formatIngredient(ingredient: MealIngredient): string {
  return [ingredient.quantity, ingredient.unit, ingredient.name]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ');
}

const BackLink = () => (
  <Link
    to="/meals"
    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
  >
    <span aria-hidden="true">←</span> Back to meals
  </Link>
);

/**
 * Read-only detail view for a single meal (#101). Surfaces the full recipe
 * metadata (name, difficulty, prep/cook time, servings, source URL, notes,
 * ingredients) via the existing GET single-meal endpoint. Placeholder meals
 * are not recipes, so they render a lightweight non-recipe state instead.
 */
export default function MealDetailPage() {
  const { mealId } = useParams<{ mealId: string }>();
  const { familyId } = useFamily();
  const [meal, setMeal] = useState<LoadedMeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!familyId || !mealId) return;
    setLoading(true);
    setError('');
    getMeal(familyId, mealId)
      .then(setMeal)
      .catch(() => setError('Failed to load recipe'))
      .finally(() => setLoading(false));
  }, [familyId, mealId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <LoadingSpinner message="Loading recipe..." />
      </div>
    );
  }

  if (error || !meal) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
        >
          {error || 'Recipe not found'}
        </div>
        <div className="mt-4">
          <BackLink />
        </div>
      </div>
    );
  }

  // Placeholder meals (Free Day, Leftovers, etc.) are automatic scheduling
  // options, not recipes — show a minimal non-recipe state.
  if (meal.placeholderKind !== null) {
    const meta = MEAL_PLACEHOLDERS[meal.placeholderKind];
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4">
          <BackLink />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">
            {meta.emoji}
          </span>
          <h1 className="text-2xl font-bold">{meal.name}</h1>
        </div>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          This is a built-in scheduling option, not a recipe. {meta.description}.
        </p>
      </div>
    );
  }

  const hasTimingRow =
    meal.prepTimeMinutes !== null ||
    meal.cookTimeMinutes !== null ||
    meal.servings !== null;
  const ingredients = meal.ingredients ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4">
        <BackLink />
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{meal.name}</h1>
        <DifficultyBadge difficulty={meal.difficulty} />
      </header>

      <Link
        to={`/meals/${meal.id}/cook`}
        className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-base font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <span aria-hidden="true">👩‍🍳</span> Start cooking
      </Link>

      {meal.description && (
        <p className="mt-3 text-gray-700 dark:text-gray-300">{meal.description}</p>
      )}

      <MealThumbnail
        src={meal.imageUrl}
        alt={meal.name}
        className="mt-6 max-h-80 w-full rounded-lg object-cover"
      />

      {hasTimingRow && (
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {meal.prepTimeMinutes !== null && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Prep time
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {meal.prepTimeMinutes} min
              </dd>
            </div>
          )}
          {meal.cookTimeMinutes !== null && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Cook time
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {meal.cookTimeMinutes} min
              </dd>
            </div>
          )}
          {meal.servings !== null && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Servings
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                {meal.servings}
              </dd>
            </div>
          )}
        </dl>
      )}

      {meal.sourceUrl && (
        <p className="mt-6 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">Source: </span>
          <a
            href={meal.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {meal.sourceUrl}
          </a>
        </p>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Ingredients</h2>
        {ingredients.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-800 dark:text-gray-200">
            {ingredients.map(ingredient => (
              <li key={ingredient.id}>{formatIngredient(ingredient)}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No ingredients listed.
          </p>
        )}
      </section>

      {meal.notes && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
            {meal.notes}
          </p>
        </section>
      )}

      {/* TODO(#100): render ordered cooking instructions once the rich
          instructions field lands on the Meal DTO. Scoped out here because
          #100 (rich recipe instructions) is still open — no field exists yet. */}
    </div>
  );
}
