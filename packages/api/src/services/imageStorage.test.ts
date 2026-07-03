import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FilesystemImageStorage,
  InvalidImageReferenceError,
  sniffImageMime,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "./imageStorage.js";

// A well-formed but non-existent UUID pair reused across cases.
const FAMILY = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";

describe("FilesystemImageStorage", () => {
  let root: string;
  let storage: FilesystemImageStorage;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "imgstore-"));
    storage = new FilesystemImageStorage(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("round-trips put -> get for the same bytes", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    await storage.put(FAMILY, ASSET, "png", bytes);
    const read = await storage.get(FAMILY, ASSET, "png");
    expect(read.equals(bytes)).toBe(true);
  });

  it("stores files under a family-scoped path", async () => {
    await storage.put(FAMILY, ASSET, "png", Buffer.from([1]));
    const expected = path.join(root, FAMILY, `${ASSET}.png`);
    const stat = await fs.stat(expected);
    expect(stat.isFile()).toBe(true);
  });

  it("delete removes the file", async () => {
    await storage.put(FAMILY, ASSET, "png", Buffer.from([1]));
    await storage.delete(FAMILY, ASSET, "png");
    await expect(storage.get(FAMILY, ASSET, "png")).rejects.toThrow();
  });

  it("delete of a missing file is a no-op (idempotent)", async () => {
    await expect(storage.delete(FAMILY, ASSET, "png")).resolves.toBeUndefined();
  });

  it("get of a missing asset rejects", async () => {
    await expect(storage.get(FAMILY, ASSET, "png")).rejects.toThrow();
  });

  describe("path-traversal / injection safety", () => {
    it("rejects a non-UUID family id", async () => {
      await expect(
        storage.put("../../etc", ASSET, "png", Buffer.from([1])),
      ).rejects.toBeInstanceOf(InvalidImageReferenceError);
    });

    it("rejects a non-UUID asset id", async () => {
      await expect(
        storage.put(FAMILY, "../../passwd", "png", Buffer.from([1])),
      ).rejects.toBeInstanceOf(InvalidImageReferenceError);
    });

    it("rejects an absolute-path-looking asset id", async () => {
      await expect(
        storage.get(FAMILY, "/etc/passwd", "png"),
      ).rejects.toBeInstanceOf(InvalidImageReferenceError);
    });

    it("rejects an extension outside the allowlist", async () => {
      await expect(
        storage.put(FAMILY, ASSET, "exe", Buffer.from([1])),
      ).rejects.toBeInstanceOf(InvalidImageReferenceError);
    });

    it("rejects a traversal sequence embedded in the extension", async () => {
      await expect(
        storage.put(FAMILY, ASSET, "../png", Buffer.from([1])),
      ).rejects.toBeInstanceOf(InvalidImageReferenceError);
    });

    it("never writes outside the storage root", async () => {
      // Attempt an escape; it must be rejected, and nothing may appear above root.
      await expect(
        storage.put(FAMILY, "..%2f..%2fevil", "png", Buffer.from([1])),
      ).rejects.toBeInstanceOf(InvalidImageReferenceError);
      const parentEntries = await fs.readdir(path.dirname(root));
      expect(parentEntries.some((e) => e.includes("evil"))).toBe(false);
    });
  });
});

describe("sniffImageMime", () => {
  it("detects PNG", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageMime(png)).toBe("image/png");
  });

  it("detects JPEG", () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
  });

  it("detects GIF", () => {
    expect(sniffImageMime(Buffer.from("GIF89a"))).toBe("image/gif");
  });

  it("detects WEBP", () => {
    const webp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WEBP"),
    ]);
    expect(sniffImageMime(webp)).toBe("image/webp");
  });

  it("returns null for a non-image payload (e.g. HTML)", () => {
    expect(sniffImageMime(Buffer.from("<html></html>"))).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });

  it("every sniffable type maps to an allowlisted MIME", () => {
    for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
      expect(ALLOWED_IMAGE_TYPES[mime]).toBeDefined();
    }
  });
});

describe("constants", () => {
  it("caps uploads at 5 MiB", () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });
});
