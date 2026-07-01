import { getMondayOfWeek } from "./weekPlan.js";

/**
 * Pure, DB-free date math for the demo seed (`prisma/seed.ts`). Extracted here
 * so the date-relative week anchoring is unit-testable without a live database.
 *
 * The seed is DATE-RELATIVE: every week plan is anchored to "this Monday" at
 * run time, so a fresh seed (or `db:reset`, which reseeds) never trails behind
 * the calendar. The Monday math reuses {@link getMondayOfWeek} from the
 * weekPlan service so the seed and the runtime agree byte-for-byte on what
 * "the Monday of a week" is (UTC midnight, `getUTCDay() === 1`).
 */

/**
 * How many weeks of meal plans to seed, relative to the current week. Negative
 * offsets are past weeks (approved history), 0 is the current week (approved),
 * positive offsets are future weeks (left pending).
 */
export const WEEK_OFFSETS = [-2, -1, 0, 1] as const;

/**
 * Returns a new Date `days` after `base`, normalized to UTC midnight
 * (00:00:00.000). Never mutates `base`. `days` may be negative.
 */
export function addUTCDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** A single day within a seeded week. `dayIndex` is 0=Monday .. 6=Sunday. */
export interface SeedDay {
  dayIndex: number;
  /** UTC-midnight calendar date for this day. */
  date: Date;
}

/** A single week to seed, anchored relative to the current Monday. */
export interface SeedWeek {
  /** Offset from the current week (see {@link WEEK_OFFSETS}). */
  offset: number;
  /** Monday of this week at UTC midnight (satisfies the WeekPlan constraint). */
  weekStart: Date;
  /** True for weeks after the current one — these are left unapproved/pending. */
  isFuture: boolean;
  /** The seven days Mon..Sun of this week, each at UTC midnight. */
  days: SeedDay[];
}

/** The full date-relative schedule the seed materializes. */
export interface SeedSchedule {
  /** Monday of the current week (UTC midnight) — the anchor for everything. */
  anchorMonday: Date;
  /** One entry per {@link WEEK_OFFSETS} value, in offset order. */
  weeks: SeedWeek[];
}

/**
 * Builds the date-relative seed schedule for a given "now". Anchors to the
 * Monday of `now`'s week (via {@link getMondayOfWeek}) and expands each
 * {@link WEEK_OFFSETS} entry into a Monday-anchored week of seven UTC-midnight
 * days. Pure: given the same `now` it always returns the same schedule and
 * never touches the database or wall clock.
 */
export function buildSeedSchedule(now: Date): SeedSchedule {
  const anchorMonday = getMondayOfWeek(now);
  const weeks: SeedWeek[] = WEEK_OFFSETS.map((offset) => {
    const weekStart = addUTCDays(anchorMonday, offset * 7);
    const days: SeedDay[] = Array.from({ length: 7 }, (_, dayIndex) => ({
      dayIndex,
      date: addUTCDays(weekStart, dayIndex),
    }));
    return { offset, weekStart, isFuture: offset > 0, days };
  });
  return { anchorMonday, weeks };
}
