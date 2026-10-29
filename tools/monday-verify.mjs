// Checks an export in data/import against monday.com live: item counts per board and a random sample of cell values.
// usage: node tools/monday-verify.mjs [--boards all|N] [--items N] [--in data/import]
import { readFileSync } from 'node:fs';
import { gql } from './monday-api.mjs';
import { localDateTime, parseJson, parseNumber } from './monday-map.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const dir = opt('in', 'data/import'); const boardsOpt = opt('boards', '12'); const perBoard = Number(opt('items', '8'));
const index = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8'));
const users = new Map(index.meta.users.map((u) => [u.id, u])); const teams = new Map(index.meta.teams.map((t) => [t.id, t]));
let boards = index.boards; if (boardsOpt !== 'all') { const n = Number(boardsOpt); const step = Math.max(1, Math.floor(boards.length / n)); boards = boards.filter((_, i) => i % step === 0).slice(0, n); }
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// Independent re-derivation of the display text from the clone's stored value (deliberately NOT lib/columns.js).
const utc = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '');
function ourText(col, v, item) {
  if (col.type === 'creation_log') return utc(item.created_at); // derived from the item, not stored as a value
  if (col.type === 'last_updated') return utc(item.updated_at);
  if (col.type === 'item_id') return String(item.seq);
  if (v == null) return '';
  switch (col.type) {
    case 'status': return col.settings.labels.find((l) => l.id === v.label)?.text ?? '';
    case 'dropdown': return v.ids.map((id) => col.settings.options.find((o) => o.id === id)?.text ?? '').join(', ');
    case 'people': return [...v.user_ids.map((id) => users.get(id)?.name ?? ''), ...(v.team_ids || []).map((id) => teams.get(id)?.name ?? '')].join(', ');
    case 'date': return v.time ? `${v.date} ${v.time}` : v.date;
    case 'timeline': return `${v.from} - ${v.to}`;
    case 'numbers': return String(v.number);
    case 'checkbox': return v.checked ? 'v' : '';
    case 'link': return v.url;
    case 'email': return v.email;
    case 'phone': return v.phone;
    case 'rating': return String(v.rating);
    case 'text': case 'long_text': return v.text;
    case 'file': return (v.files || []).map((f) => f.name).join(', ');
    default: return '';
  }
}
// monday's `text` for the same cell, normalised to the comparison form above.
function mondayText(mcType, cv) {
  const v = parseJson(cv.value); const t = cv.text ?? '';
  switch (mcType) {
    case 'date': { if (!v?.date) return ''; const l = localDateTime(v.date, v.time); return l.time ? `${l.date} ${l.time}` : l.date; }
    case 'numbers': case 'numeric': case 'auto_number': case 'progress': { const n = parseNumber(t); return n == null ? '' : String(n); }
    case 'checkbox': case 'boolean': return v?.checked === true || v?.checked === 'true' ? 'v' : '';
    case 'link': return v?.url || '';
    case 'email': return v?.email || '';
    case 'phone': return v?.phone ? String(v.phone) : '';
    case 'rating': return v?.rating ? String(v.rating) : '';
    case 'timeline': return v?.from ? `${v.from} - ${v.to || v.from}` : '';
    case 'mirror': case 'board_relation': case 'dependency': case 'formula': return cv.display_value ?? t;
    case 'hour': return v?.hour == null ? '' : `${String(v.hour).padStart(2, '0')}:${String(v.minute || 0).padStart(2, '0')}`;
    case 'file': return (v?.files || []).map((f) => f.name).join(', ') || t;
    case 'vote': return (v?.votersIds || []).length ? String(v.votersIds.length) : '';
    case 'country': return v?.countryName || t;
    case 'location': return v?.address || t;
    case 'world_clock': return v?.timezone || t;
    case 'color_picker': return v?.color?.hex || t;
    default: return t;
  }
}

// structural check over EVERY board file: group ids unique across the export, each item in a group of its own board, each value on a column of that board
const seenGroups = new Set(); let structural = 0;
for (const entry of index.boards) {
  const b = JSON.parse(readFileSync(`${dir}/${entry.file}`, 'utf8'));
  const gids = new Set(b.groups.map((g) => g.id)); const cids = new Set(b.columns.map((c) => c.id));
  for (const g of b.groups) { if (seenGroups.has(g.id)) { structural++; console.log(`STRUCT ${entry.name}: group id ${g.id} also used by another board`); } seenGroups.add(g.id); if (g.board_id !== b.board.id) { structural++; console.log(`STRUCT ${entry.name}: group ${g.id} belongs to ${g.board_id}`); } }
  for (const it of b.items) { if (!gids.has(it.group_id)) { structural++; if (structural < 20) console.log(`STRUCT ${entry.name}: item ${it.name} in unknown group ${it.group_id}`); } for (const cid of Object.keys(it.values)) if (!cids.has(cid)) { structural++; if (structural < 20) console.log(`STRUCT ${entry.name}: item ${it.name} has a value for unknown column ${cid}`); } }
}
console.log(`STRUCTURE: ${structural} problem(s) across ${index.boards.length} boards`);

const stats = {}; const examples = []; let countMismatch = 0;
for (const entry of boards) {
  const bundle = JSON.parse(readFileSync(`${dir}/${entry.file}`, 'utf8'));
  const active = bundle.items.length;
  if (entry.monday_items_count != null && active !== entry.monday_items_count) { countMismatch++; console.log(`COUNT  ${entry.name}: clone ${active} vs monday ${entry.monday_items_count}`); }
  if (!bundle.items.length) continue;
  const picks = []; const step = Math.max(1, Math.floor(bundle.items.length / perBoard)); for (let i = 0; i < bundle.items.length && picks.length < perBoard; i += step) picks.push(bundle.items[i]);
  const d = await gql(`query($ids: [ID!]) { items(ids: $ids, limit: 50) { id name column_values { id type text value ... on MirrorValue { display_value } ... on BoardRelationValue { display_value } ... on DependencyValue { display_value } ... on FormulaValue { display_value } } } }`, { ids: picks.map((p) => p.monday_id) });
  const live = new Map((d.items || []).map((it) => [String(it.id), it]));
  const cols = bundle.columns.filter((c) => c.type !== 'name');
  for (const p of picks) {
    const it = live.get(p.monday_id); if (!it) { console.log(`MISSING ${entry.name}: item ${p.monday_id} not returned live`); continue; }
    if (norm(it.name) !== norm(p.name)) { stats.name = stats.name || { ok: 0, bad: 0 }; stats.name.bad++; examples.push(`${entry.name} / ${p.name}: name differs live "${it.name}"`); }
    for (const cv of it.column_values) {
      const col = cols.find((c) => c.monday_id === cv.id); if (!col) continue;
      const key = `${cv.type}->${col.type}`; stats[key] = stats[key] || { ok: 0, bad: 0 };
      const a = norm(ourText(col, p.values[col.id], p)), b = norm(mondayText(cv.type, cv));
      const ok = a === b || (col.tags && a.split(', ').sort().join(', ') === b.split(', ').sort().join(', ')) || (col.type === 'people' && a && b && a.split(', ').every((n) => b.includes(n)));
      if (ok) stats[key].ok++; else { stats[key].bad++; if (examples.length < 40) examples.push(`${entry.name} / ${p.name} / ${col.title} [${key}]: clone "${a.slice(0, 60)}" vs monday "${b.slice(0, 60)}"`); }
    }
  }
}
console.log('\nPER TYPE (monday type -> clone type): ok / mismatch');
for (const [k, s] of Object.entries(stats).sort()) console.log(`  ${k.padEnd(34)} ${String(s.ok).padStart(5)} / ${s.bad}`);
const total = Object.values(stats).reduce((a, s) => ({ ok: a.ok + s.ok, bad: a.bad + s.bad }), { ok: 0, bad: 0 });
console.log(`\nTOTAL cells ${total.ok + total.bad}: ${total.ok} match, ${total.bad} differ (${((100 * total.bad) / Math.max(1, total.ok + total.bad)).toFixed(1)}%); boards with count mismatch: ${countMismatch} of ${boards.length}`);
if (examples.length) { console.log('\nEXAMPLES'); examples.forEach((e) => console.log('  ' + e)); }
process.exit(structural || countMismatch || total.bad / Math.max(1, total.ok + total.bad) > 0.02 ? 1 : 0);
