import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCollection } from '../api/collections';
import type { RecipeCollection } from '../api/collections';
import { listMeals } from '../api/meals';
import { ApiError } from '../api/client';
import { useFamily } from '../hooks/useFamily';
import type { MealListItemDTO } from '@meal-planner/shared';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import DifficultyBadge from '../components/DifficultyBadge';
import { MealThumbnail } from '../components/MealThumbnail';

const BackLink = () => (
  <Link
    to="/collections"
    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
  >
    <span aria-hidden="true">←</span> Back to collections
  </Link>
);

/**
 * A single collection's shelf (#110): its name + curated blurb, then the meals
 * on it. Membership is read straight from the existing list-meals API using the
 * `collections` filter shipped in #109 — no bespoke endpoint. Covers loading,
 * an empty shelf, and a friendly 404 when the collection is missing.
 */
export default function CollectionDetailPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { familyId } = useFamily();

  const [collection, setCollection] = useState<RecipeCollection | null>(null);
  const [meals, setMeals] = useState<MealListItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!familyId || !collectionId) return;
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError('');

    (async () => {
      try {
        const found = await getCollection(familyId, collectionId);
        if (!active) return;
        setCollection(found);
        // Member meals come from the real list-meals collection filter (#109).
        const data = await listMeals(familyId, { collections: [found.name] });
        if (!active) return;
        setMeals(data.items);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load collection');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [familyId, collectionId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <LoadingSpinner message="Loading collection…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <EmptyState
          icon="📚"
          title="Collection not found"
          description="This collection may have been deleted."
          action={<BackLink />}
        />
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
        >
          {error || 'Failed to load collection'}
        </div>
        <div className="mt-4">
          <BackLink />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4">
        <BackLink />
      </div>

      <header className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">
          📚
        </span>
        <h1 className="text-2xl font-bold">{collection.name}</h1>
      </header>

      {collection.description && (
        <p className="mt-3 text-gray-700 dark:text-gray-300">{collection.description}</p>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Meals on this shelf
      </h2>

      {meals.length === 0 ? (
        <EmptyState
          icon="🍽️"
          title="No meals in this collection yet"
          description="Add meals to this collection from the meal editor."
        />
      ) : (
        <ul className="space-y-2">
          {meals.map(meal => (
            <li key={meal.id}>
              <Link
                to={`/meals/${meal.id}`}
                className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <MealThumbnail
                  src={meal.imageUrl}
                  alt={meal.name}
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1 truncate font-medium">{meal.name}</span>
                {meal.difficulty && <DifficultyBadge difficulty={meal.difficulty} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
