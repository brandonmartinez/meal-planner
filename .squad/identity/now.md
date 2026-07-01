---
updated_at: 2026-07-01T01:00:00.000Z
focus_area: ALL SPRINTS COMPLETE (1–5). Every milestone CLOSED, 0 open issues, main green. Live demo running in an isolated container off latest main.
active_issues: []
---

# What We're Focused On

## 🎉 Program complete — Sprints 1–5 all SHIPPED, MERGED & CLOSED
All GitHub milestones (Sprint 1–5) closed. **0 open issues.** `origin/main` green (CI test job) @ b179f23.

- **Sprint 1** — #9 IDOR family-scoping · #11 fail-closed prod secrets · #12 shared API DTOs · #13 Node version align · #23 lint-in-CI · #32 devcontainer default.
- **Sprint 2** — #8 #10 #14 #18 #19 #20 · #6 (core).
- **Sprint 3** — #7 #16 #17 #22 #24 #27 · #6(+#50) · #15 (a11y names/loaders, last-to-merge). All security/a11y gates passed.
- **Sprint 4** — #25 pin k8s image tags · #26 migrations-out-of-startup (integrated on #25 single-pin) · #5 MCP server package (packages/mcp). Infra + security gates passed.
- **Sprint 5** — #42 CI migration validation · #43 trust proxy · #49 observable audit drops · #51 peppered HMAC credential hashing. All Frank/Rusty gates passed.

## Live demo (final user request) — ✅ RUNNING
Latest `origin/main` (b179f23) running in an **isolated** setup that never touches the user's main checkout or the pre-existing `mrdj-*` devcontainer:
- Detached worktree `../demo-main`; docker network `mealdemo`; Postgres `mealdemo-db` (postgres:16); app container `mealdemo-app` (node:22) running `pnpm dev`.
- Host ports: **web → http://localhost:5174**, api → http://localhost:3002 (container-internal 5173/3001; vite proxies /api). 5173/3001 left to the user's existing devcontainer.
- Migrations applied + demo data created (family "The Demo Family", 12 meals, a scheduled/approved current week).
- **Ephemeral dev-only login** added to `demo-main` ONLY (uncommitted, `NODE_ENV!==production` guarded): GET `/api/auth/dev-login` mints a demo session cookie. Never committed, never on main.

## Carry-forward debt (noted, NOT filed — do not action without user ask)
- Frank N2: `middleware/rateLimit.ts` apiKeyFingerprint still bare SHA-256 with a stale comment (rate-limit bucket key, not a verification path).

## Teardown (when user is done with the demo)
`docker rm -f mealdemo-app mealdemo-db && docker network rm mealdemo && git worktree remove ../demo-main --force`
