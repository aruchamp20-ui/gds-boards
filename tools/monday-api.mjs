// Shared monday.com GraphQL client for the migration tools. Token comes from an env file; it is never logged.
import { readFileSync } from 'node:fs';

export function loadToken() {
  if (process.env.MONDAY_TOKEN) return process.env.MONDAY_TOKEN;
  const envFile = process.env.MONDAY_ENV_FILE || 'C:/Users/Arun.Bondalapati/OneDrive - GDS Group/Desktop/Claude Dashboard Folders/gds-events-dashboard/.env';
  const text = readFileSync(envFile, 'utf8').replace(/^\uFEFF/, '');
  const m = text.match(/^\s*MONDAY_TOKEN\s*=\s*"?([^"\r\n]+)"?/m);
  if (!m) throw new Error(`MONDAY_TOKEN not found in ${envFile}`);
  return m[1].trim();
}

const token = loadToken();
let calls = 0;
export async function gql(query, variables = {}, { retries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    calls++;
    const res = await fetch('https://api.monday.com/v2', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': '2025-01' }, body: JSON.stringify({ query, variables }) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    const msgs = (json?.errors || []).map((e) => e.message || '').join(' ');
    const complexity = /complexity|rate limit/i.test(msgs) || res.status === 429;
    if ((complexity || res.status >= 500) && attempt < retries) { const m = /reset in (\d+) seconds/i.exec(msgs); const wait = complexity ? (m ? (Number(m[1]) + 1) * 1000 : 30000) : 3000 * (attempt + 1); process.stderr.write(`  monday API busy (${res.status}), waiting ${wait / 1000}s\n`); await new Promise((r) => setTimeout(r, wait)); continue; }
    if (!res.ok) throw new Error(`monday API ${res.status}: ${text.slice(0, 300)}`);
    if (json?.errors?.length) throw new Error(`monday GraphQL: ${json.errors.map((e) => e.message).join('; ').slice(0, 500)}`);
    return json.data;
  }
}
export const callCount = () => calls;
