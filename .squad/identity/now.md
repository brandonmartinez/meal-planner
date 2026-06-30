---
updated_at: 2026-06-30T23:40:00.000Z
focus_area: Sprint 1+2 SHIPPED. Sprint 3 Wave 1 running. Then Sprint 4. Goal: finish through Sprint 4.
active_issues: [6, 7, 15, 16, 17, 22, 24, 27, 5, 25, 26]
---

# What We're Focused On

## Running now — Sprint 3 (8 issues: #6 #7 #15 #16 #17 #22 #24 #27)
Plan: `~/.copilot/session-state/.../plan.md`. Conflict rule: parallel across disjoint files, serialize within shared files (FamilySettingsPage: #17→#6-web→#15; Meals/ImportDialog: #16→#27-web→#15; shared/services: #7→#27-be).

### Wave 1 (running)
- **#7** Livingston — MCP backend endpoints (current/prev week, schedule-by-date, approve-by-family, Zod, DTOs) — `squad/7-mcp-backend-endpoints`
- **#22** Basher — harden prod Docker image (non-root, frozen lockfile) — `squad/22-harden-docker-image` → security gate
- **#24** Basher — compose drift — `squad/24-compose-drift`
- **#16** Linus — accessible modals (MealPicker, ImportMealsDialog) — `squad/16-accessible-modals` → a11y gate
- **#6-be** Frank — agent-cred mgmt endpoints (closes #50; completes #6) — `squad/6-agent-cred-mgmt` → security gate

### Wave 2 (queued): #27-be (after #7); #17 then #6-web (FamilySettings chain, after #16)
### Wave 3 (queued): #27-web (after #27-be+#16); #15 LAST (touches all pages) → a11y gate
Close on merge: #7 #22 #24 #16 #17 #27 #15; #6(+#50) when mgmt be+web both land.

## Then — Sprint 4 (#5 #25 #26)
- #25 Basher — pin k8s immutable image tags; #26 Basher — migrations out of multi-replica startup (both infra, independent)
- #5 Rusty/Livingston — `packages/mcp` MCP server (DEPENDS on #7 + #6); stdio v1, HTTP API client, Zod tools, mocked-API tests → Rusty design + Frank security gate

## Sprint 1+2 — ✅ SHIPPED
S1: #9/#11/#12/#13/#23/#32. S2: #14/#8/#10/#20/#18/#19/#6(core). All merged, main green, logged.

## Follow-ups filed (backlog): #42 #43 #49 #50(→ folded into #6) #51
## Carry-forward debt: #23 lockfile/frozen + eslint warns; hand-authored migrations unvalidated until #42.
