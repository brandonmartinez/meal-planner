import { useId, useState } from 'react';
import Modal from './Modal';
import { createCollection, updateCollection } from '../api/collections';
import type { RecipeCollection } from '../api/collections';

interface CollectionFormModalProps {
  familyId: string;
  /** When provided the modal edits this collection; otherwise it creates one. */
  collection?: RecipeCollection;
  onClose: () => void;
  /** Called with the saved collection after a successful create/update. */
  onSaved: (collection: RecipeCollection) => void;
}

/**
 * Create/edit dialog for a recipe collection (#110). A collection is a
 * first-class, curated shelf — distinct from tags/categories — so it gets a
 * proper form (name + optional blurb) rather than an inline chip editor.
 * The API call and error handling live here; the parent only refreshes on save.
 */
export default function CollectionFormModal({
  familyId,
  collection,
  onClose,
  onSaved,
}: CollectionFormModalProps) {
  const isEdit = Boolean(collection);
  const headingId = useId();
  const nameId = useId();
  const descriptionId = useId();

  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      const saved =
        isEdit && collection
          ? await updateCollection(familyId, collection.id, {
              name: trimmed,
              description: blurb,
            })
          : await createCollection(familyId, { name: trimmed, description: blurb });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
      setSubmitting(false);
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
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
          />
        </div>

        <div className="mb-5">
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

        <div className="flex justify-end gap-2">
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
      </form>
    </Modal>
  );
}
