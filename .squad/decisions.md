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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
