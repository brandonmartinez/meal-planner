import { useMemo, useState, type CSSProperties } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type {
  DayPlan,
  MealSuggestion,
  ResolveSuggestionChoiceInputDTO,
} from '@meal-planner/shared';
import { DAYS_OF_WEEK, MEAL_PLACEHOLDERS } from '@meal-planner/shared';
import { MealThumbnail } from './MealThumbnail';
import MealDetailModal from './MealDetailModal';
import { useFamily } from '../hooks/useFamily';

interface DayCardProps {
  day: DayPlan;
  isParent: boolean;
  currentUserId: string;
  onAddMeal: () => void;
  onApprove: (suggestionId: string) => void;
  onUnapprove: (suggestionId: string) => void;
  onRemove: (suggestionId: string) => void;
  onResolveChoices?: (
    suggestionId: string,
    selections: ResolveSuggestionChoiceInputDTO[],
  ) => Promise<void> | void;
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

export default function DayCard({
  day,
  isParent,
  currentUserId,
  onAddMeal,
  onApprove,
  onUnapprove,
  onRemove,
  onResolveChoices,
}: DayCardProps) {
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
      className={`bg-white dark:bg-gray-800 flex flex-col min-h-48 transition-shadow sm:rounded-lg sm:shadow-sm sm:border sm:border-gray-200 sm:dark:border-gray-700 sm:overflow-hidden ${droppableClass}`}
    >
      {/* On mobile the header bleeds to the viewport edges (-mx-4 cancels the
          page container's px-4) so the card boundary visually disappears and
          chips get more room. Desktop keeps the normal rounded/clipped header. */}
      <div className="-mx-4 sm:mx-0 bg-gray-100 dark:bg-gray-900/60 border-y sm:border-y-0 sm:border-b border-gray-200 dark:border-gray-700 px-4 py-3 text-center">
        <div className="font-semibold text-base text-gray-900 dark:text-gray-100">{getDayName(day.date)}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{formatDayDate(day.date)}</div>
      </div>

      <div className="flex-1 p-2 sm:p-4 space-y-2">
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
            onUnapprove={onUnapprove}
            onRemove={onRemove}
            onResolveChoices={onResolveChoices}
          />
        ))}
      </div>

      <div className="p-2 sm:p-0 sm:border-t sm:border-gray-200 sm:dark:border-gray-700">
        <button
          onClick={onAddMeal}
          className="inline-flex sm:flex w-auto sm:w-full items-center justify-center px-3 py-1.5 sm:px-4 sm:py-3 text-sm font-medium rounded sm:rounded-none border border-blue-200 dark:border-blue-800 sm:border-0 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
        >
          + Add Meal
        </button>
      </div>
    </div>
  );
}

interface SuggestionChipProps {
  suggestion: MealSuggestion;
  isParent: boolean;
  currentUserId: string;
  onApprove: (id: string) => void;
  onUnapprove: (id: string) => void;
  onRemove: (id: string) => void;
  onResolveChoices?: (
    suggestionId: string,
    selections: ResolveSuggestionChoiceInputDTO[],
  ) => Promise<void> | void;
}

function getInitialSelectionMap(suggestion: MealSuggestion): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const choice of suggestion.choices ?? []) {
    if (choice.slotId && choice.optionId && !selected[choice.slotId]) {
      selected[choice.slotId] = choice.optionId;
    }
  }
  return selected;
}

function getChoiceSummary(suggestion: MealSuggestion): Array<{ slotName: string; optionName: string }> {
  const choices = suggestion.choices ?? [];
  if (choices.length === 0) return [];

  const slots = suggestion.meal?.slots ?? [];
  if (slots.length === 0) {
    return choices.map(choice => ({
      slotName: choice.slotName,
      optionName: choice.optionName,
    }));
  }

  const bySlotId = new Map(
    choices
      .filter(choice => choice.slotId)
      .map(choice => [choice.slotId as string, choice]),
  );
  const ordered = slots
    .map(slot => bySlotId.get(slot.id))
    .filter((choice): choice is NonNullable<typeof choice> => Boolean(choice))
    .map(choice => ({
      slotName: choice.slotName,
      optionName: choice.optionName,
    }));

  const matchedSlotIds = new Set(slots.map(slot => slot.id));
  const extras = choices
    .filter(choice => !choice.slotId || !matchedSlotIds.has(choice.slotId))
    .map(choice => ({
      slotName: choice.slotName,
      optionName: choice.optionName,
    }));

  return [...ordered, ...extras];
}

function isChoiceResolutionComplete(suggestion: MealSuggestion): boolean {
  const slots = suggestion.meal?.slots ?? [];
  if (slots.length === 0) return true;
  const selectedSlotIds = (suggestion.choices ?? [])
    .map(choice => choice.slotId)
    .filter((slotId): slotId is string => Boolean(slotId));
  if (selectedSlotIds.length !== slots.length) return false;
  const selectedSet = new Set(selectedSlotIds);
  if (selectedSet.size !== slots.length) return false;
  return slots.every(slot => selectedSet.has(slot.id));
}

function formatOptionIngredient(
  ingredient: {
    name: string;
    quantity?: string | null;
    unit?: string | null;
  },
): string {
  const amount = [ingredient.quantity ?? '', ingredient.unit ?? '']
    .filter(Boolean)
    .join(' ')
    .trim();
  return amount ? `${amount} ${ingredient.name}` : ingredient.name;
}

export function SuggestionChip({
  suggestion,
  isParent,
  currentUserId,
  onApprove,
  onUnapprove,
  onRemove,
  onResolveChoices = async () => {},
}: SuggestionChipProps) {
  const { familyId } = useFamily();
  const [showDetail, setShowDetail] = useState(false);
  const [showResolver, setShowResolver] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolverError, setResolverError] = useState('');
  const [selectionBySlotId, setSelectionBySlotId] = useState<Record<string, string>>(
    () => getInitialSelectionMap(suggestion),
  );
  const placeholderKind = suggestion.meal?.placeholderKind ?? null;
  const isPlaceholder = placeholderKind !== null;
  const placeholderEmoji = isPlaceholder ? MEAL_PLACEHOLDERS[placeholderKind].emoji : null;
  const canRemove = isParent || suggestion.userId === currentUserId;
  const canDrag =
    !showResolver &&
    !suggestion.approved &&
    (isParent || suggestion.userId === currentUserId);
  const hasControls = isParent || canRemove;
  const requiredSlots = suggestion.meal?.slots ?? [];
  const hasRequiredChoices = requiredSlots.length > 0;
  const choicesResolved = isChoiceResolutionComplete(suggestion);
  const approvalBlocked = hasRequiredChoices && !choicesResolved;
  const canResolveChoices =
    hasRequiredChoices &&
    !suggestion.approved &&
    (isParent || suggestion.userId === currentUserId);
  const choiceSummary = useMemo(() => getChoiceSummary(suggestion), [suggestion]);
  // Real (non-placeholder) meals can open the detail modal; placeholders have no recipe.
  const mealId = suggestion.meal?.id ?? suggestion.mealId;
  const canOpenDetail = !isPlaceholder && !!suggestion.meal && !!familyId;
  const mealName = suggestion.meal?.name || 'Unknown';
  const imageUrl = suggestion.meal?.imageUrl ?? null;
  const showStamp = !isPlaceholder && !!imageUrl;

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

  const mealBody = (
    <>
      {placeholderEmoji && <span>{placeholderEmoji}</span>}
      {!showStamp && (
        <MealThumbnail
          src={suggestion.meal?.imageUrl}
          alt=""
          className="h-5 w-5 rounded object-cover shrink-0"
        />
      )}
      <span className="truncate">{mealName}</span>
    </>
  );

  const allSlotsSelected = requiredSlots.every(slot => Boolean(selectionBySlotId[slot.id]));

  const toggleResolver = () => {
    if (!showResolver) {
      setSelectionBySlotId(getInitialSelectionMap(suggestion));
      setResolverError('');
    }
    setShowResolver(prev => !prev);
  };

  const handleResolveSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!allSlotsSelected) {
      setResolverError('Choose one option for each required choice slot.');
      return;
    }
    const selections: ResolveSuggestionChoiceInputDTO[] = requiredSlots.map(slot => ({
      slotId: slot.id,
      optionId: selectionBySlotId[slot.id],
    }));
    setResolving(true);
    setResolverError('');
    try {
      await onResolveChoices(suggestion.id, selections);
      setShowResolver(false);
    } catch (error) {
      setResolverError(
        error instanceof Error ? error.message : 'Failed to save meal choices',
      );
    } finally {
      setResolving(false);
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`border rounded text-sm overflow-hidden ${baseClass} ${canDrag ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
        {...(canDrag ? attributes : {})}
        {...(canDrag ? listeners : {})}
      >
        <div className="flex items-stretch">
          {showStamp && (
            <img
              src={imageUrl!}
              alt={mealName}
              className="shrink-0 w-16 sm:w-20 self-stretch object-cover block"
            />
          )}
          <div className="flex-1 min-w-0 px-3 py-2">
            {canOpenDetail ? (
              <button
                type="button"
                onClick={() => setShowDetail(true)}
                aria-label={`View details for ${mealName}`}
                className="font-medium truncate flex items-center gap-1 w-full min-w-0 text-left cursor-pointer rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {mealBody}
              </button>
            ) : (
              <span className="font-medium truncate flex items-center gap-1 w-full min-w-0">
                {mealBody}
              </span>
            )}
            {suggestion.suggestedBy && (
              <div className="text-gray-400 dark:text-gray-500 text-xs truncate mt-0.5">
                by {suggestion.suggestedBy.name}
              </div>
            )}
            {choiceSummary.length > 0 && (
              <div
                className="mt-1 flex flex-wrap gap-1.5 text-xs"
                aria-label="Selected meal choices"
              >
                {choiceSummary.map((choice, index) => (
                  <span
                    key={`${choice.slotName}-${choice.optionName}-${index}`}
                    className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                  >
                    {choice.slotName}: {choice.optionName}
                  </span>
                ))}
              </div>
            )}
            {approvalBlocked && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Unresolved choices. Pick one option per slot before approval.
              </p>
            )}
            {canResolveChoices && (
              <div className="mt-2">
                <button
                  type="button"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    toggleResolver();
                  }}
                  className="inline-flex items-center rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                  aria-expanded={showResolver}
                >
                  {showResolver ? 'Hide choices' : 'Resolve choices'}
                </button>
              </div>
            )}
            {showResolver && (
              <form
                className="mt-3 space-y-3 rounded border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-700 dark:bg-indigo-900/20"
                onSubmit={handleResolveSubmit}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                {requiredSlots.map(slot => (
                  <fieldset key={slot.id} className="space-y-1.5">
                    <legend className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {slot.name}
                    </legend>
                    {slot.options.map(option => {
                      const summary = (option.ingredients ?? [])
                        .map(formatOptionIngredient)
                        .join(', ');
                      return (
                        <label
                          key={option.id}
                          className="flex cursor-pointer flex-col gap-0.5 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <span className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`slot-${suggestion.id}-${slot.id}`}
                              checked={selectionBySlotId[slot.id] === option.id}
                              onChange={() => {
                                setSelectionBySlotId(prev => ({
                                  ...prev,
                                  [slot.id]: option.id,
                                }));
                              }}
                            />
                            <span className="font-medium">{option.name}</span>
                          </span>
                          {summary && (
                            <span className="pl-6 text-[11px] text-gray-500 dark:text-gray-400">
                              Adds: {summary}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
                {resolverError && (
                  <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                    {resolverError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={resolving || !allSlotsSelected}
                    className="inline-flex items-center rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resolving ? 'Saving…' : 'Save choices'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResolver(false)}
                    className="inline-flex items-center rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
          {hasControls && (
            <div
              className="flex flex-col items-center justify-center shrink-0 gap-1 px-1 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
              onPointerDown={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              {isParent && !suggestion.approved && (
                <button
                  type="button"
                  onClick={() => onApprove(suggestion.id)}
                  disabled={approvalBlocked}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded p-1 text-base text-green-600 hover:bg-green-100 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-green-400 dark:hover:bg-green-900/40 dark:hover:text-green-200"
                  title={
                    approvalBlocked
                      ? 'Resolve required meal choices before approving'
                      : 'Approve'
                  }
                  aria-label={
                    approvalBlocked
                      ? 'Resolve required meal choices before approving'
                      : 'Approve suggestion'
                  }
                >
                  ✓
                </button>
              )}
              {isParent && suggestion.approved && (
                <button
                  type="button"
                  onClick={() => onUnapprove(suggestion.id)}
                  className="inline-flex items-center justify-center min-w-9 min-h-9 p-1 rounded text-base text-green-600 dark:text-green-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:text-amber-700 dark:hover:text-amber-300"
                  title="Un-approve"
                  aria-label="Un-approve suggestion"
                >
                  ↺
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
          )}
        </div>
      </div>
      {showDetail && familyId && (
        <MealDetailModal
          familyId={familyId}
          mealId={mealId}
          mealName={suggestion.meal?.name}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}
