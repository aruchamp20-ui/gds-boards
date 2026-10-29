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
  const members = data.users().filter((u) => !u.deactivated); // deactivated monday users stay on their cells but are not members
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
    const renderFolder = (f, depth) => {
      const inF = boards.filter((b) => b.folder_id === f.id); const subs = data.folderTree(wsId, f.id);
      page.append(h('h2', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-md)', marginLeft: `${depth * 20}px` } }, icon('folder'), f.name, h('span', { class: 'muted', style: { fontWeight: 400 } }, `${inF.length}`)));
      if (inF.length) page.append(h('div', { class: 'card-list', style: { marginLeft: `${depth * 20}px` } }, inF.map(boardCard)));
      else if (!subs.length) page.append(h('p', { class: 'muted', style: { marginLeft: `${depth * 20}px` } }, 'Empty folder.'));
      subs.forEach((sf) => renderFolder(sf, depth + 1));
    };
    data.folderTree(wsId, null).forEach((f) => renderFolder(f, 0));
  }
  const shown = members.filter((u) => !u.deactivated).slice(0, 24);
  page.append(h('h2', {}, `Members · ${members.length}`), h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' } }, shown.map((u) => h('span', { class: 'chip soft', style: { height: '32px', gap: '8px' } }, avatarGroup([u], 1, 'sm'), u.name)), members.length > shown.length ? h('span', { class: 'chip soft', style: { height: '32px' } }, `+${members.length - shown.length} more`) : null));
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
