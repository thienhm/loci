# SQLite Write-Side Cutover Plan

LCI-056 recommends a staged cutover from legacy `.loci/tickets` JSON mutation paths to the Rust project SQLite contract.

## Current Boundary

SQLite already owns dashboard reads when `~/.loci/registry.db` exists:

- project list and project detail from `registered_project`
- ticket list and ticket detail from per-project `.loci/loci.db`
- Markdown doc GET/PUT through existing ticket doc path columns
- missing project visibility and health state

Legacy JSON/file helpers still own these server writes:

- `POST /api/projects/:projectId/tickets`
- `PATCH /api/projects/:projectId/tickets/:ticketId`
- `GET` and `PUT /attachments`
- file list, upload, download, and delete

The TypeScript CLI bridge still keeps `status`, `patch`, `doc`, and `attachments` as fallbacks because they mutate or read legacy `.loci/tickets` data. Rust CLI commands already create and advance workflow packet tickets in SQLite, with visible Markdown under `loci/tickets/<id>/`.

## Recommendation

Make per-project `.loci/loci.db` the single write owner for ticket lifecycle fields, dashboard ticket creates, patch updates, mapped Markdown docs, and registry summary refreshes.

Keep legacy `.loci/tickets` JSON as migration input and temporary read-only compatibility data. Do not allow dashboard/server writes to fall back to JSON once a project is registered in SQLite, because that would create split-brain state between dashboard reads and mutations.

## Staged Plan

### 1. Add a Server SQLite Write Adapter

Create a write-side companion to `packages/server/src/sqliteData.ts`. It should:

- open project DBs read-write only after resolving a healthy registry row
- never run migrations from the dashboard server
- use the Rust schema as the contract
- validate lifecycle statuses against `idea`, `shaped`, `ready`, `in_progress`, `in_review`, and `done`
- map legacy dashboard `todo` inputs to `idea` only at compatibility edges
- update `updated_at` on every mutation
- keep arbitrary document creation disabled unless the DB already names the doc path
- return explicit unavailable-project errors for missing DBs, malformed DBs, and unhealthy registry rows

The first implementation slice should cover ticket create, ticket patch, and doc writes. Attachments/files need a separate storage decision because the Rust schema currently has no attachment table.

### 2. Migrate Legacy JSON Deliberately

Extend `loci upgrade` or a dedicated upgrade subroutine to import existing `.loci/tickets` JSON data into SQLite before disabling legacy writes for a project.

Migration must:

- support `--dry-run --json`
- back up legacy ticket folders before applying destructive layout changes
- map `todo` to `idea`
- preserve `createdAt` and `updatedAt`
- import labels, assignee, priority, progress, and archive state where supported
- map known Markdown files to existing or newly added doc path columns by policy
- report conflicts when both JSON and SQLite contain the same ticket id with divergent fields
- leave legacy data readable or quarantined until the user reviews the import result

No dashboard route should auto-create SQLite rows from JSON during normal web use.

### 3. Cut Server Mutations To SQLite

Once migration exists, switch server mutations for SQLite-registered projects:

- create tickets in SQLite under an immediate transaction and create the visible story/description Markdown surface according to the chosen packet policy
- patch ticket fields in SQLite and refresh dashboard reads from the same DB
- write docs only through known path columns
- refresh registry summary counts after mutating project DB state
- emit the existing SSE change event after successful mutations

The JSON path can remain only for projects that do not have the SQLite registry/project DB contract.

### 4. Port CLI Mutation Commands

After server ownership is settled, port the remaining TypeScript fallbacks:

- `status` updates SQLite lifecycle status and `updated_at`
- `patch` updates assignee, progress, priority, and labels in SQLite
- `doc` reads/writes known SQLite doc path columns and refuses unknown docs with actionable guidance
- `attachments` waits for the attachment/file policy rather than writing `attachments.json`

Remove the bridge fallback for each command only after the Rust implementation and tests cover the SQLite behavior.

### 5. Decide Attachment And File Storage

Add a focused design/implementation slice for attachments and uploaded files. The recommended direction is:

- store binary files on disk under visible or project-local paths
- store metadata in SQLite with ticket ownership and timestamps
- keep attachment lists derived from rows, not a separate JSON list
- import existing `attachments.json` and `files/` content during migration
- preserve download URLs and unique filename behavior

This needs a migration because the current Rust schema does not include an attachment/file table.

## Test Plan

Server route tests:

- SQLite ticket create inserts a row, creates the expected Markdown file, returns the created ticket, and never writes `.loci/tickets/<id>/ticket.json`.
- SQLite ticket patch updates allowed fields and rejects invalid status, priority, progress, and labels payloads.
- SQLite doc write succeeds for a known path column and rejects unknown doc filenames.
- Missing project DB and malformed project DB routes return clear errors without creating files.
- Registry summary counts refresh after create and status changes.
- Legacy JSON routes still work when no SQLite registry exists.

CLI tests:

- Rust `status` changes a ticket lifecycle state and updates `updated_at`.
- Rust `patch` updates assignee, progress, priority, and labels.
- Rust `doc read/write` only touches known doc path columns.
- Bridge tests remove each TypeScript fallback only when the Rust command exists.
- Legacy projects receive migration guidance instead of silent split writes.

Migration tests:

- dry-run reports exact inserts, updates, skipped items, and conflicts.
- apply imports JSON tickets into SQLite and preserves legacy data backup.
- `todo` becomes `idea`.
- archived JSON tickets are reported with the chosen SQLite/archive policy.
- repeated migration is idempotent.
- conflicting JSON/SQLite ticket IDs fail safely with a machine-readable report.

Dashboard tests:

- creating and patching tickets updates board columns after query invalidation/SSE.
- doc edits show the new content on refetch.
- missing/unhealthy projects remain visible and disable mutation affordances or surface clear errors.
- lifecycle columns keep the Rust vocabulary, with legacy `todo` mapped only for compatibility.

## Risks

- Split-brain writes if server or CLI silently writes JSON while dashboard reads SQLite.
- Data loss if migration rewrites legacy folders without backup and conflict reporting.
- Hidden docs if arbitrary Markdown files are created without corresponding SQLite path metadata.
- Attachment loss if `attachments.json` and uploaded files are ignored during migration.
- Registry count drift if mutations update project DB rows but not `registered_project` summaries.
- Unexpected migrations if the dashboard server starts creating or upgrading databases.

## Follow-Up Tickets

LCI-056 should be split into implementation tickets:

- build the TypeScript server SQLite write adapter and cut over ticket create/patch/doc routes
- implement legacy JSON-to-SQLite migration/import with dry-run, backup, and conflict reporting
- port Rust `status`, `patch`, and `doc` commands to SQLite
- design and implement attachment/file metadata storage and migration
- refresh registry summaries after write-side mutations

