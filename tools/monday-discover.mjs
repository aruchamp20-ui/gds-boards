// Lists workspaces, and the folders + boards of one workspace with item counts. usage: node tools/monday-discover.mjs [workspaceId]
import { gql } from './monday-api.mjs';

const wsId = process.argv[2] || '9545876';
const ws = await gql(`{ workspaces(limit: 50) { id name kind is_default_workspace } }`);
console.log('WORKSPACES');
for (const w of ws.workspaces) console.log(`  ${w.id.padEnd(10)} ${w.kind.padEnd(7)} ${w.is_default_workspace ? '[default] ' : ''}${w.name}`);

const f = await gql(`query($ws: [ID!]) { folders(workspace_ids: $ws, limit: 100) { id name parent { id } } }`, { ws: [wsId] });
const folders = Object.fromEntries(f.folders.map((x) => [x.id, x]));
const path = (id) => { const out = []; let cur = folders[id]; while (cur) { out.unshift(cur.name); cur = cur.parent?.id ? folders[cur.parent.id] : null; } return out.join(' / '); };
console.log(`\nFOLDERS in workspace ${wsId}: ${f.folders.length}`);
for (const x of f.folders) console.log(`  ${x.id.padEnd(12)} ${path(x.id)}`);

const boards = [];
for (let page = 1; page <= 10; page++) {
  const d = await gql(`query($ws: [ID!], $page: Int!) { boards(workspace_ids: $ws, limit: 100, page: $page, state: active, order_by: used_at) { id name board_kind type items_count board_folder_id updated_at } }`, { ws: [wsId], page });
  boards.push(...d.boards);
  if (d.boards.length < 100) break;
}
const real = boards.filter((b) => b.type === 'board');
console.log(`\nBOARDS in workspace ${wsId}: ${boards.length} (${real.length} boards, ${boards.length - real.length} sub-item boards / docs / other)`);
console.log('  id            items  kind     folder                                   name');
for (const b of real.sort((a, c) => (path(a.board_folder_id) || '').localeCompare(path(c.board_folder_id) || '') || a.name.localeCompare(c.name))) console.log(`  ${String(b.id).padEnd(13)} ${String(b.items_count ?? '?').padStart(5)}  ${b.board_kind.padEnd(8)} ${(path(b.board_folder_id) || '(root)').padEnd(40).slice(0, 40)} ${b.name}`);
console.log(`\nTOTAL items across boards: ${real.reduce((a, b) => a + (b.items_count || 0), 0)}`);
