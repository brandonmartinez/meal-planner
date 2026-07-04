# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Frontend Dev. Owns `packages/web`. Use the `request<T>()` pattern and MSW handlers (see `.github/instructions/web.instructions.md`). Web tests run Vitest with `globals: true`.

## Recent Updates

📌 Team initialized on 2026-06-30 (Ocean's Eleven cast).

📌 Recent update (2026-06-30T15:08:40-04:00): Frontend review filed #14 (request<T>), #15 (a11y forms), #16 (a11y modals), and #17 (API key UX).

📌 Recent update (2026-06-30T15:28:32-04:00): #27 includes web acceptance for a "Recent" badge on meals browse plus difficulty display from #8.

📌 Sprint 2 batch (2026-06-30T18:32:22-04:00): Two PRs. (1) #14 `PR #39` — centralized all `packages/web` API calls through a typed `request<T>()` + `ApiError` client (`packages/web/src/api/client.ts`) and removed raw `fetch` (the OAuth redirect stays a documented exception). (2) #8 web UI `PR #44` — surfaced the nullable meal difficulty: a `DifficultyBadge` for display plus a form select to set/clear EASY/MEDIUM/HARD, on top of Livingston's backend/shared work. Both CLOSED.

📌 Sprint 3 batch (2026-06-30T21:57:00-04:00): A11y + UX sweep across `packages/web`, all merged & closed. #16 — accessible modals (MealPicker, ImportMealsDialog); a11y gate PASSED. #6 web UI — agent-credential management surface (Frank owned the backend). #27 web — recent-meal badge on meals browse (Livingston backend). #17 — API key copy + last-used display. #15 (PR #62, last to merge) — accessible names + loading-status across web pages; a11y gate PASSED; de-raced 3 loading-status a11y tests before merge.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- 2026-07-01: #70 Meal Library UI (PR #73) — MealPicker Recent/Difficulty badges + MealsPage zoned card layout (impeccable layout pass). a11y gate APPROVE. Merged.
📌 Team update (2026-07-02T10:16:59-0400): Eight epic #91 recipe-management issues were filed under Linus ownership for future frontend planning. — logged by Scribe
📌 Team update (2026-07-02T19:53:00Z): Wave 3 shipped #101 recipe detail page in PR #130; MealPicker linking deferred to avoid nested-interactive a11y risk. Wave 4 launched #103 imageUrl wiring from green main 67c4f42 with CSV lockstep + Helmet CSP review — logged by Scribe.

📌 Team update (2026-07-02T19:16:33-04:00): Sprint 2 Waves 4–6 complete. #103 (external recipe imageUrl) shipped PR #133 SHA ba7b628 with shared MealThumbnail component, scheme allowlist, minimal CSP broadening (img-src: "https:"), graceful degradation, full REST + agent + MCP parity, CSV round-trip. #108 (tags/categories UI) shipped PR #135 SHA b16810d with TokenField (native datalist + pills), MealTagList (compact display, capped + overflow), useTaxonomy hook (DRY, fails soft), filter controls (OR-within-facet, AND-across-facets), 327 web tests green, lint 0 errors. v0.4.0 recipe-metadata vertical complete. — logged by Scribe

- 2026-07-02: #102 Local cooking mode (PR pending) — immersive `/meals/:mealId/cook` route + "Start cooking" CTA on MealDetailPage. Large-text steps, ingredient checklist, per-step completion, per-step countdown timers. ALL client-side (React useState, in-memory) — no backend/localStorage/server progress. New: `pages/CookingModePage.tsx`, `components/CookTimer.tsx`, `hooks/useCountdown.ts` + colocated tests. Web gate green: 356 tests (42 files), lint clean. a11y: native checkboxes/labels, aria-labelled timer buttons, single role="alert" on completion (no per-tick spam), 44×44 targets. CSP intact (bundled React, no inline). **Reusable learning:** userEvent v14 clicks DEADLOCK under vi.useFakeTimers() (0-delay setTimeout never reached by advanceTimersByTime(0)) → use fireEvent.click (sync, auto-act) for clicks in fake-timer tests, reserve act() for advanceTimersByTime. Web lane only.

📌 Team update (2026-07-02T21:37:00-0400): Sprint 3 Wave 1 complete. Linus shipped #102 local cooking mode (frontend-only `/meals/:mealId/cook` + timers); Basher shipped #104 image asset backend; Livingston shipped #114 repeat previous week planning. Merges: #104 PR #137 SHA a9a5df5; #102 PR #138 SHA 6acf0d0; #114 PR #139 SHA 68b6637. — logged by Scribe

📌 Team update (2026-07-03T01:15:59-0400): Sprint 3 Wave 2 complete. #105 meal image upload UI merged via PR #143 (9bb530d): MealImageField link/upload mode, web image API + MSW handlers, unified imageUrl, and thumbnails. — logged by Scribe

## 2026-07-03T02:23:57-0400 — Wave 3 shipped

- Shipped #110 collections UI; PR #145 squash `e3b2651` merged after Saul #116 and Livingston #120. State reconciled by Scribe.

## 2026-07-03T03:07:00-0400 — Wave 4 shipped

- Shipped #117 planning templates UI; PR #147 squash `ed355be` merged. Added `/templates` management and WeekPlan apply flow with `existingMode:error` first, 409 confirmation, skip/replace choices, and parent-gated destructive actions.

📌 Team update (2026-07-03T17:14:44Z): Merged UI wave (PR #157 unapprove toggle + photo stamp, PR #159 responsive toolbar, PR #160 photo stamp label fix + 5 additional design decisions: password manager suppression, collections redesign, meal form polish, repeat-week modal, template modal pagination) — Linus

📌 Team update (2026-07-03T17:36:35-0400): PR #161 DayCard stamp hotfix Round 2 merged to main (f5e2662). Fixed invisible-stamp regression from #160 by using `size-16 sm:size-20` shorthand (both dimensions definite 64px/80px, no wrapper, no absolute positioning). Tests assert size-16, object-cover, no absolute. Web lint 0, tests 527/527. — logged by Scribe
