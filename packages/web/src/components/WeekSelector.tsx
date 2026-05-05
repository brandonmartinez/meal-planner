import { useWeek } from '../context/WeekContext';
import { formatWeekRange, shiftWeek, getCurrentWeekStart } from '../utils/date';

interface Props {
    variant?: 'desktop' | 'mobile';
}

export default function WeekSelector({ variant = 'desktop' }: Props) {
    const { weekStart, setWeekStart, goToToday } = useWeek();
    const isCurrent = weekStart === getCurrentWeekStart();

    const baseBtn =
        'inline-flex items-center justify-center rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors';

    if (variant === 'mobile') {
        return (
            <div className="flex items-center justify-between gap-2 w-full">
                <button
                    onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
                    className={`${baseBtn} px-2 py-1 text-sm`}
                    aria-label="Previous week"
                >
                    ←
                </button>
                <button
                    onClick={goToToday}
                    disabled={isCurrent}
                    className="flex-1 text-center text-sm font-medium text-gray-800 dark:text-gray-100 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:cursor-default"
                    title="Jump to current week"
                >
                    {formatWeekRange(weekStart)}
                    {!isCurrent && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">Today</span>}
                </button>
                <button
                    onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
                    className={`${baseBtn} px-2 py-1 text-sm`}
                    aria-label="Next week"
                >
                    →
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1" aria-label="Week selector">
            <button
                onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
                className={`${baseBtn} w-8 h-8 text-base`}
                aria-label="Previous week"
                title="Previous week"
            >
                ←
            </button>
            <button
                onClick={goToToday}
                disabled={isCurrent}
                className="text-sm font-medium text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:cursor-default min-w-[10rem] text-center"
                title={isCurrent ? 'Current week' : 'Jump to current week'}
            >
                {formatWeekRange(weekStart)}
                {!isCurrent && <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">Today</span>}
            </button>
            <button
                onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
                className={`${baseBtn} w-8 h-8 text-base`}
                aria-label="Next week"
                title="Next week"
            >
                →
            </button>
        </div>
    );
}
