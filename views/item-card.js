// S05 Item card: every column editable, Updates thread (post, reply, like, pin, edit, delete, @mention), item activity log.
import { h, icon, avatar, openMenu, confirmDialog, toast, editInline, colorVar, relTime, fmtDateTime, esc } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { renderCell, typeOf } from '../lib/columns.js';
import { activityList } from './board.js';

export function renderItemPanel(it, ctx, { tab = 'updates', onClose }) {
  const b = data.board(it.board_id); const g = data.group(it.group_id);
  const columns = data.columnsOf(b.id).filter((c) => c.type !== 'name');
  const panel = h('aside', { class: 'item-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ip-title' });
  const prevFocus = document.activeElement;
  const close = () => { onClose(); prevFocus?.focus?.({ preventScroll: true }); };
  const name = h('h2', { id: 'ip-title', class: 'ip-name truncate', title: 'Click to rename', tabindex: 0, onclick: () => editInline(name, { onSave: (n) => data.updateItem(it.id, { name: n }) }), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); name.click(); } } }, it.name);
  const more = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Item menu', onclick: () => openMenu(more, [
    { label: 'Duplicate', icon: 'copy', onSelect: () => data.duplicateItems([it.id], false) },
    { label: 'Move to group', icon: 'moveTo', submenu: data.groupsOf(b.id).filter((x) => x.id !== g.id).map((x) => ({ label: x.title, onSelect: () => data.moveItem(it.id, { group_id: x.id, before: null }) })) },
    { divider: true },
    { label: 'Archive', icon: 'archive', onSelect: async () => { await data.deleteItems([it.id], { mode: 'archived' }); close(); toast(`"${it.name}" archived`, { undo: () => data.restoreItems([it.id]) }); } },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { await data.deleteItems([it.id]); close(); toast(`"${it.name}" deleted`, { undo: () => data.restoreItems([it.id]) }); } },
  ], { align: 'end' }) }, icon('dots'));
  panel.append(
    h('div', { class: 'ip-head' }, h('span', { class: 'gdot', style: { background: colorVar(g?.color) } }), name, more, h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('close'))),
    h('div', { class: 'ip-sub' }, h('a', { href: `#/b/${b.id}` }, b.name), ' › ', g?.title || ''),
  );
  const count = data.updateCount(it.id);
  const tabs = h('div', { class: 'ip-tabs', role: 'tablist' });
  const body = h('div', { class: 'ip-body' });
  const mk = (id, label) => h('button', { type: 'button', role: 'tab', class: 'view-tab', 'aria-selected': tab === id, onclick: () => { tab = id; [...tabs.children].forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === id)); draw(); }, dataset: { tab: id } }, label);
  tabs.append(mk('updates', `Updates${count ? ` (${count})` : ''}`), mk('activity', 'Activity log'));
  panel.append(tabs, body);
  let colsOpen = columns.length <= 8; // wide boards fold the column list so the conversation and log stay in view
  function draw() {
    body.replaceChildren();
    if (tab === 'updates') { data.markSeen(it.id); body.append(renderUpdates(it, ctx)); }
    else body.append(activityList(data.activityOf(b.id, { itemId: it.id }), ctx));
    const toggle = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': colsOpen, style: { margin: 'var(--space-3) 0 var(--space-2)' }, onclick: () => { colsOpen = !colsOpen; draw(); } }, icon(colsOpen ? 'chevD' : 'chevR', 'sm'), `${columns.length} columns`);
    body.append(toggle);
    if (colsOpen) { const grid = h('div', { class: 'ip-cols' }); columns.forEach((c) => { grid.append(h('div', { class: 'k' }, icon(typeOf(c).icon, 'sm'), ' ', c.title)); const cell = renderCell(it, c, ctx); cell.dataset.col = c.id; grid.append(cell); }); body.append(grid); }
  }
  draw();
  panel.addEventListener('keydown', (e) => { // focus trap
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('input,textarea,select,button,[href],[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  setTimeout(() => panel.querySelector('textarea')?.focus(), 0);
  return h('div', {}, h('div', { class: 'item-panel-backdrop', onclick: close }), panel);
}

/* ---------- updates ---------- */
export function formatBody(text) {
  // own light markup: **bold**, _italic_, "- " lists, @[Name] mentions. Everything is escaped first.
  const lines = esc(text).split('\n');
  const out = []; let inList = false;
  for (const line of lines) {
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(inline(line) + '<br>');
  }
  if (inList) out.push('</ul>');
  return out.join('').replace(/<br>$/, '');
  function inline(s) { return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(?=\s|$|[.,!?])/g, '$1<i>$2</i>').replace(/@\[([^\]]+)\]/g, '<span class="mention">@$1</span>'); }
}
function renderUpdates(it, ctx) {
  const wrap = h('div');
  wrap.append(composeBox({ placeholder: 'Write an update. Use @ to mention someone.', onPost: (body) => data.createUpdate(it.id, body) }));
  const all = data.updatesOf(it.id);
  const tops = all.filter((u) => !u.parent_update_id).sort((a, b) => (b.pinned - a.pinned) || b.created_at.localeCompare(a.created_at));
  if (!tops.length) wrap.append(h('div', { class: 'empty' }, h('h3', {}, 'No updates yet'), h('p', {}, 'Keep the conversation about this item here, where everyone can find it.')));
  for (const u of tops) wrap.append(renderUpdate(u, all.filter((r) => r.parent_update_id === u.id), it, ctx));
  return wrap;
}
function renderUpdate(u, replies, it, ctx, isReply = false) {
  const me = data.me().id; const who = data.user(u.creator_id);
  const el = h('article', { class: `update ${u.pinned ? 'pinned' : ''}`, 'aria-label': `Update by ${who?.name}` });
  const text = h('div', { class: 'utext' }); text.innerHTML = formatBody(u.body);
  const liked = u.likes.includes(me);
  const likeBtn = h('button', { type: 'button', class: `btn btn-ghost btn-sm ${liked ? 'on' : ''}`, 'aria-pressed': liked, onclick: () => data.toggleLike(u.id) }, icon('like', 'sm'), u.likes.length ? h('span', { title: u.likes.map((id) => data.user(id)?.name).join(', ') }, u.likes.length) : 'Like');
  let replyBox = null;
  const replyBtn = isReply ? null : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { if (replyBox) { replyBox.querySelector('textarea')?.focus(); return; } replyBox = composeBox({ placeholder: 'Reply', compact: true, onPost: (body) => data.createUpdate(it.id, body, u.id) }); repliesEl.append(replyBox); replyBox.querySelector('textarea').focus(); } }, icon('reply', 'sm'), 'Reply');
  const seen = u.seen_by.filter((id) => id !== u.creator_id).map((id) => data.user(id)?.name).filter(Boolean);
  const moreBtn = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Update menu', onclick: () => openMenu(moreBtn, [
    !isReply ? { label: u.pinned ? 'Unpin' : 'Pin to top', icon: 'pin', onSelect: () => data.pinUpdate(u.id, !u.pinned) } : null,
    { label: 'Edit', icon: 'edit', disabled: u.creator_id !== me, onSelect: () => { const box = composeBox({ value: u.body, placeholder: '', submitLabel: 'Save', onPost: (body) => data.editUpdate(u.id, body) }); text.replaceWith(box); box.querySelector('textarea').focus(); } },
    { label: 'Delete', icon: 'trash', danger: true, disabled: u.creator_id !== me && !data.isOwner(data.board(it.board_id)), onSelect: async () => { if (await confirmDialog({ title: 'Delete this update?', message: 'Deleted updates cannot be recovered.', confirmLabel: 'Delete', danger: true })) data.deleteUpdate(u.id); } },
  ], { align: 'end' }) }, icon('dots', 'sm'));
  const repliesEl = h('div', { class: 'replies' });
  replies.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((r) => repliesEl.append(renderUpdate(r, [], it, ctx, true)));
  el.append(avatar(who, isReply ? 'sm' : 'md'), h('div', { class: 'ubody' },
    h('div', { class: 'uhead' }, h('span', { class: 'who' }, who?.name || 'Someone'), h('span', { class: 'when', title: fmtDateTime(u.created_at) }, relTime(u.created_at)), u.edited_at ? h('span', { class: 'when' }, '(edited)') : null, u.pinned ? h('span', { class: 'when', style: { display: 'inline-flex', alignItems: 'center', gap: '2px' } }, icon('pin', 'sm'), 'Pinned') : null, h('span', { class: 'spacer' }), moreBtn),
    text,
    u.attachments?.length ? h('div', { class: 'attachments' }, u.attachments.map((a) => (a.url ? h('a', { class: 'file-chip', href: a.url, target: '_blank', rel: 'noopener', title: a.name }, icon(/\.(png|jpe?g|gif|webp)$/i.test(a.name) ? 'image' : 'file', 'sm'), a.name) : h('span', { class: 'file-chip' }, icon('file', 'sm'), a.name)))) : null,
    h('div', { class: 'uactions' }, likeBtn, replyBtn, seen.length ? h('span', { title: `Seen by ${seen.join(', ')}`, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, icon('eye', 'sm'), seen.length) : null),
    isReply ? null : repliesEl));
  return el;
}
export function composeBox({ placeholder, onPost, value = '', compact = false, submitLabel = 'Update' }) {
  const ta = h('textarea', { placeholder, 'aria-label': placeholder || 'Update', rows: compact ? 1 : 2 }, value);
  const box = h('div', { class: 'compose' });
  const post = h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: !value.trim(), onclick: () => { const v = ta.value.trim(); if (!v) return; if (v.length > 46000) { toast('Updates are limited to 46,000 characters', { kind: 'danger' }); return; } onPost(v); ta.value = ''; post.disabled = true; } }, submitLabel);
  const wrapSel = (pre, suf = pre) => { const s = ta.selectionStart, e = ta.selectionEnd; const sel = ta.value.slice(s, e) || 'text'; ta.setRangeText(`${pre}${sel}${suf}`, s, e, 'select'); ta.focus(); post.disabled = !ta.value.trim(); };
  let menu = null;
  const closeMention = () => { menu?.remove(); menu = null; };
  const showMention = () => {
    const pos = ta.selectionStart; const before = ta.value.slice(0, pos); const m = before.match(/@([\w ]*)$/);
    if (!m) { closeMention(); return; }
    const q = m[1].toLowerCase();
    const opts = [...data.users().map((u) => ({ name: u.name, sub: u.title })), ...data.teams().map((t) => ({ name: t.name, sub: 'team' }))].filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8);
    if (!opts.length) { closeMention(); return; }
    if (!menu) { menu = h('div', { class: 'mention-menu', role: 'listbox' }); box.style.position = 'relative'; box.append(menu); }
    menu.style.top = `${ta.offsetTop + ta.offsetHeight}px`; menu.style.left = '8px';
    menu.replaceChildren(...opts.map((o, i) => h('button', { type: 'button', class: `menu-item ${i === 0 ? 'active' : ''}`, role: 'option', onmousedown: (e) => { e.preventDefault(); pick(o); } }, h('span', { class: 'label' }, o.name), h('span', { class: 'kbd' }, o.sub))));
    function pick(o) { const start = pos - m[0].length; ta.setRangeText(`@[${o.name}] `, start, pos, 'end'); closeMention(); ta.focus(); post.disabled = !ta.value.trim(); }
    menu.pick = () => pick(opts[0]);
  };
  ta.addEventListener('input', () => { post.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`; showMention(); });
  ta.addEventListener('keydown', (e) => { if (menu && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); menu.pick(); return; } if (menu && e.key === 'Escape') { e.stopPropagation(); closeMention(); return; } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); post.click(); } });
  ta.addEventListener('blur', () => setTimeout(closeMention, 150));
  box.append(ta, h('div', { class: 'ctools' },
    h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Bold', title: 'Bold (**text**)', onclick: () => wrapSel('**') }, icon('bold', 'sm')),
    h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Italic', title: 'Italic (_text_)', onclick: () => wrapSel('_') }, icon('italic', 'sm')),
    h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Bulleted list', onclick: () => { const s = ta.selectionStart; const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1; ta.setRangeText('- ', lineStart, lineStart, 'end'); ta.focus(); } }, icon('list', 'sm')),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Mention someone', onclick: () => { const s = ta.selectionStart; ta.setRangeText('@', s, s, 'end'); ta.focus(); showMention(); } }, icon('at', 'sm'), 'Mention'),
    h('span', { class: 'spacer' }), h('span', { class: 'muted', style: { fontSize: 'var(--text-xs)' } }, 'Ctrl+Enter'), post));
  return box;
}
