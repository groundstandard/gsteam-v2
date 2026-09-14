// calc.jsx — scoring math (mirror of CA Bonus Tracker — Formula Guide.pdf)
//
// 2026-05-04 rewrite: Bobby flagged that scores went green even with only
// 1/50 clients having data. Root causes (audit in PRD §18.5):
//   1. Synthetic 0.6 growth baseline + lenient default thresholds
//   2. Config key casing drift (camel vs snake) made defaults take over
//   3. Buckets didn't match the legacy Sheet (3 perf sub-scores vs 5,
//      retention was an attrition+satisfaction mashup, growth was a
//      trend baseline instead of points-based)
//   4. No 90-day grace, no tier filter, no cancel-reason filter
//
// This file now implements the Formula Guide exactly. Sub-scores and
// buckets:
//
//   Per-client Performance sub-scores (5, equal weight):
//     - MRR Growth — linear $0 → fullCreditMrrGrowth (default $750/mo)
//     - Lead Cost — stepped: ≤$5 = 1.0, ≤$10 = 0.75, ≤$20 = 0.50, else 0
//     - Ad Spend — target = max($1000 floor, 10% × MRR); hits → 1.0,
//                  over up to cap (default 2.0), under linear 0 → 1.0
//     - Funnel — avg of booking/show/close ratios each capped at 1.0
//                vs floors (30% / 50% / 70%)
//     - Attrition — ≤greenFloor (3%) = 1.0, ≥criticalCeiling (5%) = 0,
//                   linear between
//
//   90-day grace: clients <90 days old auto-score 1.0 on Ad Spend /
//   Funnel / Attrition. They're still ramping.
//
//   Empty inputs are skipped, not zeroed. A CA whose 49/50 clients have
//   no data scores their performance from the 1 client with data.
//
//   Retention bucket (CA level): linear from retentionCliff (default
//   0.97) to 1.0 retention. Denominator = eligible (Standard+VIP) clients
//   signed before quarter start. Cancellations only count if their
//   reason is flagged counts_against_ca.
//
//   Growth bucket (CA level): points-based. Each eligible client (≥90
//   days at quarter end) scores 1pt for each of: review, testimonial,
//   case study, ≥1 referral, VIP tier, membership add-on, gear/products.
//   Plus 0.25pt per extra referral capped at +1pt. Score = points
//   earned / max possible (clients × 8).
//
//   Composite = ⅓ Performance + ⅓ Retention + ⅓ Growth.
//   Payout = (CA's eligible MRR ÷ all eligible MRR) × Total Pot ×
//            Composite. Pot read from quarter_inputs (agency_gross ×
//            pot_pct), with a graceful fallback to a config default.

const monthsBetween = (from, to) => {
  const a = new Date(from), b = new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
};

const fmtMoney = (n) => {
  // Bobby 2026-07-04: show all money to the nearest penny (2 decimals).
  if (n == null || isNaN(n)) return '$0.00';
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtPct = (n, decimals = 1) => {
  if (n == null || isNaN(n)) return '0%';
  return (n * 100).toFixed(decimals) + '%';
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtMonth = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const ymd = (d) => {
  const dt = (typeof d === 'string') ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
};

const firstOfMonth = (iso) => iso ? iso.slice(0, 7) + '-01' : '';
const todayIso = () => new Date().toISOString().slice(0, 10);
const currentMonthIso = () => firstOfMonth(todayIso());

const STATUS_COLORS = {
  green:  '#43A047',
  yellow: '#F9A825',
  red:    '#E53935',
  gray:   '#94928C',
};

function scoreToStatus(score) {
  if (score == null || isNaN(score)) return 'gray';
  if (score >= 0.80) return 'green';
  if (score >= 0.60) return 'yellow';
  return 'red';
}

// Coerce to a finite number, default if not. Used everywhere — empty fields
// must not silently turn into 0 unless we explicitly say so.
const _n = (v, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

// Config getter that tolerates both camelCase and snake_case keys.
// Production config.values JSONB sometimes stores snake_case; the JS
// code expects camelCase. Without this fallback the UI silently uses
// internal defaults for every threshold (the bug behind "everything
// green" Bobby flagged 2026-05-01).
function cfgGet(cfg, key, fallback) {
  if (!cfg) return fallback;
  if (cfg[key] != null) return cfg[key];
  const snake = key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
  if (cfg[snake] != null) return cfg[snake];
  return fallback;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Days since the client signed. Used for the 90-day grace period.
function clientAgeDays(client, today = new Date()) {
  if (!client || !client.signDate) return Infinity;
  const sign = new Date(client.signDate);
  return Math.max(0, Math.floor((today - sign) / (1000 * 60 * 60 * 24)));
}

// Client tier eligibility for bonus scoring. Per spec only Standard + VIP
// count toward CA scoring.
//
// Bobby 2026-07-01: clients that aren't marked Standard or VIP (e.g. left
// blank, or on another tier) were still being counted in the bonus metrics.
// The old rollout fallback treated a missing tier as eligible; now that the
// tier column is populated, eligibility is strict — only an explicit
// standard/vip counts. Anything else (blank or other) is excluded from the
// bonus and drops off the dashboard's default Standard+VIP view.
function isEligibleTier(client) {
  if (!client) return false;
  const tier = (client.tier || '').toLowerCase();
  return tier === 'standard' || tier === 'vip';
}

// Whether a cancellation should count against the CA. If the column
// isn't on the row yet (schema rollout), assume yes (preserves the old
// strict behavior). Once cancel_reasons lookup is populated, owner sets
// each reason's counts_against_ca flag.
function cancelCountsAgainstCA(client, cancelReasonsByCode) {
  if (!client || !client.cancelDate) return false;
  if (!client.cancelReason) return true; // legacy default
  const reason = cancelReasonsByCode && cancelReasonsByCode[client.cancelReason];
  if (!reason) return true; // unknown reason → strict default
  return reason.countsAgainstCa !== false;
}

// ── Weekly→Monthly rollup helper (mirror of v_monthly_metrics_effective) ───
// Aggregation rules per field:
//   Snapshot (state at a point in time): clientMRR, totalStudentsStart,
//     clientGrossRevenue → take LATEST week within month
//   Flow (events during a period): adSpend, leadsGenerated, apptsBooked,
//     leadsShowed, leadsSigned, studentsCancelled, studentsAcquired → SUM
//   Derived: leadCost = SUM(adSpend) / SUM(leadsGenerated)
function rollUpWeeklyToMonthly(weeklyMetrics, clientId) {
  const rows = (weeklyMetrics || []).filter(w => w && w.clientId === clientId && w.weekStart);
  if (rows.length === 0) return [];
  const byMonth = new Map();
  for (const r of rows) {
    const month = r.weekStart.slice(0, 7) + '-01';
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(r);
  }
  return Array.from(byMonth.entries()).map(([month, weeks]) => {
    const sorted = [...weeks].sort((a, b) => (a.weekStart || '').localeCompare(b.weekStart || ''));
    const latest = sorted[sorted.length - 1];
    const sum = (k) => weeks.reduce((s, r) => s + _n(r[k]), 0);
    const sumLeads  = sum('leadsGenerated');
    const sumSpend  = sum('adSpend');
    return {
      id: `WMR-${clientId}-${month.slice(0, 7)}`,
      caId: latest.caId,
      clientId,
      month,
      adSpend: sumSpend,
      leadsGenerated:    sumLeads,
      apptsBooked:       sum('apptsBooked'),
      leadsShowed:       sum('leadsShowed'),
      leadsSigned:       sum('leadsSigned'),
      studentsAcquired:  sum('studentsAcquired'),
      studentsCancelled: sum('studentsCancelled'),
      clientMRR:           _n(latest.clientMRR),
      caLoggedMRR:         latest.caLoggedMRR,
      stripeObservedMRR:   latest.stripeObservedMRR,
      clientGrossRevenue:  _n(latest.clientGrossRevenue),
      totalStudentsStart:  _n(latest.totalStudentsStart),
      leadCost: sumLeads > 0 ? sumSpend / sumLeads : 0,
      source: 'weekly_rolled',
      _weekCount: weeks.length,
    };
  });
}

// Build effective monthly metrics for a client by merging weekly rollups
// (preferred when present for a month) with direct monthly_metrics entries
// (fallback for months without any weekly data).
function effectiveMonthlyMetrics(monthlyMetrics, weeklyMetrics, clientId) {
  const rolled = rollUpWeeklyToMonthly(weeklyMetrics, clientId);
  const rolledMonths = new Set(rolled.map(r => r.month));
  const monthlyOnly = (monthlyMetrics || [])
    .filter(m => m && m.clientId === clientId && !rolledMonths.has(m.month));
  return [...rolled, ...monthlyOnly]
    .sort((a, b) => (a.month || '').localeCompare(b.month || ''));
}

// Default quarter window helpers — used when config doesn't specify one.
function defaultQuarterWindow(today = new Date()) {
  const y = today.getFullYear();
  const qIdx = Math.floor(today.getMonth() / 3);
  const startMonth = qIdx * 3;
  const start = new Date(y, startMonth, 1);
  const end = new Date(y, startMonth + 3, 0); // last day of quarter
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

// ── Per-client Performance sub-scores ─────────────────────────────────────
// Returns { mrrGrowth, leadCost, adSpend, funnel, attrition, satisfaction,
//          performance, ... legacy compat fields ... }
//
// Sub-scores 2-5 aggregate over the QUARTER window (3 months together) per
// Bobby 2026-05-05. Weekly entries roll up to monthly first via
// effectiveMonthlyMetrics so weekly cadence clients participate transparently.
function clientSubScores(client, metrics, surveys, config, today = new Date(), weeklyMetrics = []) {
  const cfg = config || {};
  // Effective: weekly rollups + monthly fallback. Sorted ascending by month.
  const cMetrics = effectiveMonthlyMetrics(metrics, weeklyMetrics, client.id);

  // Quarter window. Defaults to the calendar quarter containing `today` so
  // empty config doesn't silently zero everything.
  const dq = defaultQuarterWindow(today);
  const qStartIso = cfgGet(cfg, 'quarterStart', dq.start);
  const qEndIso   = cfgGet(cfg, 'quarterEnd',   dq.end);

  // Just the rows that fall inside the quarter (used for all 5 sub-scores)
  const inQuarter = cMetrics.filter(m =>
    m.month && m.month >= qStartIso && m.month <= qEndIso
  );
  const qFirst = inQuarter[0] || null;
  const qLast  = inQuarter[inQuarter.length - 1] || null;
  const sumQ = (k) => inQuarter.reduce((s, r) => s + _n(r[k]), 0);

  const inGrace = clientAgeDays(client, today) < _n(cfgGet(cfg, 'gracePeriodDays', 90));

  // ── Sub-score 1: MRR Growth ─────────────────────────────────────────────
  // Linear: $0 → 0; fullCreditMrrGrowth → 1.0. Negative floors at 0.
  // First-month MRR vs last-month MRR within the quarter window.
  // GRACE PERIOD POLICY (revised 2026-05-04 per Bobby): clients <90 days
  // return NULL on perf sub-scores (skipped from average), not 1.0.
  let mrrGrowth = null;
  if (inQuarter.length >= 2 && qFirst && qLast) {
    const firstMRR = _n(qFirst.clientMRR);
    const lastMRR  = _n(qLast.clientMRR);
    const delta = lastMRR - firstMRR;
    const target = _n(cfgGet(cfg, 'fullCreditMrrGrowth', 750));
    mrrGrowth = clamp(delta / Math.max(target, 1), 0, 1);
  }

  // ── Sub-score 2: Lead Cost (stepped, quarterly) ─────────────────────────
  // SUM(adSpend) / SUM(leadsGenerated) across the quarter, then stepped.
  const qAdSpend = sumQ('adSpend');
  const qLeads   = sumQ('leadsGenerated');
  let leadCost = null;
  if (qLeads > 0 && qAdSpend > 0) {
    const lc = qAdSpend / qLeads;
    const best  = _n(cfgGet(cfg, 'leadCostBest',       5));
    const great = _n(cfgGet(cfg, 'leadCostGreat',     10));
    const ok    = _n(cfgGet(cfg, 'leadCostAcceptable', 20));
    if      (lc <= best)  leadCost = 1.0;
    else if (lc <= great) leadCost = 0.75;
    else if (lc <= ok)    leadCost = 0.50;
    else                  leadCost = 0;
  }

  // ── Sub-score 3: Ad Spend (quarterly) ───────────────────────────────────
  // Quarterly target = SUM over months of MAX(floor, pct × monthly MRR).
  // Score = MIN(1, SUM(adSpend) / SUM(target)). Caps at 1.0 for display.
  let adSpend = null;
  if (qAdSpend > 0) {
    const pct = _n(cfgGet(cfg, 'adSpendPctOfGross', 0.10));
    const floor = _n(cfgGet(cfg, 'adSpendFloor', 1000));
    const qTarget = inQuarter.reduce(
      (s, r) => s + Math.max(floor, _n(r.clientMRR) * pct), 0
    );
    if (qTarget > 0) {
      adSpend = qAdSpend >= qTarget ? 1 : clamp(qAdSpend / qTarget, 0, 1);
    }
  }

  // ── Sub-score 4: Funnel (booking / show / close, quarterly) ─────────────
  // Quarterly rates from quarterly totals — every step's denominator is the
  // SUM of the prior step across the quarter, not a per-month average.
  let funnel = null;
  const qBooked = sumQ('apptsBooked');
  const qShowed = sumQ('leadsShowed');
  const qSigned = sumQ('leadsSigned');
  if (qLeads > 0 || qBooked > 0 || qShowed > 0) {
    const bookFloor  = _n(cfgGet(cfg, 'bookingFloor', 0.30));
    const showFloor  = _n(cfgGet(cfg, 'showFloor',    0.50));
    const closeFloor = _n(cfgGet(cfg, 'closeFloor',   0.70));
    const bookRate  = qLeads  > 0 ? qBooked / qLeads  : 0;
    const showRate  = qBooked > 0 ? qShowed / qBooked : 0;
    const closeRate = qShowed > 0 ? qSigned / qShowed : 0;
    const bookScore  = clamp(bookRate  / Math.max(bookFloor,  0.01), 0, 1);
    const showScore  = clamp(showRate  / Math.max(showFloor,  0.01), 0, 1);
    const closeScore = clamp(closeRate / Math.max(closeFloor, 0.01), 0, 1);
    funnel = (bookScore + showScore + closeScore) / 3;
  }

  // ── Sub-score 5: Student Attrition (quarterly) ──────────────────────────
  // SUM(studentsCancelled across quarter) / first-month totalStudentsStart.
  // Falls back to the last month's start count if the first is empty (some
  // historical rows don't have it filled).
  let attrition = null;
  const qCancelled = sumQ('studentsCancelled');
  const startStudents =
    _n(qFirst?.totalStudentsStart) ||
    _n(qLast?.totalStudentsStart);
  if (startStudents > 0) {
    const cancelRate = qCancelled / startStudents;
    const greenFloor = _n(cfgGet(cfg, 'attritionGreenFloor',     0.03));
    const critCeil   = _n(cfgGet(cfg, 'attritionCriticalCeiling', 0.05));
    if      (cancelRate <= greenFloor) attrition = 1;
    else if (cancelRate >= critCeil)   attrition = 0;
    else attrition = 1 - (cancelRate - greenFloor) / Math.max(critCeil - greenFloor, 0.0001);
  }

  // Performance bucket: avg of 5 sub-scores (skip nulls per spec).
  //
  // Bobby 2026-05-12: "How is academy of jiu jitsu scottsdale 100%?"
  // When the team had logged ONLY revenue (no ad spend, leads, funnel,
  // students) the only non-null sub-score was mrrGrowth — pegged at 1.0
  // because revenue grew month-over-month — and the average over a
  // single value is that single value. So the client showed 100%
  // Performance/Composite on the dashboard despite essentially no data.
  //
  // Guard: require at least 2 of 5 sub-scores to have actual data before
  // we emit a Performance number. Below the threshold, return null so
  // the dashboard / Client Detail render "—" with the "no data yet" copy
  // instead of a misleadingly perfect score. Clients with only sparse
  // tracking won't pollute the CA-level Performance bucket either,
  // because nulls are skipped from that average.
  const PER_CLIENT_MIN_SUBSCORES = 2;
  const perfParts = [mrrGrowth, leadCost, adSpend, funnel, attrition].filter(v => v != null && Number.isFinite(v));
  const performance = perfParts.length >= PER_CLIENT_MIN_SUBSCORES
    ? perfParts.reduce((a, b) => a + b, 0) / perfParts.length
    : null;

  // ── Satisfaction (narrative — used for display only, not in buckets) ────
  // Per Formula Guide §SATISFACTION SUB-SCORE: separate display metric.
  const lookbackMonths = _n(cfgGet(cfg, 'satisfactionLookbackMonths', 6));
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  const recentSurveys = (surveys || []).filter(s =>
    s.clientId === client.id && s.date && new Date(s.date) >= cutoff
  );
  let satisfaction = null;
  if (recentSurveys.length === 0) {
    // No data = no display score (gray). Past grace, this would normally
    // apply noResponsePenalty per spec, but Bobby's preference is to show
    // empty rather than penalize. The bucket-level Retention rate is what
    // actually matters for the bonus payout.
    satisfaction = null;
  } else {
    const total = recentSurveys.reduce((s, r) => {
      if (r.score != null) return s + _n(r.score) / 10; // 1-10 scale
      const sub = (_n(r.overall) + _n(r.responsiveness) + _n(r.followThrough) + _n(r.communication)) / 4;
      return s + sub / 5;
    }, 0);
    satisfaction = clamp(total / recentSurveys.length, 0, 1);
  }

  // ── Legacy compat fields for existing UI ────────────────────────────────
  // ca-detail.jsx + admin-extra.jsx reference revenue, adEfficiency, growth.
  // Keep these computed for display so the old screens still render
  // without a parallel rewrite — but they're NOT used in bucket math.
  const avgMRR = inQuarter.length
    ? inQuarter.reduce((s, m) => s + _n(m.clientMRR), 0) / inQuarter.length
    : null;
  const revenue = avgMRR != null
    ? clamp(avgMRR / Math.max(_n(client.monthlyRetainer), 1), 0, 1.2)
    : null;
  const adEfficiency = adSpend; // alias for legacy callers
  const growth = mrrGrowth;     // alias for legacy callers

  // Composite at the per-client level — 5 perf sub-scores avg. Useful for
  // Client Rollup / Client Calc R/Y/G display.
  const composite = performance;

  return {
    mrrGrowth, leadCost, adSpend, funnel, attrition,
    performance,
    satisfaction,
    revenue, adEfficiency, growth, composite,
    inGrace,
    recentMonths: inQuarter.length,        // legacy field name; now means "months in quarter"
    quarterMonths: inQuarter.length,
    quarterStart: qStartIso,
    quarterEnd:   qEndIso,
  };
}

// ── Per-CA scorecard (Performance + Retention + Growth → Composite) ────────
function caScorecard(ca, state) {
  if (!ca) return emptyScorecard();
  const cfg = (state && state.config) || {};
  const allClients = (state && state.clients) || [];
  const allMetrics = (state && state.monthlyMetrics) || [];
  const allWeekly  = (state && state.weeklyMetrics)  || [];
  const allSurveys = (state && state.surveys) || [];
  const allEvents  = (state && state.growthEvents) || [];
  const cancelReasonsByCode = (state && state.cancelReasonsByCode) || {};

  // Quarter window
  const now = new Date();
  const qStartIso = cfgGet(cfg, 'quarterStart',
    `${now.getFullYear()}-${String(Math.floor(now.getMonth() / 3) * 3 + 1).padStart(2, '0')}-01`);
  const qEndIso = cfgGet(cfg, 'quarterEnd', qStartIso);
  const qStart = new Date(qStartIso);
  const qEnd = new Date(qEndIso);

  // CA's clients (assigned, eligible tier, currently active)
  const myClients = allClients.filter(c =>
    c.assignedCA === ca.id && !c.cancelDate && isEligibleTier(c)
  );
  if (myClients.length === 0) return emptyScorecard();

  // ── Performance bucket ──────────────────────────────────────────────────
  // Avg of per-client performance sub-scores, skipping clients with no data
  // (per Formula Guide: "empty inputs don't penalize").
  const subs = myClients.map(c => ({
    client: c,
    sub: clientSubScores(c, allMetrics, allSurveys, cfg, now, allWeekly),
  }));
  const perfValues = subs.map(s => s.sub.performance).filter(v => v != null && Number.isFinite(v));
  const performance = perfValues.length
    ? perfValues.reduce((a, b) => a + b, 0) / perfValues.length
    : null;

  // ── Retention bucket ────────────────────────────────────────────────────
  // Denominator = clients assigned to this CA, eligible tier, signed BEFORE
  // the quarter started (new signups during the quarter don't count).
  // Cancellations during the quarter that count_against_ca subtract from
  // numerator. Score: linear from cliff (default 0.97) to 1.0.
  //
  // TKT-12.2 (Bobby 2026-05-06): clients with any flagged_inactive=true row
  // in the quarter (across monthly_metrics, weekly_metrics, monthly_checkins,
  // weekly_checkins) are treated as "at risk" for retention — even if no
  // cancel_date is set. The CA explicitly marked the period inactive, so it
  // counts against retention just like a counts_against_ca cancellation.
  const eligibleAtStart = allClients.filter(c =>
    c.assignedCA === ca.id &&
    isEligibleTier(c) &&
    c.signDate && new Date(c.signDate) < qStart
  );
  const flaggedInactiveIds = new Set();
  const allLogTables = [
    state.monthlyMetrics, state.weeklyMetrics,
    state.monthlyCheckins, state.weeklyCheckins,
  ];
  allLogTables.forEach((rows) => {
    (rows || []).forEach((r) => {
      if (!r || !r.flaggedInactive) return;
      const periodIso = r.month || r.weekStart;
      if (!periodIso) return;
      const d = new Date(periodIso);
      if (d >= qStart && d <= qEnd) flaggedInactiveIds.add(r.clientId);
    });
  });
  const atRisk = eligibleAtStart.filter((c) => {
    const cancelled = c.cancelDate
      && new Date(c.cancelDate) >= qStart
      && new Date(c.cancelDate) <= qEnd
      && cancelCountsAgainstCA(c, cancelReasonsByCode);
    return cancelled || flaggedInactiveIds.has(c.id);
  });
  const cancelledThisQuarter = atRisk; // legacy alias for the rest of the function
  const denom = eligibleAtStart.length;
  const retainedRate = denom > 0
    ? (denom - atRisk.length) / denom
    : null;
  const cliff = _n(cfgGet(cfg, 'retentionCliff', 0.97));
  let retention = null;
  if (retainedRate != null) {
    if (retainedRate >= 1)        retention = 1;
    else if (retainedRate <= cliff) retention = 0;
    else retention = (retainedRate - cliff) / Math.max(1 - cliff, 0.0001);
  }

  // ── Growth bucket (points-based, 8 max per eligible 90+day client) ──────
  // 1pt each: review obtained, testimonial obtained, case study obtained,
  // ≥1 referral this quarter, on VIP tier, has membership add-on,
  // has gear/products. Plus 0.25/extra referral capped at +1.
  const eligibleForGrowth = myClients.filter(c =>
    clientAgeDays(c, qEnd) >= _n(cfgGet(cfg, 'gracePeriodDays', 90))
  );
  let totalPoints = 0;
  let maxPoints = 0;
  eligibleForGrowth.forEach(c => {
    maxPoints += 8; // 7 categories + up to 1pt referral bonus
    const ev = (allEvents || []).filter(e =>
      e.clientId === c.id && e.date && new Date(e.date) >= qStart && new Date(e.date) <= qEnd
    );
    const has = (type) => ev.some(e => (e.eventType || '').toLowerCase().includes(type));
    if (has('review'))     totalPoints += 1;
    if (has('testimonial')) totalPoints += 1;
    if (has('case'))       totalPoints += 1;
    const refs = ev.filter(e => (e.eventType || '').toLowerCase().includes('referral'));
    if (refs.length >= 1)  totalPoints += 1;
    if (refs.length > 1)   totalPoints += Math.min(1, (refs.length - 1) * 0.25);
    if ((c.tier || '').toLowerCase() === 'vip') totalPoints += 1;
    if (c.hasMembershipAddon)                    totalPoints += 1;
    if (has('gear'))                             totalPoints += 1;
  });
  const growth = maxPoints > 0
    ? clamp(totalPoints / maxPoints, 0, 1)
    : null;

  // ── Book completeness — data coverage gate on Performance ──────────────
  // Counts months covered by EFFECTIVE metrics (weekly rollups + monthly
  // entries) so a weekly-cadence client logging weeks 1-4 of a month counts
  // as one filled month, not four. Mirrors the SQL function in
  // 20260505_quarterly_scoring.sql.
  //
  // Kurt 2026-06-22: a client's tracking begins on its sign date — months
  // BEFORE the client started shouldn't count as "missing." So expected
  // months are clamped per-client to start at the later of (quarter start,
  // the client's sign month). A client that signed mid-quarter is only
  // expected to have data from its sign month forward, and the book no
  // longer looks incomplete for months that pre-date the client.
  //
  // Kurt 2026-07-28: a client inside the 90-day grace period is already skipped
  // by the performance sub-scores and the growth bucket — but book completeness
  // still expected its months, so a brand-new account (e.g. one that signed
  // mid-June) dragged the gate down on a book it had barely joined. Apply the
  // same grace here so a new client is consistently not expected to have data
  // yet. Uses `now` like clientSubScores' inGrace, not the quarter end.
  const graceDays = _n(cfgGet(cfg, 'gracePeriodDays', 90));
  let expected = 0;
  let filled = 0;
  myClients.forEach(c => {
    if (clientAgeDays(c, now) < graceDays) return;
    const signMonth = c.signDate ? firstOfMonth(c.signDate) : qStartIso;
    const effectiveStart = signMonth > qStartIso ? signMonth : qStartIso;
    // No expected months if the client signed after the quarter ended.
    if (effectiveStart > qEndIso) return;
    expected += Math.max(monthsBetween(effectiveStart, qEndIso) + 1, 1);
    const eff = effectiveMonthlyMetrics(allMetrics, allWeekly, c.id);
    filled += eff.filter(m => m.month >= effectiveStart && m.month <= qEndIso).length;
  });
  const bookCompleteness = expected > 0 ? clamp(filled / expected, 0, 1) : 0;

  // Performance, gated by data coverage. If 1/50 client-months are filled,
  // performance contribution drops to ~2% of its raw value — matches the
  // UI copy and the legacy Sheet's intuition.
  const performanceGated = performance != null
    ? performance * bookCompleteness
    : null;

  // ── Composite ───────────────────────────────────────────────────────────
  // ⅓ × each bucket. Null buckets contribute 0 to the average ONLY when
  // there's no data to score them (matches "empty inputs don't penalize"
  // at the bucket level — null vs zero matters for display).
  const buckets = [performanceGated, retention, growth];
  const validBuckets = buckets.filter(v => v != null && Number.isFinite(v));
  const composite = validBuckets.length
    ? validBuckets.reduce((a, b) => a + b, 0) / validBuckets.length
    : 0;

  // ── Bonus pot share (MRR-weighted) ─────────────────────────────────────
  // Per spec: pot share = (CA's eligible MRR) ÷ (all CAs' eligible MRR) × pot.
  // Pot read from quarter_inputs (agency_gross × pot_pct), with config
  // fallback (potPercentage default 0.005, agencyGross required) so the
  // math doesn't NaN before the table is populated.
  //
  // Bobby 2026-05-12: "Bonus pot for Q2 2026 isn't set yet. I set the
  // quarter already under Admin." Two bugs were combining to surface
  // this even after a successful save:
  //   1. state.quarterInputs is computed once at app-load (api.jsx
  //      loadStateSupabase picks the row matching cfg.quarterStart).
  //      Realtime pushes new rows into state.allQuarterInputs but
  //      never re-derives state.quarterInputs, so it stays null/stale.
  //      Fix: pick the right row HERE on every scorecard call by
  //      matching qStartIso against allQuarterInputs.
  //   2. The DB column is pot_pct → after toUI it becomes potPct, but
  //      this code was reading qInputs.potPercentage. Mismatch → fell
  //      through to the cfg default (0.005). agencyGrossLastMonth was
  //      already correct because that one matches.
  const allQI = (state && state.allQuarterInputs) || [];
  const qInputs = allQI.find(q => q.quarterStart === qStartIso)
    || (state && state.quarterInputs)
    || allQI[0]
    || null;
  const agencyGross = _n(qInputs && qInputs.agencyGrossLastMonth, _n(cfgGet(cfg, 'agencyGrossLastMonth', 0)));
  const potPct = _n(qInputs && (qInputs.potPct != null ? qInputs.potPct : qInputs.potPercentage),
                    _n(cfgGet(cfg, 'potPercentage', 0.005)));
  const totalPot = agencyGross * potPct;

  // Each CA's MRR share of all eligible-MRR
  const caEligibleMrr = sumEligibleMRR(myClients, allMetrics, qStartIso);
  const allCas = (state && state.cas) || [];
  const allEligibleMrr = allCas
    .filter(otherCa => otherCa.active !== false)
    .reduce((sum, otherCa) => {
      const theirClients = allClients.filter(c =>
        c.assignedCA === otherCa.id && !c.cancelDate && isEligibleTier(c)
      );
      return sum + sumEligibleMRR(theirClients, allMetrics, qStartIso);
    }, 0);
  const mrrShare = allEligibleMrr > 0 ? caEligibleMrr / allEligibleMrr : 0;
  const caPot = totalPot * mrrShare;
  const finalPayout = Math.round(caPot * composite);

  return {
    composite: Number.isFinite(composite) ? composite : 0,
    finalPayout: Number.isFinite(finalPayout) ? finalPayout : 0,
    maxPayout: Math.round(caPot),
    bookCompleteness: Number.isFinite(bookCompleteness) ? bookCompleteness : 0,
    // Display the GATED performance so the UI matches the bucket value
    // that fed into composite. Raw (ungated) is preserved as performanceRaw
    // for diagnostics.
    performance: performanceGated != null && Number.isFinite(performanceGated) ? performanceGated : 0,
    performanceRaw: performance != null && Number.isFinite(performance) ? performance : 0,
    retention:   retention   != null && Number.isFinite(retention)   ? retention   : 0,
    growth:      growth      != null && Number.isFinite(growth)      ? growth      : 0,
    // diagnostic counts so admins can see WHY a score is what it is
    eligibleClientCount: myClients.length,
    perfDataClientCount: perfValues.length,
    eligibleAtQuarterStart: eligibleAtStart.length,
    cancelledThisQuarter: cancelledThisQuarter.length,
    growthEligibleCount: eligibleForGrowth.length,
    mrrShare,
    totalPot,
    caEligibleMrr,
    clients: subs,
    // Bobby 2026-05-12: the CA Home greeting + "pot isn't set" banner
    // were hardcoded to "Q2 2026". Expose the quarter window so the UI
    // can derive a dynamic label and stay correct after Q2 ends.
    qStart: qStartIso,
    qEnd: qEndIso,
  };
}

function sumEligibleMRR(clients, allMetrics, qStartIso) {
  // MRR at quarter start — pull the most recent monthly_metric on or
  // before quarter start; fall back to the client.monthlyRetainer.
  return clients.reduce((sum, c) => {
    const cMetrics = (allMetrics || [])
      .filter(m => m.clientId === c.id && m.month <= qStartIso)
      .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
    const m = cMetrics[0];
    if (m && _n(m.clientMRR) > 0) return sum + _n(m.clientMRR);
    return sum + _n(c.monthlyRetainer);
  }, 0);
}

function emptyScorecard() {
  return {
    composite: 0, finalPayout: 0, maxPayout: 0,
    bookCompleteness: 0,
    performance: 0, retention: 0, growth: 0,
    eligibleClientCount: 0, perfDataClientCount: 0,
    eligibleAtQuarterStart: 0, cancelledThisQuarter: 0,
    growthEligibleCount: 0,
    mrrShare: 0, totalPot: 0, caEligibleMrr: 0,
    clients: [],
  };
}

// ── Sales commissions (unchanged) ──────────────────────────────────────────
function salesRollup(repId, state) {
  const rep = state.sales.find(s => s.id === repId);
  if (!rep) return null;

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const myContracts = state.clients.filter(c => {
    if (rep.role === 'AE' || rep.role === 'AM') return c.ae === repId;
    if (rep.role === 'SDR' || rep.role === 'RDR') return c.sdrBookedBy === repId;
    return false;
  });

  const milestones = [];
  myContracts.forEach(c => {
    const sign = new Date(c.signDate);
    const contractValue = _n(c.monthlyRetainer) * _n(c.termMonths);

    if (rep.role === 'AE' || rep.role === 'AM') {
      const upfrontDate = new Date(sign);
      const midDate = new Date(sign); midDate.setMonth(midDate.getMonth() + Math.floor(_n(c.termMonths) / 2));
      const endDate = new Date(sign); endDate.setMonth(endDate.getMonth() + _n(c.termMonths));

      milestones.push({ clientId: c.id, label: 'Upfront',  date: ymd(upfrontDate), amount: contractValue * _n(c.upfrontPct), status: upfrontDate < new Date() ? 'paid' : 'pending' });
      milestones.push({ clientId: c.id, label: 'Midpoint', date: ymd(midDate),     amount: contractValue * _n(c.midPct),     status: midDate < new Date() ? 'paid' : 'pending' });
      milestones.push({ clientId: c.id, label: 'End',      date: ymd(endDate),     amount: contractValue * _n(c.endPct),     status: 'pending' });
    } else if (rep.role === 'SDR' || rep.role === 'RDR') {
      milestones.push({ clientId: c.id, label: 'Booking', date: ymd(sign), amount: _n(state.config && state.config.sdrFlatFeePerBooking, 100), status: 'paid' });
    }
  });

  const ytdMilestones = milestones.filter(m => new Date(m.date) >= yearStart);
  const paidYtd = ytdMilestones.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const pending = milestones.filter(m => m.status === 'pending').reduce((s, m) => s + m.amount, 0);

  const myAdj = (state.adjustments || []).filter(a => a.repId === repId);
  const adjPaid = myAdj.filter(a => a.status === 'Paid').reduce((s, a) => {
    return s + (a.type === 'Clawback' ? -a.amount : a.amount);
  }, 0);
  const adjPending = myAdj.filter(a => a.status === 'Pending').reduce((s, a) => s + a.amount, 0);

  const today = new Date();
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const upcoming = milestones.filter(m => {
    const d = new Date(m.date);
    return d >= today && d <= in30 && m.status === 'pending';
  });

  return {
    rep,
    contracts: myContracts,
    milestones,
    paidYtd: paidYtd + adjPaid,
    pending: pending + adjPending,
    activeContracts: myContracts.filter(c => !c.cancelDate).length,
    upcoming,
  };
}

Object.assign(window, {
  CABT_clientSubScores: clientSubScores,
  CABT_caScorecard: caScorecard,
  CABT_salesRollup: salesRollup,
  CABT_rollUpWeeklyToMonthly: rollUpWeeklyToMonthly,
  CABT_effectiveMonthlyMetrics: effectiveMonthlyMetrics,
  CABT_scoreToStatus: scoreToStatus,
  CABT_STATUS_COLORS: STATUS_COLORS,
  CABT_fmtMoney: fmtMoney,
  CABT_fmtPct: fmtPct,
  CABT_fmtDate: fmtDate,
  CABT_fmtMonth: fmtMonth,
  CABT_currentMonthIso: currentMonthIso,
  CABT_firstOfMonth: firstOfMonth,
  CABT_todayIso: todayIso,
  CABT_clamp: clamp,
});
