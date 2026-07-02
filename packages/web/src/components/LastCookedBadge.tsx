/**
 * Small pill that surfaces a meal's derived cook history (issue #99):
 * `timesCooked` is the all-time count of approved suggestions for the meal
 * (family-scoped), and `lastCookedOn` is the calendar date of the most recent
 * one. Both are derived read-only fields — nothing is persisted.
 *
 * Renders nothing when the meal has never been cooked (`timesCooked === 0`), so
 * callers can pass the raw DTO fields through. This is a distinct concept from
 * {@link RecentBadge}, which flags *scheduling* recency within the current or
 * previous week rather than all-time cook history.
 *
 * The indicator is not color-only: it carries visible text "Cooked N×" plus an
 * accessible label, and uses `lastCookedOn` for help text.
 */
export default function LastCookedBadge({
  timesCooked,
  lastCookedOn,
}: {
  timesCooked: number;
  lastCookedOn: string | null;
}) {
  if (timesCooked <= 0) return null;

  const label = `Cooked ${timesCooked}\u00d7`;
  const help = lastCookedOn
    ? `Cooked ${timesCooked} time${timesCooked !== 1 ? 's' : ''} — last on ${lastCookedOn}`
    : `Cooked ${timesCooked} time${timesCooked !== 1 ? 's' : ''}`;

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
      title={help}
      aria-label={help}
    >
      {label}
    </span>
  );
}
