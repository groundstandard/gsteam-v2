// admin-extra.jsx — extended Admin screens for v0.2 scope
//   • Annual Bonus    — quarterly composites → annual payout per CA
//   • Revenue Ledger  — month×client retainer + add-on revenue ledger
//   • Client Rollup   — book-wide client list with sub-scores; tap → Per-Client Calc
//   • Per-Client Calc — exact inputs feeding each sub-score for one client
//   • Open Questions  — open product/policy questions for leadership

// ── Sparkline — tiny inline trend chart (TKT-12.3 MRR Trend column) ──────
function Sparkline({ values, theme, width = 80, height = 22, stroke = 1.5 }) {
  if (!values || values.length < 2) {
    return <span style={{ color: theme.inkMuted, fontSize: 11 }}>—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = (width - 4) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = 2 + i * stepX;
    const y = 2 + (height - 4) * (1 - (v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = values[values.length - 1];
  const first = values[0];
  const trendColor = last > first ? '#43A047' : last < first ? '#E53935' : theme.inkMuted;
  return (
    <svg width={width} height={height} style={{ verticalAlign: 'middle' }}>
      <polyline
        fill="none" stroke={trendColor} strokeWidth={stroke}
        strokeLinecap="round" strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function quartersOfYear(year) {
  return [
    { key: `${year}-Q1`, label: `Q1 ${year}`, start: `${year}-01-01`, end: `${year}-03-31` },
    { key: `${year}-Q2`, label: `Q2 ${year}`, start: `${year}-04-01`, end: `${year}-06-30` },
    { key: `${year}-Q3`, label: `Q3 ${year}`, start: `${year}-07-01`, end: `${year}-09-30` },
    { key: `${year}-Q4`, label: `Q4 ${year}`, start: `${year}-10-01`, end: `${year}-12-31` },
  ];
}

// Classify a quarter against "today" so the bonus surface never shows numeric
// payouts for quarters that haven't happened yet (TICKET-1, 2026-04-30 brief).
function quarterStatus(qStart, qEnd, today = new Date()) {
  const start = new Date(qStart + 'T00:00:00');
  const end = new Date(qEnd + 'T23:59:59');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'current';
  if (today < start) return 'future';
  if (today > end) return 'past';
  return 'current';
}

// Per-quarter composite for a CA. Calls the real scoring engine for the
// quarter window and uses the MRR-weighted pot from quarter_inputs.
// 2026-05-04: removed the demo "wobble" that varied composites by ±8pts
// and the hardcoded $7,500 payout cap. Numbers now reflect reality.
function caQuarterComposite(ca, state, qStart, qEnd, status) {
  if (status === 'future') return { composite: null, payout: null, status };
  const qConfig = { ...state.config, quarterStart: qStart, quarterEnd: qEnd };
  const score = CABT_caScorecard(ca, { ...state, config: qConfig });
  return {
    composite: score.composite || 0,
    payout: score.finalPayout || 0,
    status,
  };
}

// Per-quarter pot inputs (agency_gross_last_month + pot_pct). Owner enters
// these at quarter close so the bonus pot reflects real revenue, not a
// hardcoded cap. Module-scope for stable input focus.
function QuarterInputsCard({ theme, state, qs }) {
  const currentQ = qs.find(q => q.status === 'current') || qs[0];
  const allQI = state.allQuarterInputs || [];
  const existing = allQI.find(q => q.quarterStart === currentQ.start);
  const [editing, setEditing] = React.useState(false);
  const [agencyGross, setAgencyGross] = React.useState(existing ? String(existing.agencyGrossLastMonth) : '');
  const [potPct, setPotPct] = React.useState(existing ? String(existing.potPct) : '0.005');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    setAgencyGross(existing ? String(existing.agencyGrossLastMonth) : '');
    setPotPct(existing ? String(existing.potPct) : '0.005');
  }, [currentQ.start, existing && existing.agencyGrossLastMonth, existing && existing.potPct]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const sb = await CABT_sb();
      const { error } = await sb.from('quarter_inputs').upsert({
        quarter_start: currentQ.start,
        agency_gross_last_month: Number(agencyGross) || 0,
        pot_pct: Number(potPct) || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'quarter_start' });
      if (error) throw error;
      setEditing(false);
    } catch (e) {
      setErr(e?.message || 'Save failed');
    }
    setBusy(false);
  };

  const totalPot = (Number(agencyGross) || 0) * (Number(potPct) || 0);

  return (
    <Card theme={theme} padding={14}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <SectionLabel theme={theme}>Quarter inputs · {currentQ.label}</SectionLabel>
          {!editing && (
            <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2 }}>
              {existing
                ? <>Total pot: <strong style={{ color: theme.ink }}>{CABT_fmtMoney(totalPot)}</strong> ({CABT_fmtMoney(Number(agencyGross))} × {(Number(potPct)*100).toFixed(2)}%)</>
                : <span style={{ color: '#dc3c3c' }}>Not set yet — payouts display $0 until you set this.</span>}
            </div>
          )}
        </div>
        {!editing && (
          <Button theme={theme} variant="secondary" size="sm" onClick={() => setEditing(true)}>
            {existing ? 'Edit' : 'Set'}
          </Button>
        )}
      </div>
      {editing && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Agency gross — last month of previous quarter" hint="Total agency gross revenue from the last month of the quarter before this one." theme={theme}>
            <Input type="number" inputmode="decimal" prefix="$" value={agencyGross} onChange={setAgencyGross} placeholder="e.g. 100000" theme={theme}/>
          </Field>
          <Field label="Pot percentage" hint="Fraction of agency gross that becomes the bonus pot. 0.005 = 0.5%." theme={theme}>
            <Input type="number" inputmode="decimal" value={potPct} onChange={setPotPct} placeholder="0.005" theme={theme}/>
          </Field>
          <div style={{ fontSize: 12, color: theme.inkMuted }}>
            Total pot preview: <strong style={{ color: theme.ink }}>{CABT_fmtMoney(totalPot)}</strong>
          </div>
          {err && <div style={{ color: '#dc3c3c', fontSize: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button theme={theme} variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
            <Button theme={theme} variant="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Annual Bonus ───────────────────────────────────────────────────────────
function AdminAnnualBonus({ state, theme }) {
  const today = new Date();
  // Config from Supabase may be empty {} or use snake_case keys; fall back to today's year.
  const cfgYear = new Date(state.config?.quarterStart || state.config?.quarter_start || '').getFullYear();
  const year = Number.isFinite(cfgYear) ? cfgYear : today.getFullYear();
  const qs = quartersOfYear(year).map(q => ({ ...q, status: quarterStatus(q.start, q.end, today) }));

  // Viewport-aware layout: desktop = table, mobile = card grid.
  const [vw, setVw] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  const isDesktop = vw >= 900;
  const cas = state.cas.filter(c => c.active);

  const rows = cas.map(ca => {
    const qScores = qs.map(q => caQuarterComposite(ca, state, q.start, q.end, q.status));
    const realized = qScores.filter(q => q.payout !== null);
    const annualPayout = realized.reduce((s, q) => s + q.payout, 0);
    const avgComposite = realized.length
      ? realized.reduce((s, q) => s + q.composite, 0) / realized.length
      : 0;
    return { ca, qScores, annualPayout, avgComposite };
  });

  const totalAnnual = rows.reduce((s, r) => s + r.annualPayout, 0);
  const avgComposite = rows.reduce((s, r) => s + r.avgComposite, 0) / Math.max(rows.length, 1);
  const hasFuture = qs.some(q => q.status === 'future');

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card theme={theme} padding={18}>
        <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>FY {year} · Bonus pool</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <div style={{ fontFamily: theme.serif, fontSize: 36, fontWeight: 600, color: theme.ink, letterSpacing: -0.7, lineHeight: 1 }}>
            {CABT_fmtMoney(totalAnnual)}
          </div>
          <div style={{ fontSize: 13, color: theme.inkMuted }}>across {cas.length} CAs</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: theme.inkSoft }}>
          Avg composite <strong style={{ color: theme.ink }}>{(avgComposite*100).toFixed(0)}/100</strong>
          {hasFuture && <span style={{ marginLeft: 8, color: theme.inkMuted }}>· future quarters excluded until they begin</span>}
        </div>
      </Card>

      <QuarterInputsCard theme={theme} state={state} qs={qs} />


      {isDesktop ? (
        // ── Desktop: table layout (Bobby's preference) ───────────────────
        <Card theme={theme} padding={0}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr) 1.1fr', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${theme.rule}`, fontSize: 10, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            <div>CA</div>
            {qs.map(q => (
              <div key={q.key} style={{ textAlign: 'center', color: q.status === 'current' ? theme.ink : theme.inkMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>{q.label.split(' ')[0]}</span>
                {q.status === 'current' && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: theme.bg || '#0B0E14', background: theme.accent || '#D7FF3D', padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 }}>LIVE</span>
                )}
              </div>
            ))}
            <div style={{ textAlign: 'right' }}>FY total</div>
          </div>
          {rows.map((r, i) => (
            <div key={r.ca.id} style={{
              display: 'grid', gridTemplateColumns: '1.5fr repeat(4, 1fr) 1.1fr',
              alignItems: 'center', padding: '14px 16px',
              borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${theme.rule}`,
              fontSize: 13, minHeight: 60,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ca.name}</div>
                <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 2 }}>{r.ca.id}</div>
              </div>
              {r.qScores.map((q, qi) => {
                if (q.status === 'future') {
                  return (
                    <div key={qi} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }} title="Not yet available — quarter has not started">
                      <div style={{ fontSize: 18, fontWeight: 500, color: theme.inkMuted, lineHeight: 1, opacity: 0.4 }}>—</div>
                    </div>
                  );
                }
                const s = CABT_scoreToStatus(q.composite);
                const isCurrent = q.status === 'current';
                return (
                  <div key={qi} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }} title={isCurrent ? 'Pace-to-date — quarter still in progress' : undefined}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: STATUS[s], fontVariantNumeric: 'tabular-nums', lineHeight: 1, fontStyle: isCurrent ? 'italic' : 'normal' }}>
                      {(q.composite*100).toFixed(0)}
                    </div>
                    <div style={{ fontSize: 10, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums', fontStyle: isCurrent ? 'italic' : 'normal', whiteSpace: 'nowrap' }}>
                      {CABT_fmtMoney(q.payout)}{isCurrent ? ' pace' : ''}
                    </div>
                  </div>
                );
              })}
              <div style={{ textAlign: 'right', fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>
                {CABT_fmtMoney(r.annualPayout)}
              </div>
            </div>
          ))}
        </Card>
      ) : (
        // ── Mobile: per-CA card layout ───────────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {rows.map(r => (
            <Card key={r.ca.id} theme={theme} padding={16}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, color: theme.ink, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ca.name}</div>
                  <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.3, marginTop: 2 }}>{r.ca.id}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: theme.inkMuted, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>FY total</div>
                  <div style={{ fontFamily: theme.serif, fontSize: 22, fontWeight: 600, color: theme.ink, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4, lineHeight: 1, marginTop: 2 }}>
                    {CABT_fmtMoney(r.annualPayout)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {r.qScores.map((q, qi) => {
                  const qLabel = qs[qi].label.split(' ')[0];
                  if (q.status === 'future') {
                    return (
                      <div key={qi} style={{
                        borderRadius: 8, padding: '10px 4px', textAlign: 'center',
                        background: theme.bgSoft || 'rgba(255,255,255,0.03)',
                        border: `1px dashed ${theme.rule}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 64,
                      }} title="Not yet available — quarter has not started">
                        <div style={{ fontSize: 9, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5 }}>{qLabel}</div>
                        <div style={{ fontSize: 18, color: theme.inkMuted, opacity: 0.4, lineHeight: 1 }}>—</div>
                      </div>
                    );
                  }
                  const s = CABT_scoreToStatus(q.composite);
                  const isCurrent = q.status === 'current';
                  return (
                    <div key={qi} style={{
                      borderRadius: 8, padding: '10px 4px', textAlign: 'center',
                      background: isCurrent ? (theme.accentSoft || 'rgba(215,255,61,0.08)') : (theme.bgSoft || 'rgba(255,255,255,0.03)'),
                      border: isCurrent ? `1px solid ${theme.accent || '#D7FF3D'}` : `1px solid ${theme.rule}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 64,
                    }} title={isCurrent ? 'Pace-to-date — quarter still in progress' : undefined}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5 }}>{qLabel}</span>
                        {isCurrent && (
                          <span style={{ fontSize: 7, fontWeight: 800, color: theme.bg || '#0B0E14', background: theme.accent || '#D7FF3D', padding: '1px 4px', borderRadius: 2, letterSpacing: 0.5 }}>LIVE</span>
                        )}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: STATUS[s], fontVariantNumeric: 'tabular-nums', lineHeight: 1, fontStyle: isCurrent ? 'italic' : 'normal' }}>
                        {(q.composite*100).toFixed(0)}
                      </div>
                      <div style={{ fontSize: 9, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums', fontStyle: isCurrent ? 'italic' : 'normal', lineHeight: 1 }}>
                        {CABT_fmtMoney(q.payout)}{isCurrent ? ' pace' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: theme.inkMuted, padding: '0 4px', lineHeight: 1.5 }}>
        Quarterly payout = (CA's eligible-MRR ÷ all eligible-MRR) × Total Pot × Composite. Total Pot = previous quarter's last month agency gross × pot %, set in Admin → Quarter Inputs. Past quarters show actual; current quarter shows pace-to-date (italic); future quarters render "—" until they begin.
      </div>
    </div>
  );
}

// ── Revenue Ledger ─────────────────────────────────────────────────────────
function AdminRevenueLedger({ state, theme }) {
  // Build month list from existing metrics
  const months = Array.from(new Set(state.monthlyMetrics.map(m => m.month))).sort();
  const visible = months.slice(-4); // last 4 months for mobile width
  const [filter, setFilter] = React.useState('all'); // all | membership | core

  let clients = state.clients.filter(c => !c.cancelDate);
  if (filter === 'membership') clients = clients.filter(c => c.hasMembershipAddon);
  if (filter === 'core')       clients = clients.filter(c => !c.hasMembershipAddon);

  // Bobby 2026-05-07: MRR is now a smoothed trailing-3-month average — using
  // clientMRR here would understate actual booked revenue ($30k gross month
  // would render as the smoothed value, not the booked amount). Revenue
  // Ledger summarises actual revenue collected, so we read gross directly
  // and only fall back to clientMRR for legacy rows where they were equal.
  const cellFor = (clientId, month) => {
    const m = state.monthlyMetrics.find(mm => mm.clientId === clientId && mm.month === month);
    if (!m) return null;
    const raw = m.clientGrossRevenue != null && m.clientGrossRevenue !== ''
      ? m.clientGrossRevenue
      : m.clientMRR;
    // Supabase serialises numeric columns as STRINGS, so the totals reduce
    // below (`s + cellFor()`) was string-concatenating, not adding —
    // "12815" + "112" → "12815112". Coerce to a real number here.
    // (Bobby 2026-06-19 Loom: "monthly recurring revenue is 12,815,112…
    // none of those numbers are accurate.")
    return raw == null || raw === '' ? null : (Number(raw) || 0);
  };

  // Totals
  const totals = visible.map(m =>
    clients.reduce((s, c) => s + (cellFor(c.id, m) || 0), 0)
  );
  const grand = totals.reduce((s, n) => s + n, 0);
  const membershipRev = clients
    .filter(c => c.hasMembershipAddon)
    .reduce((s, c) => s + c.monthlyRetainer * state.config.membershipRevenueRate * visible.length, 0);

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <KPI theme={theme} label={`Booked · last ${visible.length}mo`} value={CABT_fmtMoney(grand)} />
        <KPI theme={theme} label="Add-on revenue" value={CABT_fmtMoney(membershipRev)} />
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { v: 'all',        label: 'All',        n: state.clients.filter(c => !c.cancelDate).length },
          { v: 'membership', label: 'Membership', n: state.clients.filter(c => !c.cancelDate && c.hasMembershipAddon).length },
          { v: 'core',       label: 'Core only',  n: state.clients.filter(c => !c.cancelDate && !c.hasMembershipAddon).length },
        ].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)} style={{
            padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
            background: filter === f.v ? theme.ink : theme.surface,
            color: filter === f.v ? theme.accentInk : theme.ink,
            border: `1px solid ${filter === f.v ? theme.ink : theme.rule}`,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {f.label} <span style={{ opacity: 0.65 }}>{f.n}</span>
          </button>
        ))}
      </div>

      <Card theme={theme} padding={0}>
        <div style={{ display: 'grid', gridTemplateColumns: `1.6fr repeat(${visible.length}, 1fr)`, padding: '10px 12px', borderBottom: `1px solid ${theme.rule}`, fontSize: 10, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          <div>Client</div>
          {visible.map(m => (
            <div key={m} style={{ textAlign: 'right' }}>
              {new Date(m + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
            </div>
          ))}
        </div>
        {clients.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: `1.6fr repeat(${visible.length}, 1fr)`,
            padding: '10px 12px',
            borderBottom: i === clients.length - 1 ? 'none' : `1px solid ${theme.rule}`,
            fontSize: 13, alignItems: 'center',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
                {c.hasMembershipAddon && <span style={{ fontSize: 9, padding: '1px 5px', background: theme.gold + '22', color: theme.gold, borderRadius: 4, fontWeight: 700, letterSpacing: 0.4 }}>M</span>}
              </div>
              <div style={{ fontSize: 11, color: theme.inkMuted }}>{c.id}</div>
            </div>
            {visible.map(m => {
              const v = cellFor(c.id, m);
              return (
                <div key={m} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: v == null ? theme.inkMuted : theme.ink, fontWeight: v == null ? 400 : 600 }}>
                  {v == null ? '—' : CABT_fmtMoney(v)}
                </div>
              );
            })}
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: `1.6fr repeat(${visible.length}, 1fr)`, padding: '12px', background: theme.bgElev, borderTop: `1px solid ${theme.rule}`, fontSize: 13, fontWeight: 700, color: theme.ink }}>
          <div>Total</div>
          {totals.map((t, i) => (
            <div key={i} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {CABT_fmtMoney(t)}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ fontSize: 12, color: theme.inkMuted, padding: '0 4px', lineHeight: 1.5 }}>
        Reflects the Sheet's <em>Revenue Ledger</em> tab — Client MRR by month, with membership add-on flag. Add-on revenue computed at <strong style={{ color: theme.ink }}>{(state.config.membershipRevenueRate*100).toFixed(0)}%</strong> revenue share per Config.
      </div>
    </div>
  );
}

// ── Client Rollup (admin-wide) ──────────────────────────────────────────────
function AdminClientRollup({ state, theme, navigate }) {
  const [sort, setSort] = React.useState('status'); // status | name | mrr | tenure
  const [search, setSearch] = React.useState('');

  const pendingClients = (state.pendingClients || []).filter(p => p.status === 'pending');

  const enriched = state.clients
    .filter(c => !c.cancelDate)
    .map(c => {
      const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, state.config);
      const status = CABT_scoreToStatus(sub.composite);
      const ca = state.cas.find(x => x.id === c.assignedCA);
      const tenure = (new Date() - new Date(c.signDate)) / (1000 * 60 * 60 * 24 * 30);
      return { client: c, sub, status, ca, tenure };
    })
    .filter(e => !search || e.client.name.toLowerCase().includes(search.toLowerCase()) || e.client.id.toLowerCase().includes(search.toLowerCase()));

  const sortKey = { red: 0, yellow: 1, gray: 2, green: 3 };
  const sorted = [...enriched].sort((a, b) => {
    if (sort === 'status') return sortKey[a.status] - sortKey[b.status];
    if (sort === 'name')   return a.client.name.localeCompare(b.client.name);
    if (sort === 'mrr')    return b.client.monthlyRetainer - a.client.monthlyRetainer;
    if (sort === 'tenure') return b.tenure - a.tenure;
    return 0;
  });

  const buckets = { green: 0, yellow: 0, red: 0, gray: 0 };
  enriched.forEach(e => buckets[e.status]++);

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
        {[
          ['green',  buckets.green,  'On track'],
          ['yellow', buckets.yellow, 'Watch'],
          ['red',    buckets.red,    'At risk'],
          ['gray',   buckets.gray,   'No data'],
        ].map(([k, n, label]) => (
          <div key={k} style={{
            background: theme.surface, border: `1px solid ${theme.rule}`,
            borderRadius: theme.radius - 2, padding: '10px 8px', textAlign: 'center',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[k], margin: '0 auto 6px' }}/>
            <div style={{ fontSize: 20, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: 9, color: theme.inkMuted, letterSpacing: 0.3, marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button theme={theme} variant="primary" icon="plus" fullWidth onClick={() => navigate('add-client')}>
          Add client
        </Button>
        {pendingClients.length > 0 && (
          <button onClick={() => navigate('pending-clients')} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: theme.radius - 4,
            background: STATUS.yellow + '18', border: `1px solid ${STATUS.yellow}55`,
            color: '#8C5A00', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <Icon name="alert" size={14}/>
            {pendingClients.length} from Stripe
          </button>
        )}
      </div>

      <Input theme={theme} value={search} onChange={setSearch} placeholder="Search client name or ID…" />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {[
          { v: 'status', label: 'By status' },
          { v: 'name',   label: 'A–Z' },
          { v: 'mrr',    label: 'MRR' },
          { v: 'tenure', label: 'Tenure' },
        ].map(s => (
          <button key={s.v} onClick={() => setSort(s.v)} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
            background: sort === s.v ? theme.ink : 'transparent',
            color: sort === s.v ? theme.accentInk : theme.inkSoft,
            border: `1px solid ${sort === s.v ? theme.ink : theme.rule}`,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{s.label}</button>
        ))}
      </div>

      <Card theme={theme} padding={0}>
        {sorted.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>No clients match.</div>}
        {sorted.map((e, i) => (
          <button key={e.client.id} onClick={() => navigate('client-calc', { clientId: e.client.id })} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: 'transparent', border: 'none',
            padding: '12px 14px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: i === sorted.length - 1 ? 'none' : `1px solid ${theme.rule}`,
          }}>
            <span style={{ width: 4, alignSelf: 'stretch', background: STATUS[e.status], borderRadius: 2, flexShrink: 0 }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.client.name}</div>
              <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 2 }}>
                {e.ca?.name || 'Unassigned'} · {CABT_fmtMoney(e.client.monthlyRetainer)}/mo · {Math.round(e.tenure)}mo
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 700, color: STATUS[e.status], fontVariantNumeric: 'tabular-nums' }}>
              {e.sub.composite != null ? (e.sub.composite*100).toFixed(0) : '—'}
            </div>
            <Icon name="chev-r" size={14} color={theme.inkMuted}/>
          </button>
        ))}
      </Card>
    </div>
  );
}

// ── Per-Client Calc ─────────────────────────────────────────────────────────
// Per-contract commission rate editor (Bobby 2026-05-01 — Item 4).
// Module-scope so parent re-renders don't remount it (otherwise inputs lose
// focus mid-typing — same SectionCard pitfall we fixed in TICKET-3 polish).
function RatesCard({ theme, clientId, initial, rep, onSave }) {
  const [up, setUp] = React.useState(initial.upfrontPct);
  const [mid, setMid] = React.useState(initial.midPct);
  const [end, setEnd] = React.useState(initial.endPct);
  const [busy, setBusy] = React.useState(false);
  // Reset draft when admin navigates to a different client
  React.useEffect(() => {
    setUp(initial.upfrontPct); setMid(initial.midPct); setEnd(initial.endPct);
  }, [clientId]);

  const num = (v) => v === '' ? null : Number(v);
  const dirty = num(up) !== (initial.upfrontPct === '' ? null : Number(initial.upfrontPct))
             || num(mid) !== (initial.midPct === '' ? null : Number(initial.midPct))
             || num(end) !== (initial.endPct === '' ? null : Number(initial.endPct));

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    await onSave({ upfrontPct: num(up), midPct: num(mid), endPct: num(end) });
    setBusy(false);
  };

  return (
    <Card theme={theme} padding={14}>
      <SectionLabel theme={theme}>Commission rates</SectionLabel>
      <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 10, lineHeight: 1.4 }}>
        {rep
          ? <>Inherited from <strong style={{ color: theme.ink }}>{rep.name}</strong>'s defaults at contract creation. Override here for this client only.</>
          : <>No Account Manager assigned; rates apply only if an AM is later linked.</>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Field label="Upfront %" theme={theme}>
          <Input type="number" inputmode="decimal" value={up} onChange={setUp} placeholder="0.10" theme={theme}/>
        </Field>
        <Field label="Mid %" theme={theme}>
          <Input type="number" inputmode="decimal" value={mid} onChange={setMid} placeholder="0.05" theme={theme}/>
        </Field>
        <Field label="End %" theme={theme}>
          <Input type="number" inputmode="decimal" value={end} onChange={setEnd} placeholder="0.05" theme={theme}/>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button theme={theme} variant="primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save rates'}
        </Button>
        {dirty && (
          <Button theme={theme} variant="secondary" disabled={busy}
                  onClick={() => { setUp(initial.upfrontPct); setMid(initial.midPct); setEnd(initial.endPct); }}>
            Reset
          </Button>
        )}
      </div>
    </Card>
  );
}

// Inline client-name editor (Kurt 2026-06-22: "give Bobby the ability to
// update client names"). Read-only display with a pencil; clicking reveals an
// input with Save/Cancel. Saves via the generic client updater (onSave →
// onSetRates(id, { name }, 'Name')). Admin/owner only — only rendered when an
// update handler is provided.
function ClientNameEditor({ theme, clientId, name, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name || '');
  // Reset the draft if the underlying client changes (realtime / navigation).
  React.useEffect(() => { setDraft(name || ''); setEditing(false); }, [clientId, name]);

  const cancel = () => { setDraft(name || ''); setEditing(false); };
  const save = () => {
    const v = draft.trim();
    if (!v || v === name) { cancel(); return; }
    onSave(v);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <div style={{ fontFamily: theme.serif, fontSize: 24, fontWeight: 600, color: theme.ink, letterSpacing: -0.4, lineHeight: 1.15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <button
          onClick={() => { setDraft(name || ''); setEditing(true); }}
          title="Edit client name"
          aria-label="Edit client name"
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
            background: theme.surface, border: `1px solid ${theme.rule}`, color: theme.inkMuted,
            fontSize: 13, fontFamily: 'inherit', lineHeight: 1,
          }}
        >✎</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
      <input
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
        style={{
          fontFamily: theme.serif, fontSize: 20, fontWeight: 600, color: theme.ink,
          background: theme.bg, border: `1px solid ${theme.rule}`, borderRadius: 8,
          padding: '5px 10px', minWidth: 220, maxWidth: '100%', outline: 'none',
        }}
      />
      <button onClick={save} style={{
        padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        background: theme.ink, color: theme.accentInk || '#fff', border: `1px solid ${theme.ink}`, borderRadius: 8,
      }}>Save</button>
      <button onClick={cancel} style={{
        padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        background: theme.surface, color: theme.ink, border: `1px solid ${theme.rule}`, borderRadius: 8,
      }}>Cancel</button>
    </div>
  );
}

function AdminClientCalc({ state, theme, clientId, navigate, onSetCadence, onSetRates }) {
  const c = state.clients.find(cl => cl.id === clientId);
  if (!c) return <div style={{ padding: 24 }}>Client not found.</div>;

  // Per-account quarter selector (Bobby 2026-07-07): view this account's
  // scores for any quarter on its own, or "cumulative" across the whole year.
  // Cumulative uses a full-year window so every sub-score aggregates across
  // all quarters. Local view only — never touches global config.
  const cfg = state.config || {};
  const cfgStart = cfg.quarterStart || cfg.quarter_start || '';
  const parsedYr = new Date(cfgStart || new Date()).getFullYear();
  const scYear = Number.isFinite(parsedYr) ? parsedYr : new Date().getFullYear();
  const scQuarters = CABT_quartersOfYear(scYear);
  const scCumulative = { key: `${scYear}-CUM`, label: `${scYear} cumulative`, start: `${scYear}-01-01`, end: `${scYear}-12-31` };
  const scOptions = [...scQuarters, scCumulative];
  const scDefault = scQuarters.find(q => q.start === cfgStart) || scCumulative;
  const [scSelKey, setScSelKey] = React.useState(scDefault.key);
  const scSelected = scOptions.find(o => o.key === scSelKey) || scDefault;

  const sub = CABT_clientSubScores(
    c, state.monthlyMetrics, state.surveys,
    { ...cfg, quarterStart: scSelected.start, quarterEnd: scSelected.end },
    new Date(), state.weeklyMetrics || []
  );
  const status = CABT_scoreToStatus(sub.composite);
  const ca = state.cas.find(x => x.id === c.assignedCA);
  // Scope the reverse-engineered inputs to the selected quarter/window too,
  // so the whole screen reflects one quarter consistently.
  const recent = state.monthlyMetrics
    .filter(m => m.clientId === c.id && m.month >= scSelected.start && m.month <= scSelected.end)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 3);

  // Reverse-engineered inputs feeding each sub-score
  const avgMRR = recent.length ? recent.reduce((s, m) => s + (Number(m.clientMRR) || 0), 0) / recent.length : 0;
  const avgAdRatio = recent.length ? recent.reduce((s, m) => s + (m.adSpend / Math.max(m.clientGrossRevenue, 1)), 0) / recent.length : 0;
  const fAvgs = recent.length ? {
    booking: recent.reduce((s, m) => s + (m.apptsBooked / Math.max(m.leadsGenerated, 1)), 0) / recent.length,
    show:    recent.reduce((s, m) => s + (m.leadsShowed / Math.max(m.apptsBooked, 1)), 0) / recent.length,
    close:   recent.reduce((s, m) => s + (m.leadsSigned / Math.max(m.leadsShowed, 1)), 0) / recent.length,
  } : { booking: 0, show: 0, close: 0 };
  const avgAtt = recent.length ? recent.reduce((s, m) => s + (m.studentsCancelled / Math.max(m.totalStudentsStart, 1)), 0) / recent.length : 0;

  const Row = ({ label, value, target, sub: subline, score, color }) => (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${theme.rule}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontSize: 13, color: theme.ink, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: color || theme.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: theme.inkMuted }}>
        <span>{subline || ''}</span>
        {target && <span style={{ fontFamily: theme.mono }}>{target}</span>}
      </div>
      {score != null && (
        <div style={{ marginTop: 6, height: 4, background: theme.rule, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${(score*100).toFixed(0)}%`, height: '100%', background: STATUS[CABT_scoreToStatus(score)] }}/>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{ padding: '4px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>Per-client calc · {c.id}</div>
            {onSetRates
              ? <ClientNameEditor theme={theme} clientId={c.id} name={c.name} onSave={(v) => onSetRates(c.id, { name: v }, 'Name')} />
              : <div style={{ fontFamily: theme.serif, fontSize: 24, fontWeight: 600, color: theme.ink, letterSpacing: -0.4, lineHeight: 1.15, marginTop: 2 }}>{c.name}</div>}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <StatusPill status={status} />
              <span style={{ fontSize: 12, color: theme.inkMuted }}>{ca?.name || 'Unassigned'}</span>
              <span style={{ fontSize: 12, color: theme.inkMuted }}>· {recent.length}/3 months data</span>
            </div>
          </div>
          <ScoreRing value={sub.composite || 0} size={64} stroke={5} color={STATUS[status]} bg={theme.rule}
            label={<div style={{ fontSize: 16, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>
              {sub.composite != null ? (sub.composite*100).toFixed(0) : '—'}
            </div>}/>
        </div>
      </div>

      {/* Quarter selector — analyze this account per quarter or cumulative */}
      <div style={{ padding: '0 16px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {scOptions.map((o, i) => {
          const isCum = o.key === scCumulative.key;
          const st = isCum ? 'past' : CABT_quarterStatus(o.start, o.end);
          const isSel = o.key === scSelKey;
          const disabled = st === 'future';
          return (
            <button key={o.key} disabled={disabled} onClick={() => setScSelKey(o.key)} style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999,
              fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
              background: isSel ? theme.ink : theme.surface,
              color: isSel ? (theme.accentInk || '#fff') : theme.ink,
              border: `1px solid ${isSel ? theme.ink : theme.rule}`,
              opacity: disabled ? 0.4 : 1,
            }}>
              {isCum ? 'Cumulative' : `Q${i + 1}`}{(!isCum && st === 'current') ? ' · live' : ''}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {onSetRates && (() => {
          // Per-contract commission rate override (Bobby 2026-05-01).
          // Inherits from the rep's defaults at contract creation; admin can tweak any time.
          const rep = state.sales.find(s => s.id === c.ae);
          const initial = {
            upfrontPct: c.upfrontPct != null ? String(c.upfrontPct) : '',
            midPct:     c.midPct     != null ? String(c.midPct)     : '',
            endPct:     c.endPct     != null ? String(c.endPct)     : '',
          };
          // Local draft state via stable key (clientId) so realtime updates
          // don't clobber an in-progress edit.
          return <RatesCard theme={theme} clientId={c.id} initial={initial} rep={rep}
                            onSave={(p) => onSetRates(c.id, p)} />;
        })()}

        {onSetRates && (() => {
          // Tier + cancel reason controls — bundled here because both
          // require the same onUpdateClient handler (we reuse onSetRates).
          const tier = c.tier || 'standard';
          const eligible = tier === 'standard' || tier === 'vip';
          const cancelReasons = state.cancelReasons || [];
          return (
            <Card theme={theme} padding={14}>
              <SectionLabel theme={theme}>Tier &amp; status</SectionLabel>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>Tier</div>
                <Select
                  value={tier}
                  onChange={(v) => onSetRates(c.id, { tier: v })}
                  options={[
                    { value: 'standard',   label: 'Standard — eligible' },
                    { value: 'vip',        label: 'VIP — eligible (+1 Growth point)' },
                    { value: 'reach',      label: 'Reach — excluded from scoring' },
                    { value: 'a_la_carte', label: 'À la carte — excluded from scoring' },
                  ]}
                  theme={theme}
                />
                <div style={{ fontSize: 11, color: eligible ? theme.inkMuted : '#dc3c3c', marginTop: 6, lineHeight: 1.4 }}>
                  {eligible
                    ? 'Counts toward CA bonus scoring (Performance, Retention, Growth).'
                    : 'Excluded from CA scoring — tracked for revenue only.'}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {c.cancelDate ? 'Cancellation' : 'Status'}
                  </div>
                  {c.cancelDate ? (
                    <button
                      onClick={() => onSetRates(c.id, { cancelDate: null, cancelReason: null })}
                      style={{
                        background: 'transparent', border: `1px solid ${theme.rule}`,
                        color: theme.ink, fontSize: 11, fontWeight: 600,
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      Reactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => onSetRates(c.id, { cancelDate: CABT_todayIso() })}
                      style={{
                        background: 'transparent', border: `1px solid #dc3c3c66`,
                        color: '#dc3c3c', fontSize: 11, fontWeight: 600,
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      Cancel client
                    </button>
                  )}
                </div>
                {c.cancelDate && (
                  <Select
                    value={c.cancelReason || ''}
                    onChange={(v) => onSetRates(c.id, { cancelReason: v || null })}
                    options={[
                      { value: '', label: '— pick a reason —' },
                      ...cancelReasons.map(r => ({
                        value: r.code,
                        label: `${r.label}${r.countsAgainstCa ? '' : ' (does not count against CA)'}`,
                      })),
                    ]}
                    theme={theme}
                  />
                )}
                <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 6, lineHeight: 1.4 }}>
                  {c.cancelDate
                    ? `Cancelled ${CABT_fmtDate(c.cancelDate)}. Reason flagged "does not count against CA" excludes it from retention math.`
                    : 'Tap "Cancel client" when the client ends their contract. You\'ll set today as the cancel date and pick a reason.'}
                </div>
              </div>
            </Card>
          );
        })()}

        {onSetCadence && (() => {
          const cadence = c.loggingCadence || 'monthly';
          const wc = (state.weeklyCheckins  || []).filter(w => w.clientId === c.id).sort((a,b) => b.weekStart.localeCompare(a.weekStart));
          const mc = (state.monthlyCheckins || []).filter(m => m.clientId === c.id).sort((a,b) => b.month.localeCompare(a.month));
          const latest = cadence === 'weekly' ? wc[0] : mc[0];
          return (
            <Card theme={theme} padding={14}>
              <SectionLabel theme={theme}>Logging cadence</SectionLabel>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {['monthly', 'weekly'].map(opt => {
                  const active = cadence === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => !active && onSetCadence(c.id, opt)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8,
                        background: active ? (theme.accentSoft || 'rgba(215,255,61,0.12)') : 'transparent',
                        border: `1.5px solid ${active ? (theme.accent || '#D7FF3D') : theme.rule}`,
                        color: theme.ink, fontWeight: active ? 700 : 500, fontSize: 13,
                        cursor: active ? 'default' : 'pointer', textAlign: 'center',
                        fontFamily: 'inherit', textTransform: 'capitalize',
                      }}>
                      {opt}
                      {active && <span style={{ marginLeft: 6, fontSize: 10, color: theme.inkMuted, fontWeight: 600 }}>· current</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
                Controls only how often the CA logs <strong>narrative check-ins</strong> (concern, win, account-side, agency-side actions). Numeric metrics shown below (MRR, ad spend, etc.) always come from monthly_metrics regardless.
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.rule}`, fontSize: 11, color: theme.inkMuted }}>
                {cadence === 'weekly'
                  ? `Weekly check-ins logged: ${wc.length}`
                  : `Monthly check-ins logged: ${mc.length}`}
                {latest && (
                  <span style={{ marginLeft: 8 }}>
                    · last: {cadence === 'weekly' ? `week of ${CABT_fmtDate(latest.weekStart)}` : CABT_fmtMonth(latest.month)}
                  </span>
                )}
                {!latest && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>· none yet</span>}
              </div>
            </Card>
          );
        })()}

        <Card theme={theme} padding={14}>
          <SectionLabel theme={theme}>Inputs (last {recent.length} months)</SectionLabel>
          <Row label="Revenue"
            value={CABT_fmtMoney(avgMRR)}
            target={`Retainer ${CABT_fmtMoney(c.monthlyRetainer)}`}
            sub="Avg client MRR vs contracted retainer"
            score={sub.revenue}/>
          <Row label="Ad efficiency"
            value={`${(avgAdRatio*100).toFixed(1)}%`}
            target={`Target ${(state.config.adSpendPctOfGross*100).toFixed(0)}% of gross`}
            sub="Avg ad spend ÷ client gross revenue"
            score={sub.adEfficiency}/>
          <Row label="Funnel · book"
            value={`${(fAvgs.booking*100).toFixed(0)}%`}
            target={`Floor ${(state.config.bookingFloor*100).toFixed(0)}%`}
            sub="Appts ÷ leads"/>
          <Row label="Funnel · show"
            value={`${(fAvgs.show*100).toFixed(0)}%`}
            target={`Floor ${(state.config.showFloor*100).toFixed(0)}%`}
            sub="Showed ÷ booked"/>
          <Row label="Funnel · close"
            value={`${(fAvgs.close*100).toFixed(0)}%`}
            target={`Floor ${(state.config.closeFloor*100).toFixed(0)}%`}
            sub="Signed ÷ showed"
            score={sub.funnel}/>
          <Row label="Attrition"
            value={`${(avgAtt*100).toFixed(1)}%/mo`}
            target={`Green ≤${(state.config.attritionGreenFloor*100).toFixed(0)}% · Red ≥${(state.config.attritionCriticalCeiling*100).toFixed(0)}%`}
            sub="Cancelled ÷ prior students"
            score={sub.attrition}/>
          <Row label="Satisfaction"
            value={sub.satisfaction != null ? `${(sub.satisfaction*5).toFixed(1)}/5` : '—'}
            target={`Lookback ${state.config.satisfactionLookbackMonths}mo`}
            sub="Avg of survey ratings"
            score={sub.satisfaction}/>
          <Row label="Growth"
            value={(() => {
              if (recent.length < 2) return '—';
              const last = recent[0].clientMRR, first = recent[recent.length-1].clientMRR;
              const t = (last - first) / Math.max(first, 1);
              return `${t >= 0 ? '+' : ''}${(t*100).toFixed(1)}%`;
            })()}
            target={c.hasMembershipAddon ? '+10pt add-on bonus' : 'Core only'}
            sub="MRR trajectory across window"
            score={sub.growth}/>
        </Card>

        <Card theme={theme} padding={14}>
          <SectionLabel theme={theme}>Recent months</SectionLabel>
          {recent.length === 0 && <div style={{ color: theme.inkMuted, fontSize: 13 }}>No metrics logged.</div>}
          {recent.map((m, i) => (
            <div key={m.id} style={{ padding: '10px 0', borderBottom: i === recent.length - 1 ? 'none' : `1px solid ${theme.rule}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.ink, fontFamily: theme.serif }}>{CABT_fmtMonth(m.month)}</span>
                <span style={{ fontSize: 12, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums' }}>MRR {CABT_fmtMoney(m.clientMRR)}</span>
              </div>
              <div style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>
                {m.leadsGenerated}L → {m.apptsBooked}B → {m.leadsShowed}S → {m.leadsSigned}✓ · ad {CABT_fmtMoney(m.adSpend)} · cancel {m.studentsCancelled}/{m.totalStudentsStart}
              </div>
            </div>
          ))}
        </Card>

        <Card theme={theme} padding={14}>
          <SectionLabel theme={theme}>Contract</SectionLabel>
          <KV theme={theme} label="Sign date"  value={CABT_fmtDate(c.signDate)} />
          <KV theme={theme} label="Term"       value={`${c.termMonths} months`} />
          <KV theme={theme} label="Retainer"   value={`${CABT_fmtMoney(c.monthlyRetainer)}/mo`} />
          <KV theme={theme} label="Membership" value={c.hasMembershipAddon ? `Yes · ${CABT_fmtDate(c.membershipStartDate)}` : '—'} />
          <KV theme={theme} label="Account Manager"           value={state.sales.find(s => s.id === c.ae)?.name || '—'} />
          <KV theme={theme} label="Relationship Dev Rep"      value={state.sales.find(s => s.id === c.sdrBookedBy)?.name || '—'} last />
        </Card>
      </div>
    </div>
  );
}

// ── Open Questions ─────────────────────────────────────────────────────────
// Demo seed used ONLY in local mode (apiMode === 'local' / state._live false).
// In supabase mode, AdminOpenQuestions reads state.openQuestions from the
// real open_questions table and writes via Supabase.
const SEED_QUESTIONS = [
  { id: 'Q-001', topic: 'Scoring',   priority: 'high',   status: 'open',
    question: 'Does the W (book completeness) multiplier apply only to Performance, or to the whole composite?',
    context: 'Current implementation gates Performance only. Brief is ambiguous.', owner: 'Bobby',
    created: '2026-04-15' },
  { id: 'Q-002', topic: 'Bonus pool', priority: 'high',  status: 'open',
    question: 'Confirm the $7,500 quarterly cap is per-CA, not pool-shared.',
    context: 'Annual Bonus screen assumes per-CA cap.', owner: 'Bobby',
    created: '2026-04-16' },
  { id: 'Q-003', topic: 'Approvals',  priority: 'medium', status: 'answered',
    question: 'Single-approver model OK for v1, or 2-step (Bobby + accountant)?',
    context: 'Brief mentions accountant export but no approval step.', owner: 'Bobby',
    created: '2026-04-10', answer: 'Single approver for v1; CSV export is enough for accountant.' },
  { id: 'Q-004', topic: 'GHL',       priority: 'medium', status: 'open',
    question: 'When GHL integration lands, should leads/appts auto-fill the monthly metric form, or replace manual entry?',
    context: 'Affects whether the Monthly Metrics form keeps funnel section.', owner: 'Bobby',
    created: '2026-04-18' },
  { id: 'Q-005', topic: 'Surveys',    priority: 'low',    status: 'open',
    question: 'Anonymous survey flag — does the CA see the rating, or only leadership?',
    context: 'Currently CA sees everything; toggle just hides submitter name in admin views.', owner: 'Bobby',
    created: '2026-04-19' },
  { id: 'Q-006', topic: 'Clawbacks',  priority: 'medium', status: 'open',
    question: 'On client cancel before midpoint milestone, do we claw back the upfront commission or only future?',
    context: 'Sales Adjustment form supports clawback but rule is undefined.', owner: 'Bobby',
    created: '2026-04-12' },
];

function AdminOpenQuestions({ state, theme }) {
  // Supabase mode reads from state.openQuestions (loaded by loadStateSupabase
  // and kept fresh by realtime). Local-only mode (no _live flag) falls back
  // to the SEED_QUESTIONS demo so the screen is reachable in dev.
  const isLive = !!state._live;
  const questions = isLive ? (state.openQuestions || []) : SEED_QUESTIONS;

  const [filter, setFilter] = React.useState('open'); // open | all | answered
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState({ topic: '', priority: 'medium', question: '', context: '', owner: 'Bobby' });
  const [expanded, setExpanded] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const filtered = questions.filter(q => filter === 'all' ? true : q.status === filter);
  const byStatus = {
    open:     questions.filter(q => q.status === 'open').length,
    answered: questions.filter(q => q.status === 'answered').length,
  };

  const submitDraft = async () => {
    if (!draft.question.trim() || busy) return;
    setBusy(true); setErr(null);
    const id = `Q-${String(questions.length + 1).padStart(3, '0')}`;
    try {
      if (isLive) {
        const sb = await CABT_sb();
        const { error } = await sb.from('open_questions').insert({
          id,
          topic: draft.topic || 'General',
          priority: draft.priority,
          status: 'open',
          question: draft.question,
          context: draft.context || null,
          owner: draft.owner || null,
          created_at: CABT_todayIso(),
        });
        if (error) throw error;
      }
      setDraft({ topic: '', priority: 'medium', question: '', context: '', owner: 'Bobby' });
      setAdding(false);
    } catch (e) { setErr(e?.message || 'Save failed'); }
    setBusy(false);
  };

  const answerIt = async (id, answer) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      if (isLive) {
        const sb = await CABT_sb();
        const { error } = await sb.from('open_questions').update({
          status: 'answered', answer, answered_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) throw error;
      }
    } catch (e) { setErr(e?.message || 'Save failed'); }
    setBusy(false);
  };
  const reopenIt = async (id) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      if (isLive) {
        const sb = await CABT_sb();
        const { error } = await sb.from('open_questions').update({
          status: 'open', answer: null, answered_at: null,
        }).eq('id', id);
        if (error) throw error;
      }
    } catch (e) { setErr(e?.message || 'Save failed'); }
    setBusy(false);
  };

  const PRIO = {
    high:   { label: 'High',   bg: STATUS.red    + '22', fg: '#C62828' },
    medium: { label: 'Medium', bg: STATUS.yellow + '22', fg: '#A06800' },
    low:    { label: 'Low',    bg: theme.rule,           fg: theme.inkSoft },
  };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="alert" theme={theme}>
        Decisions still pending from leadership. Answer here once resolved — answers route into the build log.
      </Banner>
      {err && (
        <div style={{ background: STATUS.red + '15', color: STATUS.red, border: `1px solid ${STATUS.red}33`,
                     borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { v: 'open',     label: 'Open',     n: byStatus.open },
          { v: 'answered', label: 'Answered', n: byStatus.answered },
          { v: 'all',      label: 'All',      n: questions.length },
        ].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)} style={{
            padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
            background: filter === f.v ? theme.ink : theme.surface,
            color: filter === f.v ? theme.accentInk : theme.ink,
            border: `1px solid ${filter === f.v ? theme.ink : theme.rule}`,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{f.label} <span style={{ opacity: 0.65 }}>{f.n}</span></button>
        ))}
        <div style={{ flex: 1 }}/>
        <Button theme={theme} variant="primary" size="sm" icon="plus" onClick={() => setAdding(a => !a)}>
          {adding ? 'Cancel' : 'New'}
        </Button>
      </div>

      {adding && (
        <Card theme={theme} padding={14}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Topic" theme={theme}>
              <Input theme={theme} value={draft.topic} onChange={(v) => setDraft({...draft, topic: v})} placeholder="Scoring, Bonus, GHL…"/>
            </Field>
            <Field label="Priority" theme={theme}>
              <Select theme={theme} value={draft.priority} onChange={(v) => setDraft({...draft, priority: v})}
                options={[{value:'high',label:'High'},{value:'medium',label:'Medium'},{value:'low',label:'Low'}]}/>
            </Field>
            <Field label="Question" required theme={theme}>
              <Textarea value={draft.question} onChange={(v) => setDraft({...draft, question: v})} rows={2}
                placeholder="What needs to be decided?" theme={theme}/>
            </Field>
            <Field label="Context" theme={theme}>
              <Textarea value={draft.context} onChange={(v) => setDraft({...draft, context: v})} rows={2}
                placeholder="Why this matters / what it blocks" theme={theme}/>
            </Field>
            <Button theme={theme} variant="primary" fullWidth onClick={submitDraft}>Add question</Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <Card theme={theme}><div style={{ color: theme.inkMuted, fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No questions in this view.</div></Card>
        )}
        {filtered.map(q => {
          const p = PRIO[q.priority] || PRIO.medium;
          const isOpen = expanded[q.id];
          return (
            <Card key={q.id} theme={theme} padding={0}>
              <button onClick={() => setExpanded(e => ({ ...e, [q.id]: !e[q.id] }))} style={{
                width: '100%', padding: '14px', background: 'transparent', border: 'none',
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: p.bg, color: p.fg, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{p.label}</span>
                  {q.topic && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: theme.rule, color: theme.inkSoft, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{q.topic}</span>}
                  {q.status === 'answered' && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: STATUS.green + '22', color: '#2E7D32', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Answered</span>}
                  <div style={{ flex: 1 }}/>
                  <span style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>{q.id}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink, lineHeight: 1.35 }}>{q.question}</div>
                {!isOpen && q.context && <div style={{ fontSize: 12, color: theme.inkMuted, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{q.context}</div>}
              </button>
              {isOpen && (
                <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${theme.rule}` }}>
                  {q.context && (
                    <div style={{ padding: '10px 0', fontSize: 13, color: theme.inkSoft, lineHeight: 1.45, fontFamily: theme.serif, fontStyle: 'italic' }}>
                      {q.context}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: theme.inkMuted, marginBottom: 10 }}>
                    Owner <strong style={{ color: theme.ink }}>{q.owner}</strong> · created {CABT_fmtDate(q.createdAt || q.created)}
                  </div>
                  {q.status === 'answered' ? (
                    <div>
                      <Banner tone="success" icon="check" theme={theme}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>Answer · {CABT_fmtDate(q.answeredAt)}</div>
                        <div>{q.answer}</div>
                      </Banner>
                      <div style={{ height: 8 }}/>
                      <Button theme={theme} variant="ghost" size="sm" onClick={() => reopenIt(q.id)}>Reopen</Button>
                    </div>
                  ) : (
                    <AnswerForm onSubmit={(ans) => answerIt(q.id, ans)} theme={theme} />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AnswerForm({ onSubmit, theme }) {
  const [val, setVal] = React.useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Textarea value={val} onChange={setVal} rows={2}
        placeholder="Type the resolved answer…" theme={theme}/>
      <Button theme={theme} variant="primary" size="sm"
        onClick={() => { if (val.trim()) { onSubmit(val.trim()); setVal(''); } }}>
        Mark answered
      </Button>
    </div>
  );
}

// ── Add Client (admin) ──────────────────────────────────────────────────────
// Generates the next sequential CL-### id. Saves through onSubmit.
function nextClientId(clients) {
  const nums = clients
    .map(c => /^CL-(\d+)$/.exec(c.id))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  // Also consider legacy C-### ids so we don't collide with seed data
  const legacy = clients
    .map(c => /^C-(\d+)$/.exec(c.id))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  const max = Math.max(0, ...nums, ...legacy);
  return `CL-${String(max + 1).padStart(3, '0')}`;
}

function AdminAddClient({ state, theme, navigate, onSubmit, presetFromStripe }) {
  const today = CABT_todayIso();
  const [form, setForm] = React.useState(() => ({
    name:                 presetFromStripe?.name || '',
    stripeCustomerId:     presetFromStripe?.stripeCustomerId || '',
    ghlContactId:         presetFromStripe?.ghlContactId || '',
    signDate:             presetFromStripe?.signDate || today,
    monthlyRetainer:      presetFromStripe?.monthlyRetainer || '',
    termMonths:           12,
    assignedCA:           '',
    ae:                   '',
    sdrBookedBy:          '',
    upfrontPct:           0.10,
    midPct:               0.05,
    endPct:               0.05,
    hasMembershipAddon:   false,
    membershipStartDate: '',
    stripeTruthMode:     'stripe_wins', // stripe_wins | ca_wins | lower_of_both
    loggingCadence:      'monthly',     // weekly | monthly (TICKET-2)
    tier:                'standard',    // standard | vip | reach | a_la_carte (Phase 10)
    notes:               '',
  }));
  const [errors, setErrors] = React.useState({});
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const cas  = state.cas.filter(c => c.active).map(c => ({ value: c.id, label: c.name }));
  // Account Manager (legacy 'AE' kept for migration period)
  const aes  = state.sales.filter(s => s.role === 'AM' || s.role === 'AE')
                          .map(s => ({ value: s.id, label: s.name }));
  // Relationship Development Rep (legacy 'SDR' kept for migration period)
  const sdrs = [
    { value: '', label: 'None' },
    ...state.sales.filter(s => s.role === 'RDR' || s.role === 'SDR')
                  .map(s => ({ value: s.id, label: s.name })),
  ];

  const newId = nextClientId(state.clients);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.signDate) e.signDate = 'Required';
    if (form.signDate && new Date(form.signDate) > new Date()) e.signDate = 'Cannot be in the future';
    if (!form.monthlyRetainer || Number(form.monthlyRetainer) <= 0) e.monthlyRetainer = 'Required';
    if (!form.termMonths || Number(form.termMonths) <= 0) e.termMonths = 'Required';
    if (form.hasMembershipAddon && !form.membershipStartDate) e.membershipStartDate = 'Required when membership is on';
    // Duplicate guards
    const nameLower = form.name.trim().toLowerCase();
    if (state.clients.some(c => c.name.trim().toLowerCase() === nameLower)) e.name = 'A client with this name already exists';
    if (form.stripeCustomerId && state.clients.some(c => c.stripeId === form.stripeCustomerId || c.stripeCustomerId === form.stripeCustomerId)) {
      e.stripeCustomerId = 'Already linked to another client';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const [busy, setBusy] = React.useState(false);
  const [rootErr, setRootErr] = React.useState(null);

  const submit = async () => {
    if (!validate() || busy) return;
    setBusy(true); setRootErr(null);

    // NOTE: keys are camelCase with single-cap-after-lowercase so api.jsx's
    // camelToSnake converts cleanly (e.g. assignedCa → assigned_ca, NOT
    // assignedCA → assigned_c_a). app-shell's local-mode submitClient mirrors
    // assignedCa back to assignedCA in state for legacy UI consumers.
    const row = {
      id: newId,
      name: form.name.trim(),
      stripeCustomerId: form.stripeCustomerId || null,
      ghlContactId:     form.ghlContactId || null,
      assignedCa:       form.assignedCA || null,    // canonical (camel→snake-safe)
      signDate:         form.signDate,
      cancelDate:       null,
      monthlyRetainer:  Number(form.monthlyRetainer),
      hasMembershipAddon: !!form.hasMembershipAddon,
      membershipStartDate: form.hasMembershipAddon ? form.membershipStartDate : null,
      termMonths:       Number(form.termMonths),
      ae:               form.ae || null,            // legacy column; UI = Account Manager
      sdrBookedBy:      form.sdrBookedBy || null,   // legacy column; UI = Relationship Dev Rep
      upfrontPct:       Number(form.upfrontPct),
      midPct:           Number(form.midPct),
      endPct:           Number(form.endPct),
      stripeTruthMode:  form.stripeTruthMode,
      loggingCadence:   form.loggingCadence,
      tier:             form.tier,
      notes:            form.notes,
    };

    try {
      let saved = row;
      if (CABT_getApiMode() === 'supabase') {
        // Insert the active client first
        saved = await CABT_api.submitClient(row);
        // If this came from the pending queue, mark the pending row as approved
        if (presetFromStripe && presetFromStripe.id) {
          const sb = await CABT_sb();
          const { data: { user } } = await sb.auth.getUser();
          await sb.from('pending_clients').update({
            status:      'approved',
            approved_as: saved.id || row.id,
            approved_at: new Date().toISOString(),
            approved_by: user?.id || null,
          }).eq('id', presetFromStripe.id);
        }
      }
      // Local-mode submitClient in app-shell already handles pending state mirror.
      onSubmit({ ...saved, source: presetFromStripe ? 'stripe' : 'manual' });
    } catch (e) {
      console.error('submitClient failed:', e);
      setRootErr(e?.message || 'Save failed');
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '12px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rootErr && <Banner tone="error" icon="alert" theme={theme}>{rootErr}</Banner>}
      {presetFromStripe ? (
        <Banner tone="warning" icon="alert" theme={theme}>
          <strong>Pending from Stripe.</strong> Review the prefilled details, assign a CA, then approve to add this client to the active book.
        </Banner>
      ) : (
        <Banner tone="info" icon="alert" theme={theme}>
          New client will be assigned ID <strong style={{ fontFamily: theme.mono }}>{newId}</strong>. They start scoring as soon as the first month of metrics is logged.
        </Banner>
      )}

      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Identity</SectionLabel>
        <Field label="Business name" required error={errors.name} theme={theme}>
          <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} theme={theme} placeholder="e.g. Ronin BJJ Austin" autoFocus={!presetFromStripe}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Assign to CA" theme={theme} hint="Can be assigned later from Approvals">
          <Select value={form.assignedCA} onChange={(v) => setForm({ ...form, assignedCA: v })}
            options={[{ value: '', label: '— assign later —' }, ...cas]} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Logging cadence" hint="How often does the CA log narrative check-ins? Monthly snapshots (MRR + students) stay monthly regardless." theme={theme}>
          <Select value={form.loggingCadence} onChange={(v) => setForm({ ...form, loggingCadence: v })}
            options={[
              { value: 'monthly', label: 'Monthly — one check-in per month' },
              { value: 'weekly',  label: 'Weekly — check-in every week' },
            ]} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Tier" hint="Bonus eligibility. Only Standard + VIP count toward CA scoring. Reach + à la carte are tracked but excluded." theme={theme}>
          <Select value={form.tier} onChange={(v) => setForm({ ...form, tier: v })}
            options={[
              { value: 'standard',   label: 'Standard — eligible' },
              { value: 'vip',        label: 'VIP — eligible (+1 Growth point)' },
              { value: 'reach',      label: 'Reach — excluded from scoring' },
              { value: 'a_la_carte', label: 'À la carte — excluded from scoring' },
            ]} theme={theme}/>
        </Field>
      </Card>

      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Contract</SectionLabel>
        <Field label="Sign date" required error={errors.signDate} theme={theme}>
          <Input type="date" value={form.signDate} onChange={(v) => setForm({ ...form, signDate: v })} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Monthly retainer" required error={errors.monthlyRetainer} theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.monthlyRetainer}
            onChange={(v) => setForm({ ...form, monthlyRetainer: v })} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Term" required error={errors.termMonths} theme={theme}>
          <Input type="number" inputmode="numeric" suffix="months" value={form.termMonths}
            onChange={(v) => setForm({ ...form, termMonths: v })} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>Membership add-on</div>
            <div style={{ fontSize: 12, color: theme.inkMuted }}>Adds {(state.config.membershipRevenueRate*100).toFixed(0)}% revenue share + 10pt growth bonus</div>
          </div>
          <Toggle value={form.hasMembershipAddon} onChange={(v) => setForm({ ...form, hasMembershipAddon: v })} theme={theme}/>
        </div>
        {form.hasMembershipAddon && (
          <>
            <div style={{ height: 10 }}/>
            <Field label="Membership start date" required error={errors.membershipStartDate} theme={theme}>
              <Input type="date" value={form.membershipStartDate}
                onChange={(v) => setForm({ ...form, membershipStartDate: v })} theme={theme}/>
            </Field>
          </>
        )}
      </Card>

      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Sales credit</SectionLabel>
        <Field label="Account Manager" theme={theme}>
          <Select value={form.ae} onChange={(v) => setForm({ ...form, ae: v })}
            options={[{ value: '', label: '— none —' }, ...aes]} theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Relationship Development Rep (booked by)" theme={theme}>
          <Select value={form.sdrBookedBy} onChange={(v) => setForm({ ...form, sdrBookedBy: v })}
            options={sdrs} theme={theme}/>
        </Field>
      </Card>

      <button onClick={() => setShowAdvanced(a => !a)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        background: 'transparent', border: 'none', padding: '8px 4px', cursor: 'pointer', fontFamily: 'inherit',
        color: theme.inkSoft, fontSize: 13, fontWeight: 600,
      }}>
        <span>Advanced & integration</span>
        <Icon name={showAdvanced ? 'chev-u' : 'chev-d'} size={16}/>
      </button>

      {showAdvanced && (
        <>
          <Card theme={theme} padding={14}>
            <SectionLabel theme={theme}>Commission split</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Field label="Upfront" theme={theme}>
                <Input type="number" inputmode="decimal" suffix="×" value={form.upfrontPct}
                  onChange={(v) => setForm({ ...form, upfrontPct: v })} theme={theme}/>
              </Field>
              <Field label="Mid" theme={theme}>
                <Input type="number" inputmode="decimal" suffix="×" value={form.midPct}
                  onChange={(v) => setForm({ ...form, midPct: v })} theme={theme}/>
              </Field>
              <Field label="End" theme={theme}>
                <Input type="number" inputmode="decimal" suffix="×" value={form.endPct}
                  onChange={(v) => setForm({ ...form, endPct: v })} theme={theme}/>
              </Field>
            </div>
          </Card>

          <Card theme={theme} padding={14}>
            <SectionLabel theme={theme}>Integration</SectionLabel>
            <Field label="Stripe customer ID" hint="Optional · auto-fills MRR from invoices once linked"
              error={errors.stripeCustomerId} theme={theme}>
              <Input value={form.stripeCustomerId} onChange={(v) => setForm({ ...form, stripeCustomerId: v })}
                theme={theme} placeholder="cus_XXXXXXXXXXXXXX"/>
            </Field>
            <div style={{ height: 10 }}/>
            <Field label="GHL contact ID" hint="Optional · pulls funnel metrics from GoHighLevel" theme={theme}>
              <Input value={form.ghlContactId} onChange={(v) => setForm({ ...form, ghlContactId: v })}
                theme={theme} placeholder="ctc_XXXXXXXX"/>
            </Field>
            <div style={{ height: 10 }}/>
            <Field label="When Stripe & CA disagree on MRR…" theme={theme}>
              <Select value={form.stripeTruthMode} onChange={(v) => setForm({ ...form, stripeTruthMode: v })}
                options={[
                  { value: 'stripe_wins',    label: 'Stripe wins (auto-overwrite, show diff)' },
                  { value: 'ca_wins',        label: 'CA wins (Stripe is informational only)' },
                  { value: 'lower_of_both',  label: 'Score the lower of the two' },
                ]} theme={theme}/>
            </Field>
          </Card>

          <Card theme={theme} padding={14}>
            <SectionLabel theme={theme}>Internal notes</SectionLabel>
            <Textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={3}
              placeholder="Anything CAs and other admins should know about this account…" theme={theme}/>
          </Card>
        </>
      )}

      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : presetFromStripe ? 'Approve & add' : `Add ${newId}`}
        </Button>
      </StickyBar>
    </div>
  );
}

// ── Pending Clients (Stripe + manual queue) ────────────────────────────────
// Approve takes admin to AdminAddClient prefilled; Reject is one-click.
function AdminPendingClients({ state, theme, navigate }) {
  const [busy, setBusy] = React.useState(null);
  const [localStatus, setLocalStatus] = React.useState({}); // id -> 'rejected' for instant feedback
  const pending = (state.pendingClients || []).filter(p =>
    p.status === 'pending' && localStatus[p.id] !== 'rejected'
  );

  const reject = async (p) => {
    setBusy(p.id);
    try {
      if (CABT_getApiMode() === 'supabase') {
        const sb = await CABT_sb();
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from('pending_clients').update({
          status:       'rejected',
          rejected_at:  new Date().toISOString(),
          rejected_by:  user?.id || null,
        }).eq('id', p.id);
        if (error) throw error;
      }
      setLocalStatus(s => ({ ...s, [p.id]: 'rejected' }));
    } catch (e) {
      console.error('reject failed:', e);
      alert(e?.message || 'Reject failed');
    }
    setBusy(null);
  };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="alert" theme={theme}>
        New customers from Stripe land here first. Review and approve before they enter the active book — useful for filtering out test accounts.
      </Banner>
      {pending.length === 0 && (
        <Card theme={theme}>
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24, margin: '0 auto 12px',
              background: theme.rule, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.inkMuted,
            }}><Icon name="cash" size={22}/></div>
            <div style={{ fontFamily: theme.serif, fontSize: 17, fontWeight: 600, color: theme.ink, marginBottom: 4 }}>
              No pending customers
            </div>
            <div style={{ fontSize: 13, color: theme.inkMuted, lineHeight: 1.45, maxWidth: 280, margin: '0 auto' }}>
              Once the Stripe webhook is connected, new <code style={{ fontSize: 12, background: theme.rule, padding: '1px 5px', borderRadius: 3 }}>customer.subscription.created</code> events will appear here for approval.
            </div>
          </div>
        </Card>
      )}
      {pending.map(p => (
        <Card key={p.id} theme={theme} padding={14}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink }}>{p.name}</div>
            {p.stripeCustomerId && (
              <div style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>{p.stripeCustomerId}</div>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 12 }}>
            {(p.source || 'stripe')} · {CABT_fmtMoney(p.monthlyRetainer)}/mo · started {CABT_fmtDate(p.signDate)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button theme={theme} variant="secondary" size="sm" disabled={busy === p.id}
                    onClick={() => reject(p)}>Reject</Button>
            <Button theme={theme} variant="primary" size="sm" fullWidth disabled={busy === p.id}
                    onClick={() => navigate('add-client', { presetFromStripe: p })}>
              Review &amp; approve
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Audit Log (F1.1.3) ─────────────────────────────────────────────────────
// Read-only chronological browser of audit_log rows. Filter chips for actor,
// table, action, and date range. Tap a row to expand the diff JSON.
const AUDIT_PAGE = 50;
const AUDIT_ACTIONS = ['insert', 'update', 'delete', 'approve', 'reject'];

function actionTone(a) {
  if (a === 'insert' || a === 'approve') return 'green';
  if (a === 'update') return 'blue';
  if (a === 'delete' || a === 'reject') return 'red';
  return 'gray';
}

function AdminAuditLog({ state, theme }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null); // row id
  const [filters, setFilters] = React.useState({ actorId: '', tableName: '', action: '', fromDate: '', toDate: '' });

  // Build actor + table option lists from data we already loaded for the app.
  const actors = React.useMemo(() => {
    const m = new Map();
    (state.cas || []).forEach(c => { if (c.userId) m.set(c.userId, c.name); });
    (state.sales || []).forEach(s => { if (s.userId) m.set(s.userId, s.name); });
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [state]);

  const tables = ['profiles', 'cas', 'sales_team', 'clients', 'monthly_metrics',
    'growth_events', 'surveys', 'adjustments', 'edit_requests', 'config'];

  const load = React.useCallback(async (reset = true) => {
    const offset = reset ? 0 : rows.length;
    if (reset) { setLoading(true); setRows([]); setExpanded(null); }
    else setLoadingMore(true);
    setError(null);
    try {
      const res = await CABT_api.fetchAuditLog({ ...filters, limit: AUDIT_PAGE, offset });
      setRows(reset ? res.rows : [...rows, ...res.rows]);
      setHasMore(res.hasMore);
    } catch (e) {
      setError(e.message || 'load_failed');
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [filters, rows]);

  React.useEffect(() => { load(true); /* eslint-disable-next-line */ }, [filters]);

  const updateFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({ actorId: '', tableName: '', action: '', fromDate: '', toDate: '' });
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <Card theme={theme} padding={14}>
        <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>Audit Log</div>
        <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 4 }}>
          Read-only history of changes. {rows.length} {rows.length === 1 ? 'entry' : 'entries'}{hasMore ? '+' : ''} loaded.
        </div>
      </Card>

      {/* Filter chips */}
      <Card theme={theme} padding={12}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Select theme={theme} value={filters.actorId}
            onChange={(v) => updateFilter('actorId', v)}
            placeholder="All actors"
            options={[{ value: '', label: 'All actors' }, ...actors.map(a => ({ value: a.id, label: a.name }))]}/>
          <Select theme={theme} value={filters.tableName}
            onChange={(v) => updateFilter('tableName', v)}
            placeholder="All tables"
            options={[{ value: '', label: 'All tables' }, ...tables.map(t => ({ value: t, label: t }))]}/>
          <Select theme={theme} value={filters.action}
            onChange={(v) => updateFilter('action', v)}
            placeholder="All actions"
            options={[{ value: '', label: 'All actions' }, ...AUDIT_ACTIONS.map(a => ({ value: a, label: a }))]}/>
          <div style={{ display: 'flex', gap: 6 }}>
            <Input type="date" value={filters.fromDate}
              onChange={(v) => updateFilter('fromDate', v)} theme={theme}/>
            <Input type="date" value={filters.toDate}
              onChange={(v) => updateFilter('toDate', v)} theme={theme}/>
          </div>
        </div>
        {anyFilter && (
          <button onClick={clearFilters} style={{
            marginTop: 8, fontSize: 11, fontWeight: 600, color: theme.accent,
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
          }}>Clear filters</button>
        )}
      </Card>

      {/* Body */}
      {loading && <Card theme={theme} padding={20}><div style={{ fontSize: 13, color: theme.inkMuted, textAlign: 'center' }}>Loading…</div></Card>}

      {!loading && error && (
        <Card theme={theme} padding={20}>
          <div style={{ fontSize: 13, color: '#C62828' }}>Failed to load audit log: {error}</div>
        </Card>
      )}

      {!loading && !error && rows.length === 0 && (
        <Card theme={theme} padding={20}>
          <div style={{ fontSize: 13, color: theme.inkMuted, textAlign: 'center' }}>
            {anyFilter ? 'No entries match these filters.' : 'No audit entries yet.'}
          </div>
        </Card>
      )}

      {!loading && rows.length > 0 && (
        <Card theme={theme} padding={0}>
          {rows.map((r, i) => {
            const isOpen = expanded === r.id;
            const ts = r.at ? new Date(r.at) : null;
            const tsStr = ts ? ts.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            const actorName = (actors.find(a => a.id === r.actorId) || {}).name || r.actorEmail || 'unknown';
            return (
              <div key={r.id} style={{ borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${theme.rule}` }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none', padding: '12px 14px',
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <Pill tone={actionTone(r.action)} theme={theme}>{r.action || '—'}</Pill>
                    <span style={{ fontSize: 12, color: theme.ink, fontWeight: 600 }}>{r.tableName}</span>
                    {r.rowId && <span style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>#{r.rowId}</span>}
                    <span style={{ fontSize: 11, color: theme.inkMuted, marginLeft: 'auto' }}>{tsStr}</span>
                  </div>
                  <div style={{ fontSize: 12, color: theme.inkSoft }}>{actorName}</div>
                </button>
                {isOpen && (
                  <div style={{
                    padding: '4px 14px 14px',
                    fontSize: 11, fontFamily: theme.mono || 'ui-monospace, monospace',
                    color: theme.ink,
                  }}>
                    <pre style={{
                      background: theme.rule, padding: 10, borderRadius: 8,
                      overflow: 'auto', maxHeight: 280, margin: 0,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>{r.diff ? JSON.stringify(r.diff, null, 2) : '(no diff captured)'}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* Load more */}
      {!loading && hasMore && (
        <button
          onClick={() => load(false)}
          disabled={loadingMore}
          style={{
            padding: '12px', fontSize: 13, fontWeight: 600,
            color: theme.accent, background: 'transparent',
            border: `1px solid ${theme.rule}`, borderRadius: 12,
            cursor: loadingMore ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}>
          {loadingMore ? 'Loading…' : `Load ${AUDIT_PAGE} more`}
        </button>
      )}
    </div>
  );
}

function AdminMore({ theme, navigate, profile, onSignOut }) {
  const items = [
    { name: 'calls-board', icon: 'nav-accounts', label: 'Weekly Client Calls', desc: 'Live per-account call-status board — click to cycle colors' },
    { name: 'dashboard', icon: 'chart', label: 'All-accounts dashboard', desc: 'Compare every client’s metrics in one sortable table' },
    { name: 'edits',     icon: 'edit',  label: 'Edit Requests',   desc: 'Approve protected-field edits past grace' },
    { name: 'reviews',   icon: 'star',  label: 'Reviews Inbox',   desc: 'Match incoming reviews to clients' },
    { name: 'pending-clients', icon: 'cash', label: 'Pending Clients', desc: 'Approve new Stripe customers' },
    // TKT-12.7 — Formula Inspector + Formula Configurator are paired tools
    // (Inspector reads the math, Configurator edits the thresholds), so they
    // sit next to each other with Inspector first, Configurator second.
    { name: 'formula-inspector', icon: 'chart', label: 'Formula Inspector', desc: 'See exactly how every score is computed' },
    { name: 'formula-configurator', icon: 'cog', label: 'Formula Configurator', desc: 'Edit every scoring threshold (MRR target, lead cost bands, attrition floors, retention cliff, pot %)' },
    { name: 'bulk-cadence', icon: 'cal', label: 'Bulk cadence', desc: 'Set weekly/monthly for many clients at once' },
    { name: 'questions', icon: 'alert', label: 'Open Questions',  desc: 'Decisions pending leadership' },
    { name: 'audit-log', icon: 'shield', label: 'Audit Log',       desc: 'Read-only history of changes' },
    { name: 'roster',    icon: 'user',  label: 'Roster',          desc: 'CAs, Account Managers, Relationship Dev Reps' },
  ];
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {profile && (
        <Card theme={theme} padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22,
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}CC)`,
              color: theme.accentInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: theme.serif, fontWeight: 600, fontSize: 18, letterSpacing: -0.3,
              flexShrink: 0,
            }}>{((profile.displayName || profile.display_name || profile.email || 'A').split(/\s+/).map(s => s[0]).slice(0, 2).join('')).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.displayName || profile.display_name || 'Signed in'}
              </div>
              <div style={{ fontSize: 12, color: theme.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile.email}
              </div>
            </div>
          </div>
        </Card>
      )}
      <Card theme={theme} padding={0}>
        {items.map((it, i) => (
          <button key={it.name} onClick={() => navigate(it.name)} className="cabt-btn-press" style={{
            display: 'flex', alignItems: 'center', gap: 14, width: '100%',
            background: 'transparent', border: 'none',
            padding: '16px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: i === items.length - 1 ? 'none' : `1px solid ${theme.rule}`,
            WebkitTapHighlightColor: 'transparent',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: theme.accent + '15', color: theme.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Icon name={it.icon} size={18}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>{it.label}</div>
              <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 1 }}>{it.desc}</div>
            </div>
            <Icon name="chev-r" size={16} color={theme.inkMuted}/>
          </button>
        ))}
      </Card>
      {onSignOut && (
        <button
          onClick={onSignOut}
          className="cabt-btn-press"
          style={{
            width: '100%', padding: '14px 16px',
            background: 'transparent', border: `1.5px solid ${theme.rule}`,
            borderRadius: 14, color: theme.ink,
            fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >Sign out</button>
      )}
      <div style={{ fontSize: 11, color: theme.inkMuted, textAlign: 'center', padding: '12px 0', letterSpacing: 0.4 }}>
        gsTeam Scoreboard · Admin · v0.2
      </div>
    </div>
  );
}

// ── Bulk Cadence Editor ────────────────────────────────────────────────────
// Bobby's 2026-05-05 ask: "I want to update [cadence] for ALL clients at the
// same time. Instead of going in ALL accounts to change one at a time."
//
// Multi-select all/by-cadence/individually + apply weekly OR monthly to the
// selection. Writes go through CABT_api.updateClient per client; realtime
// then propagates back. For a 50-client batch, ~5-10 sec end-to-end.
function AdminBulkCadence({ state, theme, navigate }) {
  const allClients = (state.clients || []).filter(c => !c.cancelDate)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const [selected, setSelected] = React.useState(() => new Set());
  const [filter, setFilter] = React.useState('all'); // all | weekly | monthly
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(null);
  const [errMsg, setErrMsg] = React.useState(null);

  const filtered = allClients.filter(c => {
    const cad = c.loggingCadence || 'monthly';
    if (filter === 'all')     return true;
    if (filter === 'weekly')  return cad === 'weekly';
    if (filter === 'monthly') return cad === 'monthly';
    return true;
  });

  const counts = {
    all:     allClients.length,
    weekly:  allClients.filter(c => (c.loggingCadence || 'monthly') === 'weekly').length,
    monthly: allClients.filter(c => (c.loggingCadence || 'monthly') === 'monthly').length,
  };

  const toggle = (id) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(s => {
      if (filtered.every(c => s.has(c.id))) {
        const next = new Set(s);
        filtered.forEach(c => next.delete(c.id));
        return next;
      }
      const next = new Set(s);
      filtered.forEach(c => next.add(c.id));
      return next;
    });
  };

  const apply = async (cadence) => {
    if (busy) return;
    if (selected.size === 0) {
      setErrMsg('Select at least one client first.');
      return;
    }
    setBusy(true); setErrMsg(null); setDone(null);
    try {
      const sb = await CABT_sb();
      const ids = Array.from(selected);
      // Single bulk UPDATE — much faster than per-row when many clients.
      const { error } = await sb.from('clients')
        .update({ logging_cadence: cadence })
        .in('id', ids);
      if (error) throw error;
      setDone(`Set ${ids.length} client${ids.length === 1 ? '' : 's'} to ${cadence}`);
      setSelected(new Set());
    } catch (e) {
      setErrMsg(e?.message || 'Bulk update failed');
    }
    setBusy(false);
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Bulk cadence editor</SectionLabel>
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 10, lineHeight: 1.5 }}>
          Select multiple clients and apply weekly or monthly cadence in one shot. Cadence only controls how often CAs log <em>narrative</em> check-ins (concern, win, account-side, agency-side action).
        </div>
        <div style={{
          fontSize: 12, color: theme.ink, lineHeight: 1.55,
          padding: '10px 12px', marginBottom: 10, borderRadius: 6,
          background: 'rgba(70, 130, 180, 0.08)', border: '1px solid rgba(70, 130, 180, 0.25)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>What changes when you flip cadence</div>
          <div style={{ marginBottom: 3 }}>• <strong>Old check-ins are kept as-is</strong> — weekly entries stay weekly, monthly stay monthly. Only <em>future</em> check-ins follow the new cadence.</div>
          <div>• <strong>Scoring is unaffected.</strong> All bonus math (MRR, ad spend, leads, attrition) reads the monthly metrics table, which is always monthly regardless of cadence. No aggregation needed.</div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { v: 'all',     label: `All · ${counts.all}` },
            { v: 'monthly', label: `Monthly · ${counts.monthly}` },
            { v: 'weekly',  label: `Weekly · ${counts.weekly}` },
          ].map(f => (
            <button key={f.v} onClick={() => setFilter(f.v)} style={{
              padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 999,
              background: filter === f.v ? theme.ink : theme.surface,
              color: filter === f.v ? (theme.accentInk || '#fff') : theme.ink,
              border: `1px solid ${filter === f.v ? theme.ink : theme.rule}`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{f.label}</button>
          ))}
        </div>
      </Card>

      {/* Action bar */}
      <Card theme={theme} padding={12}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={toggleAll} style={{
            background: 'transparent', border: `1px solid ${theme.rule}`,
            color: theme.ink, fontSize: 12, fontWeight: 600,
            padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {allFilteredSelected ? 'Clear filter selection' : `Select all in filter (${filtered.length})`}
          </button>
          <div style={{ flex: 1, fontSize: 12, color: theme.inkMuted, textAlign: 'right' }}>
            <strong style={{ color: theme.ink }}>{selected.size}</strong> selected
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Button theme={theme} variant="primary" disabled={busy || selected.size === 0} onClick={() => apply('monthly')}>
            Set selected → Monthly
          </Button>
          <Button theme={theme} variant="primary" disabled={busy || selected.size === 0} onClick={() => apply('weekly')}>
            Set selected → Weekly
          </Button>
        </div>
        {done && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: STATUS.green + '15',
                       border: `1px solid ${STATUS.green}33`, borderRadius: 6, fontSize: 12, color: '#1F6E1F' }}>
            ✓ {done}
          </div>
        )}
        {errMsg && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: STATUS.red + '15',
                       border: `1px solid ${STATUS.red}33`, borderRadius: 6, fontSize: 12, color: STATUS.red }}>
            {errMsg}
          </div>
        )}
      </Card>

      {/* Client list */}
      <Card theme={theme} padding={0}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, color: theme.inkMuted, fontSize: 13, textAlign: 'center' }}>
            No clients in this filter.
          </div>
        )}
        {filtered.map(c => {
          const cad = c.loggingCadence || 'monthly';
          const isSel = selected.has(c.id);
          return (
            <button key={c.id} onClick={() => toggle(c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '12px 14px',
              borderTop: `1px solid ${theme.rule}`,
              background: isSel ? (theme.accentSoft || 'rgba(215,255,61,0.08)') : 'transparent',
              border: 'none', borderTop: `1px solid ${theme.rule}`,
              fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: `1.5px solid ${isSel ? theme.accent : theme.rule}`,
                background: isSel ? theme.accent : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSel && <Icon name="check" size={12} color={theme.bg || '#0B0E14'} stroke={3}/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: theme.inkMuted }}>{c.id}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                background: cad === 'weekly' ? (theme.accent || '#D7FF3D') : theme.rule,
                color: cad === 'weekly' ? (theme.bg || '#0B0E14') : theme.ink,
                textTransform: 'uppercase', letterSpacing: 0.4,
              }}>{cad}</span>
            </button>
          );
        })}
      </Card>
    </div>
  );
}

// ── Formula Inspector ──────────────────────────────────────────────────────
// Bobby's 2026-05-05 request: "Can we create an admin page where I can check
// the formulas and calculations?" — full transparency into how every score
// is computed for a chosen CA. Pulls from the same calc.jsx the UI uses, so
// what's shown here matches what the CA sees. Drilldown: pick a CA → see
// each bucket's inputs, formula, and per-client breakdown.
function AdminFormulaInspector({ state, theme, navigate }) {
  const cas = (state.cas || []).filter(c => c.active);
  const [selectedCaId, setSelectedCaId] = React.useState(cas[0]?.id || '');
  const [expandedSection, setExpandedSection] = React.useState({ overview: true });

  const selectedCa = cas.find(c => c.id === selectedCaId);
  const score = selectedCa ? CABT_caScorecard(selectedCa, state) : null;
  const cfg = state.config || {};

  if (cas.length === 0) {
    return <div style={{ padding: 24, color: theme.inkMuted }}>No active CAs.</div>;
  }

  const toggle = (k) => setExpandedSection(s => ({ ...s, [k]: !s[k] }));

  const Section = ({ id, title, children }) => {
    const open = !!expandedSection[id];
    return (
      <Card theme={theme} padding={0}>
        <button onClick={() => toggle(id)} style={{
          width: '100%', padding: '12px 14px', background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: theme.ink, letterSpacing: -0.1 }}>{title}</span>
          <Icon name={open ? 'chev-u' : 'chev-d'} size={16} color={theme.inkMuted}/>
        </button>
        {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
      </Card>
    );
  };

  const KV = ({ k, v, mono }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: theme.inkMuted }}>{k}</span>
      <span style={{ color: theme.ink, fontWeight: 600, fontFamily: mono ? theme.mono : 'inherit', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );

  const Formula = ({ children }) => (
    <div style={{
      background: theme.bgSoft || 'rgba(255,255,255,0.04)',
      border: `1px solid ${theme.rule}`,
      borderRadius: 8, padding: '8px 12px', fontSize: 11, fontFamily: theme.mono,
      color: theme.ink, lineHeight: 1.5, marginTop: 6, marginBottom: 0,
      wordBreak: 'break-word',
    }}>{children}</div>
  );

  // TKT-12.6 — Plain-English prose for every formula. Source text lives in
  // src/formula-explanations.js (decoupled so non-engineers can revise the
  // wording). Renders below the monospace formula with a horizontal hairline
  // separator between the math and the prose.
  const Prose = ({ id }) => {
    const text = (window.FORMULA_EXPLANATIONS || {})[id];
    if (!text) return null;
    return (
      <>
        <div style={{ height: 1, background: theme.rule, opacity: 0.5, margin: '8px 0' }}/>
        <div style={{
          fontSize: 12, lineHeight: 1.55, color: theme.inkSoft,
          padding: '0 2px', marginBottom: 8,
        }}>{text}</div>
      </>
    );
  };

  // Strict tier eligibility (Bobby 2026-07-01): only explicit standard/vip
  // count — a blank tier is NOT treated as standard, matching calc.jsx.
  const isElig = (c) => { const t = (c.tier || '').toLowerCase(); return t === 'standard' || t === 'vip'; };
  const myClients = (state.clients || []).filter(c => c.assignedCA === selectedCa?.id && !c.cancelDate);
  const eligibleClients = myClients.filter(isElig);
  const eligibleAtStart = (state.clients || []).filter(c =>
    c.assignedCA === selectedCa?.id &&
    isElig(c) &&
    c.signDate && new Date(c.signDate) < new Date(cfg.quarterStart || cfg.quarter_start || new Date())
  );

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card theme={theme} padding={14}>
        <SectionLabel theme={theme}>Formula Inspector</SectionLabel>
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 10, lineHeight: 1.5 }}>
          Pick a CA to see how their composite + each bucket is computed. Inputs, intermediate values, and formulas are all shown so any number can be cross-checked against the legacy Bonus Tracker Sheet.
        </div>
        <Field label="CA" theme={theme}>
          <Select value={selectedCaId} onChange={setSelectedCaId} theme={theme}
            options={cas.map(c => ({ value: c.id, label: `${c.id} · ${c.name}` }))}/>
        </Field>
      </Card>

      {score && (
        <>
          <Section id="overview" title={`Composite — ${(score.composite*100).toFixed(0)}/100`}>
            <Formula>
              composite = (Performance + Retention + Growth) ÷ 3<br/>
              = ({(score.performance*100).toFixed(1)} + {(score.retention*100).toFixed(1)} + {(score.growth*100).toFixed(1)}) ÷ 3<br/>
              = {(score.composite*100).toFixed(1)}
            </Formula>
            <Prose id="composite"/>
            <KV k="Performance bucket" v={(score.performance*100).toFixed(1)} mono/>
            <KV k="Retention bucket" v={(score.retention*100).toFixed(1)} mono/>
            <KV k="Growth bucket" v={(score.growth*100).toFixed(1)} mono/>
            <div style={{ borderTop: `1px solid ${theme.rule}`, marginTop: 6, paddingTop: 6 }}/>
            <KV k="Book completeness gate" v={(score.bookCompleteness*100).toFixed(1) + '%'} mono/>
            <KV k="Eligible clients (Standard + VIP)" v={score.eligibleClientCount || eligibleClients.length} mono/>
            <KV k="Clients with perf data" v={score.perfDataClientCount || 0} mono/>
          </Section>

          <Section id="performance" title={`Performance bucket — ${(score.performance*100).toFixed(0)}/100`}>
            <Formula>
              performance = (avg of per-client performance, skip nulls) × bookCompleteness<br/>
              <br/>
              per-client performance = avg of 5 sub-scores (skip nulls):<br/>
              &nbsp;&nbsp;MRR Growth · Lead Cost · Ad Spend · Funnel · Attrition
            </Formula>
            <Prose id="performance"/>
            <KV k="Raw perf avg (clients with data)" v={(score.performanceRaw*100).toFixed(1)} mono/>
            <KV k="× Book completeness gate" v={(score.bookCompleteness*100).toFixed(1) + '%'} mono/>
            <KV k="= Performance bucket" v={(score.performance*100).toFixed(1)} mono/>
            <div style={{ marginTop: 10, fontSize: 11, color: theme.inkMuted, lineHeight: 1.5 }}>
              Per-client breakdown (only clients with at least one sub-score):
            </div>
            <div style={{ marginTop: 6, fontSize: 11 }}>
              {(score.clients || []).filter(s => s.sub && s.sub.performance != null).slice(0, 20).map(s => (
                <div key={s.client.id} style={{ display: 'flex', gap: 6, padding: '4px 0', borderBottom: `1px solid ${theme.rule}` }}>
                  <span style={{ flex: 1, color: theme.ink, fontWeight: 600 }}>{s.client.name}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.mrrGrowth != null ? (s.sub.mrrGrowth*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.leadCost != null ? (s.sub.leadCost*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.adSpend != null ? (s.sub.adSpend*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.funnel != null ? (s.sub.funnel*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.inkMuted, fontFamily: theme.mono }}>{s.sub.attrition != null ? (s.sub.attrition*100).toFixed(0) : '—'}</span>
                  <span style={{ width: 60, textAlign: 'right', color: theme.ink, fontWeight: 700, fontFamily: theme.mono }}>{(s.sub.performance*100).toFixed(0)}</span>
                </div>
              ))}
              {(score.clients || []).filter(s => s.sub && s.sub.performance != null).length === 0 && (
                <div style={{ padding: 8, color: theme.inkMuted, fontStyle: 'italic' }}>
                  No clients have monthly metrics logged yet for this CA.
                </div>
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 9, color: theme.inkMuted, fontFamily: theme.mono, display: 'flex', gap: 6 }}>
              <span style={{ flex: 1 }}>CLIENT</span>
              <span style={{ width: 60, textAlign: 'right' }}>MRR↑</span>
              <span style={{ width: 60, textAlign: 'right' }}>LEAD$</span>
              <span style={{ width: 60, textAlign: 'right' }}>AD$</span>
              <span style={{ width: 60, textAlign: 'right' }}>FUNNEL</span>
              <span style={{ width: 60, textAlign: 'right' }}>ATTR</span>
              <span style={{ width: 60, textAlign: 'right' }}>PERF</span>
            </div>
          </Section>

          {/* TKT-12.6 — per-sub-score sections (5 of them) drilling into each
              Performance ingredient. Each renders monospace formula + hairline
              + plain-English prose from window.FORMULA_EXPLANATIONS. */}
          <Section id="mrrGrowth" title="Sub-score · MRR Growth">
            <Formula>
              mrrGrowth = clamp((lastMonthMRR − firstMonthMRR) ÷ fullCreditMrrGrowth, 0, 1)<br/>
              <br/>
              <span style={{ color: theme.inkMuted }}>Skipped (null) for clients younger than gracePeriodDays.</span>
            </Formula>
            <Prose id="mrrGrowth"/>
            <KV k="Full-credit threshold ($/mo)" v={`$${cfg.fullCreditMrrGrowth || 750}`} mono/>
            <KV k="Grace period (days)" v={cfg.gracePeriodDays || 90} mono/>
          </Section>

          <Section id="leadCost" title="Sub-score · Lead Cost">
            <Formula>
              ratio = SUM(adSpend across quarter) ÷ SUM(leadsGenerated across quarter)<br/>
              <br/>
              ratio ≤ best     → 1.0<br/>
              ratio ≤ great    → 0.75<br/>
              ratio ≤ ok       → 0.5<br/>
              else             → 0
            </Formula>
            <Prose id="leadCost"/>
            <KV k="Best (≤ $)" v={`$${cfg.leadCostBest || 5}`} mono/>
            <KV k="Great (≤ $)" v={`$${cfg.leadCostGreat || 10}`} mono/>
            <KV k="OK (≤ $)" v={`$${cfg.leadCostAcceptable || 20}`} mono/>
          </Section>

          <Section id="adSpend" title="Sub-score · Ad Spend">
            <Formula>
              monthlyTarget = MAX(adSpendFloor, adSpendPctOfGross × monthMRR)<br/>
              quarterTarget = SUM of monthlyTarget across the quarter<br/>
              <br/>
              adSpend = MIN(1, SUM(actual adSpend) ÷ quarterTarget)
            </Formula>
            <Prose id="adSpend"/>
            <KV k="Pct of MRR target" v={`${((cfg.adSpendPctOfGross || 0.10)*100).toFixed(0)}%`} mono/>
            <KV k="Floor (per month)" v={`$${cfg.adSpendFloor || 1000}`} mono/>
          </Section>

          <Section id="funnel" title="Sub-score · Funnel">
            <Formula>
              bookRate  = SUM(apptsBooked)  ÷ SUM(leadsGenerated)<br/>
              showRate  = SUM(leadsShowed)  ÷ SUM(apptsBooked)<br/>
              closeRate = SUM(leadsSigned)  ÷ SUM(leadsShowed)<br/>
              <br/>
              funnel = avg of clamp(rate ÷ floor, 0, 1) for each rate
            </Formula>
            <Prose id="funnel"/>
            <KV k="Booking floor" v={`${((cfg.bookingFloor || 0.30)*100).toFixed(0)}%`} mono/>
            <KV k="Show floor" v={`${((cfg.showFloor || 0.50)*100).toFixed(0)}%`} mono/>
            <KV k="Close floor" v={`${((cfg.closeFloor || 0.70)*100).toFixed(0)}%`} mono/>
          </Section>

          <Section id="attrition" title="Sub-score · Attrition">
            <Formula>
              cancelRate = SUM(studentsCancelled in quarter) ÷ firstMonth.totalStudentsStart<br/>
              <br/>
              cancelRate ≤ greenFloor → 1<br/>
              cancelRate ≥ critCeil   → 0<br/>
              else                    → 1 − (cancelRate − greenFloor) ÷ (critCeil − greenFloor)
            </Formula>
            <Prose id="attrition"/>
            <KV k="Green floor" v={`${((cfg.attritionGreenFloor || 0.03)*100).toFixed(0)}%`} mono/>
            <KV k="Critical ceiling" v={`${((cfg.attritionCriticalCeiling || 0.05)*100).toFixed(0)}%`} mono/>
          </Section>

          <Section id="retention" title={`Retention bucket — ${(score.retention*100).toFixed(0)}/100`}>
            <Formula>
              retention = (eligible_at_quarter_start − cancellations_counts_against_ca) ÷ eligible_at_quarter_start<br/>
              <br/>
              Linear from cliff ({((cfg.retentionCliff || cfg.retention_cliff || 0.97)*100).toFixed(0)}%) to 100%.<br/>
              Below cliff = 0; at 100% retained = 1.0.
            </Formula>
            <Prose id="retention"/>
            <KV k="Eligible at quarter start" v={score.eligibleAtQuarterStart || eligibleAtStart.length} mono/>
            <KV k="Cancellations counted against CA" v={score.cancelledThisQuarter || 0} mono/>
            <KV k="= Retention rate" v={
              score.eligibleAtQuarterStart > 0
                ? `${(((score.eligibleAtQuarterStart - score.cancelledThisQuarter) / score.eligibleAtQuarterStart)*100).toFixed(1)}%`
                : '—'
            } mono/>
            <KV k="Retention cliff (config)" v={`${((cfg.retentionCliff || cfg.retention_cliff || 0.97)*100).toFixed(0)}%`} mono/>
            <KV k="= Retention bucket" v={(score.retention*100).toFixed(1)} mono/>
          </Section>

          <Section id="growth" title={`Growth bucket — ${(score.growth*100).toFixed(0)}/100`}>
            <Formula>
              growth = total_points ÷ max_points<br/>
              max_points = 8 × eligible_clients (90+ days old, Standard or VIP)<br/>
              <br/>
              Per client (1pt each, max 8):<br/>
              &nbsp;&nbsp;• Review obtained this quarter<br/>
              &nbsp;&nbsp;• Testimonial obtained<br/>
              &nbsp;&nbsp;• Case study obtained<br/>
              &nbsp;&nbsp;• ≥1 referral this quarter<br/>
              &nbsp;&nbsp;• On VIP tier<br/>
              &nbsp;&nbsp;• Has membership add-on<br/>
              &nbsp;&nbsp;• Has gear / products<br/>
              &nbsp;&nbsp;• +0.25 per extra referral, capped at +1
            </Formula>
            <Prose id="growth"/>
            <KV k="Eligible 90+ day clients" v={score.growthEligibleCount || 0} mono/>
            <KV k="Max possible points" v={(score.growthEligibleCount || 0) * 8} mono/>
            <KV k="= Growth bucket" v={(score.growth*100).toFixed(1)} mono/>
          </Section>

          <Section id="payout" title={`Bonus Payout — ${CABT_fmtMoney(score.finalPayout)}`}>
            <Formula>
              final_payout = total_pot × mrr_share × composite<br/>
              total_pot = agency_gross_last_month × pot_pct (from quarter_inputs)<br/>
              mrr_share = CA's eligible-MRR ÷ all eligible-MRR (across active CAs)
            </Formula>
            <Prose id="payout"/>
            <KV k="Total pot" v={CABT_fmtMoney(score.totalPot || 0)} mono/>
            <KV k="CA's eligible MRR" v={CABT_fmtMoney(score.caEligibleMrr || 0)} mono/>
            <KV k="MRR share" v={`${((score.mrrShare || 0)*100).toFixed(2)}%`} mono/>
            <KV k="× Composite" v={(score.composite*100).toFixed(1) + '%'} mono/>
            <KV k="= Final payout" v={CABT_fmtMoney(score.finalPayout)} mono/>
            <KV k="Max payout (at 100% composite)" v={CABT_fmtMoney(score.maxPayout)} mono/>
            {(score.totalPot || 0) === 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef0f0', border: '1px solid #d9535380', borderRadius: 6, fontSize: 11, color: '#7d2828' }}>
                Total pot = $0 because <strong>quarter_inputs</strong> for this quarter is not set. Open <strong>Admin → Bonus</strong> and enter agency gross + pot %.
              </div>
            )}
          </Section>

          <Section id="config" title="Config thresholds (live)">
            <KV k="Performance · MRR Growth full credit" v={`$${cfg.fullCreditMrrGrowth || 750}/mo`} mono/>
            <KV k="Performance · Lead Cost best" v={`≤ $${cfg.leadCostBest || 5}`} mono/>
            <KV k="Performance · Lead Cost great" v={`≤ $${cfg.leadCostGreat || 10}`} mono/>
            <KV k="Performance · Lead Cost OK" v={`≤ $${cfg.leadCostAcceptable || 20}`} mono/>
            <KV k="Performance · Ad Spend % of MRR" v={`${((cfg.adSpendPctOfGross || 0.10)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Ad Spend floor" v={`$${cfg.adSpendFloor || 1000}`} mono/>
            <KV k="Performance · Funnel booking floor" v={`${((cfg.bookingFloor || 0.30)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Funnel show floor" v={`${((cfg.showFloor || 0.50)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Funnel close floor" v={`${((cfg.closeFloor || 0.70)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Attrition green floor" v={`${((cfg.attritionGreenFloor || 0.03)*100).toFixed(0)}%`} mono/>
            <KV k="Performance · Attrition critical ceil" v={`${((cfg.attritionCriticalCeiling || 0.05)*100).toFixed(0)}%`} mono/>
            <KV k="Retention · Cliff" v={`${((cfg.retentionCliff || 0.97)*100).toFixed(0)}%`} mono/>
            <KV k="Grace period (days)" v={cfg.gracePeriodDays || 90} mono/>
            <KV k="Pot · Default %" v={`${((cfg.potPercentage || 0.005)*100).toFixed(2)}%`} mono/>
          </Section>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AdminDashboard — Bobby 2026-05-05 ("dashboard that I can view that shows
// me everything for all of the accounts in a clear view... compare booked
// leads, showed leads, generated leads, monthly recurring revenue... I also
// want to be able to sort the data too").
// One sortable table, one row per active client, with all the metrics he
// referenced. Quarter window comes from config (falls back to current calendar
// quarter). Reads effective monthly metrics so weekly entries roll up.
// ─────────────────────────────────────────────────────────────────────────
function AdminDashboard({ state, theme, navigate, scopeCa }) {
  // scopeCa (optional) — when set, restricts the dashboard to clients
  // assigned to that CA. Used by the CA Accounts view (Bobby 2026-05-05:
  // "Lets make this Dashboard accessible on the The Accounts seciton too").
  const cfg = state.config || {};
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);

  // Bobby 2026-05-06: "I want to also be able to filter based on date range...
  // per month, quarter, year, etc." Period selector with presets + custom.
  const [period, setPeriod] = React.useState('quarter'); // month | quarter | year | all | custom
  const [customStart, setCustomStart] = React.useState('');
  const [customEnd,   setCustomEnd]   = React.useState('');

  const periodWindow = (() => {
    const y = today.getFullYear();
    if (period === 'month') {
      const start = new Date(y, today.getMonth(), 1);
      const end   = new Date(y, today.getMonth() + 1, 0);
      return { start: iso(start), end: iso(end), label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    }
    if (period === 'quarter') {
      const qIdx = Math.floor(today.getMonth() / 3);
      const start = new Date(y, qIdx * 3, 1);
      const end   = new Date(y, qIdx * 3 + 3, 0);
      const cfgStart = cfg.quarterStart || cfg.quarter_start;
      const cfgEnd   = cfg.quarterEnd   || cfg.quarter_end;
      return { start: cfgStart || iso(start), end: cfgEnd || iso(end), label: `Q${qIdx + 1} ${y}` };
    }
    if (period === 'year') {
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y}` };
    }
    if (period === 'all') {
      return { start: '0000-01-01', end: '9999-12-31', label: 'All time' };
    }
    // custom
    return {
      start: customStart || '0000-01-01',
      end:   customEnd   || '9999-12-31',
      label: customStart && customEnd ? `${customStart} → ${customEnd}` : 'Custom (set dates)',
    };
  })();
  const qStart = periodWindow.start;
  const qEnd   = periodWindow.end;

  const [includeCancelled, setIncludeCancelled] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [sortKey, setSortKey] = React.useState('name');
  const [sortDir, setSortDir] = React.useState('asc');
  // Pagination — Bobby 2026-05-05: default 50, dropdown for 10/25/50/100/all.
  const [pageSize, setPageSize] = React.useState(50);
  const [pageIndex, setPageIndex] = React.useState(0);

  // TKT-12.3 — Tier multi-select + CA filter + column chooser, all
  // persisted to localStorage so each admin's preferences survive reloads.
  const lsGet = (k, fallback) => {
    try {
      const v = window.localStorage && window.localStorage.getItem(k);
      return v == null ? fallback : JSON.parse(v);
    } catch (_e) { return fallback; }
  };
  const lsSet = (k, v) => {
    try { window.localStorage && window.localStorage.setItem(k, JSON.stringify(v)); } catch (_e) {}
  };
  // Bobby 2026-05-07 ("these filters arent working"): the À la carte chip
  // was storing 'a la carte' (spaces) but the DB enum is 'a_la_carte'
  // (underscore), so À la carte clients never matched the filter. Fix is
  // below at the chip definition; here we also migrate any persisted bad
  // value so users locked into ['standard','vip','reach','a la carte']
  // pick up the correct value on next mount.
  const [tierFilter, setTierFilter] = React.useState(() => {
    const raw = lsGet('dash:tiers', ['standard', 'vip']);
    return Array.isArray(raw)
      ? raw.map(v => v === 'a la carte' ? 'a_la_carte' : v)
      : ['standard', 'vip'];
  });
  React.useEffect(() => { lsSet('dash:tiers', tierFilter); }, [tierFilter]);
  const [caFilter, setCaFilter] = React.useState(() => lsGet('dash:caFilter', 'all'));
  React.useEffect(() => { lsSet('dash:caFilter', caFilter); }, [caFilter]);
  // Visible-column set (managed by the gear-icon ColumnChooser modal).
  // Default visible columns — Bobby 2026-05-07 Slack feedback on the
  // TKT-12.3 PRD-strict 13-col default: "the dashboard metrics should have
  // all columns — i like these but the ones that used to be there are
  // missing now too". Union of pre-TKT-12.3 dashboard cols (Code · Client ·
  // CA · Tier · Composite · MRR · Revenue · Ad Spend · Lead $ · Leads ·
  // Booked · Showed · Signed · Cancel · Months) + PRD-12.3 additions
  // (Status · Sign date · Months on book · Last metric · Performance ·
  // Retention · Growth) = 22 columns visible by default. Anything else is
  // still available via the column chooser.
  // localStorage key bumped to `dash:cols:v2` so existing 13-col users pick
  // up the new defaults instead of staying frozen on the prior set.
  const DEFAULT_VISIBLE_COLS = [
    'code', 'name', 'tier', 'caName', 'status', 'signDate', 'monthsOnBook',
    'mrr', 'revenue', 'adSpend', 'leadCost',
    'leadsGenerated', 'apptsBooked', 'leadsShowed', 'leadsSigned',
    // Kurt 2026-07-29: show the funnel conversion rates next to the raw counts
    // (booked ÷ leads, showed ÷ booked, signed ÷ showed) — they already existed
    // in the registry but were off by default, so nobody saw them.
    'bookingRate', 'showRate', 'closeRate',
    'studentsCancelled',
    'composite', 'performanceScore', 'retentionScore', 'growthScore',
    'lastMetric', 'monthsCoverage',
  ];
  // Column choices persist per browser, so simply adding a column to
  // DEFAULT_VISIBLE_COLS would never reach anyone who already has a saved set.
  // v3 migrates the v2 selection forward and folds in the funnel-rate columns,
  // so the new columns appear without wiping anyone's customisation.
  const [visibleCols, setVisibleCols] = React.useState(() => {
    const v3 = lsGet('dash:cols:v3', null);
    if (v3) return new Set(v3);
    const v2 = lsGet('dash:cols:v2', null);
    if (v2) return new Set([...v2, 'bookingRate', 'showRate', 'closeRate']);
    return new Set(DEFAULT_VISIBLE_COLS);
  });
  React.useEffect(() => { lsSet('dash:cols:v3', Array.from(visibleCols)); }, [visibleCols]);
  const [chooserOpen, setChooserOpen] = React.useState(false);

  // Bobby 2026-05-15: sticky Client column was covering data on phones.
  // Make its width adjustable via a drag handle on the right edge of the
  // column header. Persisted per browser; clamped to 80–360px.
  const [clientColWidth, setClientColWidth] = React.useState(() => {
    const v = Number(lsGet('dash:clientColWidth', 160));
    return Number.isFinite(v) ? Math.max(80, Math.min(360, v)) : 160;
  });
  React.useEffect(() => { lsSet('dash:clientColWidth', clientColWidth); }, [clientColWidth]);

  // Reset page index whenever the visible result-set might shrink.
  React.useEffect(() => { setPageIndex(0); }, [search, includeCancelled, pageSize, tierFilter.join(','), caFilter]);

  // Bobby 2026-07-01: don't treat a blank tier as "standard" — unmarked
  // clients shouldn't ride in on the default Standard+VIP filter. A blank
  // tier only shows when the user explicitly includes it in the filter.
  const tierMatch = (c) => tierFilter.includes(((c.tier || '') + '').toLowerCase());
  const caMatch = (c) => {
    if (scopeCa) return c.assignedCA === scopeCa;
    if (caFilter === 'all') return true;
    return c.assignedCA === caFilter;
  };
  const allClients = (state.clients || [])
    .filter(caMatch)
    .filter(c => includeCancelled ? true : !c.cancelDate)
    .filter(tierMatch)
    .filter(c => !search ||
      (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.id   || '').toLowerCase().includes(search.toLowerCase()));

  // Months in the active window. Parses YYYY-MM-DD directly so timezone
  // doesn't shift the month boundary (Bobby 2026-05-06: dashboard read "1/4"
  // for "this quarter" because new Date('2026-04-01') in a UTC- offset zone
  // returned March via getMonth(), inflating the count to 4).
  const monthsBetweenIso = (a, b) => {
    if (!a || !b) return 0;
    const [ay, am] = String(a).split('-').map(Number);
    const [by, bm] = String(b).split('-').map(Number);
    if (!ay || !am || !by || !bm) return 0;
    return Math.max(1, (by - ay) * 12 + (bm - am) + 1);
  };
  // For non-"all" periods this is uniform across rows; for "all" we use a
  // per-client expected (months since signDate → today/cancelDate).
  const monthsInWindow = period === 'all' ? null : monthsBetweenIso(qStart, qEnd);
  const todayIsoStr = iso(today);
  const monthsForClient = (c) => {
    if (period !== 'all') return monthsInWindow;
    if (!c.signDate) return null;
    const endIso = c.cancelDate || todayIsoStr;
    return monthsBetweenIso(c.signDate.slice(0, 7) + '-01', endIso);
  };

  // Build one row per client — aggregated over the active window. Includes
  // every available data point so the column-chooser (TKT-12.3c) can let
  // admins toggle any of them. Heavy lookups (last review/testimonial/etc.)
  // are computed once here; the column registry only formats them.
  const allEvents = state.growthEvents || [];
  const allSurveys = state.surveys || [];
  const allWeeklyCheckins  = state.weeklyCheckins  || [];
  const allMonthlyCheckins = state.monthlyCheckins || [];
  const allMonthlyMetricsState = state.monthlyMetrics || [];
  const allWeeklyMetricsState  = state.weeklyMetrics  || [];

  const rows = allClients.map(c => {
    const eff = (typeof CABT_effectiveMonthlyMetrics === 'function')
      ? CABT_effectiveMonthlyMetrics(state.monthlyMetrics, state.weeklyMetrics, c.id)
      : allMonthlyMetricsState.filter(m => m.clientId === c.id);
    const inQ = eff.filter(m => m.month && m.month >= qStart && m.month <= qEnd);
    const last = inQ[inQ.length - 1];
    const sumQ = (k) => inQ.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const firstStart = inQ[0]?.totalStudentsStart || 0;
    const sub = CABT_clientSubScores(c, allMonthlyMetricsState, allSurveys, state.config, today, allWeeklyMetricsState);
    const ca = (state.cas || []).find(x => x.id === c.assignedCA);
    const ae  = (state.sales || []).find(x => x.id === c.ae);
    const sdr = (state.sales || []).find(x => x.id === c.sdrBookedBy);

    const qLeads  = sumQ('leadsGenerated');
    const qSpend  = sumQ('adSpend');
    const qBooked = sumQ('apptsBooked');
    const qShowed = sumQ('leadsShowed');
    const qSigned = sumQ('leadsSigned');
    const qCancel = sumQ('studentsCancelled');

    // Last engagement timestamps (latest event/survey/check-in by this client)
    const latestDate = (rows, dateKey, filter) => {
      let best = null;
      for (const r of rows) {
        if (filter && !filter(r)) continue;
        const d = r[dateKey];
        if (!d) continue;
        if (best == null || d > best) best = d;
      }
      return best;
    };
    const eventsForClient = allEvents.filter(e => e.clientId === c.id);
    const surveysForClient = allSurveys.filter(s => s.clientId === c.id);
    const lastReview      = latestDate(eventsForClient, 'date', e => (e.eventType || '').toLowerCase().includes('review'));
    const lastTestimonial = latestDate(eventsForClient, 'date', e => (e.eventType || '').toLowerCase().includes('testimonial'));
    const lastReferral    = latestDate(eventsForClient, 'date', e => (e.eventType || '').toLowerCase().includes('referral'));
    const lastSurvey      = latestDate(surveysForClient, 'date');
    const lastWeeklyCheckin  = latestDate(allWeeklyCheckins.filter(w => w.clientId === c.id), 'weekStart');
    const hasGearEvents   = eventsForClient.some(e => (e.eventType || '').toLowerCase().includes('gear'));

    // Flagged-inactive in the active window? (TKT-12.2)
    const flaggedInactiveInWindow = [
      ...allMonthlyMetricsState, ...allWeeklyMetricsState,
      ...allMonthlyCheckins, ...allWeeklyCheckins,
    ].some(r => r && r.clientId === c.id && r.flaggedInactive && (() => {
      const d = r.month || r.weekStart;
      return d && d >= qStart && d <= qEnd;
    })());

    // Months-on-book = months since signDate to today (or cancelDate if cancelled)
    const monthsOnBook = c.signDate
      ? monthsBetweenIso(c.signDate.slice(0, 7) + '-01', c.cancelDate || todayIsoStr)
      : null;

    // Last metric period as ISO (used both for sort + display)
    const lastMetricIso = last ? last.month : null;

    // Per-client Retention (TKT-12.3 spec): 1.0 if active and not flagged
    // inactive in the period; 0.0 if cancelled or flagged.
    const perClientRetention = (c.cancelDate || flaggedInactiveInWindow) ? 0 : 1;

    // Per-client Growth (Formula Guide §GROWTH at the per-client level):
    // 1pt each — review, testimonial, case study, ≥1 referral, VIP tier,
    // membership add-on, gear/products. Plus 0.25 per extra referral capped
    // at +1. Max 8 per client. Only count events in the active window.
    const eventsInWindow = eventsForClient.filter(e => e.date && e.date >= qStart && e.date <= qEnd);
    const has = (term) => eventsInWindow.some(e => (e.eventType || '').toLowerCase().includes(term));
    const refs = eventsInWindow.filter(e => (e.eventType || '').toLowerCase().includes('referral')).length;
    let growthPts = 0;
    if (has('review'))      growthPts += 1;
    if (has('testimonial')) growthPts += 1;
    if (has('case'))        growthPts += 1;
    if (refs >= 1)          growthPts += 1;
    if ((c.tier || '').toLowerCase() === 'vip') growthPts += 1;
    if (c.hasMembershipAddon)                   growthPts += 1;
    if (has('gear'))        growthPts += 1;
    if (refs > 1)           growthPts += Math.min(1, (refs - 1) * 0.25);
    const perClientGrowth = growthPts / 8;

    // MRR trend — 12-month sparkline data (most recent 12 months including
    // anything we have, oldest → newest). Used by the MRR Trend column.
    const trend12 = (() => {
      const rows = (CABT_effectiveMonthlyMetrics
        ? CABT_effectiveMonthlyMetrics(state.monthlyMetrics, state.weeklyMetrics, c.id)
        : allMonthlyMetricsState.filter(m => m.clientId === c.id)).slice();
      rows.sort((a, b) => (a.month || '').localeCompare(b.month || ''));
      return rows.slice(-12).map(r => Number(r.clientMRR || 0));
    })();

    // Bobby 2026-05-12: "Soulcraft has 2 months of metrics. That means 2
    // months of Gross Revenue. So under MRR, it should be the average over
    // all the months that we have data on. If we add revenue for the 2nd
    // month, we should see the average calculated in the MRR column."
    //
    // The stored client_mrr is set at submit time (form's computeRollingMRR)
    // but doesn't cascade-update when neighbor months are added/edited —
    // and the historical SQL import wrote MRR equal to gross verbatim
    // (no average). Derive the displayed MRR fresh from the trailing-3
    // months of gross revenue across the client's full history, ignoring
    // months with $0 gross so a placeholder row doesn't drag the avg down.
    const displayMRR = (() => {
      const allRows = (CABT_effectiveMonthlyMetrics
        ? CABT_effectiveMonthlyMetrics(state.monthlyMetrics, state.weeklyMetrics, c.id)
        : allMonthlyMetricsState.filter(m => m.clientId === c.id)).slice();
      allRows.sort((a, b) => (b.month || '').localeCompare(a.month || '')); // desc
      const trailingGrosses = allRows
        .map(m => Number(m.clientGrossRevenue || m.clientMRR || 0))
        .filter(v => v > 0)
        .slice(0, 3);
      return trailingGrosses.length > 0
        ? trailingGrosses.reduce((a, b) => a + b, 0) / trailingGrosses.length
        : 0;
    })();

    return {
      id: c.id,
      code: c.id,
      name: c.name,
      caName: ca ? ca.name : '—',
      caId:   ca ? ca.id   : '',
      aeName:  ae  ? ae.name  : '—',
      sdrName: sdr ? sdr.name : '—',
      tier: (c.tier || 'standard'),
      cancelled: !!c.cancelDate,
      status: c.cancelDate ? 'cancelled' : 'active',
      cancelDate:   c.cancelDate || null,
      cancelReason: c.cancelReason || null,
      signDate:    c.signDate || null,
      termMonths:  c.termMonths || null,
      monthsOnBook,
      monthlyRetainer: Number(c.monthlyRetainer || 0),
      mrr:        displayMRR,
      stripeMrr:  last ? (last.stripeObservedMRR != null ? Number(last.stripeObservedMRR) : null) : null,
      revenue:    last ? Number(last.clientGrossRevenue || last.clientMRR || 0) : 0,
      adSpend:    qSpend,
      leadCost:   qLeads > 0 ? qSpend / qLeads : 0,
      leadsGenerated: qLeads,
      apptsBooked:    qBooked,
      leadsShowed:    qShowed,
      leadsSigned:    qSigned,
      bookingRate:    qLeads  > 0 ? qBooked / qLeads  : null,
      showRate:       qBooked > 0 ? qShowed / qBooked : null,
      closeRate:      qShowed > 0 ? qSigned / qShowed : null,
      studentsStart:  firstStart,
      studentsCancelled: qCancel,
      attritionRate:   firstStart > 0 ? qCancel / firstStart : null,
      composite:       sub.performance != null ? sub.performance : null,
      // Per-client interpretation of the three CA-level buckets, per Bobby's
      // PRD addendum default-visible list. Performance ≡ composite (avg of
      // 5 perf sub-scores); Retention is 1/0 per client; Growth is the 8-pt
      // scale at the client level.
      performanceScore: sub.performance != null ? sub.performance : null,
      retentionScore:   perClientRetention,
      growthScore:      perClientGrowth,
      mrrGrowthScore:  sub.mrrGrowth,
      leadCostScore:   sub.leadCost,
      adSpendScore:    sub.adSpend,
      funnelScore:     sub.funnel,
      attritionScore:  sub.attrition,
      satisfaction:    sub.satisfaction,
      mrrTrend:        trend12,
      lastMetric:    lastMetricIso,
      lastReview, lastTestimonial, lastReferral, lastSurvey, lastWeeklyCheckin,
      hasMembershipAddon: !!c.hasMembershipAddon,
      hasGear:            hasGearEvents,
      isVip:              ((c.tier || '').toLowerCase() === 'vip'),
      flaggedInactive:    flaggedInactiveInWindow,
      monthsLogged:   inQ.length,
      monthsExpected: monthsForClient(c),
    };
  });

  // Sort
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const setSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'name' || k === 'caName' ? 'asc' : 'desc'); }
  };

  // Bobby 2026-05-12: "When i scroll on this page...i want the Client column
  // to remain static. When i scroll to the left i cannot see the Client name."
  // The "Client" column (id='name') is now sticky-left so it stays visible
  // while the rest of the table scrolls horizontally. Header gets z-index 3
  // (top + left corner — must overlay both header and sticky column),
  // sticky body cells get z-index 1 (overlay normal scrolling cells), normal
  // header cells get z-index 2.
  // Drag-to-resize handler — Bobby 2026-05-15. Used on the sticky Client
  // column header. Tracks pointer delta from drag start and clamps the
  // resulting width to [80, 360]px. Works for both mouse and touch.
  const startResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX != null ? e.clientX : (e.touches && e.touches[0]?.clientX) || 0;
    const startWidth = clientColWidth;
    const onMove = (mv) => {
      const x = mv.clientX != null ? mv.clientX : (mv.touches && mv.touches[0]?.clientX) || 0;
      const next = Math.max(80, Math.min(360, startWidth + (x - startX)));
      setClientColWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  const Th = ({ k, children, align = 'left', width, sticky, resizable }) => {
    const active = sortKey === k;
    return (
      <th onClick={() => setSort(k)} style={{
        textAlign: align, padding: '10px 8px',
        fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
        color: active ? theme.ink : theme.inkMuted,
        cursor: 'pointer', borderBottom: `1px solid ${theme.rule}`,
        background: theme.bgElev,
        position: 'sticky',
        top: 0,
        left: sticky ? 0 : undefined,
        zIndex: sticky ? 3 : 2,
        whiteSpace: 'nowrap', userSelect: 'none', width,
        minWidth: width, maxWidth: width,
        // Right edge shadow on the sticky column so its boundary is visible
        // when the next column scrolls behind it.
        boxShadow: sticky ? `inset -1px 0 0 ${theme.rule}` : undefined,
      }}>
        <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' }}>
          {children}
        </span>
        {active && <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
        {resizable && (
          <span
            onClick={(e) => e.stopPropagation()}
            onMouseDown={startResize}
            onTouchStart={startResize}
            title="Drag to resize"
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: 14, cursor: 'col-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent', touchAction: 'none',
            }}
          >
            <span style={{
              width: 2, height: '50%', background: theme.inkMuted, opacity: 0.4, borderRadius: 1,
            }}/>
          </span>
        )}
      </th>
    );
  };
  const Td = ({ children, align = 'left', mono, color, bold, status, sticky, width }) => (
    <td style={{
      padding: '10px 8px', fontSize: 12,
      color: color || theme.ink,
      fontFamily: mono ? (theme.mono || 'monospace') : 'inherit',
      fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      fontWeight: bold ? 700 : 500,
      textAlign: align, whiteSpace: 'nowrap',
      overflow: width ? 'hidden' : undefined,
      textOverflow: width ? 'ellipsis' : undefined,
      width, minWidth: width, maxWidth: width,
      borderBottom: `1px solid ${theme.rule}`,
      position: sticky ? 'sticky' : undefined,
      left: sticky ? 0 : undefined,
      zIndex: sticky ? 1 : undefined,
      // Opaque background so scrolled content doesn't bleed through.
      background: sticky ? theme.surface : undefined,
      boxShadow: sticky ? `inset -1px 0 0 ${theme.rule}` : undefined,
    }}>
      {status && (
        <span style={{
          display: 'inline-block', width: 8, height: 8, borderRadius: 4,
          background: STATUS[status] || theme.inkMuted, marginRight: 6,
          verticalAlign: 'middle',
        }}/>
      )}
      {children}
    </td>
  );
  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
  const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pct = (n) => (n == null ? '—' : (n * 100).toFixed(0));
  const pctRate = (n) => (n == null ? '—' : (n * 100).toFixed(1) + '%');
  // Kurt 2026-08-03: a funnel rate can legitimately exceed 100% — family
  // members, walk-ins, and reactivated students sign up without passing through
  // the previous step. Mark those with an asterisk that explains itself on
  // hover, so the number doesn't just read as an error.
  const OVER_100_NOTE = 'Over 100% — more than the previous step. This can be legitimate: '
    + 'family members, walk-ins, or reactivated students who signed up without '
    + 'going through the full funnel.';
  const pctRateFlagged = (n) => {
    if (n == null) return '—';
    const txt = (n * 100).toFixed(1) + '%';
    if (n <= 1) return txt;
    return (
      <span title={OVER_100_NOTE} style={{ cursor: 'help' }}>
        {txt}
        <span style={{ color: STATUS.yellow, fontWeight: 800, marginLeft: 2 }}>*</span>
      </span>
    );
  };
  const status = (n) => (n == null ? 'gray' : (n >= 0.80 ? 'green' : n >= 0.60 ? 'yellow' : 'red'));
  const formatDate = (iso) => {
    if (!iso) return '—';
    try { return CABT_fmtDate(iso); } catch (_e) { return iso; }
  };
  const formatBool = (b) => (b ? 'Yes' : '—');

  // ── TKT-12.3c — Column registry ───────────────────────────────────────
  // Single source of truth for what's renderable in the dashboard table.
  // Each entry: id, label, group, align, sortKey, render(row).
  // visibleCols (Set, persisted in localStorage) decides which appear.
  const COLUMNS = [
    // Identity
    { id: 'code',         label: 'Code',         group: 'Identity', align: 'left',  sortKey: 'id',
      render: (r) => <span style={{ fontFamily: theme.mono || 'monospace', color: theme.inkMuted }}>{r.code}</span> },
    { id: 'name',         label: 'Client',       group: 'Identity', align: 'left',  sortKey: 'name',
      render: (r) => <>
        <span style={{ fontWeight: 700 }}>{r.name}</span>
        {r.cancelled && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: STATUS.red, letterSpacing: 0.4, textTransform: 'uppercase' }}>cancelled</span>}
      </> },
    { id: 'tier',         label: 'Tier',         group: 'Identity', align: 'left',  sortKey: 'tier',
      render: (r) => <span style={{ textTransform: 'uppercase', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: theme.inkSoft }}>{r.tier}</span> },
    { id: 'status',       label: 'Status',       group: 'Identity', align: 'left',  sortKey: 'status',
      render: (r) => <span style={{
        display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
        padding: '2px 6px', borderRadius: 8,
        background: r.cancelled ? 'rgba(220,60,60,0.12)' : 'rgba(67,160,71,0.12)',
        color: r.cancelled ? STATUS.red : STATUS.green,
      }}>{r.status}</span> },
    { id: 'cancelDate',   label: 'Cancel date',  group: 'Identity', align: 'left',  sortKey: 'cancelDate',
      mono: true, render: (r) => formatDate(r.cancelDate) },
    { id: 'cancelReason', label: 'Cancel reason', group: 'Identity', align: 'left', sortKey: 'cancelReason',
      render: (r) => r.cancelReason || '—' },
    // Ownership
    { id: 'caName',       label: 'CA',           group: 'Ownership', align: 'left',  sortKey: 'caName',
      render: (r) => <span style={{ color: theme.inkSoft }}>{r.caName}</span> },
    { id: 'aeName',       label: 'AE',           group: 'Ownership', align: 'left',  sortKey: 'aeName',
      render: (r) => <span style={{ color: theme.inkSoft }}>{r.aeName}</span> },
    { id: 'sdrName',      label: 'SDR',          group: 'Ownership', align: 'left',  sortKey: 'sdrName',
      render: (r) => <span style={{ color: theme.inkSoft }}>{r.sdrName}</span> },
    { id: 'signDate',     label: 'Sign date',    group: 'Ownership', align: 'left',  sortKey: 'signDate',
      mono: true, render: (r) => formatDate(r.signDate) },
    { id: 'termMonths',   label: 'Term',         group: 'Ownership', align: 'right', sortKey: 'termMonths',
      mono: true, render: (r) => r.termMonths == null ? '—' : `${r.termMonths} mo` },
    { id: 'monthsOnBook', label: 'Months on book', group: 'Ownership', align: 'right', sortKey: 'monthsOnBook',
      mono: true, render: (r) => r.monthsOnBook == null ? '—' : r.monthsOnBook },
    // Revenue
    { id: 'monthlyRetainer', label: 'Retainer',  group: 'Revenue',  align: 'right', sortKey: 'monthlyRetainer',
      mono: true, render: (r) => money(r.monthlyRetainer) },
    { id: 'mrr',          label: 'MRR',          group: 'Revenue',  align: 'right', sortKey: 'mrr',
      mono: true, render: (r) => money(r.mrr) },
    { id: 'stripeMrr',    label: 'Stripe MRR',   group: 'Revenue',  align: 'right', sortKey: 'stripeMrr',
      mono: true, render: (r) => money(r.stripeMrr) },
    { id: 'mrrTrend',     label: 'MRR Trend',    group: 'Revenue',  align: 'right', sortKey: 'mrr',
      render: (r) => <Sparkline values={r.mrrTrend} theme={theme}/> },
    { id: 'revenue',      label: 'Revenue',      group: 'Revenue',  align: 'right', sortKey: 'revenue',
      mono: true, render: (r) => money(r.revenue) },
    // Funnel
    { id: 'adSpend',      label: 'Ad Spend',     group: 'Funnel',   align: 'right', sortKey: 'adSpend',
      mono: true, render: (r) => money(r.adSpend) },
    { id: 'leadCost',     label: 'Lead $',       group: 'Funnel',   align: 'right', sortKey: 'leadCost',
      mono: true, render: (r) => r.leadCost ? money(r.leadCost) : '—' },
    { id: 'leadsGenerated', label: 'Leads',      group: 'Funnel',   align: 'right', sortKey: 'leadsGenerated',
      mono: true, render: (r) => fmt(r.leadsGenerated) },
    { id: 'apptsBooked',  label: 'Booked',       group: 'Funnel',   align: 'right', sortKey: 'apptsBooked',
      mono: true, render: (r) => fmt(r.apptsBooked) },
    { id: 'leadsShowed',  label: 'Showed',       group: 'Funnel',   align: 'right', sortKey: 'leadsShowed',
      mono: true, render: (r) => fmt(r.leadsShowed) },
    { id: 'leadsSigned',  label: 'Signed',       group: 'Funnel',   align: 'right', sortKey: 'leadsSigned',
      mono: true, render: (r) => fmt(r.leadsSigned) },
    // Labels mirror the count columns they sit beside (Booked → Booked %), per
    // Kurt 2026-07-29: booked ÷ leads, showed ÷ booked, signed ÷ showed.
    { id: 'bookingRate',  label: 'Booked %',     group: 'Funnel',   align: 'right', sortKey: 'bookingRate',
      mono: true, render: (r) => pctRateFlagged(r.bookingRate) },
    { id: 'showRate',     label: 'Showed %',     group: 'Funnel',   align: 'right', sortKey: 'showRate',
      mono: true, render: (r) => pctRateFlagged(r.showRate) },
    { id: 'closeRate',    label: 'Signed %',     group: 'Funnel',   align: 'right', sortKey: 'closeRate',
      mono: true, render: (r) => pctRateFlagged(r.closeRate) },
    // Students
    { id: 'studentsStart', label: 'Students',    group: 'Students', align: 'right', sortKey: 'studentsStart',
      mono: true, render: (r) => fmt(r.studentsStart) },
    // "Acquired" removed 2026-06-19 (Bobby, Loom): redundant with "Closed".
    { id: 'studentsCancelled', label: 'Cancel', group: 'Students',  align: 'right', sortKey: 'studentsCancelled',
      mono: true, render: (r) => <span style={{ color: r.studentsCancelled > 0 ? STATUS.red : theme.ink }}>{fmt(r.studentsCancelled)}</span> },
    { id: 'attritionRate', label: 'Attrition %', group: 'Students', align: 'right', sortKey: 'attritionRate',
      mono: true, render: (r) => pctRate(r.attritionRate) },
    // Sub-scores (per-client). Bobby's PRD lists Performance / Retention /
    // Growth alongside Composite — included as separate columns even though
    // Performance ≡ Composite per-client (it's literally the same value;
    // the registry just shows it twice for users who want both labelled).
    { id: 'composite',     label: 'Composite',   group: 'Sub-scores', align: 'right', sortKey: 'composite',
      mono: true, render: (r) => <>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: STATUS[status(r.composite)] || theme.inkMuted, marginRight: 6, verticalAlign: 'middle' }}/>
        <strong>{pct(r.composite)}</strong>
      </> },
    { id: 'performanceScore', label: 'Performance', group: 'Sub-scores', align: 'right', sortKey: 'performanceScore',
      mono: true, render: (r) => pct(r.performanceScore) },
    { id: 'retentionScore', label: 'Retention',   group: 'Sub-scores', align: 'right', sortKey: 'retentionScore',
      mono: true, render: (r) => pct(r.retentionScore) },
    { id: 'growthScore',    label: 'Growth',      group: 'Sub-scores', align: 'right', sortKey: 'growthScore',
      mono: true, render: (r) => pct(r.growthScore) },
    { id: 'mrrGrowthScore', label: 'MRR Growth', group: 'Sub-scores', align: 'right', sortKey: 'mrrGrowthScore',
      mono: true, render: (r) => pct(r.mrrGrowthScore) },
    { id: 'leadCostScore',  label: 'Lead Cost',  group: 'Sub-scores', align: 'right', sortKey: 'leadCostScore',
      mono: true, render: (r) => pct(r.leadCostScore) },
    { id: 'adSpendScore',   label: 'Ad Spend (score)', group: 'Sub-scores', align: 'right', sortKey: 'adSpendScore',
      mono: true, render: (r) => pct(r.adSpendScore) },
    { id: 'funnelScore',    label: 'Funnel',     group: 'Sub-scores', align: 'right', sortKey: 'funnelScore',
      mono: true, render: (r) => pct(r.funnelScore) },
    { id: 'attritionScore', label: 'Attrition (score)', group: 'Sub-scores', align: 'right', sortKey: 'attritionScore',
      mono: true, render: (r) => pct(r.attritionScore) },
    { id: 'satisfaction',   label: 'Satisfaction', group: 'Sub-scores', align: 'right', sortKey: 'satisfaction',
      mono: true, render: (r) => pct(r.satisfaction) },
    // Engagement
    { id: 'lastMetric',     label: 'Last metric',     group: 'Engagement', align: 'left', sortKey: 'lastMetric',
      mono: true, render: (r) => formatDate(r.lastMetric) },
    { id: 'lastReview',     label: 'Last review',     group: 'Engagement', align: 'left', sortKey: 'lastReview',
      mono: true, render: (r) => formatDate(r.lastReview) },
    { id: 'lastTestimonial', label: 'Last testimonial', group: 'Engagement', align: 'left', sortKey: 'lastTestimonial',
      mono: true, render: (r) => formatDate(r.lastTestimonial) },
    { id: 'lastReferral',   label: 'Last referral',   group: 'Engagement', align: 'left', sortKey: 'lastReferral',
      mono: true, render: (r) => formatDate(r.lastReferral) },
    { id: 'lastSurvey',     label: 'Last survey',     group: 'Engagement', align: 'left', sortKey: 'lastSurvey',
      mono: true, render: (r) => formatDate(r.lastSurvey) },
    { id: 'lastWeeklyCheckin', label: 'Last check-in', group: 'Engagement', align: 'left', sortKey: 'lastWeeklyCheckin',
      mono: true, render: (r) => formatDate(r.lastWeeklyCheckin) },
    // Flags
    { id: 'hasMembershipAddon', label: 'Membership',  group: 'Flags', align: 'center', sortKey: 'hasMembershipAddon',
      render: (r) => formatBool(r.hasMembershipAddon) },
    { id: 'hasGear',        label: 'Gear',           group: 'Flags', align: 'center', sortKey: 'hasGear',
      render: (r) => formatBool(r.hasGear) },
    { id: 'isVip',          label: 'VIP',            group: 'Flags', align: 'center', sortKey: 'isVip',
      render: (r) => formatBool(r.isVip) },
    { id: 'flaggedInactive', label: 'Flagged inactive', group: 'Flags', align: 'center', sortKey: 'flaggedInactive',
      render: (r) => r.flaggedInactive ? <span style={{ color: STATUS.red, fontWeight: 700 }}>Yes</span> : '—' },
    // Coverage (always-visible, last)
    { id: 'monthsCoverage', label: 'Months',         group: 'Coverage', align: 'right', sortKey: 'monthsLogged',
      mono: true, render: (r) => <span style={{ color: theme.inkMuted }}>{r.monthsLogged}{r.monthsExpected ? `/${r.monthsExpected}` : ''}</span> },
  ];
  const COLUMN_GROUPS = ['Identity', 'Ownership', 'Revenue', 'Funnel', 'Students', 'Sub-scores', 'Engagement', 'Flags', 'Coverage'];
  const visibleColumnObjs = COLUMNS.filter(col => visibleCols.has(col.id));

  // Pagination — slice the sorted result-set. pageSize='all' shows everything.
  const totalRows = sorted.length;
  const showAll = pageSize === 'all';
  const effectiveSize = showAll ? Math.max(totalRows, 1) : Number(pageSize);
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(totalRows / effectiveSize));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const sliceStart = showAll ? 0 : safePage * effectiveSize;
  const sliceEnd   = showAll ? totalRows : Math.min(sliceStart + effectiveSize, totalRows);
  const paged = sorted.slice(sliceStart, sliceEnd);

  // Pagination toolbar — Bobby 2026-05-05 wants it ABOVE the table.
  const PaginationBar = totalRows > 0 ? (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 12, padding: '8px 4px',
    }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.inkMuted }}>
        <label htmlFor="dashboard-page-size">Show</label>
        <select
          id="dashboard-page-size"
          value={pageSize}
          onChange={(e) => {
            const v = e.target.value;
            setPageSize(v === 'all' ? 'all' : Number(v));
          }}
          style={{
            backgroundColor: theme.surface, color: theme.ink,
            border: `1px solid ${theme.rule}`, borderRadius: 8,
            padding: '5px 24px 5px 10px', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
            appearance: 'none', WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${theme.inkMuted.replace('#', '%23')}' d='M0 0h10L5 6z'/></svg>")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            backgroundSize: '10px 6px',
          }}
        >
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          <option value="all">All</option>
        </select>
        <span>per page · showing <strong style={{ color: theme.ink }}>{sliceStart + 1}–{sliceEnd}</strong> of <strong style={{ color: theme.ink }}>{totalRows}</strong></span>
      </div>

      {!showAll && totalPages > 1 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {(() => {
            const Btn = ({ disabled, onClick, children, label }) => (
              <button
                onClick={onClick} disabled={disabled} aria-label={label}
                style={{
                  minWidth: 32, height: 32, padding: '0 10px',
                  background: disabled ? 'transparent' : theme.surface,
                  border: `1px solid ${theme.rule}`, borderRadius: 8,
                  color: disabled ? theme.inkMuted : theme.ink,
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                }}
              >{children}</button>
            );
            return (
              <>
                <Btn disabled={safePage === 0} onClick={() => setPageIndex(0)} label="First page">«</Btn>
                <Btn disabled={safePage === 0} onClick={() => setPageIndex(p => Math.max(0, p - 1))} label="Previous page">‹ Prev</Btn>
                <span style={{ padding: '0 10px', fontSize: 12, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
                  Page <strong style={{ color: theme.ink }}>{safePage + 1}</strong> of <strong style={{ color: theme.ink }}>{totalPages}</strong>
                </span>
                <Btn disabled={safePage >= totalPages - 1} onClick={() => setPageIndex(p => Math.min(totalPages - 1, p + 1))} label="Next page">Next ›</Btn>
                <Btn disabled={safePage >= totalPages - 1} onClick={() => setPageIndex(totalPages - 1)} label="Last page">»</Btn>
              </>
            );
          })()}
        </div>
      )}
    </div>
  ) : null;

  // Bobby 2026-05-12 mobile cleanup: Tier moved from a chip-row to a
  // popover-style multi-select button to save horizontal space; close
  // when the user clicks outside it.
  const tierPopoverRef = React.useRef(null);
  const [tierOpen, setTierOpen] = React.useState(false);
  React.useEffect(() => {
    if (!tierOpen) return;
    const onClick = (e) => {
      if (tierPopoverRef.current && !tierPopoverRef.current.contains(e.target)) {
        setTierOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [tierOpen]);
  const TIER_OPTIONS = [
    { v: 'standard',   label: 'Standard'   },
    { v: 'vip',        label: 'VIP'        },
    { v: 'reach',      label: 'Reach'      },
    { v: 'a_la_carte', label: 'À la carte' },
  ];
  const tierSummary = tierFilter.length === TIER_OPTIONS.length
    ? 'All tiers'
    : tierFilter.length === 0
      ? 'None'
      : tierFilter.map(v => TIER_OPTIONS.find(t => t.v === v)?.label || v).join(', ');

  // Shared styles for the row-2 dropdown controls so they line up cleanly
  // on both desktop and mobile.
  // Bobby 2026-05-15: previous code used `background: theme.surface`
  // (shorthand), which on every paint resets background-image/-repeat/
  // -position to their defaults. In light mode this caused the SVG
  // chevron arrow to tile across the whole button (a hatched pattern).
  // Use longhand `backgroundColor` + explicit `backgroundSize` so the
  // chevron always renders once at 10×6 in the right gutter.
  const ctrlBtnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', height: 36,
    backgroundColor: theme.surface, color: theme.ink,
    border: `1px solid ${theme.rule}`, borderRadius: 8,
    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
    cursor: 'pointer',
  };
  const ctrlSelectStyle = {
    ...ctrlBtnStyle,
    padding: '0 30px 0 12px',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${theme.inkMuted.replace('#', '%23')}' d='M0 0h10L5 6z'/></svg>")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '10px 6px',
  };
  const ctrlLabelStyle = { fontSize: 10, color: theme.inkMuted, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginRight: 4 };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card theme={theme} padding={14}>
        {/* Bobby 2026-05-12 layout:
            Row 1 — title + one-line subtitle (cleaner wording)
            Row 2 — search bar on its own line (full-width on mobile)
            Row 3 — filters: Tier popover, Period select, CA select,
                    Include cancelled, Columns
            Row 4 — custom date inputs (only when period = 'custom') */}

        {/* Row 1: title + one-line summary */}
        <SectionLabel theme={theme}>All-accounts dashboard</SectionLabel>
        <div style={{
          fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 12,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {periodWindow.label} ({CABT_fmtDate(qStart)} – {CABT_fmtDate(qEnd)}) · <strong style={{ color: theme.inkSoft, fontWeight: 600 }}>{sorted.length}</strong> {includeCancelled ? 'total' : 'active'} client{sorted.length === 1 ? '' : 's'}
        </div>

        {/* Row 2: search bar on its own line */}
        <input
          type="search"
          placeholder="Search by client name or id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            display: 'block', width: '100%',
            padding: '10px 14px', marginBottom: 10,
            background: theme.surface, color: theme.ink,
            border: `1px solid ${theme.rule}`, borderRadius: 8,
            fontSize: 13, fontFamily: 'inherit', outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Row 3: filters */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {/* Tier — popover-style multi-select button */}
          <div ref={tierPopoverRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setTierOpen(o => !o)}
              aria-haspopup="true"
              aria-expanded={tierOpen}
              style={ctrlBtnStyle}
            >
              <span style={ctrlLabelStyle}>Tier</span>
              <span style={{ color: theme.ink, fontWeight: 600 }}>{tierSummary}</span>
              <span style={{ color: theme.inkMuted, marginLeft: 4 }}>▾</span>
            </button>
            {tierOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 10,
                background: theme.bg, border: `1px solid ${theme.rule}`,
                borderRadius: 10, padding: 6, minWidth: 180,
                boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
              }}>
                {TIER_OPTIONS.map(t => {
                  const checked = tierFilter.includes(t.v);
                  return (
                    <label key={t.v} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                      fontSize: 13, color: theme.ink,
                      background: checked ? (theme.bgElev || 'rgba(255,255,255,0.04)') : 'transparent',
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setTierFilter(prev => {
                          const set = new Set(prev);
                          if (set.has(t.v)) set.delete(t.v); else set.add(t.v);
                          return set.size === 0 ? prev : Array.from(set);
                        })}
                        style={{ accentColor: theme.accent || '#D7FF3D' }}
                      />
                      {t.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Period — native select */}
          <div style={{ position: 'relative' }}>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{ ...ctrlSelectStyle, paddingLeft: 56 }}
              aria-label="Period"
            >
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="year">This year</option>
              <option value="all">All time</option>
              <option value="custom">Custom</option>
            </select>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', ...ctrlLabelStyle,
            }}>Period</span>
          </div>

          {/* CA filter — locked when scopeCa is set */}
          {!scopeCa && (state.cas || []).length > 0 && (
            <div style={{ position: 'relative' }}>
              <select
                value={caFilter}
                onChange={(e) => setCaFilter(e.target.value)}
                style={{ ...ctrlSelectStyle, paddingLeft: 40 }}
                aria-label="CA filter"
              >
                <option value="all">All CAs</option>
                {(state.cas || []).filter(ca => ca.active).map(ca => (
                  <option key={ca.id} value={ca.id}>{ca.id} · {ca.name}</option>
                ))}
              </select>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', ...ctrlLabelStyle,
              }}>CA</span>
            </div>
          )}

          {/* Include cancelled toggle */}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', height: 36,
            border: `1px solid ${theme.rule}`, borderRadius: 8,
            fontSize: 12, color: theme.inkSoft, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={includeCancelled} onChange={(e) => setIncludeCancelled(e.target.checked)}
                   style={{ accentColor: theme.accent || '#D7FF3D' }}/>
            Include cancelled
          </label>

          {/* Columns chooser */}
          <button
            onClick={() => setChooserOpen(true)}
            aria-label="Choose columns"
            style={ctrlBtnStyle}
          >
            <Icon name="cog" size={14} color={theme.inkMuted}/>
            Columns
            <span style={{ color: theme.inkMuted, fontWeight: 500, marginLeft: 2 }}>· {visibleCols.size}</span>
          </button>
        </div>

        {/* Row 4: custom date inputs (only when period=custom) */}
        {period === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: theme.inkMuted }}>From</span>
            <input
              type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
              style={{
                padding: '6px 10px', background: theme.surface, color: theme.ink,
                border: `1px solid ${theme.rule}`, borderRadius: 8, fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: 11, color: theme.inkMuted }}>to</span>
            <input
              type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
              style={{
                padding: '6px 10px', background: theme.surface, color: theme.ink,
                border: `1px solid ${theme.rule}`, borderRadius: 8, fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
          </div>
        )}
      </Card>

      {PaginationBar}

      <div style={{ overflowX: 'auto', background: theme.surface, border: `1px solid ${theme.rule}`, borderRadius: theme.radius }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {visibleColumnObjs.map(col => (
                <Th key={col.id} k={col.sortKey || col.id} align={col.align}
                    sticky={col.id === 'name'}
                    width={col.id === 'name' ? clientColWidth : undefined}
                    resizable={col.id === 'name'}>{col.label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totalRows === 0 && (
              <tr><td colSpan={Math.max(1, visibleColumnObjs.length)} style={{ padding: 24, textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>No clients match this filter.</td></tr>
            )}
            {paged.map(r => (
              <tr key={r.id}
                  onClick={() => navigate('client-detail', { clientId: r.id })}
                  style={{ cursor: 'pointer' }}>
                {visibleColumnObjs.map(col => (
                  <Td key={col.id} align={col.align} mono={col.mono}
                      sticky={col.id === 'name'}
                      width={col.id === 'name' ? clientColWidth : undefined}>{col.render(r)}</Td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Asterisk legend — the hover note on an over-100% rate is desktop-only,
          so spell it out under the table too. Only rendered when a visible rate
          column actually has one on this page. */}
      {(() => {
        const RATE_IDS = ['bookingRate', 'showRate', 'closeRate'];
        const shown = RATE_IDS.filter(id => visibleCols.has(id));
        const hasOver = shown.length > 0
          && paged.some(r => shown.some(id => r[id] != null && r[id] > 1));
        if (!hasOver) return null;
        return (
          <div style={{
            marginTop: 8, fontSize: 11.5, color: theme.inkMuted, lineHeight: 1.5,
          }}>
            <span style={{ color: STATUS.yellow, fontWeight: 800 }}>*</span>
            {' '}Over 100% — more than the previous step. Usually family members,
            walk-ins, or reactivated students who signed up without going through
            the full funnel.
          </div>
        );
      })()}

      {chooserOpen && (
        <ColumnChooserModal
          theme={theme}
          columns={COLUMNS}
          groups={COLUMN_GROUPS}
          visible={visibleCols}
          onChange={setVisibleCols}
          onClose={() => setChooserOpen(false)}
          defaults={DEFAULT_VISIBLE_COLS}
        />
      )}
    </div>
  );
}

// ── Column chooser modal — TKT-12.3c ──────────────────────────────────────
// Lets admins toggle which columns appear on AdminDashboard. Grouped by
// category (Identity / Ownership / Revenue / Funnel / etc.) for scanability.
// Persistence is owned by the caller (writes to localStorage on change).
function ColumnChooserModal({ theme, columns, groups, visible, onChange, onClose, defaults }) {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  const toggle = (id) => {
    const next = new Set(visible);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  const reset = () => onChange(new Set(defaults));
  const showAll = () => onChange(new Set(columns.map(c => c.id)));
  const showNone = () => onChange(new Set());
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(8, 12, 24, 0.55)',
      zIndex: 1000, display: 'flex',
      alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center',
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      padding: isDesktop ? 32 : 0,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: theme.bg, color: theme.ink,
        width: '100%', maxWidth: isDesktop ? 640 : 560,
        maxHeight: isDesktop ? '88vh' : '88vh',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderBottomLeftRadius: isDesktop ? 24 : 0,
        borderBottomRightRadius: isDesktop ? 24 : 0,
        overflowY: 'auto',
        padding: isDesktop ? '20px 24px 24px' : '14px 18px calc(env(safe-area-inset-bottom, 0px) + 24px)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: theme.serif || 'inherit', fontSize: 20, fontWeight: 600 }}>Choose columns</div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 16, border: 'none', background: theme.bgElev, color: theme.inkSoft,
            fontSize: 18, cursor: 'pointer', padding: 0,
          }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 14, lineHeight: 1.5 }}>
          Toggle which data points appear as columns on the dashboard. Selection persists across reloads.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={reset} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: theme.surface, border: `1px solid ${theme.rule}`, borderRadius: 8, color: theme.ink, cursor: 'pointer', fontFamily: 'inherit' }}>Reset to default</button>
          <button onClick={showAll} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: theme.surface, border: `1px solid ${theme.rule}`, borderRadius: 8, color: theme.ink, cursor: 'pointer', fontFamily: 'inherit' }}>Show all</button>
          <button onClick={showNone} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: theme.surface, border: `1px solid ${theme.rule}`, borderRadius: 8, color: theme.ink, cursor: 'pointer', fontFamily: 'inherit' }}>Hide all</button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: theme.inkMuted }}>{visible.size} of {columns.length} shown</span>
        </div>
        {groups.map(group => {
          const colsInGroup = columns.filter(c => c.group === group);
          if (colsInGroup.length === 0) return null;
          return (
            <div key={group} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: theme.inkMuted, marginBottom: 6 }}>{group}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                {colsInGroup.map(col => {
                  const checked = visible.has(col.id);
                  return (
                    <label key={col.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                      borderRadius: 8, cursor: 'pointer',
                      background: checked ? theme.accent + '12' : theme.surface,
                      border: `1px solid ${checked ? theme.accent + '55' : theme.rule}`,
                      fontSize: 13,
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(col.id)}
                             style={{ width: 16, height: 16, accentColor: theme.accent }}/>
                      <span style={{ color: theme.ink, fontWeight: 600 }}>{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, {
  AdminAnnualBonus, AdminRevenueLedger, AdminClientRollup, AdminClientCalc, AdminOpenQuestions, AdminAuditLog, AdminMore,
  AdminAddClient, AdminPendingClients, AdminFormulaInspector, AdminBulkCadence, AdminDashboard,
  // Reusable bits exposed for ca-detail.jsx (per-client Dashboard tab — TKT-12.4)
  ColumnChooserModal, Sparkline,
  CABT_nextClientId: nextClientId,
});
