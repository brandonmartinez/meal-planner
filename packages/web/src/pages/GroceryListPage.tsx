import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useFamily } from '../hooks/useFamily';
import { useGroceryCategories } from '../hooks/useGroceryCategories';
import { useWeek } from '../context/WeekContext';
import { useRealtimeEvent } from '../context/SocketContext';
import { generateGroceryList, getGroceryListByWeek, toggleGroceryItem, addCustomItem, removeGroceryItem, removePastDays } from '../api/grocery';
import LoadingSpinner from '../components/LoadingSpinner';
import Select from '../components/Select';
import { RealtimeEvent, type GroceryList, type GroceryItem } from '@meal-planner/shared';

const CATEGORY_EMOJIS: Record<string, string> = {
    produce: '🥬',
    dairy: '🥛',
    meat: '🥩',
    seafood: '🐟',
    bakery: '🍞',
    frozen: '🧊',
    pantry: '🥫',
    beverages: '🥤',
    snacks: '🍿',
    condiments: '🧂',
    other: '📦',
};

// 0=Monday .. 6=Sunday, matching the API's sourceDays convention.
const DAY_ABBREV = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type GroceryGroupMode = 'category' | 'day' | 'meal' | 'alphabetical';

interface GroceryGroup {
    key: string;
    title: string;
    items: GroceryItem[];
}

const GROUP_MODE_LABELS: Record<GroceryGroupMode, string> = {
    category: 'Category',
    day: 'Day',
    meal: 'Meal',
    alphabetical: 'Alphabetical',
};

const STANDARD_BUTTON_CLASSES =
    'rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed';

function formatSourceDays(days: number[] | undefined): string {
    if (!days || days.length === 0) return '';
    return [...new Set(days)]
        .filter(d => d >= 0 && d <= 6)
        .sort((a, b) => a - b)
        .map(d => DAY_ABBREV[d])
        .join(', ');
}

function uniqueValidDays(days: number[] | undefined): number[] {
    if (!days || days.length === 0) return [];
    return [...new Set(days)]
        .filter(day => day >= 0 && day <= 6)
        .sort((a, b) => a - b);
}

function normalizedGroupKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function buildMealGroupEntries(item: GroceryItem): Array<{ key: string; title: string }> {
    const sourceNames = (item.sources ?? []).map(source => source.trim()).filter(Boolean);
    const sourceMealIds = (item.sourceMealIds ?? []).map(id => id.trim()).filter(Boolean);
    const maxSources = Math.max(sourceNames.length, sourceMealIds.length);

    if (maxSources === 0) return [{ key: 'meal:unassigned', title: 'Unassigned' }];

    const entries = Array.from({ length: maxSources }, (_, index) => {
        const name = sourceNames[index] || 'Unknown meal';
        const id = sourceMealIds[index];
        return {
            key: id ? `meal:${id}` : `meal-name:${normalizedGroupKey(name)}`,
            title: name,
        };
    });

    return entries.filter((entry, index, all) =>
        all.findIndex(candidate => candidate.key === entry.key) === index,
    );
}

function buildGroceryGroups(
    items: GroceryItem[],
    mode: GroceryGroupMode,
    groceryCategoryOptions: string[],
): GroceryGroup[] {
    if (mode === 'alphabetical') {
        return [{
            key: 'alphabetical:all',
            title: 'All Items',
            items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
        }];
    }

    if (mode === 'day') {
        const grouped = new Map<string, GroceryGroup>();
        for (const item of items) {
            const days = uniqueValidDays(item.sourceDays);
            const groupKeys = days.length > 0
                ? days.map(day => ({ key: `day:${day}`, title: DAY_ABBREV[day] }))
                : [{ key: 'day:unassigned', title: 'Unassigned' }];

            for (const group of groupKeys) {
                if (!grouped.has(group.key)) grouped.set(group.key, { ...group, items: [] });
                grouped.get(group.key)!.items.push(item);
            }
        }

        return [
            ...DAY_ABBREV.map((_, day) => grouped.get(`day:${day}`)).filter((group): group is GroceryGroup => !!group),
            ...(grouped.has('day:unassigned') ? [grouped.get('day:unassigned')!] : []),
        ];
    }

    if (mode === 'meal') {
        const grouped = new Map<string, GroceryGroup>();
        for (const item of items) {
            for (const group of buildMealGroupEntries(item)) {
                if (!grouped.has(group.key)) grouped.set(group.key, { ...group, items: [] });
                grouped.get(group.key)!.items.push(item);
            }
        }

        return [...grouped.values()].sort((a, b) => {
            if (a.key === 'meal:unassigned') return 1;
            if (b.key === 'meal:unassigned') return -1;
            return a.title.localeCompare(b.title);
        });
    }

    const grouped = new Map<string, GroceryItem[]>();
    for (const item of items) {
        const cat = item.category || 'other';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(item);
    }

    return [...grouped.keys()]
        .sort((a, b) => {
            const idxA = groceryCategoryOptions.indexOf(a);
            const idxB = groceryCategoryOptions.indexOf(b);
            return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        })
        .map(category => ({
            key: `category:${category}`,
            title: `${CATEGORY_EMOJIS[category] || '📦'} ${category}`,
            items: grouped.get(category)!,
        }));
}

export default function GroceryListPage() {
    const { familyId, hasFamilies } = useFamily();
    const { categories: groceryCategoryOptions } = useGroceryCategories(familyId);
    const { weekStart } = useWeek();
    const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newItemName, setNewItemName] = useState('');
    const [newItemQuantity, setNewItemQuantity] = useState('');
    const [newItemUnit, setNewItemUnit] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('other');
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');
    const [groupMode, setGroupMode] = useState<GroceryGroupMode>('category');
    // Pantry Staples section is collapsible (issue #205); collapsed by default
    // so the active shopping list stays front-and-centre.
    const [staplesCollapsed, setStaplesCollapsed] = useState(true);

    const loadList = useCallback(async () => {
        if (!familyId || !weekStart) return;
        setLoading(true);
        setError('');
        try {
            const list = await getGroceryListByWeek(familyId, weekStart);
            setGroceryList(list);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load grocery list');
        } finally {
            setLoading(false);
        }
    }, [familyId, weekStart]);

    useEffect(() => { loadList(); }, [loadList]);

    // Live-update when another family member changes this family's grocery list.
    useRealtimeEvent(RealtimeEvent.GroceryChanged, (payload) => {
        if (payload.familyId === familyId) loadList();
    });

    const handleGenerate = async (range?: { startDate?: string; endDate?: string }) => {
        if (!familyId || !weekStart) return;
        setError('');
        try {
            const list = await generateGroceryList(familyId, weekStart, range);
            setGroceryList(list);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate grocery list');
        }
    };

    const handleRegenerate = async () => {
        if (!confirm('Regenerate grocery list from current approved meals? This will replace the existing list.')) return;
        await handleGenerate();
    };

    const handleGenerateRange = async () => {
        if (!rangeStart && !rangeEnd) return;
        await handleGenerate({
            startDate: rangeStart || undefined,
            endDate: rangeEnd || undefined,
        });
    };

    const handleRemovePastDays = async () => {
        if (!familyId || !groceryList) return;
        if (!confirm('Remove items whose days are entirely in the past? Checked items are kept.')) return;
        setError('');
        try {
            const list = await removePastDays(familyId, groceryList.id);
            setGroceryList(list);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove past days');
        }
    };

    const handleToggle = async (item: GroceryItem) => {
        if (!familyId || !groceryList) return;
        try {
            await toggleGroceryItem(familyId, groceryList.id, item.id, !item.checked);
            setGroceryList(prev => prev ? {
                ...prev,
                items: prev.items?.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i),
            } : null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to toggle item');
        }
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!familyId || !groceryList || !newItemName.trim()) return;
        try {
            const item = await addCustomItem(familyId, groceryList.id, {
                name: newItemName.trim(),
                quantity: newItemQuantity.trim() || undefined,
                unit: newItemUnit.trim() || undefined,
                category: newItemCategory || undefined,
            });
            setGroceryList(prev => prev ? { ...prev, items: [...(prev.items || []), item] } : null);
            setNewItemName('');
            setNewItemQuantity('');
            setNewItemUnit('');
            setNewItemCategory('other');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add item');
        }
    };

    const handleRemove = async (itemId: string) => {
        if (!familyId || !groceryList) return;
        try {
            await removeGroceryItem(familyId, groceryList.id, itemId);
            setGroceryList(prev => prev ? {
                ...prev,
                items: prev.items?.filter(i => i.id !== itemId),
            } : null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove item');
        }
    };

    const items = groceryList?.items || [];
    const checkedCount = items.filter(i => i.checked).length;

    // Pantry staples (issue #205) are auto-separated into their own section
    // instead of their aisle category. Matching is derived server-side on the
    // `isPantryStaple` flag (normalized name match against the family's managed
    // staples), so the client just partitions on that flag here.
    const stapleItems = items.filter(i => i.isPantryStaple);
    const nonStapleItems = items.filter(i => !i.isPantryStaple);
    const groupedItems = buildGroceryGroups(
        groupMode === 'category' ? nonStapleItems : items,
        groupMode,
        groceryCategoryOptions,
    );

    if (!hasFamilies) return <Navigate to="/family/create" replace />;

    if (loading) {
        return <LoadingSpinner message="Loading grocery list…" />;
    }

    const renderItem = (item: GroceryItem, itemKey: string) => {
        const sourceDays = formatSourceDays(item.sourceDays);
        const quantity = item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : '';

        return (
        <li key={itemKey} className="flex items-center gap-3 py-2 px-3 bg-white dark:bg-gray-800 rounded shadow-sm border border-transparent dark:border-gray-700">
            <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleToggle(item)}
                aria-label={`${item.checked ? 'Uncheck' : 'Check'} ${item.name}`}
                className="h-5 w-5 text-green-600 rounded"
            />
            <span className={`flex-1 min-w-0 ${item.checked ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
                {item.name}
                {sourceDays && (
                    <span
                        className="text-gray-400 dark:text-gray-500 ml-2 text-xs font-normal"
                        title={`From ${sourceDays}`}
                    >
                        · {sourceDays}
                    </span>
                )}
            </span>
            {item.sources && item.sources.length > 0 && (
                <span
                    className="hidden sm:block max-w-[40%] truncate text-xs text-gray-400 dark:text-gray-500 italic"
                    title={item.sources.join(', ')}
                >
                    {item.sources.join(', ')}
                </span>
            )}
            {quantity && (
                <span className="ml-auto min-w-[4rem] shrink-0 pr-2 text-right text-sm text-gray-500 dark:text-gray-400">
                    {quantity}
                </span>
            )}
            <button
                onClick={() => handleRemove(item.id)}
                aria-label={`Remove ${item.name}`}
                className="shrink-0 px-1 text-red-400 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-lg font-bold"
            >
                ×
            </button>
        </li>
        );
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🛒 Grocery List</h1>
                <Link
                    to="/week"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
                >
                    ← Back to Week Plan
                </Link>
            </div>

            {error && <div role="alert" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

            {!groceryList ? (
                <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No grocery list for this week yet.</p>
                    <button
                        onClick={() => handleGenerate()}
                        className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                    >
                        Generate Grocery List
                    </button>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Creates a list from approved meals for this week</p>
                    <div className="mt-6 flex flex-col items-center gap-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Or generate for a specific date range (short-order shopping):</p>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                aria-label="Range start date"
                                value={rangeStart}
                                onChange={e => setRangeStart(e.target.value)}
                                className="px-2 py-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-700"
                            />
                            <span className="text-gray-400">–</span>
                            <input
                                type="date"
                                aria-label="Range end date"
                                value={rangeEnd}
                                onChange={e => setRangeEnd(e.target.value)}
                                className="px-2 py-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-700"
                            />
                            <button
                                onClick={handleGenerateRange}
                                disabled={!rangeStart && !rangeEnd}
                                className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50"
                            >
                                Generate Range
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-6 space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                Group by
                                <Select
                                    value={groupMode}
                                    onChange={e => setGroupMode(e.target.value as GroceryGroupMode)}
                                    aria-label="Group grocery items by"
                                    selectSize="sm"
                                    className="mt-1 w-full sm:w-44"
                                >
                                    {Object.entries(GROUP_MODE_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </Select>
                            </label>
                            <div
                                role="group"
                                aria-label="Grocery list actions"
                                className="grid grid-cols-2 gap-2 sm:flex sm:items-center"
                            >
                                <button
                                    onClick={handleRemovePastDays}
                                    className={`${STANDARD_BUTTON_CLASSES} w-full sm:w-auto`}
                                >
                                    Remove Past Days
                                </button>
                                <button
                                    onClick={handleRegenerate}
                                    className={`${STANDARD_BUTTON_CLASSES} w-full sm:w-auto`}
                                >
                                    Regenerate
                                </button>
                            </div>
                        </div>

                        <div
                            className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"
                            role="progressbar"
                            aria-label="Grocery completion"
                            aria-valuemin={0}
                            aria-valuemax={items.length}
                            aria-valuenow={checkedCount}
                        >
                            <div
                                className="bg-green-500 h-2 rounded-full transition-all"
                                style={{ width: items.length > 0 ? `${(checkedCount / items.length) * 100}%` : '0%' }}
                            />
                        </div>
                        <p className="text-center text-sm text-gray-600 dark:text-gray-300">
                            {checkedCount} of {items.length} items checked
                        </p>
                    </div>

                    {/* Items grouped by selected mode */}
                    {groupedItems.map(group => (
                        <div key={group.key} className="mb-6">
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2 capitalize">
                                {group.title}
                            </h2>
                            <ul className="space-y-1">
                                {group.items.map(item => renderItem(item, `${group.key}-${item.id}`))}
                            </ul>
                        </div>
                    ))}

                    {/* Pantry Staples — auto-separated stock-kitchen items (issue #205) */}
                    {groupMode === 'category' && stapleItems.length > 0 && (
                        <div className="mb-6">
                            <button
                                type="button"
                                onClick={() => setStaplesCollapsed(c => !c)}
                                aria-expanded={!staplesCollapsed}
                                className="w-full flex items-center justify-between text-left text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2"
                            >
                                <span>🧂 Pantry Staples <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({stapleItems.length})</span></span>
                                <span className="text-sm text-gray-500 dark:text-gray-400">{staplesCollapsed ? '▸ Show' : '▾ Hide'}</span>
                            </button>
                            {!staplesCollapsed && (
                                <ul className="space-y-1">
                                    {stapleItems.map(item => renderItem(item, `pantry-staples-${item.id}`))}
                                </ul>
                            )}
                        </div>
                    )}

                    {items.length === 0 && (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">No items in the list. Add some below or regenerate from approved meals.</p>
                    )}

                    {/* Add custom item */}
                    <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                        <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-3">Add Custom Item</h3>
                        <form onSubmit={handleAddItem} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_6rem] gap-2">
                                <input
                                    type="text"
                                    value={newItemName}
                                    onChange={e => setNewItemName(e.target.value)}
                                    placeholder="Item name *"
                                    aria-label="New item name"
                                    autoComplete="off"
                                    data-1p-ignore
                                    data-lpignore="true"
                                    data-form-type="other"
                                    className="w-full min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                                <input
                                    type="text"
                                    value={newItemQuantity}
                                    onChange={e => setNewItemQuantity(e.target.value)}
                                    placeholder="Qty"
                                    aria-label="New item quantity"
                                    className="w-full min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <input
                                    type="text"
                                    value={newItemUnit}
                                    onChange={e => setNewItemUnit(e.target.value)}
                                    placeholder="Unit"
                                    aria-label="New item unit"
                                    className="w-full min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                <Select
                                    value={newItemCategory}
                                    onChange={e => setNewItemCategory(e.target.value)}
                                    aria-label="New item category"
                                    className="w-full sm:w-auto"
                                >
                                    {groceryCategoryOptions.map(cat => (
                                        <option key={cat} value={cat}>{CATEGORY_EMOJIS[cat] || '📦'} {cat}</option>
                                    ))}
                                </Select>
                                <button
                                    type="submit"
                                    className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                                >
                                    Add
                                </button>
                            </div>
                        </form>
                    </div>
                </>
            )}
        </div>
    );
}
