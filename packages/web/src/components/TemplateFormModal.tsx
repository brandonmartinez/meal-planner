import { useId, useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import {
  createTemplate,
  updateTemplate,
  type PlanningTemplate,
  type TemplateEntryInput,
} from '../api/templates';
import { listMeals, type MealListItemDTO } from '../api/meals';

interface TemplateFormModalProps {
  familyId: string;
  /** When provided the modal edits this template; otherwise it creates one. */
  template?: PlanningTemplate;
  onClose: () => void;
  /** Called with the saved template after a successful create/update. */
  onSaved: (template: PlanningTemplate) => void;
}

/** Relative weekday labels — index matches the backend's `dayOfWeek`
 *  (0=Monday..6=Sunday, an offset from the target week's Monday). */
const DAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * Create/edit dialog for a planning template (#117). A template is a reusable
 * "week blueprint" — a named set of relative day→meal entries — so it gets a
 * proper form: name + optional blurb + a seven-day grid where each day can hold
 * one or more meals. Entries carry only `mealId` on the wire, so we resolve meal
 * names against the family's meal list (loaded here). The API call and error
 * handling live here; the parent only refreshes on save.
 */
export default function TemplateFormModal({
  familyId,
  template,
  onClose,
  onSaved,
}: TemplateFormModalProps) {
  const isEdit = Boolean(template);
  const headingId = useId();
  const nameId = useId();
  const descriptionId = useId();

  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [entries, setEntries] = useState<TemplateEntryInput[]>(
    () =>
      template?.entries?.map(e => ({
        dayOfWeek: e.dayOfWeek,
        mealId: e.mealId,
      })) ?? [],
  );
  const [meals, setMeals] = useState<MealListItemDTO[]>([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadMeals = useCallback(async () => {
    setMealsLoading(true);
    try {
      // The template modal needs the FULL catalog to place any meal on any day.
      // The list-meals endpoint caps `limit` at 100 (a `limit=500` request 400s),
      // so page through respecting that cap, accumulating each page's items until
      // `hasMore` is false. Guard against an infinite loop: stop on an empty page
      // and hard-cap the number of pages.
      const PAGE_SIZE = 100;
      const MAX_PAGES = 50; // safety bound → up to 5000 meals
      const all: MealListItemDTO[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await listMeals(familyId, {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          sort: 'name',
          order: 'asc',
        });
        all.push(...res.items);
        if (!res.hasMore || res.items.length === 0) break;
      }
      setMeals(all);
    } catch (err) {
      // A meal-load failure shouldn't block editing name/description; surface a
      // gentle inline note but keep the form usable. Log for debuggability rather
      // than swallowing the underlying error entirely.
      console.error('Failed to load meals for template modal', err);
      setError('Could not load meals — you can still edit the name and blurb.');
    } finally {
      setMealsLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

  const mealName = (mealId: string): string =>
    meals.find(m => m.id === mealId)?.name ?? 'Unknown meal';

  const addEntry = (dayOfWeek: number, mealId: string) => {
    if (!mealId) return;
    setEntries(prev => {
      // The backend enforces uniqueness on (template, day, meal); mirror that so
      // the same meal can't be added to the same day twice.
      if (prev.some(e => e.dayOfWeek === dayOfWeek && e.mealId === mealId)) {
        return prev;
      }
      return [...prev, { dayOfWeek, mealId }];
    });
  };

  const removeEntry = (dayOfWeek: number, mealId: string) => {
    setEntries(prev =>
      prev.filter(e => !(e.dayOfWeek === dayOfWeek && e.mealId === mealId)),
    );
  };

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
        isEdit && template
          ? await updateTemplate(familyId, template.id, {
              name: trimmed,
              description: blurb,
              entries,
            })
          : await createTemplate(familyId, {
              name: trimmed,
              description: blurb,
              entries,
            });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
      setSubmitting(false);
    }
  };

  const totalEntries = entries.length;

  return (
    <Modal
      onClose={onClose}
      labelledBy={headingId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            🗓️
          </span>
          <h2
            id={headingId}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {isEdit ? 'Edit template' : 'New template'}
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
            rows={2}
            placeholder="A short blurb about this week blueprint…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded"
          />
        </div>

        <fieldset className="mb-5">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Meals by day{' '}
            <span className="font-normal text-gray-500 dark:text-gray-400">
              ({totalEntries} {totalEntries === 1 ? 'meal' : 'meals'})
            </span>
          </legend>

          {mealsLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading meals…
            </p>
          ) : meals.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No meals yet — add meals to your family first, then place them on
              days here.
            </p>
          ) : (
            <div className="space-y-2">
              {DAY_LABELS.map((label, day) => {
                const dayEntries = entries.filter(e => e.dayOfWeek === day);
                const selectId = `${nameId}-day-${day}`;
                return (
                  <div
                    key={day}
                    className="rounded border border-gray-200 dark:border-gray-700 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {label}
                      </span>
                      <div className="flex items-center gap-1">
                        <label htmlFor={selectId} className="sr-only">
                          Add a meal to {label}
                        </label>
                        <select
                          id={selectId}
                          value=""
                          onChange={e => {
                            addEntry(day, e.target.value);
                            e.target.value = '';
                          }}
                          className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        >
                          <option value="">+ Add a meal…</option>
                          {meals.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {dayEntries.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {dayEntries.map(entry => (
                          <li key={entry.mealId}>
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                              {mealName(entry.mealId)}
                              <button
                                type="button"
                                onClick={() => removeEntry(day, entry.mealId)}
                                aria-label={`Remove ${mealName(entry.mealId)} from ${label}`}
                                className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200"
                              >
                                ×
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>

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
