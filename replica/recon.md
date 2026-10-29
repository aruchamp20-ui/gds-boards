# Recon map: monday.com Work Management (web)

Scope: the core loop of Work Management. Workspaces → boards → groups, items and typed columns in a Table view, the item Updates conversation, Kanban and Calendar views, board search/filter/sort/hide, My Work, activity log.
For: GDS internal use first (the IT Leavers / offboarding board is the first real workload), rebrandable into a product via /replica-brand.
Date: 2026-10-29

## Sources

Public pages only. No account was logged into, no source code or network calls were read. Public API docs were used for the data model.

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | pricing page | https://monday.com/pricing | plan gating: Free 3 boards / 8 column types; Standard adds Calendar, Timeline/Gantt, guests; Pro adds private boards, advanced views/columns, time tracking |
| 2 | API: column types | https://developer.monday.com/api-reference/reference/column-types-reference | 39 column types with ids |
| 3 | API: boards | https://developer.monday.com/api-reference/reference/boards | board fields, kinds, states, permissions |
| 4 | API: items | https://developer.monday.com/api-reference/reference/items | item fields and mutations |
| 5 | API: updates | https://developer.monday.com/api-reference/reference/updates | update/reply/like/pin fields |
| 6 | API: groups | https://developer.monday.com/api-reference/reference/groups | title, color, position |
| 7 | API: workspaces | https://developer.monday.com/api-reference/reference/workspaces | kind open/closed, default workspace |
| 8 | API: board views | https://developer.monday.com/api-reference/reference/board-views | views carry filter, sort, settings |
| 9 | API: subitems | https://developer.monday.com/api-reference/reference/subitems | parent_item, subitem board |
| 10 | API: folders | https://developer.monday.com/api-reference/reference/folders | nested folders in a workspace |
| 11 | help: basics of a board | https://support.monday.com/hc/en-us/articles/115005317249 | board types, owner, description, archive/delete, last viewed |
| 12 | help: board views | https://support.monday.com/hc/en-us/articles/360001267945 | view list, views bar, pin/lock/reorder, hide main table |
| 13 | help: Kanban view | https://support.monday.com/hc/en-us/articles/360000661379 | lanes from a status column, card columns, divide by, column limit |
| 14 | help: Updates section | https://support.monday.com/hc/en-us/articles/115005900249 | mentions, replies, likes, pin, seen, blue/grey bubble (7 days) |
| 15 | help: board filters | https://support.monday.com/hc/en-us/articles/360003624660 | search options, person filter, quick filter counts, advanced filter, save to view, bring it back |
| 16 | help: sort | https://support.monday.com/hc/en-us/articles/360001381699 | sort + subsort, header arrows, save/clear, new items clear a sort |
| 17 | help: My Work | https://support.monday.com/hc/en-us/articles/360019300579 | six date buckets, customize boards/people/columns, hide done |
| 18 | help: Status column | https://support.monday.com/hc/en-us/articles/360001269685 | edit labels (max 40), gray default, done labels, column summary |
| 19 | help: groups | https://support.monday.com/hc/en-us/articles/360011472320 | 18 colours, collapse, Ctrl+G, duplicate, move |
| 20 | help: items | https://support.monday.com/hc/en-us/articles/115005319105 | add row, New item (top of first group), duplicate, delete → recycle bin 30 days, item terminology |
| 21 | help: columns | https://support.monday.com/hc/en-us/articles/115005466609 | + button, column center, resize, reorder, duplicate, collapse, pin, summary, 500 max |
| 22 | help: workspaces | https://support.monday.com/hc/en-us/articles/360010785460 | Main workspace, dropdown, pinned/recent, folders, move board |
| 23 | help: navigation | https://support.monday.com/hc/en-us/articles/35276662798098 | left pane entries, top bar (search, notifications, inbox), favorites, More → My Work |
| 24 | help: item pop-up card | https://support.monday.com/hc/en-us/articles/360001568919 | all columns editable from the card; opened from Kanban, My Work |
| 25 | help: People column | https://support.monday.com/hc/en-us/articles/360002281539 | multi-assign, teams, ownership limit 1/2/3/unlimited, hover card |
| 26 | help: Date column | https://support.monday.com/hc/en-us/articles/360000317520 | picker opens on today, optional time, format, deadline mode |
| 27 | help: activity log | https://support.monday.com/hc/en-us/articles/115005310745 | when / who / item / column / old → new; item-level log tab |
| 28 | help: hide columns | https://support.monday.com/hc/en-us/articles/360003384039 | eye icon, all columns toggle, save as new view |
| 29 | help: shortcuts | https://support.monday.com/hc/en-us/articles/115005339905 | Ctrl+B quick search, Esc, Enter edit, Tab cells, Ctrl+G, Shift+? |

Reference screenshots: none captured. The user's own account was not used (autonomous run) and the help-centre images were not saved. Layout parity in /replica-diff will need the user to drop screenshots of their own account into `replica/screens/` later.

## Core loop

A team puts its work into a board as rows, gives every row a status, an owner and a date, and talks about each row in its Updates thread.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Workspace home | `#/w/:wid` · left pane workspace dropdown | landing page of a workspace: recents, all boards, members | left pane, workspace switcher, asset list, Add button | empty workspace, filled |
| S02 | Board · Main Table | `#/b/:bid` · click a board in the left pane | the board itself: groups of rows with typed columns | board header, views bar, toolbar, group, table, cells, add-row, column summary, add-group | empty (default 1 group), filled, filtered-no-results, collapsed groups, long names, mobile |
| S03 | Board · Kanban view | `#/b/:bid/v/:vid` · views bar | items as cards in lanes per status label | lane, card, lane add (+), card menu, settings panel | no status column (needs setup), empty lane, limit reached |
| S04 | Board · Calendar view | `#/b/:bid/v/:vid` | items plotted by a date column, month/week/day | calendar grid, event chip, nav (prev/next/today) | no date column (needs setup), empty month |
| S05 | Item card | `#/b/:bid/i/:iid` · click the row's bubble or name, Kanban card, My Work "Open" | everything about one item: columns, Updates, activity | side panel, tabs (Updates · Activity log), compose box, update, reply, like, pin | no updates (empty), long thread, editing |
| S06 | My Work | `#/my-work` · left pane More → My Work | every item assigned to me across boards in date buckets | bucket headers with counts, row (item, board, group, people, date, status), Customize | nothing assigned, hide done, search no results |
| S07 | Search everything | top bar search · Ctrl+B quick search | find boards, items, people across the account | search input, result groups | no results |
| S08 | Board activity log | board header avatar stack → Activity log · Ctrl+Shift+L | who changed what, when | log row (time, who, item, column, old → new), person filter | empty |
| S09 | Notifications | top bar bell | mentions and assignments | list, unread count | empty |
| S10 | New board dialog | left pane + Add → New board | create a board: name, type (main/shareable/private), workspace | dialog, radio group | validation (empty name) |
| S11 | Column center | table header + | pick a column type to add | searchable grid of types | search no match |
| S12 | Edit labels | status cell → Edit labels | rename, recolour, reorder, add, deactivate labels; pick done colours | label list, colour palette | max 40 |
| S13 | Filter popover | toolbar Filter · arrow → advanced | quick filters with counts; advanced rules column/condition/value and/or | chips with counts, rule rows, Clear all, Save to this view | no filters, active count badge |
| S14 | Sort popover | toolbar Sort | sort + subsort by column and direction | rule rows, Add new sort, Clear | active count badge |
| S15 | Hide columns popover | toolbar eye icon | toggle columns; All columns switch | checklist, Save as new view | — |
| S16 | Person filter | toolbar person icon | only items assigned to a person | avatar list | — |
| S17 | Board menu | board header ⋯ | rename, description, change type, duplicate, archive, delete, item terminology | menu, confirm dialog | owner-only items disabled |
| S18 | View menu | views bar + and tab ⋯ | add view (Table, Kanban, Calendar), rename, duplicate, pin, delete | menu | last view cannot be deleted |
| S19 | Batch actions bar | tick row checkboxes | act on many items: duplicate, move to group, archive, delete | bottom bar with count | — |
| S20 | Trash & archive | avatar menu → Trash | restore deleted/archived boards and items within 30 days | list, Restore | empty |

## Flows

```
F01 Create a board and fill it (core loop)
    S01 -> S10 -> S02 (default group + 3 items + Person/Status/Date columns) -> type names -> set status/owner/date
    happy path clicks: 6 (Add, New board, name, Create, click cell, pick value)
    edge: empty name, duplicate names allowed, private board invisible to others

F02 Track an item inline
    S02 -> click cell -> picker -> value saved, activity logged
    happy path clicks: 2 per cell. Tab/Enter move between cells.
    edge: Esc cancels, Backspace clears, 60-char item name, status label deactivated

F03 Discuss an item
    S02 -> S05 (Updates) -> write -> @mention -> Update -> reply -> like -> pin
    happy path clicks: 4
    edge: empty body blocked, 46k char limit, bubble turns blue (<7 days) then grey

F04 Organise the board
    S02 -> add group (New item ▾ / group ⋯ / Add new group at bottom) -> rename -> colour -> collapse -> drag group -> drag row -> move item to group -> batch select -> delete
    happy path clicks: 3 to add + rename a group
    edge: last group cannot be deleted, Ctrl+G collapses all, delete → trash 30 days

F05 Find things
    S02 -> search bar (searches selected columns) / S16 person / S13 quick or advanced filter / S14 sort / S15 hide -> Save as new view -> S18
    happy path clicks: 2 (Filter, chip)
    edge: new item hidden by filter → "bring it back" banner, filters are per view, sort cleared by new items unless saved

F06 Visualise
    S02 -> S18 add Kanban -> S03 pick status column -> drag card across lanes (status changes) -> + in lane adds item
    S02 -> S18 add Calendar -> S04 pick date column -> month/week/day -> click day adds item with that date
    happy path clicks: 3 to add a view
    edge: board without a status/date column shows a setup prompt, item with no date hidden from calendar

F07 My work
    left pane -> S06 -> buckets Past dates / Today / This week / Next week / Later / Without a date -> edit status inline -> Open -> S05
    happy path clicks: 1
    edge: hide done, limit 50 boards / 1000 items, item must have a People column assignment

F08 Manage columns
    S02 -> + -> S11 -> type -> added across all groups -> rename (click title) -> resize (drag edge) -> reorder (drag) -> ⋯ duplicate / settings / delete
    edge: Name column cannot be deleted, Updates column cannot be hidden, 500 columns max

F09 Navigate the account
    left pane -> workspace dropdown (pinned, recent, all) -> S01 -> favourites star -> folders -> Ctrl+B quick search -> S07
    edge: Main workspace cannot be deleted

F10 Board lifecycle
    S17 -> rename / description (1,000 chars, no < >) / change type (owner only) / duplicate (structure | items | items+updates) / archive / delete -> S20 restore within 30 days
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Left pane | expanded, collapsed (Ctrl+.) | active entry, hover | all |
| Top bar | — | search focused, unread badge | all |
| Workspace switcher | dropdown: pinned, recent, all + Add workspace | open, searching | S01, all |
| Board header | title (editable), description toggle, star, avatar stack, ⋯ | editing title, favourited | S02–S04 |
| Views bar | tabs + add, tab ⋯ menu, pinned | active, dragging | S02–S04 |
| Toolbar | New item ▾, Search, Person, Filter ▾, Sort, Hide, Group by | active count badges, search open | S02–S04 |
| Group | header (collapse, colour, title, ⋯), column headers, rows, add row, summary | collapsed, dragging, renaming | S02 |
| Row | checkbox, name cell, updates bubble, cells, ⋯ menu | hover, selected, dragging, editing | S02, S06 |
| Cell: Status | label chip, picker, Edit labels | empty (grey), filled | S02–S06 |
| Cell: People | avatar stack, picker with search, teams | empty (+), one, many (+n) | S02–S06 |
| Cell: Date | date text, picker (today default), time toggle, overdue colour | empty, past, today | S02–S06 |
| Cell: Text / Long text / Numbers / Link / Email / Phone / Dropdown / Checkbox / Timeline / Rating / Creation log / Last updated / Item ID | inline editors | empty, editing, invalid | S02, S05 |
| Column header | title (editable), sort arrows, resize handle, ⋯ menu | hover, sorted, dragging | S02 |
| Column summary | status bar, people count, number sum | — | S02 |
| Kanban lane | header (label, count, +), cards, column limit | over limit, empty, collapsed | S03 |
| Card | name, card columns, ⋯ menu | dragging | S03 |
| Calendar grid | month, week, day; event chip | today highlight, overflow "+n" | S04 |
| Item card panel | header, tabs, close | — | S05 |
| Update | avatar, name, time, body, like, reply, ⋯ (pin, edit, delete), seen | pinned, edited | S05 |
| Compose box | toolbar (bold, italic, mention, emoji), Update button | empty disabled, mention menu open | S05 |
| Popover | anchored, closes on Esc/outside | — | S13–S16 |
| Dialog | title, body, actions | confirm destructive | S10, S17 |
| Menu | items, dividers, danger item, submenus | disabled item | many |
| Button | primary, secondary, ghost, danger | default, hover, focus-visible, disabled, loading | all |
| Input / Search input | — | focus, error | many |
| Avatar / Avatar group | sizes sm md lg; initials or image | — | many |
| Badge | count on toolbar buttons | — | S02 |
| Toast | info, success, danger with Undo | — | all |
| Empty state | illustration-free: title, hint, action | — | S01–S09 |
| Skeleton | row | loading | S02, S06 |

## Inferred data model

```
User        id, name, email, title, avatar_color, timezone, is_admin
            evidence: API users, People column hover card, Activity log "who"
            confidence: high

Team        id, name, member_ids[]
            evidence: People column assigns teams; @mention teams
            confidence: high

Workspace   id, name, kind (open | closed), description, is_default, state, created_at
            evidence: API workspaces (#7), help #22
            confidence: high

Folder      id, workspace_id, parent_folder_id, name, color
            evidence: API folders (#10), help #22 (3 levels)
            confidence: high

Board       id, workspace_id, folder_id, name, description (≤1000), kind (public | private | share),
            state (active | archived | deleted), item_terminology, permissions, owner_ids[], subscriber_ids[],
            created_at, updated_at, deleted_at
            evidence: API boards (#3), help #11
            confidence: high

BoardView   id, board_id, name, type (table | kanban | calendar), settings (json: kanban status_column_id,
            card_column_ids; calendar date_column_id, color_column_id), filter (json), sort (json),
            hidden_column_ids[], position, pinned
            evidence: API board views (#8) carry filter/sort/settings per view; help #12, #15, #28
            confidence: high

Group       id, board_id, title, color (one of 18), position, archived
            evidence: API groups (#6), help #19
            confidence: high

Column      id, board_id, title, type, settings (json: status labels[{id,text,color,done,deactivated}],
            people limit, date format/show time, dropdown options, number unit), description, width, position
            evidence: API column types (#2), help #18 #21 #25 #26
            confidence: high (settings shapes are a guess)

Item        id, board_id, group_id, name, position, parent_item_id (subitems), creator_id,
            state (active | archived | deleted), created_at, updated_at, deleted_at
            evidence: API items (#4), subitems (#9)
            confidence: high

ColumnValue item_id, column_id, value (json per type: status {label_id}, people {user_ids[]},
            date {date, time}, timeline {from, to}, numbers {n}, text {s}, link {url, text}, checkbox {checked})
            evidence: API column_values, type reference (#2)
            confidence: medium (exact JSON shapes not shown publicly)

Update      id, item_id, parent_update_id (reply), creator_id, body (html), text_body, created_at,
            edited_at, pinned, likes [user_id], seen_by [user_id]
            evidence: API updates (#5), help #14
            confidence: high

Activity    id, board_id, item_id, user_id, event (create | change | move | delete | restore | ...),
            column_id, old_value, new_value, created_at
            evidence: help #27 structure "when, who, item, column, old -> new"
            confidence: high

Favorite    user_id, board_id            evidence: help #23      confidence: high
Notification id, user_id, kind (mention | assigned), update_id/item_id, read_at   evidence: help #14 #25   confidence: medium
```

Relationships: Workspace 1-n Folder, Workspace 1-n Board, Folder 1-n Board, Board 1-n Group, Board 1-n Column, Board 1-n BoardView, Group 1-n Item, Item 1-n ColumnValue, Item 1-n Update, Update 1-n Update (replies), Item 1-n Item (subitems), Board 1-n Activity, User n-n Board (owners, subscribers), User n-n Team.

## Feature matrix

See `features.csv`. Must: 48, should: 20, could: 15, skip: 13.

## Out of scope (cannot or should not be cloned)

- Automations and the Integrations/Apps marketplace: their partner network and recipes.
- AI features (Sidekick, agents, Vibe, Notetaker, AI columns): their models and credits.
- Docs, Dashboards across boards, Forms, Gantt/Timeline/Workload/Chart/Map/Files views: separate products, could-haves at best.
- monday CRM, dev, service products; mobile apps; guests and Enterprise permissions; templates center; import from Excel/Trello.
- Their name, logo, colours, illustrations, copy and the "monday" trade dress. /replica-brand replaces the accent and name before launch.

## Size

Screens 20, flows 10, entities 13. Hard parts: inline editors for a dozen column types with keyboard navigation; drag and drop on rows, groups, columns and cards; a filter/sort engine that understands every column type; rich-text updates with mentions; later, multi-user realtime and permissions. Size: L for full parity on this slice; M for the vertical slice plus must-haves, which is what the build starts with.
