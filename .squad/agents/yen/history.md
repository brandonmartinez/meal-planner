# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Tester / QA. Owns test coverage across all packages. API tests: `globals: false` + `prismaMock` helper (no real PrismaClient). Web tests: `globals: true` + MSW handlers. Tests colocated with source. The `test-author` agent shares these patterns.

## Recent Updates

📌 Team initialized on 2026-06-30 (Ocean's Eleven cast).

📌 Recent update (2026-06-30T15:08:40-04:00): Test-coverage review filed #18 (route tests), #19 (page tests), and #20 (component tests).

📌 Sprint 2 batch (2026-06-30T18:32:22-04:00): Landed all three coverage issues. #20 `PR #45` — component tests for ImportMealsDialog/Layout/Navigation/ThemeToggle/WeekSelector. #18 `PR #46` — route-handler tests for auth/families/grocery/health/meals/weekPlan via a new `getRouteHandler` helper, service layer mocked. #19 `PR #48` — page-level tests for Login/CreateFamily/FamilySettings/GroceryList/WeekPlan (Meals/MealForm excluded — covered by #44). CI surfaced two real bugs the coordinator fixed: an ambiguous `/load example/i` query (also matched "Download example template") → anchored to `/^load example$/i`; and #19 error-banner tests assuming a fallback string when pages actually surface `ApiError.message` → MSW error bodies aligned. All CLOSED.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
