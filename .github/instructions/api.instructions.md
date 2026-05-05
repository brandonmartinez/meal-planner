---
description: "Use when editing or adding Express routes, services, middleware, or tests in packages/api. Covers Prisma access, Zod validation, auth chain, and the prismaMock test helper."
applyTo: "packages/api/**"
---
# API Guidelines (`packages/api`)

## Layering

- **Routes** ([src/routes](../../packages/api/src/routes)) — thin Express handlers. Validate `req.body`/`req.query` with Zod, call into services, translate errors to HTTP status codes. No direct Prisma calls.
- **Services** ([src/services](../../packages/api/src/services)) — all Prisma access lives here. Pure functions take primitives/typed args, return typed results. Trust the types, no input revalidation.
- **Middleware** ([src/middleware](../../packages/api/src/middleware)) — auth, membership, role checks. Compose, don't reimplement.
- **Config** — read env via [src/config/index.ts](../../packages/api/src/config/index.ts); never call `process.env` directly outside that module.

## ESM Imports

Local relative imports MUST end in `.js` (TypeScript resolves the `.ts`):

```ts
import { authenticateJWT, requireRole } from '../middleware/auth.js';
import * as familyService from '../services/family.js';
```

Workspace packages (`@meal-planner/shared`) and bare specifiers do not.

## Auth Chain

Order matters. Compose in this order on protected routes:

```ts
router.post('/:familyId/invites',
  authenticateJWT,                          // populate req.user
  requireMembership,                        // 403 if not in family
  requireRole(Role.PARENT),                 // optional role gate
  handler);
```

Magic Mirror / public display endpoints use `authenticateApiKey` *instead of* `authenticateJWT`. Never combine them on the same route.

## Validation Pattern

```ts
const schema = z.object({ name: z.string().min(1).max(100) });
try {
  const { name } = schema.parse(req.body);
  // ...service call...
} catch (error) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation failed', details: error.errors });
    return;
  }
  res.status(500).json({ error: 'Failed to ...' });
}
```

## Tests

- Vitest with `globals: false` — explicit imports: `import { describe, it, expect, vi, beforeEach } from 'vitest';`
- Prisma is mocked via [tests/helpers/prisma.ts](../../packages/api/tests/helpers/prisma.ts) using `vitest-mock-extended`. Import `prismaMock` and stub method returns. Do **not** instantiate `PrismaClient` in tests.
- Express objects are built with [tests/helpers/express.ts](../../packages/api/tests/helpers/express.ts) (`buildReq`, `buildRes`, `buildNext`).
- Service tests live next to the source: `services/family.ts` ↔ `services/family.test.ts`.

## Security

- API keys: store hashed only ([services/apiKey.ts](../../packages/api/src/services/apiKey.ts)). The raw key is returned exactly once at creation; never log it, never persist it, never return it on subsequent reads.
- Preserve Helmet, CORS, rate-limit, cookie-parser, and Morgan ordering in [src/index.ts](../../packages/api/src/index.ts).
- JWTs live in `httpOnly` cookies; Bearer header is also accepted. Keep both paths working in `authenticateJWT`.
