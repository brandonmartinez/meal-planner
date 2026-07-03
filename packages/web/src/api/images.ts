/**
 * Meal image upload client (issue #105).
 *
 * Consumes the #104 image-asset backend (mounted at `/api/families`):
 *   - POST   /api/families/:familyId/images?mealId=<optional>  (raw binary body)
 *   - GET    /api/families/:familyId/images/:assetId           (streams bytes)
 *   - DELETE /api/families/:familyId/images/:assetId           (204)
 *
 * The backend sniffs magic bytes and ignores the request Content-Type, but we
 * still send the file's real type for correctness. Uploaded assets are addressed
 * by an opaque `assetId`; we store the same-origin *read path* in the meal's
 * existing `imageUrl` field so every surface can render one `<img>` (the httpOnly
 * JWT cookie rides along automatically on the same-origin GET).
 */

import { request } from "./client";

/** Shape returned by the #104 upload route on success (201). */
export interface UploadedImage {
  id: string;
  mealId: string | null;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

/** Client-side mirror of the backend limits (backend stays authoritative).
 *  Kept in sync with packages/api/src/services/imageStorage.ts. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const BASE = "/api/families";

/** Thrown by {@link uploadMealImage} when a file fails the fast client-side
 *  pre-check (size / type) before we bother the network. */
export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/** Build the same-origin read path for an uploaded asset. */
export function imageAssetUrl(familyId: string, assetId: string): string {
  return `${BASE}/${familyId}/images/${assetId}`;
}

/** Reverse of {@link imageAssetUrl}: return the assetId when `imageUrl` is an
 *  uploaded asset path for this family, or `null` when it is an external URL,
 *  empty, or points at a different family. Used for replace/delete bookkeeping. */
export function parseAssetId(
  familyId: string,
  imageUrl: string | null | undefined,
): string | null {
  if (!imageUrl) return null;
  const prefix = `${BASE}/${familyId}/images/`;
  if (!imageUrl.startsWith(prefix)) return null;
  const rest = imageUrl.slice(prefix.length);
  // A bare assetId only — reject anything with further path segments.
  return rest.length > 0 && !rest.includes("/") ? rest : null;
}

/** Fast client-side validation mirroring the backend allowlist + size cap.
 *  Returns an error message, or null when the file passes. Empty-type files are
 *  allowed through so the backend magic-byte sniff can make the final call. */
export function validateImageFile(file: File): string | null {
  if (file.size === 0) return "Image file is empty.";
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image exceeds the 5 MB limit.";
  }
  if (
    file.type &&
    !ALLOWED_IMAGE_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
    )
  ) {
    return "Unsupported image type. Use PNG, JPEG, WebP, or GIF.";
  }
  return null;
}

/**
 * Upload an image file and get back the opaque asset descriptor. Runs the
 * client-side pre-check first (throws {@link ImageValidationError} on failure),
 * then POSTs the raw file bytes. `mealId` is passed only when provided (present
 * on edit; omitted on create so the asset is created unassociated).
 */
export async function uploadMealImage(
  familyId: string,
  file: File,
  mealId?: string,
): Promise<UploadedImage> {
  const invalid = validateImageFile(file);
  if (invalid) throw new ImageValidationError(invalid);

  const query = mealId ? `?mealId=${encodeURIComponent(mealId)}` : "";
  return request<UploadedImage>(`${BASE}/${familyId}/images${query}`, {
    method: "POST",
    // Override the client's default JSON header so the browser sends the file
    // bytes verbatim. Fall back to a generic binary type for typeless files.
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
}

/** Delete an uploaded asset. Resolves on 204; callers treat this as best-effort. */
export async function deleteMealImage(
  familyId: string,
  assetId: string,
): Promise<void> {
  await request<void>(imageAssetUrl(familyId, assetId), { method: "DELETE" });
}
