import { useId, useState } from 'react';

interface TokenFieldProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Existing names offered as `<datalist>` suggestions (create-on-assign: the
   *  user may also type a brand-new name). */
  suggestions?: string[];
  placeholder?: string;
  /** Accessible id for the text input; auto-generated when omitted. */
  id?: string;
}

/**
 * A create-on-assign multi-value input: a text box backed by a native
 * `<datalist>` of existing names, plus removable pills for the current
 * selections. Adding a name that does not exist yet is intentional — the
 * backend resolves-or-creates it within the family on save (#107).
 *
 * CSP-safe: uses React event handlers only, no inline scripts.
 */
export default function TokenField({
  label,
  values,
  onChange,
  suggestions = [],
  placeholder,
  id,
}: TokenFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;
  const [draft, setDraft] = useState('');

  const addTokens = (raw: string) => {
    // Split on commas only (spaces are preserved — multi-word tokens stay intact).
    // Trim each segment and drop blanks.
    const segments = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (segments.length === 0) { setDraft(''); return; }

    // Dedupe each segment case-insensitively against both existing values and
    // previously-accumulated segments in this batch.
    let next = [...values];
    for (const name of segments) {
      const exists = next.some(v => v.toLowerCase() === name.toLowerCase());
      if (!exists) next = [...next, name];
    }
    if (next.length !== values.length) onChange(next);
    setDraft('');
  };

  const removeToken = (name: string) => {
    onChange(values.filter(v => v !== name));
  };

  // Suggestions not already selected — avoids offering a name that's a pill.
  const available = suggestions.filter(
    s => !values.some(v => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {label}
      </label>

      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          list={listId}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              // Never submit the surrounding form; add the token instead.
              e.preventDefault();
              addTokens(draft);
            }
          }}
          onBlur={() => addTokens(draft)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded"
        />
        <datalist id={listId}>
          {available.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => addTokens(draft)}
          className="shrink-0 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          Add
        </button>
      </div>

      {values.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Selected ${label.toLowerCase()}`}>
          {values.map(name => (
            <li key={name}>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-sm text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                {name}
                <button
                  type="button"
                  onClick={() => removeToken(name)}
                  aria-label={`Remove ${name}`}
                  className="text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
