# Architecture: monday-replica (a rebuild of monday.com Work Management's core features)

## Stack

The user's existing stack, not the template default: every GDS dashboard is static HTML + ES modules on Vercel with `api/` serverless functions and Entra SSO through `jose`. No Next.js, no Tailwind, no build step.

| layer | choice | why |
| --- | --- | --- |
| web | static `index.html` + ES modules (`app.js`, `lib/`, `views/`) | matches every dashboard already deployed; opens from any static server; nothing to compile |
| styling | hand-written CSS on `replica/design/tokens.css` custom properties | tokens-only rule; no raw hex in components |
| data layer (now) | `lib/data.js`: async functions over an in-memory store persisted to `localStorage` | the fake layer the build skill asks for; every call is `await`, so the server swap changes no view code |
| database (later) | Postgres on Neon, schema in `replica/schema.sql`, reached through Vercel functions in `api/` | relational data (boards, items, values, updates) with per-board queries; Neon is free at zero users |
| auth (later) | Entra SSO via `jose` for GDS; email magic link (Auth.js) for a sellable product | the SSO allowlist pattern already exists in the user's dashboards |
| payments | Stripe Checkout + Billing (launch only) | boring and managed |
| email | Resend (mention and assignment notifications) | one API, free tier |
| jobs | Vercel Cron: purge trash older than 30 days nightly | the only scheduled job the slice needs |
| files | Vercel Blob (Files column, update attachments, should-have) | already used by the user's dashboards |
| hosting | Vercel | the user's host |

## Schema

Tables: 14. Access rules: data-layer checks in `api/` (one `canAccessBoard(user, board)` per query: public boards in open workspaces are readable by every member, private boards by subscribers only, edits per the board's `permissions` value). Row level security is not used because the app owns the single Postgres connection.

See `replica/schema.sql`. Decisions worth knowing:

- positions are `double precision`; inserting between neighbours averages them, and a renumber runs when the gap is under 1e-6
- dates are stored date-only (`date`) with an optional `time` column, because monday dates are calendar dates, not instants; timestamps everywhere else are `timestamptz`
- column values live in one `column_values` table keyed by `(item_id, column_id)` with a `jsonb` value; the shape per type is in `lib/columns.js`
- `updates.parent_update_id` makes replies; `likes` is a `uuid[]` of user ids
- soft delete: `state` on boards and items plus `deleted_at`; the cron purges after 30 days
- one hard constraint: `boards_one_main_workspace` (exactly one default workspace per account)

## API

The fake layer and the future `api/` routes share names. Each view only ever calls `data.*`.

| method path | `data` fn | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- | --- |
| GET /api/me | me() | current user, teams, favourites | member | — | User | all |
| GET /api/workspaces | listWorkspaces() | workspaces with folders and board stubs | member | — | Workspace[] | F09 |
| POST /api/workspaces | createWorkspace(name, kind) | create | member | name, kind | Workspace | F09 |
| GET /api/boards/:id | getBoard(id) | board with groups, columns, views, items, values | reader of board | id | Board | F01 |
| POST /api/boards | createBoard({name, kind, workspace_id}) | default group, 3 items, Person/Status/Date columns, Main Table view | member | name, kind, workspace_id | Board | F01 |
| PATCH /api/boards/:id | updateBoard(id, patch) | name, description, kind, state, item_terminology | owner for kind/state | patch | Board | F10 |
| POST /api/boards/:id/duplicate | duplicateBoard(id, mode) | structure / items / items+updates | reader | mode | Board | F10 |
| POST /api/boards/:id/groups | createGroup(bid, {title, position}) | add | editor | title | Group | F04 |
| PATCH /api/groups/:id | updateGroup(id, patch) | title, color, position, collapsed | editor | patch | Group | F04 |
| DELETE /api/groups/:id | deleteGroup(id) | delete with items (last group refused) | editor | — | ok | F04 |
| POST /api/groups/:id/duplicate | duplicateGroup(id, withUpdates) | copy | editor | withUpdates | Group | F04 |
| POST /api/boards/:id/columns | createColumn(bid, type, title) | add with default settings | editor | type, title | Column | F08 |
| PATCH /api/columns/:id | updateColumn(id, patch) | title, width, position, settings, description | editor | patch | Column | F08 |
| DELETE /api/columns/:id | deleteColumn(id) | delete with values (name column refused) | editor | — | ok | F08 |
| POST /api/boards/:id/views | createView(bid, {type, name, settings}) | add view | editor | type, name | View | F05 F06 |
| PATCH /api/views/:id | updateView(id, patch) | name, settings, filter, sort, hidden_column_ids, position, pinned | editor | patch | View | F05 F06 |
| DELETE /api/views/:id | deleteView(id) | delete (last view refused) | editor | — | ok | F06 |
| POST /api/items | createItem({board_id, group_id, name, at: 'top'/'bottom'/after}) | add | editor | … | Item | F01 F02 |
| PATCH /api/items/:id | updateItem(id, patch) | name, group_id, position, state | editor | patch | Item | F02 F04 |
| PUT /api/items/:id/values/:cid | setValue(itemId, colId, value) | set one cell; logs activity | editor | value | Item | F02 |
| POST /api/items/batch | batchItems(ids, action, arg) | duplicate / move / archive / delete / restore | editor | … | Item[] | F04 |
| GET /api/items/:id/updates | listUpdates(itemId) | thread with replies | reader | — | Update[] | F03 |
| POST /api/items/:id/updates | createUpdate(itemId, body, parentId?) | post or reply; mentions notify | member | body | Update | F03 |
| PATCH /api/updates/:id | editUpdate(id, body) / pinUpdate(id, bool) / likeUpdate(id) | edit, pin, like toggle | creator (edit), member (like) | … | Update | F03 |
| DELETE /api/updates/:id | deleteUpdate(id) | delete | creator or owner | — | ok | F03 |
| GET /api/boards/:id/activity | listActivity(bid, {itemId?, userId?}) | log | reader | filters | Activity[] | F03 F08 |
| GET /api/my-work | myWork(userId) | items assigned via People columns across boards | member | userId | Item[] with board/group | F07 |
| GET /api/search?q= | search(q) | boards, items, people | member | q | groups of hits | F09 |
| GET /api/notifications | listNotifications() / markRead(id) | mentions, assignments | member | — | Notification[] | F03 |
| GET /api/trash | listTrash() / restore(kind, id) | deleted boards and items | member | — | … | F10 |

Webhooks in: none in the slice. Webhooks out: none. Jobs: `purge-trash`, nightly 03:00 UTC, deletes rows with `deleted_at < now() - 30 days`.

## The parts that bite

- time zones: dates are calendar dates; My Work buckets (Past, Today, This week, Next week, Later) are computed in the viewer's browser timezone, week starts Monday (GDS is UK-based; make it a profile setting later)
- positions: float positions with renumbering; drag-and-drop sends `position` only, never full lists
- races: last write wins per cell now; `updated_at` version check per item when the server lands
- idempotency: creating an item from the Kanban "+" or Calendar day click sends a client id so a double click does not create twice
- localStorage: 5 MB cap; the store serialises on every write, debounced 150 ms; a warning toast at 4 MB
- filters: every column type declares its operators and a `test(value, op, arg)`; filter, quick-filter counts, sort and search all go through `lib/columns.js`, so a new type is one file
- XSS: update bodies are stored as plain text with a tiny inline markup (bold, italic, lists, mentions); rendering escapes everything first
- drag and drop: pointer-based with keyboard fallbacks in menus (Move to group, Move up/down) for accessibility
- undo: every destructive action shows a toast with Undo for 8 s; items and boards go to trash first
- search: linear scan over names and text values is fine to a few thousand items; Postgres `tsvector` later

## Build order

1. Vertical slice: shell (left pane, top bar, hash router), S01 workspace home, S10 new board, S02 Main Table with Status/People/Date/Text cells, add item, S05 item card with Updates. Tables: workspaces, boards, groups, columns, items, column_values, updates. Routes: me, workspaces, getBoard, createBoard, createItem, setValue, updates.
2. Must-haves: remaining must column types (Numbers, Dropdown, Checkbox), label editor (S12), group ops and drag (F04), batch bar (S19), item menu, column header ops (F08, S11), search/person/filter/sort/hide (S13–S16), views bar (S18), Kanban (S03), Calendar (S04), My Work (S06), activity (S08), search everything (S07), board menu and trash (S17, S20), favourites.
3. Should-haves: Timeline/Link/Email/Phone/read-only columns, summaries, duplicate board and group, Kanban extras, My Work customize, notifications (S09), shortcuts, permissions, folders, subitems, files, teams; then `/replica-backend` for auth, Postgres and realtime.
4. Fixes from `/replica-entrepreneur` once it has run.
