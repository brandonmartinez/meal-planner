import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import * as wpApi from "./weekPlan";

describe("weekPlan api client", () => {
  it("getWeekPlan returns JSON", async () => {
    server.use(
      http.get("/api/families/f-1/weeks/2026-05-04", () =>
        HttpResponse.json({ id: "wp-1" }),
      ),
    );
    const r = await wpApi.getWeekPlan("f-1", "2026-05-04");
    expect(r.id).toBe("wp-1");
  });

  it("getWeekPlan throws on non-OK", async () => {
    server.use(
      http.get("/api/families/f-1/weeks/2026-05-04", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    await expect(wpApi.getWeekPlan("f-1", "2026-05-04")).rejects.toThrow();
  });

  it("createWeekPlan POSTs and returns", async () => {
    let method = "";
    server.use(
      http.post("/api/families/f-1/weeks/2026-05-04", ({ request }) => {
        method = request.method;
        return HttpResponse.json({ id: "wp-1" });
      }),
    );
    await wpApi.createWeekPlan("f-1", "2026-05-04");
    expect(method).toBe("POST");
  });

  it("addSuggestion sends mealId in body", async () => {
    let body: unknown;
    server.use(
      http.post(
        "/api/families/f-1/days/d-1/suggestions",
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: "s-1" });
        },
      ),
    );
    await wpApi.addSuggestion("f-1", "d-1", "m-1");
    expect(body).toEqual({ mealId: "m-1" });
  });

  it("approveSuggestion uses PATCH and resolves on 200", async () => {
    let method = "";
    server.use(
      http.patch("/api/families/f-1/suggestions/s-1/approve", ({ request }) => {
        method = request.method;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await expect(
      wpApi.approveSuggestion("f-1", "s-1"),
    ).resolves.toBeUndefined();
    expect(method).toBe("PATCH");
  });

  it("removeSuggestion uses DELETE", async () => {
    let method = "";
    server.use(
      http.delete("/api/families/f-1/suggestions/s-1", ({ request }) => {
        method = request.method;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await wpApi.removeSuggestion("f-1", "s-1");
    expect(method).toBe("DELETE");
  });

  it("moveSuggestion sends PATCH with dayPlanId", async () => {
    let method = "";
    let body: unknown;
    server.use(
      http.patch(
        "/api/families/f-1/suggestions/s-1/move",
        async ({ request }) => {
          method = request.method;
          body = await request.json();
          return HttpResponse.json({ id: "s-1", dayPlanId: "d-2" });
        },
      ),
    );
    const result = await wpApi.moveSuggestion("f-1", "s-1", "d-2");
    expect(method).toBe("PATCH");
    expect(body).toEqual({ dayPlanId: "d-2" });
    expect(result).toEqual({ id: "s-1", dayPlanId: "d-2" });
  });

  it("moveSuggestion surfaces server error message on failure", async () => {
    server.use(
      http.patch("/api/families/f-1/suggestions/s-1/move", () =>
        HttpResponse.json(
          { error: "Cannot move an approved suggestion" },
          { status: 400 },
        ),
      ),
    );
    await expect(wpApi.moveSuggestion("f-1", "s-1", "d-2")).rejects.toThrow(
      /approved/,
    );
  });
});
