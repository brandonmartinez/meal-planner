import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import { getMeal } from '../api/meals';
import { MEAL_PLACEHOLDERS } from '@meal-planner/shared';
import type { Meal, MealIngredient } from '@meal-planner/shared';
import DifficultyBadge from './DifficultyBadge';
import LoadingSpinner from './LoadingSpinner';
import MealTagList from './MealTagList';
import { MealThumbnail } from './MealThumbnail';

type LoadedMeal = Meal & { ingredients: MealIngredient[] };

interface MealDetailModalProps {
  familyId: string;
  /** The real meal to display. Placeholder suggestions must be filtered out by the caller. */
  mealId: string;
  /** Name already known from the suggestion — shown in the header while the full meal loads. */
  mealName?: string;
  onClose: () => void;
}

/** Format an ingredient row into a single readable line (e.g. "2 cups flour"). */
function formatIngredient(ingredient: MealIngredient): string {
  return [ingredient.quantity, ingredient.unit, ingredient.name]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Read-only meal-detail dialog for the Week Plan view (#weekplan-meal-modal).
 *
 * Opened by clicking a real (non-placeholder) meal card in {@link DayCard}. It
 * fetches the full recipe by id via the same `getMeal` endpoint the standalone
 * {@link MealDetailPage} uses, and surfaces the key metadata (name, image,
 * difficulty, favorite/rating, tags/categories, collections, ingredients,
 * description, notes) without leaving the planner. A prominent "View cooking
 * mode" link routes to the full-screen CookingModePage.
 *
 * Styling mirrors the other dialogs (RepeatWeekModal / TemplateFormModal) and
 * the a11y contract (focus trap, Esc/backdrop close, focus restore) comes from
 * the shared {@link Modal} primitive.
 */
export default function MealDetailModal({
  familyId,
  mealId,
  mealName,
  onClose,
}: MealDetailModalProps) {
  const headingId = useId();
  const [meal, setMeal] = useState<LoadedMeal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getMeal(familyId, mealId)
      .then(loaded => {
        if (active) setMeal(loaded);
      })
      .catch(() => {
        if (active) setError('Failed to load recipe');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [familyId, mealId]);

  const heading = meal?.name ?? mealName ?? 'Meal details';
  const isPlaceholder = meal?.placeholderKind != null;

  const hasTimingRow =
    !!meal &&
    (meal.prepTimeMinutes !== null ||
      meal.cookTimeMinutes !== null ||
      meal.servings !== null);
  const ingredients = meal?.ingredients ?? [];

  return (
    <Modal
      onClose={onClose}
      labelledBy={headingId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
    >
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2
              id={headingId}
              className="text-lg font-semibold text-gray-900 dark:text-gray-100 break-words"
            >
              {heading}
            </h2>
            {meal && !isPlaceholder && (
              <DifficultyBadge difficulty={meal.difficulty} />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label="Close"
            className="shrink-0 -mt-1 -mr-1 inline-flex h-9 w-9 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ✕
            </span>
          </button>
        </div>

        {loading && <LoadingSpinner message="Loading recipe..." size="sm" />}

        {!loading && error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {!loading && !error && meal && isPlaceholder && meal.placeholderKind && (
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">
              {MEAL_PLACEHOLDERS[meal.placeholderKind].emoji}
            </span>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This is a built-in scheduling option, not a recipe.{' '}
              {MEAL_PLACEHOLDERS[meal.placeholderKind].description}.
            </p>
          </div>
        )}

        {!loading && !error && meal && !isPlaceholder && (
          <div>
            <Link
              to={`/meals/${meal.id}/cook`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-base font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <span aria-hidden="true">👩‍🍳</span> View cooking mode
            </Link>

            {(meal.favorite || meal.rating !== null) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {meal.favorite && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    aria-label="Favorite"
                  >
                    <span aria-hidden="true">★</span> Favorite
                  </span>
                )}
                {meal.rating !== null && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    aria-label={`Rating: ${meal.rating} out of 5`}
                  >
                    <span aria-hidden="true">★</span> {meal.rating}/5
                  </span>
                )}
              </div>
            )}

            <MealTagList
              tags={meal.tags}
              categories={meal.categories}
              max={6}
              className="mt-4"
            />

            {meal.description && (
              <p className="mt-4 text-gray-700 dark:text-gray-300">
                {meal.description}
              </p>
            )}

            <MealThumbnail
              src={meal.imageUrl}
              alt={meal.name}
              className="mt-4 max-h-64 w-full rounded-lg object-cover"
            />

            {hasTimingRow && (
              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
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

            {meal.collections && meal.collections.length > 0 && (
              <section className="mt-5" aria-labelledby={`${headingId}-collections`}>
                <h3
                  id={`${headingId}-collections`}
                  className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  <span aria-hidden="true">📚</span> In collections
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {meal.collections.map(collection => (
                    <li key={collection.id}>
                      <Link
                        to={`/collections/${collection.id}`}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-800 hover:border-blue-400 hover:bg-blue-50 dark:border-gray-700 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:bg-blue-900/20"
                      >
                        <span aria-hidden="true">📖</span>
                        {collection.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {meal.sourceUrl && (
              <p className="mt-5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Source:{' '}
                </span>
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

            <section className="mt-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Ingredients
              </h3>
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
              <section className="mt-5">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Notes
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                  {meal.notes}
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
