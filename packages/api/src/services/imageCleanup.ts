/**
 * Orphan-image cleanup for the #104 uploaded-image asset backend.
 *
 * #104 stores each `ImageAsset` row's bytes on disk at
 * `{root}/{familyId}/{assetId}.{ext}` (see `imageStorage.ts`). Two kinds of
 * drift can accumulate between the database and the volume:
 *
 *   1. **Orphaned files** — bytes on disk with NO referencing `ImageAsset` row.
 *      Realistic sources: a `PUT` that wrote bytes then failed to commit the row
 *      (the route deletes the row on failure but the file may linger), or
 *      filesystem residue from a family delete (the schema cascades the rows but
 *      not the on-disk files — families are effectively never deleted today, so
 *      this is the rare case).
 *   2. **Missing files** (dangling rows) — a live `ImageAsset` row whose backing
 *      file is gone, which renders a broken recipe image. Reported so an operator
 *      can investigate; the row is only deleted with an explicit opt-in.
 *
 * SAFETY CONTRACT (the whole point of #106):
 *   - A file is a deletion candidate ONLY if its `assetId` is provably absent
 *     from the live-id set loaded from the database. A file whose id matches any
 *     row is NEVER selected — a referenced image cannot be deleted.
 *   - Scanning is read-only `readdir`; it cannot delete anything.
 *   - Every deletion is routed through `FilesystemImageStorage.delete()`, which
 *     re-validates the ids + extension and asserts the resolved path stays under
 *     the storage root. We never hand-roll an `unlink`, so a traversal or a
 *     malformed name can never delete outside the root.
 *   - `runCleanup` DEFAULTS TO DRY-RUN (`apply: false`). A misconfigured root
 *     therefore cannot delete a single byte without an explicit `--apply`.
 *   - Entries that do not match the exact `{uuid}/{uuid}.{ext}` scheme are
 *     `unrecognized`: reported for human review, NEVER auto-deleted even under
 *     `--apply` (they may be unrelated files an operator placed in the volume).
 */

import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import defaultPrisma from "../config/database.js";
import {
  ALLOWED_EXTENSIONS,
  FilesystemImageStorage,
  UUID_RE,
  type ImageStorage,
} from "./imageStorage.js";

/** A recognized on-disk asset file matching the `{uuid}/{uuid}.{ext}` scheme. */
export interface RecognizedFile {
  familyId: string;
  assetId: string;
  extension: string;
  /** `{familyId}/{assetId}.{extension}` — for logging only, never a real path. */
  relPath: string;
}

/** A live `ImageAsset` row whose backing file is absent on disk. */
export interface MissingFile {
  assetId: string;
  familyId: string;
  extension: string;
  relPath: string;
}

/** A stray entry that does not match the storage scheme — reported, never deleted. */
export interface UnrecognizedEntry {
  relPath: string;
  reason: string;
}

/** Read-only result of scanning the storage root. */
export interface StorageScan {
  recognized: RecognizedFile[];
  unrecognized: UnrecognizedEntry[];
  /** True when the root does not exist yet (nothing has been uploaded). */
  rootMissing: boolean;
}

/** What cleanup WOULD do (dry-run) or is about to do. */
export interface CleanupPlan {
  /** On-disk files with no referencing row — deletion candidates. */
  orphanedFiles: RecognizedFile[];
  /** Live rows whose file is gone — reported; deleted only with `deleteRows`. */
  missingFiles: MissingFile[];
  /** Stray/misnamed entries — reported only, never deleted. */
  unrecognized: UnrecognizedEntry[];
  scannedFileCount: number;
  liveAssetCount: number;
  rootMissing: boolean;
}

/** Outcome of `runCleanup`, extending the plan with what was actually done. */
export interface CleanupResult extends CleanupPlan {
  /** False = dry-run (nothing deleted). True = deletions were applied. */
  applied: boolean;
  /** Whether row deletion was requested (only meaningful when `applied`). */
  deleteRowsRequested: boolean;
  deletedFiles: RecognizedFile[];
  deletedRows: MissingFile[];
}

export interface CleanupOptions {
  /** Storage root to scan. Defaults to `config.imageStorage.root` via storage. */
  root: string;
  /** Prisma client — injectable for tests. Defaults to the app singleton. */
  prisma?: PrismaClient;
  /** Storage backend — injectable for tests. Defaults to one rooted at `root`. */
  storage?: ImageStorage;
}

export interface RunCleanupOptions extends CleanupOptions {
  /** Perform deletions. Default `false` (dry-run) — the core safety default. */
  apply?: boolean;
  /** Also delete dangling `ImageAsset` rows (row-without-file). Requires `apply`. */
  deleteRows?: boolean;
}

/** Split a file name into `{assetId}.{ext}` on the LAST dot. */
function parseAssetFileName(
  name: string,
): { assetId: string; extension: string } | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return null;
  }
  return { assetId: name.slice(0, dot), extension: name.slice(dot + 1) };
}

/**
 * Read-only walk of the storage root. Lists family directories, then their
 * files, classifying each as `recognized` (valid `{uuid}/{uuid}.{ext}`) or
 * `unrecognized`. Never mutates the filesystem. A missing root is not an error —
 * it just means nothing has been uploaded yet.
 */
export async function scanStorageRoot(root: string): Promise<StorageScan> {
  const recognized: RecognizedFile[] = [];
  const unrecognized: UnrecognizedEntry[] = [];

  let familyEntries: Dirent[];
  try {
    familyEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { recognized, unrecognized, rootMissing: true };
    }
    throw err;
  }

  for (const familyEntry of familyEntries) {
    const familyName = familyEntry.name;
    if (!familyEntry.isDirectory()) {
      unrecognized.push({
        relPath: familyName,
        reason: "expected a family directory at the storage root",
      });
      continue;
    }
    if (!UUID_RE.test(familyName)) {
      unrecognized.push({
        relPath: familyName,
        reason: "family directory name is not a valid id",
      });
      continue;
    }

    const familyDir = path.join(root, familyName);
    const fileEntries = await fs.readdir(familyDir, { withFileTypes: true });
    for (const fileEntry of fileEntries) {
      const relPath = `${familyName}/${fileEntry.name}`;
      if (!fileEntry.isFile()) {
        unrecognized.push({
          relPath,
          reason: "expected a file inside the family directory",
        });
        continue;
      }
      const parsed = parseAssetFileName(fileEntry.name);
      if (
        !parsed ||
        !UUID_RE.test(parsed.assetId) ||
        !ALLOWED_EXTENSIONS.has(parsed.extension)
      ) {
        unrecognized.push({
          relPath,
          reason: "file name does not match {assetId}.{extension}",
        });
        continue;
      }
      recognized.push({
        familyId: familyName,
        assetId: parsed.assetId,
        extension: parsed.extension,
        relPath,
      });
    }
  }

  return { recognized, unrecognized, rootMissing: false };
}

/**
 * Compute what cleanup would do WITHOUT touching anything. Loads the live asset
 * id set from the database and cross-references it against the on-disk scan.
 */
export async function planCleanup(
  options: CleanupOptions,
): Promise<CleanupPlan> {
  const prisma = options.prisma ?? defaultPrisma;
  const storage = options.storage ?? new FilesystemImageStorage(options.root);

  const scan = await scanStorageRoot(options.root);

  const liveAssets = await prisma.imageAsset.findMany({
    select: { id: true, familyId: true, extension: true },
  });
  const liveIds = new Set(liveAssets.map((a) => a.id));

  // Orphaned files: recognized on disk but the id is provably NOT in the DB.
  // This is the ONLY place deletion candidates are produced, and the membership
  // test guarantees a referenced image is never a candidate.
  const orphanedFiles = scan.recognized.filter((f) => !liveIds.has(f.assetId));

  // Missing files: live rows whose backing file is absent. Checked through
  // `storage.exists`, which validates ids/extension the same way `delete` does.
  const missingFiles: MissingFile[] = [];
  for (const asset of liveAssets) {
    const present = await storage.exists(
      asset.familyId,
      asset.id,
      asset.extension,
    );
    if (!present) {
      missingFiles.push({
        assetId: asset.id,
        familyId: asset.familyId,
        extension: asset.extension,
        relPath: `${asset.familyId}/${asset.id}.${asset.extension}`,
      });
    }
  }

  return {
    orphanedFiles,
    missingFiles,
    unrecognized: scan.unrecognized,
    scannedFileCount: scan.recognized.length,
    liveAssetCount: liveAssets.length,
    rootMissing: scan.rootMissing,
  };
}

/**
 * Execute (or dry-run) cleanup. DEFAULTS TO DRY-RUN: with no `apply` flag it
 * computes and returns the plan without deleting anything. With `apply: true`
 * it deletes orphaned files via the audited `storage.delete()`. With
 * `apply` AND `deleteRows` it also deletes the dangling rows.
 */
export async function runCleanup(
  options: RunCleanupOptions,
): Promise<CleanupResult> {
  const prisma = options.prisma ?? defaultPrisma;
  const storage = options.storage ?? new FilesystemImageStorage(options.root);
  const apply = options.apply ?? false;
  const deleteRows = options.deleteRows ?? false;

  const plan = await planCleanup({ ...options, prisma, storage });

  const deletedFiles: RecognizedFile[] = [];
  const deletedRows: MissingFile[] = [];

  if (apply) {
    for (const file of plan.orphanedFiles) {
      // Routed through the audited storage layer: re-validates ids + extension
      // and asserts the path stays under root before unlinking.
      await storage.delete(file.familyId, file.assetId, file.extension);
      deletedFiles.push(file);
    }
    if (deleteRows) {
      for (const row of plan.missingFiles) {
        await prisma.imageAsset.delete({ where: { id: row.assetId } });
        deletedRows.push(row);
      }
    }
  }

  return {
    ...plan,
    applied: apply,
    deleteRowsRequested: deleteRows,
    deletedFiles,
    deletedRows,
  };
}
