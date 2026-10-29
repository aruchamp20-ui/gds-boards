// S03 Kanban: lanes from a status column's labels, cards with chosen columns, drag between lanes changes the status.
import { h, icon, openMenu, toast, colorVar, confirmDialog, promptDialog } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { typeOf, renderCell } from '../lib/columns.js';
import { openViewSettings } from './board.js';

export function renderKanban(model) {
  const { board: b, view: v, draft, ctx, columns, visible, groups } = model;
  const term = b.item_terminology || 'item';
  const statusCol = columns.find((c) => c.id === v.settings.status_column_id && c.type === 'status');
  if (!statusCol) {
    const statuses = columns.filter((c) => c.type === 'status');
    return h('div', { class: 'setup empty' }, h('h3', {}, 'Pick the status column for the lanes'), h('p', {}, statuses.length ? 'Each label becomes a lane. Dragging a card between lanes changes its status.' : 'This board has no status column yet. Add one from the table view, then come back.'), statuses.length ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openViewSettings(b, v) }, 'Choose a column') : h('a', { class: 'btn btn-primary', href: `#/b/${b.id}` }, 'Back to the table'));
  }
  const cardCols = (v.settings.card_column_ids || []).map((id) => columns.find((c) => c.id === id)).filter((c) => c && !draft.hidden_column_ids.includes(c.id));
  const labels = (statusCol.settings.labels || []).filter((l) => !l.deactivated);
  const divideCol = v.settings.divide_by ? columns.find((c) => c.id === v.settings.divide_by) : null;
  const limits = v.settings.limits || {};
  const root = h('div', {});
  const lanesFor = (items, keySuffix = '') => {
    const board = h('div', { class: 'kanban' });
    for (const l of labels) {
      const inLane = items.filter((i) => (i.values[statusCol.id]?.label || null) === (l.text ? l.id : i.values[statusCol.id]?.label || null) && (l.text || !i.values[statusCol.id]?.label || !labels.some((x) => x.id === i.values[statusCol.id]?.label)));
      const limit = limits[l.id]; const over = limit && inLane.length > limit;
      const lane = h('section', { class: 'lane', 'aria-label': l.text || 'No status', style: { '--lc': colorVar(l.color) },
        ondragover: (e) => { if (e.dataTransfer.types.includes('app/item')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; lane.classList.add('drag-over'); } },
        ondragleave: (e) => { if (!lane.contains(e.relatedTarget)) lane.classList.remove('drag-over'); },
        ondrop: async (e) => { e.preventDefault(); lane.classList.remove('drag-over'); const id = e.dataTransfer.getData('app/item'); const it = data.item(id); if (!it) return; await data.setValue(it, statusCol, l.text ? { label: l.id } : null); if (limit && inLane.length + 1 > limit && !inLane.some((x) => x.id === id)) toast(`"${l.text}" is over its limit of ${limit}`, { kind: 'danger' }); },
      });
      const addBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Add ${term} to ${l.text || 'no status'}`, onclick: async () => { const g = groups[0]; if (!g) return; const it = await data.createItem({ board_id: b.id, group_id: g.id, name: `New ${term}`, where: 'top', values: l.text ? { [statusCol.id]: { label: l.id } } : {} }); ctx.openItem(it); } }, icon('plus', 'sm'));
      const menuBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Lane menu', onclick: () => openMenu(menuBtn, [
        { label: limit ? `Column limit: ${limit}` : 'Set column limit', icon: 'number', onSelect: async () => { const n = await promptDialog({ title: `Limit for "${l.text || 'No status'}"`, label: 'Most cards allowed (blank to remove)', value: limit || '' }); if (n == null) return; const lim = { ...limits }; if (Number(n) > 0) lim[l.id] = Number(n); else delete lim[l.id]; data.updateView(v.id, { settings: { ...data.view(v.id).settings, limits: lim } }); } },
        { label: 'Edit labels', icon: 'edit', onSelect: () => ctx.openLabelEditor(statusCol) },
      ]) }, icon('dots', 'sm'));
      lane.append(h('div', { class: `lane-head ${over ? 'over' : ''}` }, h('span', { class: 'truncate' }, l.text || 'No status'), h('span', { class: 'n' }, limit ? `${inLane.length} / ${limit}` : inLane.length), addBtn, menuBtn));
      const body = h('div', { class: 'lane-body' });
      if (!inLane.length) body.append(h('div', { class: 'drop-hint' }, 'Drop cards here'));
      inLane.forEach((it) => body.append(renderCard(it)));
      lane.append(body); board.append(lane);
    }
    return board;
  };
  if (divideCol) {
    const T = typeOf(divideCol);
    const keys = divideCol.type === 'status' ? (divideCol.settings.labels || []).map((l) => ({ key: l.id, label: l.text || 'Blank', color: l.color, test: (i) => (i.values[divideCol.id]?.label || null) === (l.text ? l.id : null) })) : (divideCol.settings.options || []).map((o) => ({ key: o.id, label: o.text, color: o.color, test: (i) => (i.values[divideCol.id]?.ids || []).includes(o.id) })).concat([{ key: '_none', label: 'No value', color: 'grey', test: (i) => !(i.values[divideCol.id]?.ids || []).length }]);
    for (const k of keys) { const items = visible.filter(k.test); if (!items.length && v.settings.hide_empty_swimlanes) continue; root.append(h('div', { class: 'swimlane-title' }, h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: colorVar(k.color) } }), k.label, h('span', { class: 'muted', style: { fontWeight: 400 } }, items.length)), lanesFor(items, k.key)); }
  } else {
    const overview = h('div', { class: 'summary-bar', style: { margin: '12px var(--space-5) 0', maxWidth: '420px', height: '10px' }, title: 'Distribution of cards' });
    const n = visible.length || 1;
    labels.forEach((l) => { const c = visible.filter((i) => (i.values[statusCol.id]?.label || null) === (l.text ? l.id : null)).length; if (c) overview.append(h('span', { style: { width: `${(c / n) * 100}%`, background: colorVar(l.color) }, title: `${l.text || 'No status'}: ${c}` })); });
    root.append(overview, lanesFor(visible));
  }
  return root;

  function renderCard(it) {
    const g = data.group(it.group_id);
    const card = h('article', { class: 'card', draggable: true, tabindex: 0, 'aria-label': it.name, dataset: { item: it.id },
      ondragstart: (e) => { e.dataTransfer.setData('app/item', it.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); },
      ondragend: () => card.classList.remove('dragging'),
      onclick: (e) => { if (e.target.closest('.cell, button, a')) return; ctx.openItem(it); },
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === card) ctx.openItem(it); },
    });
    const menuBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `${it.name} menu`, onclick: (e) => { e.stopPropagation(); openMenu(menuBtn, [
      { label: `Open ${term}`, icon: 'board', onSelect: () => ctx.openItem(it) },
      { label: 'Move to lane', icon: 'moveTo', submenu: labels.map((l) => ({ label: l.text || 'No status', onSelect: () => data.setValue(it, statusCol, l.text ? { label: l.id } : null) })) },
      { label: 'Move to group', icon: 'moveTo', submenu: groups.filter((x) => x.id !== it.group_id).map((x) => ({ label: x.title, onSelect: () => data.moveItem(it.id, { group_id: x.id, before: null }) })) },
      { label: 'Duplicate', icon: 'copy', onSelect: () => data.duplicateItems([it.id]) },
      { divider: true },
      { label: 'Archive', icon: 'archive', onSelect: async () => { await data.deleteItems([it.id], { mode: 'archived' }); toast(`"${it.name}" archived`, { undo: () => data.restoreItems([it.id]) }); } },
      { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { await data.deleteItems([it.id]); toast(`"${it.name}" deleted`, { undo: () => data.restoreItems([it.id]) }); } },
    ], { align: 'end' }); } }, icon('dots', 'sm'));
    card.append(h('div', { class: 'card-name' }, h('span', {}, it.name), menuBtn));
    card.append(h('div', { class: 'card-row' }, h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: colorVar(g?.color) } }), g?.title || '')));
    for (const c of cardCols) { const cell = renderCell(it, c, ctx, { tag: 'span' }); cell.classList.add('v'); cell.style.padding = '0'; cell.style.border = '0'; cell.style.minHeight = '24px'; cell.dataset.col = c.id; card.append(h('div', { class: 'card-row' }, h('span', { class: 'truncate' }, c.title), cell)); }
    return card;
  }
}
