// admin-queues.jsx — Edit Approvals queue + Reviews Inbox.
// Both queues live in Supabase (edit_requests + reviews tables); in local
// mode we show empty/seed states so the UI is reachable for design review.

// Lightweight inline pill (different shape than StatusPill in ui.jsx, which
// hard-codes R/Y/G semantics — this one accepts arbitrary text).
function Pill({ tone = 'gray', theme, children }) {
  const tones = {
    green:  { bg: 'rgba(67,160,71,0.12)',  fg: '#2E7D32' },
    yellow: { bg: 'rgba(249,168,37,0.14)', fg: '#A06800' },
    red:    { bg: 'rgba(229,57,53,0.12)',  fg: '#C62828' },
    blue:   { bg: 'rgba(14,26,53,0.10)',   fg: '#0E1A35' },
    gray:   { bg: theme.rule,              fg: theme.inkSoft },
  };
  const c = tones[tone] || tones.gray;
  return (
    <span style={{
      display: 'inline-block', background: c.bg, color: c.fg,
      borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700,
      letterSpacing: 0.2, textTransform: 'capitalize', lineHeight: 1.4,
    }}>{children}</span>
  );
}

// ── Edit Approvals ──────────────────────────────────────────────────────
function AdminEditApprovals({ state, theme, onEditDecided }) {
  // Read from state directly so realtime updates flow through. Local-mode
  // dev shows the seed when state.editRequests isn't present.
  const requests = state.editRequests || SEED_EDIT_REQUESTS(state);
  const [filter, setFilter] = React.useState('pending'); // pending | approved | rejected
  const [busy, setBusy] = React.useState(null);
  const [err, setErr] = React.useState(null);

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const pending = requests.filter(r => r.status === 'pending').length;

  const decide = async (req, status) => {
    setBusy(req.id);
    setErr(null);
    if (CABT_getApiMode() === 'supabase') {
      try {
        if (status === 'approved') await CABT_api.approveEditRequest(req.id);
        else {
          const sb = await CABT_sb();
          await sb.from('edit_requests').update({ status: 'rejected' }).eq('id', req.id);
        }
        // Reflect the decision immediately rather than waiting for the realtime
        // round-trip (Bobby 2026-06-22: approving felt slow). The realtime push
        // still arrives and re-applies the same status idempotently. Manual
        // approval is unchanged — this only fires after a successful click.
        if (typeof onEditDecided === 'function') onEditDecided(req.id, status);
      } catch (e) {
        // Bobby 2026-06-22: "it was not working when I tried to approve." The
        // failure used to be swallowed (console-only), so a failed approve
        // looked like nothing happened. Surface it so the cause is visible.
        console.error('[edit request decision]', e);
        setErr({ id: req.id, message: e?.message || String(e) });
      }
    } else if (typeof onEditDecided === 'function') {
      onEditDecided(req.id, status);
    }
    setBusy(null);
  };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="shield" theme={theme}>
        Edits to fields tagged in <strong>Config → edit_fields_requiring_approval</strong> arrive here when made past the {state.config.editGraceDays || state.config.edit_grace_days || 7}-day grace window.
      </Banner>

      <SegBar theme={theme} value={filter} onChange={setFilter} options={[
        { value: 'pending',  label: `Pending${pending ? ` · ${pending}` : ''}` },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'all',      label: 'All' },
      ]}/>

      {err && (
        <div style={{
          background: STATUS.red + '15', color: STATUS.red,
          border: `1px solid ${STATUS.red}33`, borderRadius: 8,
          padding: '10px 14px', fontSize: 13, lineHeight: 1.45,
        }}>
          <strong>Approve/Reject failed.</strong> {err.message}
        </div>
      )}

      {filtered.length === 0 && (
        <Card theme={theme}>
          <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24, margin: '0 auto 12px',
              background: theme.rule, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="check" size={22}/></div>
            Queue is clear.
          </div>
        </Card>
      )}

      {filtered.map(r => <EditReqCard key={r.id} req={r} theme={theme} state={state}
        onApprove={() => decide(r, 'approved')}
        onReject={() => decide(r, 'rejected')}
        busy={busy === r.id}
      />)}
    </div>
  );
}

// Bobby 2026-05-11 design polish — refined card layout, human-readable
// table+field labels, resolved row context (client + month/week instead
// of raw MM-... id), properly weighted Approve / Reject buttons that
// work cleanly on desktop and mobile (44px+ tall touch targets, accent
// fill for primary, outlined red for destructive).
const EDIT_REQ_TABLE_LABELS = {
  monthly_metrics:  'Monthly metrics',
  weekly_metrics:   'Weekly metrics',
  weekly_checkins:  'Weekly check-in',
  monthly_checkins: 'Monthly check-in',
  growth_events:    'Growth event',
  surveys:          'Survey',
  clients:          'Client',
};
const EDIT_REQ_STATE_KEY = {
  monthly_metrics:  'monthlyMetrics',
  weekly_metrics:   'weeklyMetrics',
  weekly_checkins:  'weeklyCheckins',
  monthly_checkins: 'monthlyCheckins',
  growth_events:    'growthEvents',
  surveys:          'surveys',
  clients:          'clients',
};
const EDIT_REQ_FIELD_LABELS = {
  clientMRR:           'Client MRR',
  clientGrossRevenue:  'Gross revenue',
  adSpend:             'Ad spend',
  leadCost:            'Lead cost',
  leadsGenerated:      'Leads generated',
  apptsBooked:         'Appts booked',
  leadsShowed:         'Leads showed',
  leadsSigned:         'Leads signed',
  appointmentsBooked:  'Appts booked',
  appointmentsShowed:  'Leads showed',
  appointmentsClosed:  'Leads signed',
  studentsCancelled:   'Students cancelled',
  totalStudentsStart:  'Students at start',
  flaggedInactive:     'Flagged inactive',
  weekStart:           'Week starting',
  eventType:           'Event type',
  saleTotal:           'Sale total',
  accountAction:       'Account action',
  agencyAction:        'Agency action',
};
function editReqFieldLabel(key) {
  if (EDIT_REQ_FIELD_LABELS[key]) return EDIT_REQ_FIELD_LABELS[key];
  // Generic fallback: snake_case / camelCase → Title Case
  const spaced = String(key).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
function editReqResolveContext(req, state) {
  if (!state || !req?.tableName) return null;
  const stateKey = EDIT_REQ_STATE_KEY[req.tableName];
  if (!stateKey) return null;
  const row = (state[stateKey] || []).find(r => r.id === req.rowId);
  if (!row) return null;
  // For the clients table the row IS the client (its own id is the client id);
  // child tables (metrics / check-ins / events / surveys) point at the client
  // via clientId. Without this, a cancel-reason edit request on `clients`
  // resolved row.clientId (undefined) and showed no client name.
  const client = req.tableName === 'clients'
    ? row
    : (state.clients || []).find(c => c.id === row.clientId);
  let period = '';
  if (row.month)            period = CABT_fmtMonth(row.month);
  else if (row.weekStart)   period = `Week of ${CABT_fmtDate(row.weekStart)}`;
  else if (row.date)        period = CABT_fmtDate(row.date);
  return { clientName: client?.name || null, period };
}

function EditReqCard({ req, theme, state, onApprove, onReject, busy }) {
  const isPending = req.status === 'pending';
  const tone = req.status === 'approved' ? 'green' : req.status === 'rejected' ? 'red' : 'yellow';
  // Bobby 2026-05-12: CAs now submit deletion requests via this same
  // queue with field_changes carrying _action='delete'. The trigger
  // detects the sentinel and DELETEs the row instead of UPDATE-ing it
  // on approve; flag the card here so the admin sees what they're
  // approving (deletion vs edit) before they click.
  const isDeleteRequest = (req.fieldChanges || {})._action === 'delete';
  const fields = Object.keys(req.fieldChanges || {}).filter(k => !k.startsWith('_'));

  const tableLabel = EDIT_REQ_TABLE_LABELS[req.tableName] || req.tableName;
  const context = editReqResolveContext(req, state);
  const requesterName = req.requester?.displayName
    || req.requester?.email
    || req.requestedByName
    || 'Unknown';
  const dateLabel = CABT_fmtDate(req.requestedAt || req.createdAt || CABT_todayIso());

  // Red / green for the diff arrows. STATUS comes from ui.jsx.
  const RED   = (typeof STATUS !== 'undefined' && STATUS.red)   || '#C62828';
  const GREEN = (typeof STATUS !== 'undefined' && STATUS.green) || '#2E7D32';
  const ACCENT    = theme.accent    || '#D7FF3D';
  const ACCENT_INK = theme.accentInk || '#0B0E14';

  return (
    <Card theme={theme} padding={16}>
      {/* Header: tableLabel + clientName + status pill */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: theme.ink,
            letterSpacing: -0.15, lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {isDeleteRequest && (
              <span style={{
                display: 'inline-block', verticalAlign: 'middle',
                background: RED + '22', color: RED,
                border: `1px solid ${RED}55`,
                fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
                padding: '2px 6px', borderRadius: 6, marginRight: 8,
              }}>Delete</span>
            )}
            {tableLabel}
            {context?.clientName && (
              <>
                <span style={{ color: theme.inkMuted, fontWeight: 500, margin: '0 6px' }}>·</span>
                <span style={{ color: theme.ink }}>{context.clientName}</span>
              </>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.inkMuted, lineHeight: 1.5, marginTop: 3 }}>
            {context?.period && <><span style={{ color: theme.inkSoft, fontWeight: 600 }}>{context.period}</span> · </>}
            Requested by <span style={{ color: theme.inkSoft, fontWeight: 600 }}>{requesterName}</span>
            <span> · {dateLabel}</span>
          </div>
        </div>
        <Pill tone={tone} theme={theme}>{req.status}</Pill>
      </div>

      {/* Small row id, low-emphasis for traceability */}
      <div style={{
        fontSize: 10, color: theme.inkMuted, fontFamily: theme.mono || 'monospace',
        marginTop: 4, marginBottom: 12, opacity: 0.55, letterSpacing: 0.3,
      }}>
        {req.rowId}
      </div>

      {/* Delete-request callout — no diff to show, just a clear warning. */}
      {isDeleteRequest && (
        <div style={{
          background: RED + '12',
          border: `1px solid ${RED}33`,
          color: theme.ink,
          borderRadius: 10, padding: '10px 14px',
          marginBottom: 14,
          fontSize: 13, lineHeight: 1.45,
        }}>
          <div style={{ fontWeight: 700, color: RED, marginBottom: 2 }}>
            Approve will delete this row permanently.
          </div>
          <div style={{ color: theme.inkSoft }}>
            The {tableLabel.toLowerCase()} entry will be removed. The audit log keeps a record of who requested + who approved.
          </div>
        </div>
      )}

      {/* Diff panel — labeled rows with line-through old / bold new */}
      {!isDeleteRequest && fields.length > 0 && (
      <div style={{
        background: theme.bgSoft || 'rgba(255,255,255,0.04)',
        border: `1px solid ${theme.rule}`,
        borderRadius: 10, padding: '4px 12px',
        marginBottom: 14,
      }}>
        {fields.map((f, i) => {
          const change = req.fieldChanges[f] || {};
          // Accept both {old, new} (live trigger) and {from, to} (legacy seed).
          const before = change.old !== undefined ? change.old : change.from;
          const after  = change.new !== undefined ? change.new : change.to;
          const beforeStr = before == null || before === '' ? '—' : String(before);
          const afterStr  = after  == null || after  === '' ? '—' : String(after);
          return (
            <div key={f} style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(110px, 1.6fr) minmax(56px, 1fr) 18px minmax(56px, 1fr)',
              gap: 10, alignItems: 'baseline',
              fontSize: 12, padding: '8px 0',
              borderTop: i === 0 ? 'none' : `1px solid ${theme.rule}`,
            }}>
              <div style={{ color: theme.inkSoft, fontWeight: 500 }}>{editReqFieldLabel(f)}</div>
              <div style={{ color: RED, textDecoration: 'line-through', fontFamily: theme.mono || 'monospace', textAlign: 'right' }}>
                {beforeStr}
              </div>
              <div style={{ color: theme.inkMuted, textAlign: 'center' }}>→</div>
              <div style={{ color: GREEN, fontFamily: theme.mono || 'monospace', fontWeight: 700, textAlign: 'right' }}>
                {afterStr}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {req.reason && (
        <div style={{
          fontSize: 13, color: theme.inkSoft, lineHeight: 1.5,
          background: theme.bgElev || 'rgba(255,255,255,0.03)',
          borderLeft: `3px solid ${theme.accent || theme.rule}`,
          padding: '10px 14px',
          marginBottom: 14, borderRadius: '0 8px 8px 0',
          fontStyle: 'italic',
        }}>"{req.reason}"</div>
      )}

      {isPending && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            style={{
              flex: 1, minHeight: 44,
              padding: '11px 18px',
              background: busy ? theme.rule : ACCENT,
              color: busy ? theme.inkMuted : ACCENT_INK,
              border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              cursor: busy ? 'not-allowed' : 'pointer',
              letterSpacing: 0.2,
              boxShadow: busy ? 'none' : `0 1px 0 ${theme.rule}, 0 2px 8px rgba(0,0,0,0.08)`,
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            }}
          >
            {busy ? 'Working…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            style={{
              flex: 1, minHeight: 44,
              padding: '11px 18px',
              background: 'transparent',
              color: busy ? theme.inkMuted : RED,
              border: `1px solid ${busy ? theme.rule : RED + '55'}`,
              borderRadius: 10,
              fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              cursor: busy ? 'not-allowed' : 'pointer',
              letterSpacing: 0.2,
              transition: 'background 0.1s ease',
            }}
          >
            Reject
          </button>
        </div>
      )}
    </Card>
  );
}

// Seed data for local mode — so the screen is reachable in demo
function SEED_EDIT_REQUESTS(state) {
  if (state._live) return [];
  return [
    {
      id: 'ER-001', tableName: 'monthly_metrics', rowId: 'MM-2026-01-CL-003',
      requestedBy: 'CA-02', requestedByName: 'Mike Chen',
      createdAt: '2026-04-08',
      fieldChanges: {
        client_mrr:  { from: 4500, to: 4750 },
        ad_spend:    { from: 380,  to: 420  },
      },
      reason: 'Stripe invoice was paid late, originally logged at draft amount. Corrected against the actual deposit.',
      status: 'pending',
    },
    {
      id: 'ER-002', tableName: 'surveys', rowId: 'SV-018',
      requestedBy: 'CA-01', requestedByName: 'Sarah Greenfield',
      createdAt: '2026-04-05',
      fieldChanges: { score: { from: 6, to: 8 } },
      reason: 'Client originally rated 6, called back to clarify they meant 8. Voicemail saved.',
      status: 'pending',
    },
    {
      id: 'ER-003', tableName: 'growth_events', rowId: 'GE-024',
      requestedBy: 'CA-03', requestedByName: 'Devon Marsh',
      createdAt: '2026-03-28',
      fieldChanges: { date: { from: '2026-03-15', to: '2026-03-22' } },
      reason: 'Wrong date entered.', status: 'approved', decidedAt: '2026-03-29',
    },
  ];
}

// ── Reviews Inbox ───────────────────────────────────────────────────────
function AdminReviewsInbox({ state, theme }) {
  // Read from state directly; realtime keeps it fresh.
  const reviews = state.reviews || SEED_REVIEWS(state);
  const [filter, setFilter] = React.useState('unmatched');

  const counts = {
    unmatched: reviews.filter(r => !r.clientId).length,
    matched:   reviews.filter(r => r.clientId).length,
    flagged:   reviews.filter(r => r.flagged).length,
  };
  const list = reviews.filter(r => {
    if (filter === 'unmatched') return !r.clientId;
    if (filter === 'matched')   return r.clientId;
    if (filter === 'flagged')   return r.flagged;
    return true;
  });

  const assign = async (reviewId, clientId) => {
    if (CABT_getApiMode() === 'supabase') {
      try {
        const sb = await CABT_sb();
        await sb.from('reviews').update({ client_id: clientId, link_method: 'manual' }).eq('id', reviewId);
      } catch (e) { console.error(e); }
    }
    // Realtime updates state.reviews on the UPDATE; no local setState needed.
  };

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="star" theme={theme}>
        Google, Facebook, Yelp, and Trustpilot reviews are polled every 6 hours. Anything that didn't auto-match a client lands here.
      </Banner>

      <SegBar theme={theme} value={filter} onChange={setFilter} options={[
        { value: 'unmatched', label: `Unmatched${counts.unmatched ? ` · ${counts.unmatched}` : ''}` },
        { value: 'matched',   label: 'Matched' },
        { value: 'flagged',   label: 'Flagged' },
      ]}/>

      {list.length === 0 && (
        <Card theme={theme}>
          <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24, margin: '0 auto 12px',
              background: theme.rule, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="check" size={22}/></div>
            {filter === 'unmatched' ? 'All reviews are matched.' : 'Nothing here.'}
          </div>
        </Card>
      )}

      {list.map(r => (
        <ReviewCard key={r.id} review={r} state={state} theme={theme}
          onAssign={(cid) => assign(r.id, cid)}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review, state, theme, onAssign }) {
  const [picking, setPicking] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const sourceLogo = ({
    google:     { label: 'Google',     color: '#4285F4' },
    facebook:   { label: 'Facebook',   color: '#1877F2' },
    yelp:       { label: 'Yelp',       color: '#D32323' },
    trustpilot: { label: 'Trustpilot', color: '#00B67A' },
  })[review.source] || { label: review.source, color: theme.accent };
  const matchedClient = review.clientId && state.clients.find(c => c.id === review.clientId);

  const candidates = state.clients.filter(c =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase()) || c.id.toLowerCase().includes(filter.toLowerCase())
  ).slice(0, 6);

  return (
    <Card theme={theme} padding={14}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 4, background: sourceLogo.color, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
          }}>{sourceLogo.label[0]}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.ink }}>{review.sourceBusinessName}</div>
        </div>
        <Stars n={review.rating} theme={theme}/>
      </div>
      <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 10 }}>
        {review.reviewerName || 'Anonymous'} · {CABT_fmtDate(review.reviewedAt)}
      </div>
      {review.body && (
        <div style={{
          fontSize: 13, color: theme.inkSoft, fontFamily: theme.serif, fontStyle: 'italic',
          lineHeight: 1.5, marginBottom: 12,
        }}>"{review.body}"</div>
      )}

      {matchedClient ? (
        <div style={{
          fontSize: 12, color: theme.inkSoft, padding: '8px 10px',
          background: theme.bg, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="check" size={12} color={STATUS.green}/>
          Matched to <strong>{matchedClient.name}</strong>
          <span style={{ flex: 1 }}/>
          <button onClick={() => onAssign(null)} style={{
            background: 'transparent', border: 'none', color: theme.inkMuted, fontSize: 11,
            cursor: 'pointer', textDecoration: 'underline',
          }}>Change</button>
        </div>
      ) : !picking ? (
        <Button theme={theme} variant="primary" size="sm" fullWidth onClick={() => setPicking(true)}>
          Assign to client
        </Button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Input value={filter} onChange={setFilter} placeholder="Search clients…" autoFocus theme={theme}/>
          {candidates.map(c => (
            <button key={c.id} onClick={() => { onAssign(c.id); setPicking(false); }} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: theme.bg, border: `1px solid ${theme.rule}`,
              borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, color: theme.ink, textAlign: 'left',
            }}>
              <span>{c.name}</span>
              <span style={{ fontSize: 11, color: theme.inkMuted, fontFamily: theme.mono }}>{c.id}</span>
            </button>
          ))}
          <button onClick={() => setPicking(false)} style={{
            background: 'transparent', border: 'none', color: theme.inkMuted, fontSize: 11,
            cursor: 'pointer', padding: 4,
          }}>Cancel</button>
        </div>
      )}
    </Card>
  );
}

function Stars({ n, theme }) {
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{
          color: i <= Math.round(n) ? '#F4C430' : theme.rule, fontSize: 13,
        }}>★</span>
      ))}
      <span style={{ fontSize: 11, color: theme.inkMuted, marginLeft: 4 }}>{n.toFixed(1)}</span>
    </div>
  );
}

function SegBar({ value, onChange, options, theme }) {
  return (
    <div style={{
      display: 'flex', background: theme.rule + '60', borderRadius: 999, padding: 2, gap: 0,
    }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 999,
          background: value === o.value ? theme.surface : 'transparent',
          color: value === o.value ? theme.ink : theme.inkMuted,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: value === o.value ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function SEED_REVIEWS(state) {
  if (state._live) return [];
  const today = new Date();
  const dt = (offset) => { const d = new Date(today); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };
  return [
    { id: 'RV-001', source: 'google', sourceReviewId: 'g_aH7x', sourceBusinessName: 'Iron Lake Tactical',
      rating: 5, body: 'Brought my whole family for the carry course. Patient instructors, well-run range. Will be back.',
      reviewerName: 'M. Clark', reviewedAt: dt(2), clientId: null, flagged: false },
    { id: 'RV-002', source: 'facebook', sourceReviewId: 'fb_4421', sourceBusinessName: 'Greenline Defense',
      rating: 4, body: 'Solid intro class. Wish there was more time on draw work but overall good.',
      reviewerName: 'Jamie Rosen', reviewedAt: dt(4), clientId: null, flagged: false },
    { id: 'RV-003', source: 'yelp', sourceReviewId: 'y_8821', sourceBusinessName: 'Cottonwood Range',
      rating: 5, body: 'Booked the private bay for a birthday — instructor stayed late to help my dad get comfortable.',
      reviewerName: 'A. Patel', reviewedAt: dt(7),
      clientId: state.clients[1]?.id || null, flagged: false },
    { id: 'RV-004', source: 'google', sourceReviewId: 'g_kj99', sourceBusinessName: 'Range 22 (closed account)',
      rating: 2, body: 'Membership rates went up without notice. Disappointed.',
      reviewerName: 'Anonymous', reviewedAt: dt(11), clientId: null, flagged: true },
  ];
}

// EditReqCard exported so AdminApprovals can render pending edit requests
// inline on the main Approvals page (Bobby 2026-05-11: "approvals are not
// showing up in my section" — Edit Requests were hidden under More, fixed
// by surfacing them on the Approvals view too).
Object.assign(window, { AdminEditApprovals, AdminReviewsInbox, EditReqCard });
