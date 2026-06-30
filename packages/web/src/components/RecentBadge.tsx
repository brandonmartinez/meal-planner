/**
 * Small pill that flags a meal as recently scheduled — i.e. it had at least one
 * approved suggestion in the family's current or immediately previous week
 * (issue #27). Renders nothing when the meal is not recent, so callers can pass
 * the raw DTO fields through.
 *
 * The indicator is intentionally not color-only: it carries the visible text
 * "Recent" plus an accessible label, and uses `lastScheduledOn` for help text.
 */
export default function RecentBadge({
  recentlyScheduled,
  lastScheduledOn,
}: {
  recentlyScheduled: boolean;
  lastScheduledOn: string | null;
}) {
  if (!recentlyScheduled) return null;

  const help = lastScheduledOn
    ? `Last scheduled ${lastScheduledOn}`
    : 'Recently scheduled';

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
      title={help}
      aria-label={
        lastScheduledOn ? `Recent — last scheduled ${lastScheduledOn}` : 'Recent'
      }
    >
      Recent
    </span>
  );
}
