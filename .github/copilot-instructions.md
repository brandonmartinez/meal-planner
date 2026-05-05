# Meal Planner — Project Guidelines

Family meal planning app. pnpm monorepo with three workspaces. See [README.md](../README.md) for product overview.

## Architecture

- **`packages/api`** — Express 5 + Prisma 6 + PostgreSQL. Google OAuth via Passport, JWT in httpOnly cookies (or Bearer), API keys (hashed) for the public Magic Mirror display endpoint. Entry: [packages/api/src/index.ts](../packages/api/src/index.ts). Routes mounted under `/api`.
- **`packages/web`** — React 19 + Vite 6 + React Router v7 + Tailwind v4. Dev server proxies `/api` → `http://localhost:3001` ([vite.config.ts](../packages/web/vite.config.ts)).
- **`packages/shared`** — Pure TS types/constants consumed by both api and web. Imported as `@meal-planner/shared`.

Layered deeper guidance lives in [.github/instructions/](./instructions/) and is auto-attached by `applyTo` globs.

## Build and Test

Always run from the repo root unless noted. Node 22+, pnpm 9+.

```sh
pnpm install                    # bootstrap workspaces
pnpm dev                        # parallel dev: api on :3001, web on :5173
pnpm -r run build               # build all workspaces (shared → api → web)
pnpm -r run test                # vitest run in every workspace
pnpm -r run lint                # eslint src/ in every workspace
pnpm db:migrate                 # prisma migrate deploy (production-style)
pnpm db:generate                # regenerate Prisma client (after schema edits)
pnpm db:seed                    # run packages/api/prisma/seed.ts
pnpm --filter @meal-planner/api run db:migrate:dev   # create new dev migration
```

Filter a single workspace with `pnpm --filter @meal-planner/{api,web,shared} run <script>`.

## Code Style & Conventions

- **TypeScript strict mode everywhere** (see [tsconfig.base.json](../tsconfig.base.json) — `strict: true`, `ES2022`, `moduleResolution: bundler`). Do not weaken these settings.
- **ESM only** — every package has `"type": "module"`. In `packages/api` runtime imports between local files must use the `.js` suffix (e.g. `import { config } from "./config/index.js"`); workspace packages and bare specifiers do not.
- **No ESLint or Prettier config files exist** in this repo. Follow the style of surrounding code; do not invent new lint rules or reformat unrelated lines.
- **Colocated tests** — `*.test.ts` next to source for api/shared, `*.test.tsx` next to source for web. Test setup files live in each package's `tests/` folder and are loaded via `vitest.config.ts`.
- **Path conventions** — services in [packages/api/src/services](../packages/api/src/services), routes in [packages/api/src/routes](../packages/api/src/routes), middleware in [packages/api/src/middleware](../packages/api/src/middleware). React contexts/hooks/pages/components live under [packages/web/src](../packages/web/src) in their named folders.
- **Validate at boundaries** — use Zod for request body/query validation in API routes. Trust types within services.

## Security & Auth (do not bypass)

- Auth chain: `authenticateJWT` → `requireMembership` → optional `requireRole(Role.PARENT)`. Public Magic Mirror routes use `authenticateApiKey` instead.
- API keys are stored hashed only ([packages/api/src/services/apiKey.ts](../packages/api/src/services/apiKey.ts)) — never log raw keys, never return them after creation.
- JWT secret, Google OAuth credentials, and `DATABASE_URL` come from env vars; defaults in [packages/api/src/config/index.ts](../packages/api/src/config/index.ts) are dev-only.
- Helmet, CORS, rate limiting, and Morgan are wired in [packages/api/src/index.ts](../packages/api/src/index.ts) — preserve them when editing middleware order.

## Conventions That Differ From Defaults

- **API tests use `globals: false`** (explicit `import { describe, it, expect } from "vitest"`); web tests use `globals: true`.
- **Prisma client is mocked via** [packages/api/tests/helpers/prisma.ts](../packages/api/tests/helpers/prisma.ts) (`vitest-mock-extended`); do not instantiate `PrismaClient` in tests.
- **MSW intercepts fetch in web tests** — add handlers in [packages/web/tests/msw](../packages/web/tests/msw) rather than mocking `fetch` directly.
- **CI** ([.github/workflows/ci.yml](./workflows/ci.yml)) builds shared → generates Prisma → builds api → builds web → runs all tests against a Postgres 16 service container. Keep this order intact when changing build scripts.

## Custom Agents Available

Two project-specific subagents live in [.github/agents/](./agents/):
- **test-author** — writes Vitest tests using existing helpers/MSW patterns.
- **schema-migrator** — guarded Prisma schema change workflow.
