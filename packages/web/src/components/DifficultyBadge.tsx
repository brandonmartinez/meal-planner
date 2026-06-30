import type { Difficulty } from '@meal-planner/shared';

const LABELS: Record<Difficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

const STYLES: Record<Difficulty, string> = {
  EASY: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  MEDIUM: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  HARD: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

/**
 * Small pill that surfaces a meal's difficulty. Renders nothing when the meal
 * has no difficulty set (`null`), so callers can pass the raw field through.
 */
export default function DifficultyBadge({
  difficulty,
}: {
  difficulty: Difficulty | null;
}) {
  if (difficulty === null) return null;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${STYLES[difficulty]}`}
      aria-label={`Difficulty: ${LABELS[difficulty]}`}
    >
      {LABELS[difficulty]}
    </span>
  );
}
