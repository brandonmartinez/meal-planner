# Squad Decisions

## Active Decisions

> Archive gate 2026-07-03T01:15:59-0400: no entries older than 2026-06-26T01:15:59-04:00 were eligible; see [archive gate report](decisions/archive/2026-07-03T01-15-59-0400-no-eligible-entries.md).

### 2026-07-01: MCP HTTP transport — Bearer accept + WWW-Authenticate + RFC 9728 stub, scoped-key model retained (#87)

Requested by Brandon Martinez. Follow-up to #81. The hosted **Streamable HTTP** transport authenticated with a custom `x-agent-key` header; that works but diverges from the MCP Authorization convention for HTTP transports, which models the MCP server as an **OAuth 2.1 Resource Server** — credentials in the standard `Authorization: Bearer` header, and an unauthenticated request answered with `401` + a `WWW-Authenticate` challenge (optionally advertising RFC 9728 protected-resource metadata). We closed the cheap spec-compat gaps **without changing the auth model**.

**Decision — keep the scoped-key model, add a clean OAuth seam.** The parent-issued, hashed, revocable, scoped, audited AgentCredential stays the credential of record — it's the right fit for a first-party app and nothing about Bearer transport requires abandoning it. Full OAuth 2.1 (authorization-code / delegated-consent, an authorization server, dynamic client registration, short-lived access tokens with audience binding) is **deferred** until there's a driver for it: third-party MCP clients, user-delegated consent, or a need for short-lived/audience-bound tokens (RFC 8707 resource indicators). Until then a real AS would be scaffolding with no user behind it.

**Shipped (hosted HTTP transport only, `packages/mcp/src/httpServer.ts`):**
1. **Dual credential intake.** The transport accepts the key from **`Authorization: Bearer <key>` (preferred)** OR **`x-agent-key` (back-compat fallback)**. Precedence: a non-empty Bearer token wins; otherwise fall back to `x-agent-key`. The raw key is extracted and handed to `MealPlannerApiClient` unchanged — **the MCP→API hop still sends `x-agent-key`** to `GET /api/agent/me`. `apiClient.ts` and the `packages/api` agent-auth middleware were **not** touched.
2. **`WWW-Authenticate` challenges** on the auth-failure paths: missing credential → `401 Bearer realm="meal-planner-mcp"`; resolved-but-rejected key (unknown/revoked/expired, from `GET /api/agent/me`) → `401` + `error="invalid_token"`; scope denial → `403` + `error="insufficient_scope"`. `sendJson` gained an `extraHeaders` arg to attach these cleanly.
3. **`GET /.well-known/oauth-protected-resource` stub** (RFC 9728): unauthenticated, side-effect-free (never calls fetch), non-GET → 405. Body: `{ resource, scopes_supported: [...AGENT_SCOPES], bearer_methods_supported: ["header"] }`. **Guardrail honored — no `authorization_servers` field is advertised** (there is no real AS); the `WWW-Authenticate` `resource_metadata=` param points at this doc only when it can be built.

**Security (Frank, reviewer ≠ author — REQUEST-CHANGES → fix → APPROVE).** First pass flagged one blocking item: the request-derived origin (`Host` + `x-forwarded-proto`) was interpolated into the `resource_metadata` auth-param unvalidated, allowing **auth-param injection** (CRLF already blocked by Node, but quote/comma/space were not). Per reviewer lockout the original author was locked out; **Rusty** (Lead) owned the remediation: a `TRUSTED_HOST_PATTERN` (`/^[A-Za-z0-9.-]+(:\d+)?$/`) + scheme allowlist (`http`/`https`); an untrusted or missing host **omits `resource_metadata`** from the challenge and falls back to a path-only `resource: "/mcp"` in the `.well-known` body. Regression test asserts a malicious `Host` never injects params. Re-review → **APPROVE**. Rai → 🟢 (no key logged/echoed; README uses placeholders). Fact Checker verified the standards references (RFC 9728 Protected Resource Metadata, RFC 6750 Bearer challenge/`error` params, RFC 8707 resource indicators); the MCP 2025-06-18 auth spec states these as **SHOULD/conditional** for HTTP transports (stdio SHOULD use env creds and is already on-convention) — worded here accordingly, not as universal MUSTs.

Full gate green in-container (devcontainer, never host): shared+mcp builds clean, lint **0 errors (7 pre-existing api warnings)**, **717 tests** (shared 4 + mcp **57** + api 425 + web 231) — up from #81's 711 by 6 new mcp tests (Bearer≡x-agent-key, back-compat, precedence, both-401 challenges, `.well-known` shape + non-GET, host-injection regression, plus the preserved "never echoes the key" assertion). **Deferred:** OAuth authorization server, authorization-code/delegated-consent flow, dynamic client registration, short-lived/audience-bound tokens — to be revisited when a third-party or user-delegated-consent client appears.

### 2026-07-01: Hosted MCP transport + per-request family-from-key auth (#81)

Requested by Brandon Martinez. Delivered issue #81: converted the MCP server from single-tenant stdio to a **hosted, multi-tenant** server where the agent credential is presented **per request** (header `x-agent-key`) and the family is derived from the key — never configured at boot, never passed into a tool.

**Transport (the key fork):** MCP SDK **Streamable HTTP** in **stateless mode** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`). Each POST `/mcp`: read key -> `GET /api/agent/me` resolves `{familyId,scopes,name}` -> build a per-request `MealPlannerApiClient` + `McpServer` with handlers bound to that `familyId` -> fresh transport -> teardown on response close. No new deps (Node `http`). The **stdio** entry stays as an optional local/#77 mode; the tool/handler layer (`createToolHandlers(client, familyId)`) is transport-agnostic, so no tool logic differs between modes.

**Requirements shipped:** (1) `GET /api/agent/me` family-from-key auth (audited `identify`); (2) new `meal:write` scope in both scope definitions (auto-surfaces as a Family Settings checkbox) + `POST /api/agent/meals` & `PATCH /api/agent/meals/:mealId` + MCP `create_meal`/`update_meal`; (3) `GET /api/agent/grocery/current` (generates on demand when absent) + MCP `get_current_grocery_list`. No DB migration; no meal DELETE; no OCR/vision (the calling LLM parses recipes).

**Security invariants (Frank):** every call re-authenticates from the presented key; cross-family access impossible (family resolved from key; legacy `/:familyId/*` routes keep their cross-check + audit); invalid/revoked/expired keys -> uniform 401; scope denials -> 403 + audited; the raw key is never logged, serialized, or placed in an error. Verified live: with/without `meal:write` -> 201/200 vs 403 with `missing_scope` audit rows.

Full gate green in-container: build clean, lint 0 errors (7 pre-existing warnings), **711 tests** (shared 4 + mcp 51 + api 425 + web 231). Shipped as 4 atomic commits on `hosted-mcp-write-tools`. Residual risk: stateless mode builds a fresh server per request (no server-initiated notifications) — by design for horizontal scalability.

### 2026-07-01: Added Saul (Data / Migrations specialist) + dev-environment/demo-data sprint (#75-#79)

Requested by Brandon Martinez. Added a new Squad member **Saul** (Ocean's Eleven cast) dedicated to **data**: backwards/forwards-compatible migrations (expand/contract), data-integrity guardianship (no accidental DB wipes / unguarded resets), and seed/fixtures. Charter at `.squad/agents/saul/charter.md`; roster in `team.md`; `squad:saul` label created; `casting/registry.json` gains a `data` role. **Routing change:** Database/schema/migrations/seed work now routes to **Saul (with Livingston)** — previously folded into Livingston alone. Saul and Livingston co-own the schema contract; both must be satisfied on schema PRs (Saul: compatibility/rollout ordering; Livingston: services/routes that consume it).

Filed + assigned to next sprint (`priority:p2`):
- #79 Dev login: `POST /api/auth/dev-login` (hard-gated to non-prod) pass-through to a seeded demo user, plus a secondary Dev-login button on LoginPage while keeping real Google sign-in [squad:frank].
- #77 MCP smoke testing: verify `packages/mcp` tools + API `agent`/`agent.mcp` routes against a real API+DB with a scoped AgentCredential, asserting scope enforcement + audit logs [squad:yen].
- #75 Rich date-relative demo seed: demo family, 5 members (2 parents + 3 kids), ~50 recipes, multiple Monday-anchored weeks computed off today, suggestions (approved+pending), grocery list; idempotent; `db:reset` reseeds [squad:saul].
- #78 Add Saul to the team (this entry) [squad:rusty].
- #76 Root `dev.sh` launcher: bring up the devcontainer + apps from a plain terminal (no VS Code) [squad:basher].

### 2026-07-01T02-16-36: Post-sprint UX fix — Meal Library UI (#70), merged & closed
**By:** coordinator (Linus-authored web work)
**What:** Surfaced during the live demo. Two web fixes shipped together in PR #73 (squash `f382c3e`): (1) MealPicker now renders Recent + Difficulty badges (the list DTO already carried `recentlyScheduled`/`lastScheduledOn`/`difficulty` from #27 — pure rendering gap); (2) MealsPage cards restructured into a fixed flex-column with snapped zones (Title → Badges → Description → Footer pinned via `mt-auto`; reserved 2-line min-heights; redundant placeholder kind-chip replaced with a "Built-in" tag). Design pass guided by the impeccable `layout` reference.
**Process note:** the app `create_pull_request` tool bound PR #71 to the coordinator's SESSION branch (`brandonmartinez-sprint-1-coordination`, `.squad/` docs only) instead of the pushed worktree branch. Caught by the a11y gate (diff ≠ reviewed code). Fixed by closing #71 and opening #73 via `gh pr create --head squad/70-meal-library-ui`. **Lesson: for agent/worktree PRs, create the PR with `gh pr create --head <branch>` from the worktree, NOT the session-bound PR tool.**
**Verification:** CI-mirror Node 22 container (web build tsc+vite, lint, 213/213 web tests); independent a11y gate APPROVE on `f382c3e` (reviewer ≠ author, posted as PR comment); CI `test` job SUCCESS; merged on owner authority; worktree/branch cleaned up.
**References:** issue #70; PR #73 (merged); PR #71 (closed — wrong head branch); a11y gate https://github.com/brandonmartinez/meal-planner/pull/71#issuecomment-4849646508

### 2026-06-30T22-30-00: Data-model changes must ship CSV import + export support (#72)
**By:** coordinator
**What:** Established a standing rule: any major data-model change that adds a user-facing persisted field to meals (or another CSV-managed entity) must also be added to CSV import AND CSV export, keeping the round trip intact.
**References:** #72, #8
**Why:** `Meal.difficulty` (#8) shipped as a full vertical but was never wired into CSV import, so bulk-imported meals silently lost difficulty. Documented in [prisma.instructions.md](../.github/instructions/prisma.instructions.md). Same PR also adds full "export all meals as CSV" for data portability. Export column order is owned by `mealsToCSV`/`MEALS_CSV_HEADER` in `packages/web/src/utils/csv.ts` and must match the import parser + Zod schema.

### 2026-06-30T21-57-02: Sprint 5 batch — final backlog hardening (#42/#43/#49/#51), all merged & closed
**By:** coordinator (logged by Scribe)
**What:** Milestone created for the 4 remaining backlog issues; all built, gated, merged to `origin/main`, and closed. Standing rules unchanged (isolated worktree + PR per issue, CI = verification of record, independent gates via PR comment since author = `brandonmartinez`, owner-authority merge on unprotected main).
**References:** PRs #66, #67, #68, #69; issues #42, #43, #49, #51
**Why:** Requested by Brandon Martinez — close out the reviewed backlog and the security/infra follow-up debt from Sprints 2–4.
- **#42 (Basher, PR #66):** CI migration validation — `prisma migrate deploy` + `migrate diff --exit-code` drift check added to the test job. Rusty infra gate → APPROVE.
- **#43 (Livingston, PR #67):** Trust-proxy config — `app.set("trust proxy", config.trustProxy)` default `1`, `TRUST_PROXY` env, `parseTrustProxy()`. Frank gate → APPROVE.
- **#49 (Livingston, PR #68):** Observable audit drops — `safeRecordAgentAudit` wrapper with a 6-field allowlist `console.error`, replaced 18 silent `catch {}` sites, fail-open preserved. Frank gate → APPROVE.
- **#51 (Livingston, PR #69):** Peppered HMAC-SHA256 credential hashing — `utils/credentialHash.ts` (`hashCredential` + `legacyHashCredential`), lazy legacy-rehash on verify, `CREDENTIAL_PEPPER` fail-closed in prod, no schema change. Frank gate → APPROVE. Merged after #43/#49 with main synced in.
- **Follow-up debt (noted, not filed):** `middleware/rateLimit.ts` `apiKeyFingerprint` is still bare SHA-256 with a stale comment (Frank N2).

### 2026-06-30T21-57-01: Sprint 4 batch — k8s immutable tags, migration ordering, MCP package (#25/#26/#5), all merged & closed
**By:** coordinator (logged by Scribe)
**What:** Three issues built, gated, merged to `origin/main`, and closed. Same standing rules (isolated worktree + PR per issue, CI = verification of record, independent gate via PR comment, owner-authority merge).
**References:** PRs #63, #64, #65; issues #25, #26, #5
**Why:** Requested by Brandon Martinez — advance the infra/deploy hardening and land the MCP server package foundation.
- **#25 (Basher, PR #63):** Pin k8s to immutable image tags. Rusty infra gate → APPROVE.
- **#26 (Basher, PR #64):** Move prod migrations out of the multi-replica startup. Rusty gate initially REQUEST-CHANGES (migrate-job hardcoded `:latest`); relaunched to integrate on #25's single-source pinned tag in `kustomization.yaml`. `deploy.sh` runs the migrate Job first (fail-fast), then `apply -k`. Re-gate → APPROVE.
- **#5 (Rusty, PR #65):** MCP server package `packages/mcp`. Frank security gate → APPROVE. Coordinator fixed 2 TS compile errors before merge (`agent.ts` `mealId` scope hoist; mcp `ToolResult` index signature) and regenerated `pnpm-lock.yaml`.

### 2026-06-30T21-57-00: Sprint 3 batch — MCP endpoints, prod/infra hardening, and a11y sweep (8 issues), all merged & closed
**By:** coordinator (logged by Scribe)
**What:** Eight issues built in parallel, each on its own isolated worktree + PR, all merged to `origin/main` and closed. Standing rules unchanged (CI = verification of record, security/a11y work gated by an independent reviewer via PR comment since author = `brandonmartinez`, owner-authority merge).
**References:** PRs (incl. #62); issues #7, #22, #24, #16, #6, #27, #17, #15 (also closed #50)
**Why:** Requested by Brandon Martinez — land the MCP backend surface, harden prod/infra, and clear the accessibility backlog.
- **#7 (Livingston):** MCP backend endpoints — current/prev week, schedule-by-date, approve-by-family, Zod, shared DTOs.
- **#22 (Basher):** Harden prod Docker image (non-root, frozen lockfile). Security gate → PASS.
- **#24 (Basher):** Compose drift fix (root vs devcontainer).
- **#16 (Linus):** Accessible modals (MealPicker, ImportMealsDialog). A11y gate → PASS.
- **#6 (Frank backend + Linus web):** Agent-credential management endpoints + UI (also closed #50). Security gate → PASS.
- **#27 (Livingston backend + Linus web):** Recent-meal indicator (backend + web badge).
- **#17 (Linus):** API key copy + last-used display.
- **#15 (Linus, PR #62):** Accessible names + loading-status across web pages. A11y gate → PASS. Last to merge — de-raced 3 loading-status a11y tests before merge.

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

### 2026-07-01T14:01:24-04:00: Mount MCP handler inside API Express app (#89)
**By:** Rusty
**What:** Mounted `packages/mcp`'s hosted MCP core handler directly into the existing API Express app at `POST /mcp` on port 3001, alongside `/api` and the SPA, so production ingress can reach `https://meals.themartinez.cloud/mcp` without new Kubernetes resources. The standalone `packages/mcp` HTTP server remains for local development, while production uses the in-process route. Implementation exported `createMcpCoreHandler`, added `@meal-planner/mcp` as an API dependency, wired `mcpLimiter`, passed the already-parsed Express body into the handler, updated Docker build/copy steps, docs, and tests.
**Why:** The production image is a single API container; the prior standalone MCP process was not built or served there. In-process mounting is the lowest-risk fit for the existing topology: no sidecar, second port, process manager, Service, or Ingress change; the existing ingress routes `/mcp` to port 3001. It preserves the per-request `x-agent-key` → loopback `GET /api/agent/me` → `familyId` auth model, avoids double-consuming the request body, and keeps MCP rate limiting in a dedicated bucket before key lookup or transport work.
**Verification:** Build and lint passed; 716 tests passed, including 5 new MCP/API coverage tests.

### 2026-07-01T14:57:00-04:00: PR #90 merge re-review — Bearer auth union + per-credential limiter fix
**By:** Frank, Rusty
**What:** Rusty resolved merge conflicts with `main` after upstream #88 added `Authorization: Bearer` support and `WWW-Authenticate` challenges to the hosted MCP transport, preserving those changes alongside the `createMcpCoreHandler` extraction for the API-mounted `/mcp` route (merge commit `5122b6a`). Frank's post-merge security re-review found checks 1, 2, 3, and 5 clean, noted only a low-severity reflected-`Host` posture caveat, and identified a medium gap where `agentKeyGenerator` keyed Bearer-authenticated requests by IP only because it read `x-agent-key` but not `Authorization: Bearer`. Rusty fixed the gap in `packages/api/src/middleware/rateLimit.ts` by fingerprinting Bearer tokens or `x-agent-key` so both credential presentations share the same per-credential rate-limit bucket (commit `f1fb50c`); 728 tests pass across 4 packages.
**Why:** The merge needed to keep standards-aligned Bearer intake and challenge behavior from #88 while preserving #89's shared MCP core handler. The rate-limit fix restores per-credential isolation and operator visibility for Bearer clients, avoiding shared-IP collateral throttling without changing the raw-key handling, auth-before-body ordering, or no-log/no-echo guarantees.
**Merged from:** `decisions/inbox/frank-mcp-merge-rereview.md`

### 2026-07-01T14:57:00-04:00: Frank security review — hosted MCP endpoint `/mcp` (#89)
**By:** Frank
**What:** Initial security review for the API-hosted `/mcp` path returned 🟡 ship-with-notes with no blocking credential leak, auth bypass, middleware-order, SSRF, or body-consumption issues. Findings: key values are not logged or echoed; auth resolves family from the presented credential before tool work; `mcpLimiter` is mounted before MCP work; the loopback `/api/agent/me` call uses configured localhost/API base URL rather than client input; Express body parsing is not used by the core handler until after auth succeeds.
**Why:** This preserves the hosted MCP security invariants from #81/#89 while calling out non-blocking operational notes: validate `MCP_REQUEST_TIMEOUT_MS` to avoid `NaN` timeouts, watch the loopback `agentLimiter` bucket for multi-IP use of one key, and keep the pre-existing bare SHA-256 rate-limit fingerprint debt separate from key storage hashing.
**Merged from:** `decisions/inbox/frank-mcp-security-review.md`

### 2026-07-02T10:16:59-0400: Epic #91 recipe-management decomposition
**By:** Scribe
**What:** Epic #91, "Expand recipe management capabilities," was decomposed into 29 repo-grounded GitHub issues (#92-#120) across three dependency-ordered phases: P1 foundational design spikes (#92-#96), P2 `release:v0.4.0` (#97-#101, #103, #107, #111, #112, #118, and the #119 check), and P3 `release:v0.5.0` for the remainder. Final single-owner routing is squad:saul=8 (#92, #97, #98, #100, #107, #109, #116, #119), squad:livingston=9, squad:linus=8, squad:basher=3, and squad:rusty=1. DB/schema/migration-centric issues were routed to Saul per user directive. The `squad-triage.yml` workflow's auto-assigned duplicate owner labels were reconciled out in favor of the Lead-approved owner labels, leaving each issue with exactly one `squad:{owner}` label. No implementation was done; this batch covered decomposition and issue creation only.
**Why:** Brandon approved Rusty's decomposition before issue creation. The phase split preserves dependencies by settling foundational design spikes first, then the v0.4.0 implementation set, then the v0.5.0 remainder. Saul ownership for DB/migration work keeps recipe-management data evolution aligned with the team's migration-safety directive, and label reconciliation keeps future routing unambiguous.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

### 2026-07-02: Recipe-management sprint sequencing
**By:** Rusty
**What:** Sequence epic #91 as five roughly two-week sprints: Sprint 1 resolves P1 design gates (#92-#96) while Basher handles standalone #121; Sprints 2-3 deliver v0.4.0 P2 core features with #111/#112 treated as the v0.4 convergence path; Sprints 4-5 deliver v0.5.0 P3 media, collections, planning, and grocery enhancements.
**Why:** #92 is the universal blocker and #96 is the second gate for most implementation. The plan maximizes parallelism after those gates land while calling out Saul and Livingston as bottlenecks and requiring Yen, Frank, Rai, and Fact Checker reviews at release and security-sensitive boundaries.

### 2026-07-02: #111 trimmed to envelope + name-search (Option 1 — filter split)
**By:** Squad (Coordinator), Brandon (@brandonmartinez) signed off
**What:** #111 keystone scope trimmed. It ships ONLY: MealListResponseDTO envelope cutover (breaking, all consumers lockstep), offset/limit pagination, name trigram search (GIN on Meal.name), difficulty[] filter, sorts (name/lastCooked/created), lastCookedOn + getLastCookedMap(). It adds NO new Meal scalar columns.
Filter ownership split (amends the #94 contract, comment posted to #94):
- favorite + ratingMin (+ rating sort) → #98 (adds columns + extends listMealsQuerySchema)
- notes search (notes GIN) → #97 (adds notes column)
- tags[]/categories[]/collectionId → #107
**Why:** Dependency inversion — current Meal model lacks notes/favorite/rating/tags; those columns are owned by the gated metadata issues (#97/#98/#107). Original #94 put all filters in #111, which would force #111 to steal column ownership and collide with Saul's later migrations. Option 1 keeps #111 as the true breaking keystone (envelope) that legitimately gates the metadata wave, with each issue owning its own field + filter + CSV + indexes incrementally atop the parity checklist. CSV rule does NOT trigger for #111 (no new persisted user-facing scalar).

### 2026-07-02: Reverse #94 "avoid preview features" — declare pg_trgm index in schema.prisma

**By:** Squad (Coordinator), on approval from @brandonmartinez
**What:** Enable Prisma's `postgresqlExtensions` preview feature and declare the `pg_trgm` extension + the trigram GIN index (`Meal_name_trgm_idx`) declaratively in `schema.prisma`, so the schema matches the migrated DB and the CI drift gate passes.
**Why:** #111 created `Meal_name_trgm_idx` via raw SQL (to avoid the preview feature per #94). But the CI drift gate (`migrate diff --from-url <db> --to-schema-datamodel schema.prisma --exit-code`) reports the undeclarable index as drift (`[-] Removed index on columns (name)`), failing EVERY PR. main went red on #111's merge and stayed red. Chosen fix keeps full drift-gate coverage rather than weakening the gate. Trade-off: reverses #94's decision to avoid preview features.

### 2026-07-02: Enable branch protection on main

**By:** Squad (Coordinator), on approval from @brandonmartinez
**What:** main now requires the `test` status check (strict/up-to-date) before merge. enforce_admins=false (owner override retained). No required reviews (solo repo).
**Why:** main had NO protection, so `gh pr merge --auto` landed red PRs (#118, #111) immediately. Protection prevents red auto-merges going forward. Team rule: do not use `--auto` on a red main.

### 2026-07-02: Keep main fresh after every PR merge (worktree wave hygiene)
**By:** Squad (Coordinator), requested by Brandon (@brandonmartinez)
**What:** Standing workflow for the Sprint 2+ build waves:
1. After every PR merges to main, fast-forward the local main checkout immediately.
2. Create later-wave worktree sessions only AFTER their keystone PR (#111) merges, so they branch from post-keystone main.
3. In-flight worktrees that touch a just-merged PR's files must rebase onto fresh main before opening their own PR.
**Why:** During Sprint 2 kickoff, local main fell 4 commits behind origin and a stray uncommitted #118 schema.prisma edit was found in the main checkout. #111 is a breaking meals.ts/DTO rewrite that gates all metadata/UI issues — those worktrees MUST start from post-#111 main or they conflict hard.

### 2026-07-02: Recipe discovery UI (#112) — load-more pagination, difficulty-first picker filter

**By:** Linus (Frontend), requested by Brandon (@brandonmartinez)

**What:**
- Meal library (`MealsPage`) and picker (`MealPicker`) now surface the discovery
  capabilities the merged #111 backend actually exposes: debounced **search**,
  **difficulty[]** multi-toggle, **sort** (name|created|lastCooked) + **order**,
  and **offset/limit pagination** rendered as a **Load more (append)** control.
- Pagination is "Load more" (append), not numbered pages. Any search/filter/sort
  change resets `offset=0` and replaces the grid; `loadingMore` is tracked
  separately from first-mount `loading` so filter changes never blow the grid
  away with the full-screen spinner. A "Showing X of Y" line reads `total`.
- `MealPicker` gets a **difficulty-only** filter row (the most relevant planning
  filter) to keep the modal lean per the issue's risk note. Search stays
  debounced there too.
- New generic hook `useDebouncedValue<T>(value, delayMs=300)` at
  `packages/web/src/hooks/useDebouncedValue.ts` drives both surfaces so fast
  typing issues a single trailing request.

**Why:**
- Favorite / rating / tag & category filters do NOT exist in the #111 envelope —
  they land with #98 and #107. Every surface carries a clearly-marked
  `TODO(#98,#107)` seam at the filter bar; **no** non-existent API params are
  stubbed. When those backends merge, the next frontend issue drops controls in
  at the seam without reworking the request plumbing.
- Load-more matches the existing envelope (`{items,total,limit,offset,hasMore}`)
  with the least UX churn and keeps the simple search flow usable.

**Scope guard:** Stayed in my lane — only `MealsPage.tsx`, `MealPicker.tsx`,
their tests, and the new hook. Did **not** touch `api/meals.ts` create/update
types, `MealFormPage.tsx`, or `utils/csv.ts` (Saul, #97). The shared `listMeals`
client already accepted every param used here, so no client edits were needed.

### 2026-07-02T19:53:00Z: Recipe detail page (#101) shipped web-only; MealPicker linking deferred
**By:** Linus (Frontend), Coordinator
**What:** PR #130 shipped `/meals/:mealId`, `MealDetailPage.tsx`, and a MealsPage "View" link using the existing `getMeal()` endpoint. It renders recipe metadata, ingredients, and a graceful placeholder state. Rich instructions remain a `TODO(#100)` seam because #100 owns that data model. MealPicker linking was deferred (`TODO(#101-followup)`) rather than nesting interactive elements inside picker rows.
**Why:** This preserved #101 as a web-only read surface, avoided inventing #100 schema, and avoided nested-interactive accessibility risk in MealPicker while still making recipe details reachable from the meal library.

### 2026-07-02T12:19:29-04:00: Issue #111 implementation plan — retained API/schema decisions, superseded field ownership
**By:** Livingston (Backend), Coordinator
**What:** Retained #111 implementation decisions: place `listMealsQuerySchema` in `packages/api/src/schemas/meals.ts` for REST+agent reuse; exclude placeholders only when search/filter params are active; author pg_trgm SQL carefully and validate drift. Superseded earlier plan notes that would have added notes/favorite/rating in #111 — coordinator later trimmed #111 to envelope + name search only, with notes owned by #97, favorite/rating by #98, and tags/categories by #107.
**Why:** The useful routing/schema decisions remain valid, but field ownership had to be corrected to avoid migration collisions and CSV-rule scope creep.

### 2026-07-02T12:19:29-04:00: Grocery merge (#118) implementation plan approved
**By:** Livingston (Backend), requested by Brandon (@brandonmartinez)
**What:** Preserve manual grocery edits during regeneration with a non-destructive ID-preserving merge instead of delete-then-create. Locked decisions: checked state survives quantity changes; edited generated orphans become manual; manual/generated key collisions stay separate; provenance uses `origin GrocerySource` + `edited Boolean`; PATCH field-edit endpoint lands in #118; agent grocery read remains create-only.
**Why:** This implements #95's provenance model with additive schema, backward-compatible route behavior, and a seam for later quantity normalization without granting new agent write scope.

### 2026-07-02: Sprint-2 migration workflow + servings type (issue #97)

**By:** Saul (Data/Migrations), requested by Brandon (@brandonmartinez)

**Decision 1 — `servings` is `Int?`.**
Issue #97 lists "servings" as a scalar. Modeled as `Int?` (nullable), matching
`prepTimeMinutes`/`cookTimeMinutes`. Ranges ("4–6") are explicitly out of scope;
if product wants ranges later that is a separate string field + its own issue.
Zod: `z.number().int().min(1)`.

**Decision 2 — all 5 metadata fields nullable, reuse `meal:write`.**
`prepTimeMinutes Int?`, `cookTimeMinutes Int?`, `servings Int?`, `sourceUrl String?`,
`notes String?`. Nullable so existing meals + placeholders migrate safely. No new
scope — all writes use existing `meal:write`. `sourceUrl` is STORED ONLY (SSRF
guard): validated `z.string().url()`, never fetched server-side.

**Decision 3 (CROSS-CUTTING, needs coordinator sign-off) — Sprint-2 migration
workflow under shared devcontainer + shared dev DB.**
INCIDENT: running `prisma migrate dev` (the documented flow in
prisma.instructions.md) against the shared dev DB from a worktree produced a
DESTRUCTIVE spurious migration that dropped the `Meal_name_trgm_idx` pg_trgm GIN
index (raw-SQL/unmodeled → Prisma treats it as drift and drops it). Root causes:
  1. `devcontainer-app-1` bind-mounts the MAIN checkout (stuck on `main`), NOT the
     agent worktree — so a worktree's schema edits are invisible to the container.
  2. ~13 worktrees share ONE `.git`, ONE devcontainer, ONE dev Postgres — so any
     `migrate dev` reconciles drift from whatever schema the DB last saw, and is
     racy/destructive across agents.
FULLY REMEDIATED: restored the trgm index via `prisma db execute`
(`CREATE EXTENSION pg_trgm; CREATE INDEX ... USING GIN (name gin_trgm_ops)`),
deleted the bogus `_prisma_migrations` row + migration folder, reverted
`migration_lock.toml`. `prisma migrate status` = 7 migrations, up to date.

SANCTIONED STANDARD (coordinator sign-off 2026-07-02) — the required pattern for
#97 and EVERY later Sprint-2 field migration. `prisma migrate dev` against the
shared dev DB is now FORBIDDEN.

MIGRATION AUTHORING (via schema-to-schema diff, zero-DB, zero-drift):
  - `prisma migrate diff --from-schema-datamodel <main schema>
       --to-schema-datamodel <worktree schema> --script`
    -> yields exactly the `ALTER TABLE ... ADD COLUMN` statements, no index drop.
  - Generate BOTH schema inputs race-free from git branch refs
    (`git show main:packages/api/prisma/schema.prisma`), NOT from the shared
    `/workspace` working tree (it is swapped concurrently by ~13 worktrees).
  - Hand-place the resulting SQL in a properly-named migration folder committed to
    the agent's BRANCH. Never author migrations by running `migrate dev`.
  - VALIDATION: for #97 the hand-placed `20260702173523_add_core_recipe_metadata/
    migration.sql` was confirmed BYTE-IDENTICAL to fresh `migrate diff` output.

VERIFICATION (isolated /tmp copy — option (b), NEVER touch /workspace or shared DB):
  - `docker cp <worktree-path> devcontainer-app-1:/tmp/verify-<issue>` (unique path
    per worktree — avoids the /workspace phantom-leak race).
  - Run db:generate + shared build + mcp build + api build + lint + test ENTIRELY
    inside `/tmp/verify-<issue>`. Leverage the shared pnpm store (mostly symlinks →
    fast install).
  - Tests mock Prisma (`prismaMock`; real-DB integration forbidden per
    prisma.instructions.md), so only the generated client (from schema) is needed —
    fully DB-read-only and race-free. Never mutate the shared Postgres.
  - Clean up `/tmp/verify-<issue>` when done.

WHY (a) is rejected: copying worktree files INTO `/workspace` (the main checkout,
stuck on `main`) is the phantom-leak pollution source that had to be mopped after
every merge. #111/#118 likely used (a); do not copy that pattern.

RESULT for #97: migration validated byte-identical to migrate-diff; all 11 parity
rows + CSV round-trip + tests threaded; verified 805 tests green / lint 0 errors in
an isolated copy; PR #127 opened referencing #97.

**Decision 4 (coordinator-refined 2026-07-02) — verify via detached git
worktree, NOT docker cp; + main-red drift gate + merge sequence.**

VERIFY METHOD (SUPERSEDES the docker-cp method in Decision 3):
  - `git worktree add --detach /tmp/verify-<issue> <committed-sha>`. All agent
    worktrees share ONE `.git` object store, so a committed SHA is reachable from
    anywhere WITHOUT pushing. Detached + unique `/tmp` path = no branch-checkout
    conflict, no main-tree writes, shared Postgres untouched.
  - Run db:generate + shared/mcp/api builds + lint + test inside `/tmp/verify-<issue>`
    (still devcontainer-only, still prismaMock/no-DB).
  - Cleanup: `git worktree remove /tmp/verify-<issue>` (+ `git worktree prune` on the
    HOST only if it complains — NEVER `prune` inside the container, which bind-mounts
    only the main checkout and would delete host worktrees' admin dirs).
  - This is strictly better than docker cp (no root-owned /tmp files, no copy step).

MAIN-RED DRIFT GATE (external, not #97): CI `test` job runs
`migrate diff --from-url $DATABASE_URL --to-schema-datamodel schema.prisma --exit-code`.
#111's raw-SQL pg_trgm GIN index `Meal_name_trgm_idx` is undeclared in schema.prisma,
so the gate reports `[-] Removed index on columns (name)` → exit 2 on EVERY PR
(confirmed on #127: that index is the ONLY drift; zero failures in #97 surfaces).
Fix in flight: Livingston's hotfix declares the index via the `postgresqlExtensions`
preview feature (reverses #94). main is now BRANCH-PROTECTED (strict, requires `test`)
— no self-merge. MERGE ORDER: hotfix → main green → #126 (Linus) → #97 (Saul).

REBASE NOTE for #97: hotfix edits the same `Meal` block (adds `previewFeatures`,
`pgTrgm` extension, `@@index`); #97 adds 5 scalar columns. Expect a small adjacent-line
conflict on rebase — resolve by KEEPING BOTH (columns + index/extension/preview are
logically independent). Re-verify with the detached-worktree method above, then
force-push.

### 2026-07-02T19:53:00Z: Favorite + rating (#98) shipped with full web parity and API filters
**By:** Saul (Data/API), Coordinator
**What:** PR #131 added `Meal.favorite Boolean @default(false)` and nullable `Meal.rating Int?` (1-5) and threaded both through REST + agent validation, service writes, CSV import/export, and `MealFormPage`. `listMealsQuerySchema` now accepts `favorite` and `minRating`; UI filter dropdowns stay deferred at the existing `TODO(#98,#107)` seams.
**Why:** Coordinator approved full web parity option B1 so persisted user-facing fields are editable and round-trip through CSV immediately. Backend filters satisfy #98 AC without colliding with #107's tags/categories filter-bar work.

### 2026-07-02T19:53:00Z: v0.4.0 test matrix docs (#129) committed with live status markers
**By:** Yen (QA), Coordinator
**What:** PR #129 added `docs/testing/v0.4.0-test-matrix.md` with 75 per-cell ✅/🟡/❌ status markers and CSV-portable-vs-not callouts. Coordinator selected the committed docs path (Option A) and requested live per-cell status markers plus CSV portability callouts.
**Why:** The v0.4.0 recipe-metadata wave needs a visible test matrix that distinguishes current coverage from planned/blocked cells and makes CSV round-trip expectations portable for later agents.

### 2026-07-02T15:19:00Z: v0.4.0 test-matrix authoring approach
**By:** Yen (QA/Test)
**Requested by:** @brandonmartinez
**Status:** Executed (test matrix committed)

**What:** Authored a v0.4.0 **test matrix** — a planning/doc artifact mapping each shipped/planned recipe-metadata feature (v0.4.0 issues) to its test surfaces, acceptance-criteria cases, edge cases, and current coverage gaps. Structure = one matrix section per issue, rows keyed to the 11-row parity checklist from `parity.instructions.md`, plus feature-independent cross-cutting invariant sections.

**Scope (v0.4.0):** Merged foundation: #96, #111, #112, #118, #97 (core metadata). Merged in Waves 4-6: #98 (favorite/rating), #99 (last-cooked), #100 (instructions), #101 (detail page), #103 (external imageUrl), #107/#108 (tags+categories).

**Why:** Features touch up to 11 parity surfaces; without a per-feature × per-surface coverage map it's easy to land a feature REST-only, skip non-skippable MCP surfaces (rows 4/7/8), or miss edge cases (nullable fields, placeholder un-editability, SSRF, CSV round-trip). The matrix makes coverage auditable before merge.

**References:** #129 (test matrix doc committed with live status markers)

### 2026-07-02T16:38:43-04:00: Family-scoped Tags & Categories backend (#107) — schema, migration, parity, CSV
**By:** Saul (Data / Migrations)
**Requested by:** @brandonmartinez
**Issue:** #107 (Sprint 2 keystone, ran SOLO to keep schema/migration churn conflict-free)
**Merge:** PR #134, SHA 49343e7

**What:** Adds two **family-scoped** taxonomies (Tag + Category) with many-to-many meal assignment, threaded through REST + agent + MCP at parity, plus CSV round-trip by name.

**Surfaces threaded:**
- **Schema** — new `Tag`, `Category`, `MealTag`, `MealCategory` models; back-relations on `Meal` and `Family`.
- **Migration** (`20260702190000_add_tags_categories`) — offline-authored via `prisma migrate diff --script`.
- **Service** — new `services/taxonomy.ts` (resolve-or-create by name, list, sync/assign — all family-scoped).
- **REST Zod** — `tags`/`categories` on create/update/import + list filter facets.
- **Agent route** (**parity row 4**) — assign + filter mirror REST; reuses `meal:write` scope.
- **MCP** (**parity rows 7/8**) — create/update/list threaded; `list_meals` tool description updated.
- **CSV round-trip** (**#72 lockstep**) — semicolon-delimited name list; round-trip by name.
- **Shared types** — `Tag`/`Category` interfaces; NOT on `DisplayMealEntry` (Magic Mirror deny-by-default).

**Key decisions:**
1. **Case-insensitive uniqueness:** normalized `nameNormalized` column + `@@unique([familyId, nameNormalized])`.
2. **Explicit join models + cascade** (`MealTag`, `MealCategory`), matching `MealIngredient` pattern.
3. **Distinct models** (not shared table + discriminator) so a tag and category coexist without collision.
4. **Filter semantics:** OR-within-facet, AND-across-facets (multiple tags OR'd, multiple categories OR'd, then AND'd together).

**Hard constraints honored:** Family-scoped IDOR-safe queries; CSV lockstep; parity rows 4/7/8; deny-by-default; Zod at boundaries.

**Verify:** Detached worktree, prismaMock, inside devcontainer. All 5 builds green; **958 tests pass** (shared 4 / mcp 75 / api 590 / web 289); eslint **0 errors**. Test matrix: duplicate/case-collision names, cross-family isolation, placeholder rejection, filter composition, CSV round-trip, REST/agent/MCP parity.

### 2026-07-02T17:30:00Z: Declare pg_trgm GIN index in schema.prisma to fix CI drift gate
**By:** Livingston (Backend)
**Requested by:** @brandonmartinez
**Artifact:** packages/api/prisma/schema.prisma (schema-only; NO new migration)

**What:** Made schema.prisma declarative to match the already-migrated DB state:
1. `generator client`: added `previewFeatures = ["postgresqlExtensions"]`
2. `datasource db`: added `extensions = [pg_trgm]`
3. `Meal` model: declared `@@index([name(ops: raw("gin_trgm_ops"))], map: "Meal_name_trgm_idx", type: Gin)`

**Why:** main was RED on the CI drift gate. Root cause: #111's migration created `Meal_name_trgm_idx` (pg_trgm GIN index on Meal.name) via raw SQL, but the index was NOT declared in schema.prisma, so `prisma migrate diff --exit-code` reported drift → gate FAILED on every PR, blocking the Sprint 2 wave.

**Reverses #94:** This turns ON the postgresqlExtensions preview feature that #94 avoided. @brandonmartinez approved the reversal — the drift gate makes the raw-SQL-only approach untenable under branch protection.

**Verification (READ-ONLY):** Isolated build, pnpm install (frozen), `prisma validate` + `prisma generate` OK, offline drift proof shows schema-derived SQL matches `20260702165418_meal_search_indexes/migration.sql` byte-for-byte, api tsc GREEN, **472 api tests passed**.

**In-lane:** Only schema.prisma changed. No new migration. No source/web files touched.

### 2026-07-02T18:16:00-04:00: Recipe instructions child model (#100)
**By:** Saul (Data/Migrations)
**Issue:** #100 (last Sprint 2 migration item)
**Merge:** PR #136, SHA 233597b

**What:**
1. **CSV encoding — ordered steps in one cell.** Single `instructions` column, **newline-delimited** ordered steps inside the quoted cell (optionally numbered). Export orders by `position asc`; import splits on `\n`, strips optional enumerator, trims, drops blanks, reindexes `position` 0-based.
   **Why:** comma is the field delimiter; semicolon claimed by tags/categories; steps contain both, so newline is unambiguous.

2. **Instruction shape — RESOLVED by #92.** `text: String` + `timerMinutes: Int?` only. NO ingredient references (deferred to v0.5+).

3. **Ordering column:** Explicit `position: Int` **0-based**. Replace-all-on-update recreates rows with `position = arrayIndex` (dense, gap-free). `@@index([mealId])`; NO `@@unique([mealId, position])` (replace-all guarantees uniqueness; omitting avoids transient-collision risk).

**Cross-cutting constraints honored:**
- Family-scoped THROUGH `Meal.familyId` (cascade on Meal; IDOR-safe).
- CSV lockstep: wired into BOTH import and export.
- Parity rows 4/7/8: agent route + MCP tools; reuse `meal:write` scope.
- Deny-by-default: instructions kept OFF `DisplayMealEntry`.
- Placeholder guard: instructions rejected on placeholder meals.
- **replace-all-on-update** semantics (documented in service).

**Migration discipline:** Authored offline via `prisma migrate diff --script` (shared dev DB locked — `migrate dev` FORBIDDEN). Hand-placed at `20260702200000_add_recipe_instructions`.

### 2026-07-02: Issue #99 — derive `timesCooked` in the same query as `lastCookedOn`
**By:** Livingston (Backend)
**Requested by:** @brandonmartinez
**Merge:** PR #132, SHA bc6eae9

**What:**
- `timesCooked` counts **all-time** approved MealSuggestions for a meal (no recency window), mirroring `lastCookedOn`'s semantics. Empty history ⇒ `timesCooked: 0`, `lastCookedOn: null`.
- Single-query derivation: extended `getLastCookedMap` to return `Map<mealId, { lastCookedOn: string; timesCooked: number }>`, folding the count into the SAME `mealSuggestion.findMany` reduce loop (avoids second identical query).
- Both fields are **derived read-only** at query time — no schema change, no migration, not a CSV field, not on `DisplayMealEntry`.

**Why:**
- All-time count matches the issue text and existing last-cooked semantics; both stay consistent.
- Same-query derivation avoids redundant DB round-trip; count + latest date come from identical family-scoped approved-suggestion rows (filtered on BOTH `meal.familyId` AND `dayPlan.weekPlan.familyId`, #9 IDOR direction), so cross-family cook-history leakage is structurally impossible.

### 2026-07-02T16:12:00Z: External recipe image URLs (#103) — wiring, CSP broadening, and scheme allowlist
**By:** Linus (Frontend/full-stack)
**Requested by:** @brandonmartinez
**Merge:** PR #133, SHA ba7b628

**What:** Threads the **existing** `Meal.imageUrl String?` field (external URL, display-only) through every unhandled surface. **No schema change, no migration** — the column already exists.

**Surfaces threaded:**
- REST Zod — new shared `imageUrlSchema`, wired into create/update/import.
- Service — imageUrl on create/update/import + export.
- Agent route (**parity row 4**) — imageUrl on create + update.
- MCP apiClient + tools (**parity rows 7/8**) — imageUrl on create_meal/update_meal input, Zod, descriptions.
- Web client, form, render surfaces (card, picker, detail page) — all via new shared `MealThumbnail` component.
- CSV round-trip (**#72 lockstep**) — web `utils/csv.ts` parser alias + `MEALS_CSV_HEADER` + export service.

**Decision 1 — shared `imageUrlSchema` + scheme allowlist:**
Introduced `imageUrlSchema = z.string().trim().url().refine(/^https?:\/\//i)`, `.nullable().optional()`, exported once and reused by agent route + CSV import Zod. Empty string → `null` (converted at form + CSV layers). `http` accepted at storage but only `https:` renders under new CSP. Not retrofitting `sourceUrl` — separate concern, avoids merge risk.

**Decision 2 — broaden Helmet CSP `img-src`:**
`packages/api/src/index.ts` `img-src` changed from `["'self'", "data:", "https://*.googleusercontent.com"]` to `["'self'", "data:", "https:"]`. Rationale: arbitrary https hosts; enumerating infeasible.
- **Tradeoff:** any https host may be a tracking pixel (leaks viewer IP/timestamp). **Mitigated by:** (a) URL validation + scheme allowlist, (b) authoring gated behind family membership, (c) display-only usage — no script execution. `object-src 'none'` and `frame-ancestors 'none'` untouched.
- `script-src` stays `'self'` (no `unsafe-inline`/nonce/hash). Form/connect/style unchanged.
- http URLs degrade gracefully via `MealThumbnail`'s `onError`.

**Decision 3 — `MealThumbnail` shared render backbone:**
New `packages/web/src/components/MealThumbnail.tsx` renders `null` when `!src` or image errors, resets on `src` change, uses `loading="lazy"`. Centralizes graceful missing-image + broken-URL fallback behavior; list/picker/detail all identical, covered by one component's tests.

**Decision 4 — `ExportMealDTO` shared-type fix:**
`ExportMealDTO` (shared `dto.ts`) is standalone, so needed manual `imageUrl: string | null` addition for export type-check. `MealListItemDTO extends Meal` and `DisplayMealEntry` already carry imageUrl — no change needed.

**Why:** Finishing imageUrl support for external URLs. Threading existing scalar through all persisted/user-facing surfaces (REST+MCP parity, CSV lockstep) keeps field consistent/portable. Minimal CSP change lets external thumbnails render without weakening script/style/connect/form.

**Parallel wave:** Running concurrently with Livingston #99. Shared edits (web `meals.ts`, `MealsPage.tsx`, `MealPicker`, MCP) all additive; `MealThumbnail.tsx` new (conflict-safe). At merge: rebase on green main, keep both.

### 2026-07-02: Tags & categories UI — create-on-assign, no CRUD screens
**By:** Linus (Frontend/Web)
**Issue:** #108
**Merge:** PR #135, SHA b16810d

**What:** For Issue #108 web layer assigns tags/categories by typing a name (resolve-or-create happens server-side via #107). Built NO tag/category management/CRUD screens.

**Why:** Issue says "don't over-build"; create-on-assign sufficient. Web READS taxonomy list endpoints (populate suggestions + filters); all mutation flows through existing meal create/update payload.

**Component surfaces:**

1. **TokenField for assignment input:** Reusable `TokenField` component — removable pills + text input backed by native `<datalist>` of existing names. Two instances on MealFormPage (Tags, Categories). Adds on Enter/blur/Add; case-insensitive dedupe.
   **Why:** Native `<datalist>` gives typeahead without inline JS (strict CSP `script-src 'self'`). Pills make selections obvious. Explicit arrays always sent on update so removals persist.

2. **Filter controls mirror difficulty pill group:** MealsPage and MealPicker gain tag/category filter groups = `aria-pressed` pill toggles (blue = tags, purple = categories), populated from taxonomy list endpoints. Multi-select within a facet = OR; combined with difficulty/search = AND. Filter groups render ONLY when family has ≥1 tag/category.
   **Why:** Consistency with #126 difficulty filter. Hiding empty groups keeps new/empty families uncluttered.

3. **Compact display via MealTagList:** Shared `MealTagList` renders non-interactive pills (tags blue, categories purple), capped (`max=3` on cards, `max=2` in picker) with `+N` overflow chip + truncation. Cards reserve min-height for fixed-zone alignment.
   **Why:** Issue calls out avoiding noisy cards. Capping + truncation keeps display compact; non-interactive spans avoid nested-interactive a11y issues inside picker option `<button>` rows.

4. **useTaxonomy hook (single code path for two GETs):** `useTaxonomy(familyId)` loads tags + categories once per mount (`Promise.all`), reused by MealFormPage, MealsPage, MealPicker. Fails soft (empty lists on error) so taxonomy fetch failure never blocks meal list or form.
   **Why:** DRY — one place owns taxonomy fetch/unwrap. Failing soft keeps core flows resilient; taxonomy is enhancement, not hard dependency.

5. **Backend contract confirmed — empty array = clear-all:** Verified in merged #107 code that `updateMeal` → `syncMealTaxonomy` treats explicit empty `tags: []` / `categories: []` as CLEAR-ALL; `undefined` as LEAVE-UNTOUCHED. `assignTags`/`assignCategories` run `deleteMany({ mealId })` unconditionally, then `createMany` only when length > 0. Load-bearing contract for removal UX; MealFormPage always submits explicit arrays, never `undefined`, on both create and update — removals persist server-side. No backend gap; read-only verification — stayed in web lane.

### 2026-07-02T12:19:29-04:00: Parity instructions file created
**By:** Rusty (Lead / Architect)
**Requested by:** brandonmartinez (Sprint 2, Task 0)
**Status:** Completed

**What:** Created `.github/instructions/parity.instructions.md` — the enforcement artifact for recipe API/MCP parity, operationalizing the design approved on issue #96. Transcribes the 11-row parity checklist (§1), CSV sub-checklist (§1b), scope-change sub-checklist (§1c), scope decision (§2a: reuse `meal:write` for all recipe metadata incl. rating + external imageUrl; `meal:image` deferred to #103/#104; no agent DELETE), display deny-by-default (§3), placeholder limitations (§4), and the HARD RULE (§5).

**Why:** Sprint 2 gate — this file auto-governs all P2 recipe build issues (#97–#112) via `applyTo` globs before any build PR opens.


## 2026-07-02T21:37:00-0400: Sprint 3 Wave 1

### 2026-07-02: ImageAsset backend — schema, storage, security, and parity decisions (#104)
**By:** Basher
**What:** Shipped the concrete uploaded-image asset backend on top of the #93 storage abstraction. Key decisions:
- **Schema (`ImageAsset`):** family-scoped, optional meal association. `family onDelete: Cascade` (an asset must not outlive its family — isolation/cleanup), `meal onDelete: SetNull` (an asset may outlive its meal; deleting a meal only releases the association). Server-derived `extension` (from MIME allowlist, never user input) and `createdBy` (uploader `User.id`) persisted. Indexes on `familyId` and `mealId`.
- **Migration:** authored OFFLINE via `prisma migrate diff --from-schema-datamodel <main> --to-schema-datamodel <worktree> --script` inside the devcontainer (shared dev DB has a wedged advisory lock; `migrate dev` is forbidden). Folder `20260702210000_add_image_asset` — next timestamp after `20260702200000_add_recipe_instructions`. Pure `CREATE TABLE` + 2 indexes + 2 FKs, no destructive statements.
- **Storage service (`imageStorage.ts`):** dependency-free `FilesystemImageStorage`. Path layout `{root}/{familyId}/{assetId}.{ext}`. Path-traversal defense-in-depth: strict UUID regex on both `familyId` and `assetId`, extension only from the fixed MIME→ext allowlist, and a post-`resolve` assertion that the path stays under the storage root. **Opaque IDs** — the filesystem path is never returned, logged, or accepted as input; clients only ever see `assetId`.
- **Upload transport:** `express.raw({ type: () => true, limit })` (single raw body, explicit 5 MB limit) instead of a multipart library — smaller attack surface, consistent with the repo's minimal-dependency posture. **Magic-byte sniff** validates the real image type; `Content-Type` alone is not trusted.
- **Config:** `config.imageStorage.root` from `IMAGE_STORAGE_ROOT` (dev default `<cwd>/.data/images`). Deliberately **NOT** in `PRODUCTION_REQUIRED_VARS` — the default path is safe and the K8s deploy sets the env to the RWX PVC mount (#93 deferred backend). Documented so prod ops know to point it at durable storage.
- **Parity (rows 4/7/8) — REST-only, NO agent route / NO MCP tool (justified exclusion):** per `parity.instructions.md` §2a, binary upload is scope `meal:image`, explicitly deferred and not on the agent surface. MCP agents speak JSON-RPC text and cannot stream raw/multipart binary; the agent-appropriate image capability (external image URL, `meal:write`) already shipped in #103; §1b excludes binary bytes / opaque asset ids from CSV. Binary asset upload is a human web-UI interaction, not catalog-CRUD text — so the parity gate is satisfied by explicit exclusion, not by adding surfaces.
- **Placeholder guard:** attaching an image to a placeholder meal (`meal.placeholderKind !== null`) returns 400, mirroring the meals-service guard.
**Why:** #104 is the Sprint 3 Wave 1 MIGRATION keystone. Cross-family isolation, opaque path-traversal-safe IDs, and server-side MIME/size/extension validation are the security-critical requirements. On-disk file GC on family/row deletion is out of scope (families are never deleted in current flows) and is flagged as a future caveat.

### 2026-07-02: Local cooking mode — frontend-only, in-memory state (#102)
**By:** Linus
**What:** Shipped local cooking mode (Sprint 3 Wave 1). New immersive route `/meals/:mealId/cook` (ProtectedRoute + Layout), entered via a "Start cooking" CTA on `MealDetailPage` (real meals only, hidden for placeholders). Components: `pages/CookingModePage.tsx` (data fetch + checklist/step-completion state), `components/CookTimer.tsx` (per-step Start/Pause/Reset countdown), `hooks/useCountdown.ts` (extracted, unit-testable timer logic). ALL state is in-memory React `useState` — `checkedIngredients: Set`, `completedSteps: Set`, per-step timers — NO backend/API/schema/CSV/MCP change, NO localStorage. Resets on refresh. Relies on merged #100 (PR #136) single-meal GET returning ordered `instructions` (`text` + `timerMinutes?`).
**Why:** #102 is a human web-UI interaction with no server-persisted progress. Accessibility gate held: native checkboxes, 44×44 touch targets, aria-labeled timer buttons, a single `role="alert"` on timer completion (no per-tick SR spam), h1→h2 heading order, full keyboard nav. CSP intact (timers are bundled React; no inline scripts). Note: reconstructed by coordinator from Linus's completion report — original worktree inbox file did not survive worktree removal.

### 2026-07-02: Repeat previous week planning — no migration, explicit existing-target modes (#114)
**By:** Livingston
**What:** Shipped `repeatWeek()` in the week-plan service (Sprint 3 Wave 1). Copies APPROVED source-week suggestions into a target week as NEW `approved: false` suggestions, preserving the parent approval workflow. No schema change — reuses existing WeekPlan/DayPlan/MealSuggestion. Day mapping by date offset (both weeks Monday-anchored, 7 days). Empty/nonexistent source = no-op. Existing-target handling via tested `existingMode` param: `error` (DEFAULT — 409 before any write if target already populated; never silently dup/overwrite), `skip` (fill only empty target days), `replace` (clear target week then copy). Surfaces at full parity 4/7/8: browser REST `POST /families/:familyId/weeks/:weekStart/repeat` (JWT+membership), agent route reusing `meal_plan:schedule` scope (no new scope, audited allowed/denied), MCP `repeat_week` tool + client, plus a parent-gated WeekPlanPage action. Shared `RepeatWeekRequest` DTO + mode union. CSV rule not triggered (no persisted meal field).
**Why:** #114 preserves the family approval gate — repeated meals arrive unapproved so a parent still confirms. Default `error` mode is the safest/most explicit choice (forces a conscious skip/replace on an already-populated week). Cross-family isolation enforced on both source and target (family-scoped queries → cross-family source treated as empty/404). Note: reconstructed by coordinator from Livingston's completion report — original worktree inbox file did not survive worktree removal.

### 2026-07-03: Recipe collections backend (#109)
**By:** Saul (Data/Migrations), requested by brandonmartinez
**PR:** #142 (base main) — Refs #109 · **Branch:** brandonmartinez-recipe-collections-backend @ 051f2bb
**Migration:** `20260702220000_add_recipe_collections` (offline `migrate diff`, purely additive: 2 CREATE TABLE + 3 CREATE INDEX + 3 FK ADD CONSTRAINT; zero destructive)

**Schema:**
- `RecipeCollection` (id, name, nameNormalized, description?, familyId, timestamps) — `@@unique([familyId, nameNormalized])`, `@@index([familyId])`.
- `MealRecipeCollection` join (mealId, recipeCollectionId) — composite `@@id`, `@@index([recipeCollectionId])`.
- `Meal` gains `collections MealRecipeCollection[]`; `Family` gains `recipeCollections RecipeCollection[]`.
- **FK onDelete:** RecipeCollection→Family = **Restrict**; both join FKs = **Cascade**. M2M (a meal can belong to many collections).

**4 decisions:**
1. DELETE collection = **PARENT-gated**; create/list/get/update = member-level (mirrors tag-delete).
2. Optional **`description`** on RecipeCollection powers the MCP row-8 surface; NOT in CSV.
3. **No new scope** — reuse `meal:write` / `meal_plan:read`.
4. apiClient **`listCollections` unwraps** the `{collections:[...]}` envelope → `RecipeCollection[]`.

**CSV (lockstep like tags/categories #107):** collections referenced by NAME (semicolon-delimited). Import: new `collections` column after `categories`; aliases `["collections","collection","recipe collections"]`; `splitNames` → `ParsedImportMeal.collections?: string[]`; Zod `importMealsSchema` gains `collections: z.array(z.string()).optional()` → `syncMealCollections`. Export: `mealsToCSV` emits `meal.collections?.join(";")`. `description` NOT in CSV (names only).

**Parity 4/7/8:** Row 4 — agent meal create/update body gains `collections[]`, `GET /:familyId/collections` (scope `meal_plan:read`), shared list-meals filter, no agent DELETE. Row 7 — MCP apiClient `collections?` on Create/Update + listMeals opts + new `listCollections`. Row 8 — `collections` param on create_meal/update_meal/list_meals + new `list_collections` tool; `TOOL_SCOPES: list_collections → meal_plan:read`.

**Cross-family tests (prismaMock, globals:false):** Family A cannot read/list/update/delete Family B's collection (404), cannot attach a Family-B collection, filter-by-collection never leaks. Plus service unit, route CRUD+Zod 400s, CSV round-trip, placeholder symmetry, agent + MCP coverage.

**Verification:** migration re-verified LIVE vs current main → diff EXIT 0, byte-identical to committed migration.sql, purely additive. Full build/test/lint blocked by devcontainer network outage (DNS down) — PR body carries honest Verification section; CI (Postgres 16) is the green gate. Not self-merged.

### 2026-07-02: Image orphan cleanup + backup guidance (#106)

**By:** Basher (DevOps/Security), requested by brandonmartinez
**PR:** #141 (base main) — Refs #106 · Branch brandonmartinez-image-cleanup-backup @ 0c07c5f

**Context:** #104 shipped the uploaded-image asset backend (ImageAsset rows + on-disk files at {root}/{familyId}/{assetId}.{ext}). On-disk GC flagged there as a future caveat; #106 is that follow-up. NO schema/migration this wave (#109 owns schema) — command/service + docs only.

**What shipped:**
- packages/api/src/services/imageCleanup.ts — pure cleanup service. scanStorageRoot (read-only readdir), planCleanup (classifies orphanedFiles/missingFiles/unrecognized), runCleanup (dry-run default). Deletions route through #104's audited FilesystemImageStorage.delete() — never a hand-rolled unlink.
- packages/api/src/scripts/imageCleanup.ts — CLI runner under src/ (tsc/eslint covered). Wired as `images:cleanup` (tsx) script in packages/api/package.json.
- packages/api/src/services/imageStorage.ts — ADDITIVE ONLY: exported UUID_RE + ALLOWED_EXTENSIONS (single source of truth) + added exists().
- packages/api/src/services/imageCleanup.test.ts — 9 tests, temp dir + prismaMock.
- docs/ops/backup-and-restore.md (new) + k8s/README.md pointer.

**Decisions (3 open questions, all approved YES):**
1. k8s PVC = document-only (commented example PVC+mount in ops doc, NOT active kustomization — respects #93 deferral).
2. Additive edits to imageStorage.ts approved (export validators + exists(); no schema/behavior change).
3. --delete-rows is opt-in and OFF-by-default even under --apply.

**Orphan definition (both directions):**
- on-disk-without-row (orphanedFiles) — recognized file whose assetId is provably absent from live DB set. Deletable under --apply.
- row-without-file (missingFiles) — live row whose expected file is gone. Deletable only under --apply --delete-rows.
- unrecognized — stray/misnamed entries not matching {uuid}/{uuid}.{ext}. Reported only, NEVER auto-deleted.

**Safety invariant:** a file is a deletion candidate ONLY if its assetId is not in the live-id set. Dry-run default (apply=false). Reuses #104 defenses (UUID regex, MIME-allowlist ext, post-resolve under-root assertion) by routing all deletes through storage.delete().

**Test strategy:** vitest globals:false; real temp dir (fs.mkdtemp) + real FilesystemImageStorage; prisma via direct prismaMock injection. Headline test: file with matching row → never flagged, never deleted.

**Doc locations:** docs/ops/backup-and-restore.md (DB+image-volume matched-pair consistency, durable-PVC prerequisite w/ commented example, cleanup usage + safety contract, object-storage migration path). Pointer appended to k8s/README.md.

**Verification:** api build tsc exit 0, 675 tests pass, lint 0 errors, in-container at 0c07c5f via /tmp/verify-106 detached worktree (node_modules symlink-borrow, zero /workspace pollution). NO self-merge.

### 2026-07-03: Random meal selection (#113) — design decisions

**By:** Livingston (Backend), requested by brandonmartinez
**Issue:** #113 (Sprint 3 Wave 2, NO-MIGRATION lane) — PR #140, final commit d1bd42c (CI green; d27f946→87d80eb eslint→d1bd42c MCP tool-count=11)

**What / Why:**
1. **RNG isolation (auditable core).** Pure exported `selectRandomMeal(familyId, filters, referenceDate, rng)`, `type Rng = () => number` default `Math.random`. Candidates ordered `id asc`; pick = `candidates[clamp(floor(rng()*n))]`. Tests inject deterministic rng. Satisfies the issue's auditable/testable requirement.
2. **No schema change.** Reuses WeekPlan/DayPlan/MealSuggestion + family-scoped `scheduleMealByDate`→`addSuggestion`. schema.prisma untouched (Saul owns #109). Created suggestions stay UNAPPROVED (parent approval preserved).
3. **Reuse `meal_plan:schedule` scope** (no new scope). Agent route uses `AGENT_SCOPES.SCHEDULE`.
4. **Plural filter naming** `categories`/`tags`/`difficulty`/`favorite`/`avoidRecentDays`, matching `listMeals`. OR-within facet, AND-across facets; category/tag on `nameNormalized`.
5. **Placeholders always excluded** — candidate WHERE pins `placeholderKind: null`.
6. **Avoid-recent = TARGET schedule date, boundary inclusive-eligible.** Drops candidates cooked within the window before target; cooked exactly N days before is KEPT. Reuses double family-scoped `getLastCookedMap`. Omitted/0 = off.
7. **422 (not 404) when no eligible meals** — reused `weekPlan.SuggestionError(422, ...)`. ZodError→400, else→500.
8. **Cross-family protection on BOTH paths** — candidate query `WHERE familyId` + `addSuggestion` 404s foreign day plan/meal. Tested.
9. **Agent audit** — allowed → `targetType:"mealSuggestion"`, `targetIds:[suggestion.id, suggestion.mealId]`; on SuggestionError → denied, `targetIds:[]`, `reason:"error_<status>"`. `suggestedBy = agent.createdBy`.
10. **Parity 4/7** — REST `POST /api/families/:familyId/schedule/random`; agent `POST /api/agent/:familyId/schedule/random`; shared `RandomScheduleInputDTO`; MCP client `scheduleRandomMeal`; MCP tool `schedule_random_meal`. tools.ts append self-contained (parallel Saul #109 append → kept-both at squash-merge). No CSV. Web UI out of scope.
11. **Verification deferred to CI (environmental).** Local devcontainer verify blocked by Docker Desktop VM network outage. `pnpm-lock.yaml` byte-identical to main (zero new deps); mirrors merged #114. CI (ci.yml, Postgres 16) is authoritative. Did NOT self-merge.

Files: NEW `packages/api/src/services/randomPlan.ts` + `.test.ts`; EDITED weekPlan.ts/.test.ts, agent.ts/.test.ts, shared dto.ts, mcp apiClient.ts, mcp tools.ts. 9 files, 933 insertions.

### 2026-07-03: Meal image upload UI (#105)
**By:** Linus (Frontend), requested by brandonmartinez
**PR:** #143 (base main) — Refs #105 · **Branch:** brandonmartinez-linus-image-upload-ui @ 6933ea2
**Lane:** WEB ONLY (packages/web/src + tests/msw). Consumes #104 image-asset backend; does NOT touch api/mcp/schema/csv.

**What shipped:**
- `MealImageField` in MealFormPage — Link vs Upload segmented radio toggle; active mode inferred on mount from current imageUrl.
- Web api client `api/images.ts`: uploadMealImage, deleteMealImage, imageAssetUrl, parseAssetId, validateImageFile (MAX_IMAGE_BYTES 5MB, ALLOWED_IMAGE_MIME_TYPES png/jpeg/webp/gif, ImageValidationError).
- MSW default handlers (POST 201 / DELETE 204 / GET 200-PNG) + tests (upload success, validation failure, preview render).
- Inline thumbnail on DayCard meal pills.

**Key decisions:**
1. UNIFIED imageUrl (no schema/shared-type change). External URLs and uploaded assets both live in existing `Meal.imageUrl`. Uploaded → same-origin read path `/api/families/${familyId}/images/${assetId}`. One `<MealThumbnail src={meal.imageUrl}>` everywhere; httpOnly JWT cookie auto-sent on `<img>` GET.
2. Eager upload on file-select. Pick → client validate (mirrors #104: 5MB + MIME allowlist, backend authoritative) → uploadMealImage → set value to asset URL → preview. CREATE uploads WITHOUT mealId (unassociated); mealId only on EDIT.
3. Replace/Delete semantics (main risk): two refs — sessionAssetIdRef (this-session throwaway, reaped on supersede/Remove/abandon) + savedAssetIdRef (mount-persisted asset, reaped only via commitCleanup() AFTER successful save that replaced it). External URLs NEVER deleted. commitCleanup() on save success, abandon() on cancel. All cleanup best-effort/non-blocking (swallows 404).
4. No blob:/object URLs — CSP img-src is 'self' data: https: (no blob:), so previews use the real same-origin asset URL (enabled by eager upload).
5. Local error surfacing — MealImageField uses role="alert" + role="status", NOT useToast() (existing MealFormPage tests render without ToastProvider; useToast would throw).

**Accepted limitations / residual risk:**
- Magic Mirror gap (out of lane): #104 image GET is JWT+membership-gated; Mirror uses authenticateApiKey, so uploaded images won't render on the Mirror (external URLs still do). Needs a future backend auth change.
- Orphan on browser-back: uploading then navigating away before saving can orphan an asset. Matches #104's no-GC caveat; #106's cleanup CLI reaps unassociated assets (future backend sweep). No web-lane fix possible.

**Test note (convention):** images.test.ts:61 asserts byteLength > 0 (not exact count) for the upload body — under vitest jsdom a jsdom File passed as fetch body to Node undici stringifies to "[object File]" (13 bytes). Production code (body: file) is correct; test-realm artifact, not a production bug.

**Verify gate (devcontainer):** web test 380/380, lint 0 errors at 6933ea2. Container DNS down → full build-order gate runs on CI (PR #143). Verified via workspace-clone donor pattern (/tmp/v105); /workspace never written. No self-merge.
