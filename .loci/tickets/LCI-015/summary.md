# Summary

Displayed ticket labels as teal pill chips on Kanban cards in the project board view.

## Changes

- `packages/web/src/pages/ProjectBoardPage.tsx`: Updated `TicketCard` component
  - Added label chips below the ticket title (hidden when no labels)
  - Moved priority badge and assignee badge to the top-right of the card header row
  - Style matches existing label chips in `TicketDetailPage`
