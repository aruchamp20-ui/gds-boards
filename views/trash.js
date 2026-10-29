// S20 Trash and archive: restore boards and items within 30 days.
import { h, icon, relTime, toast } from '../lib/ui.js';
import * as data from '../lib/data.js';

export function renderTrash() {
  const page = h('div', { class: 'page' });
  const t = data.trash();
  page.append(h('h1', {}, 'Trash and archive'), h('p', { class: 'muted' }, 'Deleted things stay here for 30 days. Archived things stay until you restore them.'));
  const section = (title, rows, label, restore) => {
    page.append(h('h2', {}, `${title} · ${rows.length}`));
    if (!rows.length) { page.append(h('p', { class: 'muted' }, 'Nothing here.')); return; }
    page.append(h('div', {}, rows.map((r) => h('div', { class: 'list-row' }, icon(r.state === 'archived' ? 'archive' : 'trash'), h('span', { style: { flex: 1 } }, h('div', {}, r.name), h('div', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, label(r))), h('span', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, `${r.state} ${relTime(r.deleted_at)}`), h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { restore(r); toast(`"${r.name}" restored`); } }, 'Restore')))));
  };
  section('Boards', t.boards, (b) => data.workspace(b.workspace_id)?.name || '', (b) => data.restoreBoard(b.id));
  section('Items', t.items, (i) => `${data.board(i.board_id)?.name || ''} › ${data.group(i.group_id)?.title || ''}`, (i) => data.restoreItems([i.id]));
  return page;
}
