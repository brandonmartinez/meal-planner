import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import * as familiesApi from "./families";

describe("families api client", () => {
  it("createFamily POSTs and returns family JSON", async () => {
    let receivedBody: unknown;
    server.use(
      http.post("/api/families", async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          id: "f-1",
          name: "Smiths",
          createdAt: "",
          members: [],
        });
      }),
    );

    const res = await familiesApi.createFamily("Smiths");
    expect(res.id).toBe("f-1");
    expect(receivedBody).toEqual({ name: "Smiths" });
  });

  it("listFamilies GETs and returns array", async () => {
    server.use(
      http.get("/api/families", () => HttpResponse.json([{ id: "f-1" }])),
    );
    const res = await familiesApi.listFamilies();
    expect(res).toHaveLength(1);
  });

  it("throws with the server-supplied error message on non-OK", async () => {
    server.use(
      http.get("/api/families", () =>
        HttpResponse.json({ error: "nope" }, { status: 403 }),
      ),
    );
    await expect(familiesApi.listFamilies()).rejects.toThrow("nope");
  });

  it("falls back to a generic error when the body has none", async () => {
    server.use(
      http.get("/api/families/f-1", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    await expect(familiesApi.getFamily("f-1")).rejects.toThrow(/HTTP 500/);
  });

  it("removeMember handles 204 No Content", async () => {
    server.use(
      http.delete(
        "/api/families/f-1/members/m-1",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(
      familiesApi.removeMember("f-1", "m-1"),
    ).resolves.toBeUndefined();
  });

  it("generateInvite sends the role payload", async () => {
    let body: unknown;
    server.use(
      http.post("/api/families/f-1/invite", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: "t" });
      }),
    );
    const res = await familiesApi.generateInvite("f-1", "CHILD");
    expect(res.token).toBe("t");
    expect(body).toEqual({ role: "CHILD" });
  });

  it("createApiKey POSTs name and returns key payload", async () => {
    server.use(
      http.post("/api/families/f-1/api-keys", () =>
        HttpResponse.json({
          id: "k-1",
          name: "CI",
          key: "raw",
          createdAt: "",
          lastUsed: null,
        }),
      ),
    );
    const res = await familiesApi.createApiKey("f-1", "CI");
    expect(res.key).toBe("raw");
  });
});
