# Squad Decisions

## Active Decisions

### 2026-06-30T17-04-41: Sprint 1 kickoff batch — 6 issues implemented, each isolated worktree + draft PR (#33-#38)
**By:** coordinator (logged by Scribe)
**What:** Executed the first implementation sprint: six issues built in parallel, each in its own isolated git worktree on a `squad/{n}-{slug}` branch off `origin/main`, each with its own draft PR. Security-touching work was gated by an independent reviewer (author cannot self-gate).
**References:** PRs #33, #34, #35, #36, #37, #38; issues #9, #11, #12, #13, #23, #32
**Why:** Requested by Brandon Martinez — kick off implementation of the reviewed backlog under the standing rules: no host runs (CI is verification of record), GitHub writes via the `brandonmartinez` account, one isolated worktree + draft PR per issue, security work gated.

Durable decisions captured this batch:
- **#32 (Basher, `squad/32-devcontainer-default`, PR #33):** The devcontainer is now the documented default dev/test/run environment; the no-host-runs rule is codified in `CONTRIBUTING.md`. Two approved containerized run paths only — the local devcontainer and CI. Added `scripts/dc-exec.sh` to exec commands inside the running compose `app` service.
- **#9 (Livingston, `squad/9-family-scope-mutations`, PR #37):** Fixed the P1 IDOR on nested suggestion/grocery mutations by enforcing family ownership in the Prisma `where` predicate (non-owned id → 404 before any write), with domain error types mapped to 400/403/404 and Zod on mutation bodies. Frank's independent security gate APPROVED; PR flipped ready-for-review. TOCTOU two-query window accepted as unexploitable (no cross-family re-parent path); atomic updateMany/deleteMany noted as non-blocking defense-in-depth follow-up.
- **#11 (Frank, `squad/11-fail-closed-secrets`, PR #34, draft):** Production fail-closed guard — the API refuses to boot on missing JWT/OAuth secrets in prod. Rusty (Lead) runs the independent security gate (in review) because Frank can't self-gate.
- **#12 (Rusty, `squad/12-shared-dtos`, PR #38, draft):** `@meal-planner/shared` is the single source of truth for serialized API response DTOs (new `src/types/dto.ts`), distinct from Prisma domain shapes. These DTOs are the wire contract MCP must reuse — the foundational MCP contract surface — so no third hand-rolled contract layer grows. Services keep returning Prisma shapes (serialize at the `res.json()` boundary); api-key secret-once invariant preserved.
- **#23 (Basher, `squad/23-ci-lint`, PR #35, draft):** CI now runs lint — added repo-wide `pnpm -r run lint` to the `test` job, fail-fast before build/test, existing build order preserved.
- **#13 (Basher, `squad/13-align-node-version`, PR #36, draft):** Node engine pinned/aligned to `>=22` across the monorepo.

Gate status at hand-off: #9 APPROVED + ready; #11 Lead gate in review; all other PRs remain draft pending review.

### 2026-06-30T19-26-22: Filed 22 GitHub issues from a 6-agent review + 2 requested features (#5-#26)
**By:** coordinator
**What:** Filed 22 GitHub issues from a 6-agent review + 2 requested features (#5-#26)
**References:** #5, #6, #7, #8, #9, #10, #11, #21
**Why:** Requested by Brandon Martinez: add two features + a code review, file issues for everything.

Six specialists reviewed in parallel (Rusty/architecture, Livingston/backend, Frank/security, Linus/frontend, Yen/tests, Basher/infra), producing 24 issue drafts. Two overlapping pairs were merged → 22 issues filed in brandonmartinez/meal-planner, each labeled with type + squad:{owner}.

Requested features:
- #8 Meal difficulty: nullable enum EASY|MEDIUM|HARD on Meal — full vertical (shared -> prisma -> api -> web) [squad:livingston].
- #5 MCP server EPIC [squad:rusty], decomposed into #7 backend endpoint surface [squad:livingston] and #6 scoped agent credentials + audit [squad:frank].

MCP architecture recommendation (NOT yet final — epic #5 carries open questions): a new packages/mcp workspace that routes all reads/writes through the Express API via scoped, role-bearing credentials (NOT direct Prisma/service imports), so auth/authz/audit/rate-limit policy stays in the API. Today's ApiKey is a read-only display credential and must not be reused for agent writes; scheduling/approval are gated and blocked until #6 and #7 land.

Notable review findings: #9 IDOR — nested suggestion/grocery mutations not family-scoped at the service layer (merged Frank+Livingston, security+bug, P1); #10 no rate limiting wired despite express-rate-limit present; #11 no production fail-closed on missing JWT/OAuth secrets; #21 enable key-based SSH on the existing devcontainer (user request, merged with Frank's security checklist).

Tooling: gh writes for this repo require the brandonmartinez account; the default-active brmar_microsoft is pull-only (label/issue creation 404s).

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
