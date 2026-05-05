import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { getCurrentWeekStart } from '../utils/date';

const STORAGE_KEY = 'meal-planner-selected-week';

interface WeekContextValue {
    weekStart: string;
    setWeekStart: (value: string) => void;
    goToToday: () => void;
}

const WeekContext = createContext<WeekContextValue | undefined>(undefined);

function readStored(): string {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
    return getCurrentWeekStart();
}

export function WeekProvider({ children }: { children: ReactNode }) {
    const [weekStart, setWeekStartState] = useState<string>(() => readStored());

    const setWeekStart = useCallback((value: string) => {
        localStorage.setItem(STORAGE_KEY, value);
        setWeekStartState(value);
    }, []);

    const goToToday = useCallback(() => {
        setWeekStart(getCurrentWeekStart());
    }, [setWeekStart]);

    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key === STORAGE_KEY && e.newValue) {
                setWeekStartState(e.newValue);
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
