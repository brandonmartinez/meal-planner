---
updated_at: 2026-06-30T21:05:00.000Z
focus_area: Sprint 1 — all 6 issues implemented; PRs open; #9 ready (gate passed), #11 gate in review
active_issues: [9, 11, 12, 13, 23, 32]
---

# What We're Focused On

**Sprint 1 — all six issues implemented, one draft PR each off `origin/main`, in isolated worktrees.**
Verification of record = CI. GitHub writes via `brandonmartinez`.

## PRs
| Issue | Owner | PR | State |
|-------|-------|----|-------|
| #32 devcontainer default | Basher | #33 | draft |
| #11 fail-closed prod secrets | Frank | #34 | draft — Rusty Lead gate in review |
| #23 lint in CI | Basher | #35 | draft |
| #13 align Node >=22 | Basher | #36 | draft |
| #9 IDOR family-scoping (P1) | Livingston | #37 | READY — Frank security gate PASSED |
| #12 centralize shared DTOs | Rusty | #38 | draft (foundational for MCP) |

## Gates
- #9: Frank APPROVE (no lockout) -> PR #37 flipped ready.
- #11: security-touching + Frank-authored -> Rusty (Lead) independent gate in progress; flip ready on pass.

## Notes
- team.md stack line reconciled to Node 22+ (matches #13).
- Non-security PRs (#32/#23/#13/#12) left draft pending Brandon's review call.
