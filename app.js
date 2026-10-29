// Shell: left pane, top bar, hash router, keyboard shortcuts.
import { h, icon, avatar, openMenu, openPopover, openDialog, promptDialog, confirmDialog, toast, closeAllLayers, closeTopLayer, debounce } from './lib/ui.js';
import * as data from './lib/data.js';
import { renderWorkspace } from './views/workspace.js';
import { renderBoard, openNewBoard, boardMenuItems } from './views/board.js';
import { renderMyWork } from './views/my-work.js';
import { renderSearch } from './views/search.js';
import { renderTrash } from './views/trash.js';
import { openNotifications } from './views/notifications.js';

await data.boot();
const app = document.getElementById('app');
const leftpane = document.getElementById('leftpane');
const topbar = document.getElementById('topbar');
const outlet = document.getElementById('outlet');

export function parseRoute() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'w') return { name: 'workspace', wsId: seg[1], params };
  if (seg[0] === 'b') return { name: 'board', bid: seg[1], vid: seg[2] === 'v' ? seg[3] : null, params };
  if (seg[0] === 'my-work') return { name: 'my-work', params };
  if (seg[0] === 'search') return { name: 'search', params };
  if (seg[0] === 'trash') return { name: 'trash', params };
  return { name: 'home', params };
}
export function navigate(hash) { if (location.hash === hash) render(); else location.hash = hash; }
export function setParam(k, v) { const [path, qs] = (location.hash.slice(1) || '/').split('?'); const p = new URLSearchParams(qs || ''); if (v == null || v === '') p.delete(k); else p.set(k, v); const s = p.toString(); navigate(`#${path}${s ? '?' + s : ''}`); }

let route = parseRoute();
function render() {
  route = parseRoute();
  if (route.name === 'home') { const ws = data.workspace(data.prefs().lastWorkspace) || data.defaultWorkspace(); location.hash = `#/w/${ws.id}`; return; }
  renderLeftPane(); renderTopBar();
  outlet.replaceChildren();
  let el;
  switch (route.name) {
    case 'workspace': el = renderWorkspace(route.wsId); break;
    case 'board': el = renderBoard(route); break;
    case 'my-work': el = renderMyWork(route.params); break;
    case 'search': el = renderSearch(route.params.q || ''); break;
    case 'trash': el = renderTrash(); break;
  }
  outlet.append(el);
}
const rerender = debounce(render, 16);
data.store.subscribe((what) => { if (what === 'storage-warning') toast('Local storage is nearly full. Export or delete old boards.', { kind: 'danger' }); if (what === 'reset') { location.hash = '#/'; } rerender(); });
window.addEventListener('hashchange', render);

/* ---------- left pane ---------- */
function renderLeftPane() {
  const collapsed = data.prefs().lpCollapsed; app.classList.toggle('lp-collapsed', !!collapsed);
  const wsId = route.name === 'workspace' ? route.wsId : route.name === 'board' ? data.board(route.bid)?.workspace_id : data.prefs().lastWorkspace;
  const ws = data.workspace(wsId) || data.defaultWorkspace();
  const entry = (href, ic, label, active, extra) => h('a', { class: `lp-entry ${active ? 'active' : ''}`, href, 'aria-current': active ? 'page' : null, title: label }, icon(ic), h('span', { class: 'label' }, label), extra);
  const favs = data.favorites();
  const boards = data.boardsIn(ws.id); const folders = data.foldersIn(ws.id);
  const boardEntry = (b) => {
    const active = route.name === 'board' && route.bid === b.id;
    const more = h('button', { type: 'button', class: 'icon-btn sm more', 'aria-label': `${b.name} menu`, onclick: (e) => { e.preventDefault(); e.stopPropagation(); openMenu(more, boardMenuItems(b)); } }, icon('dots', 'sm'));
    return h('a', { class: `lp-entry ${active ? 'active' : ''}`, href: `#/b/${b.id}`, 'aria-current': active ? 'page' : null, title: b.name }, icon(b.kind === 'private' ? 'lock' : 'board'), h('span', { class: 'label' }, b.name), more);
  };
  leftpane.replaceChildren(
    h('div', { class: 'lp-top' },
      h('a', { class: 'lp-brand', href: '#/', 'aria-label': 'GDS Boards home' }, h('img', { src: 'assets/brand/gds-logo-charcoal.png', alt: 'GDS' }), h('span', {}, 'Boards')),
      h('button', { type: 'button', class: 'icon-btn sm chev', 'aria-label': collapsed ? 'Expand navigation' : 'Collapse navigation', title: 'Ctrl+.', onclick: () => data.setPref('lpCollapsed', !collapsed) || render() }, icon('collapse'))),
    h('div', { class: 'lp-scroll' },
      h('button', { type: 'button', class: 'ws-switcher', 'aria-label': `Workspace: ${ws.name}. Switch workspace`, onclick: (e) => openWorkspaceSwitcher(e.currentTarget, ws) },
        h('span', { class: 'ws-avatar', style: { background: `var(--color-label-${ws.is_default ? 'blue' : 'purple'})` } }, ws.name[0]), h('span', { class: 'label truncate', style: { flex: 1, fontWeight: 600 } }, ws.name), icon('chevD', 'sm chev')),
      h('div', { class: 'lp-section' },
        entry(`#/w/${ws.id}`, 'home', 'Home', route.name === 'workspace'),
        entry('#/my-work', 'work', 'My work', route.name === 'my-work'),
        entry('#/search', 'search', 'Search everything', route.name === 'search')),
      favs.length ? h('div', { class: 'lp-section' }, h('div', { class: 'lp-section-title' }, 'Favorites'), h('div', { class: 'lp-boards' }, favs.map(boardEntry))) : null,
      h('div', { class: 'lp-section' },
        h('div', { class: 'lp-section-title' }, h('span', {}, `Boards · ${boards.length}`), h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Add', onclick: (e) => openAddMenu(e.currentTarget, ws.id) }, icon('plus', 'sm'))),
        boards.length > 8 ? h('div', { class: 'search', style: { margin: '0 0 var(--space-1)' } }, icon('search', 'sm'), h('input', { placeholder: 'Filter boards', 'aria-label': 'Filter boards', value: lpFilter, style: { width: '100%' }, oninput: (e) => { lpFilter = e.target.value; leftpane.querySelector('.lp-boards')?.replaceWith(boardTree(ws, boards, boardEntry)); } })) : null,
        boardTree(ws, boards, boardEntry))),
    h('button', { type: 'button', class: 'btn btn-primary lp-add', onclick: (e) => openAddMenu(e.currentTarget, ws.id) }, icon('plus'), h('span', { class: 'label' }, 'Add')),
  );
}
let lpFilter = '';
function boardTree(ws, boards, boardEntry) {
  const q = lpFilter.trim().toLowerCase(); const match = (b) => !q || b.name.toLowerCase().includes(q);
  const closed = data.prefs().closedFolders || {};
  const renderFolder = (f, depth) => {
    const inF = boards.filter((b) => b.folder_id === f.id && match(b));
    const subs = data.folderTree(ws.id, f.id).map((sf) => renderFolder(sf, depth + 1)).filter(Boolean);
    if (q && !inF.length && !subs.length) return null;
    const open = q ? true : !closed[f.id]; const total = boards.filter((b) => b.folder_id === f.id).length;
    return h('div', { style: { paddingLeft: depth ? 'var(--space-3)' : '0' } },
      h('button', { type: 'button', class: 'lp-entry', 'aria-expanded': open, onclick: () => { const cf = { ...closed }; if (open) cf[f.id] = true; else delete cf[f.id]; data.setPref('closedFolders', cf); render(); }, oncontextmenu: (e) => { e.preventDefault(); openMenu(e.currentTarget, folderMenu(f)); } }, icon(open ? 'chevD' : 'chevR', 'sm'), icon('folder'), h('span', { class: 'label' }, f.name), h('span', { class: 'muted', style: { fontSize: 'var(--text-xs)' } }, total)),
      open ? h('div', { class: 'lp-folder' }, inF.map(boardEntry), subs, !inF.length && !subs.length ? h('div', { class: 'muted', style: { padding: '4px 10px', fontSize: 'var(--text-xs)' } }, 'Empty') : null) : null);
  };
  const loose = boards.filter((b) => !b.folder_id && match(b));
  const tree = data.folderTree(ws.id, null).map((f) => renderFolder(f, 0)).filter(Boolean);
  return h('div', { class: 'lp-boards' }, loose.map(boardEntry), tree,
    !boards.length ? h('div', { class: 'muted', style: { padding: '8px', fontSize: 'var(--text-sm)' } }, 'No boards yet') : null,
    q && !loose.length && !tree.length ? h('div', { class: 'muted', style: { padding: '8px', fontSize: 'var(--text-sm)' } }, 'No boards match') : null);
}
function folderMenu(f) {
  return [
    { label: 'Rename folder', icon: 'edit', onSelect: async () => { const v = await promptDialog({ title: 'Rename folder', label: 'Folder name', value: f.name }); if (v) data.updateFolder(f.id, { name: v }); } },
    { label: 'New board in folder', icon: 'board', onSelect: () => openNewBoard(f.workspace_id, f.id) },
    { divider: true },
    { label: 'Delete folder (keeps its boards)', icon: 'trash', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Delete folder?', message: `"${f.name}" will be removed. Its boards move to the workspace root.`, confirmLabel: 'Delete', danger: true })) data.deleteFolder(f.id); } },
  ];
}
function openAddMenu(anchor, wsId) {
  openMenu(anchor, [
    { label: 'New board', icon: 'board', onSelect: () => openNewBoard(wsId) },
    { label: 'New folder', icon: 'folder', onSelect: async () => { const v = await promptDialog({ title: 'New folder', label: 'Folder name', placeholder: 'e.g. Projects' }); if (v) data.createFolder(wsId, v); } },
    { divider: true },
    { label: 'New workspace', icon: 'workspace', onSelect: openNewWorkspace },
  ]);
}
async function openNewWorkspace() {
  const v = await promptDialog({ title: 'New workspace', label: 'Workspace name', placeholder: 'e.g. Marketing', confirmLabel: 'Create' });
  if (!v) return; const ws = await data.createWorkspace(v); navigate(`#/w/${ws.id}`);
}
function openWorkspaceSwitcher(anchor, current) {
  openPopover(anchor, ({ close }) => {
    const all = data.workspaces(); const p = data.prefs();
    const pinned = (p.pinnedWorkspaces || []).map(data.workspace).filter((w) => w && w.state === 'active');
    const recent = (p.recentWorkspaces || []).map(data.workspace).filter((w) => w && w.state === 'active' && !pinned.includes(w)).slice(0, 5);
    let q = '';
    const input = h('input', { class: 'input', placeholder: 'Search workspaces', 'aria-label': 'Search workspaces', oninput: () => { q = input.value.toLowerCase(); list(); } });
    const box = h('div');
    const row = (w) => {
      const isPinned = (p.pinnedWorkspaces || []).includes(w.id);
      const pin = h('button', { type: 'button', class: `icon-btn sm ${isPinned ? 'active' : ''}`, 'aria-label': isPinned ? 'Unpin' : 'Pin', onclick: (e) => { e.stopPropagation(); const pw = (p.pinnedWorkspaces || []).filter((x) => x !== w.id); if (!isPinned) pw.push(w.id); data.setPref('pinnedWorkspaces', pw); list(); } }, icon('pin', 'sm'));
      return h('button', { type: 'button', class: `menu-item ${w.id === current.id ? 'active' : ''}`, onclick: () => { close(); const rw = [w.id, ...(p.recentWorkspaces || []).filter((x) => x !== w.id)].slice(0, 5); data.setPref('recentWorkspaces', rw); navigate(`#/w/${w.id}`); } }, h('span', { class: 'ws-avatar', style: { background: `var(--color-label-${w.is_default ? 'blue' : 'purple'})` } }, w.name[0]), h('span', { class: 'label' }, w.name), w.id === current.id ? icon('check', 'sm') : pin);
    };
    const section = (title, ws) => (ws.length ? [h('h4', { style: { margin: '8px 4px 2px' } }, title), ...ws.map(row)] : []);
    function list() { const f = (ws) => ws.filter((w) => w.name.toLowerCase().includes(q)); box.replaceChildren(...section('Pinned', f(pinned)), ...section('Recent', f(recent)), ...section('All workspaces', f(all))); }
    list();
    return h('div', { class: 'menu', style: { minWidth: '280px' } }, input, box, h('div', { class: 'menu-divider' }), h('button', { type: 'button', class: 'menu-item', onclick: () => { close(); openNewWorkspace(); } }, icon('plus'), h('span', { class: 'label' }, 'Add workspace')));
  }, { class: 'menu-pop' });
}

/* ---------- top bar ---------- */
function renderTopBar() {
  const me = data.me();
  const q = route.name === 'search' ? route.params.q || '' : '';
  const input = h('input', { type: 'search', placeholder: 'Search everything  (Ctrl+B)', 'aria-label': 'Search everything', value: q, onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/search?q=${encodeURIComponent(input.value.trim())}`); } });
  const unread = data.unreadCount();
  const bell = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Notifications${unread ? `, ${unread} unread` : ''}`, style: { position: 'relative' }, onclick: () => openNotifications(bell) }, icon('bell'), unread ? h('span', { class: 'dot' }) : null);
  const av = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Account menu for ${me.name}`, onclick: () => openMenu(av, [
    { label: me.name, icon: 'person', disabled: true },
    { label: 'Switch user (demo)', icon: 'people', onSelect: openUserSwitcher },
    { divider: true },
    { label: 'Import from monday export', icon: 'download', onSelect: () => runImport(true) },
    { label: 'Trash and archive', icon: 'trash', onSelect: () => navigate('#/trash') },
    { label: 'Keyboard shortcuts', icon: 'help', kbd: 'Shift+?', onSelect: openShortcuts },
    { divider: true },
    { label: 'Reset demo data', icon: 'undo', danger: true, onSelect: async () => { if (await confirmDialog({ title: 'Reset demo data?', message: 'Every board, item and update on this device goes back to the demo set.', confirmLabel: 'Reset', danger: true })) data.resetDemo(); } },
  ], { align: 'end' }) }, avatar(me, 'md'));
  topbar.replaceChildren(
    h('button', { type: 'button', class: 'icon-btn lp-toggle', 'aria-label': 'Toggle navigation', onclick: () => { if (window.innerWidth <= 768) app.classList.toggle('lp-open'); else { data.setPref('lpCollapsed', !data.prefs().lpCollapsed); render(); } } }, icon('menu')),
    h('div', { class: 'search' }, icon('search'), input),
    h('span', { class: 'spacer' }),
    bell,
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Help and shortcuts', onclick: openShortcuts }, icon('help')),
    av,
  );
}
function openUserSwitcher() {
  let q = '';
  openDialog({ title: 'Act as (demo)', body: ({ close }) => {
    const list = h('div', { class: 'check-list', style: { maxHeight: '50vh', overflow: 'auto' } });
    const input = h('input', { class: 'input', placeholder: 'Search people', 'aria-label': 'Search people', oninput: () => { q = input.value.toLowerCase(); draw(); } });
    const draw = () => list.replaceChildren(...data.users().filter((u) => u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)).slice(0, 60).map((u) => h('button', { type: 'button', class: 'menu-item', onclick: () => { data.setMe(u.id); close(); toast(`Now acting as ${u.name}`); } }, avatar(u, 'sm'), h('span', { class: 'label' }, u.name), u.id === data.me().id ? icon('check', 'sm') : h('span', { class: 'kbd' }, u.title || ''))));
    draw();
    return h('div', {}, h('div', { class: 'field' }, input), list);
  }, actions: [{ label: 'Close' }] });
}
let importToast = null;
function progressToast(done, total) {
  if (!importToast || !document.contains(importToast)) importToast = toast('Importing boards from monday.com…', { ms: 600000 });
  importToast.firstChild.textContent = `Importing boards from monday.com: ${done} of ${total}`;
  if (done >= total) setTimeout(() => importToast?.remove(), 2500);
}
async function runImport(force) {
  const r = await data.autoImport({ force, onProgress: progressToast });
  if (!r) { if (force) toast('No export found at data/import/index.json. Run node tools/monday-import.mjs first.', { kind: 'danger' }); return; }
  if (r.skipped) { if (force) toast('Already up to date with the export'); return; }
  toast(`Imported ${r.imported} board${r.imported === 1 ? '' : 's'} from monday.com`, { kind: 'success' });
  if (r.failed) toast(`${r.failed} board file${r.failed === 1 ? '' : 's'} could not be loaded`, { kind: 'danger' });
}
export function openShortcuts() {
  const rows = [['Ctrl+B', 'Search everything'], ['Ctrl+.', 'Collapse or expand the left pane'], ['Esc', 'Close the item card, dialogs and menus'], ['Enter', 'Edit the focused cell'], ['Tab / Shift+Tab', 'Next / previous cell'], ['Backspace', 'Clear the focused cell'], ['Ctrl+F', 'Search the board'], ['Ctrl+G', 'Collapse or expand all groups'], ['Ctrl+Shift+G', 'New group'], ['Ctrl+Shift+C', 'New column'], ['Ctrl+Shift+L', 'Board activity log'], ['Shift+?', 'This list']];
  openDialog({ title: 'Keyboard shortcuts', body: h('table', { style: { width: '100%', borderCollapse: 'collapse' } }, rows.map(([k, v]) => h('tr', {}, h('td', { style: { padding: '6px 0', width: '160px' } }, h('span', { class: 'kbd' }, k)), h('td', {}, v)))), actions: [{ label: 'Close', primary: true }] });
}

/* ---------- shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'b') { e.preventDefault(); topbar.querySelector('input')?.focus(); return; }
  if (ctrl && e.key === '.') { e.preventDefault(); data.setPref('lpCollapsed', !data.prefs().lpCollapsed); render(); return; }
  if (e.shiftKey && e.key === '?' && !typing) { e.preventDefault(); openShortcuts(); return; }
  if (route.name !== 'board') return;
  const bid = route.bid;
  if (ctrl && e.key.toLowerCase() === 'f' && !e.shiftKey) { const s = outlet.querySelector('.toolbar [data-board-search]'); if (s) { e.preventDefault(); s.click(); } return; }
  if (ctrl && e.key.toLowerCase() === 'g' && !e.shiftKey && !typing) { e.preventDefault(); const gs = data.groupsOf(bid); if (gs.length) { const anyOpen = gs.some((g) => !data.prefs().collapsed[g.id]); data.toggleCollapsed(gs[0].id, anyOpen); } return; }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'g') { e.preventDefault(); data.createGroup(bid).then(() => toast('Group added')); return; }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); outlet.querySelector('[data-add-column]')?.click(); return; }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setParam('log', route.params.log ? null : '1'); return; }
});

render();
if (!new URLSearchParams(location.search).has('noimport')) runImport(false);
