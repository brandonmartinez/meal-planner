import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { getCurrentWeekStart } from '../utils/date';

const STORAGE_KEY = 'meal-planner-selected-week';
const STORAGE_VERSION = 1;
const SELECTED_WEEK_RETENTION_MS = 2 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface WeekContextValue {
    weekStart: string;
    setWeekStart: (value: string) => void;
    goToToday: () => void;
}

const WeekContext = createContext<WeekContextValue | undefined>(undefined);

function isValidDateOnly(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false;

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function resolveStoredWeek(stored: string | null): string {
    const currentWeek = getCurrentWeekStart();
    if (!stored) return currentWeek;

    try {
        const value: unknown = JSON.parse(stored);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return currentWeek;
        }

        const selection = value as Record<string, unknown>;
        if (
            selection.version !== STORAGE_VERSION
            || !isValidDateOnly(selection.weekStart)
            || typeof selection.selectedAt !== 'number'
            || !Number.isInteger(selection.selectedAt)
            || selection.selectedAt < 0
        ) {
            return currentWeek;
        }

        const age = Date.now() - selection.selectedAt;
        return age >= 0 && age < SELECTED_WEEK_RETENTION_MS
            ? selection.weekStart
            : currentWeek;
    } catch {
        return currentWeek;
    }
}

function readStored(): string {
    return resolveStoredWeek(localStorage.getItem(STORAGE_KEY));
}

export function WeekProvider({ children }: { children: ReactNode }) {
    const [weekStart, setWeekStartState] = useState<string>(() => readStored());

    const setWeekStart = useCallback((value: string) => {
        const currentWeek = getCurrentWeekStart();
        if (!isValidDateOnly(value) || value === currentWeek) {
            localStorage.removeItem(STORAGE_KEY);
            setWeekStartState(currentWeek);
            return;
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: STORAGE_VERSION,
            weekStart: value,
            selectedAt: Date.now(),
        }));
        setWeekStartState(value);
    }, []);

    const goToToday = useCallback(() => {
        setWeekStart(getCurrentWeekStart());
    }, [setWeekStart]);

    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key === STORAGE_KEY) {
                setWeekStartState(resolveStoredWeek(e.newValue));
            }
        }
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    return (
        <WeekContext.Provider value={{ weekStart, setWeekStart, goToToday }}>
            {children}
        </WeekContext.Provider>
    );
}

export function useWeek(): WeekContextValue {
    const ctx = useContext(WeekContext);
    if (!ctx) {
        throw new Error('useWeek must be used within a WeekProvider');
    }
    return ctx;
}
