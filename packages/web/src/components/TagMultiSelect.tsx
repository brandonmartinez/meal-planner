import { useId, useRef, useState } from 'react';

export interface TagMultiSelectProps {
  /** Accessible label for the input (also used as the listbox aria-label). */
  label: string;
  /** Currently selected tag names. */
  values: string[];
  /** Full list of available tag names to offer as options. */
  options: string[];
  /** Called with the new full array whenever selection changes. */
  onChange: (values: string[]) => void;
  /** Override the generated input id (for external labels). */
  id?: string;
  placeholder?: string;
}

/**
 * A searchable multi-select for tag filtering.
 * Select-only (no create-new). Renders selected values as removable pills
 * inline in the input area.
 */
export default function TagMultiSelect({
  label,
  values,
  options,
  onChange,
  id: idProp,
  placeholder = 'Filter by tag…',
}: TagMultiSelectProps) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter(
    opt =>
      !values.includes(opt) &&
      opt.toLowerCase().includes(draft.toLowerCase()),
  );

  const add = (name: string) => {
    onChange([...values, name]);
    setDraft('');
    inputRef.current?.focus();
  };

  const remove = (name: string) => {
    onChange(values.filter(v => v !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered.length > 0) add(filtered[0]);
        break;
      case 'Backspace':
        if (draft === '' && values.length > 0) remove(values[values.length - 1]);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      {/* Container styled to look like an input field */}
      <div
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 focus-within:ring-1 focus-within:ring-blue-500 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map(v => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-sm text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 shrink-0"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onPointerDown={e => {
                e.preventDefault();
                remove(v);
              }}
              className="text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100 leading-none"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open && (filtered.length > 0 || draft.length > 0)}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={draft}
          onChange={e => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          autoComplete="off"
          className="min-w-[8rem] flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
        />
      </div>

      {open && (filtered.length > 0 || draft.length > 0) && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${label} options`}
          className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 select-none">
              No options match
            </li>
          ) : (
            filtered.map(opt => (
              <li
                key={opt}
                role="option"
                aria-selected={false}
                onPointerDown={e => {
                  e.preventDefault();
                  add(opt);
                }}
                className="cursor-pointer px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {opt}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
