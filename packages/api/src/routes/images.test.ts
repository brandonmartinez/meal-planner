import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("../services/imageStorage.js", () => ({
  imageStorage: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
  sniffImageMime: vi.fn(),
  ALLOWED_IMAGE_TYPES: {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  },
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
}));

const { imagesRouter } = await import("./images.js");
const { imageStorage, sniffImageMime } = await import(
  "../services/imageStorage.js"
);

const FAMILY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAMILY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSET_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEAL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

function req(over: Record<string, unknown> = {}) {
  return buildReq({ user: { id: "user-1" } as never, ...over });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /:familyId/images (upload)", () => {
  const handler = getRouteHandler(imagesRouter, "post", "/:familyId/images");

  it("201s with an opaque id and never leaks a filesystem path", async () => {
    vi.mocked(sniffImageMime).mockReturnValue("image/png");
    const created = {
      id: ASSET_ID,
      familyId: FAMILY_A,
      mealId: null,
      contentType: "image/png",
      extension: "png",
      byteSize: PNG.length,
      createdBy: "user-1",
      createdAt: new Date("2026-07-02T00:00:00Z"),
      updatedAt: new Date("2026-07-02T00:00:00Z"),
    };
    prismaMock.imageAsset.create.mockResolvedValue(created as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A }, body: PNG }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(201);
    expect(imageStorage.put).toHaveBeenCalledWith(
      FAMILY_A,
      ASSET_ID,
      "png",
      PNG,
    );
    const body = res.body as Record<string, unknown>;
    expect(body.id).toBe(ASSET_ID);
    expect(body.contentType).toBe("image/png");
    // The payload must never leak on-disk details: no extension, no fs path.
    expect(body.extension).toBeUndefined();
    expect(body.path).toBeUndefined();
    expect(Object.keys(body)).toEqual([
      "id",
      "mealId",
      "contentType",
      "byteSize",
      "createdAt",
    ]);
  });

  it("400s on an empty body", async () => {
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A }, body: Buffer.alloc(0) }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(prismaMock.imageAsset.create).not.toHaveBeenCalled();
  });

  it("400s when the payload is not a recognized image (magic-byte sniff fails)", async () => {
    vi.mocked(sniffImageMime).mockReturnValue(null);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A }, body: Buffer.from("<html>") }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(imageStorage.put).not.toHaveBeenCalled();
  });

  it("413s when the body exceeds the max size", async () => {
    vi.mocked(sniffImageMime).mockReturnValue("image/png");
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A }, body: big }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(413);
    expect(prismaMock.imageAsset.create).not.toHaveBeenCalled();
  });

  it("404s when ?mealId belongs to another family (cross-family isolation)", async () => {
    vi.mocked(sniffImageMime).mockReturnValue("image/png");
    prismaMock.meal.findUnique.mockResolvedValue({
      id: MEAL_ID,
      familyId: FAMILY_B,
      placeholderKind: null,
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_A },
        query: { mealId: MEAL_ID },
        body: PNG,
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(prismaMock.imageAsset.create).not.toHaveBeenCalled();
  });

  it("400s when ?mealId targets a placeholder meal", async () => {
    vi.mocked(sniffImageMime).mockReturnValue("image/png");
    prismaMock.meal.findUnique.mockResolvedValue({
      id: MEAL_ID,
      familyId: FAMILY_A,
      placeholderKind: "LEFTOVERS",
    } as never);
    const res = buildFullRes();
    await handler(
      req({
        params: { familyId: FAMILY_A },
        query: { mealId: MEAL_ID },
        body: PNG,
      }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(400);
    expect(prismaMock.imageAsset.create).not.toHaveBeenCalled();
  });

  it("rolls back the DB row if the file write fails", async () => {
    vi.mocked(sniffImageMime).mockReturnValue("image/png");
    prismaMock.imageAsset.create.mockResolvedValue({
      id: ASSET_ID,
      familyId: FAMILY_A,
      mealId: null,
      contentType: "image/png",
      extension: "png",
      byteSize: PNG.length,
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(imageStorage.put).mockRejectedValue(new Error("disk full"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A }, body: PNG }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(500);
    expect(prismaMock.imageAsset.delete).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
    });
  });
});

describe("GET /:familyId/images/:assetId (read)", () => {
  const handler = getRouteHandler(
    imagesRouter,
    "get",
    "/:familyId/images/:assetId",
  );

  it("200s and streams bytes with the stored content type", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      familyId: FAMILY_A,
      extension: "png",
      contentType: "image/png",
    } as never);
    vi.mocked(imageStorage.get).mockResolvedValue(PNG);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A, assetId: ASSET_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(res.send).toHaveBeenCalledWith(PNG);
  });

  it("404s when the asset belongs to another family (cross-family isolation)", async () => {
    // Family A requests an asset that is actually owned by Family B.
    prismaMock.imageAsset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      familyId: FAMILY_B,
      extension: "png",
      contentType: "image/png",
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A, assetId: ASSET_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(imageStorage.get).not.toHaveBeenCalled();
  });

  it("404s when the asset does not exist", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue(null as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A, assetId: ASSET_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
  });

  it("404s when the row exists but the file is missing on disk", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      familyId: FAMILY_A,
      extension: "png",
      contentType: "image/png",
    } as never);
    vi.mocked(imageStorage.get).mockRejectedValue(new Error("ENOENT"));
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A, assetId: ASSET_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /:familyId/images/:assetId", () => {
  const handler = getRouteHandler(
    imagesRouter,
    "delete",
    "/:familyId/images/:assetId",
  );

  it("204s and deletes row + file", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      familyId: FAMILY_A,
      extension: "png",
      contentType: "image/png",
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A, assetId: ASSET_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(204);
    expect(prismaMock.imageAsset.delete).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
    });
    expect(imageStorage.delete).toHaveBeenCalledWith(FAMILY_A, ASSET_ID, "png");
  });

  it("404s when the asset belongs to another family (cross-family isolation)", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue({
      id: ASSET_ID,
      familyId: FAMILY_B,
      extension: "png",
      contentType: "image/png",
    } as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A, assetId: ASSET_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(prismaMock.imageAsset.delete).not.toHaveBeenCalled();
    expect(imageStorage.delete).not.toHaveBeenCalled();
  });

  it("404s when the asset does not exist", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue(null as never);
    const res = buildFullRes();
    await handler(
      req({ params: { familyId: FAMILY_A, assetId: ASSET_ID } }),
      res,
      buildNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(prismaMock.imageAsset.delete).not.toHaveBeenCalled();
  });
});
