---
updated_at: 2026-06-30T23:10:00.000Z
focus_area: Sprint 1 SHIPPED. Sprint 2 SHIPPED. Awaiting Sprint 3 direction.
active_issues: [6]
---

# What We're Focused On

## Sprint 1 — ✅ COMPLETE
All 6 PRs (#33-#38) merged to `main`, issues #9/#11/#12/#13/#23/#32 closed, main CI green. Worktrees/branches cleaned.

## Sprint 2 — ✅ SHIPPED (Contracts, tests, MCP security model)
Verification of record = CI. Writes via `brandonmartinez`. Isolated worktree + draft PR per issue. All merged to `main`; main `test` job green on final HEAD (26b0d30).

### Wave A
- **#14** Linus — web request<T> consolidation — PR #39 — closed.
- **#8** Livingston — meal difficulty backend+shared — PR #40.
- **#10** Frank — scoped rate limits — PR #41 — Rusty gate APPROVE — closed.

### Wave B
- **#8-web** Linus — difficulty UI — PR #44 — **#8 CLOSED** (backend+web complete).
- **#20** Yen — web component tests — PR #45 — closed. (coordinator fixed an ambiguous `/load example/i` query.)
- **#18** Yen — API route-handler tests — PR #46 — closed.
- **#19** Yen — web page tests — PR #48 — closed. (coordinator aligned error-banner MSW bodies with surfaced ApiError message.)
- **#6** Frank — MCP scoped agent credentials — PR #47 — **Rusty gate APPROVE** — merged. **#6 stays OPEN** (mgmt HTTP endpoints deferred → #50).

### Integration fix
- #6's `approveSuggestion` gained an actor arg for the audit trail; coordinator updated #18's route test assertion to the new 3-arg contract before merging #6.

### Gates run
- #10 (Rusty→APPROVE), #6 (Rusty→APPROVE). Both Frank-authored security work, independently gated. No lockouts triggered this sprint.

## Follow-ups filed
- **#42** Basher — CI `prisma migrate deploy` validation (hand-authored migrations unvalidated against a live DB).
- **#43** Basher/infra — Express `trust proxy` for IP-keyed rate limits behind ingress.
- **#49** Frank — HMAC/KDF + server-side pepper for credential hashing (hardening).
- **#50** Frank/Linus — parent-facing agent-credential management endpoints + UI (completes #6's deferred AC).
- **#51** Frank — make dropped `safeAudit` audit-log writes observable.

## Carry-forward debt
- #23 CI uses --no-frozen-lockfile; regen+commit pnpm-lock.yaml from devcontainer, revert to frozen.
- #23 eslint no-explicit-any / no-unused-vars at warn; tighten to error later.
- #6/#8 migrations are hand-authored (no DB in env); unvalidated until #42 lands.
