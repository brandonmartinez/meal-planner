---
updated_at: 2026-06-30T23:18:00.000Z
focus_area: Sprint 1+2 SHIPPED. Sprint 3 Waves 1-2 DONE; Wave 3 running. Then #15, then Sprint 4. Goal: finish through Sprint 4.
active_issues: [6, 7, 15, 16, 17, 22, 24, 27, 5, 25, 26]
---

# What We're Focused On

## Running now — Sprint 3 (8 issues: #6 #7 #15 #16 #17 #22 #24 #27)
Plan: `~/.copilot/session-state/.../plan.md`. Conflict rule: parallel across disjoint files, serialize within shared files (FamilySettingsPage: #17→#6-web→#15; Meals/ImportDialog: #16→#27-web→#15; shared/services: #7→#27-be).

### Wave 1 ✅ MERGED & CLOSED
- #24 (PR52) · #22 (PR53, sec-gate) · #7 (PR55) · #16 (PR56, a11y-gate) · #6-mgmt+#50 (PR54, sec-gate).

### Wave 2 ✅ MERGED & CLOSED
- #17 (PR57, sec-gate APPROVE) · #27-be (PR58, Part of #27).

### Wave 3 (running)
- **#6-web** Linus — agent-cred mgmt UI (FamilySettingsPage) — `squad/6-agent-cred-web` → sec-gate → Closes #6
- **#27-web** Linus — recent badge (MealsPage) — `squad/27-recent-indicator-web` → Closes #27

### Wave 4 (queued): #15 LAST (touches all web pages) → a11y gate
Close on merge: #7 #22 #24 #16 #17 #27 #15; #6(+#50) when mgmt be+web both land.

## Then — Sprint 4 (#5 #25 #26)
- #25 Basher — pin k8s immutable image tags; #26 Basher — migrations out of multi-replica startup (both infra, independent)
- #5 Rusty/Livingston — `packages/mcp` MCP server (DEPENDS on #7 + #6); stdio v1, HTTP API client, Zod tools, mocked-API tests → Rusty design + Frank security gate

## Sprint 1+2 — ✅ SHIPPED
S1: #9/#11/#12/#13/#23/#32. S2: #14/#8/#10/#20/#18/#19/#6(core). All merged, main green, logged.

## Follow-ups filed (backlog): #42 #43 #49 #50(→ folded into #6) #51
## Carry-forward debt: #23 lockfile/frozen + eslint warns; hand-authored migrations unvalidated until #42.
