// DOM helpers and primitives: h(), icons, popover, menu, dialog, toast, avatar, dates.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'indeterminate') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Own simple stroke icons on a 24-box. Not the original's icon set.
const PATHS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  work: 'M4 5h16v14H4z M8 3v4 M16 3v4 M4 9h16 M8 13l2 2 4-4',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  chevD: 'M6 9l6 6 6-6', chevR: 'M9 6l6 6-6 6', chevL: 'M15 6l-6 6 6 6', chevU: 'M6 15l6-6 6 6',
  plus: 'M12 5v14 M5 12h14',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M20 20l-4-4',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  sort: 'M7 4v16 M3 8l4-4 4 4 M17 20V4 M13 16l4 4 4-4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
  close: 'M6 6l12 12 M18 6L6 18',
  bubble: 'M4 5h16v11H9l-5 4z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 21h4',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7 M12 17h.01',
  pin: 'M9 3h6l-1 6 3 3H7l3-3z M12 12v9',
  grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
  calendar: 'M4 5h16v15H4z M8 3v4 M16 3v4 M4 10h16',
  kanban: 'M4 4h4v16H4z M10 4h4v10h-4z M16 4h4v7h-4z',
  table: 'M3 5h18v14H3z M3 10h18 M3 15h18 M9 5v14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  archive: 'M3 4h18v4H3z M5 8v12h14V8 M10 12h4',
  copy: 'M8 8h12v12H8z M16 8V4H4v12h4',
  edit: 'M4 20l4-1 11-11-3-3L5 16z M13 6l3 3',
  check: 'M5 12l4 4L19 6',
  arrowU: 'M12 19V5 M6 11l6-6 6 6', arrowD: 'M12 5v14 M6 13l6 6 6-6',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  folder: 'M3 6h6l2 2h10v12H3z',
  board: 'M3 5h18v14H3z M3 10h18 M8 10v9',
  workspace: 'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
  like: 'M7 11v10H3V11z M7 11l4-8a2 2 0 0 1 2 2v5h6a2 2 0 0 1 2 2l-1 8a2 2 0 0 1-2 2H7',
  reply: 'M10 7L4 12l6 5v-3c5 0 8 1 10 5 0-6-4-10-10-10z',
  collapse: 'M4 4h16v16H4z M9 4v16 M14 9l-2 3 2 3',
  at: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5',
  bold: 'M7 4h7a3.5 3.5 0 0 1 0 7H7z M7 11h8a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M14 4h6 M4 20h6 M15 4L9 20',
  list: 'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  inbox: 'M3 13l3-8h12l3 8v6H3z M3 13h5l2 3h4l2-3h5',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  hash: 'M10 3L8 21 M16 3l-2 18 M4 9h17 M3 15h17',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  text: 'M4 6h16 M12 6v14 M8 20h8',
  number: 'M5 9h14 M5 15h14 M10 3L8 21 M16 3l-2 18',
  checkbox: 'M4 4h16v16H4z M8 12l3 3 5-6',
  rating: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  timeline: 'M3 8h10v3H3z M9 13h12v3H9z',
  mail: 'M3 5h18v14H3z M3 7l9 6 9-6',
  phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z',
  dropdown: 'M4 5h16v6H4z M8 8h5 M4 14h16v5H4z M17 16l1 1 1-1',
  status: 'M3 8h18v8H3z',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20a6 6 0 0 1 12 0 M17 11a3 3 0 1 0 0-6 M21 20a6 6 0 0 0-4-5.6',
  longtext: 'M4 6h16 M4 10h16 M4 14h16 M4 18h10',
  log: 'M12 3a9 9 0 1 0 9 9 M12 7v5l3 2 M21 3v5h-5',
  id: 'M4 6h16v12H4z M8 10v4 M12 10h3a2 2 0 0 1 0 4h-3z',
  moveTo: 'M5 12h14 M13 6l6 6-6 6',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
};
export function icon(name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', PATHS[name] || PATHS.dots);
  svg.append(p);
  return svg;
}

export function initials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('');
}
export function avatar(user, size = 'md', opts = {}) {
  const el = h('span', { class: `avatar ${size}`, title: opts.title ?? user?.name ?? '', style: { background: `var(--color-label-${user?.color || 'grey'})` } }, user ? initials(user.name) : '?');
  if (user?.name) el.setAttribute('aria-label', user.name);
  return el;
}
export function avatarGroup(users, max = 3, size = 'sm') {
  const g = h('span', { class: 'avatar-group' });
  users.slice(0, max).forEach((u) => g.append(avatar(u, size)));
  if (users.length > max) g.append(h('span', { class: 'more' }, `+${users.length - max}`));
  return g;
}

/* ---------- dates ---------- */
export const pad = (n) => String(n).padStart(2, '0');
export function ymd(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseYmd(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtDate(s, opts = {}) {
  const d = parseYmd(s); if (!d) return '';
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${thisYear && !opts.year ? '' : ' ' + d.getFullYear()}`;
}
export function relTime(iso) {
  const t = new Date(iso).getTime(); const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const hh = Math.round(m / 60); if (hh < 24) return `${hh}h ago`;
  const dd = Math.round(hh / 24); if (dd < 7) return `${dd}d ago`;
  return fmtDate(ymd(new Date(t)), { year: dd > 300 });
}
export function fmtDateTime(iso) { const d = new Date(iso); return `${fmtDate(ymd(d), { year: true })} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
// Monday-first week start for a YYYY-MM-DD
export function startOfWeek(s) { const d = parseYmd(s); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return ymd(d); }

/* ---------- layers: popover / menu / dialog / toast ---------- */
const layers = () => document.getElementById('layers');
const stack = [];
export function closeTopLayer() { const top = stack[stack.length - 1]; if (top) { top.close(); return true; } return false; }
export function closeAllLayers() { while (stack.length) stack[stack.length - 1].close(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) { e.preventDefault(); closeTopLayer(); } });
document.addEventListener('pointerdown', (e) => {
  for (let i = stack.length - 1; i >= 0; i--) {
    const l = stack[i];
    if (l.kind === 'popover' && !l.el.contains(e.target) && !(l.anchor && l.anchor.contains(e.target))) l.close(); else break;
  }
}, true);
window.addEventListener('hashchange', () => closeAllLayers());

export function openPopover(anchor, build, opts = {}) {
  const el = h('div', { class: `popover ${opts.class || ''}`, role: opts.role || 'dialog' });
  const layer = { kind: 'popover', el, anchor, close };
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    el.remove(); const i = stack.indexOf(layer); if (i >= 0) stack.splice(i, 1);
    opts.onClose?.();
    if (opts.restoreFocus !== false && anchor && document.contains(anchor) && anchor.focus) anchor.focus({ preventScroll: true });
  }
  const content = build({ close, rerender: () => { el.replaceChildren(); append(el, [build({ close, rerender: () => {} })]); position(); } });
  append(el, [content]);
  layers().append(el); stack.push(layer);
  function position() {
    const r = anchor?.getBoundingClientRect?.() || { left: window.innerWidth / 2, right: window.innerWidth / 2, top: window.innerHeight / 3, bottom: window.innerHeight / 3, width: 0 };
    const pw = el.offsetWidth, ph = el.offsetHeight;
    let left = opts.align === 'end' ? r.right - pw : opts.align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
    let top = r.bottom + 4;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 4);
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    el.style.left = `${left}px`; el.style.top = `${top}px`;
  }
  position();
  const f = el.querySelector('input,textarea,select,button,[tabindex]');
  if (opts.autofocus !== false) f?.focus();
  return { close, el, position };
}

// items: {label, icon, onSelect, danger, disabled, divider, kbd, submenu}
export function openMenu(anchor, items, opts = {}) {
  return openPopover(anchor, ({ close }) => {
    const m = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) {
      if (!it) continue;
      if (it.divider) { m.append(h('div', { class: 'menu-divider' })); continue; }
      const btn = h('button', {
        type: 'button', class: `menu-item ${it.danger ? 'danger' : ''}`, role: 'menuitem', disabled: !!it.disabled,
        onclick: (e) => { e.stopPropagation(); if (it.submenu) { openMenu(btn, it.submenu, { align: 'start', side: true }); return; } close(); it.onSelect?.(); },
      }, it.icon ? icon(it.icon) : h('span', { style: { width: '18px' } }), h('span', { class: 'label' }, it.label), it.kbd ? h('span', { class: 'kbd' }, it.kbd) : null, it.submenu ? icon('chevR', 'sm') : null);
      m.append(btn);
    }
    m.addEventListener('keydown', (e) => {
      const all = [...m.querySelectorAll('.menu-item:not(:disabled)')]; const i = all.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); all[(i + 1) % all.length]?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus(); }
    });
    return m;
  }, { role: 'menu', align: opts.align || 'start', class: 'menu-pop', onClose: opts.onClose });
}

export function openDialog({ title, body, actions = [], wide = false, onClose }) {
  const backdrop = h('div', { class: 'dialog-backdrop' });
  const dlg = h('div', { class: `dialog ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-title' });
  const layer = { kind: 'dialog', el: backdrop, close };
  const prev = document.activeElement;
  let closed = false;
  function close() { if (closed) return; closed = true; backdrop.remove(); const i = stack.indexOf(layer); if (i >= 0) stack.splice(i, 1); onClose?.(); prev?.focus?.({ preventScroll: true }); }
  dlg.append(h('h2', { id: 'dlg-title' }, title));
  append(dlg, [typeof body === 'function' ? body({ close }) : body]);
  if (actions.length) dlg.append(h('div', { class: 'actions' }, actions.map((a) => h('button', { type: 'button', class: `btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-primary' : 'btn-secondary'}`, style: a.danger ? { background: 'var(--color-danger)' } : null, onclick: () => { const r = a.onClick?.({ close }); if (r !== false && a.closes !== false) close(); } }, a.label))));
  backdrop.append(dlg);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  dlg.addEventListener('keydown', (e) => { // focus trap
    if (e.key !== 'Tab') return;
    const f = [...dlg.querySelectorAll('input,textarea,select,button,[href],[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  layers().append(backdrop); stack.push(layer);
  (dlg.querySelector('input,textarea,select') || dlg.querySelector('button'))?.focus();
  return { close, el: dlg };
}
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    openDialog({ title, body: h('p', {}, message), onClose: () => resolve(false), actions: [
      { label: 'Cancel' },
      { label: confirmLabel, primary: !danger, danger, onClick: () => { resolve(true); } },
    ] });
  });
}
export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = 'Save' }) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', value, placeholder, 'aria-label': label });
    const err = h('div', { class: 'err', hidden: true }, 'Give it a name.');
    const submit = ({ close }) => { const v = input.value.trim(); if (!v) { err.hidden = false; input.classList.add('error'); input.focus(); return false; } resolve(v); close(); };
    const dlg = openDialog({ title, body: ({ close }) => h('form', { onsubmit: (e) => { e.preventDefault(); submit({ close }); } }, h('div', { class: 'field' }, h('label', {}, label), input, err)), onClose: () => resolve(null), actions: [{ label: 'Cancel' }, { label: confirmLabel, primary: true, closes: false, onClick: submit }] });
    input.focus(); input.select();
    return dlg;
  });
}

let toastHost;
export function toast(msg, { kind = 'info', undo, ms = 8000 } = {}) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts' }); layers().append(toastHost); }
  const t = h('div', { class: `toast ${kind}`, role: kind === 'danger' ? 'alert' : 'status' }, h('span', {}, msg));
  if (undo) t.append(h('button', { type: 'button', onclick: () => { undo(); t.remove(); } }, 'Undo'));
  toastHost.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

// Inline editing of a text node: contenteditable with Enter/Esc handling.
export function editInline(el, { onSave, multiline = false, select = true }) {
  const before = el.textContent;
  el.setAttribute('contenteditable', 'true');
  el.focus();
  if (select) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  let done = false;
  const finish = (save) => {
    if (done) return; done = true;
    el.removeAttribute('contenteditable');
    const v = el.textContent.trim();
    if (!save || v === before.trim()) { el.textContent = before; return; }
    if (!v) { el.textContent = before; return; }
    onSave(v);
  };
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (!multiline || !e.shiftKey)) { e.preventDefault(); finish(true); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); el.blur(); }
  });
  el.addEventListener('blur', () => finish(true), { once: true });
}

export const LABEL_COLORS = ['green', 'lime', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose', 'red', 'orange', 'yellow', 'brown', 'grey', 'slate', 'dark'];
export const colorVar = (c) => `var(--color-label-${LABEL_COLORS.includes(c) ? c : 'grey'})`;
export function uid(p = 'id') { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
