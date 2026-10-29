// S07 Search everything: boards, items, people.
import { h, icon, avatar, colorVar } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { boardCard } from './workspace.js';
import { navigate } from '../app.js';

export function renderSearch(q) {
  const page = h('div', { class: 'page' });
  const input = h('input', { class: 'input', type: 'search', value: q, placeholder: 'Search boards, items and people', 'aria-label': 'Search everything', style: { height: '40px', fontSize: 'var(--text-md)' }, onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/search?q=${encodeURIComponent(input.value.trim())}`); } });
  page.append(h('h1', {}, 'Search everything'), h('div', { class: 'field' }, input));
  setTimeout(() => input.focus(), 0);
  if (!q) { page.append(h('p', { class: 'muted' }, 'Type a board name, an item name, a value in any column or a person. Press Enter.')); return page; }
  const r = data.search(q);
  const total = r.boards.length + r.items.length + r.people.length;
  if (!total) { page.append(h('div', { class: 'empty' }, h('h3', {}, `Nothing for "${q}"`), h('p', {}, 'Private boards you are not on never show up here.'))); return page; }
  if (r.boards.length) page.append(h('div', { class: 'result-group' }, h('h3', {}, `Boards · ${r.boards.length}`), h('div', { class: 'card-list' }, r.boards.map(boardCard))));
  if (r.items.length) page.append(h('div', { class: 'result-group' }, h('h3', {}, `Items · ${r.items.length}`), r.items.map(({ item, board, group }) => h('a', { class: 'list-row', href: `#/b/${board.id}?item=${item.id}` }, h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: colorVar(group?.color), flex: 'none' } }), h('span', { style: { flex: 1 } }, item.name), h('span', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, `${board.name} › ${group?.title || ''}`)))));
  if (r.people.length) page.append(h('div', { class: 'result-group' }, h('h3', {}, `People · ${r.people.length}`), r.people.map((u) => h('div', { class: 'list-row' }, avatar(u, 'md'), h('span', {}, h('div', {}, u.name), h('div', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, `${u.title || ''} · ${u.email}`))))));
  return page;
}
