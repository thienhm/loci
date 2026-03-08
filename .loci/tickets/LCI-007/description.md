# Add In Review Status

Adds a fourth ticket status `in_review` to the workflow, sitting between `in_progress` and `done`. Represents the code/work review stage before a ticket is closed.

**Color:** amber (`#F59E0B`)
**Column order:** Todo → In Progress → In Review → Done

## Changes Made

### `packages/shared/src/types.ts`
- Added `'in_review'` to the `TicketStatus` union type.

### `packages/web/src/types.ts`
- Added `'in_review'` to the local `TicketStatus` union.
- Added `in_review: number` field to `TicketCounts` interface.

### `packages/web/src/pages/ProjectBoardPage.tsx`
- Inserted `{ id: 'in_review', label: 'In Review' }` into the `COLUMNS` array between `in_progress` and `done`.
- Added `in_review: '#F59E0B'` to `statusColors`.
- Added `in_review: 'In Review'` to `statusLabels`.

### `packages/web/src/pages/TicketDetailPage.tsx`
- Added `<option value="in_review">In Review</option>` to the status dropdown between In Progress and Done.

### `packages/web/src/pages/DashboardPage.tsx`
- Updated `TicketCounts` reduce initializer to include `in_review: 0` and handle `in_review` tickets in the count.

### `packages/server/src/mcp.ts`
- Updated `z.enum` in `list_tickets` and `update_ticket` tool schemas to include `'in_review'`.

### `packages/cli/src/commands/status.ts`
- Added `'in_review'` to `VALID_STATUSES` array.
- Updated help text to include `in_review` in the status list.

## Verification

- `npm run build --workspace=packages/web` passes with no TypeScript errors.
