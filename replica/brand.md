# Brand: GDS Boards

## Name

**GDS Boards.** Descriptive, carries the company name, nothing like the original's name in sound, look or meaning. Checks: this is an internal GDS tool, so no trademark filing or domain is needed; if it is ever sold outside GDS, run the `/replica-brand` checks (trademark office search, app store search, domain, handles) on a new product name first.

## Palette

The GDS house style (Poppins, charcoal, purple, tan) from the GDS template deck, applied to the roles `/replica-design` set up. Values live in `replica/design/tokens.json`; `node replica/design/contrast.mjs` passes AA on every pair.

| role | value | note |
| --- | --- | --- |
| text | #0D0D0D | GDS charcoal |
| accent | #5F4FE0 | brand hue, darkened to 5.7:1 on white; buttons, links, selection |
| accent-soft | #EEEBFE | selected rows, active filters |
| brand | #8272F6 | the brand purple itself: active view underline, decoration only (3.7:1, never text) |
| brand-warm | #CEAC8E | GDS tan: favourite star, decoration only |
| surface / border | #F7F6FB / #DDDBE8 | cool greys tinted towards the purple |
| status and group colours | unchanged | functional, 18 AA-safe label colours |

Original brand colours to keep out (in `brand.json`): monday blue #0073EA / #6161FF and its status greens, oranges and reds.

## Logo

The existing GDS mark (`assets/brand/gds-logo-charcoal.png`, white version for dark surfaces). It sits in the left pane and as the favicon. No new mark is needed; nothing about it resembles the original's logo.

## Voice

**Clear, warm, direct.** Clear, not clinical. Warm, not chatty. Direct, not blunt.

| do | don't |
| --- | --- |
| Say what happened and what to do next ("Saved to this view") | Celebrate routine actions |
| Name the thing ("Delete 'IT Leavers'?") | Generic confirmations ("Are you sure?") |
| Plain verbs on buttons (Create board, Add item) | Cute labels |
| Offer Undo instead of asking first | Block with confirmation dialogs for reversible actions |
| One sentence of help in empty states | Paragraphs of onboarding copy |

The ten most-seen strings (New item, + Add item, Search this board, Filter, Sort, Hide, Save to this view, "No items match", "No updates yet", "Nothing assigned yet") were written fresh for the clone and reviewed against this voice.

## Sweep

`grep -ril monday` over the app code finds only the data-source references ("Import from monday export", "Open in monday.com", the import tooling under `tools/`), which name where the data comes from rather than what the product is. No original colours, fonts or copy remain in the UI. Two internal identifiers keep the project's working name (`monday_replica` as the IndexedDB database and the old localStorage key): invisible to users, and renaming them would orphan the data already saved on this machine, so they stay until the backend replaces local storage.
