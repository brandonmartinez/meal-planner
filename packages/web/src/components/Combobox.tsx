import { useEffect, useId, useRef, useState } from 'react';

interface ComboboxProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Existing names to offer as filtered suggestions. Create-on-assign is
   *  always available: any typed name not in this list is created on save. */
  suggestions?: string[];
  placeholder?: string;
  /** Override the generated input id (e.g. for external labels). */
  id?: string;
}

/**
 * A create-on-assign multi-value combobox: a text input with a styled, dark-mode-
 * aware, keyboard-accessible dropdown of filtered suggestions, plus removable
 * pills for current selections. Adding a name that does not appear in `suggestions`
 * is intentional — the backend resolves-or-creates the collection on save.
 *
 * Props mirror TokenField so it is a drop-in replacement for any field that was
 * using that component:
 *   values       — currently selected strings
 *   onChange     — called with the full new array on every change
 *   suggestions  — names to offer as filtered options
 *   label        — visible <label> text (also the accessible name for the input)
 *   placeholder  — hint text inside the input
 *
 * CSP-safe: uses React event handlers only, no inline scripts or eval.
 */
export default function Combobox({
  label,
  values,
  onChange,
  suggestions = [],
  placeholder,
  id,
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Suggestions that are not already selected, filtered to the current draft.
  const filtered = suggestions.filter(
    s =>
      !values.some(v => v.toLowerCase() === s.toLowerCase()) &&
      s.toLowerCase().includes(draft.toLowerCase()),
  );

  const addToken = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    // Deduplicate case-insensitively, preserving the casing already in the list.
    const alreadySelected = values.some(v => v.toLowerCase() === name.toLowerCase());
    if (!alreadySelected) onChange([...values, name]);
    setDraft('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const removeToken = (name: string) => {
    onChange(values.filter(v => v !== name));
  };

  // Close the popover when the user clicks/taps outside the component.
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraft(val);
    setActiveIndex(-1);
    // Open when the user is typing; keep open even if there are no suggestions
    // so the user can still press Enter to create a new name.
    setOpen(val.length > 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          addToken(filtered[activeIndex]);
        } else {
          addToken(draft);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        setOpen(true);
        setActiveIndex(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const handleFocus = () => {
    if (draft.length > 0) setOpen(true);
  };

  return (
    <div ref={containerRef}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {label}
      </label>

      {values.length > 0 && (
        <ul
          className="mb-2 flex flex-wrap gap-1.5 p-0 list-none"
          aria-label={`Selected ${label}`}
        >
          {values.map(name => (
            <li key={name} className="flex items-center">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-sm text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                {name}
                <button
                  type="button"
                  onClick={() => removeToken(name)}
                  aria-label={`Remove ${name}`}
                  className="text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100 leading-none"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 && open
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            value={draft}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded"
          />

          {open && filtered.length > 0 && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={`${label} suggestions`}
              /* z-50 ensures the popover floats above the fields that follow */
              className="absolute z-50 left-0 right-0 mt-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg max-h-48 overflow-y-auto"
            >
              {filtered.map((option, index) => (
                <li
                  key={option}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  // Use onPointerDown + preventDefault so the input does not blur
                  // before we can register the selection.
                  onPointerDown={e => {
                    e.preventDefault();
                    addToken(option);
                  }}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    index === activeIndex
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {option}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => addToken(draft)}
          className="shrink-0 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
        >
          Add
        </button>
      </div>
    </div>
  );
}
