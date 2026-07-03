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
