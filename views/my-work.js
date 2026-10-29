// S06 My Work: items assigned to me across boards, in six date buckets.
import { h, icon, avatar, openPopover, colorVar, ymd, addDays, startOfWeek } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { renderCell } from '../lib/columns.js';
import { makeCtx } from './board.js';
import { navigate } from '../app.js';

export function renderMyWork(params) {
  const p = data.prefs(); const mw = p.myWork || (p.myWork = { hideDone: false, person: null, hiddenBoards: [] });
  const who = mw.person || data.me().id;
  const q = (params.q || '').toLowerCase();
  const page = h('div', { class: 'page mywork' });
  const rows = data.myWork(who).filter(({ board }) => !mw.hiddenBoards.includes(board.id)).filter(({ item, statusCol }) => !(mw.hideDone && statusCol && makeCtx(data.board(item.board_id)).itemIsDone(item))).filter(({ item }) => !q || item.name.toLowerCase().includes(q));
  const today = ymd(); const weekStart = startOfWeek(today); const nextWeekStart = addDays(weekStart, 7); const laterStart = addDays(weekStart, 14);
  const buckets = [['Past dates', (d) => d && d < today], ['Today', (d) => d === today], ['This week', (d) => d && d > today && d < nextWeekStart], ['Next week', (d) => d && d >= nextWeekStart && d < laterStart], ['Later', (d) => d && d >= laterStart], ['Without a date', (d) => !d]];
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search my work', value: params.q || '', 'aria-label': 'Search my work', style: { width: '240px' }, oninput: () => { const s = search.value.trim(); navigate(`#/my-work${s ? '?q=' + encodeURIComponent(s) : ''}`); setTimeout(() => document.querySelector('.mywork input[type=search]')?.focus(), 20); } });
  const customize = h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openPopover(customize, ({ rerender }) => h('div', { class: 'check-list', style: { minWidth: '280px' } },
    h('h4', {}, 'Show work for'), h('select', { class: 'input', 'aria-label': 'Person', onchange: (e) => { mw.person = e.target.value === data.me().id ? null : e.target.value; data.setPref('myWork', mw); redraw(); } }, data.users().map((u) => h('option', { value: u.id, selected: u.id === who }, u.name))),
    h('h4', { style: { marginTop: '12px' } }, 'Boards'), data.allBoards().map((b) => h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: !mw.hiddenBoards.includes(b.id), onchange: (e) => { mw.hiddenBoards = e.target.checked ? mw.hiddenBoards.filter((x) => x !== b.id) : [...mw.hiddenBoards, b.id]; data.setPref('myWork', mw); redraw(); } }), b.name)),
    h('h4', { style: { marginTop: '12px' } }, 'Options'), h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: mw.hideDone, onchange: (e) => { mw.hideDone = e.target.checked; data.setPref('myWork', mw); redraw(); } }), 'Hide done items'),
    h('p', { class: 'muted', style: { fontSize: 'var(--text-xs)' } }, 'Items appear here when a People column on their board has this person in it.')), { align: 'end' }) }, icon('filter', 'sm'), 'Customize');
  page.append(h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' } }, h('div', { style: { flex: 1 } }, h('h1', {}, who === data.me().id ? 'My work' : `${data.user(who)?.name}'s work`), h('div', { class: 'muted' }, `${rows.length} item${rows.length === 1 ? '' : 's'} across ${new Set(rows.map((r) => r.board.id)).size} board${new Set(rows.map((r) => r.board.id)).size === 1 ? '' : 's'}`)), search, customize));
  if (!rows.length) { page.append(h('div', { class: 'empty' }, h('h3', {}, q ? 'Nothing matches' : 'Nothing assigned yet'), h('p', {}, q ? 'Try another word.' : 'When someone puts you in a People column, the item shows up here by date.'))); return page; }
  for (const [label, test] of buckets) {
    const inB = rows.filter(({ item, dateCol }) => test(dateCol ? item.values[dateCol.id]?.date || null : null));
    if (!inB.length) continue;
    const open = !(mw.collapsed || {})[label];
    const sec = h('section', { class: 'bucket' });
    sec.append(h('button', { type: 'button', class: 'bucket-head', 'aria-expanded': open, onclick: () => { mw.collapsed = { ...(mw.collapsed || {}), [label]: open }; data.setPref('myWork', mw); redraw(); } }, icon(open ? 'chevD' : 'chevR', 'sm'), label, h('span', { class: 'n' }, inB.length)));
    if (open) {
      const table = h('div', { class: 'grid-table', role: 'table', style: { width: '100%' } });
      table.append(h('div', { class: 'row header-row' }, h('div', { class: 'cell cell-name' }, 'Item'), h('div', { class: 'cell hide-sm' }, 'Board'), h('div', { class: 'cell hide-sm' }, 'Group'), h('div', { class: 'cell hide-sm cell-center' }, 'People'), h('div', { class: 'cell cell-center' }, 'Date'), h('div', { class: 'cell cell-center' }, 'Status')));
      for (const r of inB) {
        const ctx = makeCtx(r.board); const it = r.item;
        const row = h('div', { class: 'row item-row', role: 'row', dataset: { item: it.id } });
        row.append(h('div', { class: 'cell cell-name', role: 'cell' }, h('span', { style: { width: '4px', alignSelf: 'stretch', background: colorVar(r.group?.color), borderRadius: '2px' } }), h('button', { type: 'button', class: 'name-text', style: { textAlign: 'left', flex: 1 }, onclick: () => navigate(`#/b/${r.board.id}?item=${it.id}`) }, it.name), h('button', { type: 'button', class: 'btn btn-ghost btn-sm row-menu', onclick: () => navigate(`#/b/${r.board.id}?item=${it.id}`) }, 'Open')));
        row.append(h('div', { class: 'cell hide-sm board-link', role: 'cell' }, h('a', { href: `#/b/${r.board.id}` }, r.board.name)));
        row.append(h('div', { class: 'cell hide-sm', role: 'cell', style: { color: colorVar(r.group?.color), fontSize: 'var(--text-sm)' } }, r.group?.title || ''));
        const pc = r.peopleCol ? renderCell(it, r.peopleCol, ctx, { extraClass: 'hide-sm' }) : h('div', { class: 'cell hide-sm' }); pc.dataset.col = r.peopleCol?.id || ''; row.append(pc);
        const dc = r.dateCol ? renderCell(it, r.dateCol, ctx) : h('div', { class: 'cell cell-center muted' }, '—'); dc.dataset.col = r.dateCol?.id || ''; row.append(dc);
        const sc = r.statusCol ? renderCell(it, r.statusCol, ctx) : h('div', { class: 'cell cell-center muted' }, '—'); sc.dataset.col = r.statusCol?.id || ''; row.append(sc);
        table.append(row);
      }
      sec.append(table);
    }
    page.append(sec);
  }
  return page;
  function redraw() { window.dispatchEvent(new HashChangeEvent('hashchange')); }
}
