// ca-scorecard.jsx — My Scorecard with 3 viz options

// Calendar quarters for a year → { key, label, start, end }. Bobby 2026-07-07:
// the Scorecard can now be viewed per quarter (Q1–Q4), so each quarter's score
// and bonus can be analyzed on its own — not just the one configured quarter.
function CABT_quartersOfYear(year) {
  return [
    { key: `${year}-Q1`, label: `Q1 ${year}`, start: `${year}-01-01`, end: `${year}-03-31` },
    { key: `${year}-Q2`, label: `Q2 ${year}`, start: `${year}-04-01`, end: `${year}-06-30` },
    { key: `${year}-Q3`, label: `Q3 ${year}`, start: `${year}-07-01`, end: `${year}-09-30` },
    { key: `${year}-Q4`, label: `Q4 ${year}`, start: `${year}-10-01`, end: `${year}-12-31` },
  ];
}
function CABT_quarterStatus(start, end, today = new Date()) {
  if (today < new Date(start)) return 'future';
  if (today > new Date(end + 'T23:59:59')) return 'past';
  return 'current';
}

function CAScorecard({ state, ca, theme, viz = 'rings' }) {
  const cfg = (state && state.config) || {};
  const cfgStart = cfg.quarterStart || cfg.quarter_start || '';
  const parsedYr = new Date(cfgStart || new Date()).getFullYear();
  const year = Number.isFinite(parsedYr) ? parsedYr : new Date().getFullYear();
  const quarters = CABT_quartersOfYear(year);
  // Default to the quarter matching the configured window, else the current one.
  const defaultQ =
    quarters.find(q => q.start === cfgStart) ||
    quarters.find(q => CABT_quarterStatus(q.start, q.end) === 'current') ||
    quarters[quarters.length - 1];
  const [selKey, setSelKey] = React.useState(defaultQ.key);
  const selected = quarters.find(q => q.key === selKey) || defaultQ;
  const selStatus = CABT_quarterStatus(selected.start, selected.end);

  // Recompute the scorecard for the SELECTED quarter by cloning state with an
  // overridden window. This never touches the global config, so it's a local
  // view only (mirrors the Annual Bonus screen's per-quarter pattern). The
  // bonus pot auto-re-selects for the chosen quarter inside caScorecard.
  const score = CABT_caScorecard(ca, { ...state, config: { ...cfg, quarterStart: selected.start, quarterEnd: selected.end } });
  const status = CABT_scoreToStatus(score.composite);

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Quarter selector — view any quarter's score & bonus on its own */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {quarters.map((q, i) => {
          const st = CABT_quarterStatus(q.start, q.end);
          const isSel = q.key === selKey;
          const disabled = st === 'future';
          return (
            <button key={q.key} disabled={disabled} onClick={() => setSelKey(q.key)} style={{
              padding: '7px 13px', fontSize: 13, fontWeight: 700, borderRadius: 999,
              fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
              background: isSel ? theme.ink : theme.surface,
              color: isSel ? (theme.accentInk || '#fff') : theme.ink,
              border: `1px solid ${isSel ? theme.ink : theme.rule}`,
              opacity: disabled ? 0.4 : 1,
            }}>
              {`Q${i + 1}`}{st === 'current' ? ' · live' : ''}
            </button>
          );
        })}
      </div>

      {/* Hero numbers */}
      <Card theme={theme} padding={20}>
        <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>{selected.label} · {selStatus === 'current' ? 'Projected payout' : 'Payout'}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <div style={{ fontFamily: theme.serif, fontSize: 44, fontWeight: 600, color: theme.ink, letterSpacing: -1, lineHeight: 1 }}>
            {CABT_fmtMoney(score.finalPayout)}
          </div>
          <div style={{ fontSize: 14, color: theme.inkMuted }}>of {CABT_fmtMoney(score.maxPayout)} max</div>
        </div>
        <div style={{ marginTop: 12, height: 8, background: theme.rule, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${score.maxPayout > 0 ? Math.min(100, score.finalPayout / score.maxPayout * 100) : 0}%`,
            height: '100%', background: STATUS[status],
            transition: 'width .5s',
          }}/>
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <StatusPill status={status} size="lg" />
          <span style={{ fontSize: 13, color: theme.inkSoft }}>Composite {(score.composite*100).toFixed(0)}/100</span>
        </div>
      </Card>

      {/* Book Data Completeness — explicit per brief */}
      <Card theme={theme}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink }}>Book data completeness</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: score.bookCompleteness < 0.8 ? STATUS.yellow : STATUS.green }}>
            {CABT_fmtPct(score.bookCompleteness)}
          </div>
        </div>
        <div style={{ height: 6, background: theme.rule, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ width: `${score.bookCompleteness*100}%`, height: '100%', background: score.bookCompleteness < 0.8 ? STATUS.yellow : STATUS.green }}/>
        </div>
        <div style={{ fontSize: 12, color: theme.inkMuted, lineHeight: 1.4 }}>
          Months of data logged ÷ months expected this quarter. If below 100%, your <strong style={{ color: theme.ink }}>Performance bucket is reduced proportionally</strong> — already factored into the Composite above. (This is <em>not</em> the same as Composite — Composite is the overall scorecard, Book completeness is just the data-coverage gate.)
        </div>
      </Card>

      {/* Visualization */}
      {viz === 'rings'   && <RingsViz   score={score} theme={theme} />}
      {viz === 'bars'    && <BarsViz    score={score} theme={theme} />}
      {viz === 'compose' && <ComposeViz score={score} theme={theme} />}

      {/* Bucket breakdown — always shown below */}
      <BucketBreakdown score={score} state={state} theme={theme} />
    </div>
  );
}

function RingsViz({ score, theme }) {
  const buckets = [
    { key: 'performance', label: 'Performance', value: score.performance, hint: 'Revenue · Ad · Funnel' },
    { key: 'retention',   label: 'Retention',   value: score.retention,   hint: 'Attrition · Satisfaction' },
    { key: 'growth',      label: 'Growth',      value: score.growth,      hint: 'Trajectory · Events' },
  ];
  return (
    <Card theme={theme}>
      <SectionLabel theme={theme}>Buckets</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {buckets.map(b => {
          const s = CABT_scoreToStatus(b.value);
          return (
            <div key={b.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0' }}>
              <ScoreRing value={b.value} size={72} stroke={6} color={STATUS[s]} bg={theme.rule}
                label={<div style={{ fontSize: 17, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>{(b.value*100).toFixed(0)}</div>}/>
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.ink, textAlign: 'center' }}>{b.label}</div>
              <div style={{ fontSize: 10, color: theme.inkMuted, textAlign: 'center', lineHeight: 1.3 }}>{b.hint}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BarsViz({ score, theme }) {
  const buckets = [
    { key: 'performance', label: 'Performance', value: score.performance },
    { key: 'retention',   label: 'Retention',   value: score.retention },
    { key: 'growth',      label: 'Growth',      value: score.growth },
  ];
  return (
    <Card theme={theme}>
      <SectionLabel theme={theme}>Buckets</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {buckets.map(b => {
          const s = CABT_scoreToStatus(b.value);
          return (
            <div key={b.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.ink }}>{b.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: STATUS[s], fontVariantNumeric: 'tabular-nums' }}>{(b.value*100).toFixed(0)}</span>
              </div>
              <div style={{ position: 'relative', height: 14, background: theme.rule, borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: '60%', top: 0, bottom: 0, width: 1, background: theme.inkMuted, opacity: 0.3 }}/>
                <div style={{ position: 'absolute', left: '80%', top: 0, bottom: 0, width: 1, background: theme.inkMuted, opacity: 0.3 }}/>
                <div style={{ width: `${b.value*100}%`, height: '100%', background: STATUS[s], transition: 'width .4s' }}/>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ComposeViz({ score, theme }) {
  const status = CABT_scoreToStatus(score.composite);
  return (
    <Card theme={theme}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '8px 0' }}>
        <ScoreRing value={score.composite} size={120} stroke={10} color={STATUS[status]} bg={theme.rule}
          label={
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{(score.composite*100).toFixed(0)}</div>
              <div style={{ fontSize: 10, color: theme.inkMuted, letterSpacing: 0.5, marginTop: 2 }}>OF 100</div>
            </div>
          }
        />
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>
          {[
            ['Performance', score.performance],
            ['Retention',   score.retention],
            ['Growth',      score.growth],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${theme.rule}` }}>
              <span style={{ color: theme.inkSoft }}>{k}</span>
              <span style={{ fontWeight: 700, color: STATUS[CABT_scoreToStatus(v)], fontVariantNumeric: 'tabular-nums' }}>{(v*100).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// What each sub-score actually measures + the typical reason it's red.
// Keyed by the sub-score key in the BucketBreakdown groups below.
const RED_REASONS = {
  revenue:      { what: 'Avg client MRR vs contracted retainer.',
                  why:  'Average MRR across recent months is below the retainer those clients signed. Confirm billing is correct and check for clients consistently underpaying.' },
  adEfficiency: { what: 'Ad spend vs target (10% of gross revenue).',
                  why:  'Ad spend is far from the 10% target band. Pull back if over-spending, ramp up if under-target.' },
  funnel:       { what: 'Booking, show, and close rates vs floors (30% / 50% / 70%).',
                  why:  'One or more funnel rates are below floor. Tap each client and find the worst stage — usually show rate or close rate.' },
  attrition:    { what: 'Monthly student cancel rate.',
                  why:  'Cancellation rate is above the 3% green floor. Survey churning students for the reason and tighten retention follow-ups.' },
  satisfaction: { what: 'Recent survey responses (6 month lookback).',
                  why:  'Either no surveys logged in 6 months OR average rating is low. Schedule client check-ins and capture surveys.' },
  growth:       { what: 'Client MRR trajectory + add-ons / gear / referrals.',
                  why:  'Clients aren\'t growing. Look for upsell, membership add-on, or gear opportunities; capture referrals as Growth Events.' },
  mrrGrowth:    { what: 'Quarter-over-quarter MRR growth per client (target $750/mo).',
                  why:  'Clients are flat or shrinking. Push for upsells, gear, or membership add-ons.' },
  leadCost:     { what: 'Cost per lead, last month (best ≤$5, OK ≤$20).',
                  why:  'Cost per lead is above $20. Check ad targeting, creative fatigue, or audience saturation.' },
  adSpend:      { what: 'Ad spend vs target (max of $1000 floor, 10% of MRR).',
                  why:  'Ad spend is below target. Schedule a spend ramp with the client.' },
};

function BucketBreakdown({ score, state, theme }) {
  const [expanded, setExpanded] = React.useState({ performance: true, retention: false, growth: false });
  const [whyOpen, setWhyOpen] = React.useState({}); // keyed by sub-score key
  // Aggregate sub-scores across CA's clients (skip clients with no data, per spec).
  // 2026-05-04 update: breakdown now shows the 5 spec Performance sub-scores
  // (MRR Growth, Lead Cost, Ad Spend, Funnel, Attrition) instead of the old
  // 3 (Revenue, Ad efficiency, Funnel). Retention shows the real retention
  // rate; Growth shows points earned vs max.
  const subs = score.clients.map(c => c.sub).filter(s => s != null);
  const totalClients = subs.length;
  // For each sub-score: average across clients-with-data, plus the count
  // of clients that contributed (so the breakdown surfaces "this 86% is
  // from only 1 of 55 clients" — Bobby's transparency request).
  const avgWithCount = (key) => {
    const vals = subs.map(s => s[key]).filter(v => v != null && Number.isFinite(v));
    return {
      raw: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      count: vals.length,
    };
  };
  // Gated value applies bookCompleteness like the Performance bucket does.
  // This way the per-sub-score number reflects what actually contributes
  // to the bucket, not just "average of those who reported."
  const gate = score.bookCompleteness != null && Number.isFinite(score.bookCompleteness)
    ? score.bookCompleteness : 0;
  const sub = (key, label) => {
    const r = avgWithCount(key);
    return [key, label, r.raw * gate, { raw: r.raw, count: r.count, total: totalClients, gated: true }];
  };
  const groups = [
    { key: 'performance', label: 'Performance', total: score.performance, items: [
      sub('mrrGrowth', 'MRR Growth'),
      sub('leadCost',  'Lead Cost'),
      sub('adSpend',   'Ad Spend'),
      sub('funnel',    'Funnel'),
      sub('attrition', 'Attrition'),
    ]},
    { key: 'retention', label: 'Retention', total: score.retention, items: [
      ['retention',  'Retention rate', score.retention,
        { raw: score.retention, count: score.eligibleAtQuarterStart || 0,
          total: score.eligibleAtQuarterStart || 0, gated: false,
          note: score.cancelledThisQuarter != null
            ? `${score.cancelledThisQuarter} of ${score.eligibleAtQuarterStart || 0} cancelled this quarter`
            : null }],
    ]},
    { key: 'growth', label: 'Growth', total: score.growth, items: [
      ['growth',     'Growth points', score.growth,
        { raw: score.growth, count: score.growthEligibleCount || 0,
          total: score.growthEligibleCount || 0, gated: false,
          note: 'Points earned ÷ (8 × eligible 90+day clients)' }],
    ]},
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map(g => {
        const isOpen = expanded[g.key];
        const s = CABT_scoreToStatus(g.total);
        return (
          <Card key={g.key} theme={theme} padding={0}>
            <button onClick={() => setExpanded(e => ({ ...e, [g.key]: !e[g.key] }))}
              style={{
                width: '100%', padding: '14px 16px', background: 'transparent', border: 'none',
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[s], flexShrink: 0 }}/>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: theme.ink, letterSpacing: -0.15 }}>{g.label}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: STATUS[s], fontVariantNumeric: 'tabular-nums' }}>{(g.total*100).toFixed(0)}</span>
              <Icon name={isOpen ? 'chev-u' : 'chev-d'} size={16} color={theme.inkMuted}/>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 14px' }}>
                {g.items.map(([k, label, val, meta]) => {
                  const ss = CABT_scoreToStatus(val);
                  const m = meta || {};
                  return (
                    <div key={k} style={{ padding: '10px 0', borderTop: `1px solid ${theme.rule}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: theme.inkSoft }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: STATUS[ss], fontVariantNumeric: 'tabular-nums' }}>{(val*100).toFixed(0)}</span>
                      </div>
                      <div style={{ height: 4, background: theme.rule, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${val*100}%`, height: '100%', background: STATUS[ss] }}/>
                      </div>
                      {/* Data coverage signal — Bobby's "transparency" request:
                          show that an 86 sub-score from 1/55 clients is not the same as
                          86 from 55/55 clients. Inline under the bar.
                          When count = 0 (nobody has data for this sub-score), render
                          "—" instead of "raw 0" so it's clear that's "no data" not
                          "everyone scored zero" (Bobby 2026-05-04). */}
                      {m.gated && m.total > 0 && m.count === 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: theme.inkMuted, lineHeight: 1.4 }}>
                          No data yet — <strong style={{ color: theme.ink }}>0</strong> of <strong style={{ color: theme.ink }}>{m.total}</strong> clients with data this quarter · sub-score skipped, not penalized.
                        </div>
                      )}
                      {m.gated && m.total > 0 && m.count > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: theme.inkMuted, lineHeight: 1.4 }}>
                          Raw avg <strong style={{ color: theme.ink }}>{(m.raw*100).toFixed(0)}</strong> from <strong style={{ color: theme.ink }}>{m.count}</strong> of <strong style={{ color: theme.ink }}>{m.total}</strong> clients with data · gated by {(gate*100).toFixed(1)}% book completeness → {(val*100).toFixed(0)}
                        </div>
                      )}
                      {!m.gated && m.note && (
                        <div style={{ marginTop: 6, fontSize: 11, color: theme.inkMuted, lineHeight: 1.4 }}>
                          {m.note}
                        </div>
                      )}
                      {ss === 'red' && (() => {
                        const isWhyOpen = !!whyOpen[k];
                        const info = RED_REASONS[k];
                        return (
                          <>
                            <button
                              onClick={() => setWhyOpen(o => ({ ...o, [k]: !o[k] }))}
                              style={{
                                marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer',
                                color: STATUS.red, fontSize: 11, fontWeight: 600, padding: 0,
                                textDecoration: 'underline', fontFamily: 'inherit',
                              }}>
                              {isWhyOpen ? 'Hide explanation' : 'Why is this red?'}
                            </button>
                            {isWhyOpen && info && (
                              <div style={{
                                marginTop: 8, padding: '10px 12px',
                                background: STATUS.red + '14',
                                border: `1px solid ${STATUS.red}33`,
                                borderRadius: 8, fontSize: 12, color: theme.ink, lineHeight: 1.5,
                              }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: STATUS.red, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                                  What this measures
                                </div>
                                <div style={{ marginBottom: 6 }}>{info.what}</div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: STATUS.red, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                                  Why it's red
                                </div>
                                <div>{info.why}</div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

Object.assign(window, { CAScorecard, RingsViz, BarsViz, ComposeViz, BucketBreakdown });
