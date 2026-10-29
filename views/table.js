// S02 Main Table: groups of rows with typed cells, add row, summaries, column headers, drag and drop, keyboard.
import { h, icon, openMenu, openPopover, confirmDialog, promptDialog, toast, editInline, colorVar, LABEL_COLORS } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { typeOf, renderCell, cellText } from '../lib/columns.js';
import { openColumnCenter, openLabelEditor, setFocusTarget, focusTarget } from './board.js';

const ROW = 36;   // must equal --layout-row: item rows are fixed-height so the window spacers can stand in for unrendered rows
const BUFFER = 30; // rows rendered above and below the viewport
export function renderTable(model) {
  const { board: b, view: v, draft, ctx, columns, groups, visible, selection, onSelect } = model;
  const nameCol = columns.find((c) => c.type === 'name');
  const shown = columns.filter((c) => c.type === 'name' || !draft.hidden_column_ids.includes(c.id));
  const dataCols = shown.filter((c) => c.type !== 'name');
  const colsTemplate = () => `40px ${nameCol.width}px ${dataCols.map((c) => `${c.width}px`).join(' ')} 48px`;
  const root = h('div', { class: 'table-view' });
  const windows = []; // one per group: {g, items, win, start, end}
  const filtered = draft.filter.rules.length || draft.search || draft.person;
  const visibleIds = new Set(visible.map((i) => i.id));
  const sortedOrder = new Map(visible.map((i, idx) => [i.id, idx]));
  let anyRows = false;
  const term = b.item_terminology || 'item';
  for (const g of groups) {
    const items = data.itemsInGroup(g.id).filter((i) => visibleIds.has(i.id)).sort((a, c) => sortedOrder.get(a.id) - sortedOrder.get(c.id));
    if (filtered && !items.length) continue;
    anyRows = anyRows || items.length > 0;
    root.append(renderGroup(g, items));
  }
  if (!anyRows && filtered) root.append(h('div', { class: 'empty' }, h('h3', {}, `No ${term}s match`), h('p', {}, 'Change the search, person or filter to see more.')));
  if (!groups.length) root.append(h('div', { class: 'empty' }, h('h3', {}, 'This board has no groups'), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => data.createGroup(b.id) }, 'Add a group')));
  root.append(h('button', { type: 'button', class: 'btn btn-secondary btn-sm add-group', onclick: () => data.createGroup(b.id, { where: 'bottom' }) }, icon('plus', 'sm'), 'Add new group'));
  root.addEventListener('keydown', onCellArrows);
  mountWindows();
  return root;

  // Row windowing: each group renders only the rows near the viewport; two spacers keep the scroll height honest.
  // shortcut: rows must stay 36px tall (no wrap mode) and arrow-key navigation stops at the window edge; revisit if either changes
  function windowed(g, items, win) {
    const w = { g, items, win, start: -1, end: -1 };
    windows.push(w);
    let start = 0; const idx = focusTarget?.itemId ? items.findIndex((it) => it.id === focusTarget.itemId) : -1;
    if (idx > BUFFER) start = idx - BUFFER;
    fill(w, start, Math.min(items.length, start + 2 * BUFFER));
  }
  function fill(w, start, end) {
    w.start = start; w.end = end;
    w.win.replaceChildren(h('div', { style: { height: `${start * ROW}px` }, 'aria-hidden': 'true' }), ...w.items.slice(start, end).map((it) => renderRow(it, w.g)), h('div', { style: { height: `${(w.items.length - end) * ROW}px` }, 'aria-hidden': 'true' }));
  }
  function mountWindows() {
    const outlet = document.getElementById('outlet'); if (!outlet) return;
    const draw = () => {
      if (!root.isConnected) { outlet.removeEventListener('scroll', onScroll); return; }
      const top = outlet.scrollTop, bottom = top + outlet.clientHeight, base = outlet.getBoundingClientRect().top;
      for (const w of windows) {
        if (w.win.contains(document.activeElement)) continue; // never pull a cell out from under an open editor
        const offset = w.win.getBoundingClientRect().top - base + top;
        const start = Math.max(0, Math.floor((top - offset) / ROW) - BUFFER);
        const end = Math.max(start, Math.min(w.items.length, Math.ceil((bottom - offset) / ROW) + BUFFER));
        if (start !== w.start || end !== w.end) fill(w, start, end);
      }
    };
    let ticking = false;
    const onScroll = () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; draw(); }); };
    outlet.addEventListener('scroll', onScroll);
    requestAnimationFrame(draw);
  }

  function renderGroup(g, items) {
    const collapsed = !!data.prefs().collapsed[g.id];
    const sec = h('section', { class: `group ${collapsed ? 'collapsed' : ''}`, 'aria-labelledby': `g-${g.id}`, style: { '--gc': colorVar(g.color) }, dataset: { group: g.id } });
    const title = h('h2', { id: `g-${g.id}`, class: 'group-title truncate', tabindex: 0, title: 'Click to rename', onclick: () => editInline(title, { onSave: (t) => data.updateGroup(g.id, { title: t }) }), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); title.click(); } } }, g.title);
    const chev = h('button', { type: 'button', class: 'icon-btn sm chev', 'aria-expanded': !collapsed, 'aria-label': collapsed ? `Expand ${g.title}` : `Collapse ${g.title}`, onclick: () => data.toggleCollapsed(g.id) }, icon(collapsed ? 'chevR' : 'chevD'));
    const more = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `${g.title} menu`, onclick: () => openMenu(more, groupMenu(g)) }, icon('dots', 'sm'));
    const header = h('div', { class: 'group-header', draggable: true,
      ondragstart: (e) => { e.dataTransfer.setData('app/group', g.id); e.dataTransfer.effectAllowed = 'move'; sec.classList.add('dragging'); },
      ondragend: () => sec.classList.remove('dragging'),
      ondragover: (e) => { if (e.dataTransfer.types.includes('app/group') || e.dataTransfer.types.includes('app/item')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } },
      ondrop: async (e) => { e.preventDefault(); const gid = e.dataTransfer.getData('app/group'); if (gid && gid !== g.id) return data.moveGroup(gid, g.id); const iid = e.dataTransfer.getData('app/item'); if (iid) { const ids = selection.has(iid) ? [...selection] : [iid]; for (const id of ids) await data.moveItem(id, { group_id: g.id, before: data.itemsInGroup(g.id)[0]?.id || null }); } },
    }, chev, more, title, h('span', { class: 'group-count' }, collapsed ? `${items.length} ${term}${items.length === 1 ? '' : 's'}` : ''));
    sec.append(header);
    if (collapsed) return sec;
    const scroll = h('div', { class: 'grid-scroll' });
    const table = h('div', { class: 'grid-table', role: 'table', 'aria-label': g.title, style: { '--cols': colsTemplate() } });
    table.append(renderHeaderRow(g, items));
    const win = h('div', { class: 'rows' });
    table.append(win); windowed(g, items, win);
    table.append(renderAddRow(g));
    if (items.length && dataCols.some((c) => typeOf(c).summary)) table.append(renderSummaryRow(g, items));
    scroll.append(table); sec.append(scroll);
    return sec;
  }

  function groupMenu(g) {
    const all = data.groupsOf(b.id);
    return [
      { label: 'Add group', icon: 'plus', onSelect: () => data.createGroup(b.id, { where: 'bottom' }) },
      { label: 'Rename group', icon: 'edit', onSelect: async () => { const t = await promptDialog({ title: 'Rename group', label: 'Group name', value: g.title }); if (t) data.updateGroup(g.id, { title: t.slice(0, 255) }); } },
      { label: 'Change group colour', icon: 'status', submenu: LABEL_COLORS.map((c) => ({ label: c[0].toUpperCase() + c.slice(1), icon: g.color === c ? 'check' : undefined, onSelect: () => data.updateGroup(g.id, { color: c }) })) },
      { divider: true },
      { label: 'Collapse all groups', icon: 'collapse', kbd: 'Ctrl+G', onSelect: () => data.toggleCollapsed(g.id, true) },
      { label: 'Expand all groups', icon: 'collapse', onSelect: () => data.toggleCollapsed(g.id, false) },
      { divider: true },
      { label: 'Duplicate group', icon: 'copy', submenu: [{ label: 'Duplicate items', onSelect: () => data.duplicateGroup(g.id, false) }, { label: 'Duplicate items and updates', onSelect: () => data.duplicateGroup(g.id, true) }, { label: 'Structure only (no items)', onSelect: () => data.createGroup(b.id, { title: `Duplicate of ${g.title}`, color: g.color, where: 'bottom' }) }] },
      { label: 'Move group to top', icon: 'arrowU', disabled: all[0]?.id === g.id, onSelect: () => data.moveGroup(g.id, all[0].id) },
      { label: 'Move group to bottom', icon: 'arrowD', disabled: all[all.length - 1]?.id === g.id, onSelect: () => data.moveGroup(g.id, null) },
      { divider: true },
      { label: 'Delete group', icon: 'trash', danger: true, disabled: all.length <= 1, onSelect: async () => { const n = data.itemsInGroup(g.id).length; if (!(await confirmDialog({ title: `Delete "${g.title}"?`, message: n ? `Its ${n} ${term}${n === 1 ? '' : 's'} go to the trash with it.` : 'The group is empty.', confirmLabel: 'Delete', danger: true }))) return; const ids = await data.deleteGroup(g.id); toast(`Group "${g.title}" deleted`, { undo: () => data.restoreGroup(g.id, ids) }); } },
    ];
  }

  function renderHeaderRow(g, items) {
    const row = h('div', { class: 'row header-row', role: 'row' });
    const allSel = items.length > 0 && items.every((i) => selection.has(i.id));
    row.append(h('div', { class: 'cell cell-check', role: 'columnheader' }, h('input', { type: 'checkbox', class: 'checkbox', 'aria-label': `Select all in ${g.title}`, checked: allSel, indeterminate: !allSel && items.some((i) => selection.has(i.id)), onchange: (e) => onSelect(items.map((i) => i.id), e.target.checked) })));
    row.append(colHeader(nameCol, true));
    dataCols.forEach((c) => row.append(colHeader(c, false)));
    row.append(h('div', { class: 'cell cell-add-col', role: 'columnheader' }, h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Add column', 'data-add-column': '1', title: 'Add column (Ctrl+Shift+C)', onclick: () => openColumnCenter(b) }, icon('plus', 'sm'))));
    return row;
  }
  function colHeader(c, isName) {
    const T = typeOf(c);
    const sortRule = draft.sort.find((s) => s.column_id === c.id); const sortIdx = draft.sort.findIndex((s) => s.column_id === c.id);
    const title = h('span', { class: 'title', tabindex: 0, role: 'button', title: 'Click to rename', 'aria-label': `${c.title} column. Click to rename`, onclick: () => editInline(title, { onSave: (t) => data.updateColumn(c.id, { title: t }) }), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); title.click(); } } }, c.title);
    const sortBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': sortRule ? (sortRule.dir === 'asc' ? 'Sorted ascending. Click for descending' : 'Sorted descending. Click to clear') : 'Sort by this column', onclick: (e) => { const other = e.ctrlKey || e.metaKey ? draft.sort.filter((s) => s.column_id !== c.id) : []; if (!sortRule) draft.sort = [...other, { column_id: c.id, dir: 'asc' }]; else if (sortRule.dir === 'asc') draft.sort = [...other, { column_id: c.id, dir: 'desc' }]; else draft.sort = other; rerender(); } }, icon(sortRule?.dir === 'desc' ? 'arrowD' : 'arrowU', 'sm'));
    const menuBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `${c.title} column menu`, onclick: () => openMenu(menuBtn, columnMenu(c)) }, icon('dots', 'sm'));
    const cell = h('div', { class: `cell col-header ${isName ? 'cell-name' : ''} ${sortRule ? 'sorted' : ''}`, role: 'columnheader', 'aria-sort': sortRule ? (sortRule.dir === 'asc' ? 'ascending' : 'descending') : 'none', draggable: !isName, dataset: { colhead: c.id },
      ondragstart: (e) => { e.dataTransfer.setData('app/column', c.id); e.dataTransfer.effectAllowed = 'move'; },
      ondragover: (e) => { if (!isName && e.dataTransfer.types.includes('app/column')) { e.preventDefault(); cell.classList.add('drag-over'); } },
      ondragleave: () => cell.classList.remove('drag-over'),
      ondrop: (e) => { cell.classList.remove('drag-over'); const id = e.dataTransfer.getData('app/column'); if (id && id !== c.id) { const cols = data.columnsOf(b.id); const i = cols.findIndex((x) => x.id === c.id); data.moveColumn(id, cols[i + 1]?.id || null); } },
    }, isName ? h('span', { style: { width: '6px' } }) : null, title, h('span', { class: 'tools' }, T.compare ? sortBtn : null, sortIdx > 0 ? h('span', { class: 'badge soft', title: 'Sub-sort order' }, sortIdx + 1) : null, menuBtn));
    const handle = h('div', { class: 'resize-handle', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': `Resize ${c.title}`, tabindex: 0, onkeydown: (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); data.updateColumn(c.id, { width: Math.max(60, c.width + (e.key === 'ArrowRight' ? 10 : -10)) }); } } });
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId);
      const startX = e.clientX, startW = c.width;
      const move = (ev) => { c.width = Math.max(60, Math.round(startW + ev.clientX - startX)); root.querySelectorAll('.grid-table').forEach((t) => t.style.setProperty('--cols', colsTemplate())); };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); data.updateColumn(c.id, { width: c.width }); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
    cell.append(handle);
    return cell;
  }
  function columnMenu(c) {
    const T = typeOf(c); const cols = data.columnsOf(b.id); const i = cols.findIndex((x) => x.id === c.id);
    const settings = [];
    if (c.type === 'status') settings.push({ label: 'Edit labels', icon: 'edit', onSelect: () => openLabelEditor(c) });
    if (c.type === 'people') settings.push({ label: `Limit: ${c.settings.limit ? c.settings.limit + ' per item' : 'unlimited'}`, icon: 'people', submenu: [[0, 'Unlimited'], [1, '1 person'], [2, '2 people'], [3, '3 people']].map(([n, l]) => ({ label: l, icon: (c.settings.limit || 0) === n ? 'check' : undefined, onSelect: () => data.updateColumn(c.id, { settings: { ...c.settings, limit: n } }) })) });
    if (c.type === 'numbers') settings.push({ label: 'Unit', icon: 'number', onSelect: async () => { const u = await promptDialog({ title: 'Number unit', label: 'Unit (e.g. h, £, %)', value: c.settings.unit || '' }); if (u != null) data.updateColumn(c.id, { settings: { ...c.settings, unit: u } }); } });
    if (c.type === 'dropdown') settings.push({ label: 'Edit options', icon: 'dropdown', onSelect: () => openDropdownEditor(c) });
    return [
      { label: 'Rename', icon: 'edit', onSelect: async () => { const t = await promptDialog({ title: 'Rename column', label: 'Column name', value: c.title }); if (t) data.updateColumn(c.id, { title: t }); } },
      { label: c.description ? 'Edit description' : 'Add description', icon: 'longtext', onSelect: async () => { const t = await promptDialog({ title: 'Column description', label: 'Shown when hovering the header', value: c.description || '' }); if (t != null) data.updateColumn(c.id, { description: t }); } },
      ...settings,
      { divider: true },
      T.compare ? { label: 'Sort', icon: 'sort', submenu: [{ label: 'Sort ascending', onSelect: () => { draft.sort = [{ column_id: c.id, dir: 'asc' }]; rerender(); } }, { label: 'Sort descending', onSelect: () => { draft.sort = [{ column_id: c.id, dir: 'desc' }]; rerender(); } }, { label: 'Add as sub-sort', onSelect: () => { draft.sort = [...draft.sort.filter((s) => s.column_id !== c.id), { column_id: c.id, dir: 'asc' }]; rerender(); } }] } : null,
      c.type !== 'name' ? { label: 'Hide column', icon: 'eye', onSelect: () => { draft.hidden_column_ids = [...draft.hidden_column_ids, c.id]; rerender(); } } : null,
      { label: 'Add column to the right', icon: 'plus', onSelect: () => openColumnCenter(b, c) },
      c.type !== 'name' ? { label: 'Duplicate column', icon: 'copy', submenu: [{ label: 'Without values', onSelect: () => data.duplicateColumn(c.id, false) }, { label: 'With values', onSelect: () => data.duplicateColumn(c.id, true) }] } : null,
      c.type !== 'name' ? { label: 'Move left', icon: 'chevL', disabled: i <= 1, onSelect: () => data.moveColumn(c.id, cols[i - 1].id) } : null,
      c.type !== 'name' ? { label: 'Move right', icon: 'chevR', disabled: i >= cols.length - 1, onSelect: () => data.moveColumn(c.id, cols[i + 2]?.id || null) } : null,
      { divider: true },
      c.type !== 'name' ? { label: 'Delete column', icon: 'trash', danger: true, onSelect: async () => { const n = data.itemsOf(b.id).filter((it) => it.values[c.id] != null).length; if (!(await confirmDialog({ title: `Delete "${c.title}"?`, message: n ? `${n} ${term}${n === 1 ? ' has' : 's have'} a value here. Those values are lost.` : 'The column is empty.', confirmLabel: 'Delete', danger: true }))) return; data.deleteColumn(c.id); } } : { label: 'The item column cannot be deleted', disabled: true },
    ];
  }
  function openDropdownEditor(c) {
    const options = JSON.parse(JSON.stringify(c.settings.options || []));
    openPopover(document.querySelector(`[data-colhead="${c.id}"]`) || document.body, ({ close }) => {
      const list = h('div', { class: 'label-editor' });
      const draw = () => list.replaceChildren(...options.map((o, i) => { const sw = h('button', { type: 'button', class: 'swatch', style: { background: colorVar(o.color) }, 'aria-label': 'Colour', onclick: () => openPopover(sw, ({ close: c2 }) => h('div', { class: 'swatches' }, LABEL_COLORS.map((col) => h('button', { type: 'button', style: { background: colorVar(col) }, 'aria-label': col, onclick: () => { o.color = col; c2(); draw(); } })))) }); return h('div', { class: 'lrow' }, sw, h('input', { class: 'input', value: o.text, 'aria-label': 'Option', oninput: (e) => (o.text = e.target.value) }), h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Remove', onclick: () => { options.splice(i, 1); draw(); } }, icon('close', 'sm'))); }));
      draw();
      return h('div', { style: { minWidth: '320px' } }, h('h4', {}, 'Dropdown options'), list, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { options.push({ id: `opt_${Date.now().toString(36)}`, text: 'New option', color: LABEL_COLORS[options.length % LABEL_COLORS.length] }); draw(); } }, icon('plus', 'sm'), 'Add option'), h('div', { class: 'popover-footer' }, h('span'), h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => { data.updateColumn(c.id, { settings: { ...c.settings, options: options.filter((o) => o.text.trim()) } }); close(); } }, 'Apply')));
    });
  }

  function renderRow(it, g) {
    const row = h('div', { class: `row item-row ${selection.has(it.id) ? 'selected' : ''}`, role: 'row', draggable: true, dataset: { item: it.id },
      ondragstart: (e) => { e.dataTransfer.setData('app/item', it.id); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); },
      ondragend: () => row.classList.remove('dragging'),
      ondragover: (e) => { if (!e.dataTransfer.types.includes('app/item')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const r = row.getBoundingClientRect(); const top = e.clientY < r.top + r.height / 2; row.classList.toggle('drag-over-top', top); row.classList.toggle('drag-over-bottom', !top); },
      ondragleave: () => row.classList.remove('drag-over-top', 'drag-over-bottom'),
      ondrop: async (e) => { e.preventDefault(); const top = row.classList.contains('drag-over-top'); row.classList.remove('drag-over-top', 'drag-over-bottom'); const id = e.dataTransfer.getData('app/item'); if (!id || id === it.id) return; const ids = selection.has(id) ? [...selection].filter((x) => x !== it.id) : [id]; const sorted = data.itemsInGroup(g.id); const idx = sorted.findIndex((x) => x.id === it.id); const before = top ? it.id : sorted[idx + 1]?.id || null; for (const x of ids) await data.moveItem(x, { group_id: g.id, before }); if (draft.sort.length) toast('Dropped into manual order; the sort still applies on screen.'); },
    });
    row.append(h('div', { class: 'cell cell-check', role: 'cell' }, h('input', { type: 'checkbox', class: 'checkbox', 'aria-label': `Select ${it.name}`, checked: selection.has(it.id), onchange: (e) => onSelect([it.id], e.target.checked) })));
    const count = data.updateCount(it.id); const recent = data.hasRecentUpdate(it.id);
    const nameText = h('span', { class: 'name-text', tabindex: 0, role: 'button', 'aria-label': `${it.name}. Click to rename`, onclick: () => editInline(nameText, { onSave: (n) => data.updateItem(it.id, { name: n }) }), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); nameText.click(); } } }, it.name);
    const menuBtn = h('button', { type: 'button', class: 'icon-btn sm row-menu', 'aria-label': `${it.name} menu`, onclick: () => openMenu(menuBtn, itemMenu(it, g)) }, icon('dots', 'sm'));
    const openBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm row-menu', 'aria-label': `Open ${it.name}`, onclick: () => ctx.openItem(it) }, 'Open');
    const bubble = h('button', { type: 'button', class: `bubble ${recent ? 'recent' : ''}`, title: count ? `${count} update${count === 1 ? '' : 's'}${recent ? ', activity in the last 7 days' : ''}` : 'Start a conversation', 'aria-label': `${count} updates for ${it.name}`, onclick: () => ctx.openItem(it, 'updates') }, icon('bubble'), count ? h('span', {}, count) : null);
    row.append(h('div', { class: 'cell cell-name', role: 'cell', dataset: { col: nameCol.id } }, menuBtn, nameText, openBtn, bubble));
    dataCols.forEach((c) => { const cell = renderCell(it, c, ctx); cell.dataset.col = c.id; cell.setAttribute('role', 'cell'); if (c.description) cell.title = c.description; row.append(cell); });
    row.append(h('div', { class: 'cell', role: 'cell' }));
    return row;
  }
  function itemMenu(it, g) {
    const all = data.groupsOf(b.id);
    return [
      { label: `Open ${term}`, icon: 'board', onSelect: () => ctx.openItem(it) },
      { label: 'Rename', icon: 'edit', onSelect: () => root.querySelector(`[data-item="${it.id}"] .name-text`)?.click() },
      { divider: true },
      { label: `Create new ${term} below`, icon: 'plus', onSelect: async () => { const n = await data.createItem({ board_id: b.id, group_id: g.id, name: `New ${term}`, after: it.id }); setFocusTarget({ itemId: n.id, colId: nameCol.id }); } },
      { label: 'Duplicate', icon: 'copy', submenu: [{ label: 'Duplicate', onSelect: () => data.duplicateItems([it.id], false) }, { label: 'Duplicate with updates', onSelect: () => data.duplicateItems([it.id], true) }] },
      { label: 'Move to group', icon: 'moveTo', submenu: all.filter((x) => x.id !== g.id).map((x) => ({ label: x.title, onSelect: () => data.moveItem(it.id, { group_id: x.id, before: null }) })).concat(all.length <= 1 ? [{ label: 'No other groups', disabled: true }] : []) },
      { label: 'Move to board', icon: 'board', submenu: data.allBoards().filter((x) => x.id !== b.id).map((x) => ({ label: x.name, onSelect: () => data.moveItemsToBoard([it.id], x.id).then(() => toast(`Moved to ${x.name}`)) })) },
      { label: 'Move to top', icon: 'arrowU', onSelect: () => data.moveItem(it.id, { group_id: g.id, before: data.itemsInGroup(g.id)[0]?.id || null }) },
      { label: 'Move to bottom', icon: 'arrowD', onSelect: () => data.moveItem(it.id, { group_id: g.id, before: null }) },
      { divider: true },
      { label: 'Archive', icon: 'archive', onSelect: async () => { await data.deleteItems([it.id], { mode: 'archived' }); toast(`"${it.name}" archived`, { undo: () => data.restoreItems([it.id]) }); } },
      { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { await data.deleteItems([it.id]); toast(`"${it.name}" deleted`, { undo: () => data.restoreItems([it.id]) }); } },
    ];
  }
  function renderAddRow(g) {
    const input = h('input', { placeholder: `+ Add ${term}`, 'aria-label': `Add ${term} to ${g.title}`, onkeydown: async (e) => { if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); const name = input.value.trim(); input.value = ''; setFocusTarget({ addRowGroup: g.id }); await data.createItem({ board_id: b.id, group_id: g.id, name, where: 'bottom' }); } if (e.key === 'Escape') { input.value = ''; input.blur(); } } });
    const row = h('div', { class: 'row add-row', role: 'row', dataset: { addRow: g.id }, ondragover: (e) => { if (e.dataTransfer.types.includes('app/item')) e.preventDefault(); }, ondrop: async (e) => { e.preventDefault(); const id = e.dataTransfer.getData('app/item'); if (!id) return; const ids = selection.has(id) ? [...selection] : [id]; for (const x of ids) await data.moveItem(x, { group_id: g.id, before: null }); } });
    row.append(h('div', { class: 'cell cell-check', role: 'cell' }), h('div', { class: 'cell cell-name', role: 'cell' }, input));
    dataCols.forEach(() => row.append(h('div', { class: 'cell', role: 'cell' }))); row.append(h('div', { class: 'cell', role: 'cell' }));
    return row;
  }
  function renderSummaryRow(g, items) {
    const row = h('div', { class: 'row summary-row', role: 'row' });
    row.append(h('div', { class: 'cell cell-check', role: 'cell' }), h('div', { class: 'cell cell-name', role: 'cell' }));
    dataCols.forEach((c) => { const T = typeOf(c); const s = T.summary ? T.summary(items, c, ctx) : null; row.append(h('div', { class: 'cell', role: 'cell', style: { padding: '4px 8px' } }, s)); });
    row.append(h('div', { class: 'cell', role: 'cell' }));
    return row;
  }
  function rerender() { window.dispatchEvent(new HashChangeEvent('hashchange')); }
  function onCellArrows(e) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || e.target.closest('input,textarea,[contenteditable="true"]') || !e.target.classList.contains('cell')) return;
    const row = e.target.closest('.row'); if (!row) return;
    const cells = [...row.querySelectorAll('.cell[tabindex]')]; const ci = cells.indexOf(e.target);
    let target = null;
    if (e.key === 'ArrowLeft') target = cells[ci - 1]; if (e.key === 'ArrowRight') target = cells[ci + 1];
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const rows = [...root.querySelectorAll('.row.item-row')]; const ri = rows.indexOf(row); const r2 = rows[ri + (e.key === 'ArrowDown' ? 1 : -1)]; if (r2) { const col = e.target.dataset.col; target = r2.querySelector(`.cell[data-col="${col}"][tabindex]`) || r2.querySelectorAll('.cell[tabindex]')[ci]; } }
    if (target) { e.preventDefault(); target.focus(); }
  }
}
