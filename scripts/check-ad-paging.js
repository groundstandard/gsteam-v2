// Does the Ads screen get every row, or only the first thousand?
//
// Supabase stops at 1000 rows and says nothing. One row per campaign per day
// passes that inside a month, so the section would under-report by a third with
// nothing on screen to show for it. This drives the real fetch against the live
// view, as a signed-in person, and checks the total against a straight count.
//
// Run:  node scripts/check-ad-paging.js

import fs from 'node:fs';

const env = {};
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const [k, ...rest] = t.split('=');
      env[k.trim()] = rest.join('=').trim();
    }
  }
}

const URL_ = env.SUPABASE_URL.replace(/\/$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36';
const FROM = '2026-08-18', TO = '2026-09-17';

const failures = [];
const ok = (m, x) => console.log(`  ok   ${m}${x ? ' — ' + x : ''}`);
const bad = (m, w) => { failures.push(m); console.log(`  FAIL ${m} — ${w}`); };

const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', 'User-Agent': UA },
  body: JSON.stringify({ email: 'mike@groundstandard.com', password: 'Abc123!' }),
}).then(r => r.json());

const token = session.access_token;
token ? ok('signed in as a real person') : bad('signed in as a real person', JSON.stringify(session).slice(0, 120));
if (!token) process.exit(1);

const headers = { apikey: ANON, Authorization: `Bearer ${token}`, 'User-Agent': UA };

// What is actually there.
const head = await fetch(
  `${URL_}/rest/v1/ad_metrics_daily_v?select=id&level=eq.campaign&day=gte.${FROM}&day=lte.${TO}`,
  { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
const total = Number(head.headers.get('content-range').split('/')[1]);
console.log(`  rows in the window: ${total}`);
total > 1000
  ? ok('more than one page exists, so paging is the thing being tested')
  : bad('more than one page exists', `only ${total} rows — this check proves nothing today`);

// One request, the way it used to be.
const single = await fetch(
  `${URL_}/rest/v1/ad_metrics_daily_v?select=*&level=eq.campaign&day=gte.${FROM}&day=lte.${TO}`,
  { headers }).then(r => r.json());
single.length === 1000
  ? ok('a single request stops at 1000, as expected')
  : console.log(`  note: a single request returned ${single.length}`);

// Paged, the way the app does it now.
const PAGE = 1000;
const all = [];
for (let offset = 0; ; offset += PAGE) {
  const r = await fetch(
    `${URL_}/rest/v1/ad_metrics_daily_v?select=*&level=eq.campaign&day=gte.${FROM}&day=lte.${TO}` +
    `&order=day.asc&offset=${offset}&limit=${PAGE}`, { headers }).then(x => x.json());
  all.push(...r);
  if (r.length < PAGE) break;
}
all.length === total
  ? ok('paging returns every row', `${all.length}`)
  : bad('paging returns every row', `got ${all.length} of ${total}`);

const sum = rows => rows.reduce((t, r) => t + Number(r.spend), 0);
const missed = sum(all) - sum(single);
missed > 0
  ? ok('spend a single request would have missed', `$${Math.round(missed)}`)
  : bad('spend a single request would have missed', 'none — the window may be too small');

const ids = new Set(all.map(r => r.id));
ids.size === all.length
  ? ok('no row is counted twice across pages')
  : bad('no row is counted twice across pages', `${all.length - ids.size} duplicates`);

console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
