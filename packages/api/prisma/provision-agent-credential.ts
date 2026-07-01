/**
 * Dev/CI helper: mint a scoped MCP **agent credential** for the seeded demo
 * family and print it once as JSON. This is the CLI equivalent of the
 * parent-facing `POST /api/families/:familyId/agent-credentials` route — it
 * calls the SAME `createAgentCredential` service, so the credential is stored
 * hashed-only (keyed HMAC via `CREDENTIAL_PEPPER`) exactly as in production.
 *
 * It exists so a local/CI smoke test (issue #77) can obtain a real, scope-limited
 * key without standing up the browser/JWT auth flow. It is NOT part of the app
 * build (`tsc` only compiles `src/`), and it NEVER persists the raw key — the
 * key is emitted once on stdout, the same one-time contract the service and the
 * real HTTP route follow.
 *
 * Usage (inside the devcontainer):
 *   tsx prisma/provision-agent-credential.ts [scope ...]
 *
 * Examples:
 *   # default: read + schedule (deliberately NOT approve, to prove enforcement)
 *   tsx prisma/provision-agent-credential.ts
 *   # explicit scopes
 *   tsx prisma/provision-agent-credential.ts meal_plan:read meal_plan:approve
 *
 * Output (stdout, single line of JSON):
 *   {"familyId":"...","credentialId":"...","name":"...","scopes":[...],"key":"<raw key — shown once>"}
 *
 * SECURITY: the raw key is a secret. Capture it into an ephemeral location
 * (e.g. an env var or a file under /tmp) — never commit it, never log it into
 * a durable artifact. It cannot be retrieved again after this run.
 */
import prisma from "../src/config/database.js";
import { DEMO_FAMILY_NAME } from "../src/config/demo.js";
import {
  createAgentCredential,
  isAgentScope,
  type AgentScope,
} from "../src/services/agentCredential.js";

const DEFAULT_SCOPES: AgentScope[] = ["meal_plan:read", "meal_plan:schedule"];

async function main(): Promise<void> {
  const argScopes = process.argv.slice(2);
  const scopes: AgentScope[] =
    argScopes.length > 0 ? (argScopes as string[]).map(assertScope) : DEFAULT_SCOPES;

  // Resolve the seeded demo family by its (fixed, non-secret) name. Run the
  // seed first if this throws.
  const family = await prisma.family.findFirst({
    where: { name: DEMO_FAMILY_NAME },
    select: { id: true },
  });
  if (!family) {
    throw new Error(
      `Demo family "${DEMO_FAMILY_NAME}" not found — run \`pnpm --filter @meal-planner/api run db:seed\` first.`,
    );
  }

  // Attribute the credential to a real parent in the family (the service records
  // `createdBy` as the provisioning parent; agent-scheduled suggestions are
  // attributed to this user while the audit trail records the credential).
  const parent = await prisma.familyMember.findFirst({
    where: { familyId: family.id, role: "PARENT" },
    select: { userId: true },
  });
  if (!parent) {
    throw new Error(`No PARENT member found for family ${family.id}.`);
  }

  const credential = await createAgentCredential(
    family.id,
    parent.userId,
    `smoke-test agent (${new Date().toISOString()})`,
    scopes,
  );

  // Single line of JSON on stdout — the raw key appears exactly once.
  process.stdout.write(
    JSON.stringify({
      familyId: family.id,
      credentialId: credential.id,
      name: credential.name,
      scopes: credential.scopes,
      key: credential.key,
    }) + "\n",
  );
}

function assertScope(value: string): AgentScope {
  if (!isAgentScope(value)) {
    throw new Error(
      `Invalid scope "${value}". Valid scopes: meal_plan:read, meal_plan:schedule, meal_plan:approve.`,
    );
  }
  return value;
}

main()
  .catch((err) => {
    // Never echo argv/secrets — just the message.
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
