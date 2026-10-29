// Filter, sort, search and person filter for a view. Everything goes through the column registry.
import { typeOf, cellText } from './columns.js';

export function matchesRule(item, rule, colsById, ctx) {
  const col = colsById[rule.column_id]; if (!col) return true;
  const T = typeOf(col); if (!T.test) return true;
  return T.test(item.values[col.id], rule.op, rule.arg, col, ctx, item);
}
export function matchesFilter(item, filter, colsById, ctx) {
  const rules = (filter?.rules || []).filter((r) => r.column_id && r.op);
  if (!rules.length) return true;
  return filter.logic === 'or' ? rules.some((r) => matchesRule(item, r, colsById, ctx)) : rules.every((r) => matchesRule(item, r, colsById, ctx));
}
export function matchesSearch(item, q, columns, ctx) {
  if (!q) return true; q = q.toLowerCase();
  return columns.some((c) => cellText(item, c, ctx).toLowerCase().includes(q));
}
export function matchesPerson(item, personId, columns) {
  if (!personId) return true;
  return columns.some((c) => c.type === 'people' && (item.values[c.id]?.user_ids || []).includes(personId)) || item.created_by === personId;
}
export function sortItems(items, sort, colsById, ctx) {
  const rules = (sort || []).filter((s) => colsById[s.column_id]);
  if (!rules.length) return items;
  return [...items].sort((a, b) => {
    for (const s of rules) {
      const col = colsById[s.column_id]; const T = typeOf(col);
      const r = T.compare ? T.compare(a.values[col.id], b.values[col.id], col, ctx, a, b) : 0;
      if (r) return s.dir === 'desc' ? -r : r;
    }
    return a.position - b.position;
  });
}
// Everything a view applies, in one place. draft: {filter, sort, hidden_column_ids, search, search_column_ids, person}
export function applyView(items, columns, draft, ctx) {
  const colsById = Object.fromEntries(columns.map((c) => [c.id, c]));
  const searchCols = draft.search_column_ids?.length ? columns.filter((c) => draft.search_column_ids.includes(c.id)) : columns;
  const out = items.filter((i) => matchesFilter(i, draft.filter, colsById, ctx) && matchesSearch(i, draft.search, searchCols, ctx) && matchesPerson(i, draft.person, columns));
  return sortItems(out, draft.sort, colsById, ctx);
}
