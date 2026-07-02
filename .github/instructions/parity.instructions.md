---
description: "Use when editing or adding recipe management capabilities across packages/api, packages/mcp, packages/web, or packages/shared. Governs REST/MCP parity for recipe fields, scopes, and the display surface. Operationalises the Sprint 1 gate approved in issue #96."
applyTo: "packages/api/src/routes/**,packages/api/src/services/meals*.ts,packages/mcp/src/**,packages/web/src/**,packages/shared/src/**,packages/api/prisma/**"
---
# Recipe API / MCP Parity Rules

> **Scope.** This file is the canonical enforcement artifact for every Sprint 2 recipe build issue (#97–#112). It is complementary to the governance trail recorded on issue #96. Follow these rules on every PR that touches the recipe feature set; non-compliance blocks merge.

---

## 1. Parity Checklist

**Every persisted recipe change MUST traverse this ordered chain.** Copy this checklist into each recipe build issue and tick every applicable row. A row is either **done** or **explicitly marked N/A with a one-line reason** — never silently skipped.

| # | Layer | Artifact |
|---|-------|----------|
| 1 | Prisma schema | `schema.prisma` + **one additive migration** (per #92) |
| 2 | Service | `packages/api/src/services/meals.ts` (or feature service) |
| 3 | REST route Zod | `packages/api/src/routes/meals.ts` |
| 4 | **Agent route Zod** | `packages/api/src/routes/agent.ts` — **non-skippable** |
| 5 | Shared DTO / types | `packages/shared/src/types/dto.ts` + `types/index.ts` |
| 6 | Web client | `packages/web` `request<T>()` call + form / UI |
| 7 | **MCP apiClient** | `packages/mcp/src/apiClient.ts` — **non-skippable** |
| 8 | **MCP tool schema + scope + description** | `packages/mcp/src/tools.ts` (`inputSchema`, `TOOL_SCOPES`, human-facing `description`) — **non-skippable** |
| 9 | Tests | api (`*.test.ts`, `agent.mcp.test.ts`), mcp (`tools.test.ts`, `apiClient.test.ts`), web (`*.test.tsx` + MSW) |
| 10 | CSV round trip | Only if a persisted, user-facing **Meal scalar** (see §1b) |
| 11 | Scope metadata | Only on scope add / change (see §1c) |

### 1b. CSV Sub-Checklist (row 10)

Triggered when the change adds a **persisted, user-facing Meal scalar** (`prepTimeMinutes`, `cookTimeMinutes`, `servings`, `sourceUrl`, `notes`, `favorite`, `rating`, external `imageUrl`). All five items must move together:

- [ ] Export column in `mealsToCSV` + `MEALS_CSV_HEADER` (`packages/web/src/utils/csv.ts`)
- [ ] Import parse in `parseMealsCSV` (same column order)
- [ ] Import Zod schema in `packages/api/src/routes/meals.ts`
- [ ] `importMeals` / `exportMeals` services updated
- [ ] Import dialog docs + templates updated

**Not CSV-portable:** binary image bytes / opaque asset ids. Child relations (`MealInstruction[]`, `Tag[]`, `Category[]`, `RecipeCollection`) are **out of CSV scope** unless a build issue explicitly designs serialization — default N/A with that reason. External `imageUrl` (a scalar) **is** CSV-portable and MUST round-trip.

### 1c. Scope-Change Sub-Checklist (row 11)

A scope string is a **wire contract**. When a build issue adds a new scope, all items move in **lockstep**:

- [ ] Add to `AGENT_SCOPES` in `packages/shared/src/constants/index.ts`
- [ ] Mirror **byte-for-byte** in `packages/api/src/services/agentCredential.ts`
- [ ] Add parent-facing copy to `AGENT_SCOPE_METADATA` (label + description)
- [ ] Add the checkbox to the web Family Settings scope UI
- [ ] Map the tool → scope in `TOOL_SCOPES` (`packages/mcp/src/tools.ts`)
- [ ] Gate the agent route with `requireScope(...)` and audit denials

---

## 2. Auth Across Three Surfaces

Family-scoped recipe entities are reachable on exactly three surfaces:

| Surface | Chain | Recipe capability |
|---------|-------|-------------------|
| **Browser** | `authenticateJWT → requireMembership → [requireRole("PARENT")]` | Full read + authoring. `requireRole("PARENT")` added **only** for destructive/admin actions (delete). Create/edit are member-level. |
| **MCP / agent** | `authenticateAgent → requireScope(<scope>)` | Read + authoring gated per scope. No members/roles/invites/keys surface. **No DELETE.** |
| **Display** | `authenticateApiKey` | Read-only, deny-by-default (see §3). |

### 2a. Scope Decision

**All #92 recipe metadata → reuse `meal:write`. No new scopes for metadata fields.**

Scope granularity in this system is **per-operation-kind, not per-field.** `meal:write` means "create and edit meals"; editing prep time, rating, notes, tags, or instructions is editing the meal. Least-privilege is preserved at the operation level. When `meal:write` is first broadened to cover recipe details, update its `AGENT_SCOPE_METADATA` description to: *"Create and edit meals and their recipe details."*

- **Per-family `rating` → `meal:write`.** Rating is a family-scoped scalar; the agent already acts for its bound family.
- **External `imageUrl` scalar → `meal:write`.** Setting an external URL is like setting `sourceUrl` — a scalar field on the meal. CSV-portable.
- **Binary image UPLOAD → new scope `meal:image`, deferred to #103/#104.** Uploading raw bytes is a materially different capability (storage consumption, content-type/size validation, DoS profile). A parent should be able to grant recipe-text editing without granting media upload. Rule: external URL = `meal:write`; binary upload = `meal:image`.
- **Deletes stay off the agent surface.** This asymmetry is allowed (see §5) — DELETE is parent-gated admin.

---

## 3. Display Exposure — Deny-by-Default

`DisplayMealEntry` keeps its current six fields: `id`, `name`, `description`, `placeholderKind`, `icon`, `imageUrl`. The public contract is unchanged per #93.

**MUST NOT be exposed on the public API-key surface:**
`rating`, `favorite`, `notes`, `sourceUrl`, `prepTimeMinutes`, `cookTimeMinutes`, `servings`, `ingredients`, `MealInstruction[]`, `Tag[]`, `Category[]`, `RecipeCollection`, `lastCookedOn`, any member/agent/audit data.

**Adding any recipe field to `DisplayMealEntry` is a separate, explicit decision in its own issue** — never an automatic consequence of shipping a recipe field. Default for every new field is **not exposed**.

---

## 4. Placeholder Limitations

Placeholder meals (`placeholderKind` non-null) are structural slot markers, not recipes. Treatment must be **identical across all surfaces**:

| Aspect | Rule |
|--------|------|
| **Editing** | Un-editable. Service throws `"Cannot modify placeholder meal"`; browser PUT and agent PATCH both return **403** (agent audits `reason: "placeholder"`). New recipe fields are therefore un-settable on placeholders on every authoring surface. |
| **Creation** | `create_meal` (REST + MCP) MUST NOT create placeholders — they are system-seeded. |
| **Search / list** | **Excluded** from search/filter results per #94 on **both** REST and agent list routes. |
| **Recipe metadata / images / rating** | None — placeholders carry no recipe fields. |
| **Display** | Placeholders **DO** appear on the Magic Mirror via `icon` + `name`; `imageUrl` is null. |

New features must preserve this symmetry. A build issue that allows an agent to set a field on a placeholder while the browser blocks it (or vice-versa) is a parity violation.

---

## 5. HARD RULE — UI-Only Recipe Features Violate Parity

> **Every user-facing recipe capability MUST exist on REST *and* MCP together, in the same PR.**

Checklist rows **4 (agent route Zod), 7 (MCP apiClient), and 8 (MCP tool schema + scope + description)** are **required and non-skippable** for any capability the web exposes to users. A PR that ships a web recipe feature without the matching MCP surface is **incomplete**, regardless of test coverage.

**The only allowed asymmetries are the pre-existing, documented ones:**
- Destructive **DELETE** (parent-gated on web, absent on agent).
- Family / member / role / invite / API-key / auth / OAuth management (browser-only, behind the JWT chain).

**Any NEW asymmetry requires an explicit decision record approved by the coordinator** — it is never the default.
