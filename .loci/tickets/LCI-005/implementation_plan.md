# LCI-005 Implementation Plan — Phase 6: Polish

## Tasks

### Task 1: SSE backend — file-watcher + SSE endpoint
**File:** `packages/server/src/sse.ts` + route in `packages/server/src/routes.ts`

- Add `GET /api/projects/:projectId/events` SSE endpoint in Fastify
- Use `fs.watch` to watch the project's `.loci/tickets/` directory recursively
- On any file change, emit an SSE event: `data: {"type":"change"}\n\n`
- Clean up watcher when the SSE client disconnects
- Write test: `packages/server/src/__tests__/sse.test.ts`

### Task 2: Frontend SSE subscription + auto-refresh
**File:** `packages/web/src/hooks/useSSE.ts` + integrate in `ProjectBoardPage`

- Create `useSSE(projectId)` hook that opens `EventSource` to `/api/projects/:id/events`
- On `message` event, call React Query's `queryClient.invalidateQueries` for the board
- Auto-reconnect on connection error (with short delay)
- Clean up `EventSource` on unmount
- Integrate hook into `ProjectBoardPage`

### Task 3: `loci open` CLI command
**File:** `packages/cli/src/commands/open.ts`

- Walk up tree to find `.loci/project.json` (reuse `findWorkspaceRoot`)
- Read `project.json` to get project UUID
- Open `http://localhost:3333/project/<uuid>` in default browser
  - macOS: `open <url>`
  - Linux: `xdg-open <url>`
  - Windows: `start <url>`
- Register command in CLI entry point
- Write test: `packages/cli/src/__tests__/open.test.ts`

### Task 4: Port override `loci serve --port <n>`
**File:** `packages/cli/src/commands/serve.ts`

- Add `--port <n>` option to `serve` Commander command
- Pass port to server (env var or CLI arg forwarding)
- Update `packages/server/src/index.ts` to read port from `process.env.PORT` or argv
- Write test verifying the option is registered and passed

### Task 5: Error states in UI
**Files:** `packages/web/src/pages/`, `packages/web/src/components/`

- **Server offline**: Wrap App with error boundary or check query errors; show `<ServerOfflinePage />` with a friendly message + retry button when fetch completely fails
- **Project not found**: On `ProjectBoardPage`, if `GET /api/projects/:id` returns 404, render `<NotFoundPage projectId={id} />` instead of blank board
- Both pages should have a "back to dashboard" link

### Task 6: Keyboard shortcuts
**File:** `packages/web/src/hooks/useKeyboardShortcuts.ts` + `QuickAddModal` component

- Create `useKeyboardShortcuts(shortcuts)` hook
  - Listens to `keydown` on `document`
  - Skips when focus is in `INPUT`, `TEXTAREA`, or `SELECT`
- On `N`: open `QuickAddModal` (title-only form → creates ticket via `POST /api/projects/:id/tickets`)
- On `K`: switch to Kanban view
- On `L`: switch to List view
- Integrate hook into `ProjectBoardPage`
- Write test for the hook and modal

## Order of execution
1 → 2 → 3 → 4 → 5 → 6 (each task is independent enough to execute sequentially)

## Branch
`feature/phase-6-polish` in `.worktrees/phase-6-polish`
