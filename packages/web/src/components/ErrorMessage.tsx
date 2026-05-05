interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-4 flex items-start gap-3" role="alert">
      <span className="text-red-500 dark:text-red-400 text-lg shrink-0">⚠️</span>
      <div className="flex-1">
        <p className="text-red-800 dark:text-red-200 text-sm">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-sm text-red-600 dark:text-red-300 hover:text-red-800 dark:hover:text-red-100 underline font-medium"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
