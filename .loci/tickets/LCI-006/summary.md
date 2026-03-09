# Summary

## What was done

Moved the dnd-kit drag `listeners` (`dragHandleProps`) from the inner `GripVertical` icon div to the outer card div in `TicketCard`. This makes the entire card surface respond to long-press/drag gestures, not just the six-dot handle.

## Changes

**`packages/web/src/pages/ProjectBoardPage.tsx`**
- Applied `{...dragHandleProps}` to the outer card `<div>` instead of the inner drag-handle `<div>`
- Changed card cursor from `'default'` → `'grab'` (and `'grabbing'` while dragging)
- Kept the `GripVertical` icon as a visual affordance indicator (no longer the drag trigger)
