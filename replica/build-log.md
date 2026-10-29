# Build log

Run locally: `node serve.mjs` then http://localhost:5173/ . Data lives in this browser's localStorage (`monday_replica_v1`); the avatar menu has "Reset demo data".

| screen | date | status | notes |
| --- | --- | --- | --- |
| S01 Workspace home | 2026-10-29 | done | recents, boards, folders, members; rename and description inline |
| S02 Board · Main Table | 2026-10-29 | done | 16 column types, inline editors, drag rows/groups/columns, resize, summaries, keyboard arrows/Enter/Backspace |
| S03 Kanban | 2026-10-29 | done | lanes from a status column, drag between lanes, + per lane, card columns, divide by status/dropdown, lane limits, overview bar |
| S04 Calendar | 2026-10-29 | done | month/week/day, click a day to add, drag a chip to move the date, colour by status |
| S05 Item card | 2026-10-29 | done | all columns, Updates (post/reply/like/pin/edit/delete/@mention/seen), Activity log tab |
| S06 My Work | 2026-10-29 | done | six buckets, customize person/boards, hide done, search, inline status/date edits |
| S07 Search everything | 2026-10-29 | done | boards, items (name + any value), people |
| S08 Board activity log | 2026-10-29 | done | side panel with person filter and Last viewed tab |
| S09 Notifications | 2026-10-29 | done | mention / reply / assigned, unread dot, mark all read |
| S10 New board dialog | 2026-10-29 | done | name validation, type, workspace |
| S11 Column center | 2026-10-29 | done | searchable grid of 16 types, add to the right of a column |
| S12 Edit labels | 2026-10-29 | done | rename, recolour, reorder, add, deactivate, done tick, 40 max |
| S13 Filter popover | 2026-10-29 | done | quick filters with counts + advanced rules and/or; Save to this view / Save as new view |
| S14 Sort popover | 2026-10-29 | done | sort + subsort, header arrows, Ctrl+click adds a subsort |
| S15 Hide columns | 2026-10-29 | done | All columns toggle, name column always shown |
| S16 Person filter | 2026-10-29 | done | |
| S17 Board menu | 2026-10-29 | done | rename, description, type (owner only), terminology, duplicate ×3, activity, CSV export, archive, delete |
| S18 View menu | 2026-10-29 | done | add Table/Kanban/Calendar, rename, duplicate, pin (owner), settings, delete (last protected), drag to reorder |
| S19 Batch bar | 2026-10-29 | done | duplicate, move to group, move to board, archive, delete, all with Undo toasts |
| S20 Trash & archive | 2026-10-29 | done | boards and items, restore |

Harder than it looked: keeping focus after a re-render (the whole page re-renders on every change; `focusTarget` restores the cell or add-row input); CSS custom properties cannot be set through `Object.assign(style)`.

Not built yet (see features.csv): sign-in, subitems, files, moving boards between workspaces, nested folders, item default values, bring-it-back, board discussions, view locking. Next: `/replica-test`, then `/replica-backend` for auth, Postgres and realtime.

Clone screenshots for /replica-diff: `replica/clone-screens/` (S01, S02, S03, S04, S05, S06 at 1280 wide).

## monday.com import (2026-10-29)

`node tools/monday-import.mjs --workspace 9545876` exports every active board of the GDS Group workspace into `data/import/` (gitignored); the app imports it on boot and from the avatar menu. `node tools/monday-verify.mjs --boards 40 --items 8` samples cells against monday live. Persistence moved from localStorage (5 MB) to IndexedDB with one record per board. Trial on 3 boards (2,148 items): counts exact, 732/732 sampled cells match after two mapping fixes (default status label arrives as text only; deactivated users are named from the cell text).

**Full import done 2026-10-29:** 377 boards, 35,249 items, 7,360 updates from the GDS Group workspace; 0 errors; `tools/monday-verify.mjs --boards 40 --items 8` = 0 structural problems, 0 count mismatches, 3,992 of 3,992 sampled cells match monday live. Fixes found on the way: monday group ids repeat across boards (now namespaced per board), the default status label arrives as text only, deactivated and deleted members survive only in cell text, long-text values are HTML-escaped in `value` but not in `text`, boards with a deleted creator reject the `creator` field. GDS branding applied via tokens (`replica/brand.md`). Scroll bug with hundreds of boards fixed (grid row pinned to the viewport).

**Row windowing (2026-10-29):** the table renders only the rows near the viewport (30-row buffer each side, fixed 36px rows, spacers keep the scroll height), so the 3,963-row Live Studio Schedule board with 46 columns opens instantly; Kanban lanes still page at 100 cards. Limits: rows must stay single-line and arrow-key navigation stops at the window edge.
