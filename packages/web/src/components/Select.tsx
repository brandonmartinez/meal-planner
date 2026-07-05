import type { SelectHTMLAttributes } from 'react';

export type SelectSize = 'sm' | 'md';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  selectSize?: SelectSize;
}

// Applied to the inner <select>. appearance-none strips the OS/browser native
// dropdown arrow (both -webkit- and -moz- prefixes are covered by Tailwind's
// appearance-none utility) so only our custom SVG chevron is visible.
const SELECT_CLASSES =
  'w-full appearance-none border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed';

// pr-8 reserves space on the right so text never overlaps the chevron icon.
// sm uses h-9 (36px) to match TagMultiSelect's min-h-9 when they sit side-by-side.
const SIZE_CLASSES: Record<SelectSize, string> = {
  md: 'px-3 py-2 pr-8',
  sm: 'px-2 py-1 pr-8 h-9 text-sm',
};

/**
 * Standardized select control. Wraps the native <select> in a relative
 * container so an absolutely-positioned SVG chevron can sit on the right edge.
 *
 * Pass only layout/sizing overrides via className (e.g. w-full, flex-1, w-32,
 * margins). Visual style (colours, border, radius, padding) is owned by the
 * component and should not be overridden by callers.
 */
export default function Select({
  selectSize = 'md',
  className,
  children,
  ...props
}: SelectProps) {
  return (
    <div className={`relative${className ? ` ${className}` : ''}`}>
      <select
        className={`${SELECT_CLASSES} ${SIZE_CLASSES[selectSize]}`}
        {...props}
      >
        {children}
      </select>
      {/* Chevron icon: pointer-events-none so it doesn't block the select's
          click target. currentColor inherits text-gray-500/dark:text-gray-400
          from the parent span, giving correct contrast in both themes. */}
      <span
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500 dark:text-gray-400"
        aria-hidden="true"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M6 8l4 4 4-4"
          />
        </svg>
      </span>
    </div>
  );
}
