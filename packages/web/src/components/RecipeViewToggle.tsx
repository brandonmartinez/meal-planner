import type { RecipeViewMode } from '../hooks/useRecipeViewMode';

const MODES: { value: RecipeViewMode; label: string; icon: string }[] = [
  { value: 'list', label: 'List', icon: '☰' },
  { value: 'grid', label: 'Grid', icon: '▦' },
];

/**
 * Accessible List/Grid segmented control (spec §7/§9). A labelled button group
 * mirroring `ThemeToggle`'s `variant="menu"`: each button carries `aria-pressed`
 * so assistive tech announces the active mode, and the whole group is keyboard
 * operable as native buttons. Controlled — the parent owns the value (via
 * `useRecipeViewMode`) so persistence stays in one place.
 */
export default function RecipeViewToggle({
  value,
  onChange,
}: {
  value: RecipeViewMode;
  onChange: (mode: RecipeViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800"
      role="group"
      aria-label="Recipe view"
    >
      {MODES.map((mode) => {
        const active = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            aria-pressed={active}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              active
                ? 'bg-white text-blue-700 shadow-sm dark:bg-gray-900 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <span aria-hidden="true">{mode.icon}</span>
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
