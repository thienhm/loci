# Phase 6: Polish — SSE real-time, keyboard shortcuts, loci open

## Goal

Real-time feel and small UX improvements to complete the Loci experience.

## Tasks

- [ ] **SSE file-watch**: Watch `.loci/tickets/` per-project; emit SSE events when tickets change
  - Endpoint: `GET /api/projects/:projectId/events`
  - Watch only the relevant project's `.loci/tickets/` directory (scoped, avoids cross-project noise)
- [ ] **Frontend SSE subscription**: Subscribe to SSE → auto-refresh board without polling
- [ ] **`loci open` command**: Walk up tree to find `.loci/project.json`, open `localhost:3333/project/<uuid>` in default browser
  - Cross-platform: `open` (macOS), `xdg-open` (Linux), `start` (Windows)
- [ ] **Port override**: `loci serve --port <n>` via Commander.js option
- [ ] **Error states in UI**:
  - Server offline → friendly "Can't connect to Loci server" page
  - Project not found → 404 handling on the board page
- [ ] **Keyboard shortcuts**:
  - `N` → open quick-add modal (title only; user opens ticket detail for rest)
  - `K` → Kanban view
  - `L` → List view
  - Shortcuts disabled when focus is in any input/textarea

## Acceptance Criteria

1. Editing a ticket via MCP or CLI causes the board to refresh automatically (no manual reload)
2. `loci open` opens the browser to the current project board
3. `loci serve --port 4000` starts on port 4000
4. Navigating to an offline server or unknown project shows a helpful error, not a blank screen
5. Pressing `N` from the board opens a quick-add modal; pressing `K`/`L` switches views

## Already Done

- [x] Port conflict handling in `loci serve` (detects PID via `lsof`, exits cleanly)
