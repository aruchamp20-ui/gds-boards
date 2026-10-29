// WCAG contrast check for tokens.json (node port of replica-design/contrast.py; Python is absent on this machine).
// usage: node replica/design/contrast.mjs [path/to/tokens.json]   exits 1 on any AA failure
import { readFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(process.argv[2] || new URL('./tokens.json', import.meta.url), 'utf8'));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
let fail = 0;
for (const [fg, bg, kind] of t.pairs) {
  const r = ratio(t.color[fg], t.color[bg]);
  const floor = kind === 'ui' ? 3 : 4.5;
  const ok = r >= floor;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${fg.padEnd(14)} on ${bg.padEnd(14)} ${r.toFixed(2)}:1 (needs ${floor})`);
}
console.log(fail ? `${fail} failure(s)` : 'all pairs pass AA');
process.exit(fail ? 1 : 0);
