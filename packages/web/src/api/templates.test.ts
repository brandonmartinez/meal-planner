import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import * as templatesApi from "./templates";

describe("templates api client", () => {
  it("listTemplates unwraps the { templates } envelope into a plain array", async () => {
    server.use(
      http.get("/api/families/f-1/templates", () =>
        HttpResponse.json({
          templates: [
            {
              id: "tpl-1",
              name: "Busy Week",
              familyId: "f-1",
              description: "Fast weeknights",
              entries: [
                { id: "e-1", templateId: "tpl-1", dayOfWeek: 0, mealId: "m-1" },
              ],
            },
            {
              id: "tpl-2",
              name: "Sunday Reset",
              familyId: "f-1",
              description: null,
              entries: [],
            },
          ],
        }),
      ),
    );
    const templates = await templatesApi.listTemplates("f-1");
    expect(templates).toHaveLength(2);
    expect(templates[0]).toMatchObject({ id: "tpl-1", name: "Busy Week" });
    expect(templates[0].entries).toHaveLength(1);
  });

  it("getTemplate returns the template by id", async () => {
    server.use(
      http.get("/api/families/f-1/templates/tpl-1", () =>
        HttpResponse.json({
          id: "tpl-1",
          name: "Busy Week",
          familyId: "f-1",
          description: null,
          entries: [],
        }),
      ),
    );
    const template = await templatesApi.getTemplate("f-1", "tpl-1");
    expect(template).toMatchObject({ id: "tpl-1", name: "Busy Week" });
  });

  it("getTemplate throws an ApiError with status 404 when missing", async () => {
    server.use(
      http.get("/api/families/f-1/templates/nope", () =>
        HttpResponse.json({ error: "template not found" }, { status: 404 }),
      ),
    );
    await expect(templatesApi.getTemplate("f-1", "nope")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("createTemplate POSTs the name/description/entries and returns the created template", async () => {
    let captured: unknown;
    server.use(
      http.post("/api/families/f-1/templates", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json(
          {
            id: "tpl-9",
            name: "New Plan",
            familyId: "f-1",
            description: "Blurb",
            entries: [
              { id: "e-9", templateId: "tpl-9", dayOfWeek: 0, mealId: "m-1" },
            ],
          },
          { status: 201 },
        );
      }),
    );
    const created = await templatesApi.createTemplate("f-1", {
      name: "New Plan",
      description: "Blurb",
      entries: [{ dayOfWeek: 0, mealId: "m-1" }],
    });
    expect(captured).toEqual({
      name: "New Plan",
      description: "Blurb",
      entries: [{ dayOfWeek: 0, mealId: "m-1" }],
    });
    expect(created).toMatchObject({ id: "tpl-9", name: "New Plan" });
  });

  it("createTemplate surfaces a 409 name collision as an ApiError", async () => {
    server.use(
      http.post("/api/families/f-1/templates", () =>
        HttpResponse.json({ error: "name already exists" }, { status: 409 }),
      ),
    );
    await expect(
      templatesApi.createTemplate("f-1", { name: "Busy Week" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("updateTemplate PATCHes only the changed fields (entries replace-all)", async () => {
    let captured: unknown;
    server.use(
      http.patch("/api/families/f-1/templates/tpl-1", async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          id: "tpl-1",
          name: "Busy Week",
          familyId: "f-1",
          description: null,
          entries: [
            { id: "e-2", templateId: "tpl-1", dayOfWeek: 2, mealId: "m-3" },
          ],
        });
      }),
    );
    const updated = await templatesApi.updateTemplate("f-1", "tpl-1", {
      entries: [{ dayOfWeek: 2, mealId: "m-3" }],
    });
    expect(captured).toEqual({ entries: [{ dayOfWeek: 2, mealId: "m-3" }] });
    expect(updated.entries).toHaveLength(1);
  });

  it("deleteTemplate issues a DELETE and resolves on 204", async () => {
    let called = false;
    server.use(
      http.delete("/api/families/f-1/templates/tpl-1", () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(
      templatesApi.deleteTemplate("f-1", "tpl-1"),
    ).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it("deleteTemplate surfaces a 403 as an ApiError (parent-gated)", async () => {
    server.use(
      http.delete("/api/families/f-1/templates/tpl-1", () =>
        HttpResponse.json({ error: "parent role required" }, { status: 403 }),
      ),
    );
    await expect(
      templatesApi.deleteTemplate("f-1", "tpl-1"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("applyTemplate POSTs targetWeekStart + existingMode and returns the week plan", async () => {
    let captured: unknown;
    server.use(
      http.post(
        "/api/families/f-1/templates/tpl-1/apply",
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json(
            { id: "wp-1", weekStart: "2026-07-06", familyId: "f-1", days: [] },
            { status: 201 },
          );
        },
      ),
    );
    const plan = await templatesApi.applyTemplate(
      "f-1",
      "tpl-1",
      "2026-07-06",
      "skip",
    );
    expect(captured).toEqual({
      targetWeekStart: "2026-07-06",
      existingMode: "skip",
    });
    expect(plan).toMatchObject({ id: "wp-1", weekStart: "2026-07-06" });
  });

  it("applyTemplate with the default (error) mode surfaces a 409 conflict as an ApiError", async () => {
    server.use(
      http.post("/api/families/f-1/templates/tpl-1/apply", () =>
        HttpResponse.json(
          {
            error:
              "Target week already has suggestions; retry with existingMode 'skip' or 'replace'",
          },
          { status: 409 },
        ),
      ),
    );
    await expect(
      templatesApi.applyTemplate("f-1", "tpl-1", "2026-07-06"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("applyTemplate surfaces a 422 empty-template error as an ApiError", async () => {
    server.use(
      http.post("/api/families/f-1/templates/tpl-1/apply", () =>
        HttpResponse.json({ error: "template has no entries" }, { status: 422 }),
      ),
    );
    await expect(
      templatesApi.applyTemplate("f-1", "tpl-1", "2026-07-06", "replace"),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("templateEntryCount and templateDayCount summarize entries", () => {
    const template = {
      id: "tpl-1",
      name: "Busy Week",
      familyId: "f-1",
      entries: [
        { id: "e-1", templateId: "tpl-1", dayOfWeek: 0, mealId: "m-1" },
        { id: "e-2", templateId: "tpl-1", dayOfWeek: 0, mealId: "m-2" },
        { id: "e-3", templateId: "tpl-1", dayOfWeek: 3, mealId: "m-3" },
      ],
    };
    expect(templatesApi.templateEntryCount(template)).toBe(3);
    expect(templatesApi.templateDayCount(template)).toBe(2);
  });
});
