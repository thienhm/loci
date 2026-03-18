# LCI-025: Filter/Search Tickets

## Overview
Add client-side filtering and search to the ticket board/list views.

## Design

### Search Bar
- Text input above the kanban/list view
- Filters tickets by matching against: title, ticket ID, and labels
- Case-insensitive substring match
- Debounced input (200ms) to avoid excessive re-renders

### Dropdown Filters
- **Status**: multi-select dropdown (todo, in_progress, in_review, done)
- **Priority**: multi-select dropdown (low, medium, high)
- **Assignee**: dropdown populated from existing ticket assignees
- All filters are AND-combined (search text AND status AND priority AND assignee)

### UI Layout
- Filter bar sits between the view toggle (kanban/list) and the board/list content
- Search bar on the left, dropdowns on the right
- "Clear filters" button appears when any filter is active
- Works identically in both kanban and list views

### Implementation
- All filtering is client-side (tickets already fetched)
- Filter state in React useState within ProjectBoardPage
- Filtered tickets passed to kanban columns / list table
- No URL persistence for now

### Files to Modify
- `packages/web/src/pages/ProjectBoardPage.tsx` — add filter bar + filtering logic
- New component: `packages/web/src/components/FilterBar.tsx`
