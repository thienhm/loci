# LCI-063 Investigate ticket create false failure and duplicate insertion

## Intent

Fix or explain the ticket creation path where `loci add` can report `error: attempt to write a readonly database` even though the ticket row and story file are created.

## Scope

- Reproduce the failure observed while creating `LCI-062`.
- Identify why `loci add "Update CLI --help output" --priority medium --json` returned `error: attempt to write a readonly database` after creating `LCI-062`.
- Identify why retrying the same create command produced a duplicate ticket, `LCI-063`, instead of making the original failure mode obvious.
- Check both entry points:
  - installed wrapper: `loci add ...`
  - Rust binary: `./target/debug/loci add ...`
- Decide whether the root cause is in SQLite transaction handling, registry summary refresh, wrapper behavior, file/doc creation, or post-create side effects.
- Make ticket creation either fully atomic or clearly idempotent/diagnosable when post-create work fails.

## Out of Scope

- Changing normal ticket workflow semantics beyond the create failure path.
- Deleting or renumbering `LCI-062` or `LCI-063`.
- Updating CLI help output; that work belongs to `LCI-062`.

## Context Links

- `LCI-062`: intended ticket for updating CLI `--help` output.
- During creation, `loci add "Update CLI --help output" --priority medium --json` returned `error: attempt to write a readonly database`.
- A retry with `./target/debug/loci add "Update CLI --help output" --priority medium --json` returned the same error.
- Later inspection showed both `LCI-062` and `LCI-063` existed in SQLite and each had a generated `story.md`.
- `./target/debug/loci patch LCI-062 --labels cli,help,ux --json` succeeded afterward, so the database was not globally unwritable.
- `sqlite3 .loci/loci.db "BEGIN IMMEDIATE; ROLLBACK;"` also succeeded during investigation.
- The dashboard later reported `unable to open database file`; reproducing through `packages/server/src/sqliteData.ts` showed Bun SQLite failing with `SQLITE_CANTOPEN` while `sqlite3` and the Rust CLI could read `.loci/loci.db`.
- Running `sqlite3 .loci/loci.db "PRAGMA journal_mode; PRAGMA wal_checkpoint(PASSIVE); SELECT COUNT(*) FROM ticket;"` made Bun SQLite reads and Fastify route injection succeed again, pointing at WAL sidecar/state handling as a likely factor.

## Acceptance Criteria

- A focused reproduction or regression test covers ticket creation when post-create work fails.
- `loci add` does not leave a successfully created ticket while returning a misleading readonly-database error.
- Retrying after a failed create does not silently create an unintended duplicate for the same user action.
- Validation evidence includes the exact create/patch/get commands used to prove the behavior.

## Risk Lane

normal
