---
name: "agent-collaboration"
description: "Standard collaboration patterns for all squad agents — worktree awareness, decisions, cross-agent communication"
domain: "team-workflow"
confidence: "high"
source: "extracted from charter boilerplate — identical content in 18+ agent charters"
---

## Context

Every agent on the team follows identical collaboration patterns for worktree awareness, decision recording, and cross-agent communication. These were previously duplicated in every charter's Collaboration section (~300 bytes × 18 agents = ~5.4KB of redundant context). Now centralized here.

The coordinator's spawn prompt already instructs agents to read decisions.md and their history.md. This skill adds the patterns for WRITING decisions and requesting help.

## Patterns

### Worktree Awareness
Use the `TEAM ROOT` path provided in your spawn prompt. All `.squad/` paths are relative to this root. If TEAM ROOT is not provided (rare), run `git rev-parse --show-toplevel` as fallback. Never assume CWD is the repo root.

### Decision Recording
After making a decision that affects other team members, write it to:
`.squad/decisions/inbox/{your-name}-{brief-slug}.md`

Format:
```
### {date}: {decision title}
**By:** {Your Name}
**What:** {the decision}
**Why:** {rationale}
```

### Issue Capture (substantial work)
Every substantial change MUST have a GitHub issue **before** work starts. "Substantial" = more than a few lines of code, or touching multiple files. Trivial one-liners (typo, single-value tweak) are exempt.

- The coordinator opens the issue up front, applies the right labels (`type:feature`/`type:bug`/`type:chore`, plus the owning `squad:{name}` label), and passes the issue number into the spawn prompt.
- Agents reference the issue in the branch name (`squad/{issue}-{slug}`), commits, and PR body (`Closes #N`) so the issue auto-closes on merge.
- If you discover mid-task that scope has grown beyond a trivial fix and no issue exists, flag it to the coordinator so one gets created before the PR opens.

### Cross-Agent Communication
If you need another team member's input, say so in your response. The coordinator will bring them in. Don't try to do work outside your domain.

### Reviewer Protocol
If you have reviewer authority and reject work: the original author is locked out from revising that artifact. A different agent must own the revision. State who should revise in your rejection response.

## Anti-Patterns
- Don't read all agent charters — you only need your own context + decisions.md
- Don't write directly to `.squad/decisions.md` — always use the inbox drop-box
- Don't modify other agents' history.md files — that's Scribe's job
- Don't assume CWD is the repo root — always use TEAM ROOT
- Don't start substantial work (multi-file or more than a few lines) without a GitHub issue — capture it first
