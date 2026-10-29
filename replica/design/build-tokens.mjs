// Writes styles/tokens.css from replica/design/tokens.json so the CSS never drifts from the tokens.
// usage: node replica/design/build-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const t = JSON.parse(readFileSync(new URL('./tokens.json', here), 'utf8'));
const lines = [':root {'];
for (const [k, v] of Object.entries(t.color)) lines.push(`  --color-${k}: ${v};`);
for (const [k, v] of Object.entries(t.font)) lines.push(`  --font-${k}: ${v};`);
for (const [k, v] of Object.entries(t.type)) lines.push(`  --text-${k}: ${v.size}px; --leading-${k}: ${v.line}px; --weight-${k}: ${v.weight};`);
t.space.forEach((v, i) => lines.push(`  --space-${i}: ${v}px;`));
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --radius-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.shadow)) lines.push(`  --shadow-${k}: ${v};`);
for (const [k, v] of Object.entries(t.motion)) lines.push(`  --motion-${k}: ${v};`);
for (const [k, v] of Object.entries(t.layout)) if (typeof v === 'number') lines.push(`  --layout-${k}: ${v}px;`);
lines.push('}');
const out = new URL('../../styles/tokens.css', here);
writeFileSync(out, `/* generated from replica/design/tokens.json — edit the JSON, then: node replica/design/build-tokens.mjs */\n${lines.join('\n')}\n`);
console.log('wrote', out.pathname);
