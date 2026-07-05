import type { Tag } from '../api/taxonomy';

interface MealTagListProps {
  tags?: Tag[];
  /** Render a leading "built-in" pseudo-tag (always visible, never capped). */
  builtIn?: boolean;
  /** Max pills to render before collapsing the rest into a `+N` chip. */
  max?: number;
  /** Reserve a min-height so cards stay aligned even when a meal has none. */
  reserveHeight?: boolean;
  className?: string;
}

type Pill = { key: string; label: string };

/**
 * Compact, non-interactive display of a meal's tags. Keeps meal cards from
 * getting noisy: renders small pills, caps the visible count, and collapses the
 * remainder into a `+N` chip (visual-noise guard).
 */
export default function MealTagList({
  tags,
  builtIn = false,
  max = 3,
  reserveHeight = false,
  className = '',
}: MealTagListProps) {
  const pills: Pill[] = (tags ?? []).map(
    (t): Pill => ({ key: `t-${t.id}`, label: t.name }),
  );

  const reserve = reserveHeight ? 'min-h-[1.5rem]' : '';

  if (pills.length === 0 && !builtIn) {
    // Still reserve the row when asked, so sibling cards line up.
    return reserveHeight ? <div className={`${reserve} ${className}`} /> : null;
  }

  const visible = pills.slice(0, max);
  const overflow = pills.length - visible.length;

  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${reserve} ${className}`}
      aria-label="Tags"
    >
      {builtIn && (
        <span
          className="inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
        >
          built-in
        </span>
      )}
      {visible.map(pill => (
        <span
          key={pill.key}
          title={pill.label}
          className={`inline-block max-w-[8rem] truncate rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`}
        >
          {pill.label}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300"
          aria-label={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
