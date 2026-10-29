// S09 Notifications bell popover: mentions, assignments, replies.
import { h, icon, avatar, openPopover, relTime } from '../lib/ui.js';
import * as data from '../lib/data.js';
import { navigate } from '../app.js';

export function openNotifications(anchor) {
  openPopover(anchor, ({ close, rerender }) => {
    const list = data.notifications();
    const wrap = h('div', { style: { minWidth: '340px', maxWidth: '420px' } }, h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, h('h4', { style: { margin: 0 } }, 'Notifications'), list.some((n) => !n.read_at) ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { data.markAllRead(); rerender(); } }, 'Mark all read') : null));
    if (!list.length) wrap.append(h('div', { class: 'empty' }, h('h3', {}, 'All quiet'), h('p', {}, 'Mentions, replies and assignments land here.')));
    for (const n of list.slice(0, 30)) {
      const it = data.item(n.item_id); const actor = data.user(n.actor_id);
      const what = n.kind === 'mention' ? 'mentioned you on' : n.kind === 'reply' ? 'replied to you on' : 'assigned you to';
      wrap.append(h('button', { type: 'button', class: `notif ${n.read_at ? '' : 'unread'}`, onclick: () => { data.markRead(n.id); close(); if (it) navigate(`#/b/${it.board_id}?item=${it.id}&tab=${n.kind === 'assigned' ? 'activity' : 'updates'}`); } },
        avatar(actor, 'sm'), h('div', {}, h('div', { class: 't' }, h('b', {}, actor?.name || 'Someone'), ` ${what} `, h('b', {}, it?.name || 'an item that was deleted')), h('div', { class: 'when' }, relTime(n.created_at)))));
    }
    return wrap;
  }, { align: 'end' });
}
