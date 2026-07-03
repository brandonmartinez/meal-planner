import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { listCollections } from '../api/collections';
import type { RecipeCollection } from '../api/collections';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import ErrorMessage from '../components/ErrorMessage';
import CollectionFormModal from '../components/CollectionFormModal';

/**
 * Browse and manage recipe collections (#110). Collections are a first-class,
 * curated "shelf" of meals — deliberately distinct from tag/category filter
 * chips: this is a dedicated page with list rows, a 📚 book motif, and full
 * CRUD (create/edit for members, delete gated to parents like the backend).
 */
export default function CollectionsPage() {
  const { familyId, hasFamilies } = useFamily();
  const { user } = useAuth();

  const [collections, setCollections] = useState<RecipeCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<RecipeCollection | null>(null);

  const currentMembership = user?.memberships?.find(m => m.familyId === familyId);
  const isParent = currentMembership?.role === 'PARENT';

  const loadCollections = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const data = await listCollections(familyId);
      setCollections(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const handleDeleted = (collectionId: string) => {
    setEditing(null);
    setCollections(prev => prev.filter(c => c.id !== collectionId));
  };

  const handleSaved = (saved: RecipeCollection) => {
    setShowCreate(false);
    setEditing(null);
    setCollections(prev => {
      const exists = prev.some(c => c.id === saved.id);
      const next = exists
        ? prev.map(c => (c.id === saved.id ? saved : c))
        : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  if (!hasFamilies) return <Navigate to="/family/create" replace />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-gray-900 dark:text-gray-100">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            📚
          </span>
          <h1 className="text-2xl font-bold">Collections</h1>
        </div>
        {isParent && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New collection
          </button>
        )}
      </div>

      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Group recipes into curated shelves — like “Weeknight Winners” or “Holiday
        Baking”. A meal can live on more than one shelf.
      </p>

      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} onRetry={loadCollections} />
        </div>
      )}

      {loading ? (
        <LoadingSpinner message="Loading collections…" />
      ) : collections.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No collections yet"
          description={
            isParent
              ? 'Create your first collection to start organizing recipes into shelves.'
              : 'A parent can create collections to organize recipes into shelves.'
          }
          action={
            isParent ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                New collection
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {collections.map(collection => (
            <li
              key={collection.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              {isParent ? (
                <button
                  type="button"
                  onClick={() => setEditing(collection)}
                  className="flex w-full items-start gap-3 rounded-lg p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <span className="mt-0.5 text-xl" aria-hidden="true">
                    📖
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                      {collection.name}
                    </span>
                    {collection.description && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {collection.description}
                      </p>
                    )}
                  </div>
                </button>
              ) : (
                <div className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 text-xl" aria-hidden="true">
                    📖
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/collections/${collection.id}`}
                      className="text-lg font-semibold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      {collection.name}
                    </Link>
                    {collection.description && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {collection.description}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showCreate && familyId && (
        <CollectionFormModal
          familyId={familyId}
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
        />
      )}
      {editing && familyId && (
        <CollectionFormModal
          familyId={familyId}
          collection={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
