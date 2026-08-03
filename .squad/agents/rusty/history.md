# Project Context

- **Owner:** Brandon Martinez
- **Project:** meal-planner — family meal planning app with a public Magic Mirror display
- **Stack:** pnpm monorepo (Node 20+, pnpm 9). `packages/api`: Express 5 + Prisma 6 + PostgreSQL (Google OAuth via Passport, JWT in httpOnly cookies, hashed API keys, Zod, Helmet/CORS/rate-limit/Morgan). `packages/web`: React 19 + Vite 6 + React Router v7 + Tailwind v4 (MSW in tests). `packages/shared`: pure TS types/constants (`@meal-planner/shared`). TypeScript strict + ESM (`.js` suffix on api runtime imports). Vitest (api `globals:false` + prismaMock; web `globals:true` + MSW). Docker + `k8s/` + CI (Postgres 16 service).
- **Created:** 2026-06-30

## Core Context

Lead / Architect. Owns cross-package contracts, scope, and code review. Build/CI order is shared → generate Prisma → api → web — keep it intact.

## History Summary (2026-06-30 through 2026-07-28)

- **Initialization (2026-06-30):** Ocean's Eleven cast. Established `@meal-planner/shared` DTOs as MCP contract surface (#12 PR #38). Security gated Frank's #10 (rate limits APPROVE) and #6 (MCP credentials APPROVE).
- **MCP server (Sprint 4):** Authored `packages/mcp` (#5 PR #65); Frank APPROVE. Infra gates: #25/PR #63 (immutable tags), #26/PR #64 (migrations out of startup) — both APPROVE. CI validation #42/PR #66 APPROVE.
- **MCP bearer auth (2026-07-01):** #87/#88 host-trust fix closed injection issue. PR #90 preserved Bearer/WWW-Authenticate + fixed `agentKeyGenerator` keying.
- **Epic #91 + parity gate (2026-07-02):** Led #91 decomposition into 29 issues (#92–#120); five-sprint plan; critical path #92→#96→#111→#112. #96 APPROVED: 11-row parity checklist, `meal:write` for metadata, UI-only features violate parity (HARD RULE). `parity.instructions.md` committed.
- **#218 grocery grouping review (2026-07-28):** Rejected Linus's initial commit (two blockers: pantry separation must be mode-independent per #205; meal grouping must use `sourceMealIds`). Approved Virgil's fix `bb7474e`.
- **Archive gate policy (2026-07-28):** Rewrote Scribe's gate to use `archivable_bytes` (top-level `##` sections except `## Standing Policy`) with 24 KiB / 64 KiB tiers; `total_bytes` is reporting-only. Archive gate triggers from `archivable_bytes` only — a budget measured against content the gate cannot act on creates a permanently red signal.

## Learnings

### 2026-08-03T11:09:03-04:00 — Tabular "Grid" view: HYBRID approved, spec revised

Brandon approved Approach C (Hybrid) and reframed the phase split. Phase 1 = additive schema (`MealIngredient.position`+`groupLabel`; `MealInstruction.kind`/`subLabel`/`column`/`spanFrom`/`spanTo`, `enum InstructionKind`) + derive-on-read + read path + toggle/renderer; Phase 2 = editor UI (write parity). Key design calls: derivation is a pure `deriveRecipeMatrix()` in shared, run on the API read path, **never persisted**; provenance is **structural** (`matrixSource='authored'` iff any instruction has non-null `spanFrom`), no stored `isDerived` flag — explicitly citing the grocery `sources`-vs-`sourceMealIds` staleness lesson; schema doc comments must state null=derive-at-read/display-only. Parity: Phase 1 is a READ capability (read parity done; agent write Zod + MCP inputSchema documented N/A), Phase 2 is the WRITE capability.

### 2026-08-03T11:28:18-04:00 — Review gate: P1-1 schema migration (Saul, 27e94a3) → APPROVE

Verified: backfill SQL valid Postgres (0-based `row_number()-1`, ordered after ADD COLUMN); `ctid` ordering acceptable for one-shot in-transaction backfill (random UUID PK; ACCESS EXCLUSIVE lock rules out concurrent VACUUM FULL); strictly additive; doc comments fully convey anti-staleness contract. Verdict: **APPROVE**.

### 2026-08-03T11:49:30-04:00 — Review gate: P1-2/3/4/5 read-path + parity (Livingston, 7054875 + 9f62bfc) → APPROVE

Verified: (1) `applyRecipeMatrix` is a pure projection — no Prisma write, read positions only. (2) Ingredient ordering: `MEAL_DETAIL_INCLUDE` + `exportMeals` + `applyRecipeMatrix` re-sort — belt-and-suspenders. (3) `mapIngredientCreates()` assigns 0-based position from array index — confirmed. (4) #96 parity: read parity delivered; agent-write Zod + MCP inputSchema N/A = legitimate (READ capability only). (5) 6 re-fetch fixture completions genuine. Verdict: **APPROVE** (conditional on Linus's P1 web staying read-only).

### 2026-08-03T12:13:00-04:00 — Review gate: P1-6/7/8 web Grid view (Linus, 4d23572) → APPROVE (+1 design ruling)

Verified: (1) parity condition DISCHARGED — no matrix authoring vector from web; (2) column-assignment cascade SOUND (induction proof); (3) `getTabularMeal()` cast SOUND; (4) a11y coherent — real `<table>`, `scope`, `headers`; (5) sub-sm degrade SAFE — persisted preference never overwritten by viewport. **DESIGN RULING:** `MealIngredient.category` is grocery-aisle vocabulary, NOT recipe sections. Adopted option (ii): suppress DERIVED groups; render pills/borders only for authored `groupLabel`. New work item **P1-9** issued (owner: Livingston). Verdict: **APPROVE**.

### 2026-08-03T12:14:00-04:00 — P1-6/7/8 addendum: 3 visual/semantic findings from Yen's po'boy screenshot

Verdict UNCHANGED (APPROVE). Findings are derivation/content-shaping, not render defects:
1. **subLabel duplicates label** — suppress subLabel when substring of displayed label. Owner Linus.
2. **Full-sentence labels defeat format** — web derives SHORT display label (leading clause, ~6-word cap, strip trailing "to/for <detail>" tail); full text in `title`; always full in List. Presentation-only → NO persistence, NO DTO field; `text` stays single semantic source. Owner Linus.
3. **Group pills = grocery aisle** — reaffirms option (ii) ruling; P1-9 owner Livingston.

### 2026-08-03T12:16:22-04:00 — #96 parity conditional DISCHARGED

No matrix authoring vector from web confirmed: base `MealIngredient`/`MealInstruction` types carry NO span fields; `MealFormPage` untouched; REST Zod takes position from array order. Write-side #96 N/A from the P1-2..5 review stands as legitimate. Phase 1 parity confirmed: all read surfaces complete, all write surfaces N/A documented.

📌 Team update (2026-08-03T11:00:32-04:00): Linus fixed all 3 adversarial short-label defects in `d467f29` (D1: adverbial openers skipped to reach imperative; D2: 9-word cap + glue-word trim; D3: seconds/days strip narrowed to temperature+min/hr). All `it.fails` converted to passing; 670 total shortStepLabel tests. Yen's final SHIP verdict stands for the completed feature. Phase 1 delivered end-to-end. — decided by Linus, Yen

### 2026-08-03T15:45:00-04:00 — Ruling: Grid ingredient order = first use (spec §3.5, P1-10)

Measured derived Grid on Brandon's real 74 meals: 78% have zero instructions (seed problem, Saul), and of the rest 94% over-bracket because ingredients are stored in shopping order, not use order. Ruling (option a): derivation emits an explicit `ingredientDisplayOrder: number[]` (permutation into the position-sorted array); `spanFrom/spanTo` index into THAT display order; `meal.ingredients` stays position-ordered and untouched (List/Grocery/MealDetailModal unaffected); authored ⇒ identity permutation so authored spans need zero re-indexing and are never reordered. Sort key = first-matching PROCESS step index (first-use-wins, stable by position); unmatched ingredients parked at the end in position order (the big win — pulls unrelated rows out from between co-used ones). Anti-staleness reaffirmed: computed on read, never persisted, no flag. Parity: read-only field, MCP/REST inherit via TabularRecipeMealDTO, no write obligation. Rejected (b) web-side sort (duplicates shared derivation) and (c) reorder meal.ingredients (breaks List + Grocery). UX: Grid≠List order is acceptable and correct (different visualization); caption notes use-order. Honest expectation logged: fixes the majority (intervening/unmatched ingredients) but NOT cross-step reuse (intrinsic DAG-vs-tree limit → Phase-2 authored spans), and nothing for the 78% empty grids (seed). Owners: Livingston (shared `deriveRecipeMatrix` + DTO + api), Linus (buildTabularRecipe iterate ingredientDisplayOrder, no re-sort). = P1-10, alongside P1-9 (groups) in the pre-demo finish batch.

📌 Team update (2026-08-03T16:52:00-04:00): Yen's **SHIP** verdict (PM final pass): 1903 tests PASS (shared 53, mcp 121, web 706, api 1023); over-bracket steps 26/61 → 9/61 (−65%); clean meals 1/16 → 9/16. Phase 1 fully complete. Residual 9 over-steps are intrinsic cross-step-reuse (DAG-vs-tree); only Phase-2 authored spans close them. Matcher hardening impact measured as 1+0 steps vs 17 for use-ordering — diminishing returns finding recorded to decisions.md. — decided by Yen, Rusty
