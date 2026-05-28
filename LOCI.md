# Loci Operating Guide

<!-- LOCI:BEGIN -->
Project: Loci
Prefix: LCI

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
