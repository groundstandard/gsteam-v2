// ca-app.jsx — CA persona screens

// ── CA Home ─────────────────────────────────────────────────────────────────
function CAHome({ state, ca, theme, density, navigate }) {
  const score = CABT_caScorecard(ca, state);
  const status = CABT_scoreToStatus(score.composite);
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);

  // Health distribution
  const buckets = { green: 0, yellow: 0, red: 0, gray: 0 };
  myClients.forEach(c => {
    const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, state.config);
    const s = CABT_scoreToStatus(sub.composite);
    buckets[s]++;
  });

  // Today's prompts
  const currentMonth = CABT_currentMonthIso();
  const missingThisMonth = myClients.filter(c =>
    !state.monthlyMetrics.some(m => m.clientId === c.id && m.month === currentMonth)
  );
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
  const noRecentSurvey = myClients.filter(c =>
    !state.surveys.some(s => s.clientId === c.id && new Date(s.date) >= cutoff)
  );

  // Cadence-aware narrative check-in prompts (TICKET-2c)
  const isoMondayOf = (d) => {
    const x = new Date(d); const day = x.getDay() || 7;
    if (day !== 1) x.setDate(x.getDate() - (day - 1));
    return x.toISOString().slice(0, 10);
  };
  const thisWeekStart = isoMondayOf(new Date());
  const weeklyCheckins = state.weeklyCheckins || [];
  const monthlyCheckins = state.monthlyCheckins || [];
  const missingCheckin = myClients
    .filter(c => {
      const cadence = c.loggingCadence || 'monthly';
      if (cadence === 'weekly') {
        return !weeklyCheckins.some(w => w.clientId === c.id && w.weekStart === thisWeekStart);
      }
      return !monthlyCheckins.some(m => m.clientId === c.id && m.month === currentMonth);
    })
    // Weekly clients first (more time-sensitive than monthly)
    .sort((a, b) => {
      const ca = (a.loggingCadence || 'monthly') === 'weekly' ? 0 : 1;
      const cb = (b.loggingCadence || 'monthly') === 'weekly' ? 0 : 1;
      return ca - cb || a.name.localeCompare(b.name);
    });

  // Recent activity (logged by this CA)
  const recentActivity = [
    ...state.monthlyMetrics
      .filter(m => myClients.some(c => c.id === m.clientId))
      .map(m => ({ kind: 'metric', date: m.month, item: m, label: 'Monthly metrics', clientId: m.clientId })),
    ...state.growthEvents
      .filter(e => e.loggedBy === ca.id)
      .map(e => ({ kind: 'event', date: e.date, item: e, label: e.eventType, clientId: e.clientId })),
    ...state.surveys
      .filter(s => s.submittedBy === ca.id)
      .map(s => ({ kind: 'survey', date: s.date, item: s, label: 'Survey', clientId: s.clientId })),
    ...weeklyCheckins
      .filter(w => myClients.some(c => c.id === w.clientId))
      .map(w => ({ kind: 'checkin', date: w.weekStart, item: w, label: 'Weekly check-in', clientId: w.clientId })),
    ...monthlyCheckins
      .filter(m => myClients.some(c => c.id === m.clientId))
      .map(m => ({ kind: 'checkin', date: m.month, item: m, label: 'Monthly check-in', clientId: m.clientId })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  const bonusColor = STATUS[status];
  const projected = score.finalPayout;

  // Empty state: no clients assigned to this CA AND nothing logged yet.
  // Show a friendly prompt instead of an all-zero scorecard. Points the user
  // at the Log button so they know how to start.
  const isEmpty = myClients.length === 0 && recentActivity.length === 0;
  if (isEmpty) {
    return (
      <div style={{ padding: '24px 16px 120px', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: theme.accent + '22',
          border: `1px solid ${theme.accent}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 32,
        }}>
          <Icon name="plus" size={32} color={theme.accent} stroke={2.4}/>
        </div>
        <div>
          <div style={{
            fontFamily: theme.serif, fontSize: 24, fontWeight: 600, color: theme.ink,
            letterSpacing: -0.4, marginBottom: 6,
          }}>Welcome, {ca && ca.name ? ca.name.split(' ')[0] : 'there'}</div>
          <div style={{
            fontSize: 14.5, color: theme.inkMuted, lineHeight: 1.5, maxWidth: 360, margin: '0 auto',
          }}>
            Your scorecard will fill in as you start logging. Tap the
            <strong style={{ color: theme.accent, fontWeight: 700 }}> Log <span aria-hidden="true">＋</span> </strong>
            button below to record monthly metrics, growth events, or client surveys.
          </div>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          marginTop: 8, width: '100%', maxWidth: 380,
        }}>
          {[
            { icon: 'chart', label: 'Monthly metrics', desc: 'Leads, ad spend, MRR, attrition' },
            { icon: 'cal',   label: 'Growth event',    desc: 'Workshop, gear sale, milestone' },
            { icon: 'star',  label: 'Client survey',   desc: 'Satisfaction snapshot' },
          ].map((it) => (
            <div key={it.label} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: theme.surface, border: `1px solid ${theme.rule}`,
              borderRadius: 14, padding: '12px 14px', textAlign: 'left',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: theme.accent + '15', color: theme.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon name={it.icon} size={18}/></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{it.label}</div>
                <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 1 }}>{it.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 24, fontSize: 11, color: theme.inkMuted,
          letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600,
        }}>↓ Use the Log button below to start</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Greeting + headline — plain text on the page background. Bobby
          2026-05-06: "Lets get rid of the yellow and purple backgrounds.
          instead make the 4 cards background yellow or purple." */}
      {/* Bobby 2026-05-12: derive the quarter label from score.qStart
          (Q2 2026 was hardcoded). Falls back to "this quarter" if the
          calc didn't return a window. */}
      {(() => null)()}
      <div style={{ padding: '4px 4px 0' }}>
        <div style={{ fontFamily: theme.serif, fontSize: 13, color: theme.inkMuted, letterSpacing: 0.3, marginBottom: 6 }}>
          Hey {ca.name.split(' ')[0]} — {(() => {
            if (!score.qStart) return 'this quarter';
            const [yy, mm] = String(score.qStart).split('-').map(Number);
            const qn = Math.floor(((mm || 1) - 1) / 3) + 1;
            return `Q${qn} ${yy}`;
          })()}
        </div>
        <div style={{ fontFamily: theme.serif, fontSize: 22, fontWeight: 500, color: theme.ink, lineHeight: 1.25, letterSpacing: -0.3, maxWidth: 540 }}>
          {(() => {
            const qLabel = (() => {
              if (!score.qStart) return 'this quarter';
              const [yy, mm] = String(score.qStart).split('-').map(Number);
              const qn = Math.floor(((mm || 1) - 1) / 3) + 1;
              return `Q${qn} ${yy}`;
            })();
            if (projected > 0) {
              return <>You're on track for <em style={{ color: theme.accent, fontStyle: 'normal', fontWeight: 700 }}>{CABT_fmtMoney(projected)}</em> this quarter.</>;
            }
            if (!score.totalPot || score.totalPot <= 0) {
              return <>Bonus pot for {qLabel} isn't set yet. Admin → Quarter inputs.</>;
            }
            if (!score.mrrShare || score.mrrShare <= 0) {
              return <>No bonus-eligible MRR on your book yet — log monthly metrics to qualify.</>;
            }
            if (!score.composite || score.composite <= 0) {
              return <>Projected payout: <em style={{ color: theme.accent, fontStyle: 'normal', fontWeight: 700 }}>$0</em> — composite at zero. Log data to lift Performance / Growth.</>;
            }
            return <>Projected payout: <em style={{ color: theme.accent, fontStyle: 'normal', fontWeight: 700 }}>$0</em> this quarter.</>;
          })()}
        </div>
      </div>

      {/* Score cards — each card carries the brand color (yellow or navy
          per active theme). Number lives inside the ring; label sits OUTSIDE
          below the ring so it can't overlap the stroke. Bobby 2026-05-06:
          "purple bg has white letters; yellow bg has black letters; fix the
          formatting so letters do not overlap the circle graphs." Both rules
          satisfied via theme.accentInk + label-outside-ring layout. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 10, maxWidth: 720,
      }}>
        {[
          { key: 'composite',   label: 'Composite',   value: score.composite   },
          { key: 'performance', label: 'Performance', value: score.performance },
          { key: 'retention',   label: 'Retention',   value: score.retention   },
          { key: 'growth',      label: 'Growth',      value: score.growth      },
        ].map((s) => {
          const v = s.value;
          const display = (v != null && Number.isFinite(v)) ? (v * 100).toFixed(0) : '—';
          const statusKey = CABT_scoreToStatus(v);
          const ringColor = statusKey === 'gray' ? theme.accentInk + '40' : STATUS[statusKey];
          return (
            <div key={s.key} style={{
              background: theme.accent,
              color: theme.accentInk,
              border: `1px solid ${theme.accentInk}1A`,
              borderRadius: 16,
              // Bobby 2026-06-19 (Loom): "the circles go to the edges — I want a
              // margin and buffer between the assets inside any card and the
              // edges, never up against them." Roomier padding so the ring has
              // clear breathing space on all sides.
              padding: '20px 16px 16px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            }}>
              <ScoreRing
                value={v}
                size={84}
                stroke={5}
                color={ringColor}
                bg={theme.accentInk + '24'}
                label={
                  <div style={{
                    fontFamily: theme.serif, fontSize: 26, fontWeight: 700,
                    color: theme.accentInk, fontVariantNumeric: 'tabular-nums',
                    letterSpacing: -0.5, lineHeight: 1,
                  }}>{display}</div>
                }
              />
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: 0.7,
                textTransform: 'uppercase', color: theme.accentInk, opacity: 0.85,
                lineHeight: 1,
              }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Book health chips — 4 buckets so the counts add up to the full
          client total. Bobby 2026-05-04: "On track / Watch / At risk only
          have 1, 1, 5 but there are about 50 active accounts." Clients
          with no scoreable data this quarter were silently dropping into
          the gray bucket and disappearing from the chip row. Now they
          surface as "No data — needs logging" so the math is transparent. */}
      <div>
        <SectionLabel theme={theme}>Book health · {myClients.length} clients</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          {[
            { key: 'green',  count: buckets.green,  label: 'On track' },
            { key: 'yellow', count: buckets.yellow, label: 'Watch' },
            { key: 'red',    count: buckets.red,    label: 'At risk' },
            { key: 'gray',   count: buckets.gray,   label: 'No data' },
          ].map(b => (
            <button
              key={b.key}
              onClick={() => navigate('book', { filter: b.key })}
              style={{
                background: theme.surface, border: `1px solid ${theme.rule}`,
                borderRadius: theme.radius, padding: '14px 12px', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[b.key] }} />
                <span style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>{b.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{b.count}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Data completeness alert */}
      {score.bookCompleteness < 0.80 && (
        <Banner
          tone="warning"
          icon="alert"
          title="Book data incomplete"
          action="Log now"
          onAction={() => navigate('book', { filter: 'needs-data' })}
          theme={theme}
        >
          You're at {CABT_fmtPct(score.bookCompleteness)} for Q2. Performance bonus reduces proportionally.
        </Banner>
      )}

      {/* Today's prompts — HERO */}
      <div>
        <SectionLabel theme={theme}>
          <span>Today's prompts</span>
          <span style={{ fontWeight: 500, color: theme.inkMuted, textTransform: 'none', letterSpacing: 0 }}>
            {missingThisMonth.length + noRecentSurvey.length + missingCheckin.length} open
          </span>
        </SectionLabel>
        <Card theme={theme} padding={0}>
          {missingThisMonth.length === 0 && noRecentSurvey.length === 0 && missingCheckin.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: theme.inkMuted, fontSize: 14 }}>
              <Icon name="check" size={28} color={STATUS.green} />
              <div style={{ marginTop: 6 }}>You're caught up. Nice work.</div>
            </div>
          )}
          {missingCheckin.slice(0, 4).map((c, i) => {
            const cadence = c.loggingCadence || 'monthly';
            return (
              <PromptRow
                key={'k-' + c.id}
                theme={theme}
                icon="edit"
                tone="info"
                title={`Log ${cadence === 'weekly' ? "this week's" : "this month's"} check-in for ${c.name}`}
                detail={cadence === 'weekly' ? 'Weekly cadence · narrative' : 'Monthly cadence · narrative'}
                onClick={() => navigate('log-checkin', { clientId: c.id })}
                isLast={false}
              />
            );
          })}
          {missingCheckin.length > 4 && (
            <PromptRow
              key="more-checkins"
              theme={theme}
              icon="chev-r"
              tone="info"
              title={`+ ${missingCheckin.length - 4} more check-ins to log`}
              detail="View all"
              onClick={() => navigate('book', { filter: 'needs-data' })}
              isLast={false}
            />
          )}
          {missingThisMonth.slice(0, 4).map((c, i) => (
            <PromptRow
              key={c.id}
              theme={theme}
              icon="cal"
              tone="warning"
              title={`Log April for ${c.name}`}
              detail="Monthly metrics due"
              onClick={() => navigate('log-metrics', { clientId: c.id })}
              isLast={i === Math.min(missingThisMonth.length, 4) - 1 && noRecentSurvey.length === 0}
            />
          ))}
          {missingThisMonth.length > 4 && (
            <PromptRow
              key="more-metrics"
              theme={theme}
              icon="chev-r"
              tone="info"
              title={`+ ${missingThisMonth.length - 4} more clients missing data`}
              detail="View all"
              onClick={() => navigate('book', { filter: 'needs-data' })}
              isLast={noRecentSurvey.length === 0}
            />
          )}
          {noRecentSurvey.slice(0, 2).map((c, i) => (
            <PromptRow
              key={'s-' + c.id}
              theme={theme}
              icon="star"
              tone="info"
              title={`Collect a survey from ${c.name}`}
              detail={`No response in 6+ months`}
              onClick={() => navigate('log-survey', { clientId: c.id })}
              isLast={i === Math.min(noRecentSurvey.length, 2) - 1}
            />
          ))}
        </Card>
      </div>

      {/* Recent activity */}
      <div>
        <SectionLabel theme={theme}>Recent activity</SectionLabel>
        <Card theme={theme} padding={0}>
          {recentActivity.length === 0 && (
            <div style={{ padding: 16, color: theme.inkMuted, fontSize: 13 }}>Nothing logged yet.</div>
          )}
          {recentActivity.map((a, i) => {
            const c = state.clients.find(cl => cl.id === a.clientId);
            return (
              <ActivityRow
                key={i}
                theme={theme}
                title={`${a.label} · ${c?.name || 'Unknown'}`}
                date={a.kind === 'metric' ? CABT_fmtMonth(a.date) : CABT_fmtDate(a.date)}
                kind={a.kind}
                isLast={i === recentActivity.length - 1}
              />
            );
          })}
        </Card>
      </div>
    </div>
  );
}

function SectionLabel({ theme, children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: theme.inkMuted,
      letterSpacing: 0.6, textTransform: 'uppercase',
      padding: '0 4px 8px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    }}>{children}</div>
  );
}

function PromptRow({ theme, icon, tone, title, detail, onClick, isLast }) {
  const toneColors = {
    warning: STATUS.yellow,
    info:    theme.accent,
    success: STATUS.green,
  };
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', border: 'none', background: 'transparent',
        borderBottom: isLast ? 'none' : `1px solid ${theme.rule}`,
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        minHeight: 56,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: toneColors[tone] + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={16} color={toneColors[tone]} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, lineHeight: 1.3, letterSpacing: -0.1 }}>{title}</div>
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2 }}>{detail}</div>
      </div>
      <Icon name="chev-r" size={16} color={theme.inkMuted} />
    </button>
  );
}

function ActivityRow({ theme, title, date, kind, isLast }) {
  const iconMap = { metric: 'chart', event: 'tag', survey: 'star' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${theme.rule}`,
    }}>
      <Icon name={iconMap[kind]} size={16} color={theme.inkMuted} />
      <div style={{ flex: 1, fontSize: 14, color: theme.ink }}>{title}</div>
      <div style={{ fontSize: 12, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{date}</div>
    </div>
  );
}

// ── My Book ─────────────────────────────────────────────────────────────────
// Bobby 2026-05-05 (final): Dashboard moved out of the Accounts sub-tabs and
// into the left sidebar between Today and Accounts. Accounts is now a plain
// list view again — no internal view toggle.
function CABook({ state, ca, theme, navigate, initialFilter }) {
  const [filter, setFilter] = React.useState(initialFilter || 'all');
  const currentMonth = CABT_currentMonthIso();

  // Quarter / cumulative selector (Bobby 2026-07-28): view account scores per
  // quarter — and always show which window they're for — instead of only the
  // one configured quarter. Local view only; never touches global config.
  // Mirrors the per-client calc + Scorecard selectors.
  const cfg = state.config || {};
  const cfgStart = cfg.quarterStart || cfg.quarter_start || '';
  const parsedYr = new Date(cfgStart || new Date()).getFullYear();
  const year = Number.isFinite(parsedYr) ? parsedYr : new Date().getFullYear();
  const quarters = CABT_quartersOfYear(year);
  const cumulative = { key: `${year}-CUM`, label: `${year} cumulative`, start: `${year}-01-01`, end: `${year}-12-31` };
  const qOptions = [...quarters, cumulative];
  const qDefault = quarters.find(q => q.start === cfgStart) || cumulative;
  const [qSelKey, setQSelKey] = React.useState(qDefault.key);
  const qSel = qOptions.find(o => o.key === qSelKey) || qDefault;
  const viewCfg = { ...cfg, quarterStart: qSel.start, quarterEnd: qSel.end };

  // Only Standard/VIP accounts are scored. Everyone else (Reach, A-la-carte) is
  // excluded from every calculation — kept in a separate "Not scored" tab so the
  // scored list matches exactly what's calculated (Bobby 2026-07-28).
  const isEligible = (c) => {
    const t = (c.tier || '').toLowerCase();
    return t === 'standard' || t === 'vip';
  };
  const activeClients    = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const scoredClients    = activeClients.filter(isEligible);
  const notScoredClients = activeClients.filter(c => !isEligible(c));
  // Cancelled accounts stay reachable so a CA can set their cancel reason
  // (Bobby 2026-07-27).
  const cancelledClients = state.clients.filter(c => c.assignedCA === ca.id && c.cancelDate);

  // Missing-data report (Bobby 2026-07-28): which monthly METRICS months an
  // eligible account still hasn't filled for the selected window. Growth events
  // (reviews / referrals) are deliberately NOT counted — a zero there can be
  // legitimate. Only the monthly metrics are required "for all three months."
  // Months before the account's sign month, and months still in the future,
  // are never flagged as missing.
  const graceDays = Number(cfg.gracePeriodDays != null ? cfg.gracePeriodDays : 90) || 90;
  const missingMetricMonths = (c) => {
    // Accounts still inside the 90-day grace period aren't expected to have data
    // yet (same rule the scoring engine applies), so they're never "missing".
    if (c.signDate) {
      const ageDays = Math.floor((new Date() - new Date(c.signDate)) / 86400000);
      if (ageDays < graceDays) return { missing: [], expected: 0 };
    }
    const signIso = c.signDate ? (String(c.signDate).slice(0, 7) + '-01') : qSel.start;
    const startM  = signIso > qSel.start ? signIso : qSel.start;
    const qEndM   = qSel.end.slice(0, 7) + '-01';
    const endM    = qEndM < currentMonth ? qEndM : currentMonth; // never past the current month
    if (startM > endM) return { missing: [], expected: 0 };
    const filled = new Set(
      CABT_effectiveMonthlyMetrics(state.monthlyMetrics, state.weeklyMetrics || [], c.id).map(m => m.month)
    );
    const missing = [];
    let expected = 0;
    const d = new Date(startM + 'T00:00:00');
    const end = new Date(endM + 'T00:00:00');
    while (d <= end) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      expected += 1;
      if (!filled.has(iso)) missing.push(iso);
      d.setMonth(d.getMonth() + 1);
    }
    return { missing, expected };
  };

  const enrich = (c) => {
    const sub = CABT_clientSubScores(c, state.monthlyMetrics, state.surveys, viewCfg, new Date(), state.weeklyMetrics || []);
    const lastMetric = state.monthlyMetrics
      .filter(m => m.clientId === c.id)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    const needsData = !c.cancelDate && !state.monthlyMetrics.some(m => m.clientId === c.id && m.month === currentMonth);
    const md = missingMetricMonths(c);
    return { client: c, sub, lastMetric, needsData, missing: md.missing, expected: md.expected, status: CABT_scoreToStatus(sub.composite) };
  };
  const enriched = scoredClients.map(enrich);
  const enrichedNotScored = notScoredClients.map(enrich);
  const enrichedCancelled = cancelledClients.map(enrich);

  let filtered = enriched;
  if (filter === 'cancelled') {
    filtered = enrichedCancelled;
  } else if (filter === 'not-scored') {
    filtered = enrichedNotScored;
  } else if (filter === 'missing-data') {
    filtered = enriched.filter(e => e.missing.length > 0);
  } else if (filter === 'green' || filter === 'yellow' || filter === 'red' || filter === 'gray') {
    filtered = enriched.filter(e => e.status === filter);
  } else if (filter === 'needs-data') {
    filtered = enriched.filter(e => e.needsData);
  }

  const isMissingView   = filter === 'missing-data';
  const isNotScoredView = filter === 'not-scored';

  // Missing-data view sorts by most months missing first; every other view by
  // status severity (red > yellow > gray > green).
  const sortKey = { red: 0, yellow: 1, gray: 2, green: 3 };
  filtered = filtered.slice().sort((a, b) =>
    isMissingView ? (b.missing.length - a.missing.length) : (sortKey[a.status] - sortKey[b.status])
  );

  const filters = [
    { value: 'all',          label: 'All',          count: enriched.length },
    { value: 'red',          label: 'At risk',      count: enriched.filter(e => e.status === 'red').length },
    { value: 'yellow',       label: 'Watch',        count: enriched.filter(e => e.status === 'yellow').length },
    { value: 'green',        label: 'On track',     count: enriched.filter(e => e.status === 'green').length },
    { value: 'missing-data', label: 'Missing data', count: enriched.filter(e => e.missing.length > 0).length },
    { value: 'needs-data',   label: 'Needs data',   count: enriched.filter(e => e.needsData).length },
    { value: 'not-scored',   label: 'Not scored',   count: enrichedNotScored.length },
    { value: 'cancelled',    label: 'Cancelled',    count: enrichedCancelled.length },
  ];

  return (
    <div style={{ paddingBottom: 100 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: theme.bg + 'EE', backdropFilter: 'blur(8px)',
        padding: '8px 16px 12px',
        borderBottom: `1px solid ${theme.rule}`,
      }}>
        {/* Quarter / cumulative selector + active-window label — so it's always
            clear which quarter these scores are for (Bobby 2026-07-28). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {qOptions.map((o, i) => {
            const isCum = o.key === cumulative.key;
            const st = isCum ? 'past' : CABT_quarterStatus(o.start, o.end);
            const isSel = o.key === qSelKey;
            const disabled = st === 'future';
            return (
              <button key={o.key} disabled={disabled} onClick={() => setQSelKey(o.key)} style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999,
                fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
                background: isSel ? theme.ink : theme.surface,
                color: isSel ? (theme.accentInk || '#fff') : theme.ink,
                border: `1px solid ${isSel ? theme.ink : theme.rule}`,
                opacity: disabled ? 0.4 : 1,
              }}>
                {isCum ? 'Cumulative' : `Q${i + 1}`}{st === 'current' ? ' · live' : ''}
              </button>
            );
          })}
          <span style={{ fontSize: 12, color: theme.inkMuted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            Showing <strong style={{ color: theme.inkSoft }}>{qSel.label}</strong>
          </span>
        </div>
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none', margin: '0 -16px', padding: '0 16px',
        }}>
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: '8px 14px', height: 36, fontSize: 13, fontWeight: 600,
                background: filter === f.value ? theme.ink : theme.surface,
                color: filter === f.value ? theme.accentInk : theme.ink,
                border: `1px solid ${filter === f.value ? theme.ink : theme.rule}`,
                borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              {f.label} <span style={{ opacity: 0.65, marginLeft: 4 }}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '4px 16px' }}>
        {isNotScoredView && filtered.length > 0 && (
          <div style={{ padding: '10px 2px 6px', fontSize: 12.5, color: theme.inkMuted, lineHeight: 1.5 }}>
            These accounts aren’t Standard or VIP, so they’re <strong style={{ color: theme.inkSoft }}>not counted</strong> in any score or bonus — and don’t need data entered.
          </div>
        )}
        {isMissingView && filtered.length > 0 && (
          <div style={{ padding: '10px 2px 6px', fontSize: 12.5, color: theme.inkMuted, lineHeight: 1.5 }}>
            <strong style={{ color: theme.inkSoft }}>{filtered.length}</strong> account{filtered.length === 1 ? '' : 's'} missing{' '}
            <strong style={{ color: theme.inkSoft }}>{filtered.reduce((s, e) => s + e.missing.length, 0)}</strong> month{filtered.reduce((s, e) => s + e.missing.length, 0) === 1 ? '' : 's'} of metrics for <strong style={{ color: theme.inkSoft }}>{qSel.label}</strong>. Monthly metrics only — reviews / referrals aren’t counted as missing.
          </div>
        )}
        {filtered.length === 0 && (
          <div style={{ padding: '60px 0', textAlign: 'center', color: theme.inkMuted }}>
            <Icon name="check" size={36} />
            <div style={{ marginTop: 8, fontSize: 14 }}>
              {isMissingView ? `Nothing missing for ${qSel.label}. 🎉` : 'No clients match this filter.'}
            </div>
          </div>
        )}
        {filtered.map((e, i) => {
          const missingInfo = isMissingView
            ? `Missing ${e.missing.length} of ${e.expected} · ${e.missing.map(m => CABT_fmtMonth(m)).join(', ')}`
            : null;
          return (
            <ClientRow
              key={e.client.id}
              client={e.client}
              sub={e.sub}
              lastMetric={e.lastMetric}
              needsData={isNotScoredView ? false : e.needsData}
              status={e.status}
              theme={theme}
              excluded={isNotScoredView}
              missingInfo={missingInfo}
              missingCount={isMissingView ? e.missing.length : null}
              onClick={() => navigate('client-detail', { clientId: e.client.id })}
              isLast={i === filtered.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}

function ClientRow({ client, sub, lastMetric, needsData, status, theme, onClick, isLast, excluded, missingInfo, missingCount }) {
  const score = sub.composite;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 4px', width: '100%',
        background: 'transparent', border: 'none', textAlign: 'left',
        borderBottom: isLast ? 'none' : `1px solid ${theme.rule}`,
        cursor: 'pointer', fontFamily: 'inherit', minHeight: 64,
      }}
    >
      <div style={{
        width: 6, alignSelf: 'stretch',
        background: missingInfo ? STATUS.yellow : (excluded ? theme.rule : STATUS[status]),
        borderRadius: 3, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, color: theme.ink,
          letterSpacing: -0.15, lineHeight: 1.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{client.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12, color: theme.inkMuted }}>
          {missingInfo ? (
            <span style={{ color: STATUS.yellow, fontWeight: 600 }}>{missingInfo}</span>
          ) : excluded ? (
            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{client.tier || 'Not scored'}</span>
          ) : needsData ? (
            <span style={{ color: STATUS.yellow, fontWeight: 600 }}>⚠ No data this month</span>
          ) : (
            <span>Last: {lastMetric ? CABT_fmtMonth(lastMetric.month) : '—'}</span>
          )}
          {!missingInfo && <><span>·</span><span>{CABT_fmtMoney(client.monthlyRetainer)}/mo</span></>}
        </div>
      </div>
      <div style={{
        textAlign: 'right', flexShrink: 0,
        fontSize: (excluded && !missingInfo) ? 12 : 18, fontWeight: 700,
        color: missingInfo ? STATUS.yellow : (excluded ? theme.inkMuted : STATUS[status]),
        fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3,
      }}>
        {missingInfo ? missingCount : (excluded ? 'Not counted' : (score != null ? (score * 100).toFixed(0) : '—'))}
      </div>
      <Icon name="chev-r" size={16} color={theme.inkMuted} />
    </button>
  );
}

// ── CA Profile / Me tab ────────────────────────────────────────────────────
// Shown when the user taps the "Me" tab in the floating nav. Displays a
// concise summary of the signed-in CA: avatar, name, role badge, email, a
// few book stats, and a sign-out button.
function CAProfile({ state, ca, theme, navigate, profile, onSignOut }) {
  // The active CA might come from local state.cas (demo) or from the joined
  // Supabase profile. Prefer the live profile if present for name/email.
  const displayName = (profile && (profile.display_name || profile.displayName)) || (ca && ca.name) || 'You';
  const email = (profile && profile.email) || (ca && ca.email) || '';
  const role = (profile && profile.role) || 'ca';
  const initials = (displayName || 'YOU').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  // Book stats (only meaningful for CAs with assigned clients).
  // Bobby 2026-05-04: was using snake_case `cancel_date` here while the API
  // serves camelCase `cancelDate`, so the !cancelled filter was a no-op and
  // the count included cancelled clients. Use cancelDate.
  const myClients = ca ? (state.clients || []).filter(c => c.assignedCA === ca.id && !c.cancelDate) : [];
  const totalRetainer = myClients.reduce((s, c) => s + (c.monthlyRetainer || c.monthly_retainer || 0), 0);
  const recentSurveys = ca ? (state.surveys || []).filter(s => s.caId === ca.id || s.ca_id === ca.id).length : 0;

  const roleLabel = (typeof CABT_roleLabel === 'function')
    ? CABT_roleLabel(role, profile && profile.sales_role)
    : role;

  return (
    <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header card with avatar + name + role */}
      <Card theme={theme} padding={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}CC)`,
            color: theme.accentInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: theme.serif, fontWeight: 600, fontSize: 24, letterSpacing: -0.5,
            boxShadow: `0 6px 16px ${theme.accent}55, inset 0 1px 0 rgba(255,255,255,0.3)`,
            flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: theme.serif, fontSize: 22, fontWeight: 600,
              color: theme.ink, letterSpacing: -0.3, lineHeight: 1.15,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{displayName}</div>
            <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{email}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: theme.accent + '18', color: theme.accent,
                padding: '3px 10px', borderRadius: 999,
                fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: theme.accent }}/>
                {roleLabel}
              </span>
              {ca && ca.id && (
                <span style={{
                  marginLeft: 6,
                  fontFamily: theme.mono || 'monospace', fontSize: 11, fontWeight: 600,
                  color: theme.inkSoft, padding: '3px 8px',
                  background: theme.bgElev, borderRadius: 6,
                }}>{ca.id}</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Stats grid — only meaningful when CA has a book */}
      {ca && (
        <Card theme={theme} padding={0}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[
              { label: 'Active clients', value: myClients.length },
              { label: 'Monthly retainer', value: totalRetainer ? '$' + totalRetainer.toLocaleString() : '—' },
              { label: 'Surveys logged', value: recentSurveys },
            ].map((s, i) => (
              <div key={s.label} style={{
                padding: '16px 12px', textAlign: 'center',
                borderRight: i < 2 ? `1px solid ${theme.rule}` : 'none',
              }}>
                <div style={{
                  fontFamily: theme.serif, fontSize: 22, fontWeight: 600,
                  color: theme.ink, letterSpacing: -0.3, lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums',
                }}>{s.value}</div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: theme.inkMuted,
                  marginTop: 4, letterSpacing: 0.5, textTransform: 'uppercase',
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick links */}
      <Card theme={theme} padding={0}>
        {[
          { icon: 'book', label: 'My accounts', desc: 'View all clients in your book', to: 'book' },
          { icon: 'chart', label: 'Scorecard', desc: 'Quarterly composite + sub-scores', to: 'scorecard' },
          { icon: 'nav-accounts', label: 'Weekly Client Calls', desc: 'Live call-status board for the team', to: 'calls-board' },
        ].map((it, i, arr) => (
          <button
            key={it.to}
            onClick={() => navigate(it.to)}
            className="cabt-btn-press"
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              width: '100%', padding: '14px 16px',
              background: 'transparent', border: 'none',
              borderBottom: i < arr.length - 1 ? `1px solid ${theme.rule}` : 'none',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: theme.accent + '15', color: theme.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}><Icon name={it.icon} size={18}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{it.label}</div>
              <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 1 }}>{it.desc}</div>
            </div>
            <Icon name="chev-r" size={16} color={theme.inkMuted}/>
          </button>
        ))}
      </Card>

      {/* Sign out */}
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

      <div style={{
        textAlign: 'center', fontSize: 11, color: theme.inkMuted,
        letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600,
        marginTop: 4,
      }}>
        gsTeam Scoreboard
      </div>
    </div>
  );
}

Object.assign(window, { CAHome, CABook, CAProfile, ClientRow, SectionLabel });
