// Pure mapping from monday.com API objects to the clone's data model. No DOM, so the importer, the verifier and tests can all import it.
export const PALETTE = { green: '#15803d', lime: '#4d7c0f', teal: '#0f766e', cyan: '#0e7490', sky: '#0369a1', blue: '#1d4ed8', indigo: '#4338ca', violet: '#6d28d9', purple: '#7e22ce', pink: '#be185d', rose: '#9f1239', red: '#b91c1c', orange: '#c2410c', yellow: '#a16207', brown: '#92400e', grey: '#6b7280', slate: '#475569', dark: '#1f2937' };
export const PALETTE_NAMES = Object.keys(PALETTE);
// monday colour var_names (normalised to hyphens) -> clone palette. Specific names before generic ones.
const NAME_HINTS = [['done-green', 'green'], ['grass-green', 'green'], ['bright-green', 'lime'], ['saladish', 'lime'], ['lime', 'lime'], ['green', 'green'], ['teal', 'teal'], ['aquamarine', 'cyan'], ['river', 'cyan'], ['chili-blue', 'sky'], ['light-blue', 'sky'], ['sky', 'sky'], ['bright-blue', 'blue'], ['dark-blue', 'indigo'], ['navy', 'indigo'], ['dark-indigo', 'indigo'], ['indigo', 'indigo'], ['blue', 'blue'], ['dark-purple', 'violet'], ['lavender', 'violet'], ['purple', 'purple'], ['berry', 'purple'], ['orchid', 'purple'], ['lilac', 'pink'], ['sofia-pink', 'pink'], ['lipstick', 'pink'], ['bubble', 'pink'], ['pink', 'pink'], ['dark-red', 'rose'], ['stuck-red', 'red'], ['red', 'red'], ['dark-orange', 'orange'], ['working-orange', 'orange'], ['peach', 'orange'], ['sunset', 'orange'], ['orange', 'orange'], ['egg-yolk', 'yellow'], ['lemon', 'yellow'], ['mustard', 'yellow'], ['yellow', 'yellow'], ['coffee', 'brown'], ['pecan', 'brown'], ['tan', 'brown'], ['brown', 'brown'], ['explosive', 'grey'], ['american-gray', 'grey'], ['steel', 'slate'], ['winter', 'slate'], ['grey', 'grey'], ['gray', 'grey'], ['blackish', 'dark'], ['black', 'dark'], ['dark', 'dark']];

const parseHex = (hex) => { const m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let s = m[1]; if (s.length === 3) s = s.split('').map((c) => c + c).join(''); const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function rgbToHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2; if (max === min) return [0, 0, l]; const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min); let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
const PALETTE_HUES = Object.entries(PALETTE).filter(([n]) => !['grey', 'slate', 'dark'].includes(n)).map(([n, hex]) => [n, rgbToHsl(parseHex(hex))[0]]);
export function paletteFor(hex, varName) {
  if (varName) { const v = String(varName).toLowerCase().replace(/_/g, '-'); for (const [k, c] of NAME_HINTS) if (v.includes(k)) return c; }
  const rgb = parseHex(hex); if (!rgb) return 'grey';
  const [h, s, l] = rgbToHsl(rgb);
  if (s < 0.15) return l < 0.3 ? 'dark' : l < 0.55 ? 'slate' : 'grey';
  let best = 'grey', bd = 1e9;
  for (const [name, h2] of PALETTE_HUES) { const d = Math.min(Math.abs(h - h2), 360 - Math.abs(h - h2)); if (d < bd) { bd = d; best = name; } }
  return best;
}
export const colorForId = (id) => PALETTE_NAMES[Math.abs(hash(String(id))) % PALETTE_NAMES.length];
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
export const parseJson = (s) => { if (s == null || s === '') return null; if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch { return null; } };
const pad = (n) => String(n).padStart(2, '0');
// monday stores date-column times in UTC; the clone stores the wall-clock date and time of the importing machine's zone (Europe/London here).
export function localDateTime(date, time) {
  if (!time) return { date, time: null };
  const d = new Date(`${date}T${time.length === 5 ? time + ':00' : time}Z`);
  if (Number.isNaN(d.getTime())) return { date, time: null };
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
export function parseNumber(text) { if (text == null) return null; const s = String(text).replace(/[^0-9.\-]/g, ''); if (s === '' || s === '-' || s === '.') return null; const n = Number(s); return Number.isFinite(n) ? n : null; }

/* ---------- users, teams, workspace, folders ---------- */
export const userId = (id) => `mu_${id}`;
export function mapUser(u) { return { id: userId(u.id), monday_id: String(u.id), name: u.name || `User ${u.id}`, email: u.email || '', title: u.title || '', color: colorForId(u.id), timezone: u.time_zone_identifier || 'Europe/London', is_admin: !!u.is_admin, is_guest: !!u.is_guest, deactivated: u.enabled === false, photo: u.photo_thumb_small || null }; }
export function placeholderUser(id) { return { id: userId(id), monday_id: String(id), name: `Former user ${id}`, email: '', title: '', color: 'grey', timezone: 'Europe/London', is_admin: false, deactivated: true }; }
export function mapTeam(t) { return { id: `mt_${t.id}`, monday_id: String(t.id), name: t.name, member_ids: (t.users || []).map((u) => userId(u.id)) }; }
export function mapWorkspace(w, now) { return { id: `mw_${w.id}`, monday_id: String(w.id), name: w.name, kind: w.kind === 'closed' ? 'closed' : 'open', description: w.description || '', is_default: false, state: 'active', created_at: now }; }
export function mapFolder(f, wsId, index, now) { return { id: `mf_${f.id}`, monday_id: String(f.id), workspace_id: `mw_${wsId}`, parent_folder_id: f.parent?.id ? `mf_${f.parent.id}` : null, name: f.name, color: paletteFor(null, f.color) || 'grey', position: index + 1, created_at: now }; }

/* ---------- board, groups, columns, views ---------- */
const DEFAULT_WIDTH = { name: 320, status: 140, people: 130, date: 130, text: 160, long_text: 220, numbers: 120, dropdown: 160, checkbox: 100, timeline: 180, link: 160, email: 180, phone: 140, rating: 130, creation_log: 170, last_updated: 140, item_id: 110 };
export const SKIP_TYPES = new Set(['button', 'subtasks', 'integration', 'doc', 'name_placeholder', 'unsupported']);
export const PEOPLE_TYPES = new Set(['people', 'person', 'team', 'multiple-person']);

export function mapBoard(b, { index, wsId, now, folderIds }) {
  const folder = b.board_folder_id && folderIds.has(String(b.board_folder_id)) ? `mf_${b.board_folder_id}` : null;
  const owners = (b.owners || []).map((u) => userId(u.id)); const subs = (b.subscribers || []).map((u) => userId(u.id));
  return { id: `mb_${b.id}`, monday_id: String(b.id), workspace_id: `mw_${wsId}`, folder_id: folder, name: b.name, description: (b.description || '').slice(0, 1000), kind: ['public', 'private', 'share'].includes(b.board_kind) ? b.board_kind : 'public', state: 'active', permissions: ['everyone', 'collaborators', 'assignee', 'owners'].includes(b.permissions) ? b.permissions : 'everyone', item_terminology: (b.item_terminology || 'item').toLowerCase(), position: index + 1, created_by: b.creator?.id ? userId(b.creator.id) : owners[0] || null, owner_ids: owners, subscriber_ids: [...new Set([...owners, ...subs])], deleted_at: null, created_at: b.updated_at || now, updated_at: b.updated_at || now, last_viewed: {}, source: { kind: 'monday', board_id: String(b.id), url: b.url || `https://gdsinternational.monday.com/boards/${b.id}`, imported_at: now, items_count: b.items_count ?? null } };
}
export function mapGroup(g, index, boardId, now) { return { id: `mg_${g.id}`, monday_id: g.id, board_id: `mb_${boardId}`, title: g.title || 'Group', color: paletteFor(g.color), position: Number.isFinite(parseFloat(g.position)) ? parseFloat(g.position) : index + 1, archived: !!(g.archived || g.deleted), created_at: now }; }

export function statusLabels(settings) {
  const s = settings || {}; const labels = s.labels || {}; const colors = s.labels_colors || {}; const done = new Set((s.done_colors || []).map(Number)); const pos = s.labels_positions_v2 || {};
  const idx = Object.keys(labels).map(Number).filter(Number.isFinite).sort((a, b) => (pos[a] ?? a) - (pos[b] ?? b));
  return idx.map((i) => ({ id: String(i), text: labels[i] || '', color: paletteFor(colors[i]?.color, colors[i]?.var_name), done: done.has(i) }));
}
export function mapColumn(mc, index, boardId, now) {
  if (mc.archived || SKIP_TYPES.has(mc.type)) return null;
  const s = parseJson(mc.settings_str) || {};
  const base = { id: `mc_${boardId}_${mc.id}`, monday_id: mc.id, monday_type: mc.type, board_id: `mb_${boardId}`, title: mc.title || mc.id, description: mc.description || '', width: mc.width || null, position: index, created_at: now };
  const t = (type, settings = {}, extra = {}) => ({ ...base, ...extra, type, settings, width: base.width || DEFAULT_WIDTH[type] || 140 });
  switch (mc.type) {
    case 'name': return t('name', {}, { position: -1 });
    case 'status': case 'color': return t('status', { labels: statusLabels(s) });
    case 'dropdown': return t('dropdown', { options: (s.labels || []).map((l, i) => ({ id: String(l.id), text: l.name ?? l.label ?? String(l.id), color: PALETTE_NAMES[i % PALETTE_NAMES.length] })) });
    case 'tags': return t('dropdown', { options: [] }, { tags: true });
    case 'people': case 'person': case 'team': case 'multiple-person': return t('people', { limit: 0 });
    case 'date': return t('date', { show_time: !!s.time });
    case 'timeline': case 'week': return t('timeline', {});
    case 'numbers': case 'numeric': return t('numbers', { unit: unitOf(s) });
    case 'auto_number': case 'autonumber': return t('numbers', { unit: '' });
    case 'vote': return t('numbers', { unit: 'votes' });
    case 'progress': return t('numbers', { unit: '%' });
    case 'checkbox': case 'boolean': return t('checkbox', {});
    case 'link': return t('link', {});
    case 'email': return t('email', {});
    case 'phone': return t('phone', {});
    case 'rating': return t('rating', {});
    case 'long_text': case 'long-text': return t('long_text', {});
    case 'text': return t('text', {});
    case 'creation_log': case 'pulse-log': return t('creation_log', {});
    case 'last_updated': case 'pulse-updated': return t('last_updated', {});
    case 'item_id': case 'pulse-id': return t('item_id', {});
    default: return t('text', {}, { description: base.description || `Imported from a monday "${mc.type}" column, shown as text` });
  }
}
function unitOf(s) { const u = s?.unit; if (!u) return ''; if (typeof u === 'string') return u; return u.custom_unit || u.symbol || ''; }

export function mapViews(views, cols, boardId, now) {
  const mk = (type, name, settings, pos) => ({ id: `mv_${boardId}_${pos}`, board_id: `mb_${boardId}`, name, type, settings, filter: { logic: 'and', rules: [] }, sort: [], hidden_column_ids: [], position: pos, pinned: false, created_at: now });
  const out = [mk('table', 'Main Table', {}, 0)];
  const statusCol = cols.find((c) => c.type === 'status'); const dateCol = cols.find((c) => c.type === 'date') || cols.find((c) => c.type === 'timeline');
  for (const v of views || []) {
    if (v.type === 'kanban' && statusCol) out.push(mk('kanban', v.name || 'Kanban', { status_column_id: statusCol.id, card_column_ids: cols.filter((c) => ['people', 'date', 'status'].includes(c.type) && c.id !== statusCol.id).slice(0, 3).map((c) => c.id) }, out.length));
    else if (v.type === 'calendar' && dateCol) out.push(mk('calendar', v.name || 'Calendar', { date_column_id: dateCol.id, color_column_id: statusCol?.id || null }, out.length));
  }
  return out;
}

/* ---------- items ---------- */
// ctx: { user(id) -> clone user id (creating placeholders), tagOption(col, name) -> option id }
export function mapValue(mc, col, cv, ctx) {
  const v = parseJson(cv.value); const text = cv.text ?? '';
  const asText = (s) => { const t = String(s ?? '').trim(); return t ? { text: t } : null; };
  switch (mc.type) {
    case 'status': case 'color': {
      if (v?.index != null) { const id = String(v.index); if (col.settings.labels.some((l) => l.id === id)) return { label: id }; }
      // the default label (usually index 5) comes back with value: null and only `text` set
      const byText = text ? col.settings.labels.find((l) => l.text.trim().toLowerCase() === String(text).trim().toLowerCase()) : null;
      return byText ? { label: byText.id } : null;
    }
    case 'dropdown': { const ids = (v?.ids || []).map(String).filter((id) => col.settings.options.some((o) => o.id === id)); return ids.length ? { ids } : null; }
    case 'tags': { const names = text ? String(text).split(',').map((s) => s.trim()).filter(Boolean) : []; return names.length ? { ids: names.map((n) => ctx.tagOption(col, n)) } : null; }
    case 'people': case 'person': case 'team': case 'multiple-person': {
      const pt = v?.personsAndTeams || []; const names = text ? String(text).split(',').map((s) => s.trim()) : [];
      const sameOrder = names.length === pt.length; // monday's text lists the same people in the same order, which names deactivated users the users query no longer returns
      const user_ids = pt.map((p, i) => (p.kind !== 'team' ? ctx.user(p.id, sameOrder ? names[i] : null) : null)).filter(Boolean); // kinds: person | team | agent
      const team_ids = pt.filter((p) => p.kind === 'team').map((p) => `mt_${p.id}`);
      return user_ids.length || team_ids.length ? { user_ids, ...(team_ids.length ? { team_ids } : {}) } : null;
    }
    case 'date': return v?.date ? localDateTime(v.date, v.time) : null;
    case 'timeline': return v?.from ? { from: v.from, to: v.to || v.from } : null;
    case 'week': { const w = v?.week; return w?.startDate ? { from: w.startDate, to: w.endDate || w.startDate } : null; }
    case 'numbers': case 'numeric': case 'auto_number': case 'autonumber': case 'progress': { const n = parseNumber(text); return n == null ? null : { number: n }; }
    case 'vote': { const n = (v?.voter_ids || v?.votersIds || []).length; return n ? { number: n } : null; }
    case 'checkbox': case 'boolean': return v?.checked === true || v?.checked === 'true' ? { checked: true } : null;
    case 'link': return v?.url ? { url: v.url, text: v.text && v.text !== v.url ? v.text : '' } : null;
    case 'email': return v?.email ? { email: v.email } : null;
    case 'phone': return v?.phone ? { phone: String(v.phone) } : null;
    case 'rating': return v?.rating ? { rating: Number(v.rating) } : null;
    case 'long_text': case 'long-text': return asText(v?.text ?? text);
    case 'text': return asText(text);
    case 'creation_log': case 'pulse-log': case 'last_updated': case 'pulse-updated': case 'item_id': case 'pulse-id': return null;
    case 'mirror': case 'lookup': case 'board_relation': case 'board-relation': case 'dependency': case 'formula': return asText(cv.display_value ?? text);
    case 'country': return asText(v?.countryName || text);
    case 'location': return asText(v?.address || text);
    case 'hour': return v?.hour == null ? null : { text: `${pad(v.hour)}:${pad(v.minute || 0)}` };
    case 'world_clock': return asText(v?.timezone || text);
    case 'color_picker': return asText(v?.color?.hex || text);
    case 'file': { const names = (v?.files || []).map((f) => f.name).filter(Boolean); return names.length ? { text: names.join(', ') } : asText(text); }
    default: return asText(text);
  }
}
export function mapItem(it, boardId, colsByMondayId, mcolsById, ctx) {
  const values = {};
  for (const cv of it.column_values || []) {
    const col = colsByMondayId[cv.id]; const mc = mcolsById[cv.id]; if (!col || !mc || col.type === 'name') continue;
    const v = mapValue(mc, col, cv, ctx); if (v != null) values[col.id] = v;
  }
  return { id: `mi_${it.id}`, monday_id: String(it.id), seq: Number(it.id), board_id: `mb_${boardId}`, group_id: `mg_${it.group?.id}`, parent_item_id: null, name: it.name, position: Number(ctx.position++), state: 'active', created_by: it.creator_id ? ctx.user(it.creator_id) : null, deleted_at: null, created_at: it.created_at || ctx.now, updated_at: it.updated_at || it.created_at || ctx.now, values };
}

/* ---------- updates ---------- */
export function htmlToText(html, fallback = '') {
  if (!html) return String(fallback || '').trim();
  let s = String(html);
  s = s.replace(/<(a|span)\b[^>]*mention[^>]*>\s*@?([^<]*?)\s*<\/\1>/gi, (m, tag, name) => `@[${name.trim()}]`);
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<(ul|ol)\b[^>]*>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|blockquote|ul|ol)>/gi, '\n').replace(/<li\b[^>]*>/gi, '- ').replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)));
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s || String(fallback || '').trim();
}
export function mapUpdate(u, boardId, ctx, parentId = null) {
  const creator = u.creator_id ? ctx.user(u.creator_id) : null;
  return { id: `mup_${u.id}`, monday_id: String(u.id), item_id: `mi_${u.item_id || ctx.itemOfUpdate?.(u.id) || ''}`, board_id: `mb_${boardId}`, parent_update_id: parentId, creator_id: creator, body: htmlToText(u.body, u.text_body).slice(0, 46000), pinned: !!(u.pinned_to_top && u.pinned_to_top.length), likes: [...new Set((u.likes || []).map((l) => l.creator_id).filter(Boolean).map((id) => ctx.user(id)))], seen_by: creator ? [creator] : [], edited_at: u.updated_at && u.updated_at !== u.created_at ? u.updated_at : null, created_at: u.created_at || ctx.now };
}
