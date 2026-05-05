import { useTheme, type Theme } from '../context/ThemeContext';

const THEMES: { value: Theme; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'system', label: 'System', icon: '🖥️' },
];

export default function ThemeToggle({ variant = 'icon' }: { variant?: 'icon' | 'menu' }) {
    const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme();

    if (variant === 'menu') {
        return (
            <div className="flex items-center gap-1" role="group" aria-label="Theme">
                {THEMES.map(t => (
                    <button
                        key={t.value}
                        onClick={() => setTheme(t.value)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${theme === t.value
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                        aria-pressed={theme === t.value}
                        title={`${t.label} theme`}
                    >
                        <span aria-hidden="true">{t.icon}</span>
                        <span className="ml-1">{t.label}</span>
                    </button>
                ))}
            </div>
        );
    }

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
            <span aria-hidden="true" className="text-base">
                {resolvedTheme === 'dark' ? '☀️' : '🌙'}
            </span>
        </button>
    );
}
