import { useId, useState, type FormEvent } from 'react';
import Modal from './Modal';
import { formatWeekRange, shiftWeek } from '../utils/date';
import { repeatWeek } from '../api/weekPlan';
import type { WeekPlan, RepeatWeekExistingMode } from '@meal-planner/shared';

interface RepeatWeekModalProps {
  familyId: string;
  /** Target week Monday (YYYY-MM-DD) the copied meals will land on. */
  weekStart: string;
  onClose: () => void;
  /** Called with the refreshed week plan after a successful copy. */
  onApplied: (plan: WeekPlan) => void;
}

/**
 * Repeat-a-previous-week dialog (Brandon's UI-consistency request).
 *
 * Relocates the former inline "Copy meals from week of" panel into a modal so
 * opening it no longer shifts the day columns downward — matching the
 * "Apply a template" affordance. The network contract is unchanged: it POSTs to
 * the repeat endpoint with the chosen source week and `existingMode`.
 *
 * `existingMode` guards a target week that already has meals: `'error'` (the
 * default) makes the backend refuse rather than clobber; `'skip'` fills only
 * empty days; `'replace'` is the destructive branch and is never the default.
 */
export default function RepeatWeekModal({
  familyId,
  weekStart,
  onClose,
  onApplied,
}: RepeatWeekModalProps) {
  const headingId = useId();

  const [sourceWeek, setSourceWeek] = useState(() => shiftWeek(weekStart, -1));
  const [existingMode, setExistingMode] = useState<RepeatWeekExistingMode>('error');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const plan = await repeatWeek(familyId, weekStart, sourceWeek, existingMode);
      onApplied(plan);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to repeat week. If the target week already has meals, choose skip or replace.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy={headingId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} aria-label="Repeat a previous week" className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            🔁
          </span>
          <h2
            id={headingId}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Repeat a previous week
          </h2>
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Week of {formatWeekRange(weekStart)}
        </p>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-4">
          <label className="flex flex-col text-sm text-gray-700 dark:text-gray-300">
            <span className="mb-1">Copy meals from week of</span>
            <input
              type="date"
              value={sourceWeek}
              onChange={e => setSourceWeek(e.target.value)}
              data-autofocus
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="flex flex-col text-sm text-gray-700 dark:text-gray-300">
            <span className="mb-1">If this week has meals</span>
            <select
              value={existingMode}
              onChange={e => setExistingMode(e.target.value as RepeatWeekExistingMode)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            >
              <option value="error">Stop (don't overwrite)</option>
              <option value="skip">Skip days that already have meals</option>
              <option value="replace">Replace this week's meals</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:underline"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Copying…' : 'Copy meals'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
