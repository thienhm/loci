use crate::domain::ProjectRecord;

pub const DEFAULT_TEMPLATE_PACK_ID: &str = "loci-default";
pub const DEFAULT_TEMPLATE_PACK_VERSION: &str = "1";

pub fn agents_md() -> String {
    r#"# Agent Instructions

Before working in this repo:

1. Read `LOCI.md`.
2. Run `loci doctor`.
3. For ticket work, run `loci get <ticket-id> --json`.
4. Read linked docs under `loci/`.
5. Record validation evidence before moving work to review.

<!-- LOCI:BEGIN -->
Loci manages the workflow instructions in `LOCI.md`.
<!-- LOCI:END -->
"#
    .to_string()
}

pub fn loci_md(project: &ProjectRecord) -> String {
    format!(
        r#"# Loci Operating Guide

<!-- LOCI:BEGIN -->
Project: {name}
Prefix: {prefix}

## Start Here

1. Run `loci doctor`.
2. For ticket work, run `loci get <ticket-id> --json`.
3. Read linked docs in `loci/tickets/<ticket-id>/`.
4. Do not move work to `in_review` without evidence and trace records.
5. Do not move work to `done` without human confirmation.

## Core Commands

```bash
loci init --name "My App" --prefix APP
loci doctor
loci list --json
loci get <ticket-id> --json
```

## Required Docs

- `loci/project.md`
- `loci/architecture.md`
- `loci/validation.md`
- `loci/guardrails.md`
- `loci/current-state.md`
- `loci/glossary.md`
<!-- LOCI:END -->
"#,
        name = project.name,
        prefix = project.prefix
    )
}

pub fn project_md(project: &ProjectRecord) -> String {
    format!(
        r#"# Project

## Name

{name}

## Ticket Prefix

{prefix}

## Problem

Describe the problem this project solves.

## Target Users

Describe who this project serves.

## Core Workflow

Describe the primary workflow.
"#,
        name = project.name,
        prefix = project.prefix
    )
}

pub fn architecture_md() -> &'static str {
    "# Architecture\n\n## Overview\n\nDescribe the current architecture.\n\n## Boundaries\n\nDescribe module boundaries and ownership rules.\n"
}

pub fn validation_md() -> &'static str {
    "# Validation\n\n## Always Run\n\nList default validation commands.\n\n## Evidence Rules\n\nRecord evidence before review.\n"
}

pub fn guardrails_md() -> &'static str {
    "# Guardrails\n\n- Do not move tickets to done without human confirmation.\n- Do not skip validation silently.\n- Do not broaden scope without updating the story packet.\n"
}

pub fn current_state_md() -> &'static str {
    "# Current State\n\n## Works\n\n## Next\n\n## Blocked\n"
}

pub fn glossary_md() -> &'static str {
    "# Glossary\n\nAdd domain terms that agents should understand.\n"
}

pub fn backlog_md() -> &'static str {
    "# Harness Backlog\n\nCapture missing docs, validation gaps, and repeated agent friction.\n"
}

pub fn story_packet_md(id: &str, title: &str) -> String {
    format!(
        r#"# {id} {title}

## Intent

Describe the outcome this workflow packet should produce.

## Scope

- TBD

## Out of Scope

- TBD

## Context Links

- TBD

## Acceptance Criteria

- TBD

## Risk Lane

normal
"#
    )
}
