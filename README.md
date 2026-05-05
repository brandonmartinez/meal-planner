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

- Node.js 22+
- pnpm 9+
- Docker & Docker Compose (for PostgreSQL)

### Local Development

```bash
# Clone the repo
git clone https://github.com/brandonmartinez/meal-planner.git
cd meal-planner

# Install dependencies
pnpm install

# Start PostgreSQL
docker compose up -d

# Set up environment
cp packages/api/.env.example packages/api/.env
# Edit .env with your Google OAuth credentials

# Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# Seed the database
pnpm db:seed

# Start development servers (API + frontend)
pnpm dev
```

The API runs on http://localhost:3001 and the frontend on http://localhost:5173.

### Dev Container

Open the project in VS Code with the Dev Containers extension for a fully configured development environment with PostgreSQL included.

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

```bash
# Get meals for the next 7 days
curl -H "X-API-Key: YOUR_KEY" \
  "https://meals.themartinez.cloud/api/display/meals?days=7"

# Get meals for a specific date range
curl -H "X-API-Key: YOUR_KEY" \
  "https://meals.themartinez.cloud/api/display/meals?from=2024-01-01&to=2024-01-07"
```

## License

See [LICENSE](LICENSE) for details.
