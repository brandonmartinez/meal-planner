# @meal-planner/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that
exposes safe, scoped meal-planning tools to AI agents. It is a **client of the
meal-planner HTTP API** — it never touches the database or imports any
`packages/api` internals, so all authentication, authorization, auditing, and
rate-limiting continue to live in the API.

Default transport: **stdio** (for local agents such as Claude Desktop, editors,
and CLI hosts). A second, **hosted Streamable HTTP** transport (for
multi-tenant/remote deployments) is also provided — see
[Transports](#transports).

## Transports

This package ships **two** transports that share the exact same
transport-agnostic tool layer (`createToolHandlers` / `registerTools`):

### stdio (local, single-tenant)

```
AI agent  ──stdio──▶  @meal-planner/mcp  ──HTTP (x-agent-key)──▶  meal-planner API
```

The agent key **and** family are supplied at boot via environment variables
(`MEAL_PLANNER_AGENT_KEY`, `MEAL_PLANNER_FAMILY_ID`). One process serves one
family. Entry point: `dist/index.js` (`meal-planner-mcp` bin).

### Hosted Streamable HTTP (remote, multi-tenant)

```
AI agent ──HTTP POST /mcp (Authorization: Bearer <key> per request)──▶ @meal-planner/mcp (hosted)
                                                                         │
                                                         per request:    ▼
                                                   GET /api/agent/me  ──▶ meal-planner API
                                                   (resolve family + scopes from the key)
```

The hosted server holds **no** ambient credential and **no** family id. Every
request must carry its own scoped key. `Authorization: Bearer <key>` is the
preferred header; `x-agent-key` is still accepted for backward compatibility.
If both are sent, Bearer wins. For each request the server:

1. Reads the key from `Authorization: Bearer` (or falls back to `x-agent-key`)
   (missing → `401` + `WWW-Authenticate: Bearer realm="meal-planner-mcp"`).
2. Calls `GET /api/agent/me` to resolve `{ familyId, scopes, name }` from that
   key (unknown/revoked/expired → `401` +
   `WWW-Authenticate: Bearer realm="meal-planner-mcp", error="invalid_token"`;
   scope denial → `403` +
   `WWW-Authenticate: Bearer realm="meal-planner-mcp", error="insufficient_scope"`).
3. Binds a fresh, per-request MCP server + tool handlers to the **resolved**
   family and serves the JSON-RPC request through a stateless
   `StreamableHTTPServerTransport` (`sessionIdGenerator: undefined`,
   `enableJsonResponse: true`), then tears it down.

A request carrying family A's key can only ever operate on family A — the family
is derived from the key, never from the URL or client input. There is no shared
session state between requests; every call re-authenticates.

#### Production endpoint

In production the MCP handler is **mounted inside the API Express app** at
`POST /mcp` on the same port as the API (`:3001`). This ships in the existing
container image and is reachable through the existing ingress at:

```
https://meals.themartinez.cloud/mcp
```

No additional port, container, k8s service, or ingress change is required — the
existing `meals.themartinez.cloud/` ingress routes straight to the pod and the
API serves `/mcp` alongside `/api` and the SPA.

#### Dev / standalone endpoint

During local development (`pnpm dev`) the MCP package also runs as a **separate
standalone process** on `:3100`, which is convenient for hot-reload and isolated
testing of the MCP layer. The hosted HTTP server started by `pnpm dev` uses the
same per-request auth model.

| Environment | Endpoint | Served by |
|---|---|---|
| **Production** | `https://meals.themartinez.cloud/mcp` | API Express app, port 3001 |
| **Dev (`pnpm dev`)** | `http://localhost:3100/mcp` | Standalone MCP HTTP server |

The standalone entrypoint (`dist/http.js` / `meal-planner-mcp-http` bin) remains
available at default port `3100`. Unauthenticated `GET /health` and
`GET /.well-known/oauth-protected-resource` probes are served by the standalone
process only.

## Tools

Read/schedule tools take the family in the path (stdio binds it from
`MEAL_PLANNER_FAMILY_ID`; hosted binds it from the resolved key). The
**family-from-key** write/grocery tools do NOT put the family in the path — the
API resolves it from the presented key.

| Tool | API call | Required scope |
| --- | --- | --- |
| `list_meals` | `GET /api/agent/:familyId/meals` | `meal_plan:read` |
| `get_current_week_plan` | `GET /api/agent/:familyId/weeks/current` | `meal_plan:read` |
| `get_week_plan` | `GET /api/agent/:familyId/weeks/:weekStart` | `meal_plan:read` |
| `get_previous_week_plans` | `GET /api/agent/:familyId/weeks` | `meal_plan:read` |
| `schedule_meal` | `POST /api/agent/:familyId/schedule` | `meal_plan:schedule` |
| `approve_suggestion` | `PATCH /api/agent/:familyId/suggestions/:id/approve` | `meal_plan:approve` |
| `create_meal` | `POST /api/agent/meals` | `meal:write` |
| `update_meal` | `PATCH /api/agent/meals/:mealId` | `meal:write` |
| `get_current_grocery_list` | `GET /api/agent/grocery/current` | `meal_plan:read` |

`schedule_meal` creates an **unapproved** suggestion. Approving it is a
separate, privileged action (`approve_suggestion`) that requires the
`meal_plan:approve` scope. An agent only ever holds the scopes a parent
explicitly granted when the credential was created.

### Meal write tools (`meal:write`)

`create_meal` and `update_meal` accept a **structured** recipe — `name`,
optional `description`, optional `difficulty` (`EASY`|`MEDIUM`|`HARD`), and an
`ingredients[]` list (`name`, optional `quantity`, `unit`, and `category` from
the shared `INGREDIENT_CATEGORIES`). They are designed for a model that has
**already parsed** a recipe from a CSV, scan, or photo: the LLM does the
parsing/OCR, and these tools expose only the validated structured write. There
is **no** OCR/vision in the API or MCP server. `update_meal` cannot edit a
placeholder meal (the API returns `403`), and there is intentionally **no**
delete tool.

### `get_current_grocery_list` (`meal_plan:read`)

Returns the family's **current-week** grocery list, with "this week" resolved
Monday-anchored in the family's timezone (identical to `get_current_week_plan`).
If no list exists yet for the current week it is **generated on demand** from the
week's scheduled meals and returned, so the tool is always useful rather than
returning an empty/absent result.

All tool inputs are validated with [Zod](https://zod.dev) before a request is
made; the API performs the authoritative validation and authorization
server-side.

## Configuration

All configuration comes from environment variables. **Secrets are never
hardcoded and never logged.**

### stdio (single-tenant)

| Variable | Required | Description |
| --- | --- | --- |
| `MEAL_PLANNER_API_BASE_URL` | yes | Base URL of the API, e.g. `http://localhost:3001`. |
| `MEAL_PLANNER_AGENT_KEY` | yes | The raw scoped agent credential (shown once at creation). Sent as `x-agent-key`. **Secret.** |
| `MEAL_PLANNER_FAMILY_ID` | yes | The family the credential is scoped to. All tools operate within this family. |
| `MEAL_PLANNER_REQUEST_TIMEOUT_MS` | no | Per-request timeout in ms (default `15000`). |

### Hosted HTTP (multi-tenant)

The hosted server reads **neither** an agent key **nor** a family id at boot —
the key arrives per request (`Authorization: Bearer <key>` preferred;
`x-agent-key` also accepted) and the family is resolved from that key.

| Variable | Required | Description |
| --- | --- | --- |
| `MEAL_PLANNER_API_BASE_URL` | yes | Base URL of the API, e.g. `http://localhost:3001`. |
| `MEAL_PLANNER_MCP_PORT` | no | TCP port to listen on (default `3100`). |
| `MEAL_PLANNER_REQUEST_TIMEOUT_MS` | no | Per-request timeout in ms for API calls (default `15000`). |

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
pnpm --filter @meal-planner/mcp run dev:stdio
```

### Local dev (`pnpm dev`)

The root `pnpm dev` runs this package's `dev` script, so MCP also starts as hosted
HTTP at `http://localhost:3100/mcp` (health at `/health`). This standalone
process is convenient for hot-reload and isolated testing of the MCP layer
without a full API restart. Auth is per-request on the standalone server too.
Point an MCP client at `POST http://localhost:3100/mcp` and include
`Authorization: Bearer <key>` on every JSON-RPC request (`x-agent-key` still
works). Mint a scoped key with the smoke-test steps below.

> **Production note:** in production, `/mcp` is served by the API Express app
> on port 3001 (no separate MCP process). The standalone `:3100` server is a
> dev-only convenience.

To run the single-tenant stdio server instead:

```bash
MEAL_PLANNER_API_BASE_URL=http://localhost:3001 \
MEAL_PLANNER_AGENT_KEY=your-agent-key \
MEAL_PLANNER_FAMILY_ID=your-family-id \
pnpm --filter @meal-planner/mcp run dev:stdio
```

### Hosted HTTP server

Start the multi-tenant hosted server (no key/family at boot):

```bash
pnpm --filter @meal-planner/mcp run build

MEAL_PLANNER_API_BASE_URL=http://localhost:3001 \
MEAL_PLANNER_MCP_PORT=3100 \
node packages/mcp/dist/http.js
# or, from source:  pnpm --filter @meal-planner/mcp run dev:http
```

Clients then POST JSON-RPC to `http://<host>:3100/mcp`, passing their scoped key
on **every** request (`Authorization: Bearer <key>` preferred; `x-agent-key`
accepted for backward compatibility) and an
`Accept: application/json, text/event-stream` header (per the Streamable HTTP
spec). No family id is ever sent by the client — the server resolves it from the
key. Unauthenticated/invalid requests get `401` with a
`WWW-Authenticate: Bearer realm="meal-planner-mcp"` challenge (and
`error="invalid_token"` for invalid/revoked keys); scope denials return `403`
with `error="insufficient_scope"`.

The hosted transport also exposes unauthenticated resource metadata at:

```bash
curl -s http://localhost:3100/.well-known/oauth-protected-resource
```

Example round-trip with `curl`:

```bash
KEY=your-agent-key
ACCEPT="application/json, text/event-stream"

# initialize (per-request auth: valid key -> 200, missing/invalid -> 401)
curl -s -H "Authorization: Bearer $KEY" -H "content-type: application/json" -H "accept: $ACCEPT" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"0"}}}' \
  http://localhost:3100/mcp

# call a family-from-key tool — the family is derived from the key
curl -s -H "Authorization: Bearer $KEY" -H "content-type: application/json" -H "accept: $ACCEPT" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_current_grocery_list","arguments":{}}}' \
  http://localhost:3100/mcp

# legacy header still works (Bearer takes precedence when both are present)
curl -s -H "x-agent-key: $KEY" -H "content-type: application/json" -H "accept: $ACCEPT" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}' \
  http://localhost:3100/mcp

# liveness probe (no auth)
curl -s http://localhost:3100/health

# OAuth-protected-resource metadata (no auth)
curl -s http://localhost:3100/.well-known/oauth-protected-resource
```

The transport runs **stateless** (a fresh MCP server + transport per request),
so each POST is self-contained and independently authenticated; an out-of-scope
tool call comes back as a tool error (`isError: true`,
`API error 403: Insufficient scope`) rather than a protocol error.

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
| `dev` | Run the **hosted HTTP** server from source with `tsx watch` (what root `pnpm dev` runs). Boots without secrets on `:3100`; auth is per-request. |
| `dev:stdio` | Run the **stdio** server from source with `tsx watch` (requires `MEAL_PLANNER_AGENT_KEY` + `MEAL_PLANNER_FAMILY_ID`). |
| `dev:http` | Run the hosted HTTP server from source with `tsx watch` (raw; set `MEAL_PLANNER_API_BASE_URL` yourself). |
| `start` | Run the built stdio server (`dist/index.js`). |
| `start:http` | Run the built hosted HTTP server (`dist/http.js`). |
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
