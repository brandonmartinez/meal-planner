# Project Context

- **Project:** meal-planner
- **Created:** 2026-06-30

## Core Context

Agent Scribe initialized and ready for work.

## Recent Updates

📌 Team initialized on 2026-06-30

## Learnings

Initial setup complete.


📌 Team update (2026-07-28T11:52:00-04:00): Age-only archival can evict load-bearing rules. `## Standing Policy` is now the durable-memory mechanism: promote still-true rules/contracts there, archive only old non-durable entries outside it, and report pressure instead of deleting durable content to satisfy byte ceilings. — logged by Scribe

📌 Team update (2026-07-28T13:55:00-04:00): Reporting the archive pressure condition instead of force-fitting the byte target was the correct call; it exposed that the gate measured unarchivable Standing Policy bytes and drove the `archivable_bytes` fix. — logged by Scribe
