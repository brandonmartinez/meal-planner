import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
    DndContext,
    PointerSensor,
    TouchSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';
import { useWeek } from '../context/WeekContext';
import { useRealtimeEvent } from '../context/SocketContext';
import {
    createWeekPlan,
    addSuggestion,
    approveSuggestion,
    unapproveSuggestion,
    removeSuggestion,
    moveSuggestion,
    resolveSuggestionChoices,
} from '../api/weekPlan';
import { formatWeekRange, getCurrentWeekStart } from '../utils/date';
import DayCard from '../components/DayCard';
import MealPicker from '../components/MealPicker';
import ApplyTemplateModal from '../components/ApplyTemplateModal';
import RepeatWeekModal from '../components/RepeatWeekModal';
import LoadingSpinner from '../components/LoadingSpinner';
import type {
    WeekPlan,
    DayPlan,
    MealSuggestion,
    ResolveSuggestionChoiceInputDTO,
} from '@meal-planner/shared';
import { RealtimeEvent } from '@meal-planner/shared';

export default function WeekPlanPage() {
    const { familyId, hasFamilies } = useFamily();
    const { weekStart } = useWeek();
    const { user } = useAuth();

    const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pickerDayPlanId, setPickerDayPlanId] = useState<string | null>(null);
    const [showRepeat, setShowRepeat] = useState(false);
    const [showApply, setShowApply] = useState(false);

    const currentMembership = user?.memberships?.find(m => m.familyId === familyId);
    const isParent = currentMembership?.role === 'PARENT';
    const isPastWeek = weekStart < getCurrentWeekStart();
    const showActionRow = !isPastWeek;

    // Reset the transient modal open-state as the user navigates between weeks.
    useEffect(() => {
        setShowRepeat(false);
        setShowApply(false);
    }, [weekStart]);

    const loadWeekPlan = useCallback(async () => {
        if (!familyId) return;
        setLoading(true);
        setError('');
        try {
            const plan = await createWeekPlan(familyId, weekStart);
            setWeekPlan(plan);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load week plan');
        } finally {
            setLoading(false);
        }
    }, [familyId, weekStart]);

    useEffect(() => { loadWeekPlan(); }, [loadWeekPlan]);

    // Live-update when another family member changes this family's week plan or
    // its meal suggestions.
    useRealtimeEvent(RealtimeEvent.WeekPlanChanged, (payload) => {
        if (payload.familyId === familyId) loadWeekPlan();
    });
    useRealtimeEvent(RealtimeEvent.SuggestionChanged, (payload) => {
        if (payload.familyId === familyId) loadWeekPlan();
    });

    const handleAddSuggestion = async (mealId: string) => {
        if (!familyId || !pickerDayPlanId) return;
        try {
            await addSuggestion(familyId, pickerDayPlanId, mealId);
            setPickerDayPlanId(null);
            await loadWeekPlan();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add suggestion');
        }
    };

    const handleApprove = async (suggestionId: string) => {
        if (!familyId) return;
        try {
            await approveSuggestion(familyId, suggestionId);
            await loadWeekPlan();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to approve suggestion');
        }
    };

    const handleResolveChoices = async (
        suggestionId: string,
        selections: ResolveSuggestionChoiceInputDTO[],
    ) => {
        if (!familyId) return;
        try {
            await resolveSuggestionChoices(familyId, suggestionId, selections);
            await loadWeekPlan();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to resolve meal choices',
            );
            throw err;
        }
    };

    const handleUnapprove = async (suggestionId: string) => {
        if (!familyId) return;
        try {
            await unapproveSuggestion(familyId, suggestionId);
            await loadWeekPlan();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to unapprove suggestion');
        }
    };

    const handleRemove = async (suggestionId: string) => {
        if (!familyId) return;
        try {
            await removeSuggestion(familyId, suggestionId);
            await loadWeekPlan();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove suggestion');
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
        useSensor(KeyboardSensor),
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        if (!familyId) return;
        const { active, over } = event;
        if (!over) return;
        const sourceDayId = active.data.current?.dayPlanId as string | undefined;
        const targetDayId = over.id as string;
        const suggestionId = active.id as string;
        if (!sourceDayId || sourceDayId === targetDayId) return;

        // Optimistic update: move the suggestion locally before the network call
        const snapshot = weekPlan;
        setWeekPlan(prev => {
            if (!prev?.days) return prev;
            let moving: MealSuggestion | undefined;
            const days = prev.days.map(d => {
                if (d.id !== sourceDayId) return d;
                const remaining: MealSuggestion[] = [];
                for (const s of d.suggestions ?? []) {
                    if (s.id === suggestionId) moving = { ...s, dayPlanId: targetDayId };
                    else remaining.push(s);
                }
                return { ...d, suggestions: remaining };
            }).map(d => {
                if (d.id !== targetDayId || !moving) return d;
                return { ...d, suggestions: [...(d.suggestions ?? []), moving] };
            });
            return { ...prev, days };
        });

        try {
            await moveSuggestion(familyId, suggestionId, targetDayId);
            await loadWeekPlan();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to move suggestion');
            setWeekPlan(snapshot);
        }
    };

    if (!hasFamilies) return <Navigate to="/family/create" replace />;

    if (loading) {
        return <LoadingSpinner message="Loading week plan…" />;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="mb-6">
                <div className="flex items-baseline gap-2">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Week Plan</h1>
                    <p className="text-gray-600 dark:text-gray-300 text-lg">{formatWeekRange(weekStart)}</p>
                </div>

                {showActionRow && (
                    <div role="group" aria-label="Week actions" className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
                        <Link
                            to="/grocery"
                            className="inline-flex items-stretch overflow-hidden rounded w-full sm:w-auto bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/60"
                        >
                            <span className="flex items-center justify-center px-3 border-r border-green-200 dark:border-green-800 bg-green-200/60 dark:bg-green-900/60">🛒</span>
                            <span className="flex items-center px-4 py-2">Grocery List</span>
                        </Link>

                        {isParent && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowRepeat(true)}
                                    className="inline-flex items-stretch overflow-hidden rounded w-full sm:w-auto bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/60"
                                >
                                    <span className="flex items-center justify-center px-3 border-r border-blue-200 dark:border-blue-800 bg-blue-200/60 dark:bg-blue-900/60">🔁</span>
                                    <span className="flex items-center justify-center px-4 py-2">Repeat a previous week</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowApply(true)}
                                    className="inline-flex items-stretch overflow-hidden rounded w-full sm:w-auto bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/60"
                                >
                                    <span className="flex items-center justify-center px-3 border-r border-indigo-200 dark:border-indigo-800 bg-indigo-200/60 dark:bg-indigo-900/60">🗓️</span>
                                    <span className="flex items-center justify-center px-4 py-2">Apply a template</span>
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {error && <div role="alert" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {weekPlan?.days?.map((day: DayPlan) => (
                        <DayCard
                            key={day.id}
                            day={day}
                            isParent={isParent}
                            currentUserId={user?.id || ''}
                            onAddMeal={() => setPickerDayPlanId(day.id)}
                            onApprove={handleApprove}
                            onUnapprove={handleUnapprove}
                            onRemove={handleRemove}
                            onResolveChoices={handleResolveChoices}
                        />
                    ))}
                </div>
            </DndContext>

            {pickerDayPlanId && familyId && (
                <MealPicker
                    familyId={familyId}
                    onSelect={handleAddSuggestion}
                    onClose={() => setPickerDayPlanId(null)}
                />
            )}

            {showRepeat && familyId && (
                <RepeatWeekModal
                    familyId={familyId}
                    weekStart={weekStart}
                    onClose={() => setShowRepeat(false)}
                    onApplied={plan => {
                        setWeekPlan(plan);
                        setShowRepeat(false);
                    }}
                />
            )}

            {showApply && familyId && (
                <ApplyTemplateModal
                    familyId={familyId}
                    weekStart={weekStart}
                    onClose={() => setShowApply(false)}
                    onApplied={plan => {
                        setWeekPlan(plan);
                        setShowApply(false);
                    }}
                />
            )}
        </div>
    );
}
