// S01 Workspace home: recents, boards, folders, members.
import { h, icon, avatarGroup, relTime, editInline } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { openNewBoard } from './board.js';

export function renderWorkspace(wsId) {
  const ws = data.workspace(wsId);
  if (!ws || ws.state !== 'active') return h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h3', {}, 'That workspace is gone'), h('p', {}, 'Pick another one from the left pane.')));
  data.setPref('lastWorkspace', wsId);
  const boards = data.boardsIn(wsId);
  const folders = data.foldersIn(wsId);
  const recents = data.prefs().recentBoards.map(data.board).filter((b) => b && b.state === 'active' && b.workspace_id === wsId);
  const members = ws.is_default ? data.users() : data.users();
  const page = h('div', { class: 'page' });
  const title = h('h1', { title: 'Click to rename', onclick: () => editInline(title, { onSave: (v) => data.updateWorkspace(wsId, { name: v }) }) }, ws.name);
  const desc = h('p', { class: 'muted', style: { margin: '0 0 var(--space-3)', minHeight: '20px' }, title: 'Click to edit the description', onclick: () => editInline(desc, { multiline: true, select: false, onSave: (v) => data.updateWorkspace(wsId, { description: v }) }) }, ws.description || 'Add a description');
  page.append(
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' } },
      h('span', { class: 'ws-avatar', style: { width: '40px', height: '40px', fontSize: 'var(--text-lg)', background: `var(--color-label-${ws.is_default ? 'blue' : 'purple'})` } }, ws.name[0]),
      h('div', { style: { flex: 1 } }, title, h('div', { class: 'muted', style: { fontSize: 'var(--text-sm)' } }, `${ws.kind === 'closed' ? 'Closed' : 'Open'} workspace · ${boards.length} board${boards.length === 1 ? '' : 's'} · ${members.length} members`)),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openNewBoard(wsId) }, icon('plus'), 'New board')),
    desc,
  );
  if (recents.length) {
    page.append(h('h2', {}, 'Recently visited'));
    page.append(h('div', { class: 'card-list' }, recents.slice(0, 4).map(boardCard)));
  }
  page.append(h('h2', {}, 'Boards'));
  if (!boards.length) page.append(h('div', { class: 'empty' }, h('h3', {}, 'No boards here yet'), h('p', {}, 'A board is a table of items with the columns you choose.'), h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openNewBoard(wsId) }, 'Create the first board')));
  else {
    const loose = boards.filter((b) => !b.folder_id);
    if (loose.length) page.append(h('div', { class: 'card-list' }, loose.map(boardCard)));
    for (const f of folders) {
      const inF = boards.filter((b) => b.folder_id === f.id);
      page.append(h('h2', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-md)' } }, icon('folder'), f.name, h('span', { class: 'muted', style: { fontWeight: 400 } }, `${inF.length}`)));
      page.append(inF.length ? h('div', { class: 'card-list' }, inF.map(boardCard)) : h('p', { class: 'muted' }, 'Empty folder.'));
    }
  }
  page.append(h('h2', {}, 'Members'), h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' } }, members.map((u) => h('span', { class: 'chip soft', style: { height: '32px', gap: '8px' } }, avatarGroup([u], 1, 'sm'), u.name))));
  return page;
}

export function boardCard(b) {
  const n = data.itemsOf(b.id).length;
  const lv = b.last_viewed ? Object.entries(b.last_viewed).sort((a, c) => c[1].localeCompare(a[1])) : [];
  return h('a', { class: 'board-card', href: `#/b/${b.id}` },
    h('span', { class: 'name' }, icon(b.kind === 'private' ? 'lock' : 'board'), h('span', { class: 'truncate' }, b.name), data.isFavorite(b.id) ? icon('star', 'sm') : null),
    h('span', { class: 'meta truncate' }, b.description || `${n} item${n === 1 ? '' : 's'}`),
    h('span', { class: 'meta', style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' } }, avatarGroup(lv.slice(0, 3).map(([id]) => data.user(id)).filter(Boolean), 3, 'sm'), lv[0] ? `viewed ${relTime(lv[0][1])}` : `updated ${relTime(b.updated_at)}`));
}
