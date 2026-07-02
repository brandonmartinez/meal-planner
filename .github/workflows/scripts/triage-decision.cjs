'use strict';

// Pure triage decision logic for the Squad Triage workflow.
//
// This module is intentionally free of any GitHub API / Actions dependencies so
// it can be unit-tested with plain Node (see triage-decision.test.cjs). The
// workflow (.github/workflows/squad-triage.yml) `require()`s `decide()` and then
// performs the side effects (label writes, comment) based on the returned plan.
//
// Owner selection is DERIVED FROM .squad/routing.md (the single source of truth
// for who owns each work type). Each detected domain maps to a "Work Type" row in
// routing.md; the primary member named in that row's "Route To" cell becomes the
// owner. If routing.md is missing, malformed, or lacks a matching row (format
// drift), we fall back to matching a member by role in .squad/team.md so triage
// keeps working. See #121.

function slugify(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Parse the Members / Team Roster table from team.md into [{ name, role }].
function parseMembers(teamMd) {
  const members = [];
  if (!teamMd) return members;
  const lines = teamMd.split('\n');
  let inMembersTable = false;
  for (const line of lines) {
    if (line.match(/^##\s+(Members|Team Roster)/i)) {
      inMembersTable = true;
      continue;
    }
    if (inMembersTable && line.startsWith('## ')) break;
    if (inMembersTable && line.startsWith('|') && !line.includes('---') && !line.includes('Name')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2 && cells[0] !== 'Scribe') {
        members.push({ name: cells[0], role: cells[1] });
      }
    }
  }
  return members;
}

// Parse the "Routing Table" from routing.md into { workTypeLower: primaryMemberName }.
// The "Route To" cell may read e.g. "Saul (with Livingston)" — we strip
// parentheticals and take the first name token as the primary owner.
function parseRoutingTable(routingMd) {
  const map = {};
  if (!routingMd) return map;
  const lines = routingMd.split('\n');
  let inTable = false;
  for (const line of lines) {
    if (line.match(/^##\s+Routing Table/i)) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith('## ')) break;
    if (inTable && line.startsWith('|') && !line.includes('---')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        const workType = cells[0].toLowerCase();
        if (workType === 'work type') continue; // header row
        const routeTo = cells[1].replace(/\(.*?\)/g, ' ').trim(); // drop "(with X)"
        const primary = routeTo.split(/[\s,/]+/).filter(Boolean)[0];
        if (primary) map[workType] = primary;
      }
    }
  }
  return map;
}

// @copilot capability tiers, parsed from team.md (with the workflow's historical
// defaults when the profile block is absent).
function parseCopilotProfile(teamMd) {
  const goodFitMatch = teamMd.match(/🟢\s*Good fit[^:]*:\s*(.+)/i);
  const needsReviewMatch = teamMd.match(/🟡\s*Needs review[^:]*:\s*(.+)/i);
  const notSuitableMatch = teamMd.match(/🔴\s*Not suitable[^:]*:\s*(.+)/i);

  const goodFitKeywords = goodFitMatch
    ? goodFitMatch[1].toLowerCase().split(',').map((s) => s.trim())
    : ['bug fix', 'test coverage', 'lint', 'format', 'dependency update', 'small feature', 'scaffolding', 'doc fix', 'documentation'];
  const needsReviewKeywords = needsReviewMatch
    ? needsReviewMatch[1].toLowerCase().split(',').map((s) => s.trim())
    : ['medium feature', 'refactoring', 'api endpoint', 'migration'];
  const notSuitableKeywords = notSuitableMatch
    ? notSuitableMatch[1].toLowerCase().split(',').map((s) => s.trim())
    : ['architecture', 'system design', 'security', 'auth', 'encryption', 'performance'];

  return { goodFitKeywords, needsReviewKeywords, notSuitableKeywords };
}

// Domains in priority order (first keyword match wins). `workType` is looked up
// (case-insensitively) against the parsed routing.md table to pick the owner;
// `fallbackRole` matches a member by role in team.md when routing.md has no row.
//
// NOTE (#121): the `data` domain is ordered BEFORE `backend` so genuine
// schema/migration work reaches Saul instead of the generic backend branch.
// "database" now lives on the data branch (previously it routed to backend).
// "auth" intentionally stays on the backend branch to preserve prior behavior;
// a dedicated Security/Auth branch is out of scope for #121.
const DOMAINS = [
  {
    id: 'frontend',
    workType: 'frontend / ui',
    keywords: ['ui', 'frontend', 'css', 'component', 'button', 'page', 'layout', 'design'],
    fallbackRole: (r) => r.includes('frontend') || r.includes('ui'),
    reason: 'Issue relates to frontend/UI work',
  },
  {
    id: 'data',
    workType: 'database / schema',
    keywords: ['schema', 'migration', 'migrate', 'prisma', 'seed', 'data integrity', 'database'],
    fallbackRole: (r) => r.includes('data') || r.includes('migration'),
    reason: 'Issue relates to data/schema/migration work',
  },
  {
    id: 'backend',
    workType: 'backend / api',
    keywords: ['api', 'backend', 'endpoint', 'server', 'auth'],
    fallbackRole: (r) => r.includes('backend') || r.includes('api') || r.includes('server'),
    reason: 'Issue relates to backend/API work',
  },
  {
    id: 'testing',
    workType: 'testing',
    keywords: ['test', 'bug', 'fix', 'regression', 'coverage'],
    fallbackRole: (r) => r.includes('test') || r.includes('qa') || r.includes('quality'),
    reason: 'Issue relates to testing/quality work',
  },
  {
    id: 'devops',
    workType: 'infra / devops',
    keywords: ['deploy', 'ci', 'pipeline', 'docker', 'infrastructure'],
    fallbackRole: (r) => r.includes('devops') || r.includes('infra') || r.includes('ops'),
    reason: 'Issue relates to DevOps/infrastructure work',
  },
];

function normalizeLabels(labels) {
  return (labels || [])
    .map((l) => (typeof l === 'string' ? l : l && l.name))
    .filter(Boolean);
}

// Compute the full triage plan. Returns an object describing WHO the owner is and
// WHICH side effects the workflow should apply (owner label, go verdict, etc.).
function decide({ issueTitle = '', issueBody = '', labels = [], teamMd = '', routingMd = '' } = {}) {
  const members = parseMembers(teamMd);
  const hasCopilot = teamMd.includes('🤖 Coding Agent');
  const copilotAutoAssign = teamMd.includes('<!-- copilot-auto-assign: true -->');

  const lead = members.find((m) => {
    const r = m.role.toLowerCase();
    return r.includes('lead') || r.includes('architect') || r.includes('coordinator');
  });

  const normLabels = normalizeLabels(labels);
  // The base "inbox" label is exactly "squad" (no colon); owner labels are
  // "squad:<member>". startsWith('squad:') therefore excludes the base label.
  const existingOwnerLabel = normLabels.find((n) => n.startsWith('squad:')) || null;
  const existingGoLabel = normLabels.find((n) => n.startsWith('go:')) || null;

  if (!lead) {
    return { ok: false, error: 'no-lead', members, hasCopilot };
  }

  const routingMap = parseRoutingTable(routingMd);
  const issueText = `${issueTitle}\n${issueBody || ''}`.toLowerCase();

  let assignedMember = null;
  let triageReason = '';
  let copilotTier = null;
  let ownerPreAssigned = false;
  let ownerSource = null;

  if (existingOwnerLabel) {
    // Idempotency: an owner is already set — respect it, do not add a second.
    ownerPreAssigned = true;
    ownerSource = 'pre-assigned';
    const slug = existingOwnerLabel.slice('squad:'.length);
    if (slug === 'copilot') {
      assignedMember = { name: '@copilot', role: 'Coding Agent' };
    } else {
      assignedMember = members.find((m) => slugify(m.name) === slug) || { name: slug, role: 'unknown' };
    }
    triageReason = `Owner was pre-assigned (\`${existingOwnerLabel}\`) — triage respected it and made no owner change.`;
  } else {
    // 1) Evaluate @copilot fit first (unchanged behavior).
    if (hasCopilot) {
      const { goodFitKeywords, needsReviewKeywords, notSuitableKeywords } = parseCopilotProfile(teamMd);
      const isNotSuitable = notSuitableKeywords.some((kw) => issueText.includes(kw));
      const isGoodFit = !isNotSuitable && goodFitKeywords.some((kw) => issueText.includes(kw));
      const isNeedsReview = !isNotSuitable && !isGoodFit && needsReviewKeywords.some((kw) => issueText.includes(kw));

      if (isGoodFit) {
        copilotTier = 'good-fit';
        assignedMember = { name: '@copilot', role: 'Coding Agent' };
        triageReason = '🟢 Good fit for @copilot — matches capability profile';
        ownerSource = 'copilot';
      } else if (isNeedsReview) {
        copilotTier = 'needs-review';
        assignedMember = { name: '@copilot', role: 'Coding Agent' };
        triageReason = '🟡 Routing to @copilot (needs review) — a squad member should review the PR';
        ownerSource = 'copilot';
      } else if (isNotSuitable) {
        copilotTier = 'not-suitable';
        // fall through to keyword routing
      }
    }

    // 2) Keyword → domain → routing.md owner (with role-match drift fallback).
    if (!assignedMember) {
      for (const domain of DOMAINS) {
        if (!domain.keywords.some((kw) => issueText.includes(kw))) continue;

        let member = null;
        let source = null;
        const primaryName = routingMap[domain.workType];
        if (primaryName) {
          member = members.find((m) => m.name.toLowerCase() === primaryName.toLowerCase()) || null;
          if (member) source = 'routing.md';
        }
        if (!member) {
          member = members.find((m) => domain.fallbackRole(m.role.toLowerCase())) || null;
          if (member) source = 'roster-role';
        }
        if (member) {
          assignedMember = member;
          ownerSource = source;
          triageReason = source === 'routing.md'
            ? `${domain.reason} — owner selected from .squad/routing.md`
            : `${domain.reason} — owner selected from team roster (no matching .squad/routing.md row)`;
          break;
        }
      }
    }

    // 3) Default to Lead.
    if (!assignedMember) {
      assignedMember = lead;
      ownerSource = 'lead-default';
      triageReason = 'No specific domain match — assigned to Lead for further analysis';
    }
  }

  const isCopilot = assignedMember.name === '@copilot';
  const assignLabel = isCopilot ? 'squad:copilot' : `squad:${slugify(assignedMember.name)}`;

  return {
    ok: true,
    members,
    lead,
    hasCopilot,
    copilotAutoAssign,
    assignedMember,
    assignLabel,
    triageReason,
    copilotTier,
    isCopilot,
    ownerPreAssigned,
    ownerSource,
    existingOwnerLabel,
    existingGoLabel,
    // Side-effect plan for the workflow:
    applyOwnerLabel: !ownerPreAssigned,
    applyGoNeedsResearch: !existingGoLabel,
    // Only (re)assign the @copilot user when we routed to it THIS run.
    applyCopilotAssignee: isCopilot && !ownerPreAssigned,
  };
}

module.exports = {
  decide,
  slugify,
  parseMembers,
  parseRoutingTable,
  parseCopilotProfile,
  DOMAINS,
};
