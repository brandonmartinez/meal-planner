import type { SelectHTMLAttributes } from 'react';

export type SelectSize = 'sm' | 'md';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  selectSize?: SelectSize;
}

const BASE_CLASSES =
  'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed';

const SIZE_CLASSES: Record<SelectSize, string> = {
  md: 'px-3 py-2',
  sm: 'px-2 py-1 text-sm',
};

export default function Select({
  selectSize = 'md',
  className,
  children,
  ...props
}: SelectProps) {
  const combined = className
    ? `${BASE_CLASSES} ${SIZE_CLASSES[selectSize]} ${className}`
    : `${BASE_CLASSES} ${SIZE_CLASSES[selectSize]}`;

  return (
    <select className={combined} {...props}>
      {children}
    </select>
  );
}
