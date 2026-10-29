# GDS Boards

A work-management app (boards, groups, items, typed columns, Kanban and Calendar views, item updates, My Work) built clean-room with the Replica skill pack, styled in the GDS house style. Static HTML + ES modules; data lives in the browser (IndexedDB).

Run locally: `node serve.mjs` then open http://localhost:5173/ . Hosted copy: GitHub Pages serves this repository as-is.

Import your monday.com workspace: `node tools/monday-import.mjs --workspace <id>` writes `data/import/` (git-ignored, never published); the app loads it on its next start. `node tools/monday-verify.mjs` checks the export against monday live.

Planning files from the pipeline are in `replica/` (recon, architecture, design tokens, brand, build log).
