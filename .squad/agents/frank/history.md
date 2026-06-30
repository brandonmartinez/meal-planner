# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Security / Auth Engineer. Owns the security posture: auth chain (`authenticateJWT` → `requireMembership` → `requireRole`), API key lifecycle (hashed only — `packages/api/src/services/apiKey.ts`), secret handling (env vars in `config/index.ts`), and the public Magic Mirror surface (`authenticateApiKey`). Pairs with Livingston on auth code; Rai owns responsible-AI/content (separate lane). Joined the team after the initial cast.

## Recent Updates

📌 Joined the team on 2026-06-30 as Security / Auth Engineer (Ocean's Eleven cast).

📌 Recent update (2026-06-30T15:08:40-04:00): Security review filed #6 (MCP security), #10 (rate limits), #11 (fail-closed secrets), and co-sourced #9 (IDOR) and #21 (SSH).

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
