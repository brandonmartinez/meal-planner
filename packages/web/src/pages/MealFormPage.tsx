import { useState, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { getMeal, createMeal, updateMeal } from '../api/meals';
import { useFamily } from '../hooks/useFamily';
import { INGREDIENT_CATEGORIES } from '@meal-planner/shared';

interface IngredientRow {
  name: string;
  quantity: string;
  unit: string;
  category: string;
}

const emptyIngredient = (): IngredientRow => ({ name: '', quantity: '', unit: '', category: '' });

export default function MealFormPage() {
  const { mealId } = useParams<{ mealId?: string }>();
  const { familyId, hasFamilies } = useFamily();
  const navigate = useNavigate();
  const isEdit = Boolean(mealId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([emptyIngredient()]);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit || !familyId || !mealId) return;
    getMeal(familyId, mealId)
      .then(meal => {
        if (meal.placeholderKind !== null) {
          // Placeholder meals are managed via shared metadata and cannot be edited.
          navigate('/meals', { replace: true });
          return;
        }
        setName(meal.name);
        setDescription(meal.description || '');
        if (meal.ingredients?.length) {
          setIngredients(
            meal.ingredients.map(i => ({
              name: i.name,
              quantity: i.quantity || '',
              unit: i.unit || '',
              category: i.category || '',
            }))
          );
        }
      })
      .catch(() => setError('Failed to load meal'))
      .finally(() => setLoading(false));
  }, [isEdit, familyId, mealId, navigate]);

  const handleIngredientChange = (index: number, field: keyof IngredientRow, value: string) => {
    setIngredients(prev => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)));
  };

  const addIngredient = () => setIngredients(prev => [...prev, emptyIngredient()]);

  const removeIngredient = (index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyId || !name.trim()) return;
    setSubmitting(true);
    setError('');

    const validIngredients = ingredients
      .filter(i => i.name.trim())
      .map(i => ({
        name: i.name.trim(),
        quantity: i.quantity || undefined,
        unit: i.unit || undefined,
        category: i.category || undefined,
      }));

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      ingredients: validIngredients.length ? validIngredients : undefined,
    };

    try {
      if (isEdit && mealId) {
        await updateMeal(familyId, mealId, data);
      } else {
        await createMeal(familyId, data);
      }
      navigate('/meals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meal');
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasFamilies) return <Navigate to="/family/create" replace />;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Meal' : 'New Meal'}</h1>

      {error && <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ingredients</label>
            <button
              type="button"
              onClick={addIngredient}
              className="text-sm px-3 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/60"
            >
              + Add Ingredient
            </button>
          </div>

          <div className="space-y-3">
            {ingredients.map((ing, index) => (
              <div key={index} className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  value={ing.name}
                  onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                  placeholder="Name"
                  className="flex-1 min-w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded text-sm"
                />
                <input
                  type="text"
                  value={ing.quantity}
                  onChange={e => handleIngredientChange(index, 'quantity', e.target.value)}
                  placeholder="Qty"
                  className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded text-sm"
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                  placeholder="Unit"
                  className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded text-sm"
                />
                <select
                  value={ing.category}
                  onChange={e => handleIngredientChange(index, 'category', e.target.value)}
                  className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded text-sm"
                >
                  <option value="">Category</option>
                  {INGREDIENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeIngredient(index)}
                  className="ml-auto text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-base px-3 py-1"
                  aria-label="Remove ingredient"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : isEdit ? 'Update Meal' : 'Create Meal'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/meals')}
            className="w-full sm:w-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
