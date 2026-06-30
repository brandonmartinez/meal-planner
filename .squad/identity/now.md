---
updated_at: 2026-06-30T21:40:00.000Z
focus_area: Sprint 1 SHIPPED (all merged to main). Sprint 2 Wave A in progress.
active_issues: [14, 8, 10, 6, 18, 19, 20]
---

# What We're Focused On

## Sprint 1 — ✅ COMPLETE
All 6 PRs (#33-#38) merged to `main`, issues #9/#11/#12/#13/#23/#32 closed, main CI green. Worktrees/branches cleaned.

## Sprint 2 — IN PROGRESS (Contracts, tests, MCP security model)
Verification of record = CI. Writes via `brandonmartinez`. One isolated worktree + draft PR per issue off `origin/main`.

### Wave A (running)
- **#14** Linus — web request<T> consolidation — `squad/14-web-request-helper`
- **#8** Livingston — meal difficulty BACKEND+SHARED (web UI deferred to Wave B) — `squad/8-meal-difficulty`
- **#10** Frank — scoped rate limits — `squad/10-scoped-rate-limits` -> independent gate (Rusty)

### Wave B (queued — dependency-gated)
- **#6** Frank — MCP scoped agent credentials (after #8+#10; design pass w/ Rusty first; independent gate)
- **#8-web** Linus — difficulty UI (after #14 + #8)
- **#18** Yen — API route-handler tests (after #8 + #10)
- **#19** Yen — web page tests (after #14 + #8-web)
- **#20** Yen — web component tests (after #14)

### Gates
- #10, #6 are security-touching and Frank-authored -> independent (non-Frank) review gate before ready.

### Carry-forward debt
- #23 CI uses --no-frozen-lockfile; regen+commit pnpm-lock.yaml from devcontainer, revert to frozen.
- #23 eslint no-explicit-any / no-unused-vars at warn; tighten to error later.
