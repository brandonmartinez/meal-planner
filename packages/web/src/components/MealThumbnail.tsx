import { useEffect, useState } from 'react';

interface MealThumbnailProps {
  /** External image URL. When null/undefined/empty, nothing renders. */
  src?: string | null;
  /** Accessible label for the image. */
  alt: string;
  /** Classes controlling size/shape of the rendered <img>. */
  className?: string;
}

/**
 * Renders an external meal image with graceful degradation:
 * - Renders nothing when no URL is provided.
 * - Renders nothing if the image fails to load (broken link, blocked host).
 *
 * The image is display-only; authoring/validation happens server-side.
 */
export function MealThumbnail({ src, alt, className }: MealThumbnailProps) {
  const [errored, setErrored] = useState(false);

  // Reset the error state when the source changes so a corrected URL can retry.
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (!src || errored) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={className}
    />
  );
}
