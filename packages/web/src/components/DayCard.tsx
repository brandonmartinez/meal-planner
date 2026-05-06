import type { CSSProperties } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { DayPlan, MealSuggestion } from '@meal-planner/shared';
import { DAYS_OF_WEEK, MEAL_PLACEHOLDERS } from '@meal-planner/shared';

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

  const { isOver, setNodeRef } = useDroppable({
    id: day.id,
    data: { type: 'day', dayPlanId: day.id },
  });

  const droppableClass = isOver
    ? 'ring-2 ring-blue-400 dark:ring-blue-500'
    : '';

  return (
    <div
      ref={setNodeRef}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col min-h-48 overflow-hidden transition-shadow ${droppableClass}`}
    >
      <div className="bg-gray-100 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 px-4 py-3 text-center">
        <div className="font-semibold text-base text-gray-900 dark:text-gray-100">{getDayName(day.date)}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{formatDayDate(day.date)}</div>
      </div>

      <div className="flex-1 p-4 space-y-2">
        {suggestions.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center italic">No suggestions</p>
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
        className="w-full px-4 py-3 text-center text-sm font-medium border-t border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
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

export function SuggestionChip({ suggestion, isParent, currentUserId, onApprove, onRemove }: SuggestionChipProps) {
  const placeholderKind = suggestion.meal?.placeholderKind ?? null;
  const isPlaceholder = placeholderKind !== null;
  const placeholderEmoji = isPlaceholder ? MEAL_PLACEHOLDERS[placeholderKind].emoji : null;
  const canRemove = isParent || suggestion.userId === currentUserId;
  const canDrag = !suggestion.approved && (isParent || suggestion.userId === currentUserId);

  const baseClass = suggestion.approved
    ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-gray-900 dark:text-gray-100'
    : isPlaceholder
      ? 'bg-gray-100 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100'
      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100';

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: suggestion.id,
    data: { type: 'suggestion', suggestionId: suggestion.id, dayPlanId: suggestion.dayPlanId },
    disabled: !canDrag,
  });

  const style: CSSProperties = transform
    ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      opacity: isDragging ? 0.4 : undefined,
    }
    : { opacity: isDragging ? 0.4 : undefined };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded px-3 py-2 text-sm ${baseClass} ${canDrag ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate flex items-center gap-1 flex-1 min-w-0">
          {suggestion.approved && <span className="text-green-600 dark:text-green-400">✓</span>}
          {placeholderEmoji && <span>{placeholderEmoji}</span>}
          <span className="truncate">{suggestion.meal?.name || 'Unknown'}</span>
        </span>
        <div
          className="flex items-center gap-1 shrink-0"
          onPointerDown={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {isParent && !suggestion.approved && (
            <button
              type="button"
              onClick={() => onApprove(suggestion.id)}
              className="inline-flex items-center justify-center min-w-9 min-h-9 p-1 rounded text-base text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 hover:text-green-800 dark:hover:text-green-200"
              title="Approve"
              aria-label="Approve suggestion"
            >
              ✓
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(suggestion.id)}
              className="inline-flex items-center justify-center min-w-9 min-h-9 p-1 rounded text-base text-red-400 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-300"
              title="Remove"
              aria-label="Remove suggestion"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {suggestion.suggestedBy && (
        <div className="text-gray-400 dark:text-gray-500 text-xs truncate mt-0.5">
          by {suggestion.suggestedBy.name}
        </div>
      )}
    </div>
  );
}
