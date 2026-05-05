---
description: "Use when editing the Prisma schema, creating or applying migrations, or updating the seed script. Covers the dev vs deploy migration flow, client regeneration, and cascade/enum conventions."
applyTo: "packages/api/prisma/**"
---
# Prisma Guidelines (`packages/api/prisma`)

## Migration Workflow

1. Edit [schema.prisma](../../packages/api/prisma/schema.prisma).
2. Create a migration:
   ```sh
   pnpm --filter @meal-planner/api run db:migrate:dev
   ```
   Prisma will prompt for a migration name, generate SQL under [prisma/migrations](../../packages/api/prisma/migrations), apply it to the dev DB, and regenerate the client.
3. Update affected services in [src/services](../../packages/api/src/services) and any shared types in [packages/shared](../../packages/shared).
4. Run `pnpm -r run test` and `pnpm -r run build`.

For production / CI, `pnpm db:migrate` runs `prisma migrate deploy` (no schema diffing, applies pending migrations only).

## Client Regeneration

After any schema change, regenerate the client so TypeScript picks up new fields:

```sh
pnpm db:generate
```

`db:migrate:dev` does this automatically; `db:migrate` (deploy) does not.

## Conventions

- **IDs**: `String @id @default(uuid())`.
- **Timestamps**: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` where mutation tracking is needed.
- **Cascading deletes**: child records that don't survive their parent use `onDelete: Cascade` (e.g. `DayPlan` → `WeekPlan`, `MealIngredient` → `Meal`). Be deliberate — never add cascade to `User` or `Family` relations without considering data loss.
- **Enums** live in `schema.prisma` and are re-exported from [packages/shared/src/types](../../packages/shared/src/types) when consumed by the web client. Keep them in sync.
- **Unique constraints**: composite uniques use `@@unique([familyId, weekStart])` style (see `WeekPlan`, `FamilyMember`, `DayPlan`).
- **Hashed-only fields**: `ApiKey.hashedKey` — never store the raw key, never add a column to.

## Safety

- **Do NOT run** `prisma migrate reset` or `pnpm db:reset` without explicit user confirmation — both wipe the dev database.
- **Do NOT** edit a migration SQL file after it has been applied. Create a new migration instead.
- The seed script ([seed.ts](../../packages/api/prisma/seed.ts)) is idempotent-ish; verify upserts when adding seed data.

## Tests

Prisma is mocked in tests — do not write integration tests that hit a real database from this package. See the API instructions for the `prismaMock` helper.
