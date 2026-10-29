// Data layer. Async API over an in-memory store persisted to localStorage. /replica-backend swaps the bodies for fetch() calls; signatures stay.
import { uid, ymd, addDays, LABEL_COLORS, debounce } from './ui.js';
import { TYPES } from './columns.js';
import { idbGetAll, idbSetMany, idbClear, idbSupported } from './idb.js';

// Persistence: IndexedDB, one record for the small "meta" tables and one record per board for items / updates / activity,
// so a cell edit on a 4,000-row board writes that board only. Old localStorage saves are migrated on first boot.
const LS_KEY = 'monday_replica_v1';
const META_KEYS = ['version', 'me', 'seq', 'users', 'teams', 'workspaces', 'folders', 'boards', 'views', 'groups', 'columns', 'favorites', 'notifications', 'prefs', 'importStamp'];
const listeners = new Set();
let state = null;
const now = () => new Date().toISOString();
const dirty = new Set();        // 'meta' | 'items:<bid>' | 'updates:<bid>' | 'activity:<bid>'
const updatesIdx = new Map();   // item id -> its updates (unsorted)

export const store = { get: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
const dirtyItems = (bid) => dirty.add(`items:${bid}`);
const dirtyUpdates = (itemId) => { const it = item(itemId); if (it) dirty.add(`updates:${it.board_id}`); };
const dirtyActivity = (bid) => dirty.add(`activity:${bid}`);

let saving = Promise.resolve();
const persist = debounce(() => { saving = saving.then(flush).catch((e) => { console.warn('persist failed', e); listeners.forEach((fn) => fn('storage-error')); }); }, 150);
async function flush() {
  if (!state || !dirty.size) return;
  const keys = [...dirty]; dirty.clear();
  const entries = [['meta', Object.fromEntries(META_KEYS.map((k) => [k, state[k]]))]];
  for (const k of keys) {
    const i = k.indexOf(':'); if (i < 0) continue;
    const kind = k.slice(0, i), bid = k.slice(i + 1);
    entries.push([k, kind === 'items' ? state.items.filter((x) => x.board_id === bid) : kind === 'updates' ? state.updates.filter((x) => x.board_id === bid) : state.activity.filter((x) => x.board_id === bid)]);
  }
  if (!idbSupported()) { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} return; }
  await idbSetMany(entries);
}
function commit(what = 'change') { dirty.add('meta'); persist(); listeners.forEach((fn) => fn(what)); }
export const whenSaved = () => saving;

/* ---------- boot ---------- */
export async function boot() {
  let loaded = null;
  if (idbSupported()) { try { const all = await idbGetAll(); if (all.meta?.version === 1) loaded = assemble(all); } catch (e) { console.warn('idb load failed', e); } }
  if (!loaded) { try { const raw = localStorage.getItem(LS_KEY); if (raw) { const s = JSON.parse(raw); if (s.version === 1) loaded = s; } } catch {} if (loaded) dirtyAll(loaded); }
  state = loaded || seed();
  if (!loaded) dirtyAll(state);
  reindex();
  if (dirty.size) { await flush().catch((e) => console.warn('initial save failed', e)); if (idbSupported()) { try { localStorage.removeItem(LS_KEY); } catch {} } }
  return state;
}
function assemble(all) {
  const s = { ...all.meta, items: [], updates: [], activity: [] };
  for (const [k, v] of Object.entries(all)) { if (k.startsWith('items:')) s.items.push(...v); else if (k.startsWith('updates:')) s.updates.push(...v); else if (k.startsWith('activity:')) s.activity.push(...v); }
  return s;
}
function dirtyAll(s) { dirty.add('meta'); for (const b of s.boards) { dirty.add(`items:${b.id}`); dirty.add(`updates:${b.id}`); dirty.add(`activity:${b.id}`); } }
function reindex() {
  // once real people are imported, the demo seed people step aside: hidden from pickers, members and mentions, still shown on the demo boards' cells
  if (state.users.some((u) => u.id.startsWith('mu_'))) state.users.forEach((u) => { if (u.id.startsWith('u_')) u.deactivated = true; });
  updatesIdx.clear();
  for (const u of state.updates) { if (!u.board_id) u.board_id = state.items.find((i) => i.id === u.item_id)?.board_id || null; let a = updatesIdx.get(u.item_id); if (!a) updatesIdx.set(u.item_id, (a = [])); a.push(u); }
}
export async function resetDemo() { try { await idbClear(); } catch {} try { localStorage.removeItem(LS_KEY); } catch {} state = seed(); dirtyAll(state); reindex(); commit('reset'); }

/* ---------- import (monday.com export bundles written by tools/monday-import.mjs) ---------- */
function upsert(arr, rows) { if (!rows?.length) return; const byId = new Map(arr.map((x, i) => [x.id, i])); for (const r of rows) { const i = byId.get(r.id); if (i == null) { byId.set(r.id, arr.length); arr.push(r); } else arr[i] = r; } }
export function importBundle(bundle, { defer = false, viewer = null } = {}) {
  if (bundle.users) upsert(state.users, bundle.users);
  if (bundle.teams) upsert(state.teams, bundle.teams);
  if (bundle.workspaces) upsert(state.workspaces, bundle.workspaces);
  if (bundle.folders) upsert(state.folders, bundle.folders);
  if (bundle.board) { // a board bundle replaces that board's structure and content wholesale, so re-running the import is safe
    const b = bundle.board; const id = b.id;
    if (viewer && b.kind === 'private' && !b.subscriber_ids.includes(viewer)) b.subscriber_ids.push(viewer); // the exporting account could read it, so it stays visible here
    state.columns = state.columns.filter((c) => c.board_id !== id); state.groups = state.groups.filter((g) => g.board_id !== id); state.views = state.views.filter((v) => v.board_id !== id);
    state.items = state.items.filter((i) => i.board_id !== id); state.updates = state.updates.filter((u) => u.board_id !== id);
    upsert(state.boards, [b]);
    state.columns.push(...(bundle.columns || [])); state.groups.push(...(bundle.groups || [])); state.views.push(...(bundle.views || []));
    state.items.push(...(bundle.items || [])); state.updates.push(...(bundle.updates || []).map((u) => ({ ...u, board_id: id })));
    for (const it of bundle.items || []) if (it.seq > state.seq) state.seq = it.seq;
    dirtyItems(id); dirty.add(`updates:${id}`); dirtyActivity(id);
  }
  if (!defer) { reindex(); commit('import'); }
}
export async function autoImport({ force = false, onProgress } = {}) {
  let index;
  try { const r = await fetch('data/import/index.json', { cache: 'no-store' }); if (!r.ok) return null; index = await r.json(); } catch { return null; }
  if (!force && index.generated_at === state.importStamp) return { skipped: true, index };
  importBundle(index.meta || {}, { defer: true });
  const viewer = (index.meta?.me_email && state.users.find((u) => (u.email || '').toLowerCase() === index.meta.me_email.toLowerCase())?.id) || null;
  const files = (index.boards || []).map((b) => b.file); let done = 0, failed = 0;
  for (let i = 0; i < files.length; i += 8) {
    const chunk = await Promise.all(files.slice(i, i + 8).map((f) => fetch(`data/import/${f}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    for (const bundle of chunk) { if (bundle) importBundle(bundle, { defer: true, viewer }); else failed++; }
    done += chunk.length; onProgress?.(done, files.length);
  }
  state.importStamp = index.generated_at;
  const current = state.users.find((u) => u.id === state.me);
  const mine = index.meta?.me_email && state.users.find((u) => (u.email || '').toLowerCase() === index.meta.me_email.toLowerCase());
  if (mine && (!current || current.id.startsWith('u_'))) state.me = mine.id;
  if (index.meta?.workspaces?.[0]) state.prefs.lastWorkspace = index.meta.workspaces[0].id;
  reindex(); dirtyAll(state); commit('import');
  return { imported: done - failed, failed, index };
}

/* ---------- helpers ---------- */
const byPos = (a, b) => a.position - b.position;
const nextPos = (arr, where = 'bottom') => {
  if (!arr.length) return 1;
  const ps = arr.map((x) => x.position);
  if (where === 'top') return Math.min(...ps) - 1;
  return Math.max(...ps) + 1;
};
function posBefore(sorted, beforeId) { // position that lands before `beforeId`, or at the end when null
  if (!beforeId) return sorted.length ? sorted[sorted.length - 1].position + 1 : 1;
  const i = sorted.findIndex((x) => x.id === beforeId);
  const prev = sorted[i - 1];
  return prev ? (prev.position + sorted[i].position) / 2 : sorted[i].position - 1;
}
function log(board_id, item_id, event, extra = {}) {
  state.activity.unshift({ id: uid('act'), board_id, item_id, user_id: state.me, event, column_id: null, old_value: null, new_value: null, created_at: now(), ...extra });
  if (state.activity.length > 20000) state.activity.length = 20000;
  dirtyActivity(board_id);
}
function touch(item) { item.updated_at = now(); dirtyItems(item.board_id); }

/* ---------- users ---------- */
export const me = () => state.users.find((u) => u.id === state.me) || state.users[0];
export const users = () => state.users;
export const activeUsers = () => state.users.filter((u) => !u.deactivated).sort((a, b) => a.name.localeCompare(b.name));
export const user = (id) => state.users.find((u) => u.id === id);
export const teams = () => state.teams;
export function setMe(id) { state.me = id; commit(); }

/* ---------- workspaces & folders ---------- */
export const workspaces = () => state.workspaces.filter((w) => w.state === 'active');
export const workspace = (id) => state.workspaces.find((w) => w.id === id);
export const defaultWorkspace = () => state.workspaces.find((w) => w.is_default);
export async function createWorkspace(name, kind = 'open') { const w = { id: uid('ws'), name, kind, description: '', is_default: false, state: 'active', created_at: now() }; state.workspaces.push(w); commit(); return w; }
export async function updateWorkspace(id, patch) { Object.assign(workspace(id), patch); commit(); }
export async function deleteWorkspace(id) { const w = workspace(id); if (w.is_default) throw new Error('The main workspace cannot be deleted'); w.state = 'deleted'; state.boards.filter((b) => b.workspace_id === id && b.state === 'active').forEach((b) => { b.state = 'deleted'; b.deleted_at = now(); }); commit(); }
export const foldersIn = (wsId) => state.folders.filter((f) => f.workspace_id === wsId).sort(byPos);
export async function createFolder(wsId, name, parent_folder_id = null) { const f = { id: uid('fld'), workspace_id: wsId, parent_folder_id, name, color: 'grey', position: nextPos(foldersIn(wsId)), created_at: now() }; state.folders.push(f); commit(); return f; }
export async function updateFolder(id, patch) { Object.assign(state.folders.find((f) => f.id === id), patch); commit(); }
export async function deleteFolder(id) { state.boards.filter((b) => b.folder_id === id).forEach((b) => (b.folder_id = null)); state.folders = state.folders.filter((f) => f.id !== id); commit(); }

/* ---------- boards ---------- */
export const board = (id) => state.boards.find((b) => b.id === id);
export const boardsIn = (wsId) => state.boards.filter((b) => b.workspace_id === wsId && b.state === 'active' && canSee(b)).sort(byPos);
export const allBoards = () => state.boards.filter((b) => b.state === 'active' && canSee(b));
export const canSee = (b) => b.kind !== 'private' || b.owner_ids.includes(state.me) || b.subscriber_ids.includes(state.me);
export const isOwner = (b) => b.owner_ids.includes(state.me) || !!me()?.is_admin;

function defaultLabels() { return TYPES.status.defaultSettings().labels; }
export async function createBoard({ name, kind = 'public', workspace_id, folder_id = null, empty = false }) {
  const id = uid('b');
  const b = { id, workspace_id, folder_id, name, description: '', kind, state: 'active', permissions: 'everyone', item_terminology: 'item', position: nextPos(state.boards.filter((x) => x.workspace_id === workspace_id)), created_by: state.me, owner_ids: [state.me], subscriber_ids: [state.me], deleted_at: null, created_at: now(), updated_at: now() };
  state.boards.push(b);
  const cols = [
    { id: uid('c'), board_id: id, title: 'Item', type: 'name', settings: {}, description: '', width: 320, position: 0, created_at: now() },
    { id: uid('c'), board_id: id, title: 'Person', type: 'people', settings: { limit: 0 }, description: '', width: 130, position: 1, created_at: now() },
    { id: uid('c'), board_id: id, title: 'Status', type: 'status', settings: { labels: defaultLabels() }, description: '', width: 140, position: 2, created_at: now() },
    { id: uid('c'), board_id: id, title: 'Date', type: 'date', settings: { show_time: false }, description: '', width: 130, position: 3, created_at: now() },
  ];
  state.columns.push(...cols);
  const g = { id: uid('g'), board_id: id, title: 'Group Title', color: 'blue', position: 1, archived: false, created_at: now() };
  state.groups.push(g);
  state.views.push({ id: uid('v'), board_id: id, name: 'Main Table', type: 'table', settings: {}, filter: { logic: 'and', rules: [] }, sort: [], hidden_column_ids: [], position: 1, pinned: false, created_at: now() });
  if (!empty) for (let i = 1; i <= 3; i++) state.items.push(newItem(id, g.id, `Item ${i}`, i));
  log(id, null, 'board_created', { new_value: name });
  commit();
  return b;
}
export async function updateBoard(id, patch) { const b = board(id); const old = { ...b }; Object.assign(b, patch, { updated_at: now() }); if (patch.name && patch.name !== old.name) log(id, null, 'board_renamed', { old_value: old.name, new_value: patch.name }); if (patch.kind && patch.kind !== old.kind) log(id, null, 'board_kind', { old_value: old.kind, new_value: patch.kind }); commit(); return b; }
export async function deleteBoard(id, mode = 'deleted') { const b = board(id); b.state = mode; b.deleted_at = now(); state.favorites = state.favorites.filter((f) => f.board_id !== id); commit(); }
export async function restoreBoard(id) { const b = board(id); b.state = 'active'; b.deleted_at = null; commit(); }
export async function duplicateBoard(id, mode = 'structure') {
  const src = board(id);
  const nb = { ...src, id: uid('b'), name: `Duplicate of ${src.name}`, position: nextPos(state.boards.filter((x) => x.workspace_id === src.workspace_id)), created_at: now(), updated_at: now(), created_by: state.me, owner_ids: [state.me], subscriber_ids: [state.me] };
  state.boards.push(nb);
  const colMap = {}; const grpMap = {};
  columnsOf(id).forEach((c) => { const nc = { ...c, id: uid('c'), board_id: nb.id, settings: JSON.parse(JSON.stringify(c.settings)) }; colMap[c.id] = nc.id; state.columns.push(nc); });
  groupsOf(id).forEach((g) => { const ng = { ...g, id: uid('g'), board_id: nb.id }; grpMap[g.id] = ng.id; state.groups.push(ng); });
  viewsOf(id).forEach((v) => { const nv = JSON.parse(JSON.stringify(v)); nv.id = uid('v'); nv.board_id = nb.id; nv.hidden_column_ids = v.hidden_column_ids.map((c) => colMap[c]).filter(Boolean); nv.filter.rules = v.filter.rules.map((r) => ({ ...r, column_id: colMap[r.column_id] })).filter((r) => r.column_id); nv.sort = v.sort.map((s) => ({ ...s, column_id: colMap[s.column_id] })).filter((s) => s.column_id); for (const k of Object.keys(nv.settings)) if (typeof nv.settings[k] === 'string' && colMap[nv.settings[k]]) nv.settings[k] = colMap[nv.settings[k]]; if (Array.isArray(nv.settings.card_column_ids)) nv.settings.card_column_ids = nv.settings.card_column_ids.map((c) => colMap[c]).filter(Boolean); state.views.push(nv); });
  if (mode !== 'structure') itemsOf(id).forEach((it) => { const ni = { ...it, id: uid('i'), board_id: nb.id, group_id: grpMap[it.group_id], seq: ++state.seq, values: {}, created_at: now(), updated_at: now() }; for (const [cid, v] of Object.entries(it.values)) if (colMap[cid]) ni.values[colMap[cid]] = JSON.parse(JSON.stringify(v)); state.items.push(ni); if (mode === 'items_updates') copyUpdates(it.id, ni.id, nb.id); });
  dirtyItems(nb.id);
  log(nb.id, null, 'board_created', { new_value: nb.name });
  commit();
  return nb;
}
export const favorites = () => state.favorites.filter((f) => f.user_id === state.me).sort(byPos).map((f) => board(f.board_id)).filter((b) => b && b.state === 'active');
export const isFavorite = (bid) => state.favorites.some((f) => f.user_id === state.me && f.board_id === bid);
export async function toggleFavorite(bid) { if (isFavorite(bid)) state.favorites = state.favorites.filter((f) => !(f.user_id === state.me && f.board_id === bid)); else state.favorites.push({ user_id: state.me, board_id: bid, position: nextPos(state.favorites) }); commit(); }

/* ---------- groups / columns / views ---------- */
export const groupsOf = (bid) => state.groups.filter((g) => g.board_id === bid && !g.archived).sort(byPos);
export const columnsOf = (bid) => state.columns.filter((c) => c.board_id === bid).sort(byPos);
export const column = (id) => state.columns.find((c) => c.id === id);
export const viewsOf = (bid) => state.views.filter((v) => v.board_id === bid).sort((a, b) => (b.pinned - a.pinned) || a.position - b.position);
export const view = (id) => state.views.find((v) => v.id === id);
export const group = (id) => state.groups.find((g) => g.id === id);

export async function createGroup(bid, { title = 'New Group', where = 'top', color } = {}) {
  const gs = groupsOf(bid);
  const g = { id: uid('g'), board_id: bid, title, color: color || LABEL_COLORS[gs.length % LABEL_COLORS.length], position: nextPos(gs, where), archived: false, created_at: now() };
  state.groups.push(g); log(bid, null, 'group_created', { new_value: title }); commit(); return g;
}
export async function updateGroup(id, patch) { const g = group(id); if (patch.title && patch.title !== g.title) log(g.board_id, null, 'group_renamed', { old_value: g.title, new_value: patch.title }); Object.assign(g, patch); commit(); return g; }
export async function moveGroup(id, beforeId) { const g = group(id); const sorted = groupsOf(g.board_id).filter((x) => x.id !== id); g.position = posBefore(sorted, beforeId); commit(); }
export async function deleteGroup(id) { const g = group(id); if (groupsOf(g.board_id).length <= 1) throw new Error('A board needs at least one group'); const ids = itemsInGroup(id).map((i) => i.id); await deleteItems(ids, { silent: true }); g.archived = true; log(g.board_id, null, 'group_deleted', { old_value: g.title }); commit(); return ids; }
export async function restoreGroup(id, itemIds) { group(id).archived = false; await restoreItems(itemIds); }
export async function duplicateGroup(id, withUpdates = false) {
  const g = group(id); const ng = { ...g, id: uid('g'), title: `Duplicate of ${g.title}`, position: g.position + 0.5, created_at: now() }; state.groups.push(ng);
  itemsInGroup(id).forEach((it) => { const ni = { ...it, id: uid('i'), group_id: ng.id, seq: ++state.seq, values: JSON.parse(JSON.stringify(it.values)), created_at: now(), updated_at: now() }; state.items.push(ni); if (withUpdates) copyUpdates(it.id, ni.id, it.board_id); });
  dirtyItems(g.board_id);
  renumber(groupsOf(g.board_id)); commit(); return ng;
}
function renumber(sorted) { sorted.forEach((x, i) => (x.position = i + 1)); }

export async function createColumn(bid, type, title) {
  const T = TYPES[type]; const cols = columnsOf(bid);
  const c = { id: uid('c'), board_id: bid, title: title || T.label, type, settings: T.defaultSettings ? T.defaultSettings() : {}, description: '', width: T.defaultWidth || 140, position: nextPos(cols), created_at: now() };
  state.columns.push(c); log(bid, null, 'column_created', { new_value: c.title }); commit(); return c;
}
export async function updateColumn(id, patch) { const c = column(id); if (patch.title && patch.title !== c.title) log(c.board_id, null, 'column_renamed', { old_value: c.title, new_value: patch.title }); Object.assign(c, patch); commit(); return c; }
export async function moveColumn(id, beforeId) { const c = column(id); const sorted = columnsOf(c.board_id).filter((x) => x.id !== id && x.type !== 'name'); const nameCol = columnsOf(c.board_id).find((x) => x.type === 'name'); c.position = posBefore(sorted, beforeId); if (nameCol && c.position <= nameCol.position) c.position = nameCol.position + 0.5; commit(); }
export async function deleteColumn(id) { const c = column(id); if (c.type === 'name') throw new Error('The item name column cannot be deleted'); state.columns = state.columns.filter((x) => x.id !== id); state.items.filter((i) => i.board_id === c.board_id).forEach((i) => delete i.values[id]); dirtyItems(c.board_id); state.views.filter((v) => v.board_id === c.board_id).forEach((v) => { v.hidden_column_ids = v.hidden_column_ids.filter((x) => x !== id); v.filter.rules = v.filter.rules.filter((r) => r.column_id !== id); v.sort = v.sort.filter((s) => s.column_id !== id); }); log(c.board_id, null, 'column_deleted', { old_value: c.title }); commit(); }
export async function duplicateColumn(id, withValues) { const c = column(id); const nc = { ...c, id: uid('c'), title: `${c.title} (copy)`, settings: JSON.parse(JSON.stringify(c.settings)), position: c.position + 0.5, created_at: now() }; state.columns.push(nc); if (withValues) state.items.filter((i) => i.board_id === c.board_id && i.values[id] != null).forEach((i) => (i.values[nc.id] = JSON.parse(JSON.stringify(i.values[id])))); renumber(columnsOf(c.board_id)); commit(); return nc; }

export async function createView(bid, { type = 'table', name, settings = {}, filter, sort, hidden_column_ids } = {}) {
  const names = { table: 'Table', kanban: 'Kanban', calendar: 'Calendar' };
  const v = { id: uid('v'), board_id: bid, name: name || names[type], type, settings, filter: filter || { logic: 'and', rules: [] }, sort: sort || [], hidden_column_ids: hidden_column_ids || [], position: nextPos(viewsOf(bid)), pinned: false, created_at: now() };
  state.views.push(v); commit(); return v;
}
export async function updateView(id, patch) { Object.assign(view(id), patch); commit(); return view(id); }
export async function deleteView(id) { const v = view(id); if (viewsOf(v.board_id).length <= 1) throw new Error('A board needs at least one view'); state.views = state.views.filter((x) => x.id !== id); commit(); }
export async function duplicateView(id) { const v = view(id); const nv = JSON.parse(JSON.stringify(v)); nv.id = uid('v'); nv.name = `${v.name} (copy)`; nv.position = nextPos(viewsOf(v.board_id)); nv.pinned = false; state.views.push(nv); commit(); return nv; }
export async function moveView(id, beforeId) { const v = view(id); v.position = posBefore(viewsOf(v.board_id).filter((x) => x.id !== id), beforeId); commit(); }

/* ---------- items ---------- */
function newItem(board_id, group_id, name, position, values = {}) { dirtyItems(board_id); return { id: uid('i'), seq: ++state.seq, board_id, group_id, parent_item_id: null, name, position, state: 'active', created_by: state.me, deleted_at: null, created_at: now(), updated_at: now(), values }; }
export const item = (id) => state.items.find((i) => i.id === id);
export const itemsOf = (bid) => state.items.filter((i) => i.board_id === bid && i.state === 'active' && !i.parent_item_id).sort(byPos);
export const itemsInGroup = (gid) => state.items.filter((i) => i.group_id === gid && i.state === 'active' && !i.parent_item_id).sort(byPos);
export async function createItem({ board_id, group_id, name, where = 'bottom', after = null, values = {} }) {
  const gs = itemsInGroup(group_id);
  let position = nextPos(gs, where);
  if (after) { const sorted = gs; const i = sorted.findIndex((x) => x.id === after); position = i >= 0 ? posBefore(sorted, sorted[i + 1]?.id || null) : position; }
  const it = newItem(board_id, group_id, name, position, values);
  state.items.push(it); log(board_id, it.id, 'item_created', { new_value: name });
  notifyAssigned(it, values); commit(); return it;
}
export async function updateItem(id, patch) { const it = item(id); if (patch.name && patch.name !== it.name) log(it.board_id, id, 'item_renamed', { old_value: it.name, new_value: patch.name }); Object.assign(it, patch); touch(it); commit(); return it; }
export async function moveItem(id, { group_id, before = null }) {
  const it = item(id); const from = group(it.group_id);
  const sorted = itemsInGroup(group_id).filter((x) => x.id !== id);
  it.position = posBefore(sorted, before);
  if (it.group_id !== group_id) { log(it.board_id, id, 'item_moved', { old_value: from?.title, new_value: group(group_id)?.title }); it.group_id = group_id; }
  touch(it); commit();
}
export async function moveItemsToGroup(ids, group_id) { for (const id of ids) await moveItem(id, { group_id, before: null }); }
export async function setValue(it, col, value) {
  const old = it.values[col.id] ?? null;
  if (JSON.stringify(old) === JSON.stringify(value)) return;
  if (value == null) delete it.values[col.id]; else it.values[col.id] = value;
  touch(it);
  log(it.board_id, it.id, 'value_changed', { column_id: col.id, old_value: old, new_value: value });
  if (col.type === 'people') notifyAssigned(it, { [col.id]: value }, old);
  commit();
}
function notifyAssigned(it, values, old) {
  for (const [cid, v] of Object.entries(values || {})) {
    const c = column(cid); if (!c || c.type !== 'people' || !v) continue;
    const before = new Set(old?.user_ids || []);
    for (const uidx of v.user_ids || []) if (uidx !== state.me && !before.has(uidx)) state.notifications.unshift({ id: uid('n'), user_id: uidx, kind: 'assigned', item_id: it.id, update_id: null, actor_id: state.me, read_at: null, created_at: now() });
  }
}
export async function deleteItems(ids, { silent = false, mode = 'deleted' } = {}) { ids.forEach((id) => { const it = item(id); if (!it) return; it.state = mode; it.deleted_at = now(); dirtyItems(it.board_id); if (!silent) log(it.board_id, id, mode === 'archived' ? 'item_archived' : 'item_deleted', { old_value: it.name }); }); commit(); }
export async function restoreItems(ids) { ids.forEach((id) => { const it = item(id); if (!it) return; it.state = 'active'; it.deleted_at = null; dirtyItems(it.board_id); if (group(it.group_id)?.archived) { const g = groupsOf(it.board_id)[0]; if (g) it.group_id = g.id; } log(it.board_id, id, 'item_restored', { new_value: it.name }); }); commit(); }
export async function duplicateItems(ids, withUpdates = false) {
  const out = [];
  for (const id of ids) {
    const it = item(id); const sorted = itemsInGroup(it.group_id);
    const ni = { ...it, id: uid('i'), seq: ++state.seq, name: `${it.name} (copy)`, values: JSON.parse(JSON.stringify(it.values)), position: posBefore(sorted, sorted[sorted.findIndex((x) => x.id === id) + 1]?.id || null), created_at: now(), updated_at: now(), created_by: state.me };
    state.items.push(ni); if (withUpdates) copyUpdates(it.id, ni.id, it.board_id); log(it.board_id, ni.id, 'item_created', { new_value: ni.name }); out.push(ni);
  }
  commit(); return out;
}
export async function moveItemsToBoard(ids, bid) { const g = groupsOf(bid)[0]; if (!g) return; const cols = columnsOf(bid); ids.forEach((id) => { const it = item(id); const srcCols = columnsOf(it.board_id); const values = {}; for (const [cid, v] of Object.entries(it.values)) { const sc = srcCols.find((c) => c.id === cid); const tc = cols.find((c) => c.type === sc?.type && c.title === sc?.title); if (tc && tc.type !== 'status' && tc.type !== 'dropdown') values[tc.id] = v; } log(it.board_id, id, 'item_moved', { old_value: board(it.board_id)?.name, new_value: board(bid)?.name }); dirtyItems(it.board_id); const moved = (updatesIdx.get(id) || []); moved.forEach((u) => { dirty.add(`updates:${u.board_id}`); u.board_id = bid; }); dirty.add(`updates:${bid}`); it.board_id = bid; it.group_id = g.id; it.values = values; it.position = nextPos(itemsInGroup(g.id)); touch(it); }); commit(); }
export const subitemsOf = (pid) => state.items.filter((i) => i.parent_item_id === pid && i.state === 'active').sort(byPos);

/* ---------- updates ---------- */
export const updatesOf = (itemId) => [...(updatesIdx.get(itemId) || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
export const updateCount = (itemId) => (updatesIdx.get(itemId) || []).length;
export const hasRecentUpdate = (itemId) => { const cut = Date.now() - 7 * 864e5; return (updatesIdx.get(itemId) || []).some((u) => new Date(u.created_at).getTime() > cut); };
function addUpdate(u) { state.updates.push(u); let a = updatesIdx.get(u.item_id); if (!a) updatesIdx.set(u.item_id, (a = [])); a.push(u); dirty.add(`updates:${u.board_id}`); return u; }
function copyUpdates(fromItemId, toItemId, boardId) { // keeps reply threading by remapping parent ids
  const src = updatesOf(fromItemId); const map = new Map(src.map((u) => [u.id, uid('u')]));
  for (const u of src) addUpdate({ ...u, id: map.get(u.id), item_id: toItemId, board_id: boardId, parent_update_id: u.parent_update_id ? map.get(u.parent_update_id) || null : null, likes: [...u.likes], seen_by: [...u.seen_by] });
}
export async function createUpdate(itemId, body, parent_update_id = null) {
  const it = item(itemId);
  const u = addUpdate({ id: uid('u'), item_id: itemId, board_id: it?.board_id || null, parent_update_id, creator_id: state.me, body, pinned: false, likes: [], seen_by: [state.me], edited_at: null, created_at: now() });
  if (it) { touch(it); log(it.board_id, itemId, parent_update_id ? 'reply_posted' : 'update_posted', { new_value: body.slice(0, 120) }); }
  for (const m of body.matchAll(/@\[([^\]]+)\]/g)) { const u2 = state.users.find((x) => x.name === m[1]); if (u2 && u2.id !== state.me) state.notifications.unshift({ id: uid('n'), user_id: u2.id, kind: 'mention', item_id: itemId, update_id: u.id, actor_id: state.me, read_at: null, created_at: now() }); const t = state.teams.find((x) => x.name === m[1]); if (t) t.member_ids.filter((x) => x !== state.me).forEach((x) => state.notifications.unshift({ id: uid('n'), user_id: x, kind: 'mention', item_id: itemId, update_id: u.id, actor_id: state.me, read_at: null, created_at: now() })); }
  if (parent_update_id) { const p = state.updates.find((x) => x.id === parent_update_id); if (p && p.creator_id !== state.me) state.notifications.unshift({ id: uid('n'), user_id: p.creator_id, kind: 'reply', item_id: itemId, update_id: u.id, actor_id: state.me, read_at: null, created_at: now() }); }
  commit(); return u;
}
export async function editUpdate(id, body) { const u = state.updates.find((x) => x.id === id); u.body = body; u.edited_at = now(); dirty.add(`updates:${u.board_id}`); commit(); }
export async function deleteUpdate(id) {
  const gone = new Set(state.updates.filter((x) => x.id === id || x.parent_update_id === id).map((x) => x.id));
  const victims = state.updates.filter((x) => gone.has(x.id));
  state.updates = state.updates.filter((x) => !gone.has(x.id));
  for (const v of victims) { updatesIdx.set(v.item_id, (updatesIdx.get(v.item_id) || []).filter((x) => !gone.has(x.id))); dirty.add(`updates:${v.board_id}`); }
  commit();
}
export async function toggleLike(id) { const u = state.updates.find((x) => x.id === id); const i = u.likes.indexOf(state.me); if (i >= 0) u.likes.splice(i, 1); else u.likes.push(state.me); dirty.add(`updates:${u.board_id}`); commit(); }
export async function pinUpdate(id, pinned) { const u = state.updates.find((x) => x.id === id); u.pinned = pinned; dirty.add(`updates:${u.board_id}`); commit(); }
export function markSeen(itemId) { let changed = false; (updatesIdx.get(itemId) || []).forEach((u) => { if (!u.seen_by.includes(state.me)) { u.seen_by.push(state.me); changed = true; } }); if (changed) { dirtyUpdates(itemId); persist(); } }

/* ---------- activity / notifications / my work / search / trash ---------- */
export const activityOf = (bid, { itemId = null, userId = null } = {}) => state.activity.filter((a) => a.board_id === bid && (!itemId || a.item_id === itemId) && (!userId || a.user_id === userId));
export const notifications = () => state.notifications.filter((n) => n.user_id === state.me);
export const unreadCount = () => notifications().filter((n) => !n.read_at).length;
export async function markRead(id) { const n = state.notifications.find((x) => x.id === id); if (n && !n.read_at) { n.read_at = now(); commit(); } }
export async function markAllRead() { notifications().forEach((n) => (n.read_at = n.read_at || now())); commit(); }
export function myWork(userId = state.me) {
  const out = [];
  for (const b of allBoards()) {
    const cols = columnsOf(b.id); const people = cols.filter((c) => c.type === 'people'); if (!people.length) continue;
    const dateCol = cols.find((c) => c.id === b.mywork_date_col) || cols.find((c) => c.type === 'date'); const statusCol = cols.find((c) => c.id === b.mywork_status_col) || cols.find((c) => c.type === 'status');
    for (const it of itemsOf(b.id)) if (people.some((p) => (it.values[p.id]?.user_ids || []).includes(userId))) out.push({ item: it, board: b, group: group(it.group_id), dateCol, statusCol, peopleCol: people.find((p) => (it.values[p.id]?.user_ids || []).includes(userId)) });
  }
  return out;
}
export function search(q) {
  q = q.trim().toLowerCase(); if (!q) return { boards: [], items: [], people: [] };
  const boards = allBoards().filter((b) => b.name.toLowerCase().includes(q));
  const items = []; const textOf = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? Object.values(v).filter((x) => typeof x === 'string').join(' ') : '');
  const visible = new Set(allBoards().map((b) => b.id));
  for (const it of state.items) { if (it.state !== 'active' || it.parent_item_id || !visible.has(it.board_id)) continue; if (it.name.toLowerCase().includes(q) || Object.values(it.values).some((v) => textOf(v).toLowerCase().includes(q))) { items.push({ item: it, board: board(it.board_id), group: group(it.group_id) }); if (items.length >= 200) break; } }
  const people = state.users.filter((u) => u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  return { boards, items, people };
}
export const trash = () => ({ boards: state.boards.filter((b) => b.state !== 'active').sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)), items: state.items.filter((i) => i.state !== 'active' && board(i.board_id)?.state === 'active').sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)) });
export async function purgeOld() { const cut = new Date(Date.now() - 30 * 864e5).toISOString(); state.items = state.items.filter((i) => i.state === 'active' || i.deleted_at > cut); state.boards = state.boards.filter((b) => b.state === 'active' || b.deleted_at > cut); }

/* ---------- prefs (per device) ---------- */
export const prefs = () => state.prefs;
export function setPref(k, v) { state.prefs[k] = v; dirty.add('meta'); persist(); }
export function toggleCollapsed(gid, all = null) { const c = state.prefs.collapsed; if (all === true) groupsOf(group(gid).board_id).forEach((g) => (c[g.id] = true)); else if (all === false) groupsOf(group(gid).board_id).forEach((g) => delete c[g.id]); else if (c[gid]) delete c[gid]; else c[gid] = true; commit('ui'); }
export function noteVisit(bid) { const r = state.prefs.recentBoards.filter((x) => x !== bid); r.unshift(bid); state.prefs.recentBoards = r.slice(0, 12); const b = board(bid); if (b) { b.last_viewed = b.last_viewed || {}; b.last_viewed[state.me] = now(); } dirty.add('meta'); persist(); }
export const folderTree = (wsId, parentId = null) => foldersIn(wsId).filter((f) => (f.parent_folder_id || null) === parentId);

/* ---------- seed ---------- */
function seed() {
  const t = ymd(); const d = (n) => addDays(t, n);
  const iso = (daysAgo, hour = 10) => { const x = new Date(); x.setDate(x.getDate() - daysAgo); x.setHours(hour, Math.floor(Math.random() * 50), 0, 0); return x.toISOString(); };
  const U = (id, name, title, color) => ({ id, name, email: `${name.toLowerCase().replace(' ', '.')}@example.com`, title, color, timezone: 'Europe/London', is_admin: id === 'u_arun' });
  const users = [U('u_arun', 'Arun Bondalapati', 'IT Systems', 'blue'), U('u_maya', 'Maya Patel', 'IT Support', 'purple'), U('u_tom', 'Tom Harris', 'Sales lead', 'teal'), U('u_priya', 'Priya Nair', 'HR partner', 'pink'), U('u_jack', 'Jack Lee', 'Marketing', 'orange'), U('u_sofia', 'Sofia Rossi', 'Design', 'violet'), U('u_ben', 'Ben Carter', 'Engineering', 'green'), U('u_amara', 'Amara Okafor', 'Operations', 'indigo')];
  const s = { version: 1, me: 'u_arun', seq: 1000, users, teams: [{ id: 't_it', name: 'IT', member_ids: ['u_arun', 'u_maya'] }, { id: 't_mkt', name: 'Marketing', member_ids: ['u_jack', 'u_sofia'] }],
    workspaces: [{ id: 'ws_main', name: 'Main workspace', kind: 'open', description: 'Company-wide boards. Everyone is a member.', is_default: true, state: 'active', created_at: iso(400) }, { id: 'ws_it', name: 'IT', kind: 'open', description: 'Joiners, leavers, kit and access.', is_default: false, state: 'active', created_at: iso(300) }],
    folders: [{ id: 'f_proj', workspace_id: 'ws_main', parent_folder_id: null, name: 'Projects', color: 'blue', position: 1, created_at: iso(200) }],
    boards: [], columns: [], groups: [], views: [], items: [], updates: [], activity: [], favorites: [{ user_id: 'u_arun', board_id: 'b_leavers', position: 1 }], notifications: [],
    prefs: { collapsed: {}, recentBoards: ['b_leavers', 'b_website'], lpCollapsed: false, lastWorkspace: 'ws_it', pinnedWorkspaces: [], recentWorkspaces: ['ws_it', 'ws_main'] } };
  const B = (id, workspace_id, name, description, folder_id = null, pos = 1) => { s.boards.push({ id, workspace_id, folder_id, name, description, kind: 'public', state: 'active', permissions: 'everyone', item_terminology: 'item', position: pos, created_by: 'u_arun', owner_ids: ['u_arun'], subscriber_ids: users.map((u) => u.id), deleted_at: null, created_at: iso(120), updated_at: iso(1), last_viewed: { u_maya: iso(0, 9), u_tom: iso(1), u_arun: iso(0, 8) } }); };
  const C = (id, board_id, title, type, settings = {}, width, pos) => { s.columns.push({ id, board_id, title, type, settings, description: '', width: width || TYPES[type].defaultWidth || 140, position: pos, created_at: iso(120) }); };
  const G = (id, board_id, title, color, pos) => { s.groups.push({ id, board_id, title, color, position: pos, archived: false, created_at: iso(120) }); };
  const V = (id, board_id, name, type, settings = {}, pos = 1) => { s.views.push({ id, board_id, name, type, settings, filter: { logic: 'and', rules: [] }, sort: [], hidden_column_ids: [], position: pos, pinned: false, created_at: iso(120) }); };
  let seqPos = 0;
  const I = (id, board_id, group_id, name, values, by = 'u_arun', daysAgo = 20) => { s.items.push({ id, seq: ++s.seq, board_id, group_id, parent_item_id: null, name, position: ++seqPos, state: 'active', created_by: by, deleted_at: null, created_at: iso(daysAgo), updated_at: iso(Math.min(daysAgo, Math.floor(Math.random() * 6))), values }); };
  const Up = (id, item_id, creator_id, body, daysAgo, extra = {}) => { s.updates.push({ id, item_id, parent_update_id: null, creator_id, body, pinned: false, likes: [], seen_by: [creator_id], edited_at: null, created_at: iso(daysAgo, 11), ...extra }); };
  const A = (board_id, item_id, user_id, event, extra, daysAgo) => { s.activity.push({ id: uid('act'), board_id, item_id, user_id, event, column_id: null, old_value: null, new_value: null, created_at: iso(daysAgo, 14), ...extra }); };
  const L = (id, text, color, done = false) => ({ id, text, color, done });

  // --- IT Leavers ---
  B('b_leavers', 'ws_it', 'IT Leavers', 'Offboarding checklist for every leaver. One row per person; IT owner closes the row when every access is gone.');
  C('c_lv_name', 'b_leavers', 'Employee', 'name', {}, 300, 0);
  C('c_lv_dept', 'b_leavers', 'Department', 'dropdown', { options: [{ id: 'o_sales', text: 'Sales', color: 'blue' }, { id: 'o_mkt', text: 'Marketing', color: 'orange' }, { id: 'o_fin', text: 'Finance', color: 'green' }, { id: 'o_eng', text: 'Engineering', color: 'purple' }, { id: 'o_ops', text: 'Operations', color: 'teal' }] }, 150, 1);
  C('c_lv_mgr', 'b_leavers', 'Line manager', 'people', { limit: 1 }, 130, 2);
  C('c_lv_lwd', 'b_leavers', 'Last working day', 'date', { show_time: false }, 150, 3);
  C('c_lv_off', 'b_leavers', 'Offboarding', 'status', { labels: [L('l_off_prog', 'In progress', 'orange'), L('l_off_done', 'Done', 'green', true), L('l_off_block', 'Blocked', 'red'), L('l_off_blank', '', 'grey')] }, 140, 4);
  C('c_lv_laptop', 'b_leavers', 'Laptop returned', 'checkbox', {}, 120, 5);
  C('c_lv_acc', 'b_leavers', 'Accounts disabled', 'status', { labels: [L('l_acc_pend', 'Pending', 'yellow'), L('l_acc_done', 'Disabled', 'green', true), L('l_acc_esc', 'Escalated', 'red'), L('l_acc_blank', '', 'grey')] }, 150, 6);
  C('c_lv_owner', 'b_leavers', 'IT owner', 'people', { limit: 0 }, 120, 7);
  C('c_lv_notes', 'b_leavers', 'Notes', 'long_text', {}, 220, 8);
  G('g_lv_this', 'b_leavers', 'This month', 'blue', 1); G('g_lv_next', 'b_leavers', 'Next month', 'purple', 2); G('g_lv_done', 'b_leavers', 'Completed', 'green', 3);
  V('v_lv_main', 'b_leavers', 'Main Table', 'table', {}, 1); V('v_lv_cal', 'b_leavers', 'Leaving dates', 'calendar', { date_column_id: 'c_lv_lwd', color_column_id: 'c_lv_off' }, 2);
  const lv = (id, name, dept, mgr, lwd, off, laptop, acc, owner, notes, group, by, ago) => I(id, 'b_leavers', group, name, { c_lv_dept: { ids: [dept] }, c_lv_mgr: { user_ids: [mgr] }, c_lv_lwd: { date: lwd, time: null }, ...(off ? { c_lv_off: { label: off } } : {}), ...(laptop ? { c_lv_laptop: { checked: true } } : {}), ...(acc ? { c_lv_acc: { label: acc } } : {}), c_lv_owner: { user_ids: owner }, ...(notes ? { c_lv_notes: { text: notes } } : {}) }, by, ago);
  lv('i_lv1', 'Daniel Green', 'o_sales', 'u_tom', d(3), 'l_off_prog', false, 'l_acc_pend', ['u_arun'], 'Keep mailbox forwarding to Tom for 30 days.', 'g_lv_this', 'u_priya', 12);
  lv('i_lv2', 'Hannah Wright', 'o_mkt', 'u_jack', d(-2), 'l_off_block', false, 'l_acc_esc', ['u_maya'], 'Laptop not returned. Courier booked twice.', 'g_lv_this', 'u_priya', 25);
  lv('i_lv3', 'Omar Siddiqui', 'o_fin', 'u_amara', d(9), 'l_off_prog', true, 'l_acc_pend', ['u_arun', 'u_maya'], '', 'g_lv_this', 'u_priya', 8);
  lv('i_lv4', 'Chloe Martin', 'o_eng', 'u_ben', d(14), null, false, null, ['u_maya'], 'GitHub org owner, transfer repos first.', 'g_lv_this', 'u_priya', 5);
  lv('i_lv5', 'Liam Chen', 'o_ops', 'u_amara', d(31), null, false, null, ['u_arun'], '', 'g_lv_next', 'u_priya', 3);
  lv('i_lv6', 'Isabella Romero', 'o_sales', 'u_tom', d(38), null, false, null, [], 'Contractor. Only Salesforce and email.', 'g_lv_next', 'u_priya', 2);
  lv('i_lv7', 'Noah Fischer', 'o_eng', 'u_ben', d(45), null, false, null, ['u_maya'], '', 'g_lv_next', 'u_priya', 1);
  lv('i_lv8', 'Grace Kim', 'o_mkt', 'u_jack', d(-16), 'l_off_done', true, 'l_acc_done', ['u_maya'], '', 'g_lv_done', 'u_priya', 40);
  lv('i_lv9', 'Ethan Walsh', 'o_fin', 'u_amara', d(-23), 'l_off_done', true, 'l_acc_done', ['u_arun'], 'Mailbox exported to HR archive.', 'g_lv_done', 'u_priya', 48);
  lv('i_lv10', 'Zara Hussain', 'o_ops', 'u_amara', d(-30), 'l_off_done', true, 'l_acc_done', ['u_arun'], '', 'g_lv_done', 'u_priya', 55);
  Up('up1', 'i_lv2', 'u_maya', 'Second courier attempt failed. @[Jack Lee] can you confirm the home address we have on file is current?', 3);
  Up('up2', 'i_lv2', 'u_jack', 'Checked with Hannah, she moved last month. New address sent to you by email.', 2, { parent_update_id: 'up1', likes: ['u_maya'] });
  Up('up3', 'i_lv2', 'u_arun', 'Accounts stay escalated until the laptop is back. Nothing else is blocked.', 1, { pinned: true, likes: ['u_maya', 'u_jack'] });
  Up('up4', 'i_lv1', 'u_tom', 'Please keep the shared Sales inbox access until Friday, Daniel is handing over two accounts.', 4);
  Up('up5', 'i_lv3', 'u_arun', 'Laptop received and wiped. @[Maya Patel] please close the Okta side when the date passes.', 0);
  A('b_leavers', 'i_lv2', 'u_maya', 'value_changed', { column_id: 'c_lv_off', old_value: { label: 'l_off_prog' }, new_value: { label: 'l_off_block' } }, 3);
  A('b_leavers', 'i_lv2', 'u_maya', 'value_changed', { column_id: 'c_lv_acc', old_value: { label: 'l_acc_pend' }, new_value: { label: 'l_acc_esc' } }, 3);
  A('b_leavers', 'i_lv8', 'u_maya', 'item_moved', { old_value: 'This month', new_value: 'Completed' }, 14);
  A('b_leavers', 'i_lv3', 'u_arun', 'value_changed', { column_id: 'c_lv_laptop', old_value: null, new_value: { checked: true } }, 0);
  A('b_leavers', 'i_lv7', 'u_priya', 'item_created', { new_value: 'Noah Fischer' }, 1);

  // --- Website launch ---
  B('b_website', 'ws_main', 'Website launch', 'Everything for the new marketing site going live on the 12th.', 'f_proj', 1);
  C('c_ws_name', 'b_website', 'Task', 'name', {}, 320, 0);
  C('c_ws_owner', 'b_website', 'Owner', 'people', { limit: 0 }, 120, 1);
  C('c_ws_status', 'b_website', 'Status', 'status', { labels: [L('l_ws_wip', 'Working on it', 'orange'), L('l_ws_review', 'Ready for review', 'blue'), L('l_ws_done', 'Done', 'green', true), L('l_ws_stuck', 'Stuck', 'red'), L('l_ws_blank', '', 'grey')] }, 150, 2);
  C('c_ws_due', 'b_website', 'Due date', 'date', { show_time: false }, 130, 3);
  C('c_ws_prio', 'b_website', 'Priority', 'status', { labels: [L('l_pr_high', 'High', 'red'), L('l_pr_med', 'Medium', 'yellow'), L('l_pr_low', 'Low', 'sky'), L('l_pr_blank', '', 'grey')] }, 120, 4);
  C('c_ws_tl', 'b_website', 'Timeline', 'timeline', {}, 190, 5);
  C('c_ws_effort', 'b_website', 'Effort', 'numbers', { unit: 'h' }, 100, 6);
  C('c_ws_spec', 'b_website', 'Spec', 'link', {}, 140, 7);
  G('g_ws_plan', 'b_website', 'Planning', 'teal', 1); G('g_ws_build', 'b_website', 'Build', 'blue', 2); G('g_ws_launch', 'b_website', 'Launch', 'purple', 3);
  V('v_ws_main', 'b_website', 'Main Table', 'table', {}, 1); V('v_ws_kanban', 'b_website', 'Kanban', 'kanban', { status_column_id: 'c_ws_status', card_column_ids: ['c_ws_owner', 'c_ws_due', 'c_ws_prio'] }, 2); V('v_ws_cal', 'b_website', 'Calendar', 'calendar', { date_column_id: 'c_ws_due', color_column_id: 'c_ws_status' }, 3);
  const ws = (id, name, owner, status, due, prio, tl, effort, spec, group, ago) => I(id, 'b_website', group, name, { c_ws_owner: { user_ids: owner }, ...(status ? { c_ws_status: { label: status } } : {}), ...(due ? { c_ws_due: { date: due, time: null } } : {}), ...(prio ? { c_ws_prio: { label: prio } } : {}), ...(tl ? { c_ws_tl: { from: tl[0], to: tl[1] } } : {}), ...(effort != null ? { c_ws_effort: { number: effort } } : {}), ...(spec ? { c_ws_spec: { url: 'https://example.com/spec/' + spec, text: 'Spec' } } : {}) }, 'u_jack', ago);
  ws('i_ws1', 'Sitemap and page inventory', ['u_jack'], 'l_ws_done', d(-20), 'l_pr_high', [d(-28), d(-20)], 6, 'sitemap', 'g_ws_plan', 40);
  ws('i_ws2', 'Brand refresh sign-off', ['u_sofia', 'u_jack'], 'l_ws_done', d(-14), 'l_pr_high', [d(-24), d(-14)], 12, null, 'g_ws_plan', 38);
  ws('i_ws3', 'Copy deck for every page', ['u_jack'], 'l_ws_review', d(1), 'l_pr_med', [d(-10), d(1)], 20, 'copy', 'g_ws_plan', 30);
  ws('i_ws4', 'Homepage build', ['u_ben'], 'l_ws_wip', d(2), 'l_pr_high', [d(-6), d(2)], 24, 'home', 'g_ws_build', 20);
  ws('i_ws5', 'Pricing page', ['u_ben', 'u_sofia'], 'l_ws_wip', d(4), 'l_pr_high', [d(-3), d(4)], 16, 'pricing', 'g_ws_build', 18);
  ws('i_ws6', 'Case studies template', ['u_sofia'], 'l_ws_stuck', d(0), 'l_pr_med', [d(-5), d(0)], 10, null, 'g_ws_build', 16);
  ws('i_ws7', 'Contact form and CRM hook-up', ['u_arun'], 'l_ws_wip', d(5), 'l_pr_med', [d(0), d(5)], 8, 'form', 'g_ws_build', 10);
  ws('i_ws8', 'Analytics and consent banner', ['u_arun', 'u_amara'], null, d(7), 'l_pr_low', [d(3), d(7)], 4, null, 'g_ws_build', 9);
  ws('i_ws9', 'Accessibility pass', ['u_sofia'], null, d(8), 'l_pr_med', [d(6), d(8)], 6, null, 'g_ws_build', 9);
  ws('i_ws10', 'DNS cut-over and redirects', ['u_arun'], null, d(12), 'l_pr_high', [d(11), d(12)], 3, 'dns', 'g_ws_launch', 8);
  ws('i_ws11', 'Launch announcement', ['u_jack', 'u_tom'], null, d(12), 'l_pr_medium', null, 2, null, 'g_ws_launch', 8);
  ws('i_ws12', 'Post-launch bug sweep', ['u_ben'], null, d(16), 'l_pr_low', [d(13), d(16)], 8, null, 'g_ws_launch', 7);
  s.items.find((i) => i.id === 'i_ws11').values.c_ws_prio = { label: 'l_pr_med' };
  Up('up6', 'i_ws6', 'u_sofia', 'Blocked on the final logo files. @[Marketing] do we have the vector pack yet?', 2);
  Up('up7', 'i_ws6', 'u_jack', 'Agency promised them tomorrow morning.', 1, { parent_update_id: 'up6' });
  Up('up8', 'i_ws4', 'u_ben', 'Hero section is up on staging. Needs the new photography before review.', 1, { likes: ['u_jack', 'u_sofia'] });
  Up('up9', 'i_ws7', 'u_arun', 'Form posts to the CRM sandbox. Switching to production keys on launch day.', 0);
  Up('up10', 'i_ws1', 'u_jack', 'Final inventory attached in the shared drive. 34 pages.', 22);
  A('b_website', 'i_ws3', 'u_jack', 'value_changed', { column_id: 'c_ws_status', old_value: { label: 'l_ws_wip' }, new_value: { label: 'l_ws_review' } }, 1);
  A('b_website', 'i_ws6', 'u_sofia', 'value_changed', { column_id: 'c_ws_status', old_value: { label: 'l_ws_wip' }, new_value: { label: 'l_ws_stuck' } }, 2);
  A('b_website', 'i_ws2', 'u_jack', 'item_moved', { old_value: 'Build', new_value: 'Planning' }, 15);
  A('b_website', 'i_ws8', 'u_arun', 'value_changed', { column_id: 'c_ws_owner', old_value: { user_ids: ['u_arun'] }, new_value: { user_ids: ['u_arun', 'u_amara'] } }, 3);

  // --- Team tasks ---
  B('b_team', 'ws_main', 'Team tasks', 'Small things that need an owner and a date.', null, 2);
  C('c_tt_name', 'b_team', 'Task', 'name', {}, 320, 0);
  C('c_tt_owner', 'b_team', 'Owner', 'people', { limit: 1 }, 120, 1);
  C('c_tt_status', 'b_team', 'Status', 'status', { labels: defaultLabels() }, 140, 2);
  C('c_tt_due', 'b_team', 'Due', 'date', {}, 120, 3);
  C('c_tt_notes', 'b_team', 'Notes', 'text', {}, 220, 4);
  G('g_tt_this', 'b_team', 'This week', 'orange', 1); G('g_tt_next', 'b_team', 'Next week', 'blue', 2);
  V('v_tt_main', 'b_team', 'Main Table', 'table', {}, 1);
  const ttLabels = s.columns.find((c) => c.id === 'c_tt_status').settings.labels;
  const tl = (i) => ttLabels[i].id;
  const tt = (id, name, owner, st, due, notes, group, ago) => I(id, 'b_team', group, name, { c_tt_owner: { user_ids: [owner] }, ...(st != null ? { c_tt_status: { label: tl(st) } } : {}), c_tt_due: { date: due, time: null }, ...(notes ? { c_tt_notes: { text: notes } } : {}) }, owner, ago);
  tt('i_tt1', 'Renew the office Wi-Fi certificate', 'u_arun', 0, d(1), 'Expires Sunday', 'g_tt_this', 6);
  tt('i_tt2', 'Order monitors for the new desks', 'u_amara', 1, d(-1), '', 'g_tt_this', 9);
  tt('i_tt3', 'Book the all-hands room', 'u_priya', null, d(3), '', 'g_tt_this', 2);
  tt('i_tt4', 'Draft the Q3 hiring plan', 'u_priya', 0, d(8), 'Needs headcount from Tom', 'g_tt_next', 2);
  tt('i_tt5', 'Review vendor security questionnaire', 'u_arun', null, d(9), '', 'g_tt_next', 1);
  tt('i_tt6', 'Update the sales deck template', 'u_tom', 2, d(10), 'Blocked on brand refresh', 'g_tt_next', 4);
  A('b_team', 'i_tt2', 'u_amara', 'value_changed', { column_id: 'c_tt_status', old_value: { label: tl(0) }, new_value: { label: tl(1) } }, 1);

  s.notifications.push({ id: 'n1', user_id: 'u_arun', kind: 'mention', item_id: 'i_lv2', update_id: 'up3', actor_id: 'u_maya', read_at: null, created_at: iso(1, 9) }, { id: 'n2', user_id: 'u_arun', kind: 'assigned', item_id: 'i_ws10', update_id: null, actor_id: 'u_jack', read_at: null, created_at: iso(2, 15) }, { id: 'n3', user_id: 'u_arun', kind: 'reply', item_id: 'i_ws7', update_id: 'up9', actor_id: 'u_ben', read_at: iso(0, 8), created_at: iso(0, 7) });
  return s;
}
