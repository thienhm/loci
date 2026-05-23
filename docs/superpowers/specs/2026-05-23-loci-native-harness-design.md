# Loci-Native Harness Engineering Design

**Date:** 2026-05-23
**Status:** Draft for review
**Ticket:** LCI-044

## Summary

Loci should evolve from local-first AI ticket management into a local-first harness engineering kit for human and AI-agent collaboration.

The new Loci combines:

- Current Loci ticket management.
- Harness-style project context documentation.
- Rust CLI workflows.
- SQLite durable operational records.
- Validation, evidence, traces, decisions, and harness improvement loops.
- A global dashboard that can show all registered local projects.

This design is Loci-native. It does not aim for file-structure compatibility or migration compatibility with `hoangnb24/harness-experimental`, but it should meet the same quality baseline in a productized Loci form.

## Product Principles

1. **Harness is what Loci is.**
   Harness workflows should use top-level commands such as `loci init` and `loci doctor`, not nested commands such as `loci harness init`.

2. **Local-first per project, globally visible through a registry.**
   Each project owns its Loci data. The global registry only helps discover and summarize projects.

3. **Markdown is the collaboration surface.**
   Humans and agents should be able to read, edit, review, and commit project context and story packets.

4. **SQLite is the operational memory.**
   Loci should use SQLite for status, queries, dashboard summaries, evidence, traces, decisions, and migration state.

5. **Proof beats confidence.**
   Work should move to review only when validation evidence, skipped-check reasoning, and trace records are present.

6. **The harness grows from friction.**
   Missing docs, unclear validation, repeated agent mistakes, or workflow gaps should become harness backlog items or direct harness improvements.

## Folder Model

Use a visible `loci/` folder for shared human/agent collaboration docs, a hidden per-project `.loci/` folder for operational state, and a global `~/.loci/` folder for registry and user-level state.

```text
my-project/
  AGENTS.md
  LOCI.md

  loci/
    project.md
    architecture.md
    validation.md
    guardrails.md
    current-state.md
    glossary.md
    backlog.md
    decisions/
    templates/
    tickets/
      LCI-001/
        story.md
        design.md
        plan.md
        validation.md
        evidence.md
        summary.md
        lessons.md
        harness-delta.md

  .loci/
    loci.db
    config.toml
    logs/
    cache/

~/.loci/
  registry.db
  config.toml
  binaries/
  templates/
```

Rules:

- `loci/` is the shared workspace for humans and agents.
- `.loci/` is project-local operational state managed by Loci.
- `~/.loci/` is the global registry and user-level configuration.

## Core Product Layers

### 1. Project Harness

The project harness stores durable project context:

- Product/project intent.
- Architecture notes.
- Validation matrix.
- Guardrails.
- Current state.
- Glossary.
- Decision records.
- Harness backlog.
- Templates.

These files answer: "What should an agent know before touching code?"

### 2. Story/Ticket Workflow

Current Loci tickets become structured story packets.

Each ticket should capture:

- Intent.
- Scope.
- Out of scope.
- Context links.
- Acceptance criteria.
- Risk lane.
- Validation requirements.
- Implementation plan.
- Evidence.
- Summary.
- Lessons or harness delta.

### 3. Operational Memory

SQLite records provide durable operational memory:

- Ticket/story state.
- Intake classifications.
- Readiness state.
- Validation state.
- Evidence records.
- Trace records.
- Decision index and verification status.
- Harness backlog items.
- Document index and checksums.
- Dashboard summary data.

## Ticket Lifecycle

Use this lifecycle:

```text
idea -> shaped -> ready -> in_progress -> in_review -> done
```

Meanings:

- `idea`: rough task exists.
- `shaped`: intent, scope, out-of-scope, and acceptance criteria are clear.
- `ready`: enough context and validation requirements exist for an agent or human to start.
- `in_progress`: someone is actively working.
- `in_review`: implementation is complete and evidence is attached.
- `done`: human accepted the result.

Important rule:

```text
idea is not necessarily executable.
ready means the story packet is executable.
```

The UI may offer a compact board view:

```text
Backlog | Ready | In Progress | Review | Done
```

The data model should keep the richer lifecycle.

## Risk Lanes And Intake

Every implementation prompt should pass through intake before code changes.

Input types:

- `new_spec`
- `spec_slice`
- `change_request`
- `new_initiative`
- `maintenance`
- `harness_improvement`

Risk lanes:

- `tiny`
- `normal`
- `high_risk`

Risk flags:

- Auth.
- Authorization.
- Data model.
- Audit/security.
- External systems.
- Public contracts.
- Cross-platform.
- Existing behavior.
- Weak proof.
- Multi-domain.

Lane requirements:

- `tiny`: direct narrow change, quick checks, update docs if friction appears.
- `normal`: story packet, linked context, validation expectations, proof status.
- `high_risk`: story folder with design and validation, stronger proof, human confirmation when direction is ambiguous, decision record when behavior or architecture changes.

## Validation, Evidence, And Traces

Validation should be first-class.

Validation layers:

- Unit.
- Integration.
- E2E.
- UI.
- Accessibility.
- Performance.
- Security.
- Logs/audit.
- Manual.
- Release.

Validation states:

- `not_required`
- `missing`
- `partial`
- `passing`
- `failing`
- `skipped`

Evidence types:

- `command`
- `screenshot`
- `log`
- `manual_check`
- `test_report`
- `link`
- `note`

Trace records should capture:

- Task summary.
- Actor.
- Intake.
- Ticket/story.
- Actions taken.
- Files read.
- Files changed.
- Commands run.
- Errors.
- Decisions made.
- Outcome.
- Friction.
- Notes.

Done rule:

```text
No ticket moves to in_review without evidence and a trace, unless the reason is explicitly recorded.
No ticket moves to done without human confirmation.
```

## Agent Entry Files

Loci should not require runtime-specific skills in this version.

Required root files:

```text
AGENTS.md
LOCI.md
```

`AGENTS.md` should be a short stable shim:

- Read `LOCI.md`.
- Run `loci doctor`.
- For ticket work, run `loci get <ticket-id> --json`.
- Follow validation, evidence, and trace rules before review.

`LOCI.md` should be the generated operating guide:

- Folder structure.
- CLI commands.
- Ticket lifecycle.
- Intake rules.
- Risk lanes.
- Validation rules.
- Evidence rules.
- Trace rules.
- Done rules.
- Safety gates.

Loci should own marked generated sections:

```md
<!-- LOCI:BEGIN -->
Generated Loci operating guide.
<!-- LOCI:END -->
```

Human custom instructions should live outside those markers.

Runtime-specific skills are optional accelerators outside this version's required workflow. This version should work through files, CLI commands, SQLite records, and the dashboard.

## CLI Command Surface

Top-level workflow commands:

```bash
loci init
loci doctor
loci serve
loci open
loci update
loci upgrade
```

Ticket/story commands:

```bash
loci add "Title"
loci list
loci get LCI-001
loci status LCI-001 ready
loci patch LCI-001 --assignee agent:codex --priority high
loci shape LCI-001
loci plan LCI-001
loci ready LCI-001
```

Intake commands:

```bash
loci intake new
loci intake list
loci intake show <id>
loci intake promote <id>
```

Validation and evidence commands:

```bash
loci validate LCI-001
loci validate LCI-001 --run
loci evidence add LCI-001
loci evidence list LCI-001
loci evidence show <evidence-id>
```

Trace commands:

```bash
loci trace add LCI-001
loci trace list
loci trace show <trace-id>
```

Decision commands:

```bash
loci decision add
loci decision list
loci decision show <id>
loci decision verify <id>
```

Harness backlog commands:

```bash
loci backlog add
loci backlog list
loci backlog status <id> accepted
```

Template commands:

```bash
loci template list
loci template show story
loci template apply story LCI-001
```

Every agent-facing command should support `--json`.

### Update And Upgrade

`loci update` updates the Loci tool itself:

- Global binary.
- Web assets.
- Default templates.
- Global config if needed.

It must not automatically migrate project files.

`loci upgrade` upgrades the current project workspace:

- Project `loci/` docs.
- Project `.loci/` database.
- SQLite migrations.
- Project config.
- Generated templates.

Flags:

```bash
loci upgrade --dry-run
loci upgrade --yes
loci upgrade --all --dry-run
```

Rule:

```text
loci update  = update the tool
loci upgrade = upgrade project data
```

## SQLite Schema Boundaries

Each project has:

```text
.loci/loci.db
```

Core tables:

- `schema_version`
- `project`
- `ticket`
- `intake`
- `evidence`
- `trace`
- `decision`
- `backlog`
- `document`
- `template`

The global registry has:

```text
~/.loci/registry.db
```

Core global tables:

- `registered_project`
- `global_config`
- `binary_cache`
- `template_pack`

Boundary:

```text
Markdown stores narrative content.
SQLite stores operational state, indexes, and history.
```

Examples:

- `loci/tickets/LCI-001/story.md` stores the story narrative.
- `ticket.story_path` stores the path and status metadata.
- `loci/decisions/0001-title.md` stores the decision narrative.
- `decision.doc_path` stores the path, status, verification command, and verification result.

## Web Dashboard

`loci serve` should launch a global dashboard.

Data flow:

```text
~/.loci/registry.db
  -> registered project paths
  -> each project/.loci/loci.db
  -> each project/loci/ docs when needed
  -> dashboard UI
```

Global dashboard surfaces:

- Projects.
- Review queue.
- Validation issues.
- Recent activity.

Project surfaces:

- Overview.
- Story board.
- Harness docs.
- Decisions.
- Backlog.
- Traces.
- Settings.

Ticket detail tabs:

- Story.
- Design.
- Plan.
- Validation.
- Evidence.
- Summary.
- Lessons.
- Trace.

The dashboard should be dense, calm, scannable, and operational. It should not feel like a marketing site.

## Workflow Gates

To move to `ready`, require:

- `story.md` exists.
- Intent exists.
- Scope exists.
- Acceptance criteria exist.
- `validation.md` exists.
- Risk lane is set.

For high-risk work, also require:

- `design.md` exists.
- Human approval when direction is ambiguous.

To move to `in_review`, require:

- `summary.md` exists.
- Evidence exists.
- Trace exists.
- Validation state is `passing`, `partial` with reason, or `skipped` with reason.

To move to `done`, require:

- Human confirmation.

## Doctor Checks

`loci doctor` should check:

- `AGENTS.md` exists and points to `LOCI.md`.
- `LOCI.md` exists and generated block is current.
- Required `loci/` docs exist.
- Project database exists and schema is current.
- Global registry includes the project.
- Tickets marked `ready` have required docs.
- Tickets in `in_review` have evidence and trace records.
- High-risk tickets have design docs.
- Validation artifacts still exist.
- Decision docs are indexed.
- Harness backlog exists.
- Legacy data needs upgrade.

## Legacy Upgrade

Current Loci projects store ticket data under `.loci/tickets/` as JSON and Markdown. The new system should migrate this safely.

Old:

```text
.loci/project.json
.loci/tickets/LCI-001/ticket.json
.loci/tickets/LCI-001/description.md
.loci/tickets/LCI-001/design.md
.loci/tickets/LCI-001/implementation_plan.md
.loci/tickets/LCI-001/summary.md
```

New:

```text
.loci/loci.db
loci/tickets/LCI-001/story.md
loci/tickets/LCI-001/design.md
loci/tickets/LCI-001/plan.md
loci/tickets/LCI-001/summary.md
```

Mapping:

- `project.json` -> `project` table and `.loci/config.toml`.
- `ticket.json` -> `ticket` table.
- `description.md` -> `story.md`.
- `implementation_plan.md` -> `plan.md`.
- `summary.md` -> `summary.md`.
- `attachments.json` -> document index entries; validation-specific artifact links can be created when an attachment is used as evidence.

Safety rules:

- Support `loci upgrade --dry-run`.
- Preserve old data during first upgrade.
- Write a migration report.
- Back up important files before structural changes.
- Preserve user-edited Markdown.

## Implementation Strategy

Recommended build order:

1. Rust CLI foundation and SQLite migrations.
2. Global registry database.
3. Visible `loci/` workspace generation.
4. Doctor checks.
5. Ticket/story model.
6. Intake and risk lanes.
7. Validation and evidence.
8. Decisions, traces, and harness backlog.
9. Legacy upgrade.
10. Web dashboard integration.
11. Update/upgrade release flow.

The CLI and database should define the product contract. The web UI should sit on top of that model.

## Out Of Scope For This Version

- Runtime-specific agent skills.
- Compatibility with `harness-experimental` file structure.
- Global-only project data storage.
- Automatic destructive migrations.
- Cloud sync.
- Multi-user hosted collaboration.

## Open Questions

1. Should generated `LOCI.md` include only command/workflow instructions, or also current project summary snippets?
2. Should `loci validate --run` execute commands in the first release, or only record expected proof and evidence?
3. Should the web dashboard edit Markdown directly in the first release, or start as a read/query surface over CLI-managed docs?
4. Should template packs be versioned globally, per project, or both?
