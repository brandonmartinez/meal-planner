import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Modal from './Modal';
import Combobox from './Combobox';
import {
  createCollection,
  updateCollection,
  deleteCollection,
} from '../api/collections';
import type { RecipeCollection } from '../api/collections';
import { listMeals } from '../api/meals';

interface CollectionFormModalProps {
  familyId: string;
  /** When provided the modal edits this collection; otherwise it creates one. */
  collection?: RecipeCollection;
  onClose: () => void;
  /** Called with the saved collection after a successful create/update. */
  onSaved: (collection: RecipeCollection) => void;
  /** Called with the deleted collection id after a successful delete. Only the
   *  edit view exposes a Delete action, so this is optional. */
  onDeleted?: (collectionId: string) => void;
}

/** A meal reduced to the fields the picker needs. */
type MealOption = { id: string; name: string };

// The list-meals endpoint caps `limit` at 100 and 400s anything higher, so we
// page through it (matches TemplateFormModal / MealFormPage). MAX_PAGES bounds
// the loop against a runaway backend.
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

async function loadAllMeals(
  familyId: string,
  extra?: { collections?: string[] },
): Promise<MealOption[]> {
  const acc: MealOption[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await listMeals(familyId, {
      ...extra,
      limit: PAGE_LIMIT,
      offset: page * PAGE_LIMIT,
      sort: 'name',
      order: 'asc',
    });
    for (const meal of res.items) acc.push({ id: meal.id, name: meal.name });
    if (!res.hasMore || res.items.length === 0) break;
  }
  return acc;
}

/**
 * Create/edit dialog for a recipe collection (#110). A collection is a
 * first-class, curated shelf — distinct from tags/categories — so it gets a
 * proper form (name + optional blurb + meal membership) rather than an inline
 * chip editor. The API calls and error handling live here; the parent only
 * refreshes on save/delete.
 *
 * Meal membership (#152): the Combobox picker edits which meals belong to the
 * collection. On save we send the selected meal ids via `mealIds` (replace-set
 * semantics). For edits we only send `mealIds` once the current membership has
 * loaded — if that fetch fails we omit the field so a transient error can never
 * silently clear a collection's meals.
 */
export default function CollectionFormModal({
  familyId,
  collection,
  onClose,
  onSaved,
  onDeleted,
}: CollectionFormModalProps) {
  const isEdit = Boolean(collection);
  const headingId = useId();
  const nameId = useId();
  const descriptionId = useId();

  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Meal-membership editing state.
  const [meals, setMeals] = useState<MealOption[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [mealError, setMealError] = useState('');
  // Create mode is always safe to write membership; edit mode must wait for the
  // current membership to load before we allow sending `mealIds`.
  const [membershipReady, setMembershipReady] = useState(!collection);

  // Inline (CSP-safe) delete confirmation — no window.confirm.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadMealData = useCallback(async () => {
    setMealsLoading(true);
    setMealError('');
    try {
      const catalog = await loadAllMeals(familyId);
      setMeals(catalog);
      if (collection) {
        const members = await loadAllMeals(familyId, {
          collections: [collection.name],
        });
        setSelectedNames(members.map(m => m.name));
        setMembershipReady(true);
      }
    } catch (err) {
      setMealError(
        err instanceof Error ? err.message : 'Failed to load meals',
      );
    } finally {
      setMealsLoading(false);
    }
  }, [familyId, collection]);

  useEffect(() => {
    loadMealData();
  }, [loadMealData]);

  // Case-insensitive name → id map. Duplicate meal names collapse to the first
  // id (rare; documented in the decision record).
  const mealIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const meal of meals) {
      const key = meal.name.toLowerCase();
      if (!map.has(key)) map.set(key, meal.id);
    }
    return map;
  }, [meals]);

  const suggestions = useMemo(
    () => Array.from(new Set(meals.map(m => m.name))),
    [meals],
  );

  // Only accept names that resolve to a real meal — what the user sees selected
  // is exactly what will be saved (junk typed names are rejected).
  const handleMealsChange = useCallback(
    (names: string[]) => {
      setSelectedNames(names.filter(n => mealIdByName.has(n.toLowerCase())));
    },
    [mealIdByName],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const blurb = description.trim() ? description.trim() : null;
      // Guard against data loss: only send mealIds when membership is known
      // (always for create; only after a successful load for edit).
      let mealIds: string[] | undefined;
      if (membershipReady) {
        const ids = selectedNames
          .map(n => mealIdByName.get(n.toLowerCase()))
          .filter((id): id is string => Boolean(id));
        mealIds = Array.from(new Set(ids));
      }
      const saved =
        isEdit && collection
          ? await updateCollection(familyId, collection.id, {
              name: trimmed,
              description: blurb,
              ...(mealIds ? { mealIds } : {}),
            })
          : await createCollection(familyId, {
              name: trimmed,
              description: blurb,
              ...(mealIds ? { mealIds } : {}),
            });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!collection) return;
    setDeleting(true);
    setError('');
    try {
      await deleteCollection(familyId, collection.id);
      onDeleted?.(collection.id);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete collection',
      );
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy={headingId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md"
    >
      <form onSubmit={handleSubmit} className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            📚
          </span>
          <h2
            id={headingId}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {isEdit ? 'Edit collection' : 'New collection'}
          </h2>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor={nameId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Name *
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            required
            data-autofocus
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor={descriptionId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Description
          </label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="A short blurb about this shelf…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded"
          />
        </div>

        <div className="mb-5">
          <Combobox
            label="Meals"
            values={selectedNames}
            onChange={handleMealsChange}
            suggestions={suggestions}
            placeholder={
              mealsLoading ? 'Loading meals…' : 'Add a meal to this shelf…'
            }
          />
          {mealsLoading && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Loading meals…
            </p>
          )}
          {mealError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {mealError}
              {isEdit && !membershipReady
                ? ' — meal membership will be left unchanged on save.'
                : ''}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {isEdit ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={submitting || deleting}
              className="px-4 py-2 text-sm rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-60"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>

        {confirmingDelete && (
          <div
            role="alertdialog"
            aria-label="Confirm delete collection"
            className="mt-4 rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3"
          >
            <p className="text-sm text-red-700 dark:text-red-300">
              Delete this collection? Meals are not deleted.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
