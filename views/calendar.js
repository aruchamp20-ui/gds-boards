// S04 Calendar: items plotted by a date or timeline column; month / week / day; click a day to add; drag a chip to move its date.
import { h, icon, colorVar, ymd, addDays, parseYmd, startOfWeek, MONTH_NAMES, fmtDate } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { typeOf, renderCell } from '../lib/columns.js';
import { openViewSettings } from './board.js';

const session = {}; // view id -> {mode, anchor}

export function renderCalendar(model) {
  const { board: b, view: v, ctx, columns, visible, groups } = model;
  const term = b.item_terminology || 'item';
  const dateCol = columns.find((c) => c.id === v.settings.date_column_id && (c.type === 'date' || c.type === 'timeline'));
  if (!dateCol) {
    const dates = columns.filter((c) => c.type === 'date' || c.type === 'timeline');
    return h('div', { class: 'setup empty' }, h('h3', {}, 'Pick the date column to plot'), h('p', {}, dates.length ? 'Items appear on their date. Click a day to add one.' : 'This board has no date column yet. Add one from the table view, then come back.'), dates.length ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openViewSettings(b, v) }, 'Choose a column') : h('a', { class: 'btn btn-primary', href: `#/b/${b.id}` }, 'Back to the table'));
  }
  const colorCol = columns.find((c) => c.id === v.settings.color_column_id && c.type === 'status');
  const s = session[v.id] || (session[v.id] = { mode: 'month', anchor: ymd() });
  const T = typeOf(dateCol);
  const start = (it) => T.dateOf?.(it.values[dateCol.id]) || null;
  const end = (it) => T.dateEnd?.(it.values[dateCol.id]) || start(it);
  const onDay = (d) => visible.filter((it) => { const a = start(it); return a && a <= d && d <= end(it); });
  const chipColor = (it) => { if (colorCol) { const l = (colorCol.settings.labels || []).find((x) => x.id === it.values[colorCol.id]?.label); if (l) return colorVar(l.color); } return colorVar(data.group(it.group_id)?.color); };
  const root = h('div', { class: 'calendar' });
  const title = h('h2');
  const nav = h('div', { class: 'cal-nav' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous', onclick: () => { s.anchor = shift(-1); draw(); } }, icon('chevL')),
    h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { s.anchor = ymd(); draw(); } }, 'Today'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next', onclick: () => { s.anchor = shift(1); draw(); } }, icon('chevR')),
    title,
    h('span', { class: 'seg', role: 'group', 'aria-label': 'Calendar period' }, ['month', 'week', 'day'].map((m) => h('button', { type: 'button', class: s.mode === m ? 'on' : '', 'aria-pressed': s.mode === m, onclick: () => { s.mode = m; draw(); } }, m[0].toUpperCase() + m.slice(1)))));
  const grid = h('div');
  root.append(nav, grid);
  draw();
  return root;

  function shift(n) { const d = parseYmd(s.anchor); if (s.mode === 'month') { d.setDate(1); d.setMonth(d.getMonth() + n); } else d.setDate(d.getDate() + n * (s.mode === 'week' ? 7 : 1)); return ymd(d); }
  function draw() {
    const a = parseYmd(s.anchor); grid.replaceChildren();
    if (s.mode === 'month') { title.textContent = `${MONTH_NAMES[a.getMonth()]} ${a.getFullYear()}`; const first = new Date(a.getFullYear(), a.getMonth(), 1); const from = startOfWeek(ymd(first)); grid.append(monthGrid(from, 42, a.getMonth())); }
    else if (s.mode === 'week') { const from = startOfWeek(s.anchor); title.textContent = `${fmtDate(from)} – ${fmtDate(addDays(from, 6), { year: true })}`; grid.append(monthGrid(from, 7, null, 'cal-week')); }
    else { title.textContent = fmtDate(s.anchor, { year: true }); grid.append(dayList(s.anchor)); }
  }
  function monthGrid(from, n, month, cls = '') {
    const g = h('div', { class: `cal-grid ${cls}` });
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => g.append(h('div', { class: 'cal-dow' }, d)));
    const today = ymd();
    for (let i = 0; i < n; i++) {
      const d = addDays(from, i); const dd = parseYmd(d); const items = onDay(d);
      const max = cls ? 50 : 3;
      const cell = h('div', { class: `cal-day ${month != null && dd.getMonth() !== month ? 'other' : ''} ${d === today ? 'today' : ''}`, role: 'button', tabindex: 0, 'aria-label': `${fmtDate(d, { year: true })}, ${items.length} ${term}${items.length === 1 ? '' : 's'}. Press Enter to add one.`,
        onclick: (e) => { if (e.target.closest('.cal-chip, .cal-more')) return; addOn(d); },
        onkeydown: (e) => { if (e.key === 'Enter' && e.target === cell) addOn(d); },
        ondragover: (e) => { if (e.dataTransfer.types.includes('app/item')) { e.preventDefault(); cell.classList.add('drag-over'); } },
        ondragleave: () => cell.classList.remove('drag-over'),
        ondrop: async (e) => { e.preventDefault(); cell.classList.remove('drag-over'); const it = data.item(e.dataTransfer.getData('app/item')); if (!it) return; const cur = it.values[dateCol.id]; if (dateCol.type === 'timeline') { const len = cur?.from && cur?.to ? Math.round((parseYmd(cur.to) - parseYmd(cur.from)) / 864e5) : 0; await data.setValue(it, dateCol, { from: d, to: addDays(d, len) }); } else await data.setValue(it, dateCol, { date: d, time: cur?.time || null }); },
      }, h('span', { class: 'd' }, dd.getDate()));
      items.slice(0, max).forEach((it) => cell.append(h('button', { type: 'button', class: 'cal-chip', draggable: true, style: { background: chipColor(it) }, title: it.name, ondragstart: (e) => { e.dataTransfer.setData('app/item', it.id); e.dataTransfer.effectAllowed = 'move'; }, onclick: (e) => { e.stopPropagation(); ctx.openItem(it); } }, it.name)));
      if (items.length > max) cell.append(h('button', { type: 'button', class: 'cal-more', onclick: (e) => { e.stopPropagation(); s.mode = 'day'; s.anchor = d; draw(); } }, `+${items.length - max} more`));
      g.append(cell);
    }
    return g;
  }
  function dayList(d) {
    const items = onDay(d);
    const list = h('div', { class: 'cal-list' });
    if (!items.length) list.append(h('div', { class: 'empty' }, h('h3', {}, `Nothing on ${fmtDate(d)}`), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => addOn(d) }, `Add ${term}`)));
    items.forEach((it) => { const g = data.group(it.group_id); const sc = columns.find((c) => c.type === 'status'); const row = h('div', { class: 'cal-item' }, h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: chipColor(it), flex: 'none' } }), h('button', { type: 'button', class: 'name-text', style: { flex: 1, textAlign: 'left', fontWeight: 500 }, onclick: () => ctx.openItem(it) }, it.name), h('span', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, g?.title || '')); if (sc) { const c = renderCell(it, sc, ctx); c.style.width = '150px'; c.style.border = '0'; row.append(c); } list.append(row); });
    return list;
  }
  async function addOn(d) {
    const g = groups[0]; if (!g) return;
    const it = await data.createItem({ board_id: b.id, group_id: g.id, name: `New ${term}`, where: 'bottom', values: { [dateCol.id]: dateCol.type === 'timeline' ? { from: d, to: d } : { date: d, time: null } } });
    ctx.openItem(it);
  }
}
