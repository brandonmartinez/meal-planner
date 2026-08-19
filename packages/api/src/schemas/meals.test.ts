import { describe, it, expect } from "vitest";
import { imageUrlSchema, listMealsQuerySchema } from "./meals.js";

const UUID_A = "8365a7fa-1c2d-4e5f-9a0b-1c2d3e4f5a6b";
const UUID_B = "abcd1234-5678-4abc-9def-0123456789ab";

describe("listMealsQuerySchema", () => {
  it("preserves a mixed-case search query and applies shared list defaults", () => {
    expect(listMealsQuerySchema.parse({ search: "ProDuCe" })).toEqual({
      search: "ProDuCe",
      sort: "name",
      order: "asc",
      limit: 25,
      offset: 0,
    });
  });
});

describe("imageUrlSchema", () => {
  // ── valid cases ─────────────────────────────────────────────────────────────

  it("accepts an https URL", () => {
    expect(() =>
      imageUrlSchema.parse("https://cdn.example.com/tacos.jpg"),
    ).not.toThrow();
  });

  it("accepts an http URL", () => {
    expect(() =>
      imageUrlSchema.parse("http://cdn.example.com/img.png"),
    ).not.toThrow();
  });

  it("accepts a same-origin asset path with real UUID segments", () => {
    const path = `/api/families/${UUID_A}/images/${UUID_B}`;
    expect(imageUrlSchema.parse(path)).toBe(path);
  });

  it("accepts a same-origin asset path with upper-case UUID segments", () => {
    const upper = (s: string) => s.toUpperCase();
    const path = `/api/families/${upper(UUID_A)}/images/${upper(UUID_B)}`;
    expect(imageUrlSchema.parse(path)).toBe(path);
  });

  // ── absolute-URL rejection cases ────────────────────────────────────────────

  it("rejects javascript: scheme", () => {
    expect(() => imageUrlSchema.parse("javascript:alert(1)")).toThrow();
  });

  it("rejects data: scheme", () => {
    expect(() =>
      imageUrlSchema.parse("data:text/html,<script>alert(1)</script>"),
    ).toThrow();
  });

  it("rejects file: scheme", () => {
    expect(() => imageUrlSchema.parse("file:///etc/passwd")).toThrow();
  });

  it("rejects ftp: scheme", () => {
    expect(() =>
      imageUrlSchema.parse("ftp://example.com/image.png"),
    ).toThrow();
  });

  it("rejects protocol-relative URL", () => {
    expect(() =>
      imageUrlSchema.parse("//cdn.example.com/img.png"),
    ).toThrow();
  });

  it("rejects a plain non-URL string", () => {
    expect(() => imageUrlSchema.parse("not-a-url")).toThrow();
  });

  // ── asset-path rejection cases ───────────────────────────────────────────────

  it("rejects asset path with non-UUID familyId (plain slug)", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/fam1/images/${UUID_B}`),
    ).toThrow();
  });

  it("rejects asset path with non-UUID assetId (plain slug)", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/${UUID_A}/images/img1`),
    ).toThrow();
  });

  it("rejects plain dot-dot traversal in familyId segment (#186)", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/../images/${UUID_B}`),
    ).toThrow();
  });

  it("rejects plain dot-dot in assetId segment", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/${UUID_A}/images/..`),
    ).toThrow();
  });

  it("rejects percent-encoded traversal %2e%2e in familyId segment (#188)", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/%2e%2e/images/${UUID_B}`),
    ).toThrow();
  });

  it("rejects percent-encoded slash %2f inside a segment (#188)", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/${UUID_A}%2f../images/${UUID_B}`),
    ).toThrow();
  });

  it("rejects percent-encoded traversal %2e%2e%2f before assetId (#188)", () => {
    expect(() =>
      imageUrlSchema.parse(
        `/api/families/${UUID_A}/images/%2e%2e%2f${UUID_B}`,
      ),
    ).toThrow();
  });

  it("rejects internal whitespace in familyId segment (#188)", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/${UUID_A} /images/${UUID_B}`),
    ).toThrow();
  });

  it("rejects internal whitespace in assetId segment (#188)", () => {
    // Space inside the UUID segment (not trailing — .trim() would swallow trailing whitespace)
    expect(() =>
      imageUrlSchema.parse(
        `/api/families/${UUID_A}/images/abcd1234 5678-4abc-9def-0123456789ab`,
      ),
    ).toThrow();
  });

  it("rejects backslash in familyId segment (#188)", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/${UUID_A}\\evil/images/${UUID_B}`),
    ).toThrow();
  });

  it("rejects backslash in assetId segment (#188)", () => {
    expect(() =>
      imageUrlSchema.parse(`/api/families/${UUID_A}/images/${UUID_B}\\x`),
    ).toThrow();
  });

  it("rejects asset path with a query string", () => {
    expect(() =>
      imageUrlSchema.parse(
        `/api/families/${UUID_A}/images/${UUID_B}?x=1`,
      ),
    ).toThrow();
  });

  it("rejects asset path with a fragment", () => {
    expect(() =>
      imageUrlSchema.parse(
        `/api/families/${UUID_A}/images/${UUID_B}#section`,
      ),
    ).toThrow();
  });

  it("rejects asset path with extra path segments after assetId", () => {
    expect(() =>
      imageUrlSchema.parse(
        `/api/families/${UUID_A}/images/${UUID_B}/extra`,
      ),
    ).toThrow();
  });
});
