# 🍽️ Meal Planner

A family meal planning web application that allows family members to suggest meals for each day of the week, with parents approving final selections and generating grocery lists.

## Features

- **Weekly Meal Planning** — Interactive 7-day grid (Sun–Sat) for planning meals
- **Family Collaboration** — Multiple family members can suggest meals
- **Role-Based Access** — Parents approve meals, children suggest
- **Grocery Lists** — Auto-generated from approved meals with ingredient aggregation
- **Multi-Family Support** — Each family has its own meal library and plans
- **Magic Mirror Integration** — Public API endpoint for displaying meals on smart displays
- **Google SSO** — Simple authentication via Google accounts

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: Google OAuth 2.0 via Passport.js, JWT tokens
- **Infrastructure**: Docker, k3s (Kubernetes), GitHub Actions CI/CD

## Getting Started

### Prerequisites

- Docker & Docker Compose
- VS Code with the Dev Containers extension (recommended), or the
  [`devcontainer` CLI](https://github.com/devcontainers/cli)

> **Do not run project code on the host.** All `pnpm`, test, lint, build,
> Prisma, and `dev` commands run **inside the devcontainer** (or in CI) — never
> directly on your machine. The devcontainer pins Node 22, pnpm 9, and
> PostgreSQL 16 so everyone matches CI. See [CONTRIBUTING.md](CONTRIBUTING.md)
> and [`.devcontainer/README.md`](.devcontainer/README.md) for the full rule and
> the rationale.

### Dev Container (the default environment)

1. Open the folder in VS Code and **"Reopen in Container"**, or start it from the
   CLI:

   ```bash
   git clone https://github.com/brandonmartinez/meal-planner.git
   cd meal-planner
   devcontainer up --workspace-folder .
   # or: docker compose -f .devcontainer/docker-compose.yml up -d
   ```

   The first build installs dependencies and generates the Prisma client
   automatically (`pnpm install && pnpm db:generate`). PostgreSQL 16 runs as a
   compose service — no separate database setup needed.

   For Google OAuth, copy the env template and fill in your credentials (editing
   files on the host is fine; the workspace is mounted into the container):

   ```bash
   cp packages/api/.env.example packages/api/.env
   # edit packages/api/.env with your Google OAuth credentials
   ```

2. Run all project commands **in the container**. From the host, use the
   `scripts/dc-exec.sh` wrapper:

   ```bash
   scripts/dc-exec.sh pnpm dev          # API + frontend dev servers
   scripts/dc-exec.sh pnpm -r test      # all workspace tests
   scripts/dc-exec.sh pnpm -r lint      # all workspace lints
   scripts/dc-exec.sh pnpm db:migrate   # apply migrations
   scripts/dc-exec.sh pnpm db:seed      # seed the database
   ```

   Or SSH in (`ssh -p 2222 node@localhost`) and run the same commands directly
   inside `/workspace`.

The API runs on http://localhost:3001 and the frontend on http://localhost:5173.

See [`.devcontainer/README.md`](.devcontainer/README.md) for SSH setup, the
`dc-exec.sh` wrapper reference, and forwarded ports.

## Project Structure

```
meal-planner/
├── packages/
│   ├── shared/    # Shared TypeScript types & constants
│   ├── api/       # Express API server
│   └── web/       # React frontend
├── k8s/           # Kubernetes deployment manifests
├── .devcontainer/ # Dev container configuration
└── .github/       # CI/CD workflows
```

## Deployment

The app deploys to a k3s cluster via GitHub Actions:

1. Push to `main` triggers CI/CD
2. Tests run against PostgreSQL
3. Docker image is built and pushed to GHCR
4. Deploy to k3s: `./k8s/deploy.sh`

### Environment Variables

See `packages/api/.env.example` for required configuration.

## API

### Display API (for Magic Mirror)

The `/api/display/meals` endpoint powers the [MMM-meal-planner](https://github.com/brandonmartinez/MMM-meal-planner) MagicMirror² module and any other read-only display surface. It is authenticated with an `X-API-Key` header (see Family settings → API Keys).

#### Query params

| Param       | Type             | Notes |
|-------------|------------------|-------|
| `days`      | integer (1–60)   | Rolling window starting "today" in the resolved timezone. |
| `from`,`to` | `YYYY-MM-DD`     | Explicit range. Both required together; `to` must be ≥ `from`. |
| `weekStart` | `YYYY-MM-DD`     | Returns the 7 days starting on this date. |
| `tz`        | IANA timezone    | Optional override (e.g. `America/Chicago`). |

If no range param is given the endpoint returns the current Mon–Sun week in the resolved timezone.

**Timezone precedence** (highest first): `?tz=` query param → `Family.timezone` (editable in Family settings) → `UTC`.

#### Response shape

```json
{
  "family": {
    "id": "fam_…",
    "name": "Martinez",
    "timezone": "America/Chicago"
  },
  "meals": [
    {
      "date": "2026-05-04",
      "dayOfWeek": "Monday",
      "status": "planned",
      "meals": [
        {
          "id": "meal_…",
          "name": "Spaghetti",
          "description": "Pasta night",
          "placeholderKind": null,
          "icon": null,
          "imageUrl": null
        }
      ]
    },
    {
      "date": "2026-05-05",
      "dayOfWeek": "Tuesday",
      "status": "skipped",
      "meals": []
    },
    {
      "date": "2026-05-06",
      "dayOfWeek": "Wednesday",
      "status": "unplanned",
      "meals": []
    }
  ]
}
```

- `status` is `"planned"` (≥1 approved real meal), `"skipped"` (only `SKIP` placeholder approved), or `"unplanned"` (no approved suggestions). For back-compat, `meals: []` is preserved on `skipped` days.
- `icon` is the placeholder emoji when `placeholderKind` is set (e.g. `"🏖️"` for `FREE_DAY`), `null` otherwise.
- `imageUrl` surfaces the meal's optional thumbnail (additive; `null` when unset).

#### HTTP caching

Responses include `Cache-Control: private, max-age=60` and a strong `ETag`. Polling clients should send `If-None-Match` and handle `304 Not Modified` to avoid re-downloading unchanged plans.

#### Error envelope

All 4xx/5xx responses use:

```json
{ "error": { "code": "INVALID_TIMEZONE", "message": "Unknown IANA timezone: Not/Real" } }
```

Codes: `MISSING_API_KEY`, `INVALID_API_KEY`, `INVALID_DATE_RANGE`, `INVALID_TIMEZONE`, `INVALID_QUERY`, `INTERNAL_ERROR`.

#### Examples

```bash
# Rolling 7 days, anchored to the family's stored timezone
curl -H "X-API-Key: YOUR_KEY" \
  "https://meals.themartinez.cloud/api/display/meals?days=7"

# Explicit timezone override + ETag revalidation
curl -H "X-API-Key: YOUR_KEY" \
     -H 'If-None-Match: "abc…"' \
  "https://meals.themartinez.cloud/api/display/meals?days=7&tz=America/Chicago"

# Specific date range
curl -H "X-API-Key: YOUR_KEY" \
  "https://meals.themartinez.cloud/api/display/meals?from=2026-05-04&to=2026-05-10"
```

## License

See [LICENSE](LICENSE) for details.
