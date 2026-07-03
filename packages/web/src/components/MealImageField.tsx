import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  uploadMealImage,
  deleteMealImage,
  imageAssetUrl,
  parseAssetId,
} from '../api/images';
import { MealThumbnail } from './MealThumbnail';

/** Imperative cleanup hooks the parent form calls at the end of its lifecycle. */
export interface MealImageFieldHandle {
  /** Call after a successful create/update: reaps a saved asset that was
   *  replaced/removed by this edit (safe now that the new value is persisted). */
  commitCleanup: () => void;
  /** Call when the user cancels: reaps any throwaway asset uploaded this session
   *  that was never persisted. Leaves the saved asset untouched. */
  abandon: () => void;
}

interface MealImageFieldProps {
  /** Owning family; uploads/deletes are disabled until this resolves. */
  familyId: string | null;
  /** Current image value (external URL or same-origin asset read-path). */
  value: string;
  /** Persist a new value up to the form (empty string clears the image). */
  onChange: (url: string) => void;
  /** Present on edit so uploads associate with the meal; omitted on create. */
  mealId?: string;
}

type Mode = 'link' | 'upload';

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded';

/**
 * Meal image picker (issue #105): choose between linking an external URL or
 * uploading a file. Uploads are eager (on file-select) and stored as the meal's
 * `imageUrl` (a same-origin asset read-path), so every surface renders one
 * `<img>` with no CSP or schema change.
 *
 * Replace/delete bookkeeping (the flagged risk):
 *  - A *session asset* is one uploaded during this edit that is not yet saved.
 *    It is deleted immediately when superseded, removed, replaced by a URL, or
 *    abandoned on cancel.
 *  - The *saved asset* (the value at mount, if it was an upload) is deleted only
 *    after a successful save that replaced it — never before, so a failed save
 *    keeps the original image.
 *  - External URLs are never deleted (we don't own them).
 */
export const MealImageField = forwardRef<MealImageFieldHandle, MealImageFieldProps>(
  function MealImageField({ familyId, value, onChange, mealId }, ref) {
    // Asset uploaded this session and currently reflected in `value`. Only ever
    // holds this-session uploads, so it is always safe to delete eagerly.
    const sessionAssetIdRef = useRef<string | null>(null);
    // Asset persisted on the meal at mount (null for new meals / external URLs).
    // Reaped only via commitCleanup after a save that replaced it.
    const savedAssetIdRef = useRef<string | null>(
      familyId ? parseAssetId(familyId, value) : null,
    );

    const [mode, setMode] = useState<Mode>(() => {
      if (familyId && parseAssetId(familyId, value)) return 'upload';
      return 'link';
    });
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const urlInputId = useId();
    const linkRadioId = useId();
    const uploadRadioId = useId();
    const groupName = useId();

    // When the value moves off our live session asset (user typed a URL, or the
    // parent reset the field), that asset is now orphaned — reap it best-effort.
    useEffect(() => {
      const sid = sessionAssetIdRef.current;
      if (!familyId || !sid) return;
      if (value !== imageAssetUrl(familyId, sid)) {
        sessionAssetIdRef.current = null;
        void deleteMealImage(familyId, sid).catch(() => {});
      }
    }, [value, familyId]);

    const bestEffortDelete = (assetId: string) => {
      if (!familyId) return;
      void deleteMealImage(familyId, assetId).catch(() => {});
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so re-selecting the same file fires change again.
      e.target.value = '';
      if (!file) return;
      if (!familyId) {
        setError('Select a family before uploading an image.');
        return;
      }

      setError('');
      setStatus('Uploading image…');
      setUploading(true);
      const previousSessionAsset = sessionAssetIdRef.current;
      try {
        const asset = await uploadMealImage(familyId, file, mealId);
        sessionAssetIdRef.current = asset.id;
        onChange(imageAssetUrl(familyId, asset.id));
        setStatus('Image uploaded.');
        // A prior throwaway upload is now superseded — reap it.
        if (previousSessionAsset && previousSessionAsset !== asset.id) {
          bestEffortDelete(previousSessionAsset);
        }
      } catch (err) {
        setStatus('');
        setError(err instanceof Error ? err.message : 'Failed to upload image.');
      } finally {
        setUploading(false);
      }
    };

    const handleRemove = () => {
      setError('');
      setStatus('');
      const sid = sessionAssetIdRef.current;
      if (sid) {
        sessionAssetIdRef.current = null;
        bestEffortDelete(sid);
      }
      // A saved asset (if any) is reaped on save via commitCleanup, once the
      // meal actually persists imageUrl: null.
      onChange('');
    };

    const switchMode = (next: Mode) => {
      setMode(next);
      setError('');
      setStatus('');
    };

    useImperativeHandle(
      ref,
      () => ({
        commitCleanup: () => {
          const saved = savedAssetIdRef.current;
          if (familyId && saved && value !== imageAssetUrl(familyId, saved)) {
            // The persisted image changed away from the old saved asset — reap it.
            bestEffortDelete(saved);
          }
          // Whatever is persisted now becomes the new "saved" asset (or null),
          // so it is never treated as a throwaway on later cleanup.
          savedAssetIdRef.current = familyId ? parseAssetId(familyId, value) : null;
          sessionAssetIdRef.current = null;
        },
        abandon: () => {
          const sid = sessionAssetIdRef.current;
          if (sid) {
            sessionAssetIdRef.current = null;
            bestEffortDelete(sid);
          }
        },
      }),
      // value/familyId are read at call time; refs are stable.
      [familyId, value],
    );

    const hasImage = value.trim().length > 0;

    return (
      <div>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Image
        </span>

        <div role="radiogroup" aria-label="Image source" className="flex gap-4 mb-2">
          <label htmlFor={linkRadioId} className="inline-flex items-center gap-2 text-sm">
            <input
              id={linkRadioId}
              type="radio"
              name={groupName}
              checked={mode === 'link'}
              onChange={() => switchMode('link')}
            />
            Link
          </label>
          <label htmlFor={uploadRadioId} className="inline-flex items-center gap-2 text-sm">
            <input
              id={uploadRadioId}
              type="radio"
              name={groupName}
              checked={mode === 'upload'}
              onChange={() => switchMode('upload')}
            />
            Upload
          </label>
        </div>

        {mode === 'link' ? (
          <div>
            <label htmlFor={urlInputId} className="sr-only">
              Image URL
            </label>
            <input
              id={urlInputId}
              type="url"
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Link to an external photo of this meal. Displayed as a thumbnail.
            </p>
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Upload meal image"
              disabled={uploading || !familyId}
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              PNG, JPEG, WebP, or GIF, up to 5 MB.
            </p>
          </div>
        )}

        <p role="status" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {status}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {hasImage && (
          <div className="mt-2 flex items-center gap-3">
            <MealThumbnail
              src={value}
              alt="Meal image preview"
              className="h-20 w-20 rounded object-cover border border-gray-200 dark:border-gray-700"
            />
            <button
              type="button"
              onClick={handleRemove}
              className="text-sm text-red-600 dark:text-red-400 hover:underline"
            >
              Remove image
            </button>
          </div>
        )}
      </div>
    );
  },
);
