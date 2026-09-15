// check-reporting.js — checks the Leads and Ads demo fixtures and the
// aggregation the Ads screen performs, in node, so the numbers are verified
// rather than eyeballed in a browser.
//
// Run:  npm run check
// Needs @babel/core + @babel/preset-react (devDependencies) because the app
// ships untranspiled JSX that the browser compiles at load time.
const babel = require('@babel/core');
const fs = require('fs');
const vm = require('vm');

const store = {};
const sandbox = {
  console,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
};
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const f of ['src/data.jsx']) {
  const code = babel.transformSync(fs.readFileSync(f, 'utf8'), { presets: [require.resolve('@babel/preset-react')], filename: f }).code;
  vm.runInContext(code, sandbox);
}

const st = sandbox.CABT_loadState();
const fail = [];
const check = (name, cond, extra) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fail.push(name); };

check('leads generated', st.leads.length === 260, `${st.leads.length} leads`);
check('every lead has a source', st.leads.every(l => l.source));
check('funnel never runs backwards',
  st.leads.every(l => (!l.showedAt || l.bookedAt) && (!l.signedAt || l.showedAt)));
check('no future timestamps', st.leads.every(l => new Date(l.createdAt) <= new Date()));

const bySource = {};
st.leads.forEach(l => { bySource[l.source] = (bySource[l.source] || 0) + 1; });
check('all four sources Bobby named are present',
  ['facebook', 'google', 'website', 'phone'].every(s => bySource[s] > 0),
  JSON.stringify(bySource));

check('ad accounts on both platforms', new Set(st.adAccounts.map(a => a.platform)).size === 2, `${st.adAccounts.length} accounts`);
check('campaigns exist', st.adCampaigns.length > 0, `${st.adCampaigns.length} campaigns`);
check('ad sets are meta-only', st.adSets.length > 0 && st.adSets.every(s =>
  st.adCampaigns.find(c => c.id === s.adCampaignId &&
    st.adAccounts.find(a => a.id === c.adAccountId).platform === 'meta')), `${st.adSets.length} ad sets`);
check('daily metrics at both levels', new Set(st.adMetricsDaily.map(m => m.level)).size === 2, `${st.adMetricsDaily.length} rows`);

// The same aggregation the Ads screen performs.
const campIds = new Set(st.adCampaigns.filter(c => {
  const acc = st.adAccounts.find(a => a.id === c.adAccountId);
  return acc && acc.platform === 'meta';
}).map(c => c.id));
const grouped = {};
st.adMetricsDaily.filter(r => r.level === 'campaign' && campIds.has(r.refId)).forEach(r => {
  const g = grouped[r.refId] || (grouped[r.refId] = { spend: 0, impressions: 0, clicks: 0, leads: 0 });
  g.spend += r.spend; g.impressions += r.impressions; g.clicks += r.clicks; g.leads += r.leads;
});
const rows = Object.entries(grouped).map(([id, g]) => ({
  id, ...g,
  ctr: g.impressions > 0 ? (g.clicks / g.impressions) * 100 : null,
  cpl: g.leads > 0 ? g.spend / g.leads : null,
}));
check('meta campaigns aggregate', rows.length === 12, `${rows.length} rows`);
check('CTR lands in a believable range', rows.every(r => r.ctr > 0.1 && r.ctr < 10),
  rows.map(r => r.ctr.toFixed(2) + '%').join(', '));
check('cost per lead is a real number', rows.every(r => r.cpl > 0 && r.cpl < 500),
  rows.map(r => '$' + r.cpl.toFixed(0)).join(', '));

const cpls = rows.map(r => r.cpl).sort((a, b) => a - b);
check('the at-a-glance comparison has a spread to show', cpls[cpls.length - 1] > cpls[0] * 1.5,
  `$${cpls[0].toFixed(0)} – $${cpls[cpls.length - 1].toFixed(0)}`);

const runs = st.syncRuns;
check('a failed sync is present so the failure state is visible',
  runs.some(r => r.status === 'failed') && runs.some(r => r.status === 'ok'));

console.log(fail.length ? `\n${fail.length} failed` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
