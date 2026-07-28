# Squad Decisions

## Active Decisions

> Archive gate 2026-07-28T10:15:00-04:00: decisions.md was 79978 bytes before archival. 30-day: archived 0 entries older than 30 days; 7-day: archived 52 entries older than 7 days; durable standing policy entries were restored/exempted, so future gates filter by age AND durability. Archive: [decisions-archive/2026-07-28T10-15-00-04-00-grocery-sort-218-archive.md](decisions-archive/2026-07-28T10-15-00-04-00-grocery-sort-218-archive.md).
> Inbox merge 2026-07-28T10:15:00-04:00: processed 2 entries (linus-grocery-sort-218.md, rusty-grocery-pantry-grouping.md); consolidated overlapping #218 grocery grouping decisions and recorded Linus pantry category-only behavior as superseded by Rusty.
> Archive gate 2026-07-09T01:11:01-0400: decisions.md was 81141 bytes before merge and 85167 bytes after inbox merge. 30-day: archived 0 entries older than 30 days; 7-day: archived 9 entries older than 7 days. Archive: [decisions-archive/2026-07-09T01-11-01-0400-v0.6.0-grocery-mealpicker-archive.md](decisions-archive/2026-07-09T01-11-01-0400-v0.6.0-grocery-mealpicker-archive.md).
> Archive gate 2026-07-03T02:23:57-0400: decisions.md was 78149 bytes before Wave 3 close. Archived 30 historical entries to [decisions-archive/2026-07-03T02-23-57-0400-wave3-premerge.md](decisions-archive/2026-07-03T02-23-57-0400-wave3-premerge.md); retained current governance rules plus Sprint 3 Wave 1/2 and Wave 3 active decisions. Previous gate report: [2026-07-03T01-15-59-0400-no-eligible-entries](decisions/archive/2026-07-03T01-15-59-0400-no-eligible-entries.md).

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

### 2026-07-28: Archive gate requires age AND durability
**By:** Rusty
**What:** Scribe's decision archive gate must archive only entries that are both old enough for the active tier and non-durable. Durable decisions are operationally defined as still-true standing process rules, architecture/data contracts, security/auth hardening contracts, environment/infra facts, or cross-package conventions with no natural expiry. `## Standing Policy` is the durable section: Scribe must never archive entries from it, must promote durable inbox decisions into it, and must report archived counts, durable retentions, promotions, and pressure conditions in the HEALTH REPORT.
**Why:** Age alone evicted load-bearing rules such as pantry-staples separation and grocery regeneration provenance, recreating the failure mode where agents miss binding decisions. The byte ceilings stay useful, but durable contracts must survive the archive gate. If all remaining entries are durable and the file still exceeds the ceiling, Scribe reports the condition to the coordinator instead of dropping rules to fit. This decision is itself durable and belongs in `## Standing Policy`.

### 2026-07-28: Devcontainer mounts host npm config when present

**By:** Basher
**What:** For `./dev.sh`, the local devcontainer uses the host's existing npm configuration as the single source of truth when available. If `~/.npmrc` exists on the host, `dev.sh` includes an optional compose fragment that bind-mounts that exact file read-only at `/home/node/.npmrc` for the container's `node` user. If the host file is absent, the fragment is skipped entirely so Docker does not create an empty source directory or shadow the container path. In-container commands continue to use non-login `bash -c`; `--fresh` forces dependency reinstall; and clean dev starts build shared + MCP before launching dev servers.
**Why:** Some developer machines must use a sanctioned package-feed proxy while direct npmjs.org access is blocked. Mounting `~/.npmrc` keeps registry configuration and any feed auth in the host-owned config file, avoids a second repo-owned registry path, survives container recreation, and keeps CI/contributors without host npm config unaffected. No credential or registry URL belongs in `.squad/`; the merged inbox entry contained none.

## Historical Record

### 2026-07-09: WebSocket realtime backbone (#207, PR #212)
**By:** Basher
**What:** Full bidirectional realtime via socket.io. Server: app.listen → http.createServer + socket.io; isolated JWT(cookie/Bearer)+API-key handshake in realtime/auth.ts (single trust boundary); room-per-family (`family:<id>`, joined server-side only); 13 typed emit sites; CSP connect-src += ws:/wss:. Shared: typed event contracts. Web: SocketProvider/useSocket/useRealtimeEvent, same-origin httpOnly-cookie socket, wired into grocery + week-plan pages; vite /socket.io ws proxy. No schema change. Traefik native WS passthrough (infra unchanged).
**Why:** Family feedback — changes should propagate live across collaborative views.

## Governance

### 2026-07-28T10:15:00-04:00: Grocery grouping by day/meal preserves pantry separation and uses sourceMealIds (#218) (consolidated)
**By:** Linus, Rusty
**What:** Grocery items with no `sourceDays` and no valid source meal ids are grouped under **Unassigned** in day and meal grouping modes. Pantry staple separation from #205 is mode-independent: category, day, meal, and alphabetical grocery modes must keep managed pantry-staple matches in their dedicated collapsed **Pantry Staples** section rather than folding them into normal shopping groups. Meal grouping uses `sourceMealIds` for membership; `sources` strings are display labels only. Linus's initial pantry-staples-in-category-mode-only decision is superseded by Rusty's binding #205 ruling.
**Why:** `Unassigned` covers manual and generated items whose provenance is unavailable without inventing a weekday or meal. #205 made pantry separation the stock-kitchen behavior, not a category-only sorting choice. The API may leave `sources` labels stale when a MANUAL orphan is promoted, so `sourceMealIds` is the reliable provenance contract for membership while `sources` remains display context.
