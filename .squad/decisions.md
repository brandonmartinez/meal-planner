# Squad Decisions

## Active Decisions

### 2026-06-30T18-32-22: Sprint 2 batch — shared/API contracts, test coverage, and the MCP credential model (#14/#8/#10/#20/#18/#19/#6)
**By:** coordinator (logged by Scribe)
**What:** Second implementation sprint, same standing rules: one isolated worktree + draft PR per issue, CI is verification of record (no host runs), GitHub writes via the `brandonmartinez` account, security work gated by an independent reviewer. Coordinator flipped each PR ready and squash-merged after CI went green.
**References:** PRs #39, #40, #41, #44, #45, #46, #47, #48; issues #14, #8, #10, #20, #18, #19, #6; follow-ups #42, #43, #49, #50, #51
**Why:** Requested by Brandon Martinez — continue implementation of the reviewed backlog, advancing the shared/API contract surface, test coverage, and the MCP security foundation.

Shipped (merged to main unless noted):
- **#14 (Linus, PR #39):** Centralized all `packages/web` API calls through a typed `request<T>()` + `ApiError` client (`packages/web/src/api/client.ts`); removed raw `fetch` (OAuth redirect kept as a documented exception). CLOSED.
- **#8 (Livingston backend+shared PR #40; Linus web UI PR #44):** Nullable meal `difficulty` (EASY/MEDIUM/HARD) end-to-end — Prisma enum + nullable column (hand-authored migration), shared type/constant, Zod validation, service threading, and web display/set/clear (`DifficultyBadge` + form select). CLOSED.
- **#10 (Frank, PR #41):** Scoped rate limits for auth / invite-join / display surfaces; the display limiter keys on IP + a SHA-256 fingerprint of the api-key (never the raw key); generic 429 with no existence oracle. Independent Rusty gate → APPROVE. CLOSED.
- **#20 (Yen, PR #45):** Component tests for ImportMealsDialog, Layout, Navigation, ThemeToggle, WeekSelector. CLOSED.
- **#18 (Yen, PR #46):** Route-handler tests for auth/families/grocery/health/meals/weekPlan via a new `getRouteHandler` helper; service layer mocked. CLOSED.
- **#19 (Yen, PR #48):** Page-level tests for Login/CreateFamily/FamilySettings/GroceryList/WeekPlan (Meals/MealForm excluded — covered by #44). CLOSED.
- **#6 (Frank, PR #47):** Scoped MCP agent credentials — a separate `AgentCredential` model (family-scoped; scopes/role, createdBy, expiresAt, lastUsed, revokedAt), `authenticateAgent` middleware, `/api/agent` routes (read/schedule/approve), an allow+deny audit log, approver capture on both JWT and agent paths, a distinct rate limiter, and rotation/revocation/expiry (hand-authored migration). Independent Rusty gate → APPROVE (all 11 criteria). **Stays OPEN** — parent-facing credential-management HTTP endpoints deferred to #50.

Key decisions & lessons:
- **Merge-safety rule adopted:** PRs #39/#40 were briefly closed-unmerged because branches were deleted before MERGED was confirmed. New rule: run `gh pr ready` BEFORE `gh pr merge`, and verify `state=MERGED` BEFORE deleting any branch/worktree. Both recovered from head SHAs — no work lost.
- **Self-approval constraint:** every agent PR shares author `brandonmartinez`, so `gh pr review --approve` is blocked. Gate verdicts are posted as review comments instead; Squad-layer independence (reviewer ≠ author) is still satisfied.
- **CI caught real bugs:** #20 had an ambiguous `/load example/i` query (also matched "Download example template") → anchored to `/^load example$/i`; #19 error-banner tests asserted a fallback string but pages surface `ApiError.message` → MSW error bodies aligned. Both fixed by coordinator.
- **Integration ordering:** #6 changed `approveSuggestion` to take an actor arg for the audit trail; #18's route test was updated to the new 3-arg contract before merging #6 (synced main into #6's branch and re-ran CI to catch it).
- **No-host-runs + migrations:** #6/#8 migrations were hand-authored (no DB available) and CI does not run `migrate deploy` → tracked as #42.

Follow-ups filed: #42 (CI migrate-deploy validation, Basher), #43 (trust proxy, Basher/infra), #49 (HMAC/KDF credential hashing, Frank), #50 (agent-credential management endpoints + UI, Frank/Linus), #51 (observable safeAudit failures, Frank).

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
