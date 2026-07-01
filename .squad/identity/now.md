---
updated_at: 2026-07-01T00:05:00.000Z
focus_area: Sprint 1+2+3 SHIPPED. Sprint 4 in flight — #25/#26 gated (PRs #63/#64, overlap to integrate), #5 MCP running. Goal: finish through Sprint 4.
active_issues: [5, 25, 26]
---

# What We're Focused On

## Sprint 3 — ✅ 8/8 SHIPPED, MERGED & CLOSED
#24(PR52) · #22(PR53,sec) · #7(PR55) · #16(PR56,a11y) · #6-mgmt+#50(PR54,sec) · #17(PR57,sec) · #27-be(PR58) · #27-web(PR59→#27 CLOSED) · #6-web(PR60→#6 CLOSED) · **#15(PR62, Yen a11y-gate APPROVE, de-raced 3 loading-status tests → CI green → #15 CLOSED)**. Main green.

## Running now — Sprint 4 (#5 #25 #26)
Plan: `~/.copilot/session-state/.../plan.md`.
- **#25** Basher — pin k8s immutable image tags → **PR #63 (draft)**. Independent Rusty infra gate running.
- **#26** Basher — migrations out of multi-replica startup (one-shot k8s Job) → **PR #64 (draft)**. Independent Rusty infra gate running.
  - ⚠️ #63 & #64 OVERLAP: both rewrite `k8s/deploy.sh`, modify `k8s/deployment.yaml`, add `k8s/README.md`. Integration: merge one, sync main into the other, reconcile deploy.sh (enforce pinned non-latest tag AND run migrate Job first, migrate Job shares pinned image via kustomization images[].newTag), single README, re-run CI, then merge.
- **#5** Rusty/Livingston — `packages/mcp` MCP server (deps #7+#6 DONE); stdio v1, HTTP API client (no Prisma import), Zod tools, mocked-API tests → Rusty design + Frank security gate. RUNNING.

## Sprint 1+2 — ✅ SHIPPED
S1: #9/#11/#12/#13/#23/#32. S2: #14/#8/#10/#20/#18/#19/#6(core). All merged, main green, logged.

## Follow-ups filed (backlog): #42 #43 #49 #50(→ folded into #6) #51
## Carry-forward debt: #23 lockfile/frozen + eslint warns; hand-authored migrations unvalidated until #42.
