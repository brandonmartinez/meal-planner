---
updated_at: 2026-06-30T21:30:00.000Z
focus_area: Sprint 1 complete — all 6 issues implemented, draft PRs open, security gates passed, CI green
active_issues: [9, 11, 12, 13, 23, 32]
---

# What We're Focused On

**Sprint 1 COMPLETE.** Six issues, one isolated worktree + PR each off `origin/main`. CI is verification of record (all green). GitHub writes via `brandonmartinez`.

## PRs
| Issue | Owner | PR | CI | State |
|-------|-------|----|----|-------|
| #9 IDOR family-scoping (P1) | Livingston | #37 | green | READY (Frank security gate PASSED) |
| #11 fail-closed prod secrets | Frank | #34 | green | READY (Rusty Lead gate PASSED) |
| #12 centralize shared DTOs | Rusty | #38 | green | draft |
| #13 align Node >=22 | Basher | #36 | green | draft |
| #23 lint in CI (+ eslint setup) | Basher | #35 | green | draft |
| #32 devcontainer default | Basher | #33 | green | draft |

## Follow-ups (tech debt, not blocking)
- #23: CI uses `pnpm install --no-frozen-lockfile` (host runs barred, no live devcontainer). Once #32 merges, regenerate + commit `pnpm-lock.yaml` from the devcontainer and revert to frozen install.
- #23: eslint `no-explicit-any` + `no-unused-vars` set to `warn` (6 pre-existing). Tighten to `error` in a future cleanup pass.
- #9: optional defense-in-depth — switch TOCTOU two-query mutations to atomic updateMany/deleteMany + count.
- #12: optional `Serialize<T>` helper to give the API a compile-time tie to the shared DTOs.

## Next decision for Brandon
Non-security PRs (#12/#13/#23/#32) are draft pending your review/flip-to-ready or merge call.
