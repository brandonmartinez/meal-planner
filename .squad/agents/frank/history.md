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

📌 Sprint 1 batch (2026-06-30T17:04:41-04:00): Two roles this sprint. (1) Authored #11 `squad/11-fail-closed-secrets` PR #34 — production fail-closed guard so the API refuses to boot on missing JWT/OAuth secrets in prod. Left draft; Rusty (Lead) runs the independent security gate since I can't self-gate. (2) Served as the independent security gate on #9 (author was Livingston): APPROVED PR #37 — all six acceptance criteria met, 404-before-mutation family scoping, no bypass paths, no secret/PII logging. Rulings: TOCTOU check-then-act ACCEPTED (no cross-family re-parent path; recommended atomic updateMany/deleteMany as non-blocking defense-in-depth); the tightened suggester-or-parent `removeSuggestion` ruled in-scope (least-privilege).

📌 Sprint 2 batch (2026-06-30T18:32:22-04:00): Two security features, both passing Rusty's independent gate. (1) #10 `PR #41` — scoped rate limits for auth / invite-join / display surfaces; the display limiter keys on IP + a SHA-256 fingerprint of the api-key (never the raw key), and 429s stay generic so there's no existence oracle. (2) #6 `PR #47` — scoped MCP agent credentials: a separate `AgentCredential` model (family-scoped; scopes/role, createdBy, expiresAt, lastUsed, revokedAt), `authenticateAgent` middleware, `/api/agent` routes (read/schedule/approve), an allow+deny audit log, approver capture on both JWT and agent paths, a distinct rate limiter, and rotation/revocation/expiry (hand-authored migration). #10 CLOSED; #6 stays OPEN — parent-facing management endpoints deferred to #50. Filed follow-ups #49 (HMAC/KDF credential hashing), #50 (mgmt endpoints + UI), #51 (observable safeAudit failures).

📌 Sprint 3 batch (2026-06-30T21:57:00-04:00): Backend half of #6 — agent-credential management endpoints (Linus carried the UI; also closed #50). Independent security gate PASSED.

📌 Sprint 4 batch (2026-06-30T21:57:01-04:00): Independent security gate on Rusty's #5 (MCP server package `packages/mcp`, PR #65) → APPROVE.

📌 Sprint 5 batch (2026-06-30T21:57:02-04:00): Ran the independent security gates on Livingston's three PRs → all APPROVE. #43 (PR #67, trust proxy), #49 (PR #68, observable audit drops — `safeRecordAgentAudit` wrapper, 6-field allowlist `console.error`, 18 silent `catch {}` sites replaced, fail-open preserved), #51 (PR #69, peppered HMAC-SHA256 credential hashing — `utils/credentialHash.ts`, lazy legacy-rehash, `CREDENTIAL_PEPPER` fail-closed in prod, no schema change). N2 debt (not filed): `middleware/rateLimit.ts` `apiKeyFingerprint` still bare SHA-256 with a stale comment.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
