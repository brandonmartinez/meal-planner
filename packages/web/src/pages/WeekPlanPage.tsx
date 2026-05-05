import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';
import { useWeek } from '../context/WeekContext';
import { createWeekPlan, addSuggestion, approveSuggestion, removeSuggestion } from '../api/weekPlan';
import { formatWeekRange } from '../utils/date';
import DayCard from '../components/DayCard';
import MealPicker from '../components/MealPicker';
import type { WeekPlan, DayPlan } from '@meal-planner/shared';

export default function WeekPlanPage() {
    const { familyId, hasFamilies } = useFamily();
    const { weekStart } = useWeek();
    const { user } = useAuth();

    const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pickerDayPlanId, setPickerDayPlanId] = useState<string | null>(null);

    const currentMembership = user?.memberships?.find(m => m.familyId === familyId);
    const isParent = currentMembership?.role === 'PARENT';

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

    if (!hasFamilies) return <Navigate to="/family/create" replace />;

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Week Plan</h1>
                <p className="text-gray-600 dark:text-gray-300 text-lg">{formatWeekRange(weekStart)}</p>
            </div>

            <div className="flex justify-center mb-6">
                <Link
                    to="/grocery"
                    className="px-4 py-2 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/60 text-sm font-medium"
                >
                    🛒 Grocery List
                </Link>
            </div>

            {error && <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
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
