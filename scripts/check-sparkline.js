// check-sparkline.js — the bucketing behind the stat-tile sparklines, verified
// in node rather than eyeballed.
//
// A sparkline that buckets wrongly does not look broken; it looks like a trend.
// That is the whole risk: a wrong shape is more convincing than a missing one.
//
// Run:  npm run check

import babel from '@babel/core';
import { createRequire } from 'node:module';
import fs from 'fs';
import vm from 'vm';

const require = createRequire(import.meta.url);

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);

// reporting.jsx declares its helpers as plain functions and hangs the components
// off window at the end; run it in a context where React is a stub, since none
// of it is rendered here.
sandbox.React = { useState: () => [null, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) };
const code = babel.transformSync(fs.readFileSync('src/reporting.jsx', 'utf8'), {
  presets: [require.resolve('@babel/preset-react')], filename: 'src/reporting.jsx',
}).code;
vm.runInContext(`${code}\nwindow.__rptSeries = rptSeries;`, sandbox);

const rptSeries = sandbox.__rptSeries;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

const win = { from: '2026-01-01', to: '2026-01-12' };
const day = (d, v) => ({ d, v });

// 1 ── one item per day across a twelve-day window lands one per bucket
{
  const items = Array.from({ length: 12 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, '0')}`));
  const out = rptSeries(items, x => x.d, win);
  check('one per day fills every bucket', out && out.length === 12 && out.every(v => v === 1),
    out ? out.join(',') : 'null');
}

// 2 ── everything on one day lands in one bucket, and nothing leaks
{
  const items = Array.from({ length: 5 }, () => day('2026-01-01'));
  const out = rptSeries(items, x => x.d, win);
  const filled = out ? out.filter(v => v > 0).length : 0;
  check('a single day occupies a single bucket', filled === 1 && out[0] === 5, out ? out.join(',') : 'null');
}

// 3 ── values are summed when a value accessor is given, not counted
{
  const items = [day('2026-01-01', 10), day('2026-01-01', 5), day('2026-01-12', 2)];
  const out = rptSeries(items, x => x.d, win, x => x.v);
  check('values sum rather than count', out && out[0] === 15 && out[out.length - 1] === 2,
    out ? out.join(',') : 'null');
}

// 4 ── anything outside the window is dropped, not clamped into an end bucket
{
  const items = [day('2025-12-25'), day('2026-02-01'), day('2026-01-06')];
  const out = rptSeries(items, x => x.d, win);
  const total = out ? out.reduce((a, b) => a + b, 0) : -1;
  check('dates outside the window are dropped', total === 1, `total ${total}, expected 1`);
}

// 5 ── nothing in the window means no sparkline at all, not a flat line at zero
{
  const out = rptSeries([day('2025-01-01')], x => x.d, win);
  check('an empty window draws nothing', out === null, String(out));
}

// 6 ── the last day of the window belongs to the last bucket
{
  const out = rptSeries([day('2026-01-12')], x => x.d, win);
  check('the final day lands in the final bucket', out && out[11] === 1, out ? out.join(',') : 'null');
}

// 7 ── a full timestamp works as well as a bare date, since leads carry one
{
  const out = rptSeries([{ d: '2026-01-01T09:30:00.000Z' }], x => x.d, win);
  check('an ISO timestamp is accepted', out && out[0] === 1, out ? out.join(',') : 'null');
}

// 8 ── "all time" has no window, so there is nothing to bucket against
{
  const out = rptSeries([day('2026-01-01')], x => x.d, { from: null, to: null });
  check('a windowless period draws nothing', out === null, String(out));
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.name}${r.pass ? '' : ` — got ${r.detail}`}`);
}
console.log(failed ? `\n${failed} of ${results.length} failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
