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

  it("unapproveSuggestion uses PATCH to .../unapprove and resolves on 200", async () => {
    let method = "";
    server.use(
      http.patch("/api/families/f-1/suggestions/s-1/unapprove", ({ request }) => {
        method = request.method;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await expect(
      wpApi.unapproveSuggestion("f-1", "s-1"),
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

describe("resolveSuggestionChoices (#226)", () => {
  it("sends PATCH with selections to the /choices endpoint and returns the suggestion", async () => {
    let method = "";
    let body: unknown;
    server.use(
      http.patch(
        "/api/families/f-1/suggestions/s-1/choices",
        async ({ request }) => {
          method = request.method;
          body = await request.json();
          return HttpResponse.json({ id: "s-1", choices: [{ slotId: "slot-1", optionId: "opt-1" }] });
        },
      ),
    );
    const result = await wpApi.resolveSuggestionChoices("f-1", "s-1", [
      { slotId: "slot-1", optionId: "opt-1" },
    ]);
    expect(method).toBe("PATCH");
    expect(body).toEqual({ selections: [{ slotId: "slot-1", optionId: "opt-1" }] });
    expect((result as { id: string }).id).toBe("s-1");
  });

  it("surfaces a server error on failure", async () => {
    server.use(
      http.patch("/api/families/f-1/suggestions/s-1/choices", () =>
        HttpResponse.json({ error: "suggestion not found" }, { status: 404 }),
      ),
    );
    await expect(
      wpApi.resolveSuggestionChoices("f-1", "s-1", []),
    ).rejects.toThrow(/suggestion not found/);
  });
});

describe("repeatWeek (#226)", () => {
  it("sends POST with sourceWeekStart and existingMode, returns the new plan", async () => {
    let method = "";
    let body: unknown;
    server.use(
      http.post(
        "/api/families/f-1/weeks/2026-07-06/repeat",
        async ({ request }) => {
          method = request.method;
          body = await request.json();
          return HttpResponse.json({ id: "wp-2", weekStart: "2026-07-06", days: [] });
        },
      ),
    );
    const plan = await wpApi.repeatWeek("f-1", "2026-07-06", "2026-06-29", "skip");
    expect(method).toBe("POST");
    expect(body).toEqual({ sourceWeekStart: "2026-06-29", existingMode: "skip" });
    expect((plan as { id: string }).id).toBe("wp-2");
  });

  it("omits existingMode when not provided", async () => {
    let body: unknown;
    server.use(
      http.post("/api/families/f-1/weeks/2026-07-06/repeat", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "wp-2", weekStart: "2026-07-06", days: [] });
      }),
    );
    await wpApi.repeatWeek("f-1", "2026-07-06", "2026-06-29");
    expect((body as { existingMode?: unknown }).existingMode).toBeUndefined();
  });

  it("surfaces a 409 conflict error from the server", async () => {
    server.use(
      http.post("/api/families/f-1/weeks/2026-07-06/repeat", () =>
        HttpResponse.json({ error: "Target week already has suggestions" }, { status: 409 }),
      ),
    );
    await expect(
      wpApi.repeatWeek("f-1", "2026-07-06", "2026-06-29"),
    ).rejects.toThrow(/Target week already has suggestions/);
  });

  it("returns a plan that preserves snapshotted choices on its suggestions", async () => {
    const planWithChoices = {
      id: "wp-2",
      weekStart: "2026-07-06",
      days: [
        {
          id: "d-1",
          date: "2026-07-07",
          weekPlanId: "wp-2",
          suggestions: [
            {
              id: "s-copy",
              mealId: "m-1",
              dayPlanId: "d-1",
              userId: "user-1",
              approved: false,
              meal: { id: "m-1", name: "Pasta", placeholderKind: null },
              choices: [
                {
                  id: "choice-copy",
                  suggestionId: "s-copy",
                  slotId: "slot-1",
                  optionId: "opt-1",
                  slotName: "Protein",
                  optionName: "Chicken",
                  createdAt: "2026-07-06T00:00:00.000Z",
                },
              ],
            },
          ],
        },
      ],
    };
    server.use(
      http.post("/api/families/f-1/weeks/2026-07-06/repeat", () =>
        HttpResponse.json(planWithChoices),
      ),
    );
    const plan = await wpApi.repeatWeek("f-1", "2026-07-06", "2026-06-29");
    const copiedSuggestion = (plan as typeof planWithChoices).days[0].suggestions[0];
    expect(copiedSuggestion.choices?.[0].optionName).toBe("Chicken");
  });
});
