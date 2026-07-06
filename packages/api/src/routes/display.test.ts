import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/helpers/prisma.js";
import { buildReq, buildRes, buildNext } from "../../tests/helpers/express.js";
import { getRouteHandler, buildFullRes } from "../../tests/helpers/router.js";
import { authenticateApiKey } from "../middleware/auth.js";

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("../services/imageStorage.js", () => ({
  imageStorage: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Import after the mock so the route's transitive deps see the mocked prisma.
const { displayRouter } = await import("./display.js");
const { imageStorage } = await import("../services/imageStorage.js");

// The route is a single GET /meals handler — pull it out of the router stack
// so we can call it directly with a mocked req/res.
type RouteHandler = (
  req: ReturnType<typeof buildReq>,
  res: ReturnType<typeof buildRes>,
  next: ReturnType<typeof buildNext>,
) => unknown | Promise<unknown>;

interface RouterLayer {
  route?: { stack: { handle: RouteHandler }[] };
}

const layer = (displayRouter as unknown as { stack: RouterLayer[] }).stack.find(
  (l) => l.route,
);
if (!layer?.route) throw new Error("display route not found");
// Last middleware in the route stack is the actual handler (after auth).
const mealsHandler: RouteHandler = layer.route.stack[layer.route.stack.length - 1].handle;

const imageHandler = getRouteHandler(
  displayRouter as never,
  "get",
  "/images/:assetId",
) as RouteHandler;

const FAMILY_ID = "fam-1";
const FAMILY_NAME = "Martinez";
const FAMILY_B = "fam-other";
const ASSET_ID = "asset-abc-123";
const PNG_BYTES = Buffer.from("fake-png-data");

function buildAuthedReq(
  query: Record<string, string> = {},
  extra: Record<string, unknown> = {},
) {
  const req = buildReq({ query, ...extra });
  // Simulate authenticateApiKey having attached the familyId.
  (req as unknown as { familyId: string }).familyId = FAMILY_ID;
  return req;
}

function buildImageReq(
  assetId: string,
  extra: Record<string, unknown> = {},
) {
  const req = buildReq({ params: { assetId }, ...extra });
  (req as unknown as { familyId: string }).familyId = FAMILY_ID;
  return req;
}

function buildResWithHeaders() {
  const res = buildRes();
  res.setHeader = vi.fn(() => res) as unknown as typeof res.setHeader;
  res.end = vi.fn(() => res) as unknown as typeof res.end;
  return res;
}


function mockFamily(timezone = "America/Chicago") {
  prismaMock.family.findUnique.mockResolvedValue({
    id: FAMILY_ID,
    name: FAMILY_NAME,
    timezone,
  } as never);
}

interface FakeMeal {
  id: string;
  name: string;
  description: string | null;
  placeholderKind: string | null;
  imageUrl: string | null;
  updatedAt: Date;
}

function fakeDayPlan(
  date: string,
  meals: FakeMeal[] = [],
  weekPlanUpdatedAt = new Date("2026-04-01T00:00:00Z"),
) {
  return {
    id: "dp-" + date,
    date: new Date(date + "T00:00:00Z"),
    weekPlan: { updatedAt: weekPlanUpdatedAt },
    suggestions: meals.map((m, i) => ({
      id: "s-" + date + "-" + i,
      approved: true,
      createdAt: new Date("2026-04-01T00:00:00Z"),
      meal: m,
    })),
  };
}

function regularMeal(over: Partial<FakeMeal> = {}): FakeMeal {
  return {
    id: "m-1",
    name: "Spaghetti",
    description: "Pasta night",
    placeholderKind: null,
    imageUrl: null,
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    ...over,
  };
}

function placeholderMeal(kind: string, over: Partial<FakeMeal> = {}): FakeMeal {
  return {
    id: "m-" + kind.toLowerCase(),
    name: kind,
    description: null,
    placeholderKind: kind,
    imageUrl: null,
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    ...over,
  };
}

function fakeAsset(over: Partial<{ id: string; familyId: string; extension: string; contentType: string }> = {}) {
  return {
    id: ASSET_ID,
    familyId: FAMILY_ID,
    extension: "png",
    contentType: "image/png",
    ...over,
  };
}

beforeEach(() => {
  mockFamily();
  prismaMock.dayPlan.findMany.mockResolvedValue([] as never);
  vi.mocked(imageStorage.get).mockReset();
});

describe("GET /api/display/meals — envelope + family", () => {
  it("returns the family envelope with id, name, timezone", async () => {
    const req = buildAuthedReq({ days: "1" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    expect(res.statusCode).toBe(200);
    const body = res.body as { family: { id: string; name: string; timezone: string } };
    expect(body.family).toEqual({
      id: FAMILY_ID,
      name: FAMILY_NAME,
      timezone: "America/Chicago",
    });
  });

  it("returns Cache-Control and a strong ETag header", async () => {
    const req = buildAuthedReq({ days: "3" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const setHeader = res.setHeader as unknown as { mock: { calls: [string, string][] } };
    const headers = Object.fromEntries(setHeader.mock.calls);
    expect(headers["Cache-Control"]).toBe("private, max-age=60");
    expect(headers["ETag"]).toMatch(/^"[0-9a-f]{64}"$/);
    expect(headers["Vary"]).toBe("x-api-key");
  });
});

describe("GET /api/display/meals — timezone resolution", () => {
  it("uses ?tz= when provided", async () => {
    const req = buildAuthedReq({ days: "1", tz: "Asia/Tokyo" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());
    const body = res.body as { family: { timezone: string } };
    expect(body.family.timezone).toBe("Asia/Tokyo");
  });

  it("falls back to family.timezone when no ?tz=", async () => {
    const req = buildAuthedReq({ days: "1" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());
    const body = res.body as { family: { timezone: string } };
    expect(body.family.timezone).toBe("America/Chicago");
  });

  it("400 INVALID_TIMEZONE on a bad ?tz=", async () => {
    const req = buildAuthedReq({ days: "1", tz: "Not/Real" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: "INVALID_TIMEZONE", message: expect.any(String) },
    });
  });
});

describe("GET /api/display/meals — per-day status", () => {
  it("returns status: 'unplanned' when no day-plan rows exist", async () => {
    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());
    const body = res.body as { meals: { status: string; meals: unknown[] }[] };
    expect(body.meals).toHaveLength(1);
    expect(body.meals[0].status).toBe("unplanned");
    expect(body.meals[0].meals).toEqual([]);
  });

  it("returns status: 'planned' for a day with a real meal, with icon=null", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValue([
      fakeDayPlan("2026-05-04", [regularMeal({ imageUrl: "https://x/img.png" })]),
    ] as never);

    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const body = res.body as {
      meals: {
        status: string;
        meals: { icon: string | null; imageUrl: string | null }[];
      }[];
    };
    expect(body.meals[0].status).toBe("planned");
    expect(body.meals[0].meals[0].icon).toBeNull();
    expect(body.meals[0].meals[0].imageUrl).toBe("https://x/img.png");
  });

  it("does NOT leak cook-history fields (lastCookedOn/timesCooked) on the public display surface", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValue([
      fakeDayPlan("2026-05-04", [regularMeal({ imageUrl: null })]),
    ] as never);

    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const body = res.body as {
      meals: { meals: Record<string, unknown>[] }[];
    };
    const entry = body.meals[0].meals[0];
    // Deny-by-default (parity §3): cook history must never reach the api-key surface.
    expect(entry).not.toHaveProperty("lastCookedOn");
    expect(entry).not.toHaveProperty("timesCooked");
  });

  it("returns status: 'skipped' when only SKIP placeholder is approved (and meals: [])", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValue([
      fakeDayPlan("2026-05-04", [placeholderMeal("SKIP")]),
    ] as never);

    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const body = res.body as { meals: { status: string; meals: unknown[] }[] };
    expect(body.meals[0].status).toBe("skipped");
    // Back-compat: meals stays empty for skipped days.
    expect(body.meals[0].meals).toEqual([]);
  });

  it("returns status: 'planned' when SKIP is mixed with a real meal", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValue([
      fakeDayPlan("2026-05-04", [placeholderMeal("SKIP"), regularMeal()]),
    ] as never);

    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const body = res.body as { meals: { status: string; meals: unknown[] }[] };
    expect(body.meals[0].status).toBe("planned");
    expect(body.meals[0].meals).toHaveLength(2);
  });

  it("populates icon from MEAL_PLACEHOLDERS for placeholder meals (FREE_DAY → emoji)", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValue([
      fakeDayPlan("2026-05-04", [placeholderMeal("FREE_DAY")]),
    ] as never);

    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const body = res.body as {
      meals: { meals: { icon: string | null; placeholderKind: string | null }[] }[];
    };
    expect(body.meals[0].meals[0].placeholderKind).toBe("FREE_DAY");
    expect(typeof body.meals[0].meals[0].icon).toBe("string");
    expect(body.meals[0].meals[0].icon!.length).toBeGreaterThan(0);
  });
});

describe("GET /api/display/meals — error envelope", () => {
  it("400 INVALID_DATE_RANGE when to < from", async () => {
    const req = buildAuthedReq({ from: "2026-05-10", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: "INVALID_DATE_RANGE", message: expect.any(String) },
    });
  });

  it("400 INVALID_QUERY when only `from` is provided", async () => {
    const req = buildAuthedReq({ from: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: "INVALID_QUERY", message: expect.any(String) },
    });
  });

  it("500 INTERNAL_ERROR when prisma rejects", async () => {
    prismaMock.dayPlan.findMany.mockRejectedValue(new Error("db down"));
    const req = buildAuthedReq({ days: "1" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: expect.any(String) },
    });
  });
});

describe("GET /api/display/meals — ETag conditional", () => {
  it("returns 304 when If-None-Match matches the ETag", async () => {
    // First call to grab the ETag.
    const req1 = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res1 = buildResWithHeaders();
    await mealsHandler(req1, res1, buildNext());
    const setHeader1 = res1.setHeader as unknown as {
      mock: { calls: [string, string][] };
    };
    const etag = Object.fromEntries(setHeader1.mock.calls)["ETag"];
    expect(etag).toBeDefined();

    // Second call with If-None-Match — should 304.
    const req2 = buildAuthedReq(
      { from: "2026-05-04", to: "2026-05-04" },
      { headers: { "if-none-match": etag } },
    );
    const res2 = buildResWithHeaders();
    res2.end = vi.fn(() => res2) as unknown as typeof res2.end;
    await mealsHandler(req2, res2, buildNext());
    expect(res2.statusCode).toBe(304);
    expect(res2.body).toBeUndefined();
  });

  it("ETag changes when an included meal's updatedAt changes", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValueOnce([
      fakeDayPlan("2026-05-04", [
        regularMeal({ updatedAt: new Date("2026-05-01T00:00:00Z") }),
      ]),
    ] as never);
    const res1 = buildResWithHeaders();
    await mealsHandler(
      buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" }),
      res1,
      buildNext(),
    );
    const etag1 = Object.fromEntries(
      (res1.setHeader as unknown as { mock: { calls: [string, string][] } }).mock
        .calls,
    )["ETag"];

    prismaMock.dayPlan.findMany.mockResolvedValueOnce([
      fakeDayPlan("2026-05-04", [
        regularMeal({ updatedAt: new Date("2026-05-02T00:00:00Z") }),
      ]),
    ] as never);
    const res2 = buildResWithHeaders();
    await mealsHandler(
      buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" }),
      res2,
      buildNext(),
    );
    const etag2 = Object.fromEntries(
      (res2.setHeader as unknown as { mock: { calls: [string, string][] } }).mock
        .calls,
    )["ETag"];

    expect(etag1).not.toBe(etag2);
  });
});

// ---------------------------------------------------------------------------
// imageUrl rewriting — uploaded images must be rewritten to display route
// ---------------------------------------------------------------------------
describe("GET /api/display/meals — imageUrl rewriting", () => {
  it("rewrites an uploaded (relative) imageUrl to /api/display/images/{assetId}", async () => {
    const uploadedUrl = `/api/families/${FAMILY_ID}/images/${ASSET_ID}`;
    prismaMock.dayPlan.findMany.mockResolvedValue([
      fakeDayPlan("2026-05-04", [regularMeal({ imageUrl: uploadedUrl })]),
    ] as never);

    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const body = res.body as { meals: { meals: { imageUrl: string | null }[] }[] };
    expect(body.meals[0].meals[0].imageUrl).toBe(`/api/display/images/${ASSET_ID}`);
  });

  it("leaves an absolute https:// imageUrl unchanged", async () => {
    const absoluteUrl = "https://example.com/some/image.jpg";
    prismaMock.dayPlan.findMany.mockResolvedValue([
      fakeDayPlan("2026-05-04", [regularMeal({ imageUrl: absoluteUrl })]),
    ] as never);

    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const body = res.body as { meals: { meals: { imageUrl: string | null }[] }[] };
    expect(body.meals[0].meals[0].imageUrl).toBe(absoluteUrl);
  });

  it("leaves a null imageUrl as null", async () => {
    prismaMock.dayPlan.findMany.mockResolvedValue([
      fakeDayPlan("2026-05-04", [regularMeal({ imageUrl: null })]),
    ] as never);

    const req = buildAuthedReq({ from: "2026-05-04", to: "2026-05-04" });
    const res = buildResWithHeaders();
    await mealsHandler(req, res, buildNext());

    const body = res.body as { meals: { meals: { imageUrl: string | null }[] }[] };
    expect(body.meals[0].meals[0].imageUrl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/display/images/:assetId
// ---------------------------------------------------------------------------
describe("GET /api/display/images/:assetId", () => {
  it("200 — returns image bytes with correct headers", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue(fakeAsset() as never);
    vi.mocked(imageStorage.get).mockResolvedValue(PNG_BYTES);

    const req = buildImageReq(ASSET_ID);
    const res = buildFullRes();
    await imageHandler(req, res as never, buildNext());

    expect(res.send).toHaveBeenCalledWith(PNG_BYTES);
    const headers = Object.fromEntries(
      (res.setHeader as ReturnType<typeof vi.fn>).mock.calls as [string, string][],
    );
    expect(headers["Content-Type"]).toBe("image/png");
    expect(headers["Content-Length"]).toBe(String(PNG_BYTES.length));
    expect(headers["ETag"]).toMatch(/^"[0-9a-f]{64}"$/);
    expect(headers["Cache-Control"]).toBe("private, max-age=3600");
  });

  it("304 — returns 304 with no body when If-None-Match matches ETag", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue(fakeAsset() as never);
    vi.mocked(imageStorage.get).mockResolvedValue(PNG_BYTES);

    // First request — get the ETag.
    const req1 = buildImageReq(ASSET_ID);
    const res1 = buildFullRes();
    await imageHandler(req1, res1 as never, buildNext());
    const etag = (
      (res1.setHeader as ReturnType<typeof vi.fn>).mock.calls as [string, string][]
    ).find(([name]) => name === "ETag")?.[1];
    expect(etag).toBeDefined();

    // Second request — conditional GET.
    const req2 = buildImageReq(ASSET_ID, { headers: { "if-none-match": etag } });
    const res2 = buildFullRes();
    await imageHandler(req2, res2 as never, buildNext());
    expect(res2.statusCode).toBe(304);
    expect(res2.send).not.toHaveBeenCalled();
  });

  it("404 — when asset belongs to a different family", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue(
      fakeAsset({ familyId: FAMILY_B }) as never,
    );

    const req = buildImageReq(ASSET_ID);
    const res = buildFullRes();
    await imageHandler(req, res as never, buildNext());
    expect(res.statusCode).toBe(404);
  });

  it("404 — when asset does not exist in the database", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue(null);

    const req = buildImageReq(ASSET_ID);
    const res = buildFullRes();
    await imageHandler(req, res as never, buildNext());
    expect(res.statusCode).toBe(404);
  });

  it("404 — when imageStorage.get throws (file missing on disk)", async () => {
    prismaMock.imageAsset.findUnique.mockResolvedValue(fakeAsset() as never);
    vi.mocked(imageStorage.get).mockRejectedValue(new Error("ENOENT"));

    const req = buildImageReq(ASSET_ID);
    const res = buildFullRes();
    await imageHandler(req, res as never, buildNext());
    expect(res.statusCode).toBe(404);
  });

  it("401 — authenticateApiKey is registered as the auth middleware", () => {
    interface RouteLayer {
      route?: {
        stack: { handle: unknown }[];
        methods: Record<string, boolean>;
        path: string;
      };
    }
    const routerStack = (displayRouter as unknown as { stack: RouteLayer[] }).stack;
    const imageRoute = routerStack.find(
      (l) => l.route?.path === "/images/:assetId" && l.route.methods.get,
    );
    expect(imageRoute).toBeDefined();
    const middlewares = imageRoute!.route!.stack.slice(0, -1).map((s) => s.handle);
    expect(middlewares).toContain(authenticateApiKey);
  });
});
