import { useState, useId } from 'react';

interface StarRatingProps {
  value: number; // 0 = unset, 1–5
  onChange: (value: number) => void;
  label?: string;
}

export default function StarRating({ value, onChange, label = 'Rating' }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const groupId = useId();

  const handleKeyDown = (e: React.KeyboardEvent, starIndex: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(5, starIndex + 1);
      onChange(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const prev = Math.max(0, starIndex - 1);
      onChange(prev === starIndex ? 0 : prev);
    }
  };

  const highlight = hovered > 0 ? hovered : value;

  return (
    <div>
      <p id={groupId} className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
            tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
            onClick={() => onChange(value === star ? 0 : star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onKeyDown={e => handleKeyDown(e, star)}
            className={`text-2xl leading-none select-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-0.5 ${
              star <= highlight
                ? 'text-yellow-400 dark:text-yellow-300'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
