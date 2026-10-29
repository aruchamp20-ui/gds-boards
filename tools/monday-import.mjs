// Exports monday.com boards into data/import/ as bundles the app loads on boot (lib/data.js autoImport).
// usage: node tools/monday-import.mjs --workspace 9545876 [--folder <id>] [--boards <id,id>] [--out data/import] [--skip-updates] [--resume] [--limit N] [--parallel 2]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { gql, callCount } from './monday-api.mjs';
import * as M from './monday-map.mjs';

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const wsId = opt('workspace', '9545876'); const folderId = opt('folder'); const onlyBoards = opt('boards') ? opt('boards').split(',').map((s) => s.trim()) : null;
const out = opt('out', 'data/import'); const limit = Number(opt('limit', '0')); const parallel = Number(opt('parallel', '2')); const skipUpdates = flag('skip-updates'); const resume = flag('resume');
const now = new Date().toISOString();
const t0 = Date.now();
const log = (s) => process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}\n`);
mkdirSync(`${out}/boards`, { recursive: true });

/* ---------- account-level data ---------- */
const meRes = await gql(`{ me { id email name } }`);
const meEmail = meRes.me?.email || '';
const mUsers = [];
for (let page = 1; page <= 50; page++) { const d = await gql(`query($p: Int!) { users(limit: 200, page: $p) { id name email title enabled is_admin is_guest photo_thumb_small time_zone_identifier } }`, { p: page }); mUsers.push(...(d.users || [])); if ((d.users || []).length < 200) break; }
const teams = (await gql(`{ teams { id name users { id } } }`)).teams || [];
const wsRes = await gql(`query($ids: [ID!]) { workspaces(ids: $ids) { id name kind description } }`, { ids: [wsId] });
const ws = wsRes.workspaces?.[0]; if (!ws) throw new Error(`workspace ${wsId} not found`);
const fRes = await gql(`query($ws: [ID!]) { folders(workspace_ids: $ws, limit: 100) { id name color parent { id } } }`, { ws: [wsId] });
const mFolders = fRes.folders || []; const folderIds = new Set(mFolders.map((f) => String(f.id)));
log(`account: ${mUsers.length} users, ${teams.length} teams, workspace "${ws.name}" with ${mFolders.length} folders`);

const users = new Map(mUsers.map((u) => [M.userId(u.id), M.mapUser(u)]));
const ctxBase = { now, user: (id, name = null) => { const cid = M.userId(id); let u = users.get(cid); if (!u) { u = M.placeholderUser(id); users.set(cid, u); } if (name && u.deactivated && /^Former user /.test(u.name)) u.name = name; return cid; } };

/* ---------- board selection ---------- */
const all = [];
for (let page = 1; page <= 20; page++) { const d = await gql(`query($ws: [ID!], $p: Int!) { boards(workspace_ids: $ws, limit: 100, page: $p, state: active, order_by: used_at) { id name type state board_folder_id items_count } }`, { ws: [wsId], p: page }); all.push(...(d.boards || [])); if ((d.boards || []).length < 100) break; }
const under = (fid) => { const set = new Set([String(fid)]); let grew = true; while (grew) { grew = false; for (const f of mFolders) if (f.parent?.id && set.has(String(f.parent.id)) && !set.has(String(f.id))) { set.add(String(f.id)); grew = true; } } return set; };
let selected = all.filter((b) => b.type === 'board' && b.state === 'active');
if (onlyBoards) selected = selected.filter((b) => onlyBoards.includes(String(b.id)));
if (folderId) { const set = under(folderId); selected = selected.filter((b) => b.board_folder_id && set.has(String(b.board_folder_id))); }
if (limit) selected = selected.slice(0, limit);
log(`selected ${selected.length} of ${all.length} boards, ${selected.reduce((a, b) => a + (b.items_count || 0), 0)} items`);

/* ---------- per-board export ---------- */
const FRAGS = ['... on MirrorValue { display_value }', '... on BoardRelationValue { display_value }', '... on DependencyValue { display_value }', '... on FormulaValue { display_value }'];
let frags = [...FRAGS];
const cvFields = () => `id type text value ${frags.join(' ')}`;
async function withFragFallback(fn) { // drop fragments the API version does not know
  for (;;) { try { return await fn(); } catch (e) { const m = /on (\w+Value)/.exec(String(e.message)); const bad = m && frags.find((f) => f.includes(m[1])); if (!bad || !/Unknown|Cannot query|doesn't exist|does not exist|undefined/i.test(e.message)) throw e; log(`  dropping fragment ${bad} (${e.message.slice(0, 80)})`); frags = frags.filter((f) => f !== bad); } }
}
let updatesQuery = `updates(limit: 100, page: $p) { id item_id creator_id body text_body created_at updated_at pinned_to_top { item_id } likes { creator_id } replies { id creator_id body text_body created_at updated_at } }`;
const errors = []; const entries = [];

async function exportBoard(b, index) {
  const file = `boards/mb_${b.id}.json`;
  if (resume && existsSync(`${out}/${file}`)) { try { const prev = JSON.parse(readFileSync(`${out}/${file}`, 'utf8')); entries.push(prev.summary); log(`skip ${b.name} (resume)`); return; } catch {} }
  const sRes = await gql(`query($id: [ID!]) { boards(ids: $id) { id name description board_kind state permissions item_terminology url updated_at workspace_id board_folder_id items_count owners { id } subscribers { id } columns { id title type settings_str description archived width } groups { id title color position archived deleted } views { id name type } } }`, { id: [b.id] });
  const mb = sRes.boards?.[0]; if (!mb) throw new Error('board not returned');
  const board = M.mapBoard(mb, { index, wsId, now, folderIds });
  const cols = []; const skipped = [];
  mb.columns.forEach((mc, i) => { const c = M.mapColumn(mc, i, mb.id, now); if (c) cols.push(c); else skipped.push(`${mc.title} (${mc.type})`); });
  if (!cols.some((c) => c.type === 'name')) cols.unshift({ id: `mc_${mb.id}_name`, monday_id: 'name', monday_type: 'name', board_id: board.id, title: 'Name', description: '', type: 'name', settings: {}, width: 320, position: -1, created_at: now });
  const colsByMondayId = Object.fromEntries(cols.map((c) => [c.monday_id, c])); const mcolsById = Object.fromEntries(mb.columns.map((c) => [c.id, c]));
  const groups = mb.groups.map((g, i) => M.mapGroup(g, i, mb.id, now));
  const groupIds = new Set(groups.map((g) => g.id));
  const views = M.mapViews(mb.views, cols, mb.id, now);
  const ctx = { ...ctxBase, position: 1, tagOption: (col, name) => { let o = col.settings.options.find((x) => x.text.toLowerCase() === name.toLowerCase()); if (!o) { o = { id: `tag_${col.settings.options.length + 1}`, text: name, color: M.PALETTE_NAMES[col.settings.options.length % M.PALETTE_NAMES.length] }; col.settings.options.push(o); } return o.id; } };
  // items
  const items = []; let cursor = null; let pages = 0;
  for (;;) {
    const q = cursor ? `query($c: String!) { next_items_page(cursor: $c, limit: 500) { cursor items { id name created_at updated_at creator_id group { id } column_values { ${cvFields()} } } } }` : `query($id: [ID!]) { boards(ids: $id) { items_page(limit: 500) { cursor items { id name created_at updated_at creator_id group { id } column_values { ${cvFields()} } } } } }`;
    const d = await withFragFallback(() => gql(q, cursor ? { c: cursor } : { id: [b.id] }));
    const pg = cursor ? d.next_items_page : d.boards?.[0]?.items_page; if (!pg) break;
    for (const it of pg.items) { const m = M.mapItem(it, mb.id, colsByMondayId, mcolsById, ctx); if (!groupIds.has(m.group_id)) { groups.push({ id: m.group_id, monday_id: it.group?.id, board_id: board.id, title: 'Other', color: 'grey', position: groups.length + 1, archived: false, created_at: now }); groupIds.add(m.group_id); } items.push(m); }
    pages++; cursor = pg.cursor; if (!cursor || !pg.items.length) break;
    if (pages > 200) { log(`  ${b.name}: stopped after 200 item pages`); break; }
  }
  // updates (board-level list covers every item's updates)
  const updates = []; let capped = false;
  if (!skipUpdates) {
    for (let p = 1; p <= 150; p++) {
      let d; try { d = await gql(`query($id: [ID!], $p: Int!) { boards(ids: $id) { ${updatesQuery} } }`, { id: [b.id], p }); } catch (e) { if (/likes|pinned_to_top|replies/.test(e.message) && updatesQuery.includes('likes')) { log(`  updates query trimmed (${e.message.slice(0, 80)})`); updatesQuery = updatesQuery.replace(' pinned_to_top { item_id }', '').replace(' likes { creator_id }', ''); p--; continue; } throw e; }
      const list = d.boards?.[0]?.updates || [];
      for (const u of list) { if (!u.item_id) continue; const top = M.mapUpdate(u, mb.id, ctx); updates.push(top); for (const r of u.replies || []) updates.push(M.mapUpdate({ ...r, item_id: u.item_id }, mb.id, ctx, top.id)); }
      if (list.length < 100) break; if (p === 150) capped = true;
    }
  }
  const itemIds = new Set(items.map((i) => i.id)); const kept = updates.filter((u) => itemIds.has(u.item_id));
  const summary = { id: board.id, monday_id: String(mb.id), name: mb.name, file, items: items.length, monday_items_count: mb.items_count ?? null, groups: groups.filter((g) => !g.archived).length, columns: cols.length, skipped_columns: skipped, updates: kept.length, updates_capped: capped, folder: board.folder_id };
  writeFileSync(`${out}/${file}`, JSON.stringify({ board, columns: cols, groups, views, items, updates: kept, summary }));
  entries.push(summary);
  log(`${String(index + 1).padStart(3)}/${selected.length} ${mb.name}: ${items.length} items (monday says ${mb.items_count}), ${groups.length} groups, ${cols.length} cols${skipped.length ? ` (${skipped.length} skipped)` : ''}, ${kept.length} updates`);
}

let next = 0;
async function worker() { while (next < selected.length) { const i = next++; const b = selected[i]; try { await exportBoard(b, i); } catch (e) { errors.push({ board: b.name, id: String(b.id), error: String(e.message).slice(0, 300) }); log(`ERROR ${b.name}: ${String(e.message).slice(0, 200)}`); } } }
await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));

const index = { generated_at: now, workspace_id: wsId, me_email: meEmail, meta: { me_email: meEmail, users: [...users.values()], teams: teams.map(M.mapTeam), workspaces: [M.mapWorkspace(ws, now)], folders: mFolders.map((f, i) => M.mapFolder(f, wsId, i, now)) }, boards: entries.sort((a, b) => a.name.localeCompare(b.name)), errors };
writeFileSync(`${out}/index.json`, JSON.stringify(index, null, 1));
log(`done: ${entries.length} boards, ${entries.reduce((a, e) => a + e.items, 0)} items, ${entries.reduce((a, e) => a + e.updates, 0)} updates, ${errors.length} errors, ${callCount()} API calls`);
if (errors.length) log(`errors: ${errors.map((e) => `${e.board}: ${e.error}`).join(' | ')}`);
