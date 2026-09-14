// formula-explanations.js — TKT-12.6
//
// Plain-English prose for every formula in the Formula Inspector. Decoupled
// into a standalone file so non-engineers can edit the wording without
// touching React. Loaded as a plain script in index.html (no Babel needed),
// exposed as `window.FORMULA_EXPLANATIONS`.
//
// Each entry is a paragraph of prose explaining (a) what the formula
// measures, (b) why it's there, (c) how to read it. The Inspector renders
// the formula in monospace, then a horizontal hairline rule, then this
// prose below it.
//
// To add or revise a formula's plain-English copy: edit the matching entry
// below and reload — no rebuild, no engineer required.

window.FORMULA_EXPLANATIONS = {
  composite: (
    'A CA\'s composite is the simple average of three buckets: Performance ' +
    '(how well their accounts are running), Retention (whether eligible ' +
    'clients are sticking), and Growth (qualitative wins like reviews, ' +
    'referrals, VIP upgrades). All three count equally — there is no ' +
    'weighting. The composite drives the bonus payout: a 100/100 composite ' +
    'unlocks the full pot share, anything lower scales it down linearly.'
  ),

  performance: (
    'Performance averages five sub-scores per client (MRR Growth, Lead Cost, ' +
    'Ad Spend, Funnel, Attrition), then averages across the CA\'s eligible ' +
    'clients, then multiplies by Book Completeness — a gate that rewards ' +
    'logging discipline. If logs are missing for a month, the gate drops ' +
    'and the entire bucket is pulled down with it. Sub-scores are skipped ' +
    '(not zeroed) when data is missing, so a client with only Lead Cost ' +
    'logged is judged on Lead Cost alone for that quarter.'
  ),

  mrrGrowth: (
    'MRR Growth measures whether a client\'s monthly recurring revenue is ' +
    'climbing across the quarter. We compare the first month\'s MRR against ' +
    'the last month\'s MRR — a +$750 gain is full credit (1.0); flat or ' +
    'negative is 0. Clients younger than the grace period (default 90 ' +
    'days) return null and are skipped from the average rather than ' +
    'penalised. The full-credit threshold ($750/mo) is configurable.'
  ),

  leadCost: (
    'Lead Cost is total ad spend divided by total leads generated across ' +
    'the entire quarter, then mapped to a stepped score (best = 1.0, ' +
    'great = 0.75, OK = 0.5, anything worse = 0). Quarterly aggregation ' +
    'avoids penalising one bad month — a CA who spent heavily in March ' +
    'but harvested in April still scores on the combined ratio. The four ' +
    'thresholds (best/great/OK/floor) are all configurable.'
  ),

  adSpend: (
    'Ad Spend checks whether the CA is investing enough in ads to actually ' +
    'fuel growth. The target each month is the larger of (a) a flat floor ' +
    '($1,000 default) or (b) a percentage of that month\'s MRR (10% default). ' +
    'We sum target across all months in the quarter and compare against ' +
    'actual spend. Hitting or exceeding the target = 1.0; below scales ' +
    'linearly. This rewards healthy reinvestment without punishing months ' +
    'where MRR happened to dip.'
  ),

  funnel: (
    'Funnel averages three rates across the quarter: booking (leads → ' +
    'appointments), show (appointments → showed), and close (showed → ' +
    'signed). Each rate gets compared to its floor — booking 30%, show ' +
    '50%, close 70% by default — and scaled linearly. The three scores ' +
    'are averaged, so a CA who books well but loses people at show-up ' +
    'gets a middling Funnel score, not a high one.'
  ),

  attrition: (
    'Attrition tracks student churn: total cancellations during the ' +
    'quarter divided by the student count at the start. Below the green ' +
    'floor (3% default) is a perfect 1.0; at or above the critical ceiling ' +
    '(5% default) is 0; anywhere between scales linearly downward. This ' +
    'is at the student level, not the client level — a single client ' +
    'losing many students hits this score without affecting Retention.'
  ),

  retention: (
    'Retention is the simplest bucket: of the eligible clients (Standard ' +
    'or VIP) who were on the books at the START of the quarter, what ' +
    'fraction survived? We then map that survival rate to a 0–1 score ' +
    'with a cliff (97% default): below the cliff is 0, at 100% retained ' +
    'is 1.0, in-between scales linearly. Cancellations only count against ' +
    'the CA when the cancel reason is flagged "counts against CA" — a ' +
    'client who paused for medical reasons does not penalise.'
  ),

  growth: (
    'Growth is point-based, not rate-based. Each eligible client (90+ ' +
    'days old, Standard or VIP) can earn up to 8 points: review, ' +
    'testimonial, case study, ≥1 referral, VIP tier, membership add-on, ' +
    'gear/products, plus a +0.25 bonus per extra referral capped at +1. ' +
    'The CA\'s total points divided by the maximum possible (8 × eligible) ' +
    'is the bucket score. This rewards qualitative client-relationship ' +
    'work that doesn\'t show up in the Performance metrics.'
  ),

  payout: (
    'The bonus payout starts with the total pot — last month\'s agency ' +
    'gross times the pot percentage (configurable per quarter in Admin → ' +
    'Bonus). Each CA gets a slice of that pot proportional to their ' +
    'share of all eligible MRR (Standard + VIP clients only). That slice ' +
    'is then multiplied by their composite score: 100/100 unlocks the ' +
    'full slice, 50/100 unlocks half. So Performance, Retention, Growth ' +
    'all matter — but only after the pot itself has been funded by the ' +
    'agency\'s actual revenue.'
  ),
};
