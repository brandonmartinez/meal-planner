import { useId, useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { formatWeekRange } from '../utils/date';
import { ApiError } from '../api/client';
import {
  listTemplates,
  applyTemplate,
  templateEntryCount,
  templateDayCount,
  type PlanningTemplate,
} from '../api/templates';
import type { WeekPlan } from '@meal-planner/shared';

interface ApplyTemplateModalProps {
  familyId: string;
  /** Target week Monday (YYYY-MM-DD) the template will be applied to. */
  weekStart: string;
  onClose: () => void;
  /** Called with the refreshed week plan after a successful apply. */
  onApplied: (plan: WeekPlan) => void;
}

/** Two-phase flow: pick a template, then (only if the week already has meals)
 *  consciously choose how to resolve the conflict. */
type Phase = 'select' | 'confirm';

/**
 * Apply-a-template dialog (#117).
 *
 * A template is a reusable "week blueprint"; applying it materializes unapproved
 * suggestions onto the target week. The backend's `existingMode` guards a week
 * that already has meals: `'error'` (default) makes the API return **409** so we
 * never clobber silently. This dialog leans on that — it always tries `'error'`
 * first and, only on a 409, surfaces an explicit skip-vs-replace confirmation.
 * `'replace'` is the destructive branch and is never the default path.
 */
export default function ApplyTemplateModal({
  familyId,
  weekStart,
  onClose,
  onApplied,
}: ApplyTemplateModalProps) {
  const headingId = useId();

  const [templates, setTemplates] = useState<PlanningTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [phase, setPhase] = useState<Phase>('select');
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState('');

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await listTemplates(familyId);
      setTemplates(list);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const apply = async (existingMode: 'error' | 'skip' | 'replace') => {
    if (!selectedId) return;
    setApplyBusy(true);
    setApplyError('');
    try {
      const plan = await applyTemplate(familyId, selectedId, weekStart, existingMode);
      onApplied(plan);
    } catch (err) {
      // A 409 from the default `'error'` attempt means the week already has
      // meals — escalate to an explicit confirmation rather than failing.
      if (err instanceof ApiError && err.status === 409 && existingMode === 'error') {
        setPhase('confirm');
      } else {
        setApplyError(
          err instanceof Error ? err.message : 'Failed to apply template',
        );
      }
    } finally {
      setApplyBusy(false);
    }
  };

  const selectedName =
    templates.find(t => t.id === selectedId)?.name ?? 'this template';

  return (
    <Modal
      onClose={onClose}
      labelledBy={headingId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
    >
      <div className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            🗓️
          </span>
          <h2
            id={headingId}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Apply a template
          </h2>
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Week of {formatWeekRange(weekStart)}
        </p>

        {applyError && (
          <div
            role="alert"
            className="mb-4 rounded bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300"
          >
            {applyError}
          </div>
        )}

        {phase === 'select' && (
          <>
            {loading && (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Loading templates…
              </p>
            )}

            {!loading && loadError && (
              <div>
                <div
                  role="alert"
                  className="mb-3 rounded bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300"
                >
                  {loadError}
                </div>
                <button
                  type="button"
                  onClick={loadTemplates}
                  className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !loadError && templates.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No templates yet. Create one on the Templates page first.
              </p>
            )}

            {!loading && !loadError && templates.length > 0 && (
              <fieldset className="mb-4">
                <legend className="sr-only">Choose a template to apply</legend>
                <ul className="space-y-2">
                  {templates.map(t => {
                    const meals = templateEntryCount(t);
                    const days = templateDayCount(t);
                    return (
                      <li key={t.id}>
                        <label className="flex cursor-pointer items-start gap-3 rounded border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 dark:has-[:checked]:bg-indigo-900/30">
                          <input
                            type="radio"
                            name="apply-template"
                            value={t.id}
                            checked={selectedId === t.id}
                            onChange={() => setSelectedId(t.id)}
                            className="mt-1"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-gray-900 dark:text-gray-100">
                              {t.name}
                            </span>
                            {t.description && (
                              <span className="block text-sm text-gray-600 dark:text-gray-300">
                                {t.description}
                              </span>
                            )}
                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                              {meals} {meals === 1 ? 'meal' : 'meals'} across {days}{' '}
                              {days === 1 ? 'day' : 'days'}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => apply('error')}
                disabled={!selectedId || applyBusy}
                className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {applyBusy ? 'Applying…' : 'Apply to this week'}
              </button>
            </div>
          </>
        )}

        {phase === 'confirm' && (
          <div>
            <div
              role="alert"
              className="mb-4 rounded bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200"
            >
              <p className="font-medium">This week already has meals planned.</p>
              <p className="mt-1">
                Choose how to apply <span className="font-medium">{selectedName}</span>.
                Replacing deletes every meal already planned this week.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => apply('skip')}
                disabled={applyBusy}
                className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {applyBusy ? 'Working…' : 'Keep existing meals, fill empty days'}
              </button>
              <button
                type="button"
                onClick={() => apply('replace')}
                disabled={applyBusy}
                className="px-4 py-2 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {applyBusy ? 'Working…' : "Replace this week's meals"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase('select');
                  setApplyError('');
                }}
                disabled={applyBusy}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:underline disabled:opacity-50"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
