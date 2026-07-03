import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import * as taxonomyApi from "./taxonomy";

describe("taxonomy api client", () => {
  it("listTags unwraps the { tags } envelope into a plain array", async () => {
    server.use(
      http.get("/api/families/f-1/tags", () =>
        HttpResponse.json({
          tags: [
            { id: "t-1", name: "Weeknight", familyId: "f-1" },
            { id: "t-2", name: "Vegetarian", familyId: "f-1" },
          ],
        }),
      ),
    );
    const tags = await taxonomyApi.listTags("f-1");
    expect(tags).toEqual([
      { id: "t-1", name: "Weeknight", familyId: "f-1" },
      { id: "t-2", name: "Vegetarian", familyId: "f-1" },
    ]);
  });

  it("listTags propagates the parsed backend error message", async () => {
    server.use(
      http.get("/api/families/f-1/tags", () =>
        HttpResponse.json({ error: "family not found" }, { status: 404 }),
      ),
    );
    await expect(taxonomyApi.listTags("f-1")).rejects.toThrow("family not found");
  });
});
