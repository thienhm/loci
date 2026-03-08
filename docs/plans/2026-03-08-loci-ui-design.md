# Loci — UI Design
**Date:** 2026-03-08
**Status:** Approved
**Design system:** `docs/design-system/loci/MASTER.md`

---

## Style

**Clean SaaS** with micro-interactions (50–150ms transitions). Feels like Linear/Plane — minimal, professional, fast.

---

> **Note on wireframes:** Emoji characters (🔴, 🟡, ✓, ◑) in diagrams below are for concept illustration only.
> All actual icons in implementation MUST use **Lucide React** SVG icons — no emoji icons.

## Design Tokens

| Token | Value | Usage |
|---|---|---|
| Font | Plus Jakarta Sans | All text |
| Primary | `#0D9488` (teal-600) | Buttons, active nav, links |
| Secondary | `#14B8A6` (teal-500) | Tags, highlights |
| Accent/CTA | `#F97316` (orange-500) | New ticket button, alerts |
| Background | `#F0FDFA` (teal-50) | Page background |
| Text | `#134E4A` (teal-900) | Body text |
| Surface | `#FFFFFF` | Cards, sidebar |
| Border | `#E2E8F0` (slate-200) | Card borders, dividers |
| Status: Todo | `#94A3B8` (slate-400) | Badge background |
| Status: In Progress | `#3B82F6` (blue-500) | Badge background |
| Status: Done | `#22C55E` (green-500) | Badge background |
| Priority: High | `#EF4444` (red-500) | Priority badge |
| Priority: Medium | `#F59E0B` (amber-500) | Priority badge |
| Priority: Low | `#94A3B8` (slate-400) | Priority badge |
| Border radius (cards) | `rounded-xl` | Project cards, ticket cards |
| Border radius (buttons) | `rounded-md` | Buttons, badges |
| Sidebar width | `220px` | Fixed left sidebar |
| Transition (hover) | `150ms ease` | All hover states |
| Transition (state) | `200ms ease` | Status/priority changes |

---

## Layout Shell

All pages share the same shell:

```
┌────────────────────────────────────────────────┐
│  SIDEBAR (220px fixed)  │  MAIN CONTENT         │
│                         │                       │
│  ■ Loci                 │  [page content]       │
│                         │                       │
│  ─ Projects ─           │                       │
│  ○ Dashboard            │                       │
│  ● my-app               │                       │
│  ○ loci                 │                       │
│                         │                       │
│  [+ New Project]        │                       │
└────────────────────────────────────────────────┘
```

---

## Page 1 — Dashboard (`/`)

```
┌─────────────────────────────────────────────────────────────┐
│  ■ Loci                                    [+ New Project]  │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│  NAV     │  All Projects                                    │
│          │                                                  │
│  ○ All   │  ┌──────────────┐  ┌──────────────┐             │
│  ● my-app│  │ my-app   APP │  │ loci     LCI │  [+ Project]│
│  ○ loci  │  │              │  │              │             │
│          │  │ ● 3 todo     │  │ ● 5 todo     │             │
│          │  │ ◑ 2 in prog  │  │ ◑ 1 in prog  │             │
│          │  │ ✓ 8 done     │  │ ✓ 0 done     │             │
│          │  │              │  │              │             │
│          │  │ [Open Board] │  │ [Open Board] │             │
│          │  └──────────────┘  └──────────────┘             │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

**Components:**
- Project card: name, prefix badge, ticket count by status, "Open Board" button
- Empty state: "No projects yet — run `loci init` in a workspace folder"
- `[+ New Project]` button opens a modal (name + prefix fields)

---

## Page 2 — Project Board, Kanban View (`/project/:id`)

```
┌─────────────────────────────────────────────────────────────┐
│  ■ Loci        my-app (APP)          [⊞ Kanban] [≡ List]   │
├──────────┬──────────────────────────────────────────────────┤
│          │  [+ New Ticket]    [🔍 Search]    [↑↓ Sort]      │
│  NAV     │                                                  │
│          │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  Tickets │  │  TODO  (3)  │  │IN PROGRESS  │  │ DONE (8) │ │
│          │  │─────────────│  │─────────────│  │──────────│ │
│          │  │ APP-001     │  │ APP-004     │  │ APP-002  │ │
│          │  │ Fix login   │  │ MCP server  │  │ Init CLI │ │
│          │  │ 🔴 high     │  │ 🟡 medium   │  │ ✓ done   │ │
│          │  │ @claude     │  │ @you        │  │          │ │
│          │  │─────────────│  │─────────────│  │──────────│ │
│          │  │ APP-003     │  │             │  │ APP-005  │ │
│          │  │ Auth tests  │  │[  Drop here ]  │ Data layer│ │
│          │  │ 🟡 medium   │  │             │  │ ✓ done   │ │
│          │  │─────────────│  └─────────────┘  └──────────┘ │
│          │  │ [+ Add]     │                                 │
│          │  └─────────────┘                                 │
└──────────┴──────────────────────────────────────────────────┘
```

**Components:**
- Three fixed columns: Todo / In Progress / Done
- Ticket card: ID chip, title, priority badge, assignee avatar/label
- Drag-and-drop between columns via `@dnd-kit` → PATCH status on drop
- `[+ New Ticket]` inline at bottom of Todo column + toolbar button
- Column header shows ticket count

---

## Page 3 — Project Board, List View (`/project/:id?view=list`)

```
┌─────────────────────────────────────────────────────────────┐
│  ■ Loci        my-app (APP)          [⊞ Kanban] [≡ List]   │
├──────────┬──────────────────────────────────────────────────┤
│          │  [+ New Ticket]    [🔍 Search]    [▼ Filter]     │
│  NAV     │                                                  │
│          │  ID        Title              Status    Priority  Assignee  │
│          │  ──────────────────────────────────────────────────────    │
│          │  APP-001   Fix login bug      ● Todo    🔴 High   @claude  │
│          │  APP-003   Auth tests         ● Todo    🟡 Med    @you     │
│          │  APP-004   MCP server         ◑ In Prog 🟡 Med    @you     │
│          │  APP-002   Init CLI           ✓ Done    🟢 Low    @you     │
│          │  APP-005   Data layer         ✓ Done    🟡 Med    @you     │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

**Components:**
- Sortable table columns (click header to sort)
- Default sort: `createdAt` descending (newest first)
- Status and priority rendered as colored badges
- Click any row → navigate to ticket detail
- Filter dropdown: by status, priority, assignee
- Search: title-only in v1 (no description/doc search)

---

## Page 4 — Ticket Detail (`/project/:id/:ticketId`)

```
┌─────────────────────────────────────────────────────────────┐
│  ■ Loci   › my-app  › APP-001                               │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│  NAV     │  APP-001   Fix login bug             [⋯ Actions] │
│          │  ──────────────────────────────────────────────  │
│          │  Status   [● Todo ▼]   Priority  [🔴 High ▼]     │
│          │  Assignee [@claude  ]  Labels    [bug] [auth] +  │
│          │  Progress  ████░░░░░░  40%                       │
│          │                                                  │
│          │  [Description][Design][Plan][Summary][Attachments]│
│          │  ──────────────────────────────────────────────  │
│          │                                                  │
│          │  ## Fix login bug                                │
│          │                                                  │
│          │  Users report that login fails when the          │
│          │  session token expires mid-session...            │
│          │                                                  │
│          │  **Acceptance criteria**                         │
│          │  - [ ] Login works with valid credentials        │
│          │  - [ ] Error shown for invalid credentials       │
│          │  - [ ] Session persists on refresh               │
│          │                                                  │
│          │                             [✎ Edit]  [✓ Save]  │
└──────────┴──────────────────────────────────────────────────┘
```

**Components:**
- Breadcrumb: Loci › project name › ticket ID
- Inline-editable fields: status dropdown, priority dropdown, assignee input, labels
- Progress bar (manual input, 0–100%)
- Tabs: auto-generated from `.md` files in ticket folder
  - Fixed order: Description → Design → Plan → Summary → [custom] → Attachments
  - Tab only shown if file exists (except Description — always shown)
- Markdown view/edit toggle per tab
- Attachments tab: list of workspace-relative file paths, add/remove

---

## Component Inventory

| Component | Used In |
|---|---|
| `AppShell` (sidebar + layout) | All pages |
| `ProjectCard` | Dashboard |
| `KanbanBoard` | Project board (Kanban) |
| `KanbanColumn` | Project board (Kanban) |
| `TicketCard` | Kanban columns |
| `TicketTable` | Project board (List) |
| `TicketDetail` | Ticket detail |
| `DocTabs` | Ticket detail |
| `MarkdownEditor` | Ticket detail |
| `AttachmentsTab` | Ticket detail |
| `StatusBadge` | Board + detail |
| `PriorityBadge` | Board + detail |
| `NewTicketModal` | Board toolbar |

---

## Design System Files

| File | Purpose |
|---|---|
| `docs/plans/2026-03-08-loci-ui-design.md` | **Authoritative** — wireframes, component specs, design tokens |
| `docs/design-system/loci/MASTER.md` | Generated design system — colors, typography, effects |
| `docs/design-system/loci/pages/*.md` | Supplemental auto-generated pattern hints only (not authoritative) |

When in conflict, `loci-ui-design.md` takes precedence over `MASTER.md` and page files.

## Pre-Delivery Checklist

- [ ] No emojis as icons — use Lucide React icons throughout
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150ms)
- [ ] Light mode text contrast ≥ 4.5:1
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected for drag animations
- [ ] Responsive at 768px, 1024px, 1440px
