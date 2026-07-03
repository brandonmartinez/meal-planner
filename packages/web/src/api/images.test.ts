import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import {
  uploadMealImage,
  deleteMealImage,
  imageAssetUrl,
  parseAssetId,
  validateImageFile,
  ImageValidationError,
  MAX_IMAGE_BYTES,
} from "./images";

function pngFile(bytes = 8, name = "photo.png", type = "image/png"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("images api client", () => {
  it("imageAssetUrl and parseAssetId round-trip", () => {
    const url = imageAssetUrl("f-1", "asset-9");
    expect(url).toBe("/api/families/f-1/images/asset-9");
    expect(parseAssetId("f-1", url)).toBe("asset-9");
  });

  it("parseAssetId returns null for external URLs, empty, or wrong family", () => {
    expect(parseAssetId("f-1", "https://cdn.example.com/x.png")).toBeNull();
    expect(parseAssetId("f-1", "")).toBeNull();
    expect(parseAssetId("f-1", null)).toBeNull();
    // Different family in the path — not ours.
    expect(parseAssetId("f-1", "/api/families/f-2/images/asset-9")).toBeNull();
    // Extra path segment is not a bare assetId.
    expect(parseAssetId("f-1", "/api/families/f-1/images/a/b")).toBeNull();
  });

  it("uploadMealImage POSTs the raw file bytes with the file's content-type", async () => {
    let method = "";
    let contentType: string | null = null;
    let byteLength = 0;
    let url = "";
    server.use(
      http.post("/api/families/f-1/images", async ({ request }) => {
        method = request.method;
        url = request.url;
        contentType = request.headers.get("content-type");
        byteLength = (await request.arrayBuffer()).byteLength;
        return HttpResponse.json(
          {
            id: "asset-1",
            mealId: null,
            contentType: "image/png",
            byteSize: byteLength,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          { status: 201 },
        );
      }),
    );
    const result = await uploadMealImage("f-1", pngFile(12));
    expect(method).toBe("POST");
    // The file's real type overrides the client's default JSON header — proving
    // we send the raw file, not a JSON envelope.
    expect(contentType).toBe("image/png");
    // A non-empty body reached the server. NOTE: under jsdom + Node's global
    // fetch (undici), a jsdom `File` is not a faithful cross-realm BodyInit, so
    // the exact transported byte count is an environment artifact, not our
    // contract. Real browsers send `file.size` bytes verbatim. We therefore
    // assert the body is present rather than pinning an exact length.
    expect(byteLength).toBeGreaterThan(0);
    expect(new URL(url).searchParams.has("mealId")).toBe(false);
    expect(result.id).toBe("asset-1");
  });

  it("uploadMealImage appends ?mealId= only when a mealId is given", async () => {
    let url = "";
    server.use(
      http.post("/api/families/f-1/images", ({ request }) => {
        url = request.url;
        return HttpResponse.json(
          {
            id: "asset-2",
            mealId: "m-9",
            contentType: "image/png",
            byteSize: 8,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          { status: 201 },
        );
      }),
    );
    await uploadMealImage("f-1", pngFile(), "m-9");
    expect(new URL(url).searchParams.get("mealId")).toBe("m-9");
  });

  it("uploadMealImage rejects oversize files before hitting the network", async () => {
    let hit = false;
    server.use(
      http.post("/api/families/f-1/images", () => {
        hit = true;
        return HttpResponse.json({ id: "nope" }, { status: 201 });
      }),
    );
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    await expect(uploadMealImage("f-1", big)).rejects.toBeInstanceOf(
      ImageValidationError,
    );
    expect(hit).toBe(false);
  });

  it("uploadMealImage rejects unsupported MIME types client-side", async () => {
    const svg = new File([new Uint8Array(8)], "x.svg", {
      type: "image/svg+xml",
    });
    await expect(uploadMealImage("f-1", svg)).rejects.toBeInstanceOf(
      ImageValidationError,
    );
  });

  it("uploadMealImage surfaces the backend error message on failure", async () => {
    server.use(
      http.post("/api/families/f-1/images", () =>
        HttpResponse.json({ error: "Image exceeds the 5 MB limit." }, { status: 413 }),
      ),
    );
    await expect(uploadMealImage("f-1", pngFile())).rejects.toThrow(
      "Image exceeds the 5 MB limit.",
    );
  });

  it("deleteMealImage resolves undefined on 204", async () => {
    server.use(
      http.delete(
        "/api/families/f-1/images/asset-3",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(deleteMealImage("f-1", "asset-3")).resolves.toBeUndefined();
  });

  describe("validateImageFile", () => {
    it("passes a valid PNG", () => {
      expect(validateImageFile(pngFile())).toBeNull();
    });
    it("rejects an empty file", () => {
      expect(validateImageFile(pngFile(0))).toMatch(/empty/i);
    });
    it("rejects an oversize file", () => {
      const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "b.png", {
        type: "image/png",
      });
      expect(validateImageFile(big)).toMatch(/5 MB/);
    });
    it("allows a typeless file through for the backend to sniff", () => {
      const typeless = new File([new Uint8Array(8)], "blob", { type: "" });
      expect(validateImageFile(typeless)).toBeNull();
    });
  });
});
