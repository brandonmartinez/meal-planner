import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createWeekPlan, addSuggestion, approveSuggestion, removeSuggestion } from '../api/weekPlan';
import DayCard from '../components/DayCard';
import MealPicker from '../components/MealPicker';
import type { WeekPlan, DayPlan } from '@meal-planner/shared';

function getSundayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

export default function WeekPlanPage() {
  const { familyId, weekStart: weekStartParam } = useParams<{ familyId: string; weekStart?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const defaultWeekStart = toDateString(getSundayOfWeek(new Date()));
  const weekStart = weekStartParam || defaultWeekStart;

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

  const navigateWeek = (offset: number) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + offset * 7);
    navigate(`/week/${familyId}/${toDateString(d)}`);
  };

  const goToday = () => {
    navigate(`/week/${familyId}/${defaultWeekStart}`);
  };

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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Week Plan</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeek(-1)}
            className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          >
            ← Prev
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
          >
            Today
          </button>
          <button
            onClick={() => navigateWeek(1)}
            className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          >
            Next →
          </button>
        </div>
      </div>

      <p className="text-gray-600 text-center mb-6 text-lg">{formatDateRange(weekStart)}</p>

      <div className="flex justify-center mb-6">
        <Link
          to={`/grocery/${familyId}/${weekStart}`}
          className="px-4 py-2 bg-green-100 text-green-800 rounded hover:bg-green-200 text-sm font-medium"
        >
          🛒 Grocery List
        </Link>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4">{error}</div>}

      {/* Day grid */}
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

      {/* Meal Picker Modal */}
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
