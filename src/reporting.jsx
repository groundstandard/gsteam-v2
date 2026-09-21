// ─────────────────────────────────────────────────────────────────────────
// reporting.jsx — the Leads and Ads sections Bobby and Mike asked for on the
// September 14 call. New surface only: nothing in here touches the CA Rollup,
// because Bobby was explicit that it "shouldn't be changed" [3:52:37].
//
//   Leads — "did the lead come in from Facebook? Did the lead come in from
//   Google? Did the lead come in from the website? Did the lead come in from
//   the phone?" — Bobby [3:51:14]
//
//   Ads — "Ad management should be its own tab... active campaign performance,
//   leads generated, lead costs, CTR. Just at a glance, be like, okay, they're
//   looking good, they need some work." — Mike [3:56:10]
//
//   Sections — "maybe each source should have its own section, and each
//   section should have subsections. So for the meta advertising, the
//   subsections would be by campaign and ad set." — Bobby [3:56:36]
//
// The numbers come from the tables the GoHighLevel and Facebook syncs write
// into. Neither sync exists yet, so these screens are mostly empty — and they
// say why they are empty instead of drawing a row of zeros that reads like a
// measurement. A zero you can trust is worth more than a zero you can't.
// ─────────────────────────────────────────────────────────────────────────

// ── Period window ─────────────────────────────────────────────────────────
// Every screen here is "over a window", and Mike asked to be able to change it.
const RPT_PERIODS = [
  { v: '7d',      label: 'Last 7 days' },
  { v: '30d',     label: 'Last 30 days' },
  { v: 'month',   label: 'This month' },
  { v: 'quarter', label: 'This quarter' },
  { v: 'year',    label: 'This year' },
  { v: 'all',     label: 'All time' },
];

const rptIso = (d) => d.toISOString().slice(0, 10);

function rptWindow(period) {
  const today = new Date();
  const end = rptIso(today);
  const back = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return rptIso(d);
  };
  switch (period) {
    case '7d':      return { from: back(7),  to: end, label: 'Last 7 days' };
    case '30d':     return { from: back(30), to: end, label: 'Last 30 days' };
    case 'month':   return { from: rptIso(new Date(today.getFullYear(), today.getMonth(), 1)), to: end, label: 'This month' };
    case 'quarter': return { from: rptIso(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)), to: end, label: 'This quarter' };
    case 'year':    return { from: rptIso(new Date(today.getFullYear(), 0, 1)), to: end, label: 'This year' };
    default:        return { from: null, to: null, label: 'All time' };
  }
}

// ── Small shared pieces ───────────────────────────────────────────────────

function RptControls({ theme, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function rptSelectStyle(theme) {
  return {
    appearance: 'none', padding: '8px 28px 8px 12px',
    background: theme.surface, color: theme.ink,
    border: `1px solid ${theme.rule}`, borderRadius: 8,
    fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
  };
}

function RptSelect({ theme, value, onChange, options, ariaLabel }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={rptSelectStyle(theme)}
    >
      {options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

// A stat that knows the difference between "none" and "not measured yet".
function RptStat({ theme, label, value, sub, muted }) {
  return (
    <div style={{
      flex: '1 1 130px', minWidth: 130,
      background: theme.surface, border: `1px solid ${theme.rule}`,
      borderRadius: theme.radius || 10, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: theme.inkMuted }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, marginTop: 4,
        color: muted ? theme.inkMuted : theme.ink, fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

// Why a screen is empty matters more than the fact that it is. This says which
// sync has to exist before numbers appear, so nobody files it as a bug.
function RptNotConnected({ theme, title, what, needs }) {
  return (
    <div style={{
      border: `1px dashed ${theme.rule}`, borderRadius: theme.radius || 10,
      padding: 20, textAlign: 'left', background: 'transparent',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: theme.inkSoft, lineHeight: 1.5 }}>{what}</div>
      {needs ? (
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 10, lineHeight: 1.6 }}>
          <strong style={{ color: theme.inkSoft, fontWeight: 600 }}>Waiting on:</strong> {needs}
        </div>
      ) : null}
    </div>
  );
}

// Last sync, in words. Kurt and Mike confirm the data — they need to know
// whether a missing number is a real nothing or a failed job.
function RptSyncNote({ theme, runs, source, label }) {
  const run = (runs || []).find(r => r.source === source);
  if (!run) {
    return (
      <div style={{ fontSize: 11, color: theme.inkMuted, marginBottom: 10 }}>
        {label} has never run.
      </div>
    );
  }
  const when = run.startedAt ? new Date(run.startedAt).toLocaleString() : 'unknown time';
  const tone = run.status === 'failed' ? '#C6483C' : run.status === 'ok' ? theme.inkMuted : theme.gold;
  return (
    <div style={{ fontSize: 11, color: tone, marginBottom: 10 }}>
      {label} · {run.status === 'ok' ? 'last ran' : run.status} {when}
      {run.status === 'ok' && run.rowsWritten != null ? ` · ${run.rowsWritten} rows` : ''}
      {run.error ? ` · ${run.error}` : ''}
    </div>
  );
}

// Every reporting screen draws through RptTable, so a phone reading only has to
// exist once. Scrolling a nine-column table sideways on a phone is not reading
// it — the row label is off-screen by the time you reach the number.
function useNarrow(breakpoint = 720) {
  const [vw, setVw] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vw < breakpoint;
}

function RptCardRow({ theme, columns, title, get, strong }) {
  return (
    <div style={{
      border: `1px solid ${theme.rule}`, borderRadius: theme.radius || 10,
      background: strong ? (theme.bgElev || theme.surface) : theme.surface, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gap: 5 }}>
        {columns.map(c => {
          const value = get(c);
          if (value == null || value === '') return null;
          return (
            <div key={c.key} style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                color: theme.inkMuted,
              }}>{c.label}</span>
              <span style={{
                fontSize: 13, textAlign: 'right', fontWeight: strong ? 700 : 400,
                fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : 'normal',
                color: !strong && c.muted ? theme.inkMuted : theme.ink,
              }}>{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RptTable({ theme, columns, rows, footer, empty }) {
  const narrow = useNarrow();
  if (!rows.length) {
    return <div style={{ fontSize: 13, color: theme.inkMuted, padding: '16px 4px' }}>{empty}</div>;
  }
  if (narrow) {
    // The first column is what the row is about — client, campaign, source — so
    // it becomes the card's heading and the rest become label/value pairs.
    const [head, ...rest] = columns;
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((r, i) => (
          <RptCardRow
            key={r._key || i} theme={theme} columns={rest}
            title={head.render ? head.render(r) : r[head.key]}
            get={c => (c.render ? c.render(r) : r[c.key])}
          />
        ))}
        {footer ? (
          <RptCardRow
            theme={theme} columns={rest} strong
            title={footer[head.key] != null ? footer[head.key] : 'Total'}
            get={c => footer[c.key]}
          />
        ) : null}
      </div>
    );
  }
  const cell = { padding: '8px 10px', borderBottom: `1px solid ${theme.rule}`, whiteSpace: 'nowrap' };
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${theme.rule}`, borderRadius: theme.radius || 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: theme.ink }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{
                ...cell, textAlign: c.align || 'left', fontSize: 10, fontWeight: 700,
                letterSpacing: 0.5, textTransform: 'uppercase', color: theme.inkMuted,
                background: theme.bgElev || 'transparent', position: 'sticky', top: 0,
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r._key || i}>
              {columns.map(c => (
                <td key={c.key} style={{
                  ...cell, textAlign: c.align || 'left',
                  fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : 'normal',
                  color: c.muted ? theme.inkMuted : theme.ink,
                }}>{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? (
          <tfoot>
            <tr>
              {columns.map(c => (
                <td key={c.key} style={{
                  ...cell, textAlign: c.align || 'left', fontWeight: 700, borderBottom: 'none',
                  fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : 'normal',
                  background: theme.bgElev || 'transparent',
                }}>{footer[c.key] != null ? footer[c.key] : ''}</td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

// ── Leads ─────────────────────────────────────────────────────────────────

const LEAD_SOURCES = [
  { v: 'facebook', label: 'Facebook' },
  { v: 'google',   label: 'Google' },
  { v: 'website',  label: 'Website' },
  { v: 'phone',    label: 'Phone' },
  { v: 'referral', label: 'Referral' },
  { v: 'walk_in',  label: 'Walk-in' },
  { v: 'other',    label: 'Other' },
];
const leadSourceLabel = (s) => (LEAD_SOURCES.find(x => x.v === s) || { label: s || '—' }).label;

function LeadsSection({ state, theme, navigate }) {
  const [period, setPeriod]   = React.useState('30d');
  const [clientId, setClient] = React.useState('');
  const [source, setSource]   = React.useState('');
  const [rows, setRows]       = React.useState(null);   // null = still loading
  const [runs, setRuns]       = React.useState([]);
  const [error, setError]     = React.useState(null);

  const win = rptWindow(period);

  React.useEffect(() => {
    let cancelled = false;
    setRows(null); setError(null);
    Promise.all([
      CABT_api.fetchLeads({ from: win.from, to: win.to, clientId: clientId || undefined, source: source || undefined }),
      CABT_api.fetchSyncRuns({ limit: 25 }),
    ])
      .then(([leads, syncRuns]) => { if (!cancelled) { setRows(leads); setRuns(syncRuns); } })
      .catch(e => { if (!cancelled) { setRows([]); setError(e.message || String(e)); } });
    return () => { cancelled = true; };
  }, [period, clientId, source]);

  const clientOptions = [{ v: '', label: 'All clients' }].concat(
    (state.clients || []).slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(c => ({ v: c.id, label: c.name || c.id }))
  );

  const leads = rows || [];
  const count  = (f) => leads.filter(f).length;
  const booked = count(l => l.bookedAt);
  const showed = count(l => l.showedAt);
  const signed = count(l => l.signedAt);
  const pct = (n) => (leads.length ? `${Math.round((n / leads.length) * 100)}%` : '—');

  // By source — the breakdown that did not exist before, and the reason this
  // section was asked for.
  const bySource = LEAD_SOURCES.map(s => {
    const ls = leads.filter(l => l.source === s.v);
    return {
      _key: s.v,
      source: s.label,
      leads: ls.length,
      booked: ls.filter(l => l.bookedAt).length,
      showed: ls.filter(l => l.showedAt).length,
      signed: ls.filter(l => l.signedAt).length,
      share: leads.length ? `${Math.round((ls.length / leads.length) * 100)}%` : '—',
    };
  }).filter(r => r.leads > 0);

  const clientName = (l) => l.client?.name || l.clientId || '—';
  const stage = (l) => l.signedAt ? 'Signed' : l.showedAt ? 'Showed' : l.bookedAt ? 'Booked' : l.lostAt ? 'Lost' : 'New';

  return (
    <div style={{ padding: 16 }}>
      <SectionLabel theme={theme}>Leads</SectionLabel>
      <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 12 }}>
        {win.label}
        {rows === null ? ' · loading…' : ` · ${leads.length} lead${leads.length === 1 ? '' : 's'}`}
      </div>

      <RptSyncNote theme={theme} runs={runs} source="ghl" label="GoHighLevel sync" />

      <RptControls theme={theme}>
        <RptSelect theme={theme} value={period} onChange={setPeriod} options={RPT_PERIODS} ariaLabel="Period" />
        <RptSelect theme={theme} value={clientId} onChange={setClient} options={clientOptions} ariaLabel="Client" />
        <RptSelect
          theme={theme} value={source} onChange={setSource} ariaLabel="Source"
          options={[{ v: '', label: 'All sources' }].concat(LEAD_SOURCES)}
        />
      </RptControls>

      {error ? (
        <div style={{ fontSize: 13, color: '#C6483C', marginBottom: 12 }}>Could not load leads: {error}</div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <RptStat theme={theme} label="Leads"  value={rows === null ? '—' : leads.length} muted={!leads.length} />
        <RptStat theme={theme} label="Booked" value={rows === null ? '—' : booked} sub={pct(booked)} muted={!booked} />
        <RptStat theme={theme} label="Showed" value={rows === null ? '—' : showed} sub={pct(showed)} muted={!showed} />
        <RptStat theme={theme} label="Signed" value={rows === null ? '—' : signed} sub={pct(signed)} muted={!signed} />
      </div>

      {rows !== null && !leads.length ? (
        <RptNotConnected
          theme={theme}
          title="No leads recorded yet"
          what="Every lead will carry where it came from — Facebook, Google, the website or the phone — which is the split the old scoreboard never captured. Nothing appears here until the GoHighLevel sync writes its first batch."
          needs="GoHighLevel API access, and a decision on whether we pull at agency level across every sub-account or one sub-account at a time."
        />
      ) : null}

      {bySource.length ? (
        <div style={{ marginBottom: 20 }}>
          <SectionLabel theme={theme}>By source</SectionLabel>
          <RptTable
            theme={theme}
            rows={bySource}
            empty="No leads in this window."
            columns={[
              { key: 'source', label: 'Source' },
              { key: 'leads',  label: 'Leads',  align: 'right' },
              { key: 'share',  label: 'Share',  align: 'right', muted: true },
              { key: 'booked', label: 'Booked', align: 'right' },
              { key: 'showed', label: 'Showed', align: 'right' },
              { key: 'signed', label: 'Signed', align: 'right' },
            ]}
            footer={{
              source: 'Total', leads: leads.length, share: '100%',
              booked, showed, signed,
            }}
          />
        </div>
      ) : null}

      {leads.length ? (
        <div>
          <SectionLabel theme={theme}>All leads</SectionLabel>
          <RptTable
            theme={theme}
            rows={leads.slice(0, 200).map(l => ({ ...l, _key: l.id }))}
            empty="No leads in this window."
            columns={[
              { key: 'created', label: 'Date',   render: l => CABT_fmtDate((l.createdAt || '').slice(0, 10)) },
              { key: 'client',  label: 'Client', render: clientName },
              { key: 'name',    label: 'Name',   render: l => [l.firstName, l.lastName].filter(Boolean).join(' ') || '—' },
              { key: 'source',  label: 'Source', render: l => leadSourceLabel(l.source) },
              { key: 'stage',   label: 'Stage',  render: stage },
              { key: 'origin',  label: 'Origin', muted: true, render: l => (l.confirmedAt ? 'confirmed' : l.origin) },
              { key: 'value',   label: 'Value',  align: 'right', render: l => (l.value != null ? CABT_fmtMoney(l.value) : '—') },
            ]}
          />
          {leads.length > 200 ? (
            <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 8 }}>
              Showing the 200 most recent of {leads.length}. Narrow the window or pick a client to see the rest.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Ads ───────────────────────────────────────────────────────────────────

const AD_PLATFORMS = [
  { v: 'meta',   label: 'Meta advertising',   levels: ['campaign', 'adset'] },
  { v: 'google', label: 'Google advertising', levels: ['campaign'] },
];

// The sources Bobby listed that have no numbers behind them yet. Named rather
// than hidden, so the gap between the brief and the build is visible.
const AD_PENDING_SOURCES = [
  { title: 'Semrush / Google Analytics', what: 'Search visibility and site traffic, combined where the two would otherwise say the same thing twice.', needs: 'Semrush project access and a GA4 property id.' },
  { title: 'Social media',               what: 'Per-platform reach and engagement beside the paid numbers.', needs: 'Which platforms count, and access to each.' },
  { title: 'Stripe',                     what: 'Revenue beside the spend that produced it.', needs: 'Stripe API key — the scoreboard already reads Stripe customer ids, so the join exists.' },
];

function AdsSection({ state, theme, navigate }) {
  const [platform, setPlatform] = React.useState('meta');
  const [level, setLevel]       = React.useState('campaign');
  const [period, setPeriod]     = React.useState('30d');
  const [clientId, setClient]   = React.useState('');
  const [data, setData]         = React.useState(null);
  const [runs, setRuns]         = React.useState([]);
  const [error, setError]       = React.useState(null);

  const win = rptWindow(period);
  const platformDef = AD_PLATFORMS.find(p => p.v === platform) || AD_PLATFORMS[0];

  // Google has no ad sets, so the sub-tab cannot survive a platform switch.
  React.useEffect(() => {
    if (!platformDef.levels.includes(level)) setLevel('campaign');
  }, [platform]);

  React.useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    Promise.all([
      CABT_api.fetchAdMetrics({ from: win.from, to: win.to, clientId: clientId || undefined, level }),
      CABT_api.fetchSyncRuns({ limit: 25 }),
    ])
      .then(([d, syncRuns]) => { if (!cancelled) { setData(d); setRuns(syncRuns); } })
      .catch(e => { if (!cancelled) { setData({ rows: [], accounts: [], campaigns: [], adSets: [] }); setError(e.message || String(e)); } });
    return () => { cancelled = true; };
  }, [period, clientId, level]);

  const clientOptions = [{ v: '', label: 'All clients' }].concat(
    (state.clients || []).slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(c => ({ v: c.id, label: c.name || c.id }))
  );

  const d = data || { rows: [], accounts: [], campaigns: [], adSets: [] };

  // Which accounts belong to this platform, and therefore which campaigns and
  // ad sets the daily rows can point at.
  const platformAccounts = d.accounts.filter(a => a.platform === platform);
  const accountIds = new Set(platformAccounts.map(a => a.id));
  const campaigns = d.campaigns.filter(c => accountIds.has(c.adAccountId));
  const campaignIds = new Set(campaigns.map(c => c.id));
  const adSets = d.adSets.filter(s => campaignIds.has(s.adCampaignId));

  const nameFor = (refId) => {
    if (level === 'campaign') return (campaigns.find(c => c.id === refId) || {}).name || refId;
    if (level === 'adset')    return (adSets.find(s => s.id === refId) || {}).name || refId;
    return (platformAccounts.find(a => a.id === refId) || {}).name || refId;
  };
  const belongs = (refId) => (level === 'adset'
    ? adSets.some(s => s.id === refId)
    : campaigns.some(c => c.id === refId));

  // Days are summed into one row per campaign or ad set. CTR and cost per lead
  // are recomputed from the sums, never averaged from the daily values —
  // averaging a ratio gives a number that is wrong in a way nobody can see.
  const grouped = {};
  d.rows.filter(r => belongs(r.refId)).forEach(r => {
    const g = grouped[r.refId] || (grouped[r.refId] = {
      _key: r.refId, refId: r.refId, spend: 0, impressions: 0, clicks: 0, leads: 0,
    });
    g.spend       += Number(r.spend || 0);
    g.impressions += Number(r.impressions || 0);
    g.clicks      += Number(r.clicks || 0);
    g.leads       += Number(r.leads || 0);
  });

  const rows = Object.values(grouped).map(g => ({
    ...g,
    name: nameFor(g.refId),
    ctr: g.impressions > 0 ? (g.clicks / g.impressions) * 100 : null,
    cpl: g.leads > 0 ? g.spend / g.leads : null,
  })).sort((a, b) => b.spend - a.spend);

  const total = rows.reduce((t, r) => ({
    spend: t.spend + r.spend, impressions: t.impressions + r.impressions,
    clicks: t.clicks + r.clicks, leads: t.leads + r.leads,
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });
  const totalCtr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : null;
  const totalCpl = total.leads > 0 ? total.spend / total.leads : null;

  // "Just at a glance, be like, okay, they're looking good, they need some
  // work" — Mike. The comparison is against this window's own average, so it
  // stays meaningful whatever the client spends.
  const health = (r) => {
    if (totalCpl == null || r.cpl == null) return null;
    if (r.cpl > totalCpl * 1.5) return { label: 'Needs work', color: '#C6483C' };
    if (r.cpl < totalCpl * 0.75) return { label: 'Looking good', color: '#2E7D53' };
    return { label: 'Steady', color: theme.inkMuted };
  };

  const num = (n) => Number(n || 0).toLocaleString();

  return (
    <div style={{ padding: 16 }}>
      <SectionLabel theme={theme}>Ad management</SectionLabel>
      <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 12 }}>
        {win.label}
        {data === null ? ' · loading…' : ` · ${rows.length} ${level === 'adset' ? 'ad set' : 'campaign'}${rows.length === 1 ? '' : 's'}`}
      </div>

      <RptSyncNote
        theme={theme} runs={runs}
        source={platform === 'meta' ? 'meta' : 'google_ads'}
        label={`${platformDef.label} sync`}
      />

      <Tabs
        theme={theme} value={platform} onChange={setPlatform}
        tabs={AD_PLATFORMS.map(p => ({ value: p.v, label: p.label }))}
      />

      <div style={{ height: 12 }} />

      <RptControls theme={theme}>
        {platformDef.levels.length > 1 ? (
          <RptSelect
            theme={theme} value={level} onChange={setLevel} ariaLabel="Level"
            options={[{ v: 'campaign', label: 'By campaign' }, { v: 'adset', label: 'By ad set' }]}
          />
        ) : null}
        <RptSelect theme={theme} value={period} onChange={setPeriod} options={RPT_PERIODS} ariaLabel="Period" />
        <RptSelect theme={theme} value={clientId} onChange={setClient} options={clientOptions} ariaLabel="Client" />
      </RptControls>

      {error ? (
        <div style={{ fontSize: 13, color: '#C6483C', marginBottom: 12 }}>Could not load ad metrics: {error}</div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <RptStat theme={theme} label="Spend" value={data === null ? '—' : CABT_fmtMoney(total.spend)} muted={!total.spend} />
        <RptStat theme={theme} label="Leads" value={data === null ? '—' : num(total.leads)} muted={!total.leads} />
        <RptStat theme={theme} label="Cost / lead" value={totalCpl == null ? '—' : CABT_fmtMoney(totalCpl)} muted={totalCpl == null} />
        <RptStat theme={theme} label="CTR" value={totalCtr == null ? '—' : `${totalCtr.toFixed(2)}%`} sub={totalCtr == null ? null : `${num(total.clicks)} clicks`} muted={totalCtr == null} />
      </div>

      {data !== null && !rows.length ? (
        <RptNotConnected
          theme={theme}
          title={`No ${platformDef.label.toLowerCase()} data yet`}
          what={platform === 'meta'
            ? 'Campaign and ad set performance — spend, impressions, clicks, CTR, leads and cost per lead — summed over whatever window you pick. Numbers appear once the Facebook sync runs.'
            : 'Campaign performance from Google Ads, in the same shape as Meta so the two can be read side by side.'}
          needs={platform === 'meta'
            ? 'Which Facebook ad accounts we pull, and who grants access to them.'
            : 'Google Ads account access, and whether Google Analytics is combined into this section or kept separate.'}
        />
      ) : null}

      {rows.length ? (
        <RptTable
          theme={theme}
          rows={rows}
          empty="Nothing in this window."
          columns={[
            { key: 'name',        label: level === 'adset' ? 'Ad set' : 'Campaign' },
            { key: 'health',      label: 'At a glance', render: r => {
              const h = health(r);
              return h ? <span style={{ color: h.color, fontWeight: 600 }}>{h.label}</span> : '—';
            } },
            { key: 'spend',       label: 'Spend',       align: 'right', render: r => CABT_fmtMoney(r.spend) },
            { key: 'impressions', label: 'Impressions', align: 'right', render: r => num(r.impressions) },
            { key: 'clicks',      label: 'Clicks',      align: 'right', render: r => num(r.clicks) },
            { key: 'ctr',         label: 'CTR',         align: 'right', render: r => (r.ctr == null ? '—' : `${r.ctr.toFixed(2)}%`) },
            { key: 'leads',       label: 'Leads',       align: 'right', render: r => num(r.leads) },
            { key: 'cpl',         label: 'Cost / lead', align: 'right', render: r => (r.cpl == null ? '—' : CABT_fmtMoney(r.cpl)) },
          ]}
          footer={{
            name: 'Total', health: '',
            spend: CABT_fmtMoney(total.spend), impressions: num(total.impressions),
            clicks: num(total.clicks), ctr: totalCtr == null ? '—' : `${totalCtr.toFixed(2)}%`,
            leads: num(total.leads), cpl: totalCpl == null ? '—' : CABT_fmtMoney(totalCpl),
          }}
        />
      ) : null}

      <div style={{ marginTop: 28 }}>
        <SectionLabel theme={theme}>Other sources</SectionLabel>
        <div style={{ display: 'grid', gap: 10 }}>
          {AD_PENDING_SOURCES.map(s => (
            <RptNotConnected key={s.title} theme={theme} title={s.title} what={s.what} needs={s.needs} />
          ))}
        </div>
      </div>
    </div>
  );
}


// == Website ==============================================================
// Analytics, Search Console and the Google listing read together.
//
//   "There should be something for Semrush or Google Analytics, or in that case
//   maybe certain things are combined, so we don't have the same information
//   twice." - Bobby [3:56:36]
//
// Combined is the point: a visit from Google is one visit whether Analytics or
// Search Console counted it. What stays apart is what the visitor did - a tap on
// "call" or "directions" from the listing is a person heading for the door, and
// folding that into pageviews would bury it.

function WebSection({ state, theme, navigate }) {
  const [period, setPeriod]   = React.useState('30d');
  const [clientId, setClient] = React.useState('');
  const [data, setData]       = React.useState(null);
  const [error, setError]     = React.useState(null);

  const win = rptWindow(period);

  React.useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    CABT_api.fetchWebMetrics({ from: win.from, to: win.to, clientId: clientId || undefined })
      .then(function (d) { if (!cancelled) setData(d); })
      .catch(function (e) { if (!cancelled) { setData({ rows: [], sources: [] }); setError(e.message || String(e)); } });
    return function () { cancelled = true; };
  }, [period, clientId]);

  const clientOptions = [{ v: '', label: 'All clients' }].concat(
    (state.clients || []).slice()
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
      .map(function (c) { return { v: c.id, label: c.name || c.id }; })
  );

  const d = data || { rows: [], sources: [] };
  const nameOf = function (id) {
    const found = (state.clients || []).find(function (c) { return c.id === id; });
    return (found && found.name) || id;
  };

  const total = d.rows.reduce(function (t, r) {
    return {
      sessions: t.sessions + (r.sessions || 0),
      users: t.users + (r.users || 0),
      searchClicks: t.searchClicks + (r.searchClicks || 0),
      searchImpressions: t.searchImpressions + (r.searchImpressions || 0),
      mapViews: t.mapViews + (r.mapViews || 0),
      calls: t.calls + (r.listingCalls || 0),
      directions: t.directions + (r.listingDirections || 0),
    };
  }, { sessions: 0, users: 0, searchClicks: 0, searchImpressions: 0, mapViews: 0, calls: 0, directions: 0 });

  // Where everyone came from, not only the ones who filled a form in.
  const bySource = {};
  d.sources.forEach(function (r) {
    const key = r.source + ' / ' + r.medium;
    const at = bySource[key] || (bySource[key] = { _key: key, source: r.source, medium: r.medium, sessions: 0, conversions: 0 });
    at.sessions += r.sessions || 0;
    at.conversions += r.conversions || 0;
  });
  const sourceRows = Object.values(bySource).sort(function (a, b) { return b.sessions - a.sessions; });
  const sourceTotal = sourceRows.reduce(function (t, r) { return t + r.sessions; }, 0);

  const byClient = {};
  d.rows.forEach(function (r) {
    const at = byClient[r.clientId] || (byClient[r.clientId] = {
      _key: r.clientId, clientId: r.clientId, sessions: 0, users: 0,
      searchClicks: 0, mapViews: 0, calls: 0, directions: 0,
    });
    at.sessions += r.sessions || 0;
    at.users += r.users || 0;
    at.searchClicks += r.searchClicks || 0;
    at.mapViews += r.mapViews || 0;
    at.calls += r.listingCalls || 0;
    at.directions += r.listingDirections || 0;
  });
  const clientRows = Object.values(byClient).sort(function (a, b) { return b.sessions - a.sessions; });

  const share = function (n) { return sourceTotal ? Math.round((n / sourceTotal) * 100) + '%' : '-'; };

  return (
    <div>
      <RptControls theme={theme}>
        <RptSelect theme={theme} value={period} onChange={setPeriod} options={RPT_PERIODS} ariaLabel="Period" />
        <RptSelect theme={theme} value={clientId} onChange={setClient} options={clientOptions} ariaLabel="Client" />
        <span style={{ fontSize: 12, color: theme.inkMuted }}>{win.label}</span>
      </RptControls>

      {error ? <div style={{ fontSize: 12, color: '#C6483C', marginBottom: 10 }}>{error}</div> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <RptStat theme={theme} label="Sessions" value={total.sessions.toLocaleString()} />
        <RptStat theme={theme} label="People" value={total.users.toLocaleString()} />
        <RptStat theme={theme} label="From search" value={total.searchClicks.toLocaleString()}
                 sub={total.searchImpressions ? total.searchImpressions.toLocaleString() + ' impressions' : null} />
        <RptStat theme={theme} label="Map views" value={total.mapViews.toLocaleString()} />
        <RptStat theme={theme} label="Calls" value={total.calls.toLocaleString()} sub="from the listing" />
        <RptStat theme={theme} label="Directions" value={total.directions.toLocaleString()} sub="from the listing" />
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 700, color: theme.ink, margin: '18px 0 8px' }}>
        Where they came from
      </h3>
      <RptTable
        theme={theme}
        columns={[
          { key: 'source', label: 'Source' },
          { key: 'medium', label: 'Medium', muted: true },
          { key: 'sessions', label: 'Sessions', align: 'right', render: function (r) { return r.sessions.toLocaleString(); } },
          { key: 'share', label: 'Share', align: 'right', render: function (r) { return share(r.sessions); } },
          { key: 'conversions', label: 'Conversions', align: 'right', render: function (r) { return (r.conversions || 0).toLocaleString(); } },
        ]}
        rows={sourceRows}
        empty={data ? 'Nothing in this window.' : 'Loading...'}
      />

      <h3 style={{ fontSize: 13, fontWeight: 700, color: theme.ink, margin: '22px 0 8px' }}>
        By client
      </h3>
      <RptTable
        theme={theme}
        columns={[
          { key: 'client', label: 'Client', render: function (r) { return nameOf(r.clientId); } },
          { key: 'sessions', label: 'Sessions', align: 'right', render: function (r) { return r.sessions.toLocaleString(); } },
          { key: 'users', label: 'People', align: 'right', render: function (r) { return r.users.toLocaleString(); } },
          { key: 'searchClicks', label: 'Search', align: 'right', render: function (r) { return r.searchClicks.toLocaleString(); } },
          { key: 'mapViews', label: 'Map views', align: 'right', render: function (r) { return r.mapViews.toLocaleString(); } },
          { key: 'calls', label: 'Calls', align: 'right', render: function (r) { return r.calls.toLocaleString(); } },
          { key: 'directions', label: 'Directions', align: 'right', render: function (r) { return r.directions.toLocaleString(); } },
        ]}
        rows={clientRows}
        empty={data ? 'Nothing in this window.' : 'Loading...'}
      />

      <p style={{ fontSize: 11, color: theme.inkMuted, marginTop: 12, lineHeight: 1.6 }}>
        Sessions and search are the same visit counted by two tools, so they are read side by
        side rather than added. Calls and directions come from the Google listing, where
        someone acts without ever reaching the website.
      </p>
    </div>
  );
}

// == Social ===============================================================
// Per platform, because Bobby asked for "social media" beside the paid numbers
// and a follower on Instagram is not a follower on Facebook.

function SocialSection({ state, theme, navigate }) {
  const [period, setPeriod]   = React.useState('30d');
  const [clientId, setClient] = React.useState('');
  const [data, setData]       = React.useState(null);
  const [error, setError]     = React.useState(null);

  const win = rptWindow(period);

  React.useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    CABT_api.fetchSocialMetrics({ from: win.from, to: win.to, clientId: clientId || undefined })
      .then(function (d) { if (!cancelled) setData(d); })
      .catch(function (e) { if (!cancelled) { setData({ rows: [] }); setError(e.message || String(e)); } });
    return function () { cancelled = true; };
  }, [period, clientId]);

  const clientOptions = [{ v: '', label: 'All clients' }].concat(
    (state.clients || []).slice()
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
      .map(function (c) { return { v: c.id, label: c.name || c.id }; })
  );

  const rows = (data || { rows: [] }).rows;
  const nameOf = function (id) {
    const found = (state.clients || []).find(function (c) { return c.id === id; });
    return (found && found.name) || id;
  };

  // Followers is a level, not a total. The newest day in the window is the
  // number and the oldest is what it grew from; summing daily follower counts
  // would report a gym of two hundred as a gym of six thousand.
  const byPair = {};
  rows.forEach(function (r) {
    const key = r.clientId + '::' + r.platform;
    const at = byPair[key] || (byPair[key] = {
      _key: key, clientId: r.clientId, platform: r.platform,
      first: null, last: null, reach: 0, impressions: 0, engaged: 0,
    });
    at.reach += r.reach || 0;
    at.impressions += r.impressions || 0;
    at.engaged += r.engaged || 0;
    if (!at.first || r.day < at.first.day) at.first = r;
    if (!at.last || r.day > at.last.day) at.last = r;
  });

  const pairRows = Object.values(byPair).map(function (p) {
    const now = p.last ? (p.last.followers || 0) : 0;
    const then = p.first ? (p.first.followers || 0) : 0;
    return Object.assign({}, p, { followers: now, growth: now - then });
  }).sort(function (a, b) { return b.followers - a.followers; });

  const platforms = {};
  pairRows.forEach(function (r) {
    const at = platforms[r.platform] || (platforms[r.platform] = { followers: 0, reach: 0, engaged: 0, impressions: 0 });
    at.followers += r.followers;
    at.reach += r.reach;
    at.engaged += r.engaged;
    at.impressions += r.impressions;
  });
  const fb = platforms.facebook || { followers: 0, impressions: 0 };
  const ig = platforms.instagram || { followers: 0, reach: 0 };

  return (
    <div>
      <RptControls theme={theme}>
        <RptSelect theme={theme} value={period} onChange={setPeriod} options={RPT_PERIODS} ariaLabel="Period" />
        <RptSelect theme={theme} value={clientId} onChange={setClient} options={clientOptions} ariaLabel="Client" />
        <span style={{ fontSize: 12, color: theme.inkMuted }}>{win.label}</span>
      </RptControls>

      {error ? <div style={{ fontSize: 12, color: '#C6483C', marginBottom: 10 }}>{error}</div> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <RptStat theme={theme} label="Facebook followers" value={fb.followers.toLocaleString()} />
        <RptStat theme={theme} label="Facebook reached" value={fb.impressions.toLocaleString()} />
        <RptStat theme={theme} label="Instagram followers" value={ig.followers.toLocaleString()} />
        <RptStat theme={theme} label="Instagram reach" value={ig.reach.toLocaleString()} />
      </div>

      <RptTable
        theme={theme}
        columns={[
          { key: 'client', label: 'Client', render: function (r) { return nameOf(r.clientId); } },
          { key: 'platform', label: 'Platform', render: function (r) { return r.platform === 'facebook' ? 'Facebook' : 'Instagram'; } },
          { key: 'followers', label: 'Followers', align: 'right', render: function (r) { return r.followers.toLocaleString(); } },
          { key: 'growth', label: 'Change', align: 'right', render: function (r) { return r.growth > 0 ? '+' + r.growth : String(r.growth); } },
          { key: 'reached', label: 'Reached', align: 'right', render: function (r) { return (r.platform === 'facebook' ? r.impressions : r.reach).toLocaleString(); } },
          { key: 'engaged', label: 'Engaged', align: 'right', render: function (r) { return r.engaged.toLocaleString(); } },
        ]}
        rows={pairRows}
        empty={data ? 'Nothing in this window.' : 'Loading...'}
      />

      <p style={{ fontSize: 11, color: theme.inkMuted, marginTop: 12, lineHeight: 1.6 }}>
        Followers is the count on the last day of the window, and Change is the difference from
        the first - a follower count is a level, not something to add up day by day.
      </p>
    </div>
  );
}

Object.assign(window, {
  LeadsSection, AdsSection, WebSection, SocialSection,
  RPT_PERIODS, rptWindow, LEAD_SOURCES, AD_PLATFORMS,
  RptStat, RptTable, RptNotConnected, RptSyncNote, RptSelect,
});
