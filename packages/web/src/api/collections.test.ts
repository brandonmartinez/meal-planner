import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import * as collectionsApi from "./collections";

describe("collections api client", () => {
  it("listCollections unwraps the { collections } envelope into a plain array", async () => {
    server.use(
      http.get("/api/families/f-1/collections", () =>
        HttpResponse.json({
          collections: [
            { id: "col-1", name: "Weeknight Winners", familyId: "f-1", description: "Fast + reliable" },
            { id: "col-2", name: "Holiday", familyId: "f-1", description: null },
          ],
        }),
      ),
    );
    const collections = await collectionsApi.listCollections("f-1");
    expect(collections).toEqual([
      { id: "col-1", name: "Weeknight Winners", familyId: "f-1", description: "Fast + reliable" },
      { id: "col-2", name: "Holiday", familyId: "f-1", description: null },
    ]);
  });

  it("getCollection returns the collection by id", async () => {
    server.use(
      http.get("/api/families/f-1/collections/col-1", () =>
        HttpResponse.json({ id: "col-1", name: "Weeknight Winners", familyId: "f-1", description: null }),
      ),
    );
    const collection = await collectionsApi.getCollection("f-1", "col-1");
    expect(collection).toEqual({ id: "col-1", name: "Weeknight Winners", familyId: "f-1", description: null });
  });

  it("getCollection throws an ApiError with status 404 when missing", async () => {
    server.use(
      http.get("/api/families/f-1/collections/nope", () =>
        HttpResponse.json({ error: "collection not found" }, { status: 404 }),
      ),
    );
    await expect(collectionsApi.getCollection("f-1", "nope")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("createCollection POSTs the name/description and returns the created collection", async () => {
    let captured: unknown;
    server.use(
      http.post("/api/families/f-1/collections", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json(
          { id: "col-9", name: "New Shelf", familyId: "f-1", description: "Blurb" },
          { status: 201 },
        );
      }),
    );
    const created = await collectionsApi.createCollection("f-1", {
      name: "New Shelf",
      description: "Blurb",
    });
    expect(captured).toEqual({ name: "New Shelf", description: "Blurb" });
    expect(created).toEqual({ id: "col-9", name: "New Shelf", familyId: "f-1", description: "Blurb" });
  });

  it("updateCollection PATCHes only the changed fields", async () => {
    let captured: unknown;
    server.use(
      http.patch("/api/families/f-1/collections/col-1", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: "col-1", name: "Renamed", familyId: "f-1", description: null });
      }),
    );
    const updated = await collectionsApi.updateCollection("f-1", "col-1", { name: "Renamed" });
    expect(captured).toEqual({ name: "Renamed" });
    expect(updated.name).toBe("Renamed");
  });

  it("deleteCollection issues a DELETE and resolves on 204", async () => {
    let called = false;
    server.use(
      http.delete("/api/families/f-1/collections/col-1", () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(collectionsApi.deleteCollection("f-1", "col-1")).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it("deleteCollection surfaces a 403 as an ApiError (parent-gated)", async () => {
    server.use(
      http.delete("/api/families/f-1/collections/col-1", () =>
        HttpResponse.json({ error: "parent role required" }, { status: 403 }),
      ),
    );
    await expect(collectionsApi.deleteCollection("f-1", "col-1")).rejects.toMatchObject({
      status: 403,
    });
  });
});
