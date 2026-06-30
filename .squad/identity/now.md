---
updated_at: 2026-06-30T22:30:00.000Z
focus_area: Sprint 1 SHIPPED. Sprint 2 Wave A SHIPPED. Wave B in progress.
active_issues: [6, 8, 18, 19, 20]
---

# What We're Focused On

## Sprint 1 — ✅ COMPLETE
All 6 PRs (#33-#38) merged to `main`, issues #9/#11/#12/#13/#23/#32 closed, main CI green. Worktrees/branches cleaned.

## Sprint 2 — IN PROGRESS (Contracts, tests, MCP security model)
Verification of record = CI. Writes via `brandonmartinez`. One isolated worktree + draft PR per issue off `origin/main`.

### Wave A — ✅ SHIPPED (merged to main)
- **#14** Linus — web request<T> consolidation — PR #39 merged, #14 closed.
- **#8** Livingston — meal difficulty BACKEND+SHARED — PR #40 merged, #8 stays OPEN (web UI = Wave B).
- **#10** Frank — scoped rate limits — PR #41 merged after Rusty gate APPROVE, #10 closed.
- Merge-recovery note: #39/#40 were briefly closed-unmerged (branch deleted before confirming merge); recovered from head SHAs, re-merged. Lesson: `gh pr ready` BEFORE `gh pr merge`; never delete branch before MERGED confirmed.

### Wave B — running
- **#8-web** Linus — difficulty UI — `squad/8-meal-difficulty-web` (draft PR -> coordinator flips ready+merges)
- **#20** Yen — web component tests — `squad/20-web-component-tests`
- **#18** Yen — API route-handler tests — `squad/18-api-coverage`
- **#6** Frank — MCP scoped agent credentials — `squad/6-mcp-credentials` -> stays DRAFT until Rusty independent gate
- **#19** Yen — web page tests — DEFERRED until #8-web merges (tests MealsPage/MealFormPage etc.)

### Gates
- #6 is security-touching + Frank-authored -> independent (Rusty) review gate before ready.

### Follow-ups filed (Wave A)
- **#42** Basher — CI run `prisma migrate deploy` against Postgres service (validate hand-authored migrations).
- **#43** Basher/infra — Express `trust proxy` so IP-keyed rate limits key on real client behind ingress.

### Carry-forward debt
- #23 CI uses --no-frozen-lockfile; regen+commit pnpm-lock.yaml from devcontainer, revert to frozen.
- #23 eslint no-explicit-any / no-unused-vars at warn; tighten to error later.
- #6/#8 migrations are hand-authored (no DB in env); unvalidated until #42 lands.
