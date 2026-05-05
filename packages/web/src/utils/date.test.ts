import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMondayOfWeek,
  toDateString,
  parseDateOnly,
  getCurrentWeekStart,
  formatWeekRange,
  shiftWeek,
} from "./date";

describe("getMondayOfWeek", () => {
  it.each([
    ["2026-05-04T12:00:00", "2026-05-04"], // Monday
    ["2026-05-05T12:00:00", "2026-05-04"], // Tuesday
    ["2026-05-09T12:00:00", "2026-05-04"], // Saturday
    ["2026-05-10T12:00:00", "2026-05-04"], // Sunday
  ])("returns the Monday for %s", (input, expected) => {
    const monday = getMondayOfWeek(new Date(input));
    expect(toDateString(monday)).toBe(expected);
    expect(monday.getDay()).toBe(1);
    expect(monday.getHours()).toBe(0);
  });

  it("does not mutate the input date", () => {
    const input = new Date("2026-05-05T12:00:00");
    const before = input.getTime();
    getMondayOfWeek(input);
    expect(input.getTime()).toBe(before);
  });
});

describe("toDateString / parseDateOnly", () => {
  it("round-trips a date string at local midnight", () => {
    const d = parseDateOnly("2026-05-04");
    expect(toDateString(d)).toBe("2026-05-04");
    expect(d.getHours()).toBe(0);
  });

  it("parseDateOnly accepts a full ISO timestamp by taking the date prefix", () => {
    const d = parseDateOnly("2026-05-04T15:30:00.000Z");
    expect(toDateString(d)).toBe("2026-05-04");
  });
});

describe("getCurrentWeekStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the Monday of the current week", () => {
    // Tuesday, May 5 2026
    vi.setSystemTime(new Date("2026-05-05T10:00:00"));
    expect(getCurrentWeekStart()).toBe("2026-05-04");
  });
});

describe("shiftWeek", () => {
  it("shifts by N weeks", () => {
    expect(shiftWeek("2026-05-04", 1)).toBe("2026-05-11");
    expect(shiftWeek("2026-05-04", -1)).toBe("2026-04-27");
    expect(shiftWeek("2026-05-04", 0)).toBe("2026-05-04");
  });
});

describe("formatWeekRange", () => {
  it("returns a human-readable range with a single year suffix", () => {
    const out = formatWeekRange("2026-05-04");
    expect(out).toMatch(/May 4/);
    expect(out).toMatch(/May 10, 2026/);
    expect(out).toContain("–");
  });
});
