# Component specs: monday-replica

Primitives live in `styles/app.css` (classes) and `lib/ui.js` (behaviour). Everything uses tokens from `tokens.css`; no raw hex or px in components.

```
Button
  variants  primary (bg accent / on-accent), secondary (bg bg, border), ghost (no border), danger (text danger; bg danger on hover)
  sizes     sm 28px, md 32px
  states    default, hover (surface-2), active, focus-visible (2px ring accent, offset 2px), disabled (opacity .5, no pointer), loading (keeps label, spinner before it)
  a11y      real <button>, type="button" everywhere except forms
  used on   all

Input / Textarea
  states    default (border border-input), focus (border accent + ring), error (border danger + message under), disabled
  a11y      <label> or aria-label on every input; error text linked with aria-describedby
  used on   S10, S05 compose, S12, S13, S14

Search input
  variants  toolbar (collapses to an icon until focused), top bar (always open)
  behaviour Esc clears then closes; Ctrl+F on a board focuses it
  used on   S02–S04, S07

Left pane
  parts     product switcher, Workspace dropdown, nav entries (Home, My Work, Favorites), workspace contents (folders, boards), Add button, collapse toggle
  states    expanded 256px, collapsed 52px (icons only, Ctrl+.), active entry (accent-soft bg), hover
  a11y      <nav aria-label="Main">; entries are links; current page aria-current="page"
  used on   all

Top bar
  parts     search (Ctrl+B), notifications bell with unread badge, help, avatar menu (profile, Trash, Shortcuts, switch user in dev)
  used on   all

Board header
  parts     editable title (click to edit, Enter saves, Esc cancels), description chevron, star, last-viewed avatar stack, ⋯ menu, views bar
  states    editing title, favourited (filled star)
  used on   S02–S04

Views bar
  parts     tabs (icon + name), active underline (accent), + add view, tab ⋯ (right-click too)
  states    active, dragging, pinned (pin icon)
  a11y      role="tablist" / role="tab" aria-selected
  used on   S02–S04

Toolbar
  parts     New item ▾ (split: New item | New group), Search, Person, Filter ▾, Sort, Hide, Group by (disabled, could)
  states    count badge on Filter/Sort/Hide when active (pill accent-soft), person active (avatar shown)
  used on   S02–S04

Group
  parts     header row: collapse chevron, title (editable, colour = group colour), ⋯ menu; column header row (checkbox, Item, columns…, +); rows; add row; summary row
  states    collapsed (header only, shows item count), renaming, dragging (ghost)
  a11y      <section aria-labelledby=title>; chevron is a button with aria-expanded
  used on   S02

Row
  parts     left colour bar (group colour), checkbox, name cell (text + ⋯ on hover + updates bubble), cells, right spacer
  height    36px (row token)
  states    hover (surface), selected (accent-soft), dragging, editing a cell (ring accent inside the cell)
  keyboard  Enter edits the focused cell, Esc cancels, Tab/Shift+Tab move, Backspace clears, Ctrl+Enter selects the row
  used on   S02, S06

Cell: Status
  render    full-cell chip in label colour, white text, centred; empty = label-grey with no text
  editor    popover grid of labels (3 per row), Edit labels link at the bottom
  used on   S02–S06

Cell: People
  render    avatar stack (max 3 + "+n"), empty shows a dashed + on hover
  editor    popover: search input, suggestions (board members first), selected chips with ×; limit from settings
  used on   S02–S06

Cell: Date
  render    "29 Oct" or "29 Oct 2025" if not this year; past dates with a status not done get text danger; time appended when set
  editor    popover month grid opening on the current value or today, Today button, time toggle, Clear
  used on   S02–S06

Cell: Text / Long text / Numbers / Link / Email / Phone
  render    text; numbers right-aligned with unit; link as anchor (opens new tab) with its text
  editor    inline input in the cell; Enter saves, Esc cancels; numbers reject non-numeric; link editor has url + text
  used on   S02, S05

Cell: Dropdown
  render    chips (label-* colours cycle), "+n" overflow
  editor    popover with search, create new option on Enter
  used on   S02, S05

Cell: Checkbox / Rating / Timeline / Creation log / Last updated / Item ID
  render    centred checkbox; 5 stars; "1 Oct – 12 Oct" bar; "29 Oct, Arun" with avatar; relative time; number
  editor    click toggles; click star; two date pickers; read-only ones have no editor
  used on   S02, S05

Column header
  parts     title (click to rename), sort arrows on hover (click toggles asc/desc/none), resize handle on the right edge (drag), ⋯ menu (rename, add description, settings…, duplicate, sort, collapse, delete)
  states    hover, sorted (arrow stays visible), dragging (ghost), resizing
  used on   S02

Column summary
  variants  status (stacked bar, hover tooltip with label counts), people (count of distinct), numbers (sum), date (range)
  used on   S02 group footer

Kanban lane
  parts     header (label colour bar, label text, count, + button, ⋯), scrollable cards, "Set column limit" badge when over
  states    empty ("Drop items here"), drag-over (accent-soft bg)
  used on   S03

Card
  parts     name, chosen card columns (compact rows), ⋯ menu (open, duplicate, move, archive, delete)
  states    hover (shadow pop), dragging
  a11y      card is a button that opens S05; menu has "Move to lane…" as the keyboard route
  used on   S03

Calendar grid
  variants  month (6 rows × 7), week (7 columns, all-day chips), day (list)
  parts     nav (‹ Today ›), period title, view switch, day cells with +n overflow
  states    today (accent ring), other-month (text-muted), drop target
  used on   S04

Item card panel
  parts     header (group colour dot, editable name, ⋯, close), tabs (Updates · Activity log), body; columns list on the left on wide screens, stacked on mobile
  size      panel token 560px; full-screen under tablet
  a11y      role="dialog" aria-modal, focus trapped, Esc closes, focus returns to the row
  used on   S05

Update
  parts     avatar, name, relative time (title has exact time), body, Like (count), Reply, ⋯ (Pin to top, Edit, Delete), seen-by eye, replies indented, reply composer
  states    pinned (pin icon + top), edited ("(edited)"), liked by me (filled)
  used on   S05

Compose box
  parts     textarea (auto-grow), toolbar: B, I, list, @ mention, emoji; Update button (disabled while empty)
  behaviour @ opens a mention menu (users, teams), ↑↓ Enter picks, inserts @Name
  used on   S05

Popover
  behaviour anchored under the trigger, flips when near the edge, closes on Esc / outside click / route change, returns focus
  a11y      role="dialog" or role="menu"
  used on   S12–S16, cell editors

Menu
  parts     items with icon + label, dividers, submenus (Move to ›), danger items in danger text
  keyboard  ↑↓ move, Enter picks, Esc closes
  used on   many

Dialog
  parts     title, body, actions (Cancel · primary); destructive confirm uses the danger button and names the thing
  a11y      role="dialog" aria-modal, focus trapped
  used on   S10, S17, S20

Avatar / Avatar group
  sizes     sm 24, md 32, lg 40; initials on avatar_color; group overlaps by 6px, "+n" bubble
  used on   many

Badge
  variants  count (pill accent-soft text accent), unread (danger dot)
  used on   toolbar, bell

Toast
  variants  info, success, danger; optional Undo action; 8 s; stack bottom-left
  a11y      role="status" (polite); danger uses role="alert"
  used on   all

Empty state
  parts     title, one-line hint, primary action
  copy      written fresh ("Nothing here yet. Add the first item below.")
  used on   S01–S09

Skeleton
  variants  row (shimmer bars sized like a row); 6 rows while a board loads
  used on   S02, S06
```
