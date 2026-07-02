'use strict';

// Fixture test for triage-decision.cjs (#121). No test framework — plain Node
// `assert`, runnable with `node triage-decision.test.cjs`. Reads the REAL
// .squad/team.md and .squad/routing.md so the assertions validate against the
// live roster/routing single source of truth, plus a synthetic @copilot roster
// for the capability-tier path (this project's team has no @copilot).
//
// Run (inside the devcontainer, per project hard constraint):
//   docker exec -u node -w /workspace devcontainer-app-1 bash -lc \
//     'node .github/workflows/scripts/triage-decision.test.cjs'

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  decide,
  slugify,
  parseMembers,
  parseRoutingTable,
} = require('./triage-decision.cjs');

const repoRoot = path.resolve(__dirname, '../../../');
const teamMd = fs.readFileSync(path.join(repoRoot, '.squad/team.md'), 'utf8');
const routingMd = fs.readFileSync(path.join(repoRoot, '.squad/routing.md'), 'utf8');

// A synthetic roster that DOES include @copilot, to exercise the capability
// tier evaluation. Mirrors the team.md table shape the parser expects.
const copilotTeamMd = `# Squad Team

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Rusty | Lead / Architect | x | active |
| Saul | Data / Migrations | x | active |
| @copilot | 🤖 Coding Agent | copilot-instructions.md | active |

<!-- copilot-auto-assign: true -->

@copilot capability profile:
- 🟢 Good fit: bug fix, test coverage, lint, documentation
- 🟡 Needs review: medium feature, refactoring, api endpoint, migration
- 🔴 Not suitable: architecture, security, auth, performance
`;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('triage-decision.cjs fixtures\n');

// --- Helpers ---------------------------------------------------------------

test('slugify handles names and @copilot', () => {
  assert.strictEqual(slugify('Saul'), 'saul');
  assert.strictEqual(slugify('Fact Checker'), 'fact-checker');
});

test('parseMembers reads roster (Saul present, Scribe excluded)', () => {
  const members = parseMembers(teamMd);
  const names = members.map((m) => m.name);
  assert.ok(names.includes('Saul'), 'Saul should be parsed');
  assert.ok(names.includes('Livingston'), 'Livingston should be parsed');
  assert.ok(!names.includes('Scribe'), 'Scribe should be excluded');
  const saul = members.find((m) => m.name === 'Saul');
  assert.strictEqual(saul.role, 'Data / Migrations');
});

test('parseRoutingTable maps work types to primary owner', () => {
  const map = parseRoutingTable(routingMd);
  assert.strictEqual(map['database / schema'], 'Saul', 'strips "(with Livingston)"');
  assert.strictEqual(map['backend / api'], 'Livingston');
  assert.strictEqual(map['frontend / ui'], 'Linus');
  assert.strictEqual(map['infra / devops'], 'Basher');
});

// --- Bug 1: idempotency / non-clobbering -----------------------------------

test('AC1: pre-assigned squad:frank owner is respected (no second owner)', () => {
  const plan = decide({
    issueTitle: 'Some backend issue',
    issueBody: 'Touches the api endpoint',
    labels: ['squad', 'squad:frank'],
    teamMd,
    routingMd,
  });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.ownerPreAssigned, true);
  assert.strictEqual(plan.applyOwnerLabel, false, 'must NOT add a second owner label');
  assert.strictEqual(plan.existingOwnerLabel, 'squad:frank');
  assert.strictEqual(plan.assignedMember.name, 'Frank', 'resolves member from label for the comment');
  assert.strictEqual(plan.applyCopilotAssignee, false);
});

test('base "squad" label alone is NOT treated as a pre-assigned owner', () => {
  const plan = decide({
    issueTitle: 'Frontend button broken',
    issueBody: 'The UI component needs a fix',
    labels: ['squad'],
    teamMd,
    routingMd,
  });
  assert.strictEqual(plan.ownerPreAssigned, false);
  assert.strictEqual(plan.applyOwnerLabel, true);
});

test('AC2: pre-existing go:yes verdict is left as-is (no go:needs-research)', () => {
  const plan = decide({
    issueTitle: 'Prisma schema change',
    issueBody: 'Add a migration',
    labels: ['squad', 'go:yes'],
    teamMd,
    routingMd,
  });
  assert.strictEqual(plan.existingGoLabel, 'go:yes');
  assert.strictEqual(plan.applyGoNeedsResearch, false, 'must NOT add go:needs-research');
});

test('AC5b: go:needs-research default applies when no go:* label exists', () => {
  const plan = decide({
    issueTitle: 'Prisma schema change',
    issueBody: 'Add a migration',
    labels: ['squad'],
    teamMd,
    routingMd,
  });
  assert.strictEqual(plan.existingGoLabel, null);
  assert.strictEqual(plan.applyGoNeedsResearch, true);
});

// --- Bug 2 + Bug 3: Saul routing derived from routing.md -------------------

test('AC3: schema/migration/seed issue routes to Saul via routing.md', () => {
  const plan = decide({
    issueTitle: 'Update Prisma schema for meal ordering',
    issueBody: 'Need a migration and updated seed data for data integrity.',
    labels: ['squad'],
    teamMd,
    routingMd,
  });
  assert.strictEqual(plan.assignLabel, 'squad:saul');
  assert.strictEqual(plan.assignedMember.name, 'Saul');
  assert.strictEqual(plan.ownerSource, 'routing.md', 'owner derived from routing.md');
  assert.strictEqual(plan.applyOwnerLabel, true);
  assert.strictEqual(plan.applyGoNeedsResearch, true);
});

test('AC4: owner selection derived from routing.md for backend too', () => {
  const plan = decide({
    issueTitle: 'Add api endpoint for meal search',
    issueBody: 'New Express route and service.',
    labels: ['squad'],
    teamMd,
    routingMd,
  });
  assert.strictEqual(plan.assignedMember.name, 'Livingston');
  assert.strictEqual(plan.ownerSource, 'routing.md');
});

test('behavior change: "database" keyword now routes to Saul (data), not backend', () => {
  const plan = decide({
    issueTitle: 'Database integrity concern',
    issueBody: 'The database has orphaned rows.',
    labels: ['squad'],
    teamMd,
    routingMd,
  });
  assert.strictEqual(plan.assignedMember.name, 'Saul', 'database now lives on the data branch');
});

// --- Bug 3: drift guard — routing.md missing/malformed ---------------------

test('AC4b: routing.md absent → schema still reaches Saul via roster-role fallback', () => {
  const plan = decide({
    issueTitle: 'Prisma migration needed',
    issueBody: 'Schema change.',
    labels: ['squad'],
    teamMd,
    routingMd: '', // simulate missing/blank routing.md (format drift)
  });
  assert.strictEqual(plan.assignedMember.name, 'Saul');
  assert.strictEqual(plan.ownerSource, 'roster-role', 'falls back to team.md role match');
});

// --- @copilot capability tier preserved ------------------------------------

test('AC5a: @copilot good-fit routes to @copilot when on roster', () => {
  const plan = decide({
    issueTitle: 'Fix lint and add test coverage',
    issueBody: 'A small bug fix with documentation.',
    labels: ['squad'],
    teamMd: copilotTeamMd,
    routingMd,
  });
  assert.strictEqual(plan.hasCopilot, true);
  assert.strictEqual(plan.isCopilot, true);
  assert.strictEqual(plan.assignLabel, 'squad:copilot');
  assert.strictEqual(plan.copilotTier, 'good-fit');
  assert.strictEqual(plan.copilotAutoAssign, true);
  assert.strictEqual(plan.applyCopilotAssignee, true);
});

test('@copilot not-suitable (security) falls through to a squad member', () => {
  const plan = decide({
    issueTitle: 'Security auth review',
    issueBody: 'Review the auth chain and JWT handling.',
    labels: ['squad'],
    teamMd: copilotTeamMd,
    routingMd,
  });
  assert.strictEqual(plan.copilotTier, 'not-suitable');
  assert.strictEqual(plan.isCopilot, false);
});

test('@copilot auto-assign is NOT re-applied when owner was pre-assigned', () => {
  const plan = decide({
    issueTitle: 'Fix lint',
    issueBody: 'small bug fix',
    labels: ['squad', 'squad:copilot'],
    teamMd: copilotTeamMd,
    routingMd,
  });
  assert.strictEqual(plan.ownerPreAssigned, true);
  assert.strictEqual(plan.applyOwnerLabel, false);
  assert.strictEqual(plan.applyCopilotAssignee, false, 'no re-assign on pre-assigned copilot owner');
});

// --- Edge: no lead -> abort ------------------------------------------------

test('no Lead in roster → ok:false with error "no-lead"', () => {
  const plan = decide({
    issueTitle: 'x',
    issueBody: 'y',
    labels: ['squad'],
    teamMd: '## Members\n\n| Name | Role |\n|---|---|\n| Bob | Widget Polisher |\n',
    routingMd,
  });
  assert.strictEqual(plan.ok, false);
  assert.strictEqual(plan.error, 'no-lead');
});

// --- Default to Lead -------------------------------------------------------

test('unmatched issue defaults to Lead (Rusty)', () => {
  const plan = decide({
    issueTitle: 'Ponder the meaning of meals',
    issueBody: 'No obvious domain keywords here.',
    labels: ['squad'],
    teamMd,
    routingMd,
  });
  assert.strictEqual(plan.assignedMember.name, 'Rusty');
  assert.strictEqual(plan.ownerSource, 'lead-default');
});

console.log(`\n${passed} passed`);
