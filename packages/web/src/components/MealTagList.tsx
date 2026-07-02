import type { Tag, Category } from '../api/taxonomy';

interface MealTagListProps {
  tags?: Tag[];
  categories?: Category[];
  /** Max pills to render before collapsing the rest into a `+N` chip. */
  max?: number;
  /** Reserve a min-height so cards stay aligned even when a meal has none. */
  reserveHeight?: boolean;
  className?: string;
}

type Pill = { key: string; label: string; kind: 'tag' | 'category' };

const KIND_CLASSES: Record<Pill['kind'], string> = {
  // Tags and categories are visually distinct so a glance tells them apart,
  // without adding buttons/links — these are non-interactive display spans.
  tag: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  category:
    'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

/**
 * Compact, non-interactive display of a meal's tags and categories. Keeps meal
 * cards from getting noisy: renders small pills, caps the visible count, and
 * collapses the remainder into a `+N` chip (visual-noise guard). Tags render
 * before categories; each is color-coded by kind.
 */
export default function MealTagList({
  tags,
  categories,
  max = 3,
  reserveHeight = false,
  className = '',
}: MealTagListProps) {
  const pills: Pill[] = [
    ...(tags ?? []).map((t): Pill => ({ key: `t-${t.id}`, label: t.name, kind: 'tag' })),
    ...(categories ?? []).map(
      (c): Pill => ({ key: `c-${c.id}`, label: c.name, kind: 'category' }),
    ),
  ];

  const reserve = reserveHeight ? 'min-h-[1.5rem]' : '';

  if (pills.length === 0) {
    // Still reserve the row when asked, so sibling cards line up.
    return reserveHeight ? <div className={`${reserve} ${className}`} /> : null;
  }

  const visible = pills.slice(0, max);
  const overflow = pills.length - visible.length;

  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${reserve} ${className}`}
      aria-label="Tags and categories"
    >
      {visible.map(pill => (
        <span
          key={pill.key}
          title={pill.label}
          className={`inline-block max-w-[8rem] truncate rounded-full px-2 py-0.5 text-xs font-medium ${KIND_CLASSES[pill.kind]}`}
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
