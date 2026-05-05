import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../tests/msw/server";
import * as gApi from "./grocery";

describe("grocery api client", () => {
  it("generateGroceryList POSTs and returns the list", async () => {
    let method = "";
    server.use(
      http.post("/api/families/f-1/weeks/2026-05-04/grocery", ({ request }) => {
        method = request.method;
        return HttpResponse.json({ id: "gl-1" });
      }),
    );
    await gApi.generateGroceryList("f-1", "2026-05-04");
    expect(method).toBe("POST");
  });

  it("getGroceryListByWeek returns null on 404", async () => {
    server.use(
      http.get(
        "/api/families/f-1/weeks/2026-05-04/grocery",
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    const r = await gApi.getGroceryListByWeek("f-1", "2026-05-04");
    expect(r).toBeNull();
  });

  it("getGroceryListByWeek throws on non-404 errors", async () => {
    server.use(
      http.get(
        "/api/families/f-1/weeks/2026-05-04/grocery",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    await expect(
      gApi.getGroceryListByWeek("f-1", "2026-05-04"),
    ).rejects.toThrow();
  });

  it("toggleGroceryItem PATCHes the checked state", async () => {
    let body: unknown;
    server.use(
      http.patch(
        "/api/families/f-1/grocery/gl-1/items/it-1",
        async ({ request }) => {
          body = await request.json();
          return new HttpResponse(null, { status: 200 });
        },
      ),
    );
    await gApi.toggleGroceryItem("f-1", "gl-1", "it-1", true);
    expect(body).toEqual({ checked: true });
  });

  it("addCustomItem returns the new item", async () => {
    server.use(
      http.post("/api/families/f-1/grocery/gl-1/items", () =>
        HttpResponse.json({ id: "i-1", name: "Bananas" }),
      ),
    );
    const r = await gApi.addCustomItem("f-1", "gl-1", { name: "Bananas" });
    expect(r.name).toBe("Bananas");
  });

  it("removeGroceryItem uses DELETE", async () => {
    let method = "";
    server.use(
      http.delete(
        "/api/families/f-1/grocery/gl-1/items/it-1",
        ({ request }) => {
          method = request.method;
          return new HttpResponse(null, { status: 200 });
        },
      ),
    );
    await gApi.removeGroceryItem("f-1", "gl-1", "it-1");
    expect(method).toBe("DELETE");
  });
});
