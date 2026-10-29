// S02–S04 board page: header, views bar, toolbar (search / person / filter / sort / hide), body by view type, batch bar, item card, activity log.
import { h, icon, avatar, avatarGroup, openMenu, openPopover, openDialog, promptDialog, confirmDialog, toast, editInline, colorVar, LABEL_COLORS, uid, relTime, fmtDateTime } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { TYPES, ADDABLE, typeOf, renderCell } from '../lib/columns.js';
import { applyView } from '../lib/query.js';
import { renderTable } from './table.js';
import { renderKanban } from './kanban.js';
import { renderCalendar } from './calendar.js';
import { renderItemPanel } from './item-card.js';
import { navigate, setParam } from '../app.js';

const drafts = {};          // view id -> working copy of filter/sort/hidden/search/person
let selection = new Set();  // selected item ids on the current board
let selectionBoard = null;
export let focusTarget = null; // {itemId, colId} | {addRowGroup} restored after a re-render

export function getDraft(v) {
  if (!drafts[v.id]) drafts[v.id] = { filter: JSON.parse(JSON.stringify(v.filter)), sort: JSON.parse(JSON.stringify(v.sort)), hidden_column_ids: [...v.hidden_column_ids], search: '', search_column_ids: [], person: null };
  return drafts[v.id];
}
const isDirty = (v, d) => JSON.stringify(d.filter) !== JSON.stringify(v.filter) || JSON.stringify(d.sort) !== JSON.stringify(v.sort) || JSON.stringify([...d.hidden_column_ids].sort()) !== JSON.stringify([...v.hidden_column_ids].sort());
export const setFocusTarget = (t) => { focusTarget = t; };

export function makeCtx(b) {
  const statusCol = data.columnsOf(b.id).find((c) => c.type === 'status'); // resolved once per render, not per cell
  return {
    board: b, users: data.users(), teams: data.teams(), me: data.me().id,
    setValue: (item, col, value) => { focusTarget = { itemId: item.id, colId: col.id }; return data.setValue(item, col, value); },
    updateColumn: (col, patch) => data.updateColumn(col.id, patch),
    openLabelEditor: (col) => openLabelEditor(col),
    itemIsDone: (item) => (statusCol ? TYPES.status.isDone(item.values[statusCol.id], statusCol) : false),
    openItem: (item, tab) => { setParam('item', item.id); if (tab) setParam('tab', tab); },
    rerender: () => window.dispatchEvent(new HashChangeEvent('hashchange')),
  };
}

export function renderBoard(route) {
  const b = data.board(route.bid);
  if (!b || !data.canSee(b)) return h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'Board not found'), h('p', {}, 'It may be private, or it was deleted.'), h('a', { class: 'btn btn-secondary', href: '#/trash' }, 'Look in trash')));
  if (b.state !== 'active') return h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, `"${b.name}" is in the ${b.state === 'archived' ? 'archive' : 'trash'}`), h('p', {}, 'Restore it to keep working on it.'), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => data.restoreBoard(b.id) }, 'Restore board')));
  if (selectionBoard !== b.id) { selection = new Set(); selectionBoard = b.id; }
  data.noteVisit(b.id);
  const views = data.viewsOf(b.id);
  const v = views.find((x) => x.id === route.vid) || views[0];
  const draft = getDraft(v);
  const ctx = makeCtx(b);
  const columns = data.columnsOf(b.id);
  const groups = data.groupsOf(b.id);
  const allItems = data.itemsOf(b.id);
  selection = new Set([...selection].filter((id) => allItems.some((i) => i.id === id)));
  const visible = applyView(allItems, columns, draft, ctx);
  const page = h('div', { class: 'board-page' });
  page.append(renderHeader(b, views, v, draft), renderToolbar(b, v, draft, columns, allItems, ctx));
  const body = h('div', { class: 'board-body' });
  const model = { board: b, view: v, draft, ctx, columns, groups, allItems, visible, selection, onSelect: (ids, on) => { ids.forEach((id) => (on ? selection.add(id) : selection.delete(id))); renderBatchBar(page, b, ctx); } };
  if (v.type === 'kanban') body.append(renderKanban(model));
  else if (v.type === 'calendar') body.append(renderCalendar(model));
  else body.append(renderTable(model));
  page.append(body);
  renderBatchBar(page, b, ctx);
  if (route.params.item) { const it = data.item(route.params.item); if (it && it.state === 'active' && it.board_id === b.id) page.append(renderItemPanel(it, ctx, { tab: route.params.tab || 'updates', onClose: () => { setParam('item', null); setParam('tab', null); } })); }
  if (route.params.log) page.append(renderActivityPanel(b, ctx, route.params.log));
  requestAnimationFrame(() => restoreFocus(page));
  return page;
}
function restoreFocus(page) {
  if (!focusTarget) return;
  const t = focusTarget; focusTarget = null;
  const el = t.addRowGroup ? page.querySelector(`[data-add-row="${t.addRowGroup}"] input`) : page.querySelector(`[data-item="${t.itemId}"] [data-col="${t.colId}"]`);
  el?.focus({ preventScroll: true });
}

/* ---------- header ---------- */
function renderHeader(b, views, v, draft) {
  const owner = data.isOwner(b);
  const title = h('h1', { class: 'board-title truncate', title: 'Click to rename', tabindex: 0, onclick: () => editInline(title, { onSave: (name) => data.updateBoard(b.id, { name }) }), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); title.click(); } } }, b.name);
  let descOpen = !!b._descOpen;
  const desc = h('div', { class: 'board-desc', hidden: !b.description, title: 'Click to edit', onclick: () => editInline(desc, { multiline: true, select: false, onSave: (d) => data.updateBoard(b.id, { description: d.replace(/[<>]/g, '').slice(0, 1000) }) }) }, b.description || 'Add a description for the team');
  const descBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Show description', 'aria-expanded': !desc.hidden, onclick: () => { desc.hidden = !desc.hidden; descBtn.setAttribute('aria-expanded', !desc.hidden); if (!desc.hidden && !b.description) desc.click(); } }, icon('chevD', 'sm'));
  const fav = data.isFavorite(b.id);
  const star = h('button', { type: 'button', class: `icon-btn sm star ${fav ? 'active' : ''}`, 'aria-label': fav ? 'Remove from favorites' : 'Add to favorites', 'aria-pressed': fav, onclick: () => data.toggleFavorite(b.id) }, icon('star', 'sm'));
  if (fav) star.querySelector('svg').style.fill = 'currentColor';
  const lv = Object.entries(b.last_viewed || {}).sort((a, c) => c[1].localeCompare(a[1])).map(([id]) => data.user(id)).filter(Boolean);
  const viewed = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'Activity log and who viewed the board', 'aria-label': 'Open the activity log', onclick: () => setParam('log', '1') }, avatarGroup(lv, 3, 'sm'));
  const more = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Board menu', onclick: () => openMenu(more, boardMenuItems(b), { align: 'end' }) }, icon('dots'));
  const tabs = h('div', { class: 'views-bar', role: 'tablist', 'aria-label': 'Board views' });
  for (const x of views) {
    const active = x.id === v.id;
    const tab = h('button', { type: 'button', role: 'tab', class: 'view-tab', 'aria-selected': active, draggable: true, title: x.name,
      onclick: () => navigate(`#/b/${b.id}/v/${x.id}`),
      oncontextmenu: (e) => { e.preventDefault(); openMenu(tab, viewMenuItems(b, x, views)); },
      ondragstart: (e) => { e.dataTransfer.setData('app/view', x.id); e.dataTransfer.effectAllowed = 'move'; },
      ondragover: (e) => { if (e.dataTransfer.types.includes('app/view')) { e.preventDefault(); } },
      ondrop: (e) => { const id = e.dataTransfer.getData('app/view'); if (id && id !== x.id) data.moveView(id, x.id); },
    }, icon(x.type === 'kanban' ? 'kanban' : x.type === 'calendar' ? 'calendar' : 'table', 'sm'), h('span', {}, x.name), x.pinned ? icon('pin', 'sm pin') : null, active && isDirty(x, getDraft(x)) ? h('span', { class: 'badge soft', title: 'Unsaved filter, sort or hidden columns' }, '•') : null);
    if (active) tab.append(h('span', { class: 'icon-btn sm', role: 'button', tabindex: 0, 'aria-label': `${x.name} menu`, onclick: (e) => { e.stopPropagation(); openMenu(tab, viewMenuItems(b, x, views)); }, onkeydown: (e) => { if (e.key === 'Enter') { e.stopPropagation(); openMenu(tab, viewMenuItems(b, x, views)); } } }, icon('chevD', 'sm')));
    tabs.append(tab);
  }
  const add = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Add view', onclick: () => openMenu(add, [
    { label: 'Table', icon: 'table', onSelect: async () => { const nv = await data.createView(b.id, { type: 'table' }); navigate(`#/b/${b.id}/v/${nv.id}`); } },
    { label: 'Kanban', icon: 'kanban', onSelect: async () => { const sc = data.columnsOf(b.id).find((c) => c.type === 'status'); const nv = await data.createView(b.id, { type: 'kanban', settings: { status_column_id: sc?.id || null, card_column_ids: data.columnsOf(b.id).filter((c) => ['people', 'date'].includes(c.type)).slice(0, 2).map((c) => c.id) } }); navigate(`#/b/${b.id}/v/${nv.id}`); } },
    { label: 'Calendar', icon: 'calendar', onSelect: async () => { const dc = data.columnsOf(b.id).find((c) => c.type === 'date' || c.type === 'timeline'); const sc = data.columnsOf(b.id).find((c) => c.type === 'status'); const nv = await data.createView(b.id, { type: 'calendar', settings: { date_column_id: dc?.id || null, color_column_id: sc?.id || null } }); navigate(`#/b/${b.id}/v/${nv.id}`); } },
  ]) }, icon('plus', 'sm'));
  tabs.append(add);
  return h('header', { class: 'board-header' },
    h('div', { class: 'board-title-row' }, title, descBtn, star, h('span', { style: { flex: 1 } }), viewed, h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openInvite(b) }, icon('person', 'sm'), 'Invite'), more),
    desc, tabs);
}
export function boardMenuItems(b) {
  const owner = data.isOwner(b);
  return [
    { label: 'Open', icon: 'board', onSelect: () => navigate(`#/b/${b.id}`) },
    b.source?.url ? { label: 'Open in monday.com', icon: 'link', onSelect: () => window.open(b.source.url, '_blank', 'noopener') } : null,
    { label: 'Rename board', icon: 'edit', onSelect: async () => { const v = await promptDialog({ title: 'Rename board', label: 'Board name', value: b.name }); if (v) data.updateBoard(b.id, { name: v }); } },
    { label: 'Edit description', icon: 'longtext', onSelect: () => openDialog({ title: 'Board description', body: ({ close }) => { const ta = h('textarea', { class: 'textarea', maxlength: 1000, 'aria-label': 'Description' }, b.description); ta.addEventListener('input', () => (ta.value = ta.value.replace(/[<>]/g, ''))); return h('div', {}, h('div', { class: 'field' }, ta, h('div', { class: 'hint' }, 'Up to 1,000 characters. No < or > characters.')), h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-secondary', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { data.updateBoard(b.id, { description: ta.value.trim() }); close(); } }, 'Save'))); } }) },
    { label: data.isFavorite(b.id) ? 'Remove from favorites' : 'Add to favorites', icon: 'star', onSelect: () => data.toggleFavorite(b.id) },
    { divider: true },
    { label: `Board type: ${{ public: 'Main', share: 'Shareable', private: 'Private' }[b.kind]}`, icon: b.kind === 'private' ? 'lock' : 'people', disabled: !owner, submenu: [['public', 'Main', 'Visible to everyone in the workspace'], ['share', 'Shareable', 'For guests you invite'], ['private', 'Private', 'Only subscribers can see it']].map(([k, l, hint]) => ({ label: `${l} — ${hint}`, icon: b.kind === k ? 'check' : undefined, onSelect: () => data.updateBoard(b.id, { kind: k }) })) },
    { label: 'Change item terminology', icon: 'text', onSelect: async () => { const v = await promptDialog({ title: 'What do you call an item on this board?', label: 'Singular, lower case (e.g. task, leaver, book)', value: b.item_terminology }); if (v) data.updateBoard(b.id, { item_terminology: v.toLowerCase() }); } },
    { label: 'Duplicate board', icon: 'copy', submenu: [['structure', 'Structure only'], ['items', 'With items'], ['items_updates', 'With items and updates']].map(([m, l]) => ({ label: l, onSelect: async () => { const nb = await data.duplicateBoard(b.id, m); toast(`Created "${nb.name}"`); navigate(`#/b/${nb.id}`); } })) },
    { label: 'Activity log', icon: 'log', kbd: 'Ctrl+Shift+L', onSelect: () => { navigate(`#/b/${b.id}?log=1`); } },
    { label: 'Export table to CSV', icon: 'download', onSelect: () => exportCsv(b) },
    { divider: true },
    { label: 'Archive board', icon: 'archive', disabled: !owner, onSelect: async () => { await data.deleteBoard(b.id, 'archived'); toast(`"${b.name}" archived`, { undo: () => data.restoreBoard(b.id) }); navigate(`#/w/${b.workspace_id}`); } },
    { label: 'Delete board', icon: 'trash', danger: true, disabled: !owner, onSelect: async () => { if (!(await confirmDialog({ title: `Delete "${b.name}"?`, message: 'The board and everything on it go to the trash for 30 days.', confirmLabel: 'Delete', danger: true }))) return; await data.deleteBoard(b.id); toast(`"${b.name}" moved to trash`, { undo: () => data.restoreBoard(b.id) }); navigate(`#/w/${b.workspace_id}`); } },
  ];
}
function viewMenuItems(b, x, views) {
  return [
    { label: 'Rename view', icon: 'edit', onSelect: async () => { const v = await promptDialog({ title: 'Rename view', label: 'View name', value: x.name }); if (v) data.updateView(x.id, { name: v }); } },
    { label: 'Duplicate view', icon: 'copy', onSelect: async () => { const nv = await data.duplicateView(x.id); navigate(`#/b/${b.id}/v/${nv.id}`); } },
    { label: x.pinned ? 'Unpin view' : 'Pin view', icon: 'pin', disabled: !data.isOwner(b), onSelect: () => data.updateView(x.id, { pinned: !x.pinned }) },
    x.type !== 'table' ? { label: 'View settings', icon: 'filter', onSelect: () => openViewSettings(b, x) } : null,
    { divider: true },
    { label: 'Delete view', icon: 'trash', danger: true, disabled: views.length <= 1, onSelect: async () => { if (!(await confirmDialog({ title: `Delete the "${x.name}" view?`, message: 'The items stay on the board. Only this view goes.', confirmLabel: 'Delete', danger: true }))) return; await data.deleteView(x.id); navigate(`#/b/${b.id}`); } },
  ];
}
export function openViewSettings(b, v) {
  const cols = data.columnsOf(b.id);
  const sel = (label, key, types, allowNone = false) => { const s = h('select', { class: 'input', 'aria-label': label }, allowNone ? h('option', { value: '' }, 'None') : null, cols.filter((c) => types.includes(c.type)).map((c) => h('option', { value: c.id, selected: v.settings[key] === c.id }, c.title))); s.onchange = () => data.updateView(v.id, { settings: { ...data.view(v.id).settings, [key]: s.value || null } }); return h('div', { class: 'field' }, h('label', {}, label), s); };
  openDialog({ title: `${v.name} settings`, body: h('div', {},
    v.type === 'kanban' ? [sel('Kanban column (lanes come from its labels)', 'status_column_id', ['status']), sel('Divide by', 'divide_by', ['status', 'dropdown'], true),
      h('div', { class: 'field' }, h('label', {}, 'Card columns'), h('div', { class: 'check-list' }, cols.filter((c) => c.type !== 'name' && c.id !== v.settings.status_column_id).map((c) => h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: (v.settings.card_column_ids || []).includes(c.id), onchange: (e) => { const cur = data.view(v.id).settings; const ids = new Set(cur.card_column_ids || []); e.target.checked ? ids.add(c.id) : ids.delete(c.id); data.updateView(v.id, { settings: { ...cur, card_column_ids: [...ids] } }); } }), c.title))))] : null,
    v.type === 'calendar' ? [sel('Date column', 'date_column_id', ['date', 'timeline']), sel('Colour chips by', 'color_column_id', ['status'], true)] : null,
    h('p', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, 'Changes apply straight away.')), actions: [{ label: 'Done', primary: true }] });
}
function openInvite(b) {
  openDialog({ title: 'Board members', body: h('div', { class: 'check-list', style: { maxHeight: '60vh', overflow: 'auto' } }, data.activeUsers().map((u) => h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: b.subscriber_ids.includes(u.id), disabled: b.owner_ids.includes(u.id), onchange: (e) => { const ids = new Set(b.subscriber_ids); e.target.checked ? ids.add(u.id) : ids.delete(u.id); data.updateBoard(b.id, { subscriber_ids: [...ids] }); } }), avatar(u, 'sm'), h('span', {}, u.name, b.owner_ids.includes(u.id) ? h('span', { class: 'muted' }, ' · owner') : null)))), actions: [{ label: 'Done', primary: true }] });
}
function exportCsv(b) {
  const ctx = makeCtx(b); const cols = data.columnsOf(b.id);
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Group', ...cols.map((c) => c.title)].map(q).join(',')];
  for (const g of data.groupsOf(b.id)) for (const it of data.itemsInGroup(g.id)) rows.push([g.title, ...cols.map((c) => typeOf(c).text?.(it.values[c.id], c, ctx, it) ?? '')].map(q).join(','));
  const a = h('a', { href: URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })), download: `${b.name}.csv` }); document.body.append(a); a.click(); a.remove();
}

/* ---------- toolbar ---------- */
function renderToolbar(b, v, draft, columns, allItems, ctx) {
  const bar = h('div', { class: 'toolbar' });
  const term = b.item_terminology || 'item';
  const firstGroup = data.groupsOf(b.id)[0];
  const newItem = h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: async () => { if (!firstGroup) return; const it = await data.createItem({ board_id: b.id, group_id: firstGroup.id, name: `New ${term}`, where: 'top' }); focusTarget = { itemId: it.id, colId: columns.find((c) => c.type === 'name')?.id }; } }, `New ${term}`);
  const newArrow = h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'aria-label': 'More ways to add', onclick: () => openMenu(newArrow, [{ label: `New ${term}`, icon: 'plus', onSelect: () => newItem.click() }, { label: `New group of ${term}s`, icon: 'board', kbd: 'Ctrl+Shift+G', onSelect: () => data.createGroup(b.id) }]) }, icon('chevD', 'sm'));
  bar.append(h('span', { class: 'split' }, newItem, newArrow));
  // search
  const searchWrap = h('div', { class: 'search', style: { display: draft.search ? 'flex' : 'none' } });
  const searchInput = h('input', { placeholder: `Search this board`, value: draft.search, 'aria-label': 'Search this board', oninput: () => { draft.search = searchInput.value; rerenderBody(); }, onkeydown: (e) => { if (e.key === 'Escape') { if (searchInput.value) { searchInput.value = ''; draft.search = ''; rerenderBody(); } else { searchWrap.style.display = 'none'; searchBtn.focus(); } } } });
  const searchOptions = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Search options', title: 'Choose which columns to search', onclick: () => openPopover(searchOptions, () => h('div', { class: 'check-list', style: { minWidth: '220px' } }, h('h4', {}, 'Search in'), h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: !draft.search_column_ids.length, onchange: () => { draft.search_column_ids = []; rerenderBody(); } }), 'All columns'), columns.map((c) => h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: !draft.search_column_ids.length || draft.search_column_ids.includes(c.id), onchange: (e) => { let ids = draft.search_column_ids.length ? [...draft.search_column_ids] : columns.map((x) => x.id); ids = e.target.checked ? [...new Set([...ids, c.id])] : ids.filter((x) => x !== c.id); draft.search_column_ids = ids.length === columns.length ? [] : ids; rerenderBody(); } }), c.title)))) }, icon('filter', 'sm'));
  searchWrap.append(icon('search'), searchInput, searchOptions);
  const searchBtn = h('button', { type: 'button', class: `btn btn-ghost btn-sm ${draft.search ? 'active' : ''}`, 'data-board-search': '1', onclick: () => { searchWrap.style.display = 'flex'; searchInput.focus(); } }, icon('search', 'sm'), 'Search');
  bar.append(searchBtn, searchWrap);
  // person
  const personBtn = h('button', { type: 'button', class: `btn btn-ghost btn-sm ${draft.person ? 'active' : ''}`, 'aria-label': 'Filter by person', onclick: () => openPopover(personBtn, ({ close }) => h('div', { style: { minWidth: '240px' } }, h('h4', {}, 'Filter items by person'), h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '420px' } }, data.activeUsers().map((u) => h('button', { type: 'button', class: `icon-btn ${draft.person === u.id ? 'active' : ''}`, title: u.name, 'aria-label': u.name, 'aria-pressed': draft.person === u.id, onclick: () => { draft.person = draft.person === u.id ? null : u.id; close(); rerenderBody(); } }, avatar(u, 'md')))), draft.person ? h('div', { class: 'popover-footer' }, h('span', { class: 'muted' }, data.user(draft.person)?.name), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { draft.person = null; close(); rerenderBody(); } }, 'Clear')) : null)) }, draft.person ? avatar(data.user(draft.person), 'sm') : icon('person', 'sm'), 'Person');
  bar.append(personBtn);
  // filter
  const nRules = draft.filter.rules.length;
  const filterBtn = h('button', { type: 'button', class: `btn btn-ghost btn-sm ${nRules ? 'active' : ''}`, onclick: () => openFilter(filterBtn, b, v, draft, columns, allItems, ctx, false) }, icon('filter', 'sm'), 'Filter', nRules ? h('span', { class: 'badge soft' }, nRules) : null);
  const filterArrow = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Advanced filters', onclick: () => openFilter(filterArrow, b, v, draft, columns, allItems, ctx, true) }, icon('chevD', 'sm'));
  bar.append(filterBtn, filterArrow);
  if (v.type !== 'calendar') {
    const nSort = draft.sort.length;
    const sortBtn = h('button', { type: 'button', class: `btn btn-ghost btn-sm ${nSort ? 'active' : ''}`, onclick: () => openSort(sortBtn, b, v, draft, columns) }, icon('sort', 'sm'), 'Sort', nSort ? h('span', { class: 'badge soft' }, nSort) : null);
    bar.append(sortBtn);
  }
  if (v.type === 'table') {
    const nHid = draft.hidden_column_ids.length;
    const hideBtn = h('button', { type: 'button', class: `btn btn-ghost btn-sm ${nHid ? 'active' : ''}`, onclick: () => openHide(hideBtn, b, v, draft, columns) }, icon('eye', 'sm'), 'Hide', nHid ? h('span', { class: 'badge soft' }, nHid) : null);
    bar.append(hideBtn);
  } else {
    bar.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openViewSettings(b, v) }, icon('filter', 'sm'), 'Settings'));
  }
  if (isDirty(v, draft)) {
    bar.append(h('span', { class: 'sep' }), h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => saveToView(v, draft) }, 'Save to this view'), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => saveAsNewView(b, v, draft) }, 'Save as new view'), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { delete drafts[v.id]; rerenderBody(); } }, 'Discard'));
  }
  return bar;
}
function rerenderBody() { window.dispatchEvent(new HashChangeEvent('hashchange')); }
async function saveToView(v, draft) { await data.updateView(v.id, { filter: JSON.parse(JSON.stringify(draft.filter)), sort: JSON.parse(JSON.stringify(draft.sort)), hidden_column_ids: [...draft.hidden_column_ids] }); toast('Saved to this view'); }
async function saveAsNewView(b, v, draft) {
  const name = await promptDialog({ title: 'Save as new view', label: 'View name', value: draft.filter.rules.length ? 'Filtered view' : draft.sort.length ? 'Sorted view' : 'My view', confirmLabel: 'Save' });
  if (!name) return;
  const nv = await data.createView(b.id, { type: v.type, name, settings: JSON.parse(JSON.stringify(v.settings)), filter: JSON.parse(JSON.stringify(draft.filter)), sort: JSON.parse(JSON.stringify(draft.sort)), hidden_column_ids: [...draft.hidden_column_ids] });
  delete drafts[v.id]; navigate(`#/b/${b.id}/v/${nv.id}`);
}

function openFilter(anchor, b, v, draft, columns, allItems, ctx, advanced) {
  let mode = advanced || draft.filter.rules.some((r) => !r.quick) ? 'advanced' : 'quick';
  openPopover(anchor, ({ close, rerender }) => {
    const wrap = h('div', { style: { minWidth: '460px' } });
    const footer = () => h('div', { class: 'popover-footer' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { draft.filter = { logic: 'and', rules: [] }; close(); rerenderBody(); } }, 'Clear all'),
      h('span', { style: { display: 'flex', gap: '4px' } }, isDirty(v, draft) ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { saveToView(v, draft); close(); } }, 'Save to this view') : null, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => { close(); saveAsNewView(b, v, draft); } }, 'Save as new view')));
    if (mode === 'quick') {
      const qf = h('div', { class: 'quick-filters' }, h('h4', {}, 'Quick filters'));
      let any = false;
      for (const c of columns) {
        const T = typeOf(c); if (!T.quick) continue; const qs = T.quick(allItems, c, ctx); if (!qs.length) continue; any = true;
        qf.append(h('div', { class: 'qf-col' }, h('span', { class: 'qf-title truncate', title: c.title }, c.title), qs.map((q) => { const on = draft.filter.rules.some((r) => r.column_id === c.id && r.op === q.rule.op && r.arg === q.rule.arg); return h('button', { type: 'button', class: `qf-chip ${on ? 'on' : ''}`, 'aria-pressed': on, onclick: () => { if (on) draft.filter.rules = draft.filter.rules.filter((r) => !(r.column_id === c.id && r.op === q.rule.op && r.arg === q.rule.arg)); else draft.filter.rules.push({ ...q.rule, quick: true }); draft.filter.logic = 'and'; rerender(); rerenderBody(); } }, q.color ? h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: colorVar(q.color) } }) : null, q.label, h('span', { class: 'n' }, q.count)); })));
      }
      if (!any) qf.append(h('p', { class: 'muted' }, 'Add a status, people, date, dropdown or checkbox column to get quick filters.'));
      wrap.append(qf, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', style: { marginTop: '8px' }, onclick: () => { mode = 'advanced'; rerender(); } }, 'Switch to advanced filters'), footer());
    } else {
      const rules = draft.filter.rules;
      const list = h('div');
      const argInput = (r, col) => {
        const T = typeOf(col); const op = T.operators.find((o) => o.id === r.op);
        if (!op?.arg) return h('span');
        if (['label', 'person', 'option'].includes(op.arg)) { const opts = T.argOptions?.(col, ctx) || []; return h('select', { 'aria-label': 'Value', onchange: (e) => { r.arg = e.target.value; rerenderBody(); } }, h('option', { value: '' }, 'Choose…'), opts.map((o) => h('option', { value: o.value, selected: r.arg === o.value }, o.label))); }
        return h('input', { type: op.arg === 'date' ? 'date' : op.arg === 'number' ? 'number' : 'text', value: r.arg ?? '', 'aria-label': 'Value', oninput: (e) => { r.arg = e.target.value; rerenderBody(); } });
      };
      const row = (r, i) => {
        const col = columns.find((c) => c.id === r.column_id) || columns[0]; const T = typeOf(col);
        if (!r.column_id) r.column_id = col.id;
        if (!T.operators.some((o) => o.id === r.op)) r.op = T.operators[0]?.id;
        return h('div', { class: 'filter-rule' },
          h('select', { 'aria-label': 'Column', onchange: (e) => { r.column_id = e.target.value; r.op = null; r.arg = null; delete r.quick; rerender(); rerenderBody(); } }, columns.filter((c) => typeOf(c).operators?.length).map((c) => h('option', { value: c.id, selected: c.id === col.id }, c.title))),
          h('select', { 'aria-label': 'Condition', onchange: (e) => { r.op = e.target.value; r.arg = null; delete r.quick; rerender(); rerenderBody(); } }, T.operators.map((o) => h('option', { value: o.id, selected: o.id === r.op }, o.label))),
          argInput(r, col),
          h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Remove rule', onclick: () => { rules.splice(i, 1); rerender(); rerenderBody(); } }, icon('close', 'sm')));
      };
      rules.forEach((r, i) => list.append(row(r, i)));
      if (!rules.length) list.append(h('p', { class: 'muted' }, 'No rules yet. Add one below.'));
      wrap.append(h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } }, h('h4', { style: { margin: 0 } }, 'Advanced filters'), rules.length > 1 ? h('span', { class: 'seg' }, ['and', 'or'].map((l) => h('button', { type: 'button', class: draft.filter.logic === l ? 'on' : '', onclick: () => { draft.filter.logic = l; rerender(); rerenderBody(); } }, l.toUpperCase()))) : null),
        list, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { rules.push({ column_id: columns[0].id, op: null, arg: null }); rerender(); } }, icon('plus', 'sm'), 'Add new filter'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', style: { marginLeft: '8px' }, onclick: () => { mode = 'quick'; rerender(); } }, 'Quick filters'), footer());
    }
    return wrap;
  }, { onClose: () => { draft.filter.rules = draft.filter.rules.filter((r) => r.column_id && r.op && (!typeOf(columns.find((c) => c.id === r.column_id) || {}).operators?.find((o) => o.id === r.op)?.arg || (r.arg != null && r.arg !== ''))); rerenderBody(); } });
}
function openSort(anchor, b, v, draft, columns) {
  openPopover(anchor, ({ close, rerender }) => {
    const wrap = h('div', { style: { minWidth: '380px' } }, h('h4', {}, 'Sort by'));
    const list = h('div');
    draft.sort.forEach((s, i) => list.append(h('div', { class: 'filter-rule', style: { gridTemplateColumns: '1fr 1fr 28px' } },
      h('select', { 'aria-label': 'Column', onchange: (e) => { s.column_id = e.target.value; rerenderBody(); } }, columns.map((c) => h('option', { value: c.id, selected: c.id === s.column_id }, c.title))),
      h('select', { 'aria-label': 'Direction', onchange: (e) => { s.dir = e.target.value; rerenderBody(); } }, h('option', { value: 'asc', selected: s.dir === 'asc' }, 'Ascending'), h('option', { value: 'desc', selected: s.dir === 'desc' }, 'Descending')),
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Remove sort', onclick: () => { draft.sort.splice(i, 1); rerender(); rerenderBody(); } }, icon('close', 'sm')))));
    if (!draft.sort.length) list.append(h('p', { class: 'muted' }, 'Items keep their manual order until you add a sort.'));
    wrap.append(list, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { draft.sort.push({ column_id: columns[0].id, dir: 'asc' }); rerender(); rerenderBody(); } }, icon('plus', 'sm'), 'Add new sort'),
      h('div', { class: 'popover-footer' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { draft.sort = []; close(); rerenderBody(); } }, 'Clear'), h('span', { style: { display: 'flex', gap: '4px' } }, isDirty(v, draft) ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { saveToView(v, draft); close(); } }, 'Save to this view') : null, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => { close(); saveAsNewView(b, v, draft); } }, 'Save as new view'))));
    return wrap;
  });
}
function openHide(anchor, b, v, draft, columns) {
  openPopover(anchor, ({ close, rerender }) => {
    const hideable = columns.filter((c) => c.type !== 'name');
    const allOn = !draft.hidden_column_ids.length;
    return h('div', { class: 'check-list', style: { minWidth: '260px' } }, h('h4', {}, 'Show columns'),
      h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: allOn, indeterminate: !allOn && draft.hidden_column_ids.length < hideable.length, onchange: (e) => { draft.hidden_column_ids = e.target.checked ? [] : hideable.map((c) => c.id); rerender(); rerenderBody(); } }), h('b', {}, 'All columns')),
      hideable.map((c) => h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: !draft.hidden_column_ids.includes(c.id), onchange: (e) => { draft.hidden_column_ids = e.target.checked ? draft.hidden_column_ids.filter((x) => x !== c.id) : [...draft.hidden_column_ids, c.id]; rerender(); rerenderBody(); } }), icon(typeOf(c).icon, 'sm'), c.title)),
      h('p', { class: 'muted', style: { fontSize: 'var(--text-xs)', margin: '8px 4px 0' } }, 'The item name and the Updates bubble always show.'),
      h('div', { class: 'popover-footer' }, h('span'), h('span', { style: { display: 'flex', gap: '4px' } }, isDirty(v, draft) ? h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { saveToView(v, draft); close(); } }, 'Save to this view') : null, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => { close(); saveAsNewView(b, v, draft); } }, 'Save as new view'))));
  });
}

/* ---------- label editor (S12), column center (S11) ---------- */
export function openLabelEditor(col) {
  const labels = JSON.parse(JSON.stringify(col.settings.labels || []));
  openDialog({ title: `Edit labels: ${col.title}`, body: ({ close }) => {
    const list = h('div', { class: 'label-editor' });
    const draw = () => {
      list.replaceChildren(...labels.map((l, i) => {
        const sw = h('button', { type: 'button', class: 'swatch', style: { background: colorVar(l.color) }, 'aria-label': `Colour ${l.color}`, onclick: () => openPopover(sw, ({ close: c2 }) => h('div', { class: 'swatches' }, LABEL_COLORS.map((c) => h('button', { type: 'button', class: c === l.color ? 'on' : '', style: { background: colorVar(c) }, 'aria-label': c, onclick: () => { l.color = c; c2(); draw(); } })))) });
        const input = h('input', { class: 'input', value: l.text, placeholder: 'Label (blank = default)', 'aria-label': 'Label text', oninput: () => (l.text = input.value) });
        return h('div', { class: `lrow ${l.deactivated ? 'inactive' : ''}` }, sw, input,
          h('label', { class: 'muted', style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' } }, h('input', { type: 'checkbox', class: 'checkbox', checked: !!l.done, onchange: (e) => (l.done = e.target.checked) }), 'Done'),
          h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { labels.splice(i - 1, 0, labels.splice(i, 1)[0]); draw(); } }, icon('arrowU', 'sm')),
          h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Move down', disabled: i === labels.length - 1, onclick: () => { labels.splice(i + 1, 0, labels.splice(i, 1)[0]); draw(); } }, icon('arrowD', 'sm')),
          h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': l.deactivated ? 'Reactivate' : 'Deactivate', title: l.deactivated ? 'Reactivate' : 'Deactivate (hides it from the picker, keeps old values)', onclick: () => { l.deactivated = !l.deactivated; draw(); } }, icon(l.deactivated ? 'undo' : 'close', 'sm')));
      }));
    };
    draw();
    return h('div', {}, list,
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: labels.length >= 40, onclick: () => { labels.push({ id: uid('lbl'), text: 'New label', color: LABEL_COLORS[labels.length % LABEL_COLORS.length] }); draw(); list.lastChild?.querySelector('input')?.select(); } }, icon('plus', 'sm'), 'New label'),
      h('p', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, 'Up to 40 labels. Tick "Done" on the labels that mean finished: they drive overdue colouring and My work.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-secondary', onclick: close }, 'Cancel'), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { data.updateColumn(col.id, { settings: { ...col.settings, labels } }); close(); } }, 'Apply')));
  } });
}
export function openColumnCenter(b, afterCol = null) {
  let q = '';
  openDialog({ title: 'Add a column', wide: true, body: ({ close }) => {
    const grid = h('div', { class: 'column-center' });
    const input = h('input', { class: 'input', placeholder: 'Search column types', 'aria-label': 'Search column types', oninput: () => { q = input.value.toLowerCase(); draw(); } });
    const draw = () => { const types = ADDABLE.map((t) => [t, TYPES[t]]).filter(([t, T]) => `${T.label} ${T.hint}`.toLowerCase().includes(q)); grid.replaceChildren(...(types.length ? types.map(([t, T]) => h('button', { type: 'button', class: 'column-type', onclick: async () => { const c = await data.createColumn(b.id, t); if (afterCol) await data.moveColumn(c.id, nextColId(b, afterCol)); close(); toast(`${T.label} column added`); } }, h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 } }, icon(T.icon), T.label), h('span', { class: 'hint' }, T.hint))) : [h('p', { class: 'muted' }, 'Nothing matches.')])); };
    draw();
    return h('div', {}, h('div', { class: 'field' }, input), grid);
  }, actions: [{ label: 'Close' }] });
}
function nextColId(b, col) { const cols = data.columnsOf(b.id); const i = cols.findIndex((c) => c.id === col.id); return cols[i + 1]?.id || null; }

/* ---------- batch bar (S19) ---------- */
function renderBatchBar(page, b, ctx) {
  page.querySelector('.batch-bar')?.remove();
  page.querySelectorAll('.row.item-row').forEach((r) => { const on = selection.has(r.dataset.item); r.classList.toggle('selected', on); const cb = r.querySelector('.cell-check input'); if (cb) cb.checked = on; });
  if (!selection.size) return;
  const ids = [...selection]; const n = ids.length; const term = b.item_terminology || 'item';
  const bar = h('div', { class: 'batch-bar', role: 'region', 'aria-label': 'Selected items' },
    h('span', { class: 'count' }, n), h('span', { style: { marginRight: '8px' } }, `${term}${n > 1 ? 's' : ''} selected`),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => { await data.duplicateItems(ids); selection.clear(); toast(`${n} duplicated`); } }, icon('copy', 'sm'), 'Duplicate'),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: (e) => openMenu(e.currentTarget, data.groupsOf(b.id).map((g) => ({ label: g.title, onSelect: async () => { await data.moveItemsToGroup(ids, g.id); selection.clear(); } }))) }, icon('moveTo', 'sm'), 'Move to group'),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: (e) => openMenu(e.currentTarget, data.allBoards().filter((x) => x.id !== b.id).map((x) => ({ label: x.name, onSelect: async () => { await data.moveItemsToBoard(ids, x.id); selection.clear(); toast(`Moved to ${x.name}`); } }))) }, icon('board', 'sm'), 'Move to board'),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => { await data.deleteItems(ids, { mode: 'archived' }); selection.clear(); toast(`${n} archived`, { undo: () => data.restoreItems(ids) }); } }, icon('archive', 'sm'), 'Archive'),
    h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: async () => { await data.deleteItems(ids); selection.clear(); toast(`${n} deleted`, { undo: () => data.restoreItems(ids) }); } }, icon('trash', 'sm'), 'Delete'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Clear selection', onclick: () => { selection.clear(); renderBatchBar(page, b, ctx); } }, icon('close')));
  page.append(bar);
}

/* ---------- activity panel (S08) ---------- */
export function describeActivity(a, ctx) {
  const col = a.column_id ? data.column(a.column_id) : null; const it = a.item_id ? data.item(a.item_id) : null;
  const val = (v) => { if (!col) return h('span', {}, String(v ?? '')); const T = typeOf(col); const el = h('span', { style: { display: 'inline-flex', alignItems: 'center' } }); try { el.append(v == null ? h('span', { class: 'muted' }, 'empty') : T.render(v, col, ctx, it || { values: {}, name: '' })); } catch { el.append(String(v)); } return el; };
  const name = it ? it.name : a.new_value || a.old_value || '';
  switch (a.event) {
    case 'value_changed': return [h('div', { class: 'what' }, h('b', {}, name), ' · ', col?.title || 'column'), h('div', { class: 'delta' }, val(a.old_value), '→', val(a.new_value))];
    case 'item_created': return [h('div', { class: 'what' }, 'Created ', h('b', {}, a.new_value))];
    case 'item_renamed': return [h('div', { class: 'what' }, 'Renamed ', h('b', {}, a.old_value), ' → ', h('b', {}, a.new_value))];
    case 'item_moved': return [h('div', { class: 'what' }, 'Moved ', h('b', {}, name)), h('div', { class: 'delta muted' }, a.old_value, ' → ', a.new_value)];
    case 'item_deleted': return [h('div', { class: 'what' }, 'Deleted ', h('b', {}, a.old_value))];
    case 'item_archived': return [h('div', { class: 'what' }, 'Archived ', h('b', {}, a.old_value))];
    case 'item_restored': return [h('div', { class: 'what' }, 'Restored ', h('b', {}, a.new_value))];
    case 'update_posted': return [h('div', { class: 'what' }, 'Posted an update on ', h('b', {}, name)), h('div', { class: 'delta muted' }, String(a.new_value || '').slice(0, 120))];
    case 'reply_posted': return [h('div', { class: 'what' }, 'Replied on ', h('b', {}, name)), h('div', { class: 'delta muted' }, String(a.new_value || '').slice(0, 120))];
    case 'group_created': return [h('div', { class: 'what' }, 'Added group ', h('b', {}, a.new_value))];
    case 'group_renamed': return [h('div', { class: 'what' }, 'Renamed group ', h('b', {}, a.old_value), ' → ', h('b', {}, a.new_value))];
    case 'group_deleted': return [h('div', { class: 'what' }, 'Deleted group ', h('b', {}, a.old_value))];
    case 'column_created': return [h('div', { class: 'what' }, 'Added column ', h('b', {}, a.new_value))];
    case 'column_renamed': return [h('div', { class: 'what' }, 'Renamed column ', h('b', {}, a.old_value), ' → ', h('b', {}, a.new_value))];
    case 'column_deleted': return [h('div', { class: 'what' }, 'Deleted column ', h('b', {}, a.old_value))];
    case 'board_created': return [h('div', { class: 'what' }, 'Created the board')];
    case 'board_renamed': return [h('div', { class: 'what' }, 'Renamed the board ', h('b', {}, a.old_value), ' → ', h('b', {}, a.new_value))];
    case 'board_kind': return [h('div', { class: 'what' }, 'Changed board type ', a.old_value, ' → ', a.new_value)];
    default: return [h('div', { class: 'what' }, a.event)];
  }
}
export function activityList(rows, ctx) {
  if (!rows.length) return h('div', { class: 'empty' }, h('h3', {}, 'No activity yet'), h('p', {}, 'Changes to items, groups and columns show up here.'));
  return h('div', {}, rows.map((a) => { const u = data.user(a.user_id); return h('div', { class: 'log-row' }, h('span', { class: 'when', title: fmtDateTime(a.created_at) }, relTime(a.created_at)), u ? avatar(u, 'sm') : h('span'), h('div', {}, describeActivity(a, ctx))); }));
}
function renderActivityPanel(b, ctx, tab) {
  let who = null; let t = tab === 'viewed' ? 'viewed' : 'log';
  const close = () => setParam('log', null);
  const panel = h('aside', { class: 'item-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Board activity' });
  const body = h('div', { class: 'ip-body' });
  const draw = () => {
    body.replaceChildren();
    if (t === 'log') {
      const rows = data.activityOf(b.id, { userId: who });
      body.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' } }, h('select', { class: 'input', style: { width: '200px' }, 'aria-label': 'Filter by person', onchange: (e) => { who = e.target.value || null; draw(); } }, h('option', { value: '' }, 'Everyone'), data.users().map((u) => h('option', { value: u.id, selected: who === u.id }, u.name))), h('span', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, `${rows.length} entries`)), activityList(rows, ctx));
    } else {
      const lv = Object.entries(b.last_viewed || {}).sort((a, c) => c[1].localeCompare(a[1]));
      body.append(lv.length ? lv.map(([id, when]) => { const u = data.user(id); return u ? h('div', { class: 'list-row' }, avatar(u, 'md'), h('span', { style: { flex: 1 } }, u.name), h('span', { class: 'muted', title: fmtDateTime(when) }, relTime(when))) : null; }) : h('div', { class: 'empty' }, h('h3', {}, 'Nobody has viewed this board yet')));
    }
  };
  const tabBtn = (id, label) => h('button', { type: 'button', role: 'tab', class: 'view-tab', 'aria-selected': t === id, onclick: () => { t = id; panel.querySelectorAll('[role=tab]').forEach((x) => x.setAttribute('aria-selected', x === tabBtnEls[id])); draw(); } }, label);
  const tabBtnEls = { log: tabBtn('log', 'Activity log'), viewed: tabBtn('viewed', 'Last viewed') };
  panel.append(h('div', { class: 'ip-head' }, icon('log'), h('span', { class: 'ip-name', style: { border: 0 } }, 'Activity'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('close'))), h('div', { class: 'ip-tabs', role: 'tablist' }, tabBtnEls.log, tabBtnEls.viewed), body);
  draw();
  return h('div', {}, h('div', { class: 'item-panel-backdrop', onclick: close }), panel);
}

/* ---------- new board (S10) ---------- */
export function openNewBoard(wsId, folderId = null) {
  const name = h('input', { class: 'input', placeholder: 'e.g. Q4 campaigns', 'aria-label': 'Board name', maxlength: 120 });
  const err = h('div', { class: 'err', hidden: true }, 'Give the board a name.');
  let kind = 'public';
  const ws = h('select', { class: 'input', 'aria-label': 'Workspace' }, data.workspaces().map((w) => h('option', { value: w.id, selected: w.id === wsId }, w.name)));
  const submit = ({ close }) => { const v = name.value.trim(); if (!v) { err.hidden = false; name.classList.add('error'); name.focus(); return false; } data.createBoard({ name: v, kind, workspace_id: ws.value, folder_id: ws.value === wsId ? folderId : null }).then((b) => { close(); navigate(`#/b/${b.id}`); }); return false; };
  openDialog({ title: 'Create a board', body: ({ close }) => h('form', { onsubmit: (e) => { e.preventDefault(); submit({ close }); } },
    h('div', { class: 'field' }, h('label', {}, 'Board name'), name, err),
    h('div', { class: 'field' }, h('label', {}, 'Who can see it'), h('div', { class: 'radio-row' }, [['public', 'Main', 'Everyone in the workspace'], ['share', 'Shareable', 'Members and invited guests'], ['private', 'Private', 'Only people you add']].map(([k, l, hint]) => h('label', { class: 'radio-card' }, h('input', { type: 'radio', name: 'kind', value: k, checked: k === kind, onchange: () => (kind = k) }), l, h('span', { class: 'hint' }, hint))))),
    h('div', { class: 'field' }, h('label', {}, 'Workspace'), ws),
    h('p', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, 'It starts with one group, three items and Person, Status and Date columns.')),
  actions: [{ label: 'Cancel' }, { label: 'Create board', primary: true, closes: false, onClick: submit }] });
}
