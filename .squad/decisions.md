# Squad Decisions

## Active Decisions

> Archive gate 2026-07-03T02:23:57-0400: decisions.md was 78149 bytes before Wave 3 close. Archived 30 historical entries to [decisions-archive/2026-07-03T02-23-57-0400-wave3-premerge.md](decisions-archive/2026-07-03T02-23-57-0400-wave3-premerge.md); retained current governance rules plus Sprint 3 Wave 1/2 and Wave 3 active decisions. Previous gate report: [2026-07-03T01-15-59-0400-no-eligible-entries](decisions/archive/2026-07-03T01-15-59-0400-no-eligible-entries.md).

## Governance

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

## 2026-07-03T02:23:57-0400: Sprint 3 Wave 3

### 2026-07-03: Planning templates backend (#116, PR #146) — Saul (Data/Migrations)

**By:** Saul (Data/Migrations), requested by brandonmartinez. Sprint 3 Wave 3 — the wave's ONLY migration keystone. Branch `brandonmartinez-add-planning-templates-backend` @ `7d03bf0` (base main `64bb640`). CI `test` = SUCCESS (run 28642129060, Postgres 16).

**Schema (migration `20260703012000_add_planning_templates`):**
- `PlanningTemplate` (family-scoped): id(cuid), familyId→Family(onDelete: Restrict), name, nameNormalized (service-computed `lower(trim(name))`), timestamps, entries[]. `@@unique([familyId, nameNormalized])` (case-insensitive per-family name uniqueness), `@@index([familyId])`.
- `PlanningTemplateEntry`: id(cuid), templateId→PlanningTemplate(onDelete: Cascade), mealId→Meal(onDelete: Cascade), `dayOfWeek Int` (RELATIVE offset 0=Mon..6=Sun). `@@unique([templateId, dayOfWeek, mealId])`, `@@index([templateId])`, `@@index([mealId])`. Back-relations on Family + Meal.

**onDelete decisions (issue risk note):**
- Entry→Meal = **Cascade** (join-row semantics identical to MealTag/MealCategory/MealRecipeCollection; deleting a meal drops its template entries, template stays valid, apply never dereferences a dangling meal). Rejected SetNull (needs nullable mealId + ghost-entry skip logic) and Restrict (would block deleting any meal used in a template).
- Template→Family = **Restrict** (mirrors RecipeCollection/Tag/Category — family deletion consistently guarded).
- Template→Entry = **Cascade** (owned-children cleanup).

**Migration discipline:** timestamp strictly after `20260702220000_add_recipe_collections`; authored OFFLINE via `prisma migrate diff --from-schema-datamodel … --to-schema-datamodel … --script` (NEVER `migrate dev` — shared dev DB advisory lock wedged all sprint). Purely additive (static-verified): 2× CREATE TABLE, 5× CREATE INDEX, 3× ALTER TABLE ADD CONSTRAINT FK. Zero DROP/ALTER-DROP; does NOT touch `Meal_name_trgm_idx`. CI drift check passed.

**Services/routes:** `planningTemplates.ts` (create/list/get/update[replace-all entries in $transaction]/delete/apply). `/api/families/:familyId/templates` full CRUD + `/apply`, JWT + membership gated, DELETE PARENT-gated. `applyTemplate`: non-Monday targetWeekStart→400, empty template→422, cross-family→404, `existingMode` = error|skip|replace (default error).

**Approval workflow:** `applyTemplate` materializes `MealSuggestion` rows `{dayPlanId, mealId, userId, approved: false}` — ALWAYS UNAPPROVED, same path as scheduleMeal/repeatWeek. Parent approves via existing `approve_suggestion`. Satisfies acceptance criterion.

**Parity (rows 4/7/8 — list + apply only):**
- Row 4 (agent route): `GET …/templates` (scope `meal_plan:read`), `POST …/templates/:id/apply` (scope `meal_plan:schedule`).
- Row 7 (MCP apiClient): `listTemplates(familyId)`, `applyTemplate(familyId, templateId, targetWeekStart, existingMode?)`.
- Row 8 (MCP tools): `list_templates`, `apply_template` (14 tools total).
- NO new scope (reused `meal_plan:read` + `meal_plan:schedule`).
- Deliberate asymmetry: authoring (create/edit/delete) stays browser-JWT-only; agents apply/list, parents author. Justified: parity.instructions.md §5 hard-parity is RECIPE-scoped (#97–#112); #116 is outside that range.

**CSV:** N/A — templates are a distinct resource, not a persisted `Meal` scalar; data-model→CSV rule does not apply.

**Tests:** service (create P2002→409, update replace-all, delete count→404, apply UNAPPROVED assertion + non-Monday 400 + empty 422 + existingMode error/skip/replace); REST CRUD + DELETE parent-gate + membership; agent parity (scope enforcement, cross-family isolation → 404, UNAPPROVED assertion); MCP 14-tool count + registration order + apiClient encodeURIComponent. All via prismaMock.

**Verification note:** local devcontainer gate could not run green (recurring DNS outage; offline node_modules reuse failed — pnpm hardlinks into global CAS outside copy set). Deferred to CI (Postgres 16) as authoritative per sprint policy — no fabricated green. Migration additive-ness confirmed by static inspection. **CI confirmed SUCCESS.**

### 2026-07-03: Ingredient normalization for grocery generation (#120)

**By:** Livingston (Backend) — requested by brandonmartinez
**Sprint:** 3, Wave 3
**PR:** brandonmartinez/meal-planner#144 (`feat(#120): ingredient normalization for grocery generation`)
**Branch:** `brandonmartinez-livingston-ingredient-normalization` (off main `64bb640`)
**Commit:** `1fae89df6f2c011216f7c95cd5dedc4879bf6c87`

---

**What:** Added conservative in-memory ingredient-name/unit normalization to grocery
generation so variants group predictably. New `packages/api/src/services/ingredientNormalize.ts`
(pure helpers) wired into `grocery.ts` (`groceryKey`, `mergeQuantities`, computed-item display).
New `ingredientNormalize.test.ts` + extended `grocery.test.ts`.

**Decision 1 — COMPUTED, not persisted (KEY):** Canonical names/units are computed
in-memory at generation time. **No Prisma model/column/migration added.** Rationale:
normalization only affects the merge/grouping step; `GroceryItem.name`/`unit` already
store the display value and matching recomputes the key from stored fields, so persisting
a canonical column buys nothing for correctness. The issue explicitly asked to decide
persisted-vs-computed — for this wave the answer is **computed**. (Saul #116 owns the only
migration this wave; no competing migration authored.) If a future need for cross-request
canonical lookups arises (e.g. user-editable alias dictionary), revisit persistence then.

**Decision 2 — Conservative scope:** Names: trim → collapse whitespace → lowercase (key only)
→ strip trailing `. , ;`; display preserves first-seen casing. **No stemming/singularization**
(`tomatoes` ≠ `tomato`) — too error-prone for a first pass, explicitly out of scope. Units:
alias→canonical (tbsp/tablespoon, g/gram, can/cans, etc.), trailing `.` tolerated, unknown
units pass through trimmed. **No unit conversion** (3 tsp ≠ 1 tbsp) — the "quantity math gets
complex" rabbit hole the issue warned about; out of scope.

**Decision 3 — Source tracking preserved exactly:** `sources` / `sourceMealIds` accumulation
and the reconciliation/refresh branch are untouched. Normalization only merges *more* variants,
so contributing meals still aggregate correctly (`tbsp`@MealA + `tablespoon`@MealB → sources=[A,B]).

**Decision 4 — Non-numeric quantities handled gracefully:** New `parseQuantity` supports
ints/decimals/`1/2`/`1 1/2` (denominator-0 guarded; fixes the prior `parseFloat("1/2")===1`
bug). Both-numeric → summed and rounded; otherwise pass-through (`"a, b"`) — never crash,
never silently drop; identical non-numeric strings collapse to one.

**Decision 5 — Parity §2a exclusion (justified):** No new user-facing REST/MCP endpoint,
param, or scope; `generateGroceryList` signature and `GroceryItem` shape unchanged. Purely
internal grocery-merge behavior → parity rows N/A, per `.github/instructions/parity.instructions.md` §2a.

**Verification caveat — devcontainer unavailable this session:** Docker/`meal-planner_devcontainer-app-1`
was not present (daemon/CLI absent). Did NOT run the gate on the host and did NOT fabricate green.
Performed rigorous manual parse/reference review of all four files against actual merge output shapes.
**CI (Postgres 16) is the authoritative gate for PR #144** — recursive lint + api tests. No self-merge.

**Lane:** Only touched `grocery.ts` + new `ingredientNormalize.ts` + colocated tests. Did NOT
touch schema, CSV, web, MCP `tools.ts`, or route indexes → zero conflict with Saul #116.

### 2026-07-03T01:19:55-0400: Collections UI (#110) — Linus (Frontend)
**By:** brandonmartinez (via Linus)
**PR:** https://github.com/brandonmartinez/meal-planner/pull/145 (base main, non-draft, `feat(#110): collections UI`)
**Branch/SHA:** brandonmartinez-collections-ui @ 7ae0ec9 (base main 64bb640)

**What shipped (web-only lane, consumes #109 backend as-is):**
- New `api/collections.ts` CRUD client (`request<T>()`, unwraps `{collections}` envelope).
- New pages: `CollectionsPage` (`/collections`, parent-gated CRUD) + `CollectionDetailPage` (`/collections/:collectionId`, member meals). New `CollectionFormModal`.
- Filter integration: dropdown `<select>` "Collection" on `MealsPage` + `MealPicker`, driven by the #109 list-meals `collections` query param (mirrors tags mechanics), wired into hasActiveFilters/clearFilters.
- `MealDetailPage` "In collections" linked section; `MealFormPage` collections assignment field (TokenField by name); routes in `App.tsx`; nav link in `Navigation.tsx`.
- `meals.ts` gained `collections?: string[]` on create/update payloads + repeated `collections` list param.

**Key decision — DISTINCT-from-tags UX (issue risk note):** Collections deliberately do NOT reuse the tag/category colored `rounded-full` pill rows. They use a labeled **dropdown filter** + **dedicated shelf/detail pages** (list rows with description blurbs, 📚 book motif) + book-motif linked rows on meal detail — a first-class browsable entity, not another taxonomy chip cloud.

**Assignment UX decision (resolved via ask_user):** Collections are assigned to a meal via the **meal edit form** (TokenField), not a separate "add to collection" affordance on the collection page.

**Empty/loading/error coverage (acceptance):** CollectionsPage (loading / "No collections yet" / error); CollectionDetailPage (loading / empty "No meals in this collection yet" / 404 "Collection not found" / error). Default MSW handler `GET /api/families/:id/collections → {collections:[]}` added.

**Verification (devcontainer, against committed SHA):**
- ✅ `pnpm --filter @meal-planner/web run test` — 47 files / 415 tests passed.
- ✅ `pnpm --filter @meal-planner/web run lint` — 0 errors.
- **Honest method note:** recurring devcontainer DNS outage blocked fresh `pnpm install` (EAI_AGAIN). Branch touches only `packages/web` with NO `package.json`/`pnpm-lock.yaml` change, so verify ran by symlinking the dependency-identical already-installed `node_modules` from `/workspace` (base main 64bb640) into a detached verify worktree; `/workspace` confirmed pristine (HEAD unchanged) afterward. CI is authoritative.

**Scope guardrails honored:** No edits to api/services, api/routes, schema/migrations, csv, or MCP. Backend #109 consumed as-is. No self-merge.

## 2026-07-03T03:07:00-0400: Sprint 3 Wave 4

### 2026-07-03T02:53:41-0400 — Family-configurable grocery categories (#119, Wave 4 migration keystone)

**By:** Saul (Data/Migrations) — autonomous run, requested by brandonmartinez (away)

**What:**
Shipped issue #119 in PR #148 (branch `brandonmartinez-saul-grocery-categories`, SHA `fe5fbb7`). Families can now define custom grocery aisle categories beyond the shared `INGREDIENT_CATEGORIES` defaults, validated across REST + MCP + web.

1. **Model + onDelete choice.** New `GroceryCategory` Prisma model (`id`, `name`, `nameNormalized`, `familyId`, timestamps), mirroring the existing family-scoped taxonomy (Tag/RecipeCollection/Category). `familyId → Family` uses **`onDelete: Restrict`** to match the sibling taxonomy relations — a family with categories cannot be silently cascade-deleted. `@@unique([familyId, nameNormalized])` enforces case-insensitive per-family uniqueness; `@@index([familyId])` for list queries. Migration `20260703023913_add_grocery_categories` is **purely additive** (CREATE TABLE + FK RESTRICT + unique + index), zero backfill, timestamp strictly after `20260703012000_add_planning_templates` (latest on main). Authored OFFLINE via `prisma migrate diff --from-schema-datamodel <main> --to-schema-datamodel <worktree> --script` — **never** `prisma migrate dev` (shared dev-DB advisory lock wedged this sprint). Does not touch `Meal_name_trgm_idx`.

2. **enum → dynamic contract change.** The ingredient `category` was a closed `z.enum(INGREDIENT_CATEGORIES)` in `agent.ts` and MCP `tools.ts`. Relaxed to an open **`z.string().min(1)`** (runtime-validated non-empty string). Design **Option A — registry as advisory pick-list**: the `GroceryCategory` table is a *suggestion source* for UI selects; the stored ingredient/grocery `category` stays raw `String?` — **not** FK-resolved, **not** auto-created on meal save. Effective list surfaced to clients = `INGREDIENT_CATEGORIES ∪ custom rows` (defaults first canonical, custom appended, deduped case-insensitively via `normalizeName`). This keeps meals decoupled from category-row lifecycle (renaming/deleting a category row never orphans a meal's stored string).

3. **Backward-compat handling.** enum→string only *relaxes* — every legacy hard-coded category string keeps validating; nothing tightened to reject prior values. Existing rows need no migration because `category` was already a free string column. Web selects fail-soft: `useGroceryCategories` falls back to `[...INGREDIENT_CATEGORIES]` if the fetch fails, so the forms never break.

4. **Parity (rows 4/7/8).** Honored per `.github/instructions/parity.instructions.md`: (row 4) `agent.ts` GET `/:familyId/grocery-categories` READ route with audit log; (row 7) MCP `apiClient.listGroceryCategories`; (row 8) `tools.ts` `list_grocery_categories` tool + `registerTool` + `TOOL_SCOPES` entry (`meal_plan:read`). Reused the existing `meal_plan:read` scope — no new scope invented. Category *writes* go through the authenticated REST/agent routes (JWT + membership); the MCP surface is read-only for categories this iteration, consistent with the read-oriented MCP contract.

5. **CSV impact (#72 lockstep rule).** **Effectively N/A — documented explicitly per guardrail.** Grocery/ingredient `category` already round-trips through CSV import/export as a plain string in both directions. The enum→string change *relaxes* validation, so no import that previously succeeded can now fail, and custom category strings export/import identically to legacy ones. No parser, Zod schema, `importMeals`, `mealsToCSV`, or `exportMeals` change was required. The new `GroceryCategory` registry is a separate resource (its own REST routes) and is not part of the meal CSV shape.

**Why:**
- **Restrict over Cascade/SetNull**: matches established family-scoped taxonomy precedent; prevents accidental data loss and keeps the deletion contract predictable. A family delete already restricts on sibling taxonomy, so categories join that guard consistently.
- **Option A (raw string, advisory registry) over FK resolution**: purely additive migration with zero backfill and zero risk to existing meal data; avoids a destructive/complex data migration during a sprint where the shared dev DB is locked; preserves the decoupling that makes rename/delete safe (acceptance criterion: "existing category strings keep working").
- **Reuse `meal_plan:read`**: parity requires an MCP surface but the feature is a read-oriented pick-list; inventing a new scope would violate the "reuse existing scopes where possible" guardrail.

**Verification:** Devcontainer against `fe5fbb7`, reusing `/workspace` node_modules (branch has zero lockfile changes; DNS outage blocked fresh install): shared/mcp/api builds ✅, db:generate ✅, api lint ✅ (0 errors), api test ✅ 845, mcp test ✅ 105. CI (Postgres 16) authoritative — running at PR open.

**Cross-lane touches:** `tools.ts` + route-index parallel appends are additive (kept-both resolves at squash-merge). No conflicts expected with concurrent Wave-4 lanes.

### 2026-07-03: Category/Collection Week Filling (#115)
**By:** Livingston (Backend) — autonomous run, requested by brandonmartinez
**Date:** 2026-07-03
**PR:** #149 (`feat(#115): category/collection week filling`)
**Wave:** 4 — NO SCHEMA lane

#### Context
Issue #115 asked for a bulk-planning helper that fills open days of a target week from
selected categories/collections, avoiding recently-cooked meals, creating UNAPPROVED
suggestions, exposed on REST + MCP. Depends on #107 (categories), #109 (collections),
#113 (random selection) — all merged on main.

#### Decisions

#### 1. Selection algorithm + determinism hook
- `fillWeek()` (packages/api/src/services/weekFill.ts) reuses #113's `buildCandidateWhere`
  + `filterAvoidRecent`, now **exported** from `randomPlan.ts` (no logic reinvented).
- Added a `collections?` filter to `RandomSelectFilters` so week-fill can scope by collection
  membership alongside category/tags/difficulty/favorite.
- **Determinism:** selection takes an injectable `rng: () => number` param (default `Math.random`).
  Pick is **without replacement** via array splice, so no meal repeats within one fill.
  Tests pin outcomes deterministically using single-candidate pools (splice is forced) or a
  seeded rng — satisfying the "seedable/stable under test" risk called out in the brief.

#### 2. existingMode semantics (non-destructive default)
Mirrors `applyTemplate`'s `existingMode`:
- `error` (**default**) → if the week already has ANY suggestion, throw → **409**. Non-destructive.
- `skip` → fill only currently-empty days; occupied days left untouched.
- `replace` → `deleteMany` existing suggestions then `createMany`, inside a `$transaction`.
Existing suggestions are therefore NEVER overwritten unless `replace` is explicitly passed.

#### 3. Unapproved-only
Every created `MealSuggestion` row is `approved:false`, exactly like scheduleMeal / repeatWeek /
applyTemplate. A PARENT approves separately via the existing `approve_suggestion` surface.
No auto-approval path exists.

#### 4. Insufficient-eligible-meals handling
- Empty candidate pool after filtering → **422** (`SuggestionError`).
- `!allowPartial && candidateIds.length < daysToFill` → **422**.
- `allowPartial` (default `true`) lets a caller accept a partial fill when the pool is smaller
  than the open-day count. Service tests cover the insufficient case (acceptance requirement).

#### 5. Parity rows + reused scopes
Per parity.instructions.md rows 4/7/8:
- Row 4 — agent REST route `POST /agent/families/:familyId/weeks/:weekStart/fill`
  guarded by `requireScope(meal_plan:schedule)`; browser route `POST .../weeks/:weekStart/fill`
  under normal JWT + membership. Symmetry matches applyTemplate.
- Row 7 — MCP `apiClient.fillWeek`.
- Row 8 — MCP `fill_week` tool + `TOOL_SCOPES.fill_week = "meal_plan:schedule"`.
- **Reused existing scopes** `meal_plan:schedule` (write) / `meal_plan:read` — no new scopes invented.

#### 6. NO-SCHEMA compliance
Zero edits to `schema.prisma`; no migration authored. Saul #119 owns the only Wave 4 migration.
All new capability rides on existing tables (Meal, MealSuggestion, DayPlan, WeekPlan, Collection).

#### Verification (honest)
Devcontainer gates at committed HEAD `9e94726` (detached worktree, prismaMock, no live DB):
- shared build ✅ · api db:generate ✅ · api build ✅
- api lint ✅ 0 errors (7 pre-existing warnings) · api test ✅ **837 passed**
- mcp test ✅ 104 passed (at parent `fba2dba`; MCP files unchanged since)
CI is authoritative.

#### Cross-lane file touches (append-only / localized)
`mcp/src/tools.ts`, `mcp/src/apiClient.ts`, `mcp/src/tools.test.ts`, `api/src/routes/agent.ts`,
`api/src/routes/weekPlan.ts`, `shared/src/types/dto.ts`, `api/src/services/randomPlan.ts`.
Saul #119 overlaps MCP schemas/routes — kept edits localized/append-only to minimize squash conflict.

### 2026-07-03T02:46:56-0400: Planning templates UI (#117)

**By:** Linus (Frontend) — autonomous run, requested by brandonmartinez (away)
**PR:** #147 — `feat(#117): planning templates UI` (base main, non-draft)
**Lane:** WEB-ONLY. Zero edits to packages/api, csv, or MCP. Consumed the merged #116 backend as-is.

#### Page vs. modal
- **Management = full page** at `/templates` (`TemplatesPage`), mirroring the #110 CollectionsPage shelf pattern. Templates are a first-class planning entity that users curate over time, so they earn a durable route + nav link rather than a transient modal.
- **Create/edit = modal** (`TemplateFormModal`) launched from the page — matches the Collections create/edit ergonomics and keeps the 7-day entry editor focused.
- **Apply = modal** (`ApplyTemplateModal`) launched from `WeekPlanPage`, because apply is an action taken in the context of a specific week, not a management task.

#### Apply-confirmation UX + existingMode mapping (the load-bearing decision)
Non-destructive by default. The UI never sends a destructive `replace` without explicit user confirmation.
- **Initial apply** → `existingMode: 'error'`. If the target week already has suggestions the backend returns **409**; the modal catches `ApiError.status === 409` and transitions from the `select` phase to a `confirm` phase.
- **Confirm phase** offers two explicit choices:
  - "Skip filled days" → `existingMode: 'skip'` (fills only empty days).
  - "Replace week" → `existingMode: 'replace'` (deletes all target suggestions first). Styled as the destructive option; not the default focus.
- Empty week (no 409) applies immediately with `error` mode and closes.
- Applied rows are **unapproved** (`approved:false`) — a parent approves separately; the modal messaging says "added for approval," not "scheduled."

#### Motif
- 🗓️ **calendar** motif for templates, chosen to be visually distinct from the 📚 collections shelf (#110) and the tag/category **pill clouds**, while reusing the shelf's card/grid layout for consistency. Indigo accent on the WeekPlanPage apply button to separate it from the primary meal-add affordance.

#### Empty / loading / error coverage
- **Loading:** `LoadingSpinner` on the templates list and on meal-load inside the form modal.
- **Empty:** `EmptyState` on TemplatesPage when no templates exist; entries grid shows a hint when a day has no meals.
- **Error:** `ErrorMessage` on list-load failure. Meal-load failure inside the form is **non-blocking** (form still usable). Apply errors other than 409 surface inline in the modal.
- **Parent gating:** delete controls and the apply button are gated on `isParent` (DELETE is PARENT-gated server-side / 403).

#### Verification (honest)
- Web gates run at committed SHA `f8f92be` in the devcontainer via a detached verify worktree.
- `pnpm --filter @meal-planner/web run test` → **454 passed (51 files)** (39 new cases).
- `pnpm --filter @meal-planner/web run lint` → **clean (exit 0)**.
- ⚠️ DNS outage blocked a fresh `pnpm install`; per the web-only guardrail (no package.json/lockfile changes) the verify worktree reused the dependency-identical `/workspace` node_modules via symlinks. `/workspace` HEAD confirmed pristine. **CI is authoritative.**

#### Cross-lane concerns
- None. Strictly web-only; backend contract consumed unchanged.
## 2026-07-03: UI Wave decisions merged from inbox

### 2026-07-03: Collections gain a collection-side "set meals" membership endpoint
**By:** Squad (Coordinator), on behalf of brandonmartinez
**What:** Collection membership will be settable from the collection side (not only from the meal side via meal.collections). Adding a collection-side capability to replace-set a collection's meals, exposed with full RECIPE-scope parity: REST + MCP + agent route. Additive only — the MealRecipeCollection join already exists, so NO schema/migration. Chosen over a frontend-only meal-by-meal workaround.
**Why:** The Collections editor modal needs to add/remove meals directly (UI consistency with the templates modal). Membership was previously meal-driven only, which forced N racy per-meal writes from the UI. A proper endpoint is atomic and correct. Collections (#109/#110) are in the hard-parity range (parity.instructions.md §5), so REST/MCP/agent parity is required.
**Follow-on:** Frontend collections redesign (row-click → edit modal, delete-in-modal, meal picker) consumes this endpoint + reuses the new MealFormPage dropdown control; dispatched after both land.

### 2026-07-03: Suppress password-manager autofill on name/title inputs
**By:** Linus (Frontend) — requested by brandonmartinez
**What:** Added four documented password-manager opt-out attributes to every free-text "name"/"title" text `<input>` on create/edit forms in `packages/web/src`: `autoComplete="off"`, `data-1p-ignore` (1Password's official documented opt-out), `data-lpignore="true"` (LastPass), `data-form-type="other"` (Dashlane).
**Why:** 1Password (and other browser password managers) pop their autofill dropdown over inputs named/labeled "name" — the New Template "Name *" field, Meal name, Create Family, etc. Screenshot confirmed a 1Password contacts dropdown over the New Template name input. Belt-and-suspenders across the four major managers; 1Password is the one Brandon hit.
**Scope:** inputs touched (7 inputs across 5 files): TemplateFormModal.tsx (template Name input), pages/MealFormPage.tsx (meal Name input + per-row ingredient name input), pages/CreateFamilyPage.tsx (family name input), pages/FamilySettingsPage.tsx (API key name input + agent credential name input), pages/GroceryListPage.tsx ("New item name" input). Excluded (owned by parallel Collections redesign session — would conflict): CollectionFormModal.tsx, CollectionsPage.tsx (1Password attribute folded into Collections rewrite separately).

### 2026-07-03: Collections list+modal redesign
**By:** Linus
**What:** Redesigned the web Collections list + form modal (`packages/web` only). (1) Clicking a parent collection row now opens the SAME editor modal in edit mode instead of navigating; the `/collections/:id` CollectionDetailPage route is kept intact (member/child rows still link to it). (2) Removed the per-row Edit and Delete buttons from the list view. (3) "New collection" opens the modal in create mode; row-open opens it prepopulated in edit mode — one component, two modes. (4) Moved Delete into the modal footer far-left, opposite Save/Cancel, with a CSP-safe in-modal inline confirmation (`role="alertdialog"`, "Delete this collection? Meals are not deleted.") — no `window.confirm`. (5) Added meal-membership editing (create + edit) via the existing `Combobox` picker; on save the selected meal ids are sent through the new `mealIds` field (replace-set semantics, PR #152) on POST/PATCH `/api/collections`. Catalog + current membership are loaded by paging list-meals at `limit=100`. Data-loss guard: if the edit-mode membership read fails, `mealIds` is omitted from the PATCH so an unreadable set is never overwritten with a partial one.
**Why:** The old list had inconsistent interaction — a row click navigated to a detail page while a separate Edit button opened a modal, and Delete used a native confirm. Standardizing on a single modal for both create and edit (row-click = edit) removes the redundant controls, keeps all mutation in one CSP-safe surface, and lets membership be edited inline instead of only on a separate page. Paging list-meals at `limit=100` matches the existing TemplateFormModal / MealFormPage pattern and respects the endpoint's hard 100 cap (higher limits 400).

### 2026-07-03: DayCard photo stamp — address-label layout correction (PR #160)
**By:** Linus (Frontend)
**What:** Fixed the meal chip photo stamp layout regression introduced in PR #157. Changed the stamp markup from a bare `<img className="shrink-0 self-stretch aspect-square object-cover block">` to a `<div className="self-stretch aspect-square shrink-0 relative overflow-hidden">` wrapper with the image absolutely positioned inside it (`<img className="absolute inset-0 h-full w-full object-cover block">`).
**Why:** `aspect-ratio` on a flex item with `align-self: stretch` resolves its constrained axis (width) from the element's intrinsic dimensions when no explicit height is anchored on the element itself. The bare `<img>` had no height anchor so `aspect-square` multiplied the image's large intrinsic width rather than the row's content-driven height, producing a full-width stamp instead of a square. Moving `aspect-square` to a wrapper `<div>` that IS height-anchored by flex-stretch gives the container a definite height (content row height), and `aspect-square` then constrains width = height — producing the intended address-label: a true square locked to the chip's left edge, top, and bottom, with content padded to the right.

### 2026-07-03: Template modal loads full meal catalog via pagination (limit>100 400 fix)
**By:** Linus (Frontend) — requested by brandonmartinez
**What:** Opening the "New template" modal showed "Could not load meals — you can still edit the name and blurb." even when the family had meals. Root cause: `TemplateFormModal.tsx` requested `listMeals(familyId, { limit: 500, ... })`. The list-meals endpoint caps `limit` at 100. Rewrote `loadMeals` to page through the endpoint respecting the backend cap — `limit: 100`, `offset` advancing by 100 each iteration, accumulating `res.items` until `res.hasMore` is false. Infinite-loop guards: stop on a 0-item page; hard-cap `MAX_PAGES = 50` (≤5000 meals).
**Why:** The bare `catch {}` swallowed the 400 error and rendered the generic banner with an empty meal list. Kept `sort: 'name', order: 'asc'`. Replaced the bare `catch {}` with `catch (err)` that `console.error`s and still shows the friendly banner (graceful degradation preserved). The backend 100 cap is consumed AS-IS — not raised.

### 2026-07-03: Edit-meal form polish — Combobox + dropzone design decisions
**By:** Linus (Frontend)
**What:** Shipped three UI improvements to the Edit/New Meal form. (1) New Combobox component, not a patched TokenField — datalist popover is rendered by the browser outside React's control and cannot be reliably positioned above sibling fields; a React-controlled popover (absolute + z-50) is the only correct fix. TokenField is left in place (still used by Tags and Categories); the swap is limited to Collections only. (2) Dropdown only opens when draft text is non-empty — avoids a visually noisy full-list dropdown on every field focus and matches typical combobox UX. (3) `doUpload()` extracted as a shared helper in MealImageField so both file input's `onChange` and drop handler call the same code path. The 5 MB client-side pre-check runs at the top. (4) Moved Favorite (checkbox) and Rating (now a star picker via new `StarRating.tsx` component) up next to Difficulty in a single flex-wrap row. (5) TokenField: pills moved from above input row to below it (disorienting layout jump); `addTokens()` splits the raw draft on commas only (not spaces) so "test1 test2, test3" creates two tokens. (6) Ingredient category select height alignment: added `h-[1.875rem]` to match sibling inputs.
**Why:** User request for cohesive grouping of meal metadata controls near the top of the form. Spinner for 1–5 rating was poor UX; star picker is standard marketplace/recipe-app pattern. The jump in control layout when the first pill appeared was disorienting. Comma-split is a standard multi-value input shortcut that reduces friction when pasting lists of tags; splits on commas only — not spaces — to preserve multi-word token values (e.g. "Easy Weekday Meals").

### 2026-07-03: Repeat-week UI converted from inline panel to modal
**By:** Linus (Frontend) — requested by brandonmartinez
**What:** On the Week Plan page, the "Repeat a previous week" affordance was converted from an inline expanding panel into a modal, mirroring the existing "Apply a template" → `ApplyTemplateModal` pattern. A new `RepeatWeekModal.tsx` (reusing the shared `Modal` primitive) now holds the source-week date input, the existing-meals mode `<select>` (stop/skip/replace, default `error`), and the "Copy meals" submit. `WeekPlanPage.tsx` lost the inline panel and the state that only drove inline expansion.
**Why:** Brandon's UI-consistency request: *"For UI consistency, instead of shifting the UI downward, make this a modal."* The inline panel shifted the Monday/Tuesday/… day columns downward when expanded, which was jarring. The three action buttons (Grocery List, Repeat a previous week, Apply a template) now stay in place and no longer cause a layout shift. Network contract unchanged: same `repeatWeek(familyId, targetWeekStart, sourceWeekStart, existingMode)` → `POST /api/families/:familyId/weeks/:weekStart/repeat`. Backend repeat-week endpoint consumed as-is.

### 2026-07-03: Unapprove toggle + photo stamp (PR #157)
**By:** Linus (Frontend / authorized full-stack)
**What:** Unapprove operation ships with REST + agent route + MCP tool in lockstep. Parity is REQUIRED for `unapprove_suggestion` (its counterpart `approve_suggestion` already has full 3-surface coverage under `meal_plan:approve` scope). No new scope required. Un-approve glyph is ↺ (U+21BA ANTICLOCKWISE OPEN CIRCLE ARROW) with amber hover to signal caution/revert intent. Service clears `approved:false` and all three approver fields to null (no "who cleared it" semantics needed). Photo stamp uses raw `<img>` with `shrink-0 self-stretch aspect-square object-cover block`; outer chip div gets `overflow-hidden` to clip stamp corners to border-radius.
**Why:** Creating unapprove REST-only while its counterpart lives on all three surfaces would introduce undocumented asymmetry. Photo stamp needs `self-stretch` as a direct flex child to fill the chip height edge-to-edge; `MealThumbnail` wraps `<img>` in a `<div>`, preventing `self-stretch` from working correctly on the actual image element.

### 2026-07-03: Week Plan meal-detail modal
**By:** Linus (Frontend) — requested by brandonmartinez
**What:** Clicking a meal card's body on the Week Plan view now opens a read-only meal-detail modal (`MealDetailModal.tsx`) with a "View cooking mode" link to `/meals/{mealId}/cook`. Works for any suggestion regardless of approved/scheduled state. Body-as-button, guarded only when `!isPlaceholder && !!suggestion.meal && !!familyId`. Placeholder suggestions (Free Day / Leftovers / Takeout) have no real recipe → never interactive. Approve/remove controls wrapped with `stopPropagation` so they never bubble up to open the modal. Drag intact: dnd-kit PointerSensor `activationConstraint.distance: 6` — a genuine click opens the modal, a drag (>6px) suppresses the click.
**Why:** Users had no way to inspect a meal's details from the Week Plan — the only affordance was drag/approve/remove. This surfaces the recipe (name, image, difficulty, favorite/rating, tags, collections, description, timing, source, ingredients) and a fast path into cooking mode without leaving the plan. Modal fetches via the same `getMeal(familyId, mealId)` client method `MealDetailPage` uses (request<T>() pattern), rather than duplicating fetch logic.

### 2026-07-03: WeekPlan toolbar layout + responsive behavior
**By:** Linus (Frontend) — requested by brandonmartinez
**What:** Merged the two-row header (title row + action row) into one `<div className="flex flex-wrap items-center gap-3 mb-6">`. On desktop (`sm+`) this stays one row via natural flex; on mobile it wraps into two rows. A `hidden sm:block flex-1` spacer between Grocery List and the parent-action group pushes Repeat/Apply to the far right on desktop without affecting the mobile stack. Past-week gate via ISO string comparison: `const isPastWeek = weekStart < getCurrentWeekStart()` — both are YYYY-MM-DD Monday strings, so lexical comparison is exact. All three action buttons (Grocery List, Repeat, Apply Template) are hidden when `isPastWeek` is true; only the title cluster renders. Past-week test sets `localStorage.setItem('meal-planner-selected-week', '2020-01-06')` before render.
**Why:** Brandon's UI-consistency request to avoid jarring layout shifts. Past-week detection uses ISO string comparison for exactness (no date parsing needed). localStorage key for test isolation ensures no mock of `useWeek` needed; `beforeEach` calls `localStorage.clear()` to reset to current week for all other tests.

### 2026-07-03: Collection-side meal membership endpoint (PR #152)
**By:** Livingston (Backend) — requested by brandonmartinez
**What:** Added `mealIds?: string[]` to both `createCollection` and `updateCollection` across all surfaces (REST, agent, MCP). When provided, membership is **replace-set** (delete all existing, insert new). When omitted, membership is left untouched. Consistent with how the meal side handles `collections?: string[]` in `syncMealCollections`. Service: `setCollectionMeals(familyId: string, collectionId: string, mealIds: string[]): Promise<void>` — 404 if collection not found in family, 422 if any mealId is cross-family, empty array `[]` clears all membership, uses `$transaction(deleteMany + createMany(skipDuplicates))`. Shared DTOs: `CreateCollectionRequestDTO { name: string; description?: string; mealIds?: string[] }`, `UpdateCollectionRequestDTO { name?: string; description?: string; mealIds?: string[] }`. REST: `POST /api/collections` and `PATCH /api/collections/:collectionId`, auth member-level (unchanged). Agent route: `POST /api/agent/collections` and `PATCH /api/agent/collections/:collectionId`, scope `AGENT_SCOPES.WRITE`. MCP: `create_collection` and `update_collection`, scope `meal:write`. NO schema changes, NO migration (MealRecipeCollection join already present).
**Why:** Collection membership was previously meal-driven only, which forced N racy per-meal writes from the UI. A proper endpoint is atomic and correct. CSV not affected (collection membership is in `MealRecipeCollection` join, not a scalar field on `Meal`; per parity.instructions.md §1b: "Child relations are out of CSV scope").

### 2026-07-03: Remove meal taxonomy categories (#107), fold into tags
**By:** Livingston (Backend) — requested by brandonmartinez
**What:** Removed the meal **taxonomy category** feature (#107) entirely across the stack in one atomic, buildable PR against `main`. Existing data is preserved: each meal's category names are folded into its tags by a raw-SQL data migration that runs BEFORE the DROP TABLEs. Migration: (1) Insert a `Tag` for every `Category` missing one (same `familyId`+`nameNormalized`), via `gen_random_uuid()::text` with `WHERE NOT EXISTS` dedup. (2) Insert a `MealTag` `(mealId, tagId)` for every `MealCategory` (JOIN on `familyId`+`nameNormalized`), `ON CONFLICT ("mealId","tagId") DO NOTHING`. (3) `DROP TABLE "MealCategory"`, then `DROP TABLE "Category"`. Parity: meal-category create/update/list-filter/random/fill and the category-taxonomy CRUD were removed in lockstep across REST (routes/meals.ts, routes/weekPlan.ts), the agent route (routes/agent.ts), MCP (apiClient.ts + tools.ts, Zod raw shape), and web — keeping REST/MCP/agent in parity. Export CSV drops the `categories` column; import folds a legacy `categories` column into tags for backward-compat. **KEEP boundary:** ❌ REMOVED — meal taxonomy: `Category` model, `MealCategory` join, `Meal.categories` + `Family.categories` relations. ✅ KEPT (untouched) — grocery aisle categories: `GroceryCategory` (#119), `MealIngredient.category`, `GroceryItem.category`, `INGREDIENT_CATEGORIES`, `list_grocery_categories`, the grocery-categories route/hooks.
**Why:** Brandon decided meal taxonomy categories overlap too much with tags and add no value. `Category ≅ Tag` and `MealCategory ≅ MealTag` are structurally identical, so the fold is a straight per-family copy with no data loss.


### 2026-07-03: Fix DayCard stamp zero-width regression (aspect-square-from-stretch)

**By:** Linus

**What:** (Round 1) Replaced `<div aspect-square/overflow-hidden><img absolute inset-0/>` with `<img shrink-0 self-stretch w-16 sm:w-20 object-cover block/>`. (Round 2 refinement) Changed to `<img shrink-0 size-16 sm:size-20 object-cover block/>` — true square stamp, square drives chip height.

**Why:** `aspect-square` (i.e. `aspect-ratio: 1/1`) needs a DEFINITE height to resolve a width. CSS spec: `align-self: stretch` on a flex item produces an INDEFINITE height during intrinsic sizing — the flex algorithm defers resolution to parent layout which hasn't completed yet. Because the height is indefinite, `aspect-ratio` cannot compute a width, the wrapper collapses to 0px wide, and the `absolute inset-0` img has zero box to fill → invisible. jsdom has no layout engine so the #160 tests passed despite the broken render.

Round-1 used `self-stretch w-16/sm:w-20`: definite width (non-zero), but height tracks content (~52px) → landscape rectangle, not a square. Round-2 uses `size-16/sm:size-20` (Tailwind shorthand for both `w-*` and `h-*`): both dims are DEFINITE fixed-px values (64px/80px). Width no longer depends on any parent dimension. The square (64px) is taller than the ~52px content column, so the flex row stretches content to match the square → chip is 64px tall → square is flush top+bottom+left (address-label look). `object-cover` prevents distortion; `shrink-0` prevents flex squash. No wrapper div, no absolute positioning.

Tests assert `size-16`, `object-cover`, NOT `absolute`. `self-stretch` assertion removed (no longer needed — height is intrinsic to the square).

### 2026-07-04: Capture a GitHub issue for all substantial work

**By:** Squad (Coordinator)
**What:** Any substantial change — more than a few lines of code, or touching multiple files — MUST have a GitHub issue opened BEFORE work starts. Trivial one-liners (typo, single-value tweak) are exempt. The coordinator opens the issue up front, applies labels (`type:*` + owning `squad:{name}`), and threads the issue number through the spawn prompt → branch (`squad/{issue}-{slug}`) → commits → PR body (`Closes #N`). Enforced in `.github/skills/agent-collaboration/SKILL.md` (Issue Capture pattern) so every agent spawn sees it.
**Why:** Brandon: "make sure the squad knows to create issues for substantial work (essentially anything more than a few lines of code being changed or if there are multiple files)." Several ad hoc UI PRs this session (#153, #154, #155, #157, #158, #159, #160, #161) shipped without a tracking issue, breaking traceability. Retroactive issues were opened + closed for those; going forward the issue precedes the work.

### 2026-07-04: Commit squad decision records as part of the process

**By:** Squad (Coordinator)
**What:** Squad decision records are now COMMITTED to git as a standard part of the process, not left uncommitted for manual review. Scribe's reconciliation cycle ends with a git commit of `.squad/decisions.md` (+ processed inbox, orchestration/session logs, agent histories). Decision records follow the standard format (`### {date}: {title}` / **By** / **What** / **Why**) and live in `.squad/decisions/inbox/{author}-{slug}.md` until Scribe merges + commits them.
**Why:** Brandon: "also standardize the squad decision records as part of the process and to commit." Reverses the prior "leave .squad/ writes local/uncommitted" convention so decision history is versioned and shared with the team.

### 2026-07-04: Standardized Select control + page-width foundations (#169)

**By:** Linus
**What:** Created shared `packages/web/src/components/Select.tsx` (+ test). Replaced 12 native `<select>` elements across 7 files. Normalized 9 main pages to `max-w-7xl` (WeekPlanPage baseline); auth pages intentionally kept `max-w-md`. Base classes: `border-gray-300 dark:border-gray-600`, `rounded`, `focus:ring-2 focus:ring-blue-500`; sizes `sm` (px-2 py-1 text-sm) / `md` (px-3 py-2).
**Why:** Brandon flagged inconsistent select styling (heights/appearance) and inconsistent page widths across main pages. A shared Select component + normalized page widths ensure cohesive visual identity.

### 2026-07-04: Meal Library density + filtering (#170)

**By:** Linus
**What:** Added card/table view toggle with localStorage persistence (key `meal-library-view`). New `TagMultiSelect.tsx` searchable multi-select replacing the tag-chip wall. Hide-built-ins filter implemented as `placeholderKind !== null` (hides system placeholder meals: Free Day, Leftovers, Takeout, Dining Out, Travel, Skip). Full-metadata search was found to be server-side → deferred to #171. Frontend already sends `search` param transparently since #170.
**Why:** With more data, the cards-only view + tag-chip wall became unmanageable for users with 10s–100s of recipes. Togglable view + searchable multi-select + built-in filter together provide density and discoverability.

### 2026-07-04: Broaden meal search to full metadata (#172)

**By:** Livingston
**What:** Server-side `/meals` `search` param broadened from name-only ILIKE to a Prisma `OR` across name, description, tags (MealTag→Tag.name), and collections (MealRecipeCollection→RecipeCollection.name). Null-safe (description is String?). No schema migration — query-only. Transparent to frontend (web already sends `search` since #170). Note: Category/MealCategory was removed in #107, so there is no category field to match.
**Why:** Search Meals should match all main metadata, not just title, to help users discover recipes by partial matches on description, tags, or collections.

### 2026-07-04: Meal detail modal navigation (#173)

**By:** Linus
**What:** Meal title clicks in the library (card + table) now open the shared `MealDetailModal` (same component WeekPlanPage uses) instead of navigating to a standalone page. `/meals/:mealId` is now a bookmarkable deep-link that renders MealsPage with the modal open (two sibling routes `/meals` and `/meals/:mealId` share MealsPage). Standalone `MealDetailPage.tsx` (+ test) fully deleted/retired. Cooking-mode exit restores the modal with zero code changes because CookingModePage already exits to `/meals/${meal.id}`.
**Why:** Brandon wanted title clicks to open the same view-modal as the weekly planner, the dedicated detail page to not exist, and cooking-mode exit to return to the last history location with the modal preserved. Product decision (Brandon): keep `/meals/:id` as a bookmarkable deep-link that opens the modal over the library.
