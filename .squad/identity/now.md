---
updated_at: 2026-07-01T00:30:00.000Z
focus_area: Sprints 1–4 SHIPPED & milestones CLOSED. Sprint 5 (security/CI hardening) LAUNCHED — 4 agents running. Then live devcontainer demo.
active_issues: [42, 43, 49, 51]
---

# What We're Focused On

## Running now — Sprint 5 (milestone #5): #42 #43 #49 #51 (all off origin/main@206e57d)
Security & CI hardening follow-ups. Disjoint files → all parallel. Each: isolated worktree + draft PR + gate before merge.
- **#51** Livingston — HMAC-SHA256 + server-side pepper for agent+display credential hashing; fail-closed `CREDENTIAL_PEPPER` in config; lazy legacy SHA-256→HMAC rehash-on-verify (no key invalidation). Touches agentCredential.ts, apiKey.ts, auth.ts, config. → **Frank security gate** (critical).
- **#49** Livingston — make `safeAudit` dropped audit writes OBSERVABLE (structured error log, no secrets; stays non-throwing). Touches agentAuth.ts (+agent.ts call sites). → **Frank security-adjacent gate**.
- **#43** Livingston — `app.set('trust proxy', <finite hop>)` before rate limit so IP limits work behind ingress; NOT blanket `true`; `TRUST_PROXY` config. Touches index.ts. → **Frank security-adjacent gate**.
- **#42** Basher — CI: `prisma migrate deploy` against the Postgres service + schema-drift check. Touches ci.yml. → **Rusty infra gate**.

After Sprint 5 merges: START DEVCONTAINER + open browser to live app (user request).

## Sprint 4 — ✅ 3/3 SHIPPED, MERGED & CLOSED (milestone CLOSED)
#25(PR63,Rusty infra-gate) · #26(PR64,Rusty infra re-gate; integrated on #63 pinning: migrate Job pinned, kustomization single-pin, deploy.sh migrate-first+rollback-guard) · #5(PR65,Frank sec-gate; coordinator fixed 2 TS build errors [agent.ts mealId scope, mcp ToolResult index sig] + regenerated pnpm-lock). Main green @206e57d.

## Sprint 3 — ✅ 8/8 SHIPPED & CLOSED (milestone CLOSED)
#24 #22 #7 #16 #6(+#50) #17 #27 #15. All gates passed.

## Sprints 1+2 — ✅ SHIPPED (milestones CLOSED)
S1: #9/#11/#12/#13/#23/#32. S2: #14/#8/#10/#20/#18/#19/#6(core).

## GitHub state: milestones Sprint 1–4 CLOSED; Sprint 5 OPEN (4 issues). No other open issues.
## Carry-forward debt: #23 lockfile drift being partly resolved via container-regen; #42 (in Sprint 5) closes the migration-validation gap.
