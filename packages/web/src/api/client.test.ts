import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import { ApiError, request } from "./client";

describe("request<T> helper", () => {
  it("returns parsed JSON on success", async () => {
    server.use(
      http.get("/api/thing", () => HttpResponse.json({ id: "x-1" })),
    );
    const res = await request<{ id: string }>("/api/thing");
    expect(res.id).toBe("x-1");
  });

  it("sends credentials and JSON content-type by default", async () => {
    let credentials: string | undefined;
    let contentType: string | null = null;
    server.use(
      http.post("/api/thing", ({ request: req }) => {
        credentials = req.credentials;
        contentType = req.headers.get("content-type");
        return HttpResponse.json({ ok: true });
      }),
    );
    await request("/api/thing", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    });
    expect(credentials).toBe("include");
    expect(contentType).toBe("application/json");
  });

  it("throws ApiError carrying the parsed backend message and status", async () => {
    server.use(
      http.get("/api/thing", () =>
        HttpResponse.json({ error: "boom" }, { status: 403 }),
      ),
    );
    await expect(request("/api/thing")).rejects.toMatchObject({
      name: "ApiError",
      message: "boom",
      status: 403,
    });
    await expect(request("/api/thing")).rejects.toBeInstanceOf(ApiError);
  });

  it("falls back to HTTP <status> when the error body has no message", async () => {
    server.use(
      http.get("/api/thing", () => HttpResponse.json({}, { status: 500 })),
    );
    await expect(request("/api/thing")).rejects.toThrow(/HTTP 500/);
  });

  it("falls back to HTTP <status> when the error body is not JSON", async () => {
    server.use(
      http.get(
        "/api/thing",
        () =>
          new HttpResponse("upstream exploded", {
            status: 502,
            headers: { "content-type": "text/plain" },
          }),
      ),
    );
    await expect(request("/api/thing")).rejects.toThrow(/HTTP 502/);
  });

  it("resolves to undefined for a 204 No Content response", async () => {
    server.use(
      http.delete(
        "/api/thing",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(
      request<void>("/api/thing", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  it("resolves to undefined for a 200 response with an empty body", async () => {
    server.use(
      http.patch(
        "/api/thing",
        () => new HttpResponse(null, { status: 200 }),
      ),
    );
    await expect(
      request<void>("/api/thing", { method: "PATCH" }),
    ).resolves.toBeUndefined();
  });
});
