/**
 * Demo family definition — the single source of truth for the seeded demo
 * dataset AND the dev-login pass-through user. Both `prisma/seed.ts` and the
 * dev-login auth route import from here so the "demo user" is the same identity
 * everywhere (dev-login find-or-creates this user even if the seed hasn't run).
 *
 * These are fixed, non-secret dev identities. The demo users have no password
 * and no real Google account — they exist only for local development and demos.
 */

export type DemoRole = "PARENT" | "CHILD";

export interface DemoMemberSeed {
  email: string;
  name: string;
  role: DemoRole;
}

/** The parent used by the dev-login pass-through. */
export const DEMO_USER_EMAIL = "demo@mealplanner.local";

export const DEMO_FAMILY_NAME = "The Rivera Family";
export const DEMO_FAMILY_TIMEZONE = "America/New_York";

/** Two parents + three kids, all in the demo family. */
export const DEMO_MEMBERS: readonly DemoMemberSeed[] = [
  { email: DEMO_USER_EMAIL, name: "Jamie Rivera", role: "PARENT" },
  { email: "sam.rivera@mealplanner.local", name: "Sam Rivera", role: "PARENT" },
  { email: "mia.rivera@mealplanner.local", name: "Mia Rivera", role: "CHILD" },
  { email: "noah.rivera@mealplanner.local", name: "Noah Rivera", role: "CHILD" },
  { email: "ella.rivera@mealplanner.local", name: "Ella Rivera", role: "CHILD" },
] as const;

export const DEMO_MEMBER_EMAILS: readonly string[] = DEMO_MEMBERS.map(
  (m) => m.email,
);

/** The single demo parent that dev-login authenticates as. */
export const DEMO_USER = DEMO_MEMBERS[0];
