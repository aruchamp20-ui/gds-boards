// Column type registry. Every view renders, edits, sorts, filters, searches and summarises cells through this file.
// ctx: { users, teams, me, setValue(item, col, value), openLabelEditor(col, anchor), openItem(item) }
import { h, icon, avatar, avatarGroup, fmtDate, ymd, parseYmd, addDays, relTime, fmtDateTime, colorVar, LABEL_COLORS, openPopover, uid, MONTH_NAMES, pad } from './ui.js';

const txt = (v) => (v == null ? '' : String(v));
const userName = (ctx, id) => ctx.users.find((u) => u.id === id)?.name || '';
const cmpStr = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
const emptyLast = (a, b, f) => { const ea = a == null || a === '', eb = b == null || b === ''; if (ea && eb) return 0; if (ea) return 1; if (eb) return -1; return f(a, b); };

/* ---------- shared editors ---------- */
function textEditor(cell, item, col, ctx, { type = 'text', get, set, validate }) {
  const input = h('input', { type, value: get(), 'aria-label': col.title });
  cell.classList.add('editing'); cell.replaceChildren(input); input.focus(); input.select();
  let done = false;
  const finish = (save) => { if (done) return; done = true; const v = input.value; if (save && (!validate || validate(v))) set(v); ctx.rerender?.(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } if (e.key === 'Tab') { finish(true); } });
  input.addEventListener('blur', () => finish(true));
}

export function datePicker(anchor, { value, onPick, withTime = false, time = null }) {
  let view = value ? parseYmd(value) : new Date();
  let t = time;
  return openPopover(anchor, ({ close, rerender }) => {
    const wrap = h('div', { class: 'datepicker' });
    const head = h('div', { class: 'dp-head' },
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Previous month', onclick: () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw(); } }, icon('chevL')),
      h('span', {}, `${MONTH_NAMES[view.getMonth()]} ${view.getFullYear()}`),
      h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Next month', onclick: () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw(); } }, icon('chevR')));
    const grid = h('div', { class: 'dp-grid' });
    const input = h('input', { class: 'input', type: 'date', value: value || '', 'aria-label': 'Type a date', onchange: () => { if (input.value) onPick(input.value, t), close(); } });
    const timeInput = h('input', { class: 'input', type: 'time', value: t || '', 'aria-label': 'Time', style: { width: '120px' }, onchange: () => { t = timeInput.value || null; if (value) onPick(value, t); } });
    function draw() {
      head.children[1].textContent = `${MONTH_NAMES[view.getMonth()]} ${view.getFullYear()}`;
      grid.replaceChildren();
      ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach((d) => grid.append(h('div', { class: 'dow' }, d)));
      const first = new Date(view.getFullYear(), view.getMonth(), 1); const offset = (first.getDay() + 6) % 7;
      const start = new Date(first); start.setDate(1 - offset);
      const today = ymd();
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i); const s = ymd(d);
        grid.append(h('button', { type: 'button', class: `${d.getMonth() !== view.getMonth() ? 'other' : ''} ${s === today ? 'today' : ''} ${s === value ? 'on' : ''}`, onclick: () => { onPick(s, t); close(); } }, d.getDate()));
      }
    }
    draw();
    wrap.append(head, grid, h('div', { class: 'popover-footer' },
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, input, withTime ? timeInput : null),
      h('div', { style: { display: 'flex', gap: '4px' } },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { onPick(ymd(), t); close(); } }, 'Today'),
        value ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { onPick(null, null); close(); } }, 'Clear') : null)));
    return wrap;
  }, { autofocus: false });
}

function peoplePicker(anchor, ctx, col, value, onChange) {
  const limit = col.settings?.limit || 0;
  let q = '';
  return openPopover(anchor, ({ rerender }) => {
    const sel = new Set(value?.user_ids || []);
    const wrap = h('div', { class: 'people-picker', style: { minWidth: '260px' } });
    const input = h('input', { class: 'input', placeholder: 'Search people', value: q, 'aria-label': 'Search people', oninput: () => { q = input.value; list(); } });
    const chosen = h('div', { class: 'chips', style: { flexWrap: 'wrap', margin: '8px 0' } });
    const results = h('div');
    function list() {
      chosen.replaceChildren(...[...sel].map((id) => { const u = ctx.users.find((x) => x.id === id); return u ? h('span', { class: 'chip soft' }, avatar(u, 'sm'), ' ', u.name, h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Remove ${u.name}`, onclick: () => { sel.delete(id); commit(); } }, icon('close', 'sm'))) : null; }));
      const m = ctx.users.filter((u) => !sel.has(u.id) && u.name.toLowerCase().includes(q.toLowerCase()));
      results.replaceChildren(...(m.length ? m.map((u) => h('button', { type: 'button', class: 'person', disabled: limit && sel.size >= limit, onclick: () => { sel.add(u.id); commit(); } }, avatar(u, 'sm'), h('span', {}, h('div', {}, u.name), h('div', { class: 'sub' }, u.title || u.email)))) : [h('div', { class: 'muted', style: { padding: '8px' } }, 'No one matches.')]));
      if (limit && sel.size >= limit) results.prepend(h('div', { class: 'muted', style: { padding: '4px 8px', fontSize: 'var(--text-xs)' } }, `This column allows ${limit} ${limit === 1 ? 'person' : 'people'}.`));
    }
    function commit() { onChange({ user_ids: [...sel] }); list(); }
    list();
    wrap.append(input, chosen, results);
    return wrap;
  });
}

function labelPicker(anchor, ctx, col, onPick) {
  return openPopover(anchor, ({ close }) => {
    const labels = (col.settings.labels || []).filter((l) => !l.deactivated);
    const grid = h('div', { class: 'label-grid', role: 'listbox' }, labels.map((l) => h('button', { type: 'button', role: 'option', style: { background: colorVar(l.color) }, title: l.text || 'Blank', onclick: () => { onPick(l.id); close(); } }, l.text || ' ')));
    return h('div', {}, grid, h('div', { class: 'popover-footer' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { onPick(null); close(); } }, 'Clear'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { close(); ctx.openLabelEditor(col, anchor); } }, icon('edit', 'sm'), 'Edit labels')));
  });
}

function optionsPicker(anchor, ctx, col, value, onChange) {
  let q = '';
  return openPopover(anchor, () => {
    const sel = new Set(value?.ids || []);
    const wrap = h('div', { style: { minWidth: '240px' } });
    const input = h('input', { class: 'input', placeholder: 'Search or create', value: q, 'aria-label': 'Search options', oninput: () => { q = input.value; list(); }, onkeydown: (e) => { if (e.key === 'Enter' && q.trim()) { e.preventDefault(); const t = q.trim(); const existing = col.settings.options.find((o) => o.text.toLowerCase() === t.toLowerCase()); const o = existing || { id: uid('opt'), text: t, color: LABEL_COLORS[col.settings.options.length % LABEL_COLORS.length] }; if (!existing) ctx.updateColumn(col, { settings: { ...col.settings, options: [...col.settings.options, o] } }); sel.add(o.id); q = ''; input.value = ''; commit(); } } });
    const results = h('div', { class: 'check-list', style: { marginTop: '8px' } });
    function list() {
      results.replaceChildren(...col.settings.options.filter((o) => o.text.toLowerCase().includes(q.toLowerCase())).map((o) => h('label', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: sel.has(o.id), onchange: (e) => { e.target.checked ? sel.add(o.id) : sel.delete(o.id); commit(); } }), h('span', { class: 'chip', style: { background: colorVar(o.color) } }, o.text))));
      if (q.trim() && !col.settings.options.some((o) => o.text.toLowerCase() === q.trim().toLowerCase())) results.append(h('div', { class: 'muted', style: { padding: '6px 4px', fontSize: 'var(--text-sm)' } }, `Press Enter to create "${q.trim()}"`));
    }
    function commit() { onChange({ ids: [...sel] }); list(); }
    list();
    wrap.append(input, results);
    return wrap;
  });
}

const dateOps = [
  { id: 'is', label: 'is', arg: 'date' }, { id: 'is_not', label: 'is not', arg: 'date' }, { id: 'before', label: 'is before', arg: 'date' }, { id: 'after', label: 'is after', arg: 'date' },
  { id: 'today', label: 'is today' }, { id: 'this_week', label: 'is this week' }, { id: 'past', label: 'is in the past' }, { id: 'future', label: 'is upcoming' }, { id: 'empty', label: 'is empty' }, { id: 'not_empty', label: 'is not empty' },
];
function testDate(d, op, arg) {
  const today = ymd();
  switch (op) {
    case 'is': return d === arg; case 'is_not': return d !== arg; case 'before': return !!d && d < arg; case 'after': return !!d && d > arg;
    case 'today': return d === today; case 'this_week': { if (!d) return false; const s = addDays(today, -((parseYmd(today).getDay() + 6) % 7)); return d >= s && d < addDays(s, 7); }
    case 'past': return !!d && d < today; case 'future': return !!d && d > today; case 'empty': return !d; case 'not_empty': return !!d; default: return true;
  }
}
const textOps = [{ id: 'contains', label: 'contains', arg: 'text' }, { id: 'not_contains', label: "doesn't contain", arg: 'text' }, { id: 'is', label: 'is', arg: 'text' }, { id: 'empty', label: 'is empty' }, { id: 'not_empty', label: 'is not empty' }];
function testText(s, op, arg) { s = (s || '').toLowerCase(); arg = (arg || '').toLowerCase(); switch (op) { case 'contains': return s.includes(arg); case 'not_contains': return !s.includes(arg); case 'is': return s === arg; case 'empty': return !s; case 'not_empty': return !!s; default: return true; } }

/* ---------- registry ---------- */
export const TYPES = {
  name: {
    label: 'Item', icon: 'text', fixed: true, defaultWidth: 320,
    text: (v, col, ctx, item) => item.name,
    compare: (a, b, col, ctx, ia, ib) => cmpStr(ia.name, ib.name),
    operators: textOps, test: (v, op, arg, col, ctx, item) => testText(item.name, op, arg),
  },
  status: {
    label: 'Status', icon: 'status', hint: 'Coloured labels', defaultWidth: 140,
    defaultSettings: () => ({ labels: [
      { id: uid('lbl'), text: 'Working on it', color: 'orange' }, { id: uid('lbl'), text: 'Done', color: 'green', done: true }, { id: uid('lbl'), text: 'Stuck', color: 'red' }, { id: uid('lbl'), text: '', color: 'grey' },
    ] }),
    isEmpty: (v) => !v?.label,
    render: (v, col) => { const l = (col.settings.labels || []).find((x) => x.id === v?.label); return h('div', { class: 'status-chip', style: { background: colorVar(l?.color || 'grey') } }, l?.text || ''); },
    cellClass: 'cell-status',
    edit: (cell, item, col, ctx) => labelPicker(cell, ctx, col, (id) => ctx.setValue(item, col, id ? { label: id } : null)),
    text: (v, col) => (col.settings.labels || []).find((x) => x.id === v?.label)?.text || '',
    compare: (a, b, col) => { const L = col.settings.labels || []; const ia = L.findIndex((l) => l.id === a?.label), ib = L.findIndex((l) => l.id === b?.label); return emptyLast(a?.label, b?.label, () => ia - ib); },
    operators: [{ id: 'is', label: 'is', arg: 'label' }, { id: 'is_not', label: 'is not', arg: 'label' }, { id: 'done', label: 'is done' }, { id: 'not_done', label: 'is not done' }, { id: 'empty', label: 'is empty' }],
    test: (v, op, arg, col) => { const l = (col.settings.labels || []).find((x) => x.id === v?.label); switch (op) { case 'is': return v?.label === arg; case 'is_not': return v?.label !== arg; case 'done': return !!l?.done; case 'not_done': return !l?.done; case 'empty': return !v?.label; default: return true; } },
    argOptions: (col) => (col.settings.labels || []).map((l) => ({ value: l.id, label: l.text || 'Blank' })),
    quick: (items, col) => (col.settings.labels || []).filter((l) => l.text).map((l) => ({ key: l.id, label: l.text, color: l.color, count: items.filter((i) => i.values[col.id]?.label === l.id).length, rule: { column_id: col.id, op: 'is', arg: l.id } })),
    summary: (items, col) => { const L = col.settings.labels || []; const n = items.length || 1; const bar = h('div', { class: 'summary-bar', title: L.map((l) => `${l.text || 'Blank'}: ${items.filter((i) => (i.values[col.id]?.label || null) === (l.text ? l.id : i.values[col.id]?.label || null)).length}`).join(' · ') });
      const counts = new Map(); items.forEach((i) => { const id = i.values[col.id]?.label || '_'; counts.set(id, (counts.get(id) || 0) + 1); });
      for (const [id, c] of counts) { const l = L.find((x) => x.id === id); bar.append(h('span', { style: { width: `${(c / n) * 100}%`, background: colorVar(l?.color || 'grey') }, title: `${l?.text || 'Blank'} ${Math.round((c / n) * 100)}%` })); }
      return bar; },
    isDone: (v, col) => !!(col.settings.labels || []).find((x) => x.id === v?.label)?.done,
  },
  people: {
    label: 'People', icon: 'people', hint: 'Assign owners', defaultWidth: 130,
    defaultSettings: () => ({ limit: 0 }),
    isEmpty: (v) => !(v?.user_ids?.length),
    render: (v, col, ctx) => { const us = (v?.user_ids || []).map((id) => ctx.users.find((u) => u.id === id)).filter(Boolean); return us.length ? avatarGroup(us, 3, 'sm') : h('span', { class: 'ghost', 'aria-hidden': 'true' }, icon('plus', 'sm')); },
    cellClass: 'cell-people',
    edit: (cell, item, col, ctx) => peoplePicker(cell, ctx, col, item.values[col.id], (v) => ctx.setValue(item, col, v.user_ids.length ? v : null)),
    text: (v, col, ctx) => (v?.user_ids || []).map((id) => userName(ctx, id)).join(', '),
    compare: (a, b, col, ctx) => emptyLast(a?.user_ids?.[0], b?.user_ids?.[0], (x, y) => cmpStr(userName(ctx, x), userName(ctx, y))),
    operators: [{ id: 'has', label: 'is', arg: 'person' }, { id: 'not_has', label: 'is not', arg: 'person' }, { id: 'me', label: 'is me' }, { id: 'empty', label: 'is empty' }, { id: 'not_empty', label: 'is not empty' }],
    test: (v, op, arg, col, ctx) => { const ids = v?.user_ids || []; switch (op) { case 'has': return ids.includes(arg); case 'not_has': return !ids.includes(arg); case 'me': return ids.includes(ctx.me); case 'empty': return !ids.length; case 'not_empty': return !!ids.length; default: return true; } },
    argOptions: (col, ctx) => ctx.users.map((u) => ({ value: u.id, label: u.name })),
    quick: (items, col, ctx) => ctx.users.map((u) => ({ key: u.id, label: u.name, count: items.filter((i) => (i.values[col.id]?.user_ids || []).includes(u.id)).length, rule: { column_id: col.id, op: 'has', arg: u.id } })).filter((q) => q.count),
    summary: (items, col, ctx) => { const ids = new Set(); items.forEach((i) => (i.values[col.id]?.user_ids || []).forEach((x) => ids.add(x))); const us = [...ids].map((id) => ctx.users.find((u) => u.id === id)).filter(Boolean); return us.length ? avatarGroup(us, 4, 'sm') : null; },
  },
  date: {
    label: 'Date', icon: 'calendar', hint: 'A day, optional time', defaultWidth: 130,
    defaultSettings: () => ({ show_time: false }),
    isEmpty: (v) => !v?.date,
    render: (v, col, ctx, item) => { if (!v?.date) return h('span', { class: 'muted' }, ''); const overdue = v.date < ymd() && !ctx.itemIsDone?.(item); return h('span', { class: overdue ? 'overdue' : '' }, fmtDate(v.date), v.time ? ` ${v.time}` : ''); },
    cellClass: 'cell-date cell-center',
    edit: (cell, item, col, ctx) => datePicker(cell, { value: item.values[col.id]?.date, time: item.values[col.id]?.time, withTime: true, onPick: (d, t) => ctx.setValue(item, col, d ? { date: d, time: t || null } : null) }),
    text: (v) => (v?.date ? fmtDate(v.date, { year: true }) : ''),
    compare: (a, b) => emptyLast(a?.date, b?.date, (x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    operators: dateOps, test: (v, op, arg) => testDate(v?.date, op, arg),
    quick: (items, col) => [['today', 'Today'], ['this_week', 'This week'], ['past', 'Past'], ['future', 'Upcoming'], ['empty', 'No date']].map(([op, label]) => ({ key: op, label, count: items.filter((i) => testDate(i.values[col.id]?.date, op)).length, rule: { column_id: col.id, op } })).filter((q) => q.count),
    summary: (items, col) => { const ds = items.map((i) => i.values[col.id]?.date).filter(Boolean).sort(); return ds.length ? h('span', { class: 'summary-cell' }, `${fmtDate(ds[0])} – ${fmtDate(ds[ds.length - 1])}`) : null; },
    dateOf: (v) => v?.date || null,
  },
  text: {
    label: 'Text', icon: 'text', hint: 'Short text', defaultWidth: 160,
    isEmpty: (v) => !v?.text,
    render: (v) => h('span', { class: 'truncate' }, txt(v?.text)),
    edit: (cell, item, col, ctx) => textEditor(cell, item, col, ctx, { get: () => item.values[col.id]?.text || '', set: (s) => ctx.setValue(item, col, s.trim() ? { text: s.trim() } : null) }),
    text: (v) => txt(v?.text), compare: (a, b) => emptyLast(a?.text, b?.text, cmpStr), operators: textOps, test: (v, op, arg) => testText(v?.text, op, arg),
  },
  long_text: {
    label: 'Long text', icon: 'longtext', hint: 'Notes and paragraphs', defaultWidth: 220,
    isEmpty: (v) => !v?.text,
    render: (v) => h('span', { class: 'truncate', title: txt(v?.text) }, txt(v?.text)),
    edit: (cell, item, col, ctx) => openPopover(cell, ({ close }) => { const ta = h('textarea', { class: 'textarea', style: { width: '320px' }, 'aria-label': col.title }, item.values[col.id]?.text || ''); return h('div', {}, ta, h('div', { class: 'popover-footer' }, h('span'), h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => { ctx.setValue(item, col, ta.value.trim() ? { text: ta.value.trim() } : null); close(); } }, 'Save'))); }),
    text: (v) => txt(v?.text), compare: (a, b) => emptyLast(a?.text, b?.text, cmpStr), operators: textOps, test: (v, op, arg) => testText(v?.text, op, arg),
  },
  numbers: {
    label: 'Numbers', icon: 'number', hint: 'Sums in the summary', defaultWidth: 120,
    defaultSettings: () => ({ unit: '' }),
    isEmpty: (v) => v?.number == null,
    render: (v, col) => h('span', {}, v?.number == null ? '' : `${v.number.toLocaleString()}${col.settings.unit ? ' ' + col.settings.unit : ''}`),
    cellClass: 'cell-num',
    edit: (cell, item, col, ctx) => textEditor(cell, item, col, ctx, { get: () => (item.values[col.id]?.number ?? ''), validate: (s) => s.trim() === '' || !Number.isNaN(Number(s)), set: (s) => ctx.setValue(item, col, s.trim() === '' ? null : { number: Number(s) }) }),
    text: (v) => (v?.number == null ? '' : String(v.number)),
    compare: (a, b) => emptyLast(a?.number, b?.number, (x, y) => x - y),
    operators: [{ id: 'eq', label: '=', arg: 'number' }, { id: 'gt', label: '>', arg: 'number' }, { id: 'lt', label: '<', arg: 'number' }, { id: 'empty', label: 'is empty' }, { id: 'not_empty', label: 'is not empty' }],
    test: (v, op, arg) => { const n = v?.number; switch (op) { case 'eq': return n === Number(arg); case 'gt': return n != null && n > Number(arg); case 'lt': return n != null && n < Number(arg); case 'empty': return n == null; case 'not_empty': return n != null; default: return true; } },
    summary: (items, col) => { const ns = items.map((i) => i.values[col.id]?.number).filter((n) => n != null); return ns.length ? h('span', { class: 'summary-cell', style: { justifyContent: 'flex-end', width: '100%' } }, `${ns.reduce((a, b) => a + b, 0).toLocaleString()}${col.settings.unit ? ' ' + col.settings.unit : ''}`, h('span', {}, 'sum')) : null; },
  },
  dropdown: {
    label: 'Dropdown', icon: 'dropdown', hint: 'Pick one or many', defaultWidth: 160,
    defaultSettings: () => ({ options: [] }),
    isEmpty: (v) => !(v?.ids?.length),
    render: (v, col) => h('div', { class: 'chips' }, (v?.ids || []).map((id) => col.settings.options.find((o) => o.id === id)).filter(Boolean).map((o) => h('span', { class: 'chip', style: { background: colorVar(o.color) } }, o.text))),
    edit: (cell, item, col, ctx) => optionsPicker(cell, ctx, col, item.values[col.id], (v) => ctx.setValue(item, col, v.ids.length ? v : null)),
    text: (v, col) => (v?.ids || []).map((id) => col.settings.options.find((o) => o.id === id)?.text || '').join(', '),
    compare: (a, b, col) => emptyLast(a?.ids?.[0], b?.ids?.[0], (x, y) => cmpStr(col.settings.options.find((o) => o.id === x)?.text || '', col.settings.options.find((o) => o.id === y)?.text || '')),
    operators: [{ id: 'has', label: 'is', arg: 'option' }, { id: 'not_has', label: 'is not', arg: 'option' }, { id: 'empty', label: 'is empty' }, { id: 'not_empty', label: 'is not empty' }],
    test: (v, op, arg) => { const ids = v?.ids || []; switch (op) { case 'has': return ids.includes(arg); case 'not_has': return !ids.includes(arg); case 'empty': return !ids.length; case 'not_empty': return !!ids.length; default: return true; } },
    argOptions: (col) => col.settings.options.map((o) => ({ value: o.id, label: o.text })),
    quick: (items, col) => col.settings.options.map((o) => ({ key: o.id, label: o.text, color: o.color, count: items.filter((i) => (i.values[col.id]?.ids || []).includes(o.id)).length, rule: { column_id: col.id, op: 'has', arg: o.id } })).filter((q) => q.count),
  },
  checkbox: {
    label: 'Checkbox', icon: 'checkbox', hint: 'Yes or no', defaultWidth: 100,
    isEmpty: (v) => !v?.checked,
    render: (v, col, ctx, item) => h('input', { type: 'checkbox', class: 'checkbox', checked: !!v?.checked, 'aria-label': col.title, onclick: (e) => { e.stopPropagation(); ctx.setValue(item, col, e.target.checked ? { checked: true } : null); } }),
    cellClass: 'cell-center', noEditor: true,
    text: (v) => (v?.checked ? 'Yes' : ''), compare: (a, b) => (b?.checked ? 1 : 0) - (a?.checked ? 1 : 0),
    operators: [{ id: 'checked', label: 'is checked' }, { id: 'unchecked', label: 'is not checked' }],
    test: (v, op) => (op === 'checked' ? !!v?.checked : !v?.checked),
    quick: (items, col) => [{ key: 'checked', label: 'Checked', count: items.filter((i) => i.values[col.id]?.checked).length, rule: { column_id: col.id, op: 'checked' } }].filter((q) => q.count),
    summary: (items, col) => { const n = items.filter((i) => i.values[col.id]?.checked).length; return items.length ? h('span', { class: 'summary-cell', style: { justifyContent: 'center', width: '100%' } }, `${n}/${items.length}`) : null; },
  },
  timeline: {
    label: 'Timeline', icon: 'timeline', hint: 'A start and end', defaultWidth: 180,
    isEmpty: (v) => !v?.from,
    render: (v) => (v?.from ? h('div', { class: 'tl-bar', style: { background: 'var(--color-label-blue)' } }, `${fmtDate(v.from)} – ${fmtDate(v.to || v.from)}`) : h('span')),
    edit: (cell, item, col, ctx) => openPopover(cell, ({ close }) => { const v = item.values[col.id] || {}; const a = h('input', { class: 'input', type: 'date', value: v.from || '', 'aria-label': 'Start' }); const b = h('input', { class: 'input', type: 'date', value: v.to || '', 'aria-label': 'End' }); return h('div', {}, h('div', { class: 'field' }, h('label', {}, 'Start'), a), h('div', { class: 'field' }, h('label', {}, 'End'), b), h('div', { class: 'popover-footer' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { ctx.setValue(item, col, null); close(); } }, 'Clear'), h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => { if (!a.value) return; const to = b.value && b.value >= a.value ? b.value : a.value; ctx.setValue(item, col, { from: a.value, to }); close(); } }, 'Save'))); }),
    text: (v) => (v?.from ? `${v.from} – ${v.to}` : ''), compare: (a, b) => emptyLast(a?.from, b?.from, (x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    operators: dateOps, test: (v, op, arg) => testDate(v?.from, op, arg),
    dateOf: (v) => v?.from || null, dateEnd: (v) => v?.to || v?.from || null,
  },
  link: {
    label: 'Link', icon: 'link', hint: 'A URL with a label', defaultWidth: 160,
    isEmpty: (v) => !v?.url,
    render: (v) => (v?.url ? h('a', { href: v.url, target: '_blank', rel: 'noopener', class: 'truncate', onclick: (e) => e.stopPropagation() }, v.text || v.url) : h('span')),
    edit: (cell, item, col, ctx) => openPopover(cell, ({ close }) => { const v = item.values[col.id] || {}; const u = h('input', { class: 'input', type: 'url', placeholder: 'https://', value: v.url || '', 'aria-label': 'URL' }); const t = h('input', { class: 'input', placeholder: 'Text to show', value: v.text || '', 'aria-label': 'Text' }); return h('form', { onsubmit: (e) => { e.preventDefault(); if (!u.value.trim()) { ctx.setValue(item, col, null); close(); return; } let url = u.value.trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url; ctx.setValue(item, col, { url, text: t.value.trim() }); close(); } }, h('div', { class: 'field' }, h('label', {}, 'URL'), u), h('div', { class: 'field' }, h('label', {}, 'Text'), t), h('div', { class: 'popover-footer' }, h('span'), h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Save'))); }),
    text: (v) => txt(v?.text || v?.url), compare: (a, b) => emptyLast(a?.url, b?.url, cmpStr), operators: textOps, test: (v, op, arg) => testText(`${v?.text || ''} ${v?.url || ''}`, op, arg),
  },
  email: {
    label: 'Email', icon: 'mail', hint: 'An address', defaultWidth: 180,
    isEmpty: (v) => !v?.email,
    render: (v) => (v?.email ? h('a', { href: `mailto:${v.email}`, class: 'truncate', onclick: (e) => e.stopPropagation() }, v.email) : h('span')),
    edit: (cell, item, col, ctx) => textEditor(cell, item, col, ctx, { type: 'email', get: () => item.values[col.id]?.email || '', validate: (s) => !s.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()), set: (s) => ctx.setValue(item, col, s.trim() ? { email: s.trim() } : null) }),
    text: (v) => txt(v?.email), compare: (a, b) => emptyLast(a?.email, b?.email, cmpStr), operators: textOps, test: (v, op, arg) => testText(v?.email, op, arg),
  },
  phone: {
    label: 'Phone', icon: 'phone', hint: 'A number', defaultWidth: 140,
    isEmpty: (v) => !v?.phone,
    render: (v) => h('span', { class: 'truncate' }, txt(v?.phone)),
    edit: (cell, item, col, ctx) => textEditor(cell, item, col, ctx, { type: 'tel', get: () => item.values[col.id]?.phone || '', set: (s) => ctx.setValue(item, col, s.trim() ? { phone: s.trim() } : null) }),
    text: (v) => txt(v?.phone), compare: (a, b) => emptyLast(a?.phone, b?.phone, cmpStr), operators: textOps, test: (v, op, arg) => testText(v?.phone, op, arg),
  },
  rating: {
    label: 'Rating', icon: 'rating', hint: '1 to 5 stars', defaultWidth: 130,
    isEmpty: (v) => !v?.rating,
    render: (v, col, ctx, item) => h('span', { class: 'stars', role: 'img', 'aria-label': `${v?.rating || 0} of 5` }, [1, 2, 3, 4, 5].map((n) => h('button', { type: 'button', class: n <= (v?.rating || 0) ? '' : 'off', 'aria-label': `${n} star${n > 1 ? 's' : ''}`, onclick: (e) => { e.stopPropagation(); ctx.setValue(item, col, v?.rating === n ? null : { rating: n }); } }, icon('rating', 'sm')))),
    cellClass: 'cell-center', noEditor: true,
    text: (v) => (v?.rating ? String(v.rating) : ''), compare: (a, b) => emptyLast(a?.rating, b?.rating, (x, y) => x - y),
    operators: [{ id: 'eq', label: '=', arg: 'number' }, { id: 'gt', label: '>', arg: 'number' }, { id: 'empty', label: 'is empty' }],
    test: (v, op, arg) => { const n = v?.rating; switch (op) { case 'eq': return n === Number(arg); case 'gt': return n != null && n > Number(arg); case 'empty': return !n; default: return true; } },
  },
  creation_log: {
    label: 'Creation log', icon: 'log', hint: 'Who created it, when', defaultWidth: 170, readonly: true,
    render: (v, col, ctx, item) => { const u = ctx.users.find((x) => x.id === item.created_by); return h('span', { class: 'summary-cell', style: { color: 'var(--color-text)' } }, u ? avatar(u, 'sm') : null, fmtDateTime(item.created_at)); },
    text: (v, col, ctx, item) => `${userName(ctx, item.created_by)} ${fmtDateTime(item.created_at)}`, compare: (a, b, col, ctx, ia, ib) => ia.created_at.localeCompare(ib.created_at), operators: [], test: () => true,
  },
  last_updated: {
    label: 'Last updated', icon: 'clock', hint: 'When it last changed', defaultWidth: 140, readonly: true,
    render: (v, col, ctx, item) => h('span', { title: fmtDateTime(item.updated_at) }, relTime(item.updated_at)),
    text: (v, col, ctx, item) => fmtDateTime(item.updated_at), compare: (a, b, col, ctx, ia, ib) => ia.updated_at.localeCompare(ib.updated_at), operators: [], test: () => true,
  },
  item_id: {
    label: 'Item ID', icon: 'id', hint: 'A unique number', defaultWidth: 100, readonly: true,
    render: (v, col, ctx, item) => h('span', { class: 'muted' }, item.seq),
    cellClass: 'cell-center',
    text: (v, col, ctx, item) => String(item.seq), compare: (a, b, col, ctx, ia, ib) => ia.seq - ib.seq, operators: [{ id: 'eq', label: '=', arg: 'number' }], test: (v, op, arg, col, ctx, item) => item.seq === Number(arg),
  },
};
export const ADDABLE = ['status', 'people', 'date', 'text', 'long_text', 'numbers', 'dropdown', 'checkbox', 'timeline', 'link', 'email', 'phone', 'rating', 'creation_log', 'last_updated', 'item_id'];
export const typeOf = (col) => TYPES[col.type] || TYPES.text;
export const cellText = (item, col, ctx) => typeOf(col).text?.(item.values[col.id], col, ctx, item) ?? '';
export const dateOfItem = (item, col) => typeOf(col).dateOf?.(item.values[col.id]) ?? null;

// Renders a cell element for item × col (used by table, item card, My Work, kanban cards).
export function renderCell(item, col, ctx, { tag = 'div', extraClass = '' } = {}) {
  const T = typeOf(col);
  const editable = !T.readonly && !T.fixed;
  const cell = h(tag, { class: `cell ${T.cellClass || ''} ${editable ? 'editable' : ''} ${extraClass}`, tabindex: editable ? 0 : null, role: editable ? 'button' : null, 'aria-label': `${col.title}: ${cellText(item, col, ctx) || 'empty'}` });
  cell.append(T.render(item.values[col.id], col, ctx, item));
  if (editable && !T.noEditor) {
    const open = () => { if (cell.classList.contains('editing')) return; T.edit(cell, item, col, ctx); };
    cell.addEventListener('click', open);
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      if (e.key === 'Backspace' || e.key === 'Delete') { if (!T.isEmpty || !T.isEmpty(item.values[col.id])) { e.preventDefault(); ctx.setValue(item, col, null); } }
    });
  }
  return cell;
}
