import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { generateGroceryList, getGroceryListByWeek, toggleGroceryItem, addCustomItem, removeGroceryItem } from '../api/grocery';
import { INGREDIENT_CATEGORIES } from '@meal-planner/shared';
import type { GroceryList, GroceryItem } from '@meal-planner/shared';

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

function formatDateRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr = end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

export default function GroceryListPage() {
  const { familyId, weekStart } = useParams<{ familyId: string; weekStart: string }>();
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('other');

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

  const handleGenerate = async () => {
    if (!familyId || !weekStart) return;
    setError('');
    try {
      const list = await generateGroceryList(familyId, weekStart);
      setGroceryList(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate grocery list');
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('Regenerate grocery list from current approved meals? This will replace the existing list.')) return;
    await handleGenerate();
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

  // Group items by category
  const grouped = new Map<string, GroceryItem[]>();
  for (const item of items) {
    const cat = item.category || 'other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  // Sort categories by INGREDIENT_CATEGORIES order
  const sortedCategories = [...grouped.keys()].sort((a, b) => {
    const idxA = INGREDIENT_CATEGORIES.indexOf(a as typeof INGREDIENT_CATEGORIES[number]);
    const idxB = INGREDIENT_CATEGORIES.indexOf(b as typeof INGREDIENT_CATEGORIES[number]);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🛒 Grocery List</h1>
        <Link
          to={`/week/${familyId}/${weekStart}`}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
        >
          ← Back to Week Plan
        </Link>
      </div>

      <p className="text-gray-600 dark:text-gray-300 mb-6">{weekStart && formatDateRange(weekStart)}</p>

      {error && <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

      {!groceryList ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No grocery list for this week yet.</p>
          <button
            onClick={handleGenerate}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            Generate Grocery List
          </button>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Creates a list from approved meals for this week</p>
        </div>
      ) : (
        <>
          {/* Progress */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {checkedCount} of {items.length} items checked
            </span>
            <button
              onClick={handleRegenerate}
              className="text-sm px-3 py-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/60"
            >
              Regenerate
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-6">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: items.length > 0 ? `${(checkedCount / items.length) * 100}%` : '0%' }}
            />
          </div>

          {/* Items grouped by category */}
          {sortedCategories.map(category => (
            <div key={category} className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2 capitalize">
                {CATEGORY_EMOJIS[category] || '📦'} {category}
              </h2>
              <ul className="space-y-1">
                {grouped.get(category)!.map(item => (
                  <li key={item.id} className="flex items-center gap-3 py-2 px-3 bg-white dark:bg-gray-800 rounded shadow-sm border border-transparent dark:border-gray-700">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggle(item)}
                      className="h-5 w-5 text-green-600 rounded"
                    />
                    <span className={`flex-1 ${item.checked ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
                      {item.name}
                      {item.quantity && (
                        <span className="text-gray-500 dark:text-gray-400 ml-2 text-sm">
                          {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="text-red-400 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-lg font-bold"
                      title="Remove item"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {items.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">No items in the list. Add some below or regenerate from approved meals.</p>
          )}

          {/* Add custom item */}
          <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-3">Add Custom Item</h3>
            <form onSubmit={handleAddItem} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="Item name *"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <input
                  type="text"
                  value={newItemQuantity}
                  onChange={e => setNewItemQuantity(e.target.value)}
                  placeholder="Qty"
                  className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  value={newItemUnit}
                  onChange={e => setNewItemUnit(e.target.value)}
                  placeholder="Unit"
                  className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={newItemCategory}
                  onChange={e => setNewItemCategory(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {INGREDIENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{CATEGORY_EMOJIS[cat]} {cat}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
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
