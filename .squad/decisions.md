# Squad Decisions

## Active Decisions

### 2026-06-30T22-30-00: Data-model changes must ship CSV import + export support (#72)
**By:** coordinator
**What:** Established a standing rule: any major data-model change that adds a user-facing persisted field to meals (or another CSV-managed entity) must also be added to CSV import AND CSV export, keeping the round trip intact.
**References:** #72, #8
**Why:** `Meal.difficulty` (#8) shipped as a full vertical but was never wired into CSV import, so bulk-imported meals silently lost difficulty. Documented in [prisma.instructions.md](../.github/instructions/prisma.instructions.md). Same PR also adds full "export all meals as CSV" for data portability. Export column order is owned by `mealsToCSV`/`MEALS_CSV_HEADER` in `packages/web/src/utils/csv.ts` and must match the import parser + Zod schema.

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

### 2026-07-01: Added Saul (Data / Migrations specialist) + dev-environment/demo-data sprint (#75-#79)

Requested by Brandon Martinez. Added a new Squad member **Saul** (Ocean's Eleven cast) dedicated to **data**: backwards/forwards-compatible migrations (expand/contract), data-integrity guardianship (no accidental DB wipes / unguarded resets), and seed/fixtures. Charter at `.squad/agents/saul/charter.md`; roster in `team.md`; `squad:saul` label created; `casting/registry.json` gains a `data` role. **Routing change:** Database/schema/migrations/seed work now routes to **Saul (with Livingston)** — previously folded into Livingston alone. Saul and Livingston co-own the schema contract; both must be satisfied on schema PRs (Saul: compatibility/rollout ordering; Livingston: services/routes that consume it).

Filed + assigned to next sprint (`priority:p2`):
- #79 Dev login: `POST /api/auth/dev-login` (hard-gated to non-prod) pass-through to a seeded demo user, plus a secondary Dev-login button on LoginPage while keeping real Google sign-in [squad:frank].
- #77 MCP smoke testing: verify `packages/mcp` tools + API `agent`/`agent.mcp` routes against a real API+DB with a scoped AgentCredential, asserting scope enforcement + audit logs [squad:yen].
- #75 Rich date-relative demo seed: demo family, 5 members (2 parents + 3 kids), ~50 recipes, multiple Monday-anchored weeks computed off today, suggestions (approved+pending), grocery list; idempotent; `db:reset` reseeds [squad:saul].
- #78 Add Saul to the team (this entry) [squad:rusty].
- #76 Root `dev.sh` launcher: bring up the devcontainer + apps from a plain terminal (no VS Code) [squad:basher].

### 2026-07-01: Hosted MCP transport + per-request family-from-key auth (#81)

Requested by Brandon Martinez. Delivered issue #81: converted the MCP server from single-tenant stdio to a **hosted, multi-tenant** server where the agent credential is presented **per request** (header `x-agent-key`) and the family is derived from the key — never configured at boot, never passed into a tool.

**Transport (the key fork):** MCP SDK **Streamable HTTP** in **stateless mode** (`sessionIdGenerator: undefined`, `enableJsonResponse: true`). Each POST `/mcp`: read key -> `GET /api/agent/me` resolves `{familyId,scopes,name}` -> build a per-request `MealPlannerApiClient` + `McpServer` with handlers bound to that `familyId` -> fresh transport -> teardown on response close. No new deps (Node `http`). The **stdio** entry stays as an optional local/#77 mode; the tool/handler layer (`createToolHandlers(client, familyId)`) is transport-agnostic, so no tool logic differs between modes.

**Requirements shipped:** (1) `GET /api/agent/me` family-from-key auth (audited `identify`); (2) new `meal:write` scope in both scope definitions (auto-surfaces as a Family Settings checkbox) + `POST /api/agent/meals` & `PATCH /api/agent/meals/:mealId` + MCP `create_meal`/`update_meal`; (3) `GET /api/agent/grocery/current` (generates on demand when absent) + MCP `get_current_grocery_list`. No DB migration; no meal DELETE; no OCR/vision (the calling LLM parses recipes).

**Security invariants (Frank):** every call re-authenticates from the presented key; cross-family access impossible (family resolved from key; legacy `/:familyId/*` routes keep their cross-check + audit); invalid/revoked/expired keys -> uniform 401; scope denials -> 403 + audited; the raw key is never logged, serialized, or placed in an error. Verified live: with/without `meal:write` -> 201/200 vs 403 with `missing_scope` audit rows.

Full gate green in-container: build clean, lint 0 errors (7 pre-existing warnings), **711 tests** (shared 4 + mcp 51 + api 425 + web 231). Shipped as 4 atomic commits on `hosted-mcp-write-tools`. Residual risk: stateless mode builds a fresh server per request (no server-initiated notifications) — by design for horizontal scalability.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
