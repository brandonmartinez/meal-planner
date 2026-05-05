export default function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12" role="status" aria-label={message}>
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mb-3" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
