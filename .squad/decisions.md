# Squad Decisions

## Active Decisions

> Archive gate 2026-07-28T10:15:00-04:00: decisions.md was 79978 bytes before archival. 30-day: archived 0 entries older than 30 days; 7-day: archived 52 entries older than 7 days; durable standing policy entries were restored/exempted, so future gates filter by age AND durability. Archive: [decisions-archive/2026-07-28T10-15-00-04-00-grocery-sort-218-archive.md](decisions-archive/2026-07-28T10-15-00-04-00-grocery-sort-218-archive.md).
> Inbox merge 2026-07-28T10:15:00-04:00: processed 2 entries (linus-grocery-sort-218.md, rusty-grocery-pantry-grouping.md); consolidated overlapping #218 grocery grouping decisions and recorded Linus pantry category-only behavior as superseded by Rusty.
> Archive gate 2026-07-09T01:11:01-0400: decisions.md was 81141 bytes before merge and 85167 bytes after inbox merge. 30-day: archived 0 entries older than 30 days; 7-day: archived 9 entries older than 7 days. Archive: [decisions-archive/2026-07-09T01-11-01-0400-v0.6.0-grocery-mealpicker-archive.md](decisions-archive/2026-07-09T01-11-01-0400-v0.6.0-grocery-mealpicker-archive.md).
> Archive gate 2026-07-03T02:23:57-0400: decisions.md was 78149 bytes before Wave 3 close. Archived 30 historical entries to [decisions-archive/2026-07-03T02-23-57-0400-wave3-premerge.md](decisions-archive/2026-07-03T02-23-57-0400-wave3-premerge.md); retained current governance rules plus Sprint 3 Wave 1/2 and Wave 3 active decisions. Previous gate report: [2026-07-03T01-15-59-0400-no-eligible-entries](decisions/archive/2026-07-03T01-15-59-0400-no-eligible-entries.md).
> Archive gate 2026-08-03T11-00-32-0400: archivable_bytes before merge = 3,481 (## Active Decisions 1,573 + ## Historical Record 737 + ## Governance 1,171). Well under the 24,576-byte Tier-1 threshold. No archival needed.
> Inbox merge 2026-08-03T11-00-32-0400: processed 6 entries (rusty-tabular-recipe-view.md, saul-recipe-matrix-schema.md, livingston-derive-recipe-matrix.md, livingston-suppress-derived-groups.md, linus-tabular-recipe-view.md, yen-grid-view-verification.md); 3 durable contracts promoted to ## Standing Policy (HYBRID+naming+anti-staleness consolidated; group pills authored-only; short-label web-only+abbreviate-not-mislead); tabular recipe phase plan added to ## Active Decisions; Phase 1 implementation summary added to ## Historical Record.

### 2026-08-03T11:09:03-04:00: Tabular "Grid" recipe view — phase plan and parity treatment

**By:** Brandon Martinez (decision), Rusty (Lead/Architect)
**What:** The tabular/Grid recipe view is phased. Phase 1 (shipped): additive schema + derive-on-read + API read path + web toggle/renderer. Ships as a READ capability. #96 parity: read parity delivered; agent-write Zod + MCP write `inputSchema` for matrix authoring explicitly N/A (Phase 1 ships READ only, not a silent skip). Commits: `27e94a3` (P1-1), `7054875` (P1-2), `9f62bfc` (P1-3/4/5), `4d23572` (P1-6/7/8), `07c21b2` (P1-9), `0a90fdb`/`118370c`/`d467f29` (short-label rounds 1–3). Phase 2 (planned): matrix editor in `MealFormPage`; REST write Zod + agent route Zod + MCP tool `inputSchema` for matrix fields. No schema change (columns exist). Scope stays `meal:write`. Full 11-row parity chain. Phase 3 (planned): print CSS; Magic Mirror Grid (separate §3 deny-by-default decision needed); per-meal view-mode override. Toggle: `CookingModePage` only (full-width surface loading ingredients+instructions). `MealDetailModal` too narrow — unchanged. Sub-`sm` degrades Grid→List; persisted `localStorage['recipeViewMode']` never overwritten by viewport. Spec: `session-state/…/files/tabular-recipe-view-spec.md`. Open: (1) Phase-2 editor depth; (2) Magic Mirror in/out (§3 decision); (3) Phase-2 span integrity on ingredient reorder/delete (design: clamp-in-editor + renderer fallback).
**Why:** Phase 1 = read only, ships schema + deriver without blocking on editor UX. Phase 2 keeps authoring + parity together in one PR. Phase 3 is cosmetic/display-extension.

## Standing Policy

> These entries are exempt from age-based archival and must be retained in `decisions.md` regardless of date; archive gates filter by age AND durability.

### 2026-07-04: Capture a GitHub issue for all substantial work

**By:** Squad (Coordinator)
**What:** Any substantial change — more than a few lines of code, or touching multiple files — MUST have a GitHub issue opened BEFORE work starts. Trivial one-liners (typo, single-value tweak) are exempt. The coordinator opens the issue up front, applies labels (`type:*` + owning `squad:{name}`), and threads the issue number through the spawn prompt → branch (`squad/{issue}-{slug}`) → commits → PR body (`Closes #N`). Enforced in `.github/skills/agent-collaboration/SKILL.md` (Issue Capture pattern) so every agent spawn sees it.
**Why:** Brandon: "make sure the squad knows to create issues for substantial work (essentially anything more than a few lines of code being changed or if there are multiple files)." Several ad hoc UI PRs this session (#153, #154, #155, #157, #158, #159, #160, #161) shipped without a tracking issue, breaking traceability. Retroactive issues were opened + closed for those; going forward the issue precedes the work.

### 2026-07-04: Commit squad decision records as part of the process

**By:** Squad (Coordinator)
**What:** Squad decision records are now COMMITTED to git as a standard part of the process, not left uncommitted for manual review. Scribe's reconciliation cycle ends with a git commit of `.squad/decisions.md` (+ processed inbox, orchestration/session logs, agent histories). Decision records follow the standard format (`### {date}: {title}` / **By** / **What** / **Why**) and live in `.squad/decisions/inbox/{author}-{slug}.md` until Scribe merges + commits them.
**Why:** Brandon: "also standardize the squad decision records as part of the process and to commit." Reverses the prior "leave .squad/ writes local/uncommitted" convention so decision history is versioned and shared with the team.

### 2026-07-03: Remove meal taxonomy categories (#107), fold into tags
**By:** Livingston (Backend) — requested by brandonmartinez
**What:** Removed the meal **taxonomy category** feature (#107) entirely across the stack in one atomic, buildable PR against `main`. Existing data is preserved: each meal's category names are folded into its tags by a raw-SQL data migration that runs BEFORE the DROP TABLEs. Migration: (1) Insert a `Tag` for every `Category` missing one (same `familyId`+`nameNormalized`), via `gen_random_uuid()::text` with `WHERE NOT EXISTS` dedup. (2) Insert a `MealTag` `(mealId, tagId)` for every `MealCategory` (JOIN on `familyId`+`nameNormalized`), `ON CONFLICT ("mealId","tagId") DO NOTHING`. (3) `DROP TABLE "MealCategory"`, then `DROP TABLE "Category"`. Parity: meal-category create/update/list-filter/random/fill and the category-taxonomy CRUD were removed in lockstep across REST (routes/meals.ts, routes/weekPlan.ts), the agent route (routes/agent.ts), MCP (apiClient.ts + tools.ts, Zod raw shape), and web — keeping REST/MCP/agent in parity. Export CSV drops the `categories` column; import folds a legacy `categories` column into tags for backward-compat. **KEEP boundary:** ❌ REMOVED — meal taxonomy: `Category` model, `MealCategory` join, `Meal.categories` + `Family.categories` relations. ✅ KEPT (untouched) — grocery aisle categories: `GroceryCategory` (#119), `MealIngredient.category`, `GroceryItem.category`, `INGREDIENT_CATEGORIES`, `list_grocery_categories`, the grocery-categories route/hooks.
**Why:** Brandon decided meal taxonomy categories overlap too much with tags and add no value. `Category ≅ Tag` and `MealCategory ≅ MealTag` are structurally identical, so the fold is a straight per-family copy with no data loss.

### 2026-07-05: Vendor MMM-meal-planner as a git submodule (#178)

**By:** Squad (Coordinator)
**What:** Added `brandonmartinez/MMM-meal-planner` as a git submodule at `integrations/magic-mirror` (PR #179), pinned to the week-view commit `035119d`. Only `.gitmodules` + the gitlink are checked in; module source stays in its own repo. Non-recursive clones and CI are unaffected. Update later via `git submodule update --remote integrations/magic-mirror && git commit`.
**Why:** Brandon wanted the module associated with the meal-planner domain "without it necessarily being fully checked into the repo … a git ref of some sort," so the two stay discoverable together while the module keeps its own repo, issues, and release cadence. Chosen over subtree (checks files in), package.json git-dep (wrong install model), and staying fully separate.

### 2026-07-05T12:57:39-0400: MCP meal image upload uses base64 bytes + `meal:image` scope (#180)

**By:** brandonmartinez (via Copilot coordinator)
**What:** MCP meal image upload will pass base64-encoded bytes in the tool call plus a declared `contentType`. The API validates with magic-byte sniffing (`sniffImageMime`) over the client-declared type, validates decoded size before persisting, and stores via the existing image pipeline. A new additive `meal:image` scope, distinct from `meal:write`, gates the agent upload route.
**Why:** API + web binary upload infrastructure already exists from #104, but MCP only had the `imageUrl` scalar path from #103. Parity §2a pre-authorized a dedicated image scope; base64 keeps MCP transport simple while server-side sniffing and size validation keep trust boundaries on the API. Tracked in #180 and dispatched to Livingston.

### 2026-07-05T21:05:00Z: Production deploys via the cluster GitOps repo, not meal-planner's k8s/

**By:** Scribe — on behalf of brandonmartinez (incident #181 post-mortem)
**What:** Production for meal-planner deploys via the separate `raspberry-pi-kubernetes-cluster` GitOps repo (ArgoCD-managed), NOT via the `k8s/` folder inside this repo. Infra changes that need to reach the production cluster — PVCs, Deployments, environment variables, security contexts, etc. — belong in `raspberry-pi-kubernetes-cluster`, not here. Meal-planner's `k8s/` folder never reaches prod; it is development/documentation reference only.
**Why:** During the #181 incident (prod 500 on meal-image upload), Basher initially authored a fix in this repo's `k8s/` folder (PR #182). That PR was CLOSED when the wrong-repo pivot was discovered. The real fix (issue #104 in `raspberry-pi-kubernetes-cluster`) is being handled by that repo's own Squad (Dallas, GitOps engineer). This decision prevents the same confusion in future: any prod infra ticket arising from meal-planner issues must be filed in `raspberry-pi-kubernetes-cluster`, not here.

### 2026-07-05T21:05:00Z: Durable meal-image storage in prod — Longhorn RWX PVC + fsGroup:1000

**By:** Scribe — on behalf of brandonmartinez (incident #181 post-mortem)
**What:** The correct production image-storage fix uses: a Longhorn ReadWriteMany (RWX) PVC shared across all HPA replicas (2–3), `IMAGE_STORAGE_ROOT=/data/images` env var, and `fsGroup: 1000` in the pod security context so the `node` user (uid/gid 1000) can write to the mounted volume. This fix lives in the `raspberry-pi-kubernetes-cluster` GitOps repo as issue #104.
**Why:** The prod deployment uses a Horizontal Pod Autoscaler (2–3 replicas). A ReadWriteOnce (RWO) PVC (like k3s `local-path`) can only bind to one node/pod at a time — using RWO with multiple replicas would either make uploads fail on non-binding pods or require dropping the HPA to `replicas: 1`. Longhorn RWX allows all replicas to share one durable volume, preserving the existing autoscaling policy. Basher's inbox entry `basher-image-storage-k8s.md` documented a single-replica RWO approach in the wrong repo (PR #182, CLOSED) — that entry is superseded by this one.

### 2026-07-06: UUID-constrained imageUrlSchema hardening — asset-path regex (#188, PR #195)

**By:** Livingston (Backend Dev)
**What:** Hardened `imageUrlSchema` in `packages/api/src/schemas/meals.ts` — replaced the loose `ASSET_PATH_RE = /^\/api\/families\/[^/?#]+\/images\/[^/?#]+$/` with a UUID-constrained pattern built from a `UUID_RE` string constant (RFC-4122 hex/hyphen segments), matching `/api/families/{uuid}/images/{uuid}` exactly, case-insensitive. Dropped the redundant `!value.includes('..')` guard (UUID char class structurally excludes dots). `ASSET_PATH_RE` is also exported and reused by `display.ts` (follow-up #196).
**Why:** Frank's #187 security review issued a YELLOW defense-in-depth recommendation to constrain the same-origin asset path to exact UUID segments so arbitrary path shapes (percent-encoded traversal, encoded slashes, internal newlines, backslashes) cannot pass validation.
**How:** `new RegExp` composed from `UUID_RE` constant; updated three doc-comment blocks; `ASSET_PATH_RE` exported for reuse by the display route (#196). PR #195 squash-merged to main at c4c0b42f.

### 2026-07-06: Display image route for MagicMirror API-key access (#196, PR #197)

**By:** Livingston (Backend Dev)
**What:** New display-tier route `GET /api/display/images/:assetId` guarded by `authenticateApiKey`. Meals payload rewrites uploaded `imageUrl` values to this path via `rewriteDisplayImageUrl()`. `familyId` is sourced from `req.familyId` (no path param); cross-family asset requests return 404. ETag = sha256(familyId|assetId|extension); `If-None-Match` → 304 before storage fetch. `ASSET_PATH_RE` (hardened UUID regex, exported from meals.ts per #188/#195) detects uploaded paths; external https URLs pass through unchanged.
**Why:** MagicMirror uses API-key auth only; uploaded image URLs were JWT-gated relative paths, making uploaded meal photos unreachable on the mirror display.
**How:** Route added to `packages/api/src/routes/display.ts`; `rewriteDisplayImageUrl()` helper rewrites same-origin paths; conflict with #195 resolved (kept hardened UUID regex + export, dropped redundant `..` guard, test fixtures updated to RFC-4122 UUIDs). Follow-up #198: Vary header + storage-error logging. PR #197 squash-merged at a1640db0.

### 2026-07-06: Display image route hardening — Vary header + storage error logging (#198, PR #200)

**By:** Livingston (Backend Dev)
**What:** Hardened the #196 display image route in `packages/api/src/routes/display.ts` — added `Vary: x-api-key` on both the 200 and 304 response paths; added `console.error('[display] image storage failed', { assetId: asset.id }, err)` in the storage-read catch block before the 404 return.
**Why:** The route varies its response by API key but did not advertise `Vary`, risking cross-family cache bleed on shared caches. Storage failures returned a silent 404 with no operator signal.
**How:** `res.setHeader('Vary', 'x-api-key')` before both `res.status(304).end()` and `res.send(bytes)`; no Vary on 404 paths (not cacheable); API key is never included in log args. 25/25 tests pass — assert Vary on 200+304 and `console.error` spy on storage-error test. PR #200 squash-merged to main at a111ee26.

### 2026-07-09T01:11:01-0400: Managed pantry staples list separates stock-kitchen items
**By:** Brandon Martinez (via Copilot) — Squad Coordinator captured
**What:** Add a per-family managed pantry-staples list in settings (for example, `PantryStaple` keyed by family plus normalized name). Grocery items whose normalized name matches a staple should auto-separate into a dedicated `Pantry Staples` section.
**Why:** The family wants stock-kitchen staples separated from normal shopping items without relying on ad hoc manual grocery edits.
**Context:** Family feedback on the latest grocery-list + meal-picker release; coordinator clarifications are authoritative for the v0.6.0 sprint.

### 2026-07-09T01:11:01-0400: Grocery regeneration is date-range aware and never drops checked items silently
**By:** Brandon Martinez (via Copilot) — Squad Coordinator captured
**What:** Regenerate grocery list behavior has three required sub-behaviors: allow short-order generation for a chosen set/range of days; preserve checked generated items that become orphaned during regen (promote to MANUAL or equivalent instead of deleting); and make `Remove past days` an explicit manual button, never an automatic side effect of regeneration.
**Why:** Checked items represent user intent and must not disappear. Date-range generation supports partial-week planning, while manual cleanup avoids surprising destructive changes.
**Context:** Family feedback on the latest grocery-list + meal-picker release; coordinator clarifications are authoritative for the v0.6.0 sprint.

### 2026-07-09T01:11:01-0400: Full WebSockets realtime for collaborative views
**By:** Brandon Martinez (via Copilot) — Squad Coordinator captured
**What:** Implement real-time updates with FULL bidirectional WebSockets, not SSE or polling. Scope includes grocery list, week plan, and Magic Mirror display. Build `http.createServer(app)` around Express, attach a socket server, use room-per-family scoping, authenticate the socket handshake via JWT/API key, and add `ws:`/`wss:` to Helmet CSP `connect-src`.
**Why:** Family feedback needs true collaborative live updates across users and display surfaces; WebSockets are the chosen architecture despite being the largest v0.6.0 effort item.
**Context:** Family feedback on the latest grocery-list + meal-picker release; coordinator clarifications are authoritative for the v0.6.0 sprint.

### 2026-07-09: WebSocket auth hardening (#213, PR #215)
**By:** Basher
**What:** Three API-side hardening items on the socket handshake — no schema/migration/new deps. (1) Explicit WS Origin gate — new pure `realtime/handshake.ts` (`parseAllowedOrigins`/`isOriginAllowed`) + middleware in `realtime/index.ts`, reusing `config.clientUrl` (same source as HTTP `cors()`), comma-split multi-origin, trailing-slash normalized; null-Origin ALLOWED (non-browser server clients legitimately omit; browsers always send), a present Origin must match exactly. (2) JWT expiry disconnect — `auth.ts` surfaces `SocketAuthResult.tokenExp` (epoch ms via `jwt.decode`, JWT `kind:"user"` branch only); `index.ts` `scheduleExpiryDisconnect` guarded by `authKind==="user" && typeof tokenExp==="number"` so API-key sockets (`kind:"apiKey"`, no exp) are never scheduled; timer `unref`'d, cleared on disconnect, delay clamped to 32-bit max. (3) IP-keyed handshake throttle — `createHandshakeThrottle` (fixed-window) mirroring `middleware/rateLimit.ts`, keyed off real client IP via `X-Forwarded-For` honoring `trust proxy`; env `WS_HANDSHAKE_LIMIT=60` / `WS_HANDSHAKE_WINDOW_MS=60000`, `limit:0` disables. Middleware order: throttle → origin → auth.
**Why:** Closes Frank's three non-blocking advisories from the #207 socket-auth review (filed as #213). Origin gate added because Socket.IO CORS is not a complete WS Origin gate — direct upgrades must be checked server-side. Expiry disconnect closes the connect-time-only JWT check for long-lived sockets. Handshake throttle mirrors the HTTP rate-limit posture. Null-Origin allowed to preserve legitimate non-browser socket clients. Verification: full build chain green; `pnpm -r run test` = 1715 passed (api 1011 incl. new handshake.test.ts 20 + index.test.ts 6 + auth.test.ts +2; web 579, mcp 121, shared 4); lint 0 errors (6 pre-existing warnings in untouched files).

### 2026-07-28T13:05:00-04:00: Grocery group headings own repeated provenance labels (#218)
**By:** Virgil
**What:** In `GroceryListPage`, the active group heading owns the provenance value it names: day grouping suppresses each row's day chip, and meal grouping suppresses each row's meal-source label. Category and alphabetical grouping still show both row provenance labels. Full provenance must remain reachable via row hover/title, and Pantry Staples follow the same display contract.
**Why:** Day and meal grouping duplicate multi-source grocery items into each relevant bucket, so suppressing the value already named by the group heading removes repetition without losing provenance.

### 2026-07-28T13:55:00-04:00: Archive gate uses archivable bytes, age, and durability (consolidated)
**By:** Rusty
**What:** Scribe's decision archive gate must archive only entries outside `## Standing Policy` that are both old enough for the active tier and non-durable. Durable decisions are operationally defined as still-true standing process rules, architecture/data contracts, security or auth hardening contracts, environment/infra facts, or cross-package conventions with no natural expiry. `## Standing Policy` is the durable section: Scribe must never archive entries from it and must promote durable inbox decisions into it. Archive triggers use `archivable_bytes`, not total file size: the UTF-8 byte sum of every top-level `## ` section except exact `## Standing Policy`, including each counted section header through the byte before the next top-level section; the file title/preamble are excluded and missing sections count as 0. `total_bytes` remains reporting-only and must never trigger a sweep. Current tiers: Tier 1 when `archivable_bytes` >24 KiB (24,576 bytes), archive eligible non-durable entries older than 30 days; Tier 2 after recompute when `archivable_bytes` >64 KiB (65,536 bytes), archive eligible non-durable entries older than 7 days. If eligible sweeps cannot lower `archivable_bytes` below the applicable ceiling, report pressure instead of evicting durable content.
**Why:** Age alone evicted load-bearing rules such as pantry-staples separation and grocery regeneration provenance; the later total-file-size budget measured the structurally unarchivable Standing Policy corpus and made the gate permanently red. Measuring only content the gate can act on preserves durable contracts while still surfacing total corpus growth. This supersedes the threshold/measured-denominator half of Rusty's earlier `2026-07-28: Archive gate requires age AND durability` decision; its durability test and Standing Policy never-archive rule remain binding here.

### 2026-07-28: Devcontainer mounts host npm config when present

**By:** Basher
**What:** For `./dev.sh`, the local devcontainer uses the host's existing npm configuration as the single source of truth when available. If `~/.npmrc` exists on the host, `dev.sh` includes an optional compose fragment that bind-mounts that exact file read-only at `/home/node/.npmrc` for the container's `node` user. If the host file is absent, the fragment is skipped entirely so Docker does not create an empty source directory or shadow the container path. In-container commands continue to use non-login `bash -c`; `--fresh` forces dependency reinstall; and clean dev starts build shared + MCP before launching dev servers.
**Why:** Some developer machines must use a sanctioned package-feed proxy while direct npmjs.org access is blocked. Mounting `~/.npmrc` keeps registry configuration and any feed auth in the host-owned config file, avoids a second repo-owned registry path, survives container recreation, and keeps CI/contributors without host npm config unaffected. No credential or registry URL belongs in `.squad/`; the merged inbox entry contained none.

### 2026-08-03T11:09:03-04:00: Tabular "Grid" recipe view — HYBRID model, naming, and anti-staleness contract (consolidated)

**By:** Brandon Martinez (decision), Rusty (architecture), Saul (schema), Livingston (derivation)
**What:** Three load-bearing contracts for the tabular recipe view, independently stated by all three implementation agents and consolidated here. (1) **Naming:** users see **"Grid"** (toggle: List / Grid); code uses **`TabularRecipe*`** prefix throughout (`TabularRecipeView`, view mode `'list'|'grid'`, `deriveRecipeMatrix`, `buildTabularRecipe`). Format attributed to Michael Chu's Cooking for Engineers (2004). (2) **HYBRID model:** Durable authored layout columns (`MealIngredient.position`/`groupLabel`; `MealInstruction.kind`/`subLabel`/`column`/`spanFrom`/`spanTo`; `enum InstructionKind { SETUP PROCESS FINISH }`) live in schema. An auto-derived fallback renders every existing recipe on day one; user-authored data overrides it once touched. Phase 1 ships derive-at-read only; Phase 2 adds the editor. (3) **Anti-staleness (Brandon-directed):** The derived matrix is **NEVER persisted** — recomputed on every read by `applyRecipeMatrix()` in `services/meals.ts`. Provenance is **structural**: `matrixSource = instructions.some(i => i.spanFrom != null) ? 'authored' : 'derived'`. **No stored `isDerived` flag** — a cached flag is exactly the class of state that goes stale. NULL layout columns mean "derive at read time (display-only, never persisted)", never "authored as empty". Schema doc comments must state this invariant on every layout column. This directly applies the grocery-provenance staleness lesson (`sources` vs `sourceMealIds`).
**Why:** Brandon approved the HYBRID after design review. The anti-staleness rule and structural provenance came from Brandon's hard requirement; a stored `isDerived` column would drift exactly as `sources` labels did on grocery items.

### 2026-08-03T12:16:22-04:00: Grid view ingredient groups render only for authored `groupLabel`

**By:** Rusty (ruling), Livingston (implementation)
**What:** `deriveRecipeMatrix` sets effective `groupLabel = ing.groupLabel ?? null` — NOT `?? ing.category ?? null`. `TabularRecipeView` renders group pills and section borders **only when `groupLabel` is non-null** (authored). Derived (unauthored) meals render **ungrouped** (all `groupLabel` values null). `MealIngredient.category` is the grocery-aisle vocabulary (`produce`, `dairy`, `meat`, `seafood`, `bakery`, `frozen`, `pantry`, `beverages`, `snacks`, `condiments`, `other` — from `list_grocery_categories`) — NOT recipe-section names. The ungrouped path is the **common case** on real data until Phase-2 authoring ships. `category` is retained on the input type (still part of the persisted row) but intentionally ignored for grouping.
**Why:** Real catalog data renders shopping-aisle names ("PANTRY / PRODUCE / DAIRY") that group ingredients by aisle rather than recipe section, actively fighting the Cooking-for-Engineers format. Yen's screenshots used a curated fixture ("seafood/breading/remoulade/assemble") that masked the problem. Group pills are the lowest-value Grid visual (span columns carry the value); suppressing derived groups costs nothing. Phase-2 authoring restores real sections via explicit `groupLabel` values.

### 2026-08-03T12:16:22-04:00: Short step labels — web-only presentation, never persisted; abbreviate but never mislead

**By:** Rusty (ruling), Linus (implementation)
**What:** Grid cells in `CookingModePage` display a **short label** derived from full step `text` by `shortStepLabel()` (`packages/web/src/utils/shortStepLabel.ts`). Rules (established after three rounds of adversarial defects): skip leading adverbial/conditional openers (meanwhile/once/after/before/while/when/using/carefully/…) to reach the imperative clause; strip trailing `to/for <measurement>` tails ONLY for temperature or minutes/hours (the exact units `extractSubLabel` re-shows, so the measurement stays visible); apply a 9-word max with glue-word trim (never ends on and/with/the/until/…); apply a 2-word floor (never strip to a bare verb). Full text appears in `title` (hover) and List view is always lossless. This logic is **entirely web-side, never persisted, never a DTO field** — `text` is the single semantic source of truth, so no #96/MCP parity impact. **Guiding principle:** a short label is *abbreviated* (drops redundant detail already visible in the ingredient bracket or subLabel), never *misleading* — never emit a label a cook would read as a different or incomplete instruction; when in doubt, keep more text.
**Why:** Full-sentence step text defeats the tabular format. A web-only transform has zero parity impact. Three rounds of defects (adverbial openers, overly-aggressive cap, seconds/days vanishing from touch UIs) established the current rules and the guiding principle.

## Historical Record

### 2026-07-09: WebSocket realtime backbone (#207, PR #212)
**By:** Basher
**What:** Full bidirectional realtime via socket.io. Server: app.listen → http.createServer + socket.io; isolated JWT(cookie/Bearer)+API-key handshake in realtime/auth.ts (single trust boundary); room-per-family (`family:<id>`, joined server-side only); 13 typed emit sites; CSP connect-src += ws:/wss:. Shared: typed event contracts. Web: SocketProvider/useSocket/useRealtimeEvent, same-origin httpOnly-cookie socket, wired into grocery + week-plan pages; vite /socket.io ws proxy. No schema change. Traefik native WS passthrough (infra unchanged).
**Why:** Family feedback — changes should propagate live across collaborative views.

### 2026-08-03: Tabular "Grid" recipe view Phase 1 shipped (P1-1 through P1-9)
**By:** Rusty (spec/review), Saul (schema), Livingston (shared/api/mcp), Linus (web), Yen (QA)
**What:** Phase 1 of the Cooking-for-Engineers tabular recipe view shipped. Additive schema migration `20260803110032_add_recipe_matrix_layout`; `deriveRecipeMatrix()` pure function in `packages/shared`; `applyRecipeMatrix()` in API read path; `TabularRecipeView` + `RecipeViewToggle` + `buildTabularRecipe` in web; `shortStepLabel()` in web utilities. Commits (in order): `27e94a3` (P1-1 schema), `7054875` (P1-2 shared), `9f62bfc` (P1-3/4/5 api/mcp), `4d23572` (P1-6/7/8 web), `07c21b2` (P1-9 suppress derived groups), `0a90fdb`/`118370c`/`d467f29` (short-label rounds 1–3). Integration verification (`e5765fc`, `421c25d`) + adversarial defect testing by Yen. Final: build PASS, lint PASS (0 errors), tests PASS 1840 (shared 31, mcp 121, web 665, api 1023). Yen verdict: **SHIP Phase 1**.
**Why:** Brandon requested Michael Chu's tabular recipe format as a toggleable second render mode. Phase 1 delivers the read/display capability; Phase 2 (editor UI + write parity) and Phase 3 (print/Magic Mirror) are planned.

## Governance

### 2026-07-28T10:15:00-04:00: Grocery grouping by day/meal preserves pantry separation and uses sourceMealIds (#218) (consolidated)
**By:** Linus, Rusty
**What:** Grocery items with no `sourceDays` and no valid source meal ids are grouped under **Unassigned** in day and meal grouping modes. Pantry staple separation from #205 is mode-independent: category, day, meal, and alphabetical grocery modes must keep managed pantry-staple matches in their dedicated collapsed **Pantry Staples** section rather than folding them into normal shopping groups. Meal grouping uses `sourceMealIds` for membership; `sources` strings are display labels only. Linus's initial pantry-staples-in-category-mode-only decision is superseded by Rusty's binding #205 ruling.
**Why:** `Unassigned` covers manual and generated items whose provenance is unavailable without inventing a weekday or meal. #205 made pantry separation the stock-kitchen behavior, not a category-only sorting choice. The API may leave `sources` labels stale when a MANUAL orphan is promoted, so `sourceMealIds` is the reliable provenance contract for membership while `sources` remains display context.
