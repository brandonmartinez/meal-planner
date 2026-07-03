import { useState, useEffect, useCallback, type FormEvent } from 'react';
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
import {
    createWeekPlan,
    addSuggestion,
    approveSuggestion,
    removeSuggestion,
    moveSuggestion,
    repeatWeek,
} from '../api/weekPlan';
import { formatWeekRange, shiftWeek } from '../utils/date';
import DayCard from '../components/DayCard';
import MealPicker from '../components/MealPicker';
import LoadingSpinner from '../components/LoadingSpinner';
import type { WeekPlan, DayPlan, MealSuggestion, RepeatWeekExistingMode } from '@meal-planner/shared';

export default function WeekPlanPage() {
    const { familyId, hasFamilies } = useFamily();
    const { weekStart } = useWeek();
    const { user } = useAuth();

    const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pickerDayPlanId, setPickerDayPlanId] = useState<string | null>(null);
    const [showRepeat, setShowRepeat] = useState(false);
    const [repeatSource, setRepeatSource] = useState(() => shiftWeek(weekStart, -1));
    const [repeatMode, setRepeatMode] = useState<RepeatWeekExistingMode>('error');
    const [repeatBusy, setRepeatBusy] = useState(false);

    const currentMembership = user?.memberships?.find(m => m.familyId === familyId);
    const isParent = currentMembership?.role === 'PARENT';

    // Keep the default source week (previous week) in sync as the user navigates.
    useEffect(() => {
        setRepeatSource(shiftWeek(weekStart, -1));
        setShowRepeat(false);
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

    const handleRemove = async (suggestionId: string) => {
        if (!familyId) return;
        try {
            await removeSuggestion(familyId, suggestionId);
            await loadWeekPlan();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove suggestion');
        }
    };

    const handleRepeatWeek = async (e: FormEvent) => {
        e.preventDefault();
        if (!familyId) return;
        setRepeatBusy(true);
        setError('');
        try {
            const plan = await repeatWeek(familyId, weekStart, repeatSource, repeatMode);
            setWeekPlan(plan);
            setShowRepeat(false);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to repeat week. If the target week already has meals, choose skip or replace.',
            );
        } finally {
            setRepeatBusy(false);
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
            <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Week Plan</h1>
                <p className="text-gray-600 dark:text-gray-300 text-lg">{formatWeekRange(weekStart)}</p>
            </div>

            <div className="flex justify-center gap-3 mb-6">
                <Link
                    to="/grocery"
                    className="px-4 py-2 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/60 text-sm font-medium"
                >
                    🛒 Grocery List
                </Link>
                {isParent && (
                    <button
                        type="button"
                        onClick={() => setShowRepeat(v => !v)}
                        aria-expanded={showRepeat}
                        className="px-4 py-2 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 text-sm font-medium"
                    >
                        🔁 Repeat a previous week
                    </button>
                )}
            </div>

            {isParent && showRepeat && (
                <form
                    onSubmit={handleRepeatWeek}
                    aria-label="Repeat a previous week"
                    className="max-w-xl mx-auto mb-6 flex flex-col sm:flex-row items-stretch sm:items-end gap-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded"
                >
                    <label className="flex flex-col text-sm text-gray-700 dark:text-gray-300">
                        <span className="mb-1">Copy meals from week of</span>
                        <input
                            type="date"
                            value={repeatSource}
                            onChange={e => setRepeatSource(e.target.value)}
                            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        />
                    </label>
                    <label className="flex flex-col text-sm text-gray-700 dark:text-gray-300">
                        <span className="mb-1">If this week has meals</span>
                        <select
                            value={repeatMode}
                            onChange={e => setRepeatMode(e.target.value as RepeatWeekExistingMode)}
                            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        >
                            <option value="error">Stop (don't overwrite)</option>
                            <option value="skip">Skip days that already have meals</option>
                            <option value="replace">Replace this week's meals</option>
                        </select>
                    </label>
                    <button
                        type="submit"
                        disabled={repeatBusy}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                    >
                        {repeatBusy ? 'Copying…' : 'Copy meals'}
                    </button>
                </form>
            )}

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
                            onRemove={handleRemove}
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
        </div>
    );
}
