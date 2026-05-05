/**
 * Date utilities for week calculations.
 * Weeks start on Monday.
 */

export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Days to subtract to land on Monday: Sun -> 6, Mon -> 0, Tue -> 1, ...
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateOnly(dateStr: string): Date {
  // Accepts "YYYY-MM-DD" or full ISO; always interpreted as local midnight.
  const ymd = dateStr.slice(0, 10);
  return new Date(ymd + "T00:00:00");
}

export function getCurrentWeekStart(): string {
  return toDateString(getMondayOfWeek(new Date()));
}

export function formatWeekRange(weekStart: string): string {
  const start = parseDateOnly(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = end.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${startStr} – ${endStr}`;
}

export function shiftWeek(weekStart: string, offsetWeeks: number): string {
  const d = parseDateOnly(weekStart);
  d.setDate(d.getDate() + offsetWeeks * 7);
  return toDateString(d);
}
