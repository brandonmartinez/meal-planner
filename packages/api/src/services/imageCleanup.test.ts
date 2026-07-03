import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { FilesystemImageStorage } from "./imageStorage.js";
import { scanStorageRoot, planCleanup, runCleanup } from "./imageCleanup.js";

// Well-formed but non-existent UUIDs reused across cases.
const FAMILY = "11111111-1111-4111-8111-111111111111";
const ASSET_A = "22222222-2222-4222-8222-222222222222";
const ASSET_B = "33333333-3333-4333-8333-333333333333";
const ASSET_C = "44444444-4444-4444-8444-444444444444";

// The service accepts an injected PrismaClient; the deep mock is assignable.
const prisma = prismaMock as unknown as PrismaClient;

/** Shape of a live-asset row as selected by planCleanup. */
interface LiveAsset {
  id: string;
  familyId: string;
  extension: string;
}

function mockLiveAssets(assets: LiveAsset[]): void {
  prismaMock.imageAsset.findMany.mockResolvedValue(assets as never);
}

describe("scanStorageRoot", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "imgclean-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns rootMissing without throwing when the root does not exist", async () => {
    await fs.rm(root, { recursive: true, force: true });
    const scan = await scanStorageRoot(root);
    expect(scan.rootMissing).toBe(true);
    expect(scan.recognized).toEqual([]);
    expect(scan.unrecognized).toEqual([]);
  });

  it("recognizes valid {uuid}/{uuid}.{ext} files and flags strays", async () => {
    const storage = new FilesystemImageStorage(root);
    await storage.put(FAMILY, ASSET_A, "png", Buffer.from([1]));
    // A stray file at the root (not a family dir).
    await fs.writeFile(path.join(root, "README.txt"), "not an image");
    // A misnamed file inside a valid family dir.
    await fs.writeFile(path.join(root, FAMILY, "notes.txt"), "junk");

    const scan = await scanStorageRoot(root);
    expect(scan.rootMissing).toBe(false);
    expect(scan.recognized).toHaveLength(1);
    expect(scan.recognized[0]).toMatchObject({
      familyId: FAMILY,
      assetId: ASSET_A,
      extension: "png",
    });
    const strayPaths = scan.unrecognized.map((u) => u.relPath).sort();
    expect(strayPaths).toContain("README.txt");
    expect(strayPaths).toContain(`${FAMILY}/notes.txt`);
  });
});

describe("planCleanup / runCleanup", () => {
  let root: string;
  let storage: FilesystemImageStorage;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "imgclean-"));
    storage = new FilesystemImageStorage(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  // 1. THE SAFETY TEST — a file whose id matches a live row is never a
  //    deletion candidate, even under --apply.
  it("never flags or deletes a file that has a matching row", async () => {
    await storage.put(FAMILY, ASSET_A, "png", Buffer.from([1]));
    mockLiveAssets([{ id: ASSET_A, familyId: FAMILY, extension: "png" }]);

    const plan = await planCleanup({ root, prisma, storage });
    expect(plan.orphanedFiles).toEqual([]);
    expect(plan.missingFiles).toEqual([]);

    const result = await runCleanup({ root, prisma, storage, apply: true });
    expect(result.deletedFiles).toEqual([]);
    // File is still on disk.
    const read = await storage.get(FAMILY, ASSET_A, "png");
    expect(read.equals(Buffer.from([1]))).toBe(true);
  });

  // 2. File with no row → flagged; dry-run leaves it; apply deletes it.
  it("flags an orphaned file, leaves it in dry-run, deletes it on apply", async () => {
    await storage.put(FAMILY, ASSET_A, "png", Buffer.from([1]));
    mockLiveAssets([]); // no rows at all

    const dry = await runCleanup({ root, prisma, storage });
    expect(dry.applied).toBe(false);
    expect(dry.orphanedFiles).toHaveLength(1);
    expect(dry.orphanedFiles[0].assetId).toBe(ASSET_A);
    expect(dry.deletedFiles).toEqual([]);
    // Still present after dry-run.
    await expect(storage.get(FAMILY, ASSET_A, "png")).resolves.toBeInstanceOf(
      Buffer,
    );

    const applied = await runCleanup({ root, prisma, storage, apply: true });
    expect(applied.applied).toBe(true);
    expect(applied.deletedFiles).toHaveLength(1);
    // Gone from disk.
    await expect(storage.get(FAMILY, ASSET_A, "png")).rejects.toBeDefined();
  });

  // 3. Row with no file → flagged missingFiles; row deleted only with
  //    apply + deleteRows.
  it("flags a dangling row and deletes it only with apply + deleteRows", async () => {
    // Row exists in DB but no file on disk.
    mockLiveAssets([{ id: ASSET_B, familyId: FAMILY, extension: "jpg" }]);
    prismaMock.imageAsset.delete.mockResolvedValue({} as never);

    const dry = await planCleanup({ root, prisma, storage });
    expect(dry.missingFiles).toHaveLength(1);
    expect(dry.missingFiles[0].assetId).toBe(ASSET_B);

    // apply WITHOUT deleteRows → row retained.
    const applyOnly = await runCleanup({ root, prisma, storage, apply: true });
    expect(applyOnly.deletedRows).toEqual([]);
    expect(prismaMock.imageAsset.delete).not.toHaveBeenCalled();

    // apply + deleteRows → row deleted.
    const full = await runCleanup({
      root,
      prisma,
      storage,
      apply: true,
      deleteRows: true,
    });
    expect(full.deletedRows).toHaveLength(1);
    expect(prismaMock.imageAsset.delete).toHaveBeenCalledWith({
      where: { id: ASSET_B },
    });
  });

  // 4. Unrecognized/stray entries are reported but never deleted under apply.
  it("never deletes unrecognized entries even under apply", async () => {
    await fs.writeFile(path.join(root, "loose.txt"), "keep me");
    await fs.mkdir(path.join(root, FAMILY), { recursive: true });
    await fs.writeFile(path.join(root, FAMILY, "bad-name.png"), "keep me too");
    mockLiveAssets([]);

    const result = await runCleanup({ root, prisma, storage, apply: true });
    expect(result.unrecognized.length).toBeGreaterThanOrEqual(2);
    expect(result.deletedFiles).toEqual([]);
    // Both files still exist.
    await expect(
      fs.readFile(path.join(root, "loose.txt"), "utf8"),
    ).resolves.toBe("keep me");
    await expect(
      fs.readFile(path.join(root, FAMILY, "bad-name.png"), "utf8"),
    ).resolves.toBe("keep me too");
  });

  // 5. A family-level asset (mealId: null in DB) with a present file is not an
  //    orphan — the row exists, so its id is in the live set.
  it("treats a present file with a matching family-level row as live", async () => {
    await storage.put(FAMILY, ASSET_C, "webp", Buffer.from([9]));
    // mealId is irrelevant to cleanup; only id/familyId/extension are selected.
    mockLiveAssets([{ id: ASSET_C, familyId: FAMILY, extension: "webp" }]);

    const plan = await planCleanup({ root, prisma, storage });
    expect(plan.orphanedFiles).toEqual([]);
    expect(plan.missingFiles).toEqual([]);
  });

  // 6. Dry-run is the default: no flags → zero deletions.
  it("defaults to dry-run when no apply flag is given", async () => {
    await storage.put(FAMILY, ASSET_A, "png", Buffer.from([1]));
    mockLiveAssets([]);

    const result = await runCleanup({ root, prisma, storage });
    expect(result.applied).toBe(false);
    expect(result.deletedFiles).toEqual([]);
    expect(result.deletedRows).toEqual([]);
    // Orphan still detected and still on disk.
    expect(result.orphanedFiles).toHaveLength(1);
    await expect(storage.get(FAMILY, ASSET_A, "png")).resolves.toBeInstanceOf(
      Buffer,
    );
  });

  // 7. Deletion always routes through the audited storage layer, so a file
  //    from an out-of-scheme name can never be selected (walker stays in root).
  it("only ever deletes files inside the storage root", async () => {
    // Two orphans in a valid family dir.
    await storage.put(FAMILY, ASSET_A, "png", Buffer.from([1]));
    await storage.put(FAMILY, ASSET_B, "png", Buffer.from([2]));
    mockLiveAssets([]);

    const result = await runCleanup({ root, prisma, storage, apply: true });
    for (const deleted of result.deletedFiles) {
      const resolved = path.resolve(
        root,
        deleted.familyId,
        `${deleted.assetId}.${deleted.extension}`,
      );
      expect(resolved.startsWith(path.resolve(root))).toBe(true);
    }
    expect(result.deletedFiles).toHaveLength(2);
  });
});
