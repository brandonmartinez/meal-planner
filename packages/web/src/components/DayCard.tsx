import type { DayPlan, MealSuggestion } from '@meal-planner/shared';
import { DAYS_OF_WEEK } from '@meal-planner/shared';

interface DayCardProps {
  day: DayPlan;
  isParent: boolean;
  currentUserId: string;
  onAddMeal: () => void;
  onApprove: (suggestionId: string) => void;
  onRemove: (suggestionId: string) => void;
}

function parseDateOnly(dateStr: string): Date {
  // Accepts either "YYYY-MM-DD" or full ISO ("YYYY-MM-DDTHH:mm:ss.sssZ").
  // Always interprets as local midnight so day-of-week/display is stable.
  const ymd = dateStr.slice(0, 10);
  return new Date(ymd + 'T00:00:00');
}

function formatDayDate(dateStr: string): string {
  return parseDateOnly(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDayName(dateStr: string): string {
  return DAYS_OF_WEEK[parseDateOnly(dateStr).getDay()];
}

export default function DayCard({ day, isParent, currentUserId, onAddMeal, onApprove, onRemove }: DayCardProps) {
  const suggestions = day.suggestions || [];

  return (
    <div className="bg-white rounded-lg shadow-sm border p-3 flex flex-col">
      <div className="text-center mb-2">
        <div className="font-semibold text-sm text-gray-900">{getDayName(day.date)}</div>
        <div className="text-xs text-gray-500">{formatDayDate(day.date)}</div>
      </div>

      <div className="flex-1 space-y-1.5 mb-2">
        {suggestions.length === 0 && (
          <p className="text-xs text-gray-400 text-center italic">No suggestions</p>
        )}
        {suggestions.map((s: MealSuggestion) => (
          <SuggestionChip
            key={s.id}
            suggestion={s}
            isParent={isParent}
            currentUserId={currentUserId}
            onApprove={onApprove}
            onRemove={onRemove}
          />
        ))}
      </div>

      <button
        onClick={onAddMeal}
        className="w-full text-xs py-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium"
      >
        + Add Meal
      </button>
    </div>
  );
}

interface SuggestionChipProps {
  suggestion: MealSuggestion;
  isParent: boolean;
  currentUserId: string;
  onApprove: (id: string) => void;
  onRemove: (id: string) => void;
}

function SuggestionChip({ suggestion, isParent, currentUserId, onApprove, onRemove }: SuggestionChipProps) {
  const isFreeDayPlaceholder = suggestion.meal?.isFreeDayPlaceholder;
  const canRemove = isParent || suggestion.userId === currentUserId;

  const baseClass = suggestion.approved
    ? 'bg-green-50 border-green-300'
    : isFreeDayPlaceholder
      ? 'bg-gray-100 border-gray-300'
      : 'bg-white border-gray-200';

  return (
    <div className={`border rounded px-2 py-1 text-xs ${baseClass}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium truncate flex items-center gap-1">
          {suggestion.approved && <span className="text-green-600">✓</span>}
          {isFreeDayPlaceholder && <span>🏖️</span>}
          {suggestion.meal?.name || 'Unknown'}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {isParent && !suggestion.approved && (
            <button
              onClick={() => onApprove(suggestion.id)}
              className="text-green-600 hover:text-green-800 p-0.5"
              title="Approve"
            >
              ✓
            </button>
          )}
          {canRemove && (
            <button
              onClick={() => onRemove(suggestion.id)}
              className="text-red-400 hover:text-red-600 p-0.5"
              title="Remove"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {suggestion.suggestedBy && (
        <div className="text-gray-400 text-[10px] truncate">
          by {suggestion.suggestedBy.name}
        </div>
      )}
    </div>
  );
}
