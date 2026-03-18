# LCI-028: Archived Ticket State

## Overview
Add an `archived` boolean field to tickets, allowing users to archive tickets from any status and hide them from default views.

## Design

### Data Model
- New field: `archived: boolean` (default `false`) on Ticket type
- Orthogonal to status — a ticket can be archived from any status
- Preserves original status for unarchive

### Backend Changes
- `packages/shared/src/types.ts` — add `archived` field to Ticket interface
- `packages/server/src/data.ts` — default `archived: false` on create, support in list filtering
- `packages/server/src/routes.ts` — accept `archived` query param in list endpoint, accept in PATCH
- `packages/server/src/mcp.ts` — update MCP tools to support archived filter/field

### API
- `GET /api/projects/:projectId/tickets?archived=true` — list archived tickets
- `PATCH /api/projects/:projectId/tickets/:ticketId` — set `{ archived: true/false }`
- Default listing excludes archived tickets (archived=false by default)

### Frontend - Archive Actions
- **Ticket detail page**: "Archive" button in header (changes to "Unarchive" when archived)
- **Kanban cards**: archive icon button on hover
- **List rows**: archive icon button in actions column
- **Bulk selection**: checkboxes on cards/rows, floating action bar with "Archive selected" button

### Frontend - Viewing Archived
- "Show archived" toggle in the filter bar (integrates with LCI-025)
- Archived tickets shown with visual distinction (muted/grayed out)
- When "show archived" is on, archived tickets appear in their original status columns/rows

### Bulk Selection
- Checkbox appears on each card/row
- Selecting 1+ tickets shows a floating action bar at bottom
- Action bar shows: count selected, "Archive" button, "Cancel" button
- Works in both kanban and list views

### Files to Modify
- `packages/shared/src/types.ts` — Ticket type
- `packages/server/src/data.ts` — create/list/filter logic
- `packages/server/src/routes.ts` — query param + PATCH support
- `packages/server/src/mcp.ts` — MCP tool updates
- `packages/web/src/types.ts` — mirror Ticket type
- `packages/web/src/pages/ProjectBoardPage.tsx` — archive actions, bulk selection, filter toggle
- `packages/web/src/pages/TicketDetailPage.tsx` — archive button in header
- `packages/web/src/api/client.ts` — update fetchTickets params
