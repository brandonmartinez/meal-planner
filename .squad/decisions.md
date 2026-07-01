# Squad Decisions

## Active Decisions

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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
