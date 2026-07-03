import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  listTemplates,
  deleteTemplate,
  templateEntryCount,
  templateDayCount,
  type PlanningTemplate,
} from '../api/templates';
import { useAuth } from '../context/AuthContext';
import { useFamily } from '../hooks/useFamily';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import ErrorMessage from '../components/ErrorMessage';
import TemplateFormModal from '../components/TemplateFormModal';

/**
 * Browse and manage planning templates (#117). A template is a reusable "week
 * blueprint" — a named set of relative day→meal entries you can apply to any
 * week from the planner. Deliberately distinct from the collections shelf
 * (📚 book motif) and from tag/category chips: this is a dedicated page with a
 * 🗓️ calendar motif, list rows summarizing each blueprint, and full CRUD
 * (create/edit for members, delete gated to parents like the backend). Applying
 * a template happens on the week planner, not here.
 */
export default function TemplatesPage() {
  const { familyId, hasFamilies } = useFamily();
  const { user } = useAuth();

  const [templates, setTemplates] = useState<PlanningTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PlanningTemplate | null>(null);

  const currentMembership = user?.memberships?.find(m => m.familyId === familyId);
  const isParent = currentMembership?.role === 'PARENT';

  const loadTemplates = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const data = await listTemplates(familyId);
      setTemplates(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleDelete = async (template: PlanningTemplate) => {
    if (!familyId) return;
    if (
      !confirm(
        `Delete the "${template.name}" template? Weeks you already planned from it are not affected.`,
      )
    ) {
      return;
    }
    try {
      await deleteTemplate(familyId, template.id);
      setTemplates(prev => prev.filter(t => t.id !== template.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleSaved = (saved: PlanningTemplate) => {
    setShowCreate(false);
    setEditing(null);
    setTemplates(prev => {
      const exists = prev.some(t => t.id === saved.id);
      const next = exists
        ? prev.map(t => (t.id === saved.id ? saved : t))
        : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  if (!hasFamilies) return <Navigate to="/family/create" replace />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-gray-900 dark:text-gray-100">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            🗓️
          </span>
          <h1 className="text-2xl font-bold">Templates</h1>
        </div>
        {isParent && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New template
          </button>
        )}
      </div>

      <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        Save reusable week blueprints — like “Busy Weeknights” or “Sunday Reset” —
        then apply one to any week from the planner. Applying adds suggestions for
        a parent to approve; it never overwrites a planned week without asking.
      </p>

      {error && (
        <div className="mb-4">
          <ErrorMessage message={error} onRetry={loadTemplates} />
        </div>
      )}

      {loading ? (
        <LoadingSpinner message="Loading templates…" />
      ) : templates.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="No templates yet"
          description={
            isParent
              ? 'Create your first template to save a reusable week blueprint.'
              : 'A parent can create templates to save reusable week blueprints.'
          }
          action={
            isParent ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                New template
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {templates.map(template => {
            const meals = templateEntryCount(template);
            const days = templateDayCount(template);
            return (
              <li
                key={template.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              >
                <div className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 text-xl" aria-hidden="true">
                    🗓️
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{template.name}</h2>
                    {template.description && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {template.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {meals} {meals === 1 ? 'meal' : 'meals'} across {days}{' '}
                      {days === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                  {isParent && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(template)}
                        className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(template)}
                        className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showCreate && familyId && (
        <TemplateFormModal
          familyId={familyId}
          onClose={() => setShowCreate(false)}
          onSaved={handleSaved}
        />
      )}
      {editing && familyId && (
        <TemplateFormModal
          familyId={familyId}
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
