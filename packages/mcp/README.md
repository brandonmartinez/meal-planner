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

## Local smoke test & verification

Use this to prove the MCP → API → Postgres path actually works end-to-end
(scope enforcement + the audit trail), not just the mocked unit suites. Run
**everything inside the devcontainer** — never against a host toolchain — so the
API, Postgres, and the credential hash all share one environment (and one
`CREDENTIAL_PEPPER`). Every command below is prefixed for the devcontainer:

```bash
docker exec -u node -w /workspace devcontainer-app-1 bash -lc '<cmd>'
```

### 1. Seed the demo family

```bash
pnpm --filter @meal-planner/api run db:seed
```

This creates the demo family **"The Rivera Family"** (see
`packages/api/src/config/demo.ts`).

### 2. Mint a scoped agent credential

The raw key is shown **exactly once**. Use the CLI helper
(`packages/api/prisma/provision-agent-credential.ts`) — the same
`createAgentCredential` service the parent-facing
`POST /api/families/:familyId/agent-credentials` route uses, so the credential
is stored hashed-only:

```bash
# default scopes: meal_plan:read + meal_plan:schedule (deliberately NOT approve)
cd packages/api && pnpm exec tsx prisma/provision-agent-credential.ts > /tmp/agent_cred.json

# or request explicit scopes:
pnpm exec tsx prisma/provision-agent-credential.ts meal_plan:read meal_plan:approve
```

It prints one line of JSON: `{ familyId, credentialId, name, scopes, key }`.
**The `key` is a secret** — capture it into an env var or a `/tmp` file (as
above), never commit it, and never paste it into a log. Grant only the scopes
the agent needs (least privilege); an omitted scope is enforced as a `403`.

> You can also mint credentials from the parent-facing Family Settings UI or the
> `POST /api/families/:familyId/agent-credentials` route (both behind the normal
> browser/JWT auth). The CLI helper exists so a local/CI smoke test can get a
> real, scope-limited key without the browser flow.

### 3. Start the API

```bash
cd packages/api && pnpm exec tsx src/index.ts   # listens on :3001
```

### 4a. Exercise the API agent surface directly (curl)

The credential is sent in the `x-agent-key` header. With a read+schedule (no
approve) credential:

```bash
KEY=$(node -e 'console.log(require("/tmp/agent_cred.json").key)')
FAM=$(node -e 'console.log(require("/tmp/agent_cred.json").familyId)')
BASE=http://localhost:3001/api/agent/$FAM

# in-scope read  -> 200
curl -s -H "x-agent-key: $KEY" "$BASE/weeks/current"
# in-scope schedule -> 201 (creates an UNAPPROVED suggestion)
curl -s -X POST -H "x-agent-key: $KEY" -H 'content-type: application/json' \
  -d '{"mealId":"<mealId>","date":"2026-07-02"}' "$BASE/schedule"
# out-of-scope approve -> 403 {"error":"Insufficient scope"}
curl -s -X PATCH -H "x-agent-key: $KEY" "$BASE/suggestions/<id>/approve"
# no credential -> 401 {"error":"Agent credential required"}
curl -s "$BASE/weeks/current"
```

### 4b. Or drive the real MCP server over stdio

Point this package's built server at the live API and call a tool through the
MCP protocol (any MCP host, or a small `@modelcontextprotocol/sdk` client):

```bash
pnpm --filter @meal-planner/mcp run build
MEAL_PLANNER_API_BASE_URL=http://localhost:3001 \
MEAL_PLANNER_AGENT_KEY=$KEY \
MEAL_PLANNER_FAMILY_ID=$FAM \
node packages/mcp/dist/index.js
```

An in-scope tool (`get_current_week_plan`, `list_meals`, `schedule_meal`)
returns its JSON payload; an out-of-scope tool (`approve_suggestion` on a
credential lacking `meal_plan:approve`) comes back as a tool error
`API error 403: Insufficient scope`. The scope check is enforced by the API,
not the MCP server.

### 5. Confirm the audit trail

Every agent decision — allowed **and** denied — is appended to
`AgentAuditLog`. After the calls above:

```bash
cd packages/api && pnpm exec tsx -e 'import p from "./src/config/database.js";
(async()=>{const r=await p.agentAuditLog.findMany({orderBy:{createdAt:"asc"}});
console.table(r.map(x=>({action:x.action,outcome:x.outcome,reason:x.reason})));
await p.$disconnect()})()'
```

Expected outcomes:

| Call | `action` | `outcome` | `reason` |
| --- | --- | --- | --- |
| read week / meals | `meal_plan:read` | `allowed` | — |
| schedule | `meal_plan:schedule` | `allowed` | — |
| approve (no approve scope) | `meal_plan:approve` | `denied` | `missing_scope` |
| no `x-agent-key` | `authenticate` | `denied` | `missing_credential` |

The audit entry only ever stores the credential **id** — never the raw key.

> **Teardown:** stop the backgrounded API and delete any `/tmp` file that held
> the raw key. Credentials persist in the DB until revoked (`db:reset` clears
> them along with the rest of the demo data).

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
