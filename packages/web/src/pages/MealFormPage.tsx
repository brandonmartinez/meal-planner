import { useState, useEffect, useId, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { getMeal, createMeal, updateMeal } from '../api/meals';
import { listCollections } from '../api/collections';
import { useFamily } from '../hooks/useFamily';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { MEAL_DIFFICULTIES } from '@meal-planner/shared';
import { useGroceryCategories } from '../hooks/useGroceryCategories';
import type { Difficulty } from '@meal-planner/shared';
import LoadingSpinner from '../components/LoadingSpinner';
import TokenField from '../components/TokenField';
import Combobox from '../components/Combobox';
import StarRating from '../components/StarRating';
import { MealImageField, type MealImageFieldHandle } from '../components/MealImageField';

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
  const { tags: tagOptions, categories: categoryOptions } = useTaxonomy(familyId);
  const { categories: groceryCategoryOptions } = useGroceryCategories(familyId);
  const navigate = useNavigate();
  const isEdit = Boolean(mealId);

  const nameId = useId();
  const descriptionId = useId();
  const prepTimeId = useId();
  const cookTimeId = useId();
  const servingsId = useId();
  const sourceUrlId = useId();
  const notesId = useId();
  const favoriteId = useId();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState('');
  const [cookTimeMinutes, setCookTimeMinutes] = useState('');
  const [servings, setServings] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [rating, setRating] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([emptyIngredient()]);
  const [tags, setTags] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [collectionSuggestions, setCollectionSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const imageFieldRef = useRef<MealImageFieldHandle>(null);

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
        setDifficulty(meal.difficulty ?? '');
        setPrepTimeMinutes(meal.prepTimeMinutes != null ? String(meal.prepTimeMinutes) : '');
        setCookTimeMinutes(meal.cookTimeMinutes != null ? String(meal.cookTimeMinutes) : '');
        setServings(meal.servings != null ? String(meal.servings) : '');
        setSourceUrl(meal.sourceUrl || '');
        setImageUrl(meal.imageUrl || '');
        setNotes(meal.notes || '');
        setFavorite(meal.favorite ?? false);
        setRating(meal.rating != null ? String(meal.rating) : '');
        setTags(meal.tags?.map(t => t.name) ?? []);
        setCategories(meal.categories?.map(c => c.name) ?? []);
        setCollections(meal.collections?.map(c => c.name) ?? []);
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

  // Collection name suggestions for the assignment field (#110). Fails soft.
  useEffect(() => {
    if (!familyId) return;
    listCollections(familyId)
      .then(cols => setCollectionSuggestions(cols.map(c => c.name)))
      .catch(() => setCollectionSuggestions([]));
  }, [familyId]);

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

    const toNum = (s: string): number | null => {
      const t = s.trim();
      if (t === '') return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      difficulty: difficulty === '' ? null : difficulty,
      prepTimeMinutes: toNum(prepTimeMinutes),
      cookTimeMinutes: toNum(cookTimeMinutes),
      servings: toNum(servings),
      sourceUrl: sourceUrl.trim() || null,
      imageUrl: imageUrl.trim() || null,
      notes: notes.trim() || null,
      favorite,
      rating: toNum(rating),
      ingredients: validIngredients.length ? validIngredients : undefined,
      // Always send explicit arrays so removals persist on update (server
      // treats the arrays as the full desired set; resolve-or-create by name).
      tags,
      categories,
      collections,
    };

    try {
      if (isEdit && mealId) {
        await updateMeal(familyId, mealId, data);
      } else {
        await createMeal(familyId, data);
      }
      imageFieldRef.current?.commitCleanup();
      navigate('/meals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meal');
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasFamilies) return <Navigate to="/family/create" replace />;

  if (loading) {
    return <LoadingSpinner message="Loading meal…" />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Meal' : 'New Meal'}</h1>

      {error && <div role="alert" className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-3 rounded mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor={nameId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
          />
        </div>

        <div>
          <label htmlFor={descriptionId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
          />
        </div>

        <div className="flex flex-wrap gap-6 items-end">
          <div>
            <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Difficulty</label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={e => setDifficulty(e.target.value as Difficulty | '')}
              className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
            >
              <option value="">None</option>
              {MEAL_DIFFICULTIES.map(level => (
                <option key={level} value={level}>
                  {level.charAt(0) + level.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="pb-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                id={favoriteId}
                type="checkbox"
                checked={favorite}
                onChange={e => setFavorite(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-blue-600 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Favorite</span>
            </label>
          </div>

          <StarRating
            value={Number(rating) || 0}
            onChange={n => setRating(n === 0 ? '' : String(n))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TokenField
            label="Tags"
            values={tags}
            onChange={setTags}
            suggestions={tagOptions.map(t => t.name)}
            placeholder="Add a tag…"
          />
          <TokenField
            label="Categories"
            values={categories}
            onChange={setCategories}
            suggestions={categoryOptions.map(c => c.name)}
            placeholder="Add a category…"
          />
        </div>

        <div>
          <Combobox
            label="📚 Collections"
            values={collections}
            onChange={setCollections}
            suggestions={collectionSuggestions}
            placeholder="Add to a collection…"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Group this recipe into browsable collections. New names create a collection.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor={prepTimeId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prep time (min)</label>
            <input
              id={prepTimeId}
              type="number"
              min={0}
              value={prepTimeMinutes}
              onChange={e => setPrepTimeMinutes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
            />
          </div>
          <div>
            <label htmlFor={cookTimeId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cook time (min)</label>
            <input
              id={cookTimeId}
              type="number"
              min={0}
              value={cookTimeMinutes}
              onChange={e => setCookTimeMinutes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
            />
          </div>
          <div>
            <label htmlFor={servingsId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Servings</label>
            <input
              id={servingsId}
              type="number"
              min={1}
              value={servings}
              onChange={e => setServings(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded"
            />
          </div>
        </div>

        <div>
          <label htmlFor={sourceUrlId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source URL</label>
          <input
            id={sourceUrlId}
            type="url"
            value={sourceUrl}
            onChange={e => setSourceUrl(e.target.value)}
            placeholder="https://example.com/recipe"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded"
          />
        </div>

        <div>
          <MealImageField
            ref={imageFieldRef}
            familyId={familyId}
            value={imageUrl}
            onChange={setImageUrl}
            mealId={mealId}
          />
        </div>

        <div>
          <label htmlFor={notesId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea
            id={notesId}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
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
            {ingredients.map((ing, index) => {
              const rowLabel = ing.name.trim() || `ingredient ${index + 1}`;
              return (
              <div key={index} className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  value={ing.name}
                  onChange={e => handleIngredientChange(index, 'name', e.target.value)}
                  placeholder="Name"
                  aria-label={`Ingredient ${index + 1} name`}
                  className="flex-1 min-w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded text-sm"
                />
                <input
                  type="text"
                  value={ing.quantity}
                  onChange={e => handleIngredientChange(index, 'quantity', e.target.value)}
                  placeholder="Qty"
                  aria-label={`Quantity for ${rowLabel}`}
                  className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded text-sm"
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={e => handleIngredientChange(index, 'unit', e.target.value)}
                  placeholder="Unit"
                  aria-label={`Unit for ${rowLabel}`}
                  className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded text-sm"
                />
                <select
                  value={ing.category}
                  onChange={e => handleIngredientChange(index, 'category', e.target.value)}
                  aria-label={`Category for ${rowLabel}`}
                  className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded text-sm"
                >
                  <option value="">Category</option>
                  {(ing.category &&
                  !groceryCategoryOptions.includes(ing.category)
                    ? [ing.category, ...groceryCategoryOptions]
                    : groceryCategoryOptions
                  ).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeIngredient(index)}
                  className="ml-auto text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-base px-3 py-1"
                  aria-label={`Remove ${rowLabel}`}
                >
                  ✕
                </button>
              </div>
              );
            })}
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
            onClick={() => {
              imageFieldRef.current?.abandon();
              navigate('/meals');
            }}
            className="w-full sm:w-auto px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
