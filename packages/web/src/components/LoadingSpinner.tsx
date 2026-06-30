interface LoadingSpinnerProps {
  /** Accessible label announced via role="status". Also shown visually unless hideLabel is set. */
  message?: string;
  /** Spinner size. `sm` suits inline/dialog contexts, `md` suits route-level loaders. */
  size?: 'sm' | 'md';
  /** Visually hide the label text. It stays available to screen readers via role="status" + aria-label. */
  hideLabel?: boolean;
  /** Wrapper layout/spacing classes. Override for tighter inline contexts. */
  className?: string;
}

const SIZES: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'h-6 w-6 border-2',
  md: 'h-10 w-10 border-4',
};

export default function LoadingSpinner({
  message = 'Loading...',
  size = 'md',
  hideLabel = false,
  className = 'py-12',
}: LoadingSpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-label={message}
    >
      <div
        className={`animate-spin rounded-full ${SIZES[size]} border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 ${hideLabel ? '' : 'mb-3'}`}
      />
      {hideLabel ? (
        <span className="sr-only">{message}</span>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
      )}
    </div>
  );
}
