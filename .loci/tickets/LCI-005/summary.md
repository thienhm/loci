# Phase 6: Polish — Summary

## Completed: 2026-03-08

## What was implemented

### Task 1: SSE backend (server-side file-watcher)
- New file: `packages/server/src/sse.ts`
- Endpoint: `GET /api/projects/:projectId/events`
- Uses `fs.watch({ recursive: true })` on `.loci/tickets/` for the project
- Sends `{"type":"connected"}` heartbeat on connect; `{"type":"change"}` on any file mutation
- Cleans up the watcher when SSE client disconnects (`req.raw.on('close', ...)`)
- 2 new tests in `packages/server/src/__tests__/sse.test.ts` (using real HTTP fetch with AbortController for streaming, inject() for 404)

### Task 2: Frontend SSE subscription
- New hook: `packages/web/src/hooks/useSSE.ts`
- Opens `EventSource` to `/api/projects/:id/events`
- On `change` event: invalidates `['tickets', projectId]` and `['project', projectId]` React Query keys
- Auto-reconnects on connection error with 3s delay
- Cleans up on unmount
- Integrated into `ProjectBoardPage` — board auto-refreshes when any ticket file changes

### Task 3: `loci open` CLI command
- New file: `packages/cli/src/commands/open.ts`
- Walks up directory tree via `findWorkspaceRoot()` to locate `.loci/project.json`
- Opens `http://localhost:3333/project/<uuid>` in default browser
- Cross-platform: `open` (macOS), `xdg-open` (Linux), `start` (Windows)
- Accepts `--port <n>` override (default 3333)
- 4 new tests in `packages/cli/src/__tests__/open.test.ts`

### Task 4: Port override `loci serve --port <n>`
- Already implemented from Phase 4.6 (`-p, --port` option on the `serve` command)
- Confirmed working — no changes needed

### Task 5: Error states in UI
- `ProjectBoardPage`: improved error block detects `TypeError` (network failure = server offline) vs. 404 (project not found)
- Server offline → "Cannot connect to Loci server" + `loci serve` hint
- Project not found → shows project UUID + "Back to dashboard" link
- `DashboardPage`: already had `loci serve` hint on error (no change needed)

### Task 6: Keyboard shortcuts
- New hook: `packages/web/src/hooks/useKeyboardShortcuts.ts`
- Skips when focus is in `INPUT`, `TEXTAREA`, `SELECT`, or `contenteditable`
- Skips when Ctrl/Alt/Meta modifier is held
- Integrated into `ProjectBoardPage` with `useMemo` to avoid re-registering on every render
- `N` / `n` → open quick-add modal (title-only inline form)
- `K` / `k` → switch to Kanban view
- `L` / `l` → switch to List view

## Test results
- `packages/server`: **55 pass, 0 fail** (53 pre-existing + 2 new SSE tests)
- `packages/cli`: **13 pass, 0 fail** (9 pre-existing + 4 new open tests)
- `packages/web/tsc --noEmit`: **clean** (0 errors)

## Branch
`feature/phase-6-polish` — merged to `main` as fast-forward, branch and worktree cleaned up.
