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
