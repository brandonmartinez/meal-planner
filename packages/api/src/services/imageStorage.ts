/**
 * Binary image-asset storage (the concrete #104 backend for the #93 image
 * abstraction).
 *
 * Design invariants — the whole point of this module:
 *  - **Opaque IDs only.** Callers address bytes by `(familyId, assetId, ext)`.
 *    A raw filesystem path is NEVER accepted as input, returned, or logged.
 *  - **Family-scoped layout.** Files live at `{root}/{familyId}/{assetId}.{ext}`
 *    so one family's assets are physically namespaced from another's.
 *  - **Path-traversal safe.** `familyId`/`assetId` must be UUIDs and `ext` must
 *    come from the fixed allowlist BEFORE any path is built; after resolving,
 *    the final path is asserted to still live under the storage root. A crafted
 *    id like `../../etc` can never escape the root.
 *
 * The `ImageStorage` interface is intentionally small so a future S3-backed
 * implementation (deferred in #93) can drop in without touching routes.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";

/** MIME types we accept, mapped to the ONE canonical on-disk extension used for
 *  each. The extension is always derived from this map — never from the
 *  client-supplied filename — so it cannot be used to smuggle path characters
 *  or a misleading suffix. */
export const ALLOWED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

/** Maximum accepted upload size (bytes). 5 MiB — generous for a meal photo,
 *  small enough to bound disk and memory use per request. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Strict UUID (v4-shaped, but we accept any RFC-4122 layout) matcher. Used to
 *  validate BOTH the family id and the asset id before they ever touch a path.
 *  Exported so out-of-band tooling (e.g. the #106 orphan-cleanup scanner) can
 *  validate on-disk entry names against the EXACT same rule the storage layer
 *  enforces — a single source of truth for what a legal id looks like. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reverse lookup: canonical extension -> true. Guards `get`/`delete` so a
 *  caller cannot pass an arbitrary extension string into the path. Exported for
 *  the same single-source-of-truth reason as `UUID_RE`: the cleanup scanner must
 *  recognise exactly the extensions this backend writes, and nothing else. */
export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set(
  Object.values(ALLOWED_IMAGE_TYPES),
);

/**
 * Pluggable storage backend. Bytes are addressed by opaque ids only.
 */
export interface ImageStorage {
  /** Persist `bytes` for `(familyId, assetId, extension)`. Overwrites if present. */
  put(
    familyId: string,
    assetId: string,
    extension: string,
    bytes: Buffer,
  ): Promise<void>;
  /** Read the bytes for `(familyId, assetId, extension)`. Rejects if missing. */
  get(familyId: string, assetId: string, extension: string): Promise<Buffer>;
  /** Delete the bytes. A missing file is treated as already-deleted (no throw). */
  delete(
    familyId: string,
    assetId: string,
    extension: string,
  ): Promise<void>;
  /** Report whether the bytes for `(familyId, assetId, extension)` are present.
   *  Read-only; validates ids/extension identically to `get`/`delete`. Used by
   *  the #106 cleanup to detect rows whose backing file has gone missing. */
  exists(
    familyId: string,
    assetId: string,
    extension: string,
  ): Promise<boolean>;
}

/** Thrown when an id/extension fails validation, or a resolved path would
 *  escape the storage root. Routes translate this into a 400. */
export class InvalidImageReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageReferenceError";
  }
}

/**
 * Filesystem-backed `ImageStorage`. Stores each asset as a single file under a
 * per-family directory beneath a configured root.
 */
export class FilesystemImageStorage implements ImageStorage {
  private readonly root: string;

  constructor(root: string = config.imageStorage.root) {
    // Resolve once so every containment check compares against an absolute,
    // normalized root.
    this.root = path.resolve(root);
  }

  /**
   * Build the absolute on-disk path for an asset, validating every component.
   *
   * Validation order matters: we reject non-UUID ids and non-allowlisted
   * extensions FIRST (so traversal sequences never reach `path.join`), then
   * resolve and assert the result is still inside the root as belt-and-braces
   * defense in depth.
   */
  private resolvePath(
    familyId: string,
    assetId: string,
    extension: string,
  ): string {
    if (!UUID_RE.test(familyId)) {
      throw new InvalidImageReferenceError("Invalid family id");
    }
    if (!UUID_RE.test(assetId)) {
      throw new InvalidImageReferenceError("Invalid asset id");
    }
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new InvalidImageReferenceError("Invalid image extension");
    }

    const familyDir = path.resolve(this.root, familyId);
    const filePath = path.resolve(familyDir, `${assetId}.${extension}`);

    // Defense in depth: even though the components are UUID/allowlist-validated,
    // assert the resolved path is physically contained by the root. The
    // trailing separator prevents a sibling-prefix escape (`/root-evil`).
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : this.root + path.sep;
    if (!filePath.startsWith(rootWithSep)) {
      throw new InvalidImageReferenceError("Resolved path escapes storage root");
    }
    return filePath;
  }

  async put(
    familyId: string,
    assetId: string,
    extension: string,
    bytes: Buffer,
  ): Promise<void> {
    const filePath = this.resolvePath(familyId, assetId, extension);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
  }

  async get(
    familyId: string,
    assetId: string,
    extension: string,
  ): Promise<Buffer> {
    const filePath = this.resolvePath(familyId, assetId, extension);
    return fs.readFile(filePath);
  }

  async delete(
    familyId: string,
    assetId: string,
    extension: string,
  ): Promise<void> {
    const filePath = this.resolvePath(familyId, assetId, extension);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // A missing file means the desired end-state (gone) already holds.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }
  }

  async exists(
    familyId: string,
    assetId: string,
    extension: string,
  ): Promise<boolean> {
    // Validate through the same builder as get/delete: a malformed reference is
    // rejected rather than silently reported "missing".
    const filePath = this.resolvePath(familyId, assetId, extension);
    try {
      await fs.access(filePath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw err;
    }
  }
}

/** Process-wide default storage instance, rooted at the configured path. */
export const imageStorage: ImageStorage = new FilesystemImageStorage();

/**
 * Sniff the leading "magic bytes" of `buf` and return the matching allowlisted
 * MIME type, or `null` if the content does not look like an accepted image.
 *
 * This is defense in depth: we never trust the client's `Content-Type` header
 * alone, because it is trivially forged. An attacker who declares
 * `image/png` but uploads an HTML/JS payload is rejected here.
 */
export function sniffImageMime(buf: Buffer): string | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: "GIF87a" or "GIF89a"
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return "image/gif";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
