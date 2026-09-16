// check-sw.js — the service worker's precache list must match what the page loads.
//
// assistant.jsx and reporting.jsx were both shipped without being added to it.
// Nothing broke loudly: the installed app simply kept serving the previous shell
// from cache, so a feature that was live on the server was invisible on the
// device, and the obvious explanation — "it must be cache" — was right without
// being useful.
//
// Run:  node scripts/check-sw.js

import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');

const loaded = [...html.matchAll(/src="(src\/[^"]+)"/g)].map(m => '/' + m[1]);
const cached = [...sw.matchAll(/'(\/src\/[^']+)'/g)].map(m => m[1]);

const missing = loaded.filter(f => !cached.includes(f));
const stale = cached.filter(f => !loaded.includes(f));

if (missing.length) console.log('  FAIL loaded by index.html but never cached: ' + missing.join(', '));
if (stale.length) console.log('  FAIL cached but no longer loaded: ' + stale.join(', '));
if (!missing.length && !stale.length) console.log(`  ok   service worker caches all ${loaded.length} scripts the page loads`);

process.exit(missing.length || stale.length ? 1 : 0);
