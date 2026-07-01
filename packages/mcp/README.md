# @meal-planner/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that
exposes safe, scoped meal-planning tools to AI agents. It is a **client of the
meal-planner HTTP API** — it never touches the database or imports any
`packages/api` internals, so all authentication, authorization, auditing, and
rate-limiting continue to live in the API.

Default transport: **stdio** (for local agents such as Claude Desktop, editors,
and CLI hosts).

## How it works

```
AI agent  ──stdio──▶  @meal-planner/mcp  ──HTTP (x-agent-key)──▶  meal-planner API
```

- The agent talks to this server over stdio.
- This server calls the API's **agent surface** (`/api/agent/*`) over HTTP,
  authenticating with a **scoped agent credential** (issue #6) sent in the
  `x-agent-key` header.
- The API validates the credential, enforces per-operation **scopes**, checks
  that the credential belongs to the target family, and writes an **audit**
  entry for every read and write.

The MCP server never sees a user JWT or a parent session, and it never imports
Prisma or API services.

## Tools

| Tool | API call | Required scope |
| --- | --- | --- |
| `list_meals` | `GET /api/agent/:familyId/meals` | `meal_plan:read` |
| `get_current_week_plan` | `GET /api/agent/:familyId/weeks/current` | `meal_plan:read` |
| `get_week_plan` | `GET /api/agent/:familyId/weeks/:weekStart` | `meal_plan:read` |
| `get_previous_week_plans` | `GET /api/agent/:familyId/weeks` | `meal_plan:read` |
| `schedule_meal` | `POST /api/agent/:familyId/schedule` | `meal_plan:schedule` |
| `approve_suggestion` | `PATCH /api/agent/:familyId/suggestions/:id/approve` | `meal_plan:approve` |

`schedule_meal` creates an **unapproved** suggestion. Approving it is a
separate, privileged action (`approve_suggestion`) that requires the
`meal_plan:approve` scope. An agent only ever holds the scopes a parent
explicitly granted when the credential was created.

All tool inputs are validated with [Zod](https://zod.dev) before a request is
made; the API performs the authoritative validation and authorization
server-side.

## Configuration

All configuration comes from environment variables. **Secrets are never
hardcoded and never logged.**

| Variable | Required | Description |
| --- | --- | --- |
| `MEAL_PLANNER_API_BASE_URL` | yes | Base URL of the API, e.g. `http://localhost:3001`. |
| `MEAL_PLANNER_AGENT_KEY` | yes | The raw scoped agent credential (shown once at creation). Sent as `x-agent-key`. **Secret.** |
| `MEAL_PLANNER_FAMILY_ID` | yes | The family the credential is scoped to. All tools operate within this family. |
| `MEAL_PLANNER_REQUEST_TIMEOUT_MS` | no | Per-request timeout in ms (default `15000`). |

Create an agent credential (with the scopes you want to grant) from the API's
parent-facing endpoints or the web Family Settings UI (issue #6). The raw key is
returned exactly once — store it securely.

## Running

Build and start over stdio:

```bash
pnpm --filter @meal-planner/mcp run build

MEAL_PLANNER_API_BASE_URL=http://localhost:3001 \
MEAL_PLANNER_AGENT_KEY=your-agent-key \
MEAL_PLANNER_FAMILY_ID=your-family-id \
node packages/mcp/dist/index.js
```

Or during development (no build step):

```bash
MEAL_PLANNER_API_BASE_URL=http://localhost:3001 \
MEAL_PLANNER_AGENT_KEY=your-agent-key \
MEAL_PLANNER_FAMILY_ID=your-family-id \
pnpm --filter @meal-planner/mcp run dev
```

### Example MCP host config

```json
{
  "mcpServers": {
    "meal-planner": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": {
        "MEAL_PLANNER_API_BASE_URL": "http://localhost:3001",
        "MEAL_PLANNER_AGENT_KEY": "your-agent-key",
        "MEAL_PLANNER_FAMILY_ID": "your-family-id"
      }
    }
  }
}
```

> stdout is reserved for the MCP protocol. All diagnostics are written to
> stderr, and the agent key is never included in any output.

## Scripts

| Script | Description |
| --- | --- |
| `build` | Type-check and emit to `dist/`. |
| `dev` | Run from source with `tsx watch`. |
| `start` | Run the built server (`dist/index.js`). |
| `lint` | ESLint over `src/`. |
| `test` | Run the Vitest suite (API mocked; no real network, no Prisma). |

## Monorepo build order

`@meal-planner/mcp` depends on `@meal-planner/shared` for wire-contract types
(imported as types only). Build `shared` first:

```bash
pnpm --filter @meal-planner/shared run build
pnpm --filter @meal-planner/mcp run build
pnpm --filter @meal-planner/mcp run test
```

CI builds and tests this package as part of the pipeline.
