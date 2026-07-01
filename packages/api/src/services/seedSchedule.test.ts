import { describe, it, expect, vi } from "vitest";

// The module under test imports `getMondayOfWeek` from the weekPlan service,
// which pulls in the Prisma client at import time. The seed date math never
// touches the DB, so stub the client to keep these tests pure and DB-free.
vi.mock("../config/database.js", () => ({ default: {} }));

const { addUTCDays, WEEK_OFFSETS, buildSeedSchedule } = await import(
  "./seedSchedule.js"
);
const { getMondayOfWeek } = await import("./weekPlan.js");

const iso = (d: Date) => d.toISOString();
const dayLabel = (d: Date) => d.toISOString().slice(0, 10);

describe("addUTCDays", () => {
  it("advances by whole days and normalizes to UTC midnight", () => {
    const result = addUTCDays(new Date("2026-06-10T13:45:30.500Z"), 3);
    expect(iso(result)).toBe("2026-06-13T00:00:00.000Z");
  });

  it("supports negative offsets and crosses month boundaries", () => {
    const result = addUTCDays(new Date("2026-03-02T06:00:00Z"), -3);
    expect(iso(result)).toBe("2026-02-27T00:00:00.000Z");
  });

  it("crosses year boundaries", () => {
    const result = addUTCDays(new Date("2025-12-31T23:00:00Z"), 1);
    expect(iso(result)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not mutate the input date", () => {
    const input = new Date("2026-06-10T12:00:00Z");
    const before = input.getTime();
    addUTCDays(input, 7);
    expect(input.getTime()).toBe(before);
  });
});

describe("WEEK_OFFSETS", () => {
  it("covers two past weeks, the current week, and one future week", () => {
    expect([...WEEK_OFFSETS]).toEqual([-2, -1, 0, 1]);
  });
});

describe("buildSeedSchedule", () => {
  // A representative "now" that is NOT a Monday (Wednesday), with a nonzero
  // time-of-day, to prove anchoring is independent of the current weekday/time.
  const now = new Date("2026-06-17T15:30:00Z"); // Wednesday

  it("anchors to the same Monday as getMondayOfWeek", () => {
    const { anchorMonday } = buildSeedSchedule(now);
    expect(iso(anchorMonday)).toBe(iso(getMondayOfWeek(now)));
  });

  it("anchors to a Monday at UTC midnight", () => {
    const { anchorMonday } = buildSeedSchedule(now);
    expect(anchorMonday.getUTCDay()).toBe(1);
    expect(anchorMonday.getUTCHours()).toBe(0);
    expect(anchorMonday.getUTCMinutes()).toBe(0);
    expect(anchorMonday.getUTCSeconds()).toBe(0);
    expect(anchorMonday.getUTCMilliseconds()).toBe(0);
  });

  it("produces one week per offset, in order", () => {
    const { weeks } = buildSeedSchedule(now);
    expect(weeks.map((w) => w.offset)).toEqual([...WEEK_OFFSETS]);
  });

  it("places each week's Monday exactly offset*7 days from the anchor", () => {
    const { anchorMonday, weeks } = buildSeedSchedule(now);
    for (const week of weeks) {
      expect(iso(week.weekStart)).toBe(iso(addUTCDays(anchorMonday, week.offset * 7)));
      expect(week.weekStart.getUTCDay()).toBe(1); // Monday
      expect(week.weekStart.getUTCHours()).toBe(0);
    }
  });

  it("marks only weeks after the current one as future", () => {
    const { weeks } = buildSeedSchedule(now);
    for (const week of weeks) {
      expect(week.isFuture).toBe(week.offset > 0);
    }
  });

  it("expands each week into seven consecutive Mon..Sun UTC-midnight days", () => {
    const { weeks } = buildSeedSchedule(now);
    for (const week of weeks) {
      expect(week.days).toHaveLength(7);
      expect(week.days.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      // First day is the week's Monday.
      expect(iso(week.days[0].date)).toBe(iso(week.weekStart));
      // Days are consecutive and normalized to UTC midnight.
      week.days.forEach((day, i) => {
        expect(iso(day.date)).toBe(iso(addUTCDays(week.weekStart, i)));
        expect(day.date.getUTCHours()).toBe(0);
      });
      // Monday (0) through Sunday (6) map to real weekday numbers.
      expect(week.days[0].date.getUTCDay()).toBe(1); // Monday
      expect(week.days[6].date.getUTCDay()).toBe(0); // Sunday
    }
  });

  it("is date-relative: the current week (offset 0) contains 'now'", () => {
    const { weeks } = buildSeedSchedule(now);
    const current = weeks.find((w) => w.offset === 0);
    expect(current).toBeDefined();
    const start = current!.weekStart.getTime();
    const end = addUTCDays(current!.weekStart, 7).getTime();
    expect(now.getTime()).toBeGreaterThanOrEqual(start);
    expect(now.getTime()).toBeLessThan(end);
    // And 'now's calendar day is one of the seven seeded days.
    expect(current!.days.map((d) => dayLabel(d.date))).toContain(dayLabel(now));
  });

  it("is pure: identical input yields identical output", () => {
    const a = buildSeedSchedule(new Date("2026-06-17T15:30:00Z"));
    const b = buildSeedSchedule(new Date("2026-06-17T15:30:00Z"));
    expect(iso(a.anchorMonday)).toBe(iso(b.anchorMonday));
    expect(a.weeks.map((w) => iso(w.weekStart))).toEqual(
      b.weeks.map((w) => iso(w.weekStart)),
    );
  });

  it("does not mutate the input date", () => {
    const input = new Date("2026-06-17T15:30:00Z");
    const before = input.getTime();
    buildSeedSchedule(input);
    expect(input.getTime()).toBe(before);
  });

  it("handles a Sunday 'now' by anchoring to the preceding Monday", () => {
    const sunday = new Date("2026-06-21T23:59:59Z"); // Sunday
    const { anchorMonday, weeks } = buildSeedSchedule(sunday);
    expect(dayLabel(anchorMonday)).toBe("2026-06-15"); // preceding Monday
    const current = weeks.find((w) => w.offset === 0)!;
    expect(current.days.map((d) => dayLabel(d.date))).toContain(
      dayLabel(sunday),
    );
  });
});
