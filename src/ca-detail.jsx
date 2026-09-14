// ca-detail.jsx — Client Detail screen with Overview/Metrics/Events/Surveys tabs

// Per-account free-form notes (Kurt 2026-06-26: "a notes section on each
// account to store birthdays and stuff — shouldn't count toward any scores
// or metrics"). Saved to the client's notes field; the scoring engine never
// reads it, so it's display-only. Editable by CAs and admins.
function ClientNotesCard({ theme, client, onUpdateClient }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(client.notes || '');
  const [saving, setSaving] = React.useState(false);
  // Re-sync if the client changes or a realtime update lands.
  React.useEffect(() => { setDraft(client.notes || ''); setEditing(false); }, [client.id, client.notes]);

  const cancel = () => { setDraft(client.notes || ''); setEditing(false); };
  const save = async () => {
    if (saving || typeof onUpdateClient !== 'function') return;
    setSaving(true);
    try { await onUpdateClient(client.id, { notes: draft.trim() }, 'Notes'); setEditing(false); }
    finally { setSaving(false); }
  };
  const btn = (primary) => ({
    padding: '7px 14px', fontSize: 12, fontWeight: primary ? 700 : 600,
    borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    background: primary ? theme.ink : theme.surface,
    color: primary ? (theme.accentInk || '#fff') : theme.ink,
    border: `1px solid ${primary ? theme.ink : theme.rule}`,
  });

  return (
    <Card theme={theme}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <SectionLabel theme={theme}>Notes</SectionLabel>
        {!editing && (
          <button onClick={() => { setDraft(client.notes || ''); setEditing(true); }} style={btn(false)}>
            {client.notes ? 'Edit' : 'Add note'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: theme.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
        Free-form notes — birthdays, preferences, reminders. Not counted in any score or metric.
      </div>
      {editing ? (
        <>
          <textarea
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder="e.g. Owner's birthday March 12 · prefers email over calls"
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              padding: '10px 12px', fontSize: 14, lineHeight: 1.5,
              fontFamily: 'inherit', color: theme.ink,
              background: theme.bg, border: `1px solid ${theme.rule}`, borderRadius: 10,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={save} disabled={saving} style={btn(true)}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={cancel} disabled={saving} style={btn(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, color: client.notes ? theme.ink : theme.inkMuted }}>
          {client.notes || 'No notes yet.'}
        </div>
      )}
    </Card>
  );
}

// Per-account meeting time (Kurt 2026-07-28: "add the note for the meeting time
// as a custom field"). A short free-text field for the weekly call slot, e.g.
// "Tuesday 11:30 AM". Display-only for scoring; saved to the client's
// meeting_time field via the same path as Notes.
function ClientMeetingTimeCard({ theme, client, onUpdateClient }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(client.meetingTime || '');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { setDraft(client.meetingTime || ''); setEditing(false); }, [client.id, client.meetingTime]);

  const cancel = () => { setDraft(client.meetingTime || ''); setEditing(false); };
  const save = async () => {
    if (saving || typeof onUpdateClient !== 'function') return;
    setSaving(true);
    try { await onUpdateClient(client.id, { meetingTime: draft.trim() }, 'Meeting time'); setEditing(false); }
    finally { setSaving(false); }
  };
  const btn = (primary) => ({
    padding: '7px 14px', fontSize: 12, fontWeight: primary ? 700 : 600,
    borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    background: primary ? theme.ink : theme.surface,
    color: primary ? (theme.accentInk || '#fff') : theme.ink,
    border: `1px solid ${primary ? theme.ink : theme.rule}`,
  });

  return (
    <Card theme={theme}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <SectionLabel theme={theme}>Meeting time</SectionLabel>
        {!editing && (
          <button onClick={() => { setDraft(client.meetingTime || ''); setEditing(true); }} style={btn(false)}>
            {client.meetingTime ? 'Edit' : 'Set time'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: theme.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
        Weekly call slot for this account — e.g. "Tuesday 11:30 AM". Not counted in any score.
      </div>
      {editing ? (
        <>
          <input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            placeholder="e.g. Tuesday 11:30 AM"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', fontSize: 14, lineHeight: 1.5,
              fontFamily: 'inherit', color: theme.ink,
              background: theme.bg, border: `1px solid ${theme.rule}`, borderRadius: 10,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={save} disabled={saving} style={btn(true)}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={cancel} disabled={saving} style={btn(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 15, fontWeight: 600, color: client.meetingTime ? theme.ink : theme.inkMuted }}>
          {client.meetingTime || 'No meeting time set.'}
        </div>
      )}
    </Card>
  );
}

// CA-facing cancel-reason picker (Bobby 2026-07-27: "make it so [the CA] puts
// the cancel reason and [the owner] approves"). Submits the chosen reason as an
// edit request — it doesn't apply until an admin approves it in the queue.
function CACancelReasonPicker({ theme, client, cancelReasons, onSubmit }) {
  const [reason, setReason] = React.useState(client.cancelReason || '');
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);
  React.useEffect(() => { setReason(client.cancelReason || ''); setDone(false); }, [client.id, client.cancelReason]);
  const unchanged = !reason || reason === (client.cancelReason || '');
  const submit = async () => {
    if (submitting || unchanged) return;
    setSubmitting(true);
    try { await onSubmit(client, reason); setDone(true); }
    finally { setSubmitting(false); }
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
        Set cancel reason
      </div>
      <Select
        value={reason}
        onChange={(v) => { setReason(v); setDone(false); }}
        options={[{ value: '', label: '— pick a reason —' }, ...cancelReasons.map(r => ({ value: r.code, label: r.label }))]}
        theme={theme}
      />
      <button onClick={submit} disabled={submitting || unchanged} style={{
        marginTop: 10, width: '100%', padding: '11px 16px', borderRadius: 10, border: 'none',
        background: unchanged ? theme.rule : theme.ink,
        color: unchanged ? theme.inkMuted : (theme.accentInk || '#fff'),
        fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
        cursor: (submitting || unchanged) ? 'not-allowed' : 'pointer',
      }}>
        {submitting ? 'Submitting…' : done ? 'Submitted for approval ✓' : 'Submit for approval'}
      </button>
      <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 6, lineHeight: 1.4 }}>
        Your reason is sent to an admin to approve before it's applied.
      </div>
    </div>
  );
}

function ClientDetail({ state, ca, theme, clientId, navigate, isAdmin, onCancelAccount, onUpdateClient, onRequestCancelReason }) {
  const [tab, setTab] = React.useState('overview');
  // Bobby 2026-05-05: history view consolidates every log type for a client
  // and groups them by month or week. Toggle persists per-session per-client.
  const [historyGroup, setHistoryGroup] = React.useState('month'); // 'month' | 'week'
  const [showCancelModal, setShowCancelModal] = React.useState(false);
  const client = state.clients.find(c => c.id === clientId);
  if (!client) return <div style={{ padding: 24 }}>Client not found.</div>;

  const sub = CABT_clientSubScores(client, state.monthlyMetrics, state.surveys, state.config);
  const status = CABT_scoreToStatus(sub.composite);
  const tenureMonths = Math.max(1, Math.round(
    (new Date() - new Date(client.signDate)) / (1000 * 60 * 60 * 24 * 30)
  ));
  // Metrics — show monthly AND weekly entries for this client, newest first.
  // Weekly entries are sorted by weekStart; monthly by month. Both are tappable
  // for editing via LogMetricsForm (which auto-detects kind from the row id).
  const cMonthlyMetrics = (state.monthlyMetrics || [])
    .filter(m => m.clientId === client.id)
    .map(m => ({ ...m, _kind: 'monthly', _periodKey: m.month }));
  const cWeeklyMetrics = (state.weeklyMetrics || [])
    .filter(w => w.clientId === client.id)
    .map(w => ({ ...w, _kind: 'weekly', _periodKey: w.weekStart }));

  // TKT-12.1 — flag rows that already have a pending edit_request so the
  // card can show an "Edit pending" pill (and tapping warns the user).
  const pendingEdits = (state.editRequests || []).filter(r => r.status === 'pending');
  const hasPendingEdit = (table, rowId) =>
    pendingEdits.some(r => r.tableName === table && String(r.rowId) === String(rowId));
  const cMetrics = [...cMonthlyMetrics, ...cWeeklyMetrics]
    .sort((a, b) => (b._periodKey || '').localeCompare(a._periodKey || ''));
  const cEvents = state.growthEvents.filter(e => e.clientId === client.id).sort((a,b) => b.date.localeCompare(a.date));
  const cSurveys = state.surveys.filter(s => s.clientId === client.id).sort((a,b) => b.date.localeCompare(a.date));
  const cWeekly  = (state.weeklyCheckins  || []).filter(w => w.clientId === client.id);
  const cMonthly = (state.monthlyCheckins || []).filter(m => m.clientId === client.id);
  const cTimeline = [
    ...cWeekly.map(w => ({ kind: 'weekly',  date: w.weekStart, item: w })),
    ...cMonthly.map(m => ({ kind: 'monthly', date: m.month,    item: m })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const lastMetric = cMonthlyMetrics.sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0];
  const cadence = client.loggingCadence || 'monthly';

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Hero */}
      <div style={{ padding: '4px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>
              Client · {client.id}
            </div>
            <div style={{ fontFamily: theme.serif, fontSize: 26, fontWeight: 600, color: theme.ink, letterSpacing: -0.4, lineHeight: 1.15, marginTop: 2 }}>
              {client.name}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <StatusPill status={status} />
              <span style={{ fontSize: 12, color: theme.inkMuted }}>{tenureMonths}mo tenure</span>
              <span style={{ fontSize: 12, color: theme.inkMuted }}>· {CABT_fmtMoney(client.monthlyRetainer)}/mo</span>
            </div>
          </div>
          <ScoreRing
            value={sub.composite}
            size={64} stroke={5}
            color={STATUS[status]}
            bg={theme.rule}
            label={
              <div style={{ fontSize: 16, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>
                {sub.composite != null ? (sub.composite*100).toFixed(0) : '—'}
              </div>
            }
          />
        </div>
      </div>
      <Tabs
        tabs={[
          { value: 'overview',  label: 'Overview' },
          { value: 'dashboard', label: 'Dashboard' },
          { value: 'charts',    label: 'Charts' },
          { value: 'history',   label: 'History' },
          { value: 'timeline',  label: `Timeline · ${cTimeline.length}` },
          { value: 'metrics',   label: `Metrics · ${cMetrics.length}` },
          { value: 'events',    label: `Events · ${cEvents.length}` },
          { value: 'surveys',   label: `Surveys · ${cSurveys.length}` },
        ]}
        value={tab} onChange={setTab} theme={theme}
      />

      {tab === 'overview' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={theme}>
            <SectionLabel theme={theme}>Sub-scores</SectionLabel>
            {/* 5 Performance sub-scores per Formula Guide. Aggregated over the
                quarter (3 months together) — not last-month-only. Empty data
                renders as '—' (gray) instead of showing legacy synthetic
                baselines (the "Growth 60 / Satisfaction 70 with no data" bug
                Bobby flagged 2026-05-04). */}
            {[
              ['mrrGrowth', 'MRR Growth'],
              ['leadCost',  'Lead Cost'],
              ['adSpend',   'Ad Spend'],
              ['funnel',    'Funnel'],
              ['attrition', 'Attrition'],
            ].map(([k, label]) => {
              const v = sub[k];
              const s = CABT_scoreToStatus(v);
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.rule}`, gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: STATUS[s], flexShrink: 0 }}/>
                  <span style={{ flex: 1, fontSize: 14, color: theme.ink }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {v != null ? (v*100).toFixed(0) : '—'}
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 8, lineHeight: 1.4 }}>
              "—" means no data yet for that metric this quarter. Empty data is skipped, not penalized.
            </div>
          </Card>

          {sub.satisfaction != null && (
            <Card theme={theme}>
              <SectionLabel theme={theme}>Satisfaction (display only)</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: STATUS[CABT_scoreToStatus(sub.satisfaction)], flexShrink: 0 }}/>
                <span style={{ flex: 1, fontSize: 14, color: theme.ink }}>From {state.surveys.filter(s => s.clientId === client.id).length} survey(s)</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {(sub.satisfaction*100).toFixed(0)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: theme.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
                Satisfaction is a separate display metric per the Formula Guide — not part of the 5 Performance sub-scores above.
              </div>
            </Card>
          )}
          <Card theme={theme}>
            <SectionLabel theme={theme}>Contract</SectionLabel>
            <KV theme={theme} label="Sign date"  value={CABT_fmtDate(client.signDate)} />
            <KV theme={theme} label="Term"       value={`${client.termMonths} months`} />
            <KV theme={theme} label="Retainer"   value={`${CABT_fmtMoney(client.monthlyRetainer)}/mo`} />
            <KV theme={theme} label="Membership" value={client.hasMembershipAddon ? 'Yes' : '—'} />
            <KV theme={theme} label="AE"         value={state.sales.find(s => s.id === client.ae)?.name || '—'} last />
          </Card>

          {/* Account Status — cancel_date + cancel_reason. Admins can set or
              edit; everyone can see the current status. Bobby 2026-05-15. */}
          <Card theme={theme}>
            <SectionLabel theme={theme}>Account Status</SectionLabel>
            {client.cancelDate ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                    fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    background: 'rgba(198, 40, 40, 0.12)',
                    color: '#C62828',
                    border: '1px solid rgba(198, 40, 40, 0.3)',
                  }}>Cancelled</span>
                </div>
                <KV theme={theme} label="Cancel date" value={CABT_fmtDate(client.cancelDate)} />
                <KV theme={theme} label="Reason" value={
                  (state.cancelReasons || []).find(r => r.code === client.cancelReason)?.label
                  || client.cancelReason || '—'
                } last />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    style={{
                      marginTop: 14, width: '100%', padding: '11px 16px',
                      borderRadius: 10, border: `1.5px solid ${theme.rule}`,
                      background: 'transparent', color: theme.ink,
                      fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >Edit Cancellation</button>
                )}
                {!isAdmin && onRequestCancelReason && (
                  <CACancelReasonPicker theme={theme} client={client} cancelReasons={state.cancelReasons || []} onSubmit={onRequestCancelReason} />
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                    fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    background: 'rgba(67, 160, 71, 0.12)',
                    color: '#2E7D32',
                    border: '1px solid rgba(67, 160, 71, 0.3)',
                  }}>Active</span>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    style={{
                      width: '100%', padding: '11px 16px',
                      borderRadius: 10, border: '1.5px solid rgba(198, 40, 40, 0.4)',
                      background: 'rgba(198, 40, 40, 0.06)', color: '#C62828',
                      fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >Mark as Cancelled</button>
                )}
              </div>
            )}
          </Card>

          <ClientMeetingTimeCard theme={theme} client={client} onUpdateClient={onUpdateClient} />
          <ClientNotesCard theme={theme} client={client} onUpdateClient={onUpdateClient} />
        </div>
      )}

      {showCancelModal && (
        <CancelAccountModal
          client={client}
          theme={theme}
          cancelReasons={state.cancelReasons || []}
          onSave={async (cid, date, reason) => {
            if (onCancelAccount) await onCancelAccount(cid, date, reason);
            setShowCancelModal(false);
          }}
          onClose={() => setShowCancelModal(false)}
        />
      )}

      {tab === 'dashboard' && (
        <ClientDashboardTab
          state={state}
          theme={theme}
          client={client}
          cMonthlyMetrics={cMonthlyMetrics}
          cWeeklyMetrics={cWeeklyMetrics}
          cEvents={cEvents}
          cSurveys={cSurveys}
          cWeekly={cWeekly}
          cMonthly={cMonthly}
          navigate={navigate}
        />
      )}

      {tab === 'charts' && (
        <ClientChartsTab state={state} theme={theme} client={client} />
      )}

      {tab === 'history' && (() => {
        // Aggregate every log type for this client into one stream, then group
        // by month or week. Each item carries kind + date + display payload.
        // Bobby 2026-05-05 ("yung week data at month maiiba ah"): month view
        // hides weekly entries; week view hides monthly entries — so the
        // numbers you see in each view actually correspond to that period.
        const allItems = [
          ...cMonthlyMetrics.map(m => ({ id: m.id, kind: 'monthly-metrics', date: m.month,     sortDate: m.month,     payload: m })),
          ...cWeeklyMetrics .map(w => ({ id: w.id, kind: 'weekly-metrics',  date: w.weekStart, sortDate: w.weekStart, payload: w })),
          ...cEvents        .map(e => ({ id: e.id, kind: 'event',           date: e.date,      sortDate: e.date,      payload: e })),
          ...cSurveys       .map(s => ({ id: s.id, kind: 'survey',          date: s.date,      sortDate: s.date,      payload: s })),
          ...cWeekly        .map(w => ({ id: w.id, kind: 'weekly-checkin',  date: w.weekStart, sortDate: w.weekStart, payload: w })),
          ...cMonthly       .map(m => ({ id: m.id, kind: 'monthly-checkin', date: m.month,     sortDate: m.month,     payload: m })),
        ];
        // Period-bound items only show in their matching grouping mode.
        // Events + surveys are date-based (not period-bound) so they appear
        // in both views, bucketed by whichever grouping is active.
        const items = allItems.filter(it => {
          if (historyGroup === 'week') {
            return it.kind !== 'monthly-metrics' && it.kind !== 'monthly-checkin';
          }
          return it.kind !== 'weekly-metrics' && it.kind !== 'weekly-checkin';
        });

        // Group key — first-of-month or ISO Monday of week
        const isoMondayOf = (iso) => {
          if (!iso) return '—';
          const d = new Date(iso + 'T12:00:00');
          const day = d.getDay() || 7;
          if (day !== 1) d.setDate(d.getDate() - (day - 1));
          return d.toISOString().slice(0, 10);
        };
        const groupKey = (it) =>
          historyGroup === 'week' ? isoMondayOf(it.date) : (it.date ? it.date.slice(0, 7) + '-01' : '—');

        const groupsMap = new Map();
        items.forEach(it => {
          const k = groupKey(it);
          if (!groupsMap.has(k)) groupsMap.set(k, []);
          groupsMap.get(k).push(it);
        });
        const groups = Array.from(groupsMap.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([key, list]) => ({
            key,
            label: historyGroup === 'week'
              ? `Week of ${CABT_fmtDate(key)}`
              : CABT_fmtMonth(key),
            items: [...list].sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || '')),
          }));

        const KIND_META = {
          'monthly-metrics': { label: 'Monthly metrics', accent: '#43A047', route: 'log-metrics' },
          'weekly-metrics':  { label: 'Weekly metrics',  accent: '#43A047', route: 'log-metrics' },
          'event':           { label: 'Growth event',    accent: '#7C4DFF', route: 'log-event' },
          'survey':          { label: 'Survey',          accent: '#FFB300', route: 'log-survey' },
          'weekly-checkin':  { label: 'Weekly check-in', accent: '#039BE5', route: null },
          'monthly-checkin': { label: 'Monthly check-in', accent: '#039BE5', route: null },
        };

        const renderItem = (it) => {
          const meta = KIND_META[it.kind] || { label: it.kind, accent: theme.inkMuted };
          const p = it.payload;
          const isMetric = it.kind === 'monthly-metrics' || it.kind === 'weekly-metrics';
          const isCheckin = it.kind === 'weekly-checkin' || it.kind === 'monthly-checkin';
          const dateLabel = it.kind === 'weekly-metrics' || it.kind === 'weekly-checkin'
            ? `Week of ${CABT_fmtDate(it.date)}`
            : (it.kind === 'monthly-metrics' || it.kind === 'monthly-checkin'
                ? CABT_fmtMonth(it.date)
                : CABT_fmtDate(it.date));
          const editable = !!meta.route;
          return (
            <div key={it.id} style={{
              padding: '12px 14px', borderTop: `1px solid ${theme.rule}`,
              cursor: editable ? 'pointer' : 'default',
            }}
              onClick={editable ? () => navigate(meta.route, { clientId, editingId: it.id }) : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: meta.accent, flexShrink: 0 }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>{meta.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{dateLabel}</span>
              </div>
              {isMetric && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 11 }}>
                  <Stat theme={theme} k="MRR"      v={CABT_fmtMoney(p.clientMRR)} />
                  <Stat theme={theme} k="Ad spend" v={CABT_fmtMoney(p.adSpend)} />
                  <Stat theme={theme} k="Leads"    v={p.leadsGenerated || 0} />
                  <Stat theme={theme} k="Booked"   v={p.apptsBooked || 0} />
                  <Stat theme={theme} k="Showed"   v={p.leadsShowed || 0} />
                  <Stat theme={theme} k="Signed"   v={p.leadsSigned || 0} />
                  <Stat theme={theme} k="Cancel"   v={p.studentsCancelled || 0} />
                  <Stat theme={theme} k="Lead $"   v={CABT_fmtMoney(p.leadCost)} />
                </div>
              )}
              {it.kind === 'event' && (
                <div style={{ fontSize: 13, color: theme.ink }}>
                  <strong>{p.eventType}</strong>
                  {p.notes && <span style={{ color: theme.inkSoft }}> · {p.notes}</span>}
                  {p.saleTotal > 0 && <span style={{ color: theme.inkMuted }}> · Sale {CABT_fmtMoney(p.saleTotal)}</span>}
                </div>
              )}
              {it.kind === 'survey' && (() => {
                const avg = (p.overall + p.responsiveness + p.followThrough + p.communication) / 4;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1,2,3,4,5].map(n => (
                        <Icon key={n} name={n <= Math.round(avg) ? 'star-fill' : 'star'} size={12} color={theme.gold || '#FFB300'} />
                      ))}
                    </div>
                    {p.comment && <div style={{ flex: 1, fontFamily: theme.serif, fontSize: 13, fontStyle: 'italic', color: theme.inkSoft, lineHeight: 1.4 }}>"{p.comment}"</div>}
                  </div>
                );
              })()}
              {isCheckin && (
                <div style={{ fontSize: 12, color: theme.ink, lineHeight: 1.5 }}>
                  {[
                    ['concern',       'Concern'],
                    ['win',           'Win'],
                    ['accountAction', 'Account-side'],
                    ['agencyAction',  'Agency-side'],
                  ].map(([k, label]) => p[k] ? (
                    <div key={k} style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: theme.inkMuted, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginRight: 6 }}>{label}</span>
                      <span style={{ whiteSpace: 'pre-wrap' }}>{p[k]}</span>
                    </div>
                  ) : null)}
                  {!p.concern && !p.win && !p.accountAction && !p.agencyAction && p.notes && (
                    <div style={{ color: theme.inkMuted, fontStyle: 'italic' }}>{p.notes}</div>
                  )}
                </div>
              )}
            </div>
          );
        };

        return (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Group toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: theme.inkMuted, fontWeight: 600 }}>Group by</span>
              {[
                { v: 'month', label: 'Month' },
                { v: 'week',  label: 'Week' },
              ].map(g => (
                <button key={g.v} onClick={() => setHistoryGroup(g.v)} style={{
                  padding: '6px 12px', fontSize: 12, fontWeight: 700,
                  background: historyGroup === g.v ? theme.ink : theme.surface,
                  color: historyGroup === g.v ? (theme.accentInk || '#fff') : theme.ink,
                  border: `1px solid ${historyGroup === g.v ? theme.ink : theme.rule}`,
                  borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                }}>{g.label}</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.inkMuted }}>{items.length} log{items.length === 1 ? '' : 's'} across {groups.length} {historyGroup}{groups.length === 1 ? '' : 's'}</span>
            </div>

            {groups.length === 0 && <EmptyState theme={theme} text="No history yet for this client." />}

            {groups.map(g => (
              <Card theme={theme} key={g.key} padding={0}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: theme.ink, fontFamily: theme.serif, letterSpacing: -0.2 }}>{g.label}</div>
                  <div style={{ fontSize: 11, color: theme.inkMuted }}>{g.items.length} entr{g.items.length === 1 ? 'y' : 'ies'}</div>
                </div>
                {g.items.map(renderItem)}
              </Card>
            ))}
          </div>
        );
      })()}

      {tab === 'timeline' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 12, background: theme.bgSoft || 'rgba(255,255,255,0.04)', border: `1px solid ${theme.rule}` }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: theme.inkMuted, textTransform: 'uppercase' }}>Cadence</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, textTransform: 'capitalize' }}>{cadence}</span>
            </div>
            <Button theme={theme} icon="plus" size="sm" onClick={() => navigate('log-checkin', { clientId })}>Log check-in</Button>
          </div>
          {cTimeline.length === 0 && <EmptyState theme={theme} text="No check-ins logged yet." />}
          {cTimeline.map(t => {
            const it = t.item;
            const periodLabel = t.kind === 'weekly'
              ? `Week of ${CABT_fmtDate(t.date)}`
              : CABT_fmtMonth(t.date);
            return (
              <Card theme={theme} key={it.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, fontFamily: theme.serif, letterSpacing: -0.2 }}>{periodLabel}</div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: theme.bg || '#0B0E14', background: theme.accent || '#D7FF3D', padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.kind}</span>
                </div>
                {[
                  ['concern',       'Concern'],
                  ['win',           'Win'],
                  ['accountAction', 'Account-side action'],
                  ['agencyAction',  'Agency-side action'],
                ].map(([k, label]) => (
                  it[k] ? (
                    <div key={k} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, color: theme.ink, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{it[k]}</div>
                    </div>
                  ) : null
                ))}
                {it.notes && (
                  <div style={{ fontSize: 12, color: theme.inkMuted, lineHeight: 1.4, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${theme.rule}`, whiteSpace: 'pre-wrap' }}>{it.notes}</div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'metrics' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button theme={theme} icon="plus" fullWidth size="md"
                  onClick={() => navigate('log-metrics', { clientId })}>
            {cadence === 'weekly' ? 'Log a week' : 'Log a month'}
          </Button>
          {cMetrics.length === 0 && <EmptyState theme={theme} text="No metrics yet." />}
          {cMetrics.map(m => {
            const isWeekly = m._kind === 'weekly';
            const periodLabel = isWeekly ? `Week of ${CABT_fmtDate(m.weekStart)}` : CABT_fmtMonth(m.month);
            const editPending = hasPendingEdit(isWeekly ? 'weekly_metrics' : 'monthly_metrics', m.id);
            return (
              <Card theme={theme} key={m.id} padding={14}
                    onClick={() => navigate('log-metrics', { clientId, editingId: m.id })}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    aria-label={`Edit ${periodLabel}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, fontFamily: theme.serif, letterSpacing: -0.2 }}>{periodLabel}</div>
                    {isWeekly && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                        padding: '2px 6px', borderRadius: 8,
                        background: theme.bgSoft || 'rgba(255,255,255,0.05)',
                        color: theme.inkMuted, textTransform: 'uppercase',
                      }}>weekly</span>
                    )}
                    {editPending && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                        padding: '2px 6px', borderRadius: 8,
                        background: 'rgba(255, 178, 56, 0.18)',
                        color: '#8C5A00', textTransform: 'uppercase',
                        border: '1px solid rgba(255, 178, 56, 0.4)',
                      }}>edit pending</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.4 }}>
                      Rev <span style={{ color: theme.ink, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtMoney(m.clientGrossRevenue || m.clientMRR)}</span>
                    </div>
                    <Icon name="edit" size={14} color={theme.inkMuted} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
                  <Stat theme={theme} k="Leads" v={m.leadsGenerated} />
                  <Stat theme={theme} k="Booked" v={m.apptsBooked} />
                  <Stat theme={theme} k="Showed" v={m.leadsShowed} />
                  <Stat theme={theme} k="Signed" v={m.leadsSigned} />
                  <Stat theme={theme} k="Ad spend" v={CABT_fmtMoney(m.adSpend)} />
                  <Stat theme={theme} k="Lead $" v={CABT_fmtMoney(m.leadCost)} />
                  <Stat theme={theme} k="Students" v={m.totalStudentsStart} />
                  <Stat theme={theme} k="Cancel" v={m.studentsCancelled} />
                </div>
                <div style={{ fontSize: 10, color: theme.inkMuted, marginTop: 8, textAlign: 'right', letterSpacing: 0.3 }}>
                  Tap to edit
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'events' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button theme={theme} icon="plus" fullWidth size="md"
                  onClick={() => navigate('log-event', { clientId })}>Log an event</Button>
          {cEvents.length === 0 && <EmptyState theme={theme} text="No growth events yet." />}
          {cEvents.map(e => {
            const editPending = hasPendingEdit('growth_events', e.id);
            return (
            <Card theme={theme} key={e.id} padding={14}
                  onClick={() => navigate('log-event', { clientId, editingId: e.id })}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  aria-label={`Edit ${e.eventType}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{e.eventType}</span>
                  {editPending && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                      padding: '2px 6px', borderRadius: 8,
                      background: 'rgba(255, 178, 56, 0.18)',
                      color: '#8C5A00', textTransform: 'uppercase',
                      border: '1px solid rgba(255, 178, 56, 0.4)',
                    }}>edit pending</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtDate(e.date)}</span>
                  <Icon name="edit" size={14} color={theme.inkMuted} />
                </div>
              </div>
              {e.notes && <div style={{ fontSize: 13, color: theme.inkSoft, lineHeight: 1.4 }}>{e.notes}</div>}
              {e.saleTotal > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: theme.inkMuted }}>
                  Sale {CABT_fmtMoney(e.saleTotal)} · Cost {CABT_fmtMoney(e.costToUs)}
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {tab === 'surveys' && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button theme={theme} icon="plus" fullWidth size="md"
                  onClick={() => navigate('log-survey', { clientId })}>Log a survey</Button>
          {cSurveys.length === 0 && <EmptyState theme={theme} text="No surveys yet." />}
          {cSurveys.map(s => {
            const avg = (s.overall + s.responsiveness + s.followThrough + s.communication) / 4;
            const editPending = hasPendingEdit('surveys', s.id);
            return (
              <Card theme={theme} key={s.id} padding={14}
                    onClick={() => navigate('log-survey', { clientId, editingId: s.id })}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    aria-label="Edit survey">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1,2,3,4,5].map(n => (
                        <Icon key={n} name={n <= Math.round(avg) ? 'star-fill' : 'star'} size={14} color={theme.gold} />
                      ))}
                    </div>
                    {editPending && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                        padding: '2px 6px', borderRadius: 8,
                        background: 'rgba(255, 178, 56, 0.18)',
                        color: '#8C5A00', textTransform: 'uppercase',
                        border: '1px solid rgba(255, 178, 56, 0.4)',
                      }}>edit pending</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtDate(s.date)}{s.anonymous && ' · anon'}</span>
                    <Icon name="edit" size={14} color={theme.inkMuted} />
                  </div>
                </div>
                {s.comment && <div style={{ fontFamily: theme.serif, fontSize: 14, fontStyle: 'italic', color: theme.inkSoft, lineHeight: 1.4 }}>"{s.comment}"</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Cancel Account modal — Bobby 2026-05-15 ──────────────────────────────────
// Dedicated form to set/edit cancel_date + cancel_reason on a client without
// going through the monthly metrics log. Admin/owner only (caller's responsibility
// to gate the button). Works for both new cancellations and retroactive updates.
function CancelAccountModal({ client, theme, cancelReasons, onSave, onClose }) {
  const [date,   setDate]   = React.useState(client.cancelDate   || '');
  const [reason, setReason] = React.useState(client.cancelReason || '');
  const [saving, setSaving] = React.useState(false);
  const [err,    setErr]    = React.useState('');

  const isEdit = !!client.cancelDate;
  const canSave = date && reason && !saving;

  const handleSave = async () => {
    if (!date)   { setErr('Please enter a date.'); return; }
    if (!reason) { setErr('Please select a reason.'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave(client.id, date, reason);
    } catch (e) {
      setErr('Save failed. Try again.');
      setSaving(false);
    }
  };

  // Bobby 2026-05-15: "i cannot remove the cancnellation now. i need a way
  // to delete also." Reactivate clears both cancel_date and cancel_reason
  // so the client flips back to Active. Confirmation is in-modal (two-tap)
  // so admins don't accidentally wipe a real cancellation.
  const [confirmingReactivate, setConfirmingReactivate] = React.useState(false);
  const handleReactivate = async () => {
    if (!confirmingReactivate) { setConfirmingReactivate(true); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave(client.id, null, null);
    } catch (e) {
      setErr('Reactivation failed. Try again.');
      setSaving(false);
      setConfirmingReactivate(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(8, 12, 24, 0.55)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
        animation: 'scrimIn 0.18s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400,
          background: theme.bg, color: theme.ink,
          borderRadius: 18,
          padding: '24px 22px 20px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.14)',
          animation: 'modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          fontFamily: theme.sans,
        }}
      >
        <div style={{
          fontFamily: theme.serif || 'inherit',
          fontSize: 20, fontWeight: 600, color: theme.ink,
          letterSpacing: -0.3, lineHeight: 1.25, marginBottom: 4,
        }}>{isEdit ? 'Edit Cancellation' : 'Mark as Cancelled'}</div>
        <div style={{ fontSize: 13, color: theme.inkMuted, marginBottom: 20 }}>
          {client.name}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
            Date of Cancellation
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setErr(''); }}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '11px 14px', borderRadius: 10,
              border: `1.5px solid ${theme.rule}`,
              background: theme.bgElev || theme.bg, color: theme.ink,
              fontFamily: 'inherit', fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
            Reason for Cancellation
          </div>
          <select
            value={reason}
            onChange={(e) => { setReason(e.target.value); setErr(''); }}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '11px 14px', borderRadius: 10,
              border: `1.5px solid ${theme.rule}`,
              background: theme.bgElev || theme.bg, color: theme.ink,
              fontFamily: 'inherit', fontSize: 14,
              outline: 'none', appearance: 'none', WebkitAppearance: 'none',
            }}
          >
            <option value="">Select a reason…</option>
            {(cancelReasons.length > 0
              ? cancelReasons
              : CABT_CANCEL_REASONS_FALLBACK
            ).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
             .map(r => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>

        {err && (
          <div style={{ fontSize: 12, color: '#C62828', marginBottom: 12, lineHeight: 1.4 }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '13px 16px', borderRadius: 12,
              background: 'transparent', color: theme.ink,
              border: `1.5px solid ${theme.rule}`,
              fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600,
              cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 1.2, padding: '13px 16px', borderRadius: 12,
              background: canSave ? '#C62828' : theme.rule,
              color: canSave ? '#FFFFFF' : theme.inkMuted,
              border: 'none',
              fontFamily: 'inherit', fontSize: 14.5, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed',
              boxShadow: canSave ? '0 4px 12px rgba(198,40,40,0.30)' : 'none',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>

        {/* Reactivate — only in edit mode. Two-tap confirmation so admins
            don't accidentally wipe a real cancellation. Bobby 2026-05-15. */}
        {isEdit && (
          <div style={{
            marginTop: 16, paddingTop: 14,
            borderTop: `1px solid ${theme.rule}`,
          }}>
            {confirmingReactivate ? (
              <div>
                <div style={{ fontSize: 12, color: theme.ink, marginBottom: 8, lineHeight: 1.4 }}>
                  Reactivate this account? This clears the cancel date and reason.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setConfirmingReactivate(false)}
                    disabled={saving}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 10,
                      background: 'transparent', color: theme.ink,
                      border: `1.5px solid ${theme.rule}`,
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >Not now</button>
                  <button
                    type="button"
                    onClick={handleReactivate}
                    disabled={saving}
                    style={{
                      flex: 1.2, padding: '10px 14px', borderRadius: 10,
                      background: '#2E7D32', color: '#FFFFFF',
                      border: 'none',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 12px rgba(46,125,50,0.30)',
                    }}
                  >{saving ? 'Reactivating…' : 'Yes, reactivate'}</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleReactivate}
                style={{
                  width: '100%', padding: '11px 16px', borderRadius: 10,
                  background: 'transparent', color: '#2E7D32',
                  border: '1.5px solid rgba(67, 160, 71, 0.5)',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >Reactivate account</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Fallback reasons if state.cancelReasons hasn't loaded yet (e.g. local mode)
const CABT_CANCEL_REASONS_FALLBACK = [
  { code: 'cost',       label: 'Cost',        sortOrder: 10 },
  { code: 'results',    label: 'Results',     sortOrder: 20 },
  { code: 'closed',     label: 'Closed',      sortOrder: 30 },
  { code: 'pivoted',    label: 'Pivoted',     sortOrder: 40 },
  { code: 'capacity',   label: 'Capacity',    sortOrder: 50 },
  { code: 'inhouse',    label: 'Inhouse',     sortOrder: 60 },
  { code: 'competitor', label: 'Competitor',  sortOrder: 70 },
  { code: 'fit',        label: 'Fit',         sortOrder: 80 },
  { code: 'scope',      label: 'Scope',       sortOrder: 90 },
  { code: 'personal',   label: 'Personal',    sortOrder: 100 },
  { code: 'paused',     label: 'Paused',      sortOrder: 110 },
  { code: 'ghosted',    label: 'Ghosted',     sortOrder: 120 },
  { code: 'nonpayment', label: 'Nonpayment',  sortOrder: 130 },
];

function KV({ theme, label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${theme.rule}`, fontSize: 14 }}>
      <span style={{ color: theme.inkMuted }}>{label}</span>
      <span style={{ color: theme.ink, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function Stat({ theme, k, v }) {
  return (
    <div style={{ background: theme.bgElev, border: `1px solid ${theme.rule}`, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: theme.inkMuted, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.ink, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{v}</div>
    </div>
  );
}

function EmptyState({ theme, text }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: theme.inkMuted, fontSize: 14 }}>
      <Icon name="doc" size={32} />
      <div style={{ marginTop: 8 }}>{text}</div>
    </div>
  );
}

// ── Per-client Dashboard tab — TKT-12.4 (Bobby 2026-05-06) ──────────────────
// Mirror of the All-accounts Dashboard at the per-client level. One row per
// data event for THIS client (or one rollup row per period when grouped).
// Cadence toggle: Week / Month / Quarter / Year / All (no grouping).
// Reuses ColumnChooserModal from admin-extra.jsx for the gear-icon column
// chooser (same pattern + persistence as TKT-12.3).
// Per-account monthly history bar charts (Kurt 2026-07-27). One metric and one
// year at a time — revenue, cost per lead, sign-ups, cancels, or student count,
// by month. Reads the effective monthly metrics (weekly rows rolled up), so
// weekly-cadence clients chart the same way.
const CHART_METRICS = [
  { key: 'revenue',  label: 'Revenue',     field: 'clientGrossRevenue', money: true },
  { key: 'leadCost', label: 'Cost / lead', field: 'leadCost',           money: true },
  { key: 'signups',  label: 'Sign-ups',    field: 'leadsSigned',        money: false },
  { key: 'cancels',  label: 'Cancels',     field: 'studentsCancelled',  money: false },
  { key: 'students', label: 'Students',    field: 'totalStudentsStart', money: false },
];
const CHART_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ClientChartsTab({ state, theme, client }) {
  const [metricKey, setMetricKey] = React.useState('revenue');
  const metric = CHART_METRICS.find(m => m.key === metricKey) || CHART_METRICS[0];

  const eff = React.useMemo(
    () => CABT_effectiveMonthlyMetrics(state.monthlyMetrics, state.weeklyMetrics, client.id),
    [state.monthlyMetrics, state.weeklyMetrics, client.id]
  );
  const years = React.useMemo(() => {
    const set = new Set(eff.map(m => (m.month || '').slice(0, 4)).filter(Boolean));
    const arr = Array.from(set).sort();
    return arr.length ? arr : [String(new Date().getFullYear())];
  }, [eff]);
  const [year, setYear] = React.useState(years[years.length - 1]);
  React.useEffect(() => { if (!years.includes(year)) setYear(years[years.length - 1]); }, [years.join(',')]);

  const values = React.useMemo(() => {
    const arr = new Array(12).fill(null);
    eff.forEach(m => {
      if (!m.month || m.month.slice(0, 4) !== year) return;
      const mo = Number(m.month.slice(5, 7)) - 1;
      if (mo < 0 || mo > 11) return;
      const v = Number(m[metric.field]);
      if (Number.isFinite(v)) arr[mo] = v;
    });
    return arr;
  }, [eff, year, metric]);

  const hasData = values.some(v => v != null);
  const fmtVal = (v) => v == null ? '—' : (metric.money ? CABT_fmtMoney(v) : Number(v).toLocaleString());
  const fmtAxis = (v) => {
    if (metric.money) {
      if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
      return '$' + Math.round(v);
    }
    return Number(v).toLocaleString();
  };

  // Chart geometry
  const W = 720, H = 320, padL = 60, padR = 14, padT = 26, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const rawMax = Math.max(0, ...values.map(v => Number(v) || 0));
  const niceMax = (() => {
    if (rawMax <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
    return Math.ceil(rawMax / pow) * pow || 1;
  })();
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => f * niceMax);
  const bandW = plotW / 12;
  const barW = Math.min(38, bandW * 0.62);
  const BAR = '#4f7cc4';

  const contributing = values.filter(v => v != null);
  const totalV = contributing.reduce((s, v) => s + (Number(v) || 0), 0);
  const avgV = contributing.length ? totalV / contributing.length : 0;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CHART_METRICS.map(m => (
            <button key={m.key} onClick={() => setMetricKey(m.key)} style={{
              padding: '6px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 999,
              fontFamily: 'inherit', cursor: 'pointer',
              background: m.key === metricKey ? theme.ink : theme.surface,
              color: m.key === metricKey ? (theme.accentInk || '#fff') : theme.ink,
              border: `1px solid ${m.key === metricKey ? theme.ink : theme.rule}`,
            }}>{m.label}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', minWidth: 96 }}>
          <Select value={year} onChange={setYear} options={years.map(y => ({ value: y, label: y }))} theme={theme} />
        </div>
      </div>

      <Card theme={theme} padding={16}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink }}>{metric.label} by month · {year}</div>
          {hasData && (
            <div style={{ fontSize: 12, color: theme.inkMuted }}>
              Total <strong style={{ color: theme.ink }}>{fmtVal(totalV)}</strong> · Avg <strong style={{ color: theme.ink }}>{fmtVal(Math.round(avgV))}</strong>
            </div>
          )}
        </div>

        {!hasData ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>
            No {metric.label.toLowerCase()} data for {year}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560, display: 'block' }} role="img" aria-label={`${metric.label} by month for ${year}`}>
              {yTicks.map((t, i) => {
                const y = padT + plotH - (t / niceMax) * plotH;
                return (
                  <g key={`t${i}`}>
                    <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={theme.rule} strokeWidth="1"/>
                    <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10" fill={theme.inkMuted}>{fmtAxis(t)}</text>
                  </g>
                );
              })}
              {values.map((v, i) => {
                const val = Number(v) || 0;
                const h = niceMax > 0 ? (val / niceMax) * plotH : 0;
                const x = padL + i * bandW + (bandW - barW) / 2;
                const y = padT + plotH - h;
                return (
                  <g key={`b${i}`}>
                    {v != null && val > 0 && <rect x={x} y={y} width={barW} height={Math.max(0, h)} rx="3" fill={BAR}/>}
                    {v != null && val > 0 && (
                      <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={theme.ink}>
                        {metric.money ? fmtAxis(val) : Number(val).toLocaleString()}
                      </text>
                    )}
                    <text x={padL + i * bandW + bandW / 2} y={padT + plotH + 16} textAnchor="middle" fontSize="10" fill={theme.inkMuted}>{CHART_MONTHS[i]}</text>
                  </g>
                );
              })}
              <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke={theme.inkMuted} strokeWidth="1.5"/>
            </svg>
          </div>
        )}
      </Card>

      <div style={{ fontSize: 11.5, color: theme.inkMuted, lineHeight: 1.5 }}>
        Per-account monthly history — pick a metric and a year. Weekly-logged months are rolled up. Revenue is gross revenue.
      </div>
    </div>
  );
}

function ClientDashboardTab({ state, theme, client, cMonthlyMetrics, cWeeklyMetrics, cEvents, cSurveys, cWeekly, cMonthly, navigate }) {
  // Persisted preferences — scoped to "client-dashboard" so they don't
  // collide with the all-accounts dashboard's preferences.
  const lsGet = (k, fb) => {
    try { const v = window.localStorage && window.localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
    catch (_e) { return fb; }
  };
  const lsSet = (k, v) => { try { window.localStorage && window.localStorage.setItem(k, JSON.stringify(v)); } catch (_e) {} };

  const [cadence, setCadence] = React.useState(() => lsGet('clientDash:cadence', 'all'));
  React.useEffect(() => { lsSet('clientDash:cadence', cadence); }, [cadence]);

  const [sortKey, setSortKey] = React.useState('date');
  const [sortDir, setSortDir] = React.useState('desc');
  const [chooserOpen, setChooserOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(() => new Set());

  const DEFAULT_VISIBLE = ['date', 'type', 'caName', 'mrr', 'adSpend', 'leadsGenerated', 'apptsBooked', 'leadsShowed', 'leadsSigned', 'studentsCancelled', 'studentsEnd', 'notes'];
  const [visibleCols, setVisibleCols] = React.useState(() => {
    const stored = lsGet('clientDash:cols', DEFAULT_VISIBLE);
    // One-time, non-destructive migration: anyone already tracking student
    // headcount gets the new running-total "End" column surfaced beside it,
    // without resetting their other column choices (Bobby 2026-06-19 Loom).
    if (Array.isArray(stored)
        && (stored.includes('studentsStart') || stored.includes('studentsCancelled'))
        && !stored.includes('studentsEnd')) {
      return new Set([...stored, 'studentsEnd']);
    }
    return new Set(stored);
  });
  React.useEffect(() => { lsSet('clientDash:cols', Array.from(visibleCols)); }, [visibleCols]);

  // Build the union of all events for THIS client, normalized.
  const num = (v) => (v == null ? null : Number(v));
  const events = React.useMemo(() => {
    const out = [];
    cMonthlyMetrics.forEach(m => out.push({
      kind: 'monthly-metrics', source: 'monthly_metrics', id: m.id,
      date: m.month, sortDate: m.month,
      caId: m.caId, caName: state.cas.find(c => c.id === m.caId)?.name || '—',
      mrr: num(m.clientMRR), grossRevenue: num(m.clientGrossRevenue),
      adSpend: num(m.adSpend), leadCost: num(m.leadCost),
      leadsGenerated: num(m.leadsGenerated),
      apptsBooked: num(m.apptsBooked),
      leadsShowed: num(m.leadsShowed),
      leadsSigned: num(m.leadsSigned),
      studentsStart: num(m.totalStudentsStart),
      studentsAcquired: num(m.studentsAcquired),
      studentsCancelled: num(m.studentsCancelled),
      surveyScore: null,
      notes: m.notes || '',
      flaggedInactive: !!m.flaggedInactive,
      _payload: m,
    }));
    cWeeklyMetrics.forEach(w => out.push({
      kind: 'weekly-metrics', source: 'weekly_metrics', id: w.id,
      date: w.weekStart, sortDate: w.weekStart,
      caId: w.caId, caName: state.cas.find(c => c.id === w.caId)?.name || '—',
      mrr: num(w.clientMRR), grossRevenue: num(w.clientGrossRevenue),
      adSpend: num(w.adSpend), leadCost: num(w.leadCost),
      leadsGenerated: num(w.leadsGenerated),
      apptsBooked: num(w.apptsBooked),
      leadsShowed: num(w.leadsShowed),
      leadsSigned: num(w.leadsSigned),
      studentsStart: num(w.totalStudentsStart),
      studentsAcquired: num(w.studentsAcquired),
      studentsCancelled: num(w.studentsCancelled),
      surveyScore: null,
      notes: w.notes || '',
      flaggedInactive: !!w.flaggedInactive,
      _payload: w,
    }));
    cWeekly.forEach(w => out.push({
      kind: 'weekly-checkin', source: 'weekly_checkins', id: w.id,
      date: w.weekStart, sortDate: w.weekStart,
      caId: w.caId, caName: state.cas.find(c => c.id === w.caId)?.name || '—',
      mrr: null, grossRevenue: null,
      adSpend: null, leadCost: null,
      leadsGenerated: null, apptsBooked: null, leadsShowed: null, leadsSigned: null,
      studentsStart: null, studentsAcquired: null, studentsCancelled: null,
      surveyScore: null,
      notes: [w.concern, w.win, w.accountAction, w.agencyAction].filter(Boolean).join(' · '),
      flaggedInactive: !!w.flaggedInactive,
      _payload: w,
    }));
    cMonthly.forEach(m => out.push({
      kind: 'monthly-checkin', source: 'monthly_checkins', id: m.id,
      date: m.month, sortDate: m.month,
      caId: m.caId, caName: state.cas.find(c => c.id === m.caId)?.name || '—',
      mrr: null, grossRevenue: null,
      adSpend: null, leadCost: null,
      leadsGenerated: null, apptsBooked: null, leadsShowed: null, leadsSigned: null,
      studentsStart: null, studentsAcquired: null, studentsCancelled: null,
      surveyScore: null,
      notes: [m.concern, m.win, m.accountAction, m.agencyAction].filter(Boolean).join(' · '),
      flaggedInactive: !!m.flaggedInactive,
      _payload: m,
    }));
    cEvents.forEach(e => out.push({
      kind: 'event', source: 'growth_events', id: e.id,
      date: e.date, sortDate: e.date,
      caId: e.loggedBy || e.caId, caName: state.cas.find(c => c.id === (e.loggedBy || e.caId))?.name || '—',
      mrr: null, grossRevenue: null,
      adSpend: null, leadCost: null,
      leadsGenerated: null, apptsBooked: null, leadsShowed: null, leadsSigned: null,
      studentsStart: null, studentsAcquired: null, studentsCancelled: null,
      surveyScore: null,
      notes: `${e.eventType || 'Event'}${e.notes ? ' · ' + e.notes : ''}${e.saleTotal > 0 ? ' · sale ' + CABT_fmtMoney(e.saleTotal) : ''}`,
      flaggedInactive: false,
      _payload: e,
    }));
    cSurveys.forEach(s => out.push({
      kind: 'survey', source: 'surveys', id: s.id,
      date: s.date, sortDate: s.date,
      caId: s.caId, caName: state.cas.find(c => c.id === s.caId)?.name || '—',
      mrr: null, grossRevenue: null,
      adSpend: null, leadCost: null,
      leadsGenerated: null, apptsBooked: null, leadsShowed: null, leadsSigned: null,
      studentsStart: null, studentsAcquired: null, studentsCancelled: null,
      surveyScore: ((Number(s.overall || 0) + Number(s.responsiveness || 0) + Number(s.followThrough || 0) + Number(s.communication || 0)) / 4) || null,
      notes: s.comment || '',
      flaggedInactive: false,
      _payload: s,
    }));
    return out;
  }, [cMonthlyMetrics, cWeeklyMetrics, cWeekly, cMonthly, cEvents, cSurveys, state.cas]);

  // Period key per cadence (used for grouping)
  const isoMondayOf = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    const day = d.getDay() || 7;
    if (day !== 1) d.setDate(d.getDate() - (day - 1));
    return d.toISOString().slice(0, 10);
  };
  const periodKey = (e) => {
    const iso = e.date;
    if (!iso) return '—';
    if (cadence === 'week')    return isoMondayOf(iso);
    if (cadence === 'month')   return iso.slice(0, 7) + '-01';
    if (cadence === 'quarter') {
      const [y, m] = iso.split('-').map(Number);
      const q = Math.floor(((m || 1) - 1) / 3);
      return `${y}-Q${q + 1}`;
    }
    if (cadence === 'year')    return iso.slice(0, 4);
    return e.id; // 'all' — each event is its own group
  };
  const periodLabel = (key) => {
    if (key === '—') return '—';
    if (cadence === 'week')    return `Week of ${CABT_fmtDate(key)}`;
    if (cadence === 'month')   return CABT_fmtMonth(key);
    if (cadence === 'quarter') return key;
    if (cadence === 'year')    return key;
    return null; // 'all'
  };

  // PRD-strict (TKT-12.4): "Render one row per data event" = base behavior;
  // "per-cadence aggregation (Quarter & Year = rollup + expandable)" = only
  // Q & Y aggregate. Week / Month / All = flat 1-row-per-event. The cadence
  // toggle on Week/Month still affects the date column label format (week-of
  // / month label) and the period summary in the header.
  const rows = React.useMemo(() => {
    // End-of-period student count = Start + Closed − Cancelled. Shown so the
    // running math is transparent (next period's Start should match this End).
    // Bobby 2026-06-19 (Loom): "Acquired" and "Closed" were being used as the
    // same thing (a new student) — the redundant Acquired field is gone, so the
    // students added this period IS Closed (leadsSigned).
    const withEnd = (e) => ({
      ...e,
      studentsEnd: e.studentsStart == null
        ? null
        : Number(e.studentsStart) + (Number(e.leadsSigned) || 0) - (Number(e.studentsCancelled) || 0),
    });
    if (cadence === 'all' || cadence === 'week' || cadence === 'month') {
      return events.map(e => ({ ...withEnd(e), _isGroup: false, _children: [] }));
    }
    const groups = new Map();
    events.forEach(e => {
      const k = periodKey(e);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    });
    return Array.from(groups.entries()).map(([k, list]) => {
      const sum = (key) => list.reduce((s, x) => s + (Number(x[key]) || 0), 0);
      const latest = (key) => {
        let best = null, bestDate = null;
        for (const x of list) {
          if (x[key] == null) continue;
          if (!bestDate || x.sortDate > bestDate) { best = x[key]; bestDate = x.sortDate; }
        }
        return best;
      };
      // First non-null value in the period (earliest by date). Used for
      // "Start" — a quarter's starting student count is the FIRST month's
      // start, not the last. (Bobby 2026-06-19 Loom: the rolled-up Start was
      // showing the latest month, so the period math never reconciled.)
      const first = (key) => {
        let best = null, bestDate = null;
        for (const x of list) {
          if (x[key] == null) continue;
          if (!bestDate || x.sortDate < bestDate) { best = x[key]; bestDate = x.sortDate; }
        }
        return best;
      };
      const surveyScores = list.map(x => x.surveyScore).filter(v => v != null);
      const avgSurvey = surveyScores.length ? surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length : null;
      const counts = list.reduce((acc, x) => { acc[x.kind] = (acc[x.kind] || 0) + 1; return acc; }, {});
      const typeSummary = Object.entries(counts).map(([kind, n]) => `${n}× ${kind.replace('-', ' ')}`).join(', ');
      return {
        kind: 'rollup',
        source: 'group',
        id: k,
        date: list[0].date, // representative
        sortDate: k,
        groupLabel: periodLabel(k),
        caId: '', caName: list[0].caName,
        // MRR is a run-rate snapshot → the period's MRR is the latest month's.
        // Gross revenue is a FLOW (money earned during the period) → sum the
        // months so a 3-month quarter totals all three, not just the last
        // (Bobby 2026-06-19 Loom: "if I go to quarter one, that doesn't add up").
        mrr: latest('mrr'),
        grossRevenue: sum('grossRevenue'),
        adSpend: sum('adSpend'),
        leadCost: (sum('leadsGenerated') > 0 ? sum('adSpend') / sum('leadsGenerated') : null),
        leadsGenerated: sum('leadsGenerated'),
        apptsBooked:    sum('apptsBooked'),
        leadsShowed:    sum('leadsShowed'),
        leadsSigned:    sum('leadsSigned'),
        // Start = first month's opening count; End = Start + Closed − Cancelled
        // across the period, so the running student math is visible and the
        // next period's Start should equal this period's End.
        studentsStart:  first('studentsStart'),
        studentsCancelled: sum('studentsCancelled'),
        studentsEnd: (() => {
          const st = first('studentsStart');
          if (st == null) return null;
          return Number(st) + sum('leadsSigned') - sum('studentsCancelled');
        })(),
        surveyScore: avgSurvey,
        notes: typeSummary,
        flaggedInactive: list.some(x => x.flaggedInactive),
        _isGroup: true,
        _children: list.map(withEnd),
      };
    });
  }, [events, cadence]);

  // Sort
  const sorted = React.useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const setSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'date' || k === 'sortDate' ? 'desc' : 'desc'); }
  };

  const fmt   = (n) => (n == null ? '—' : Number(n).toLocaleString());
  const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pctRate = (n) => (n == null ? '—' : (n * 100).toFixed(1) + '%');

  // Column registry for the per-client dashboard
  const COLUMNS = [
    { id: 'date',     label: 'Period',    group: 'When',      align: 'left',  sortKey: 'sortDate',
      render: (r) => <>
        <span style={{ fontWeight: 700 }}>{r._isGroup ? r.groupLabel : (cadence === 'all' ? CABT_fmtDate(r.date) : (cadence === 'week' ? `Week of ${CABT_fmtDate(isoMondayOf(r.date))}` : CABT_fmtMonth(r.date)))}</span>
        {r.flaggedInactive && (
          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, letterSpacing: 0.4, padding: '2px 6px', borderRadius: 8, background: 'rgba(255,178,56,0.18)', color: '#8C5A00', textTransform: 'uppercase', border: '1px solid rgba(255,178,56,0.4)' }}>flagged</span>
        )}
      </> },
    { id: 'type',     label: 'Type',      group: 'When',      align: 'left',  sortKey: 'kind',
      render: (r) => {
        if (r._isGroup) return <span style={{ fontSize: 11, color: theme.inkMuted }}>{r._children.length} entr{r._children.length === 1 ? 'y' : 'ies'}</span>;
        const map = {
          'monthly-metrics': 'Month metrics',
          'weekly-metrics':  'Week metrics',
          'weekly-checkin':  'Week check-in',
          'monthly-checkin': 'Month check-in',
          'event':           'Growth event',
          'survey':          'Survey',
        };
        return <span style={{ fontSize: 11, color: theme.inkSoft }}>{map[r.kind] || r.kind}</span>;
      } },
    { id: 'caName',   label: 'CA',        group: 'When',      align: 'left',  sortKey: 'caName',
      render: (r) => <span style={{ color: theme.inkSoft }}>{r.caName}</span> },
    // Money
    { id: 'mrr',           label: 'MRR',         group: 'Money', align: 'right', sortKey: 'mrr',           mono: true, render: (r) => money(r.mrr) },
    { id: 'grossRevenue',  label: 'Gross',       group: 'Money', align: 'right', sortKey: 'grossRevenue',  mono: true, render: (r) => money(r.grossRevenue) },
    { id: 'adSpend',       label: 'Ad Spend',    group: 'Money', align: 'right', sortKey: 'adSpend',       mono: true, render: (r) => money(r.adSpend) },
    { id: 'leadCost',      label: 'Lead $',      group: 'Money', align: 'right', sortKey: 'leadCost',      mono: true, render: (r) => r.leadCost ? money(r.leadCost) : '—' },
    // Funnel
    { id: 'leadsGenerated', label: 'Leads',  group: 'Funnel', align: 'right', sortKey: 'leadsGenerated', mono: true, render: (r) => fmt(r.leadsGenerated) },
    { id: 'apptsBooked',    label: 'Booked', group: 'Funnel', align: 'right', sortKey: 'apptsBooked',    mono: true, render: (r) => fmt(r.apptsBooked) },
    { id: 'leadsShowed',    label: 'Showed', group: 'Funnel', align: 'right', sortKey: 'leadsShowed',    mono: true, render: (r) => fmt(r.leadsShowed) },
    { id: 'leadsSigned',    label: 'Closed', group: 'Funnel', align: 'right', sortKey: 'leadsSigned',    mono: true, render: (r) => fmt(r.leadsSigned) },
    // Students
    { id: 'studentsStart',     label: 'Start',     group: 'Students', align: 'right', sortKey: 'studentsStart',     mono: true, render: (r) => fmt(r.studentsStart) },
    // "Acquired" removed 2026-06-19 (Bobby, Loom): it was redundant with
    // "Closed" — both meant a new student, and the gym doesn't differentiate
    // walk-ins/referrals from funnel signs. Closed is now the single source.
    { id: 'studentsCancelled', label: 'Cancel',    group: 'Students', align: 'right', sortKey: 'studentsCancelled', mono: true, render: (r) => fmt(r.studentsCancelled) },
    // End = Start + Closed − Cancel. Makes the running headcount math
    // explicit so a mismatch with the next period's Start is obviously a
    // data-entry gap, not a calculation error (Bobby 2026-06-19 Loom).
    { id: 'studentsEnd',       label: 'End',       group: 'Students', align: 'right', sortKey: 'studentsEnd',       mono: true, render: (r) => fmt(r.studentsEnd) },
    // Survey
    { id: 'surveyScore', label: 'Survey',     group: 'Other',  align: 'right', sortKey: 'surveyScore', mono: true, render: (r) => r.surveyScore == null ? '—' : (r.surveyScore).toFixed(1) },
    // Notes (truncated)
    { id: 'notes',       label: 'Notes',      group: 'Other',  align: 'left',  sortKey: 'notes',
      render: (r) => {
        const n = r.notes || '';
        return <span style={{ color: theme.inkSoft, fontSize: 12 }}>{n.length > 80 ? n.slice(0, 80) + '…' : (n || '—')}</span>;
      } },
  ];
  const COLUMN_GROUPS = ['When', 'Money', 'Funnel', 'Students', 'Other'];
  const visibleColumnObjs = COLUMNS.filter(c => visibleCols.has(c.id));

  // Width of the leading expand/collapse toggle column (quarter/year only).
  // The frozen Period column sits to its right, so its left offset shifts by
  // this much when the toggle is present.
  const TOGGLE_W = 28;
  const hasToggle = (cadence === 'quarter' || cadence === 'year');
  // Left offset for the frozen Period column.
  const PERIOD_LEFT = hasToggle ? TOGGLE_W : 0;

  // Bobby 2026-06-19 (Loom): "I want to see the dates / the period to stay
  // there, just like we do for the accounts." The wide log table scrolls
  // horizontally, so freeze the Period column (and the toggle gutter) to the
  // left — mirrors the all-accounts dashboard's frozen Client column.
  const Th = ({ k, children, align = 'left', stickyLeft }) => {
    const active = sortKey === k;
    const isSticky = stickyLeft != null;
    return (
      <th onClick={() => setSort(k)} style={{
        textAlign: align, padding: '10px 8px',
        fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
        color: active ? theme.ink : theme.inkMuted,
        cursor: 'pointer', borderBottom: `1px solid ${theme.rule}`,
        background: theme.bgElev, position: 'sticky', top: 0,
        left: isSticky ? stickyLeft : undefined,
        zIndex: isSticky ? 3 : 1,
        boxShadow: isSticky ? `inset -1px 0 0 ${theme.rule}` : undefined,
        whiteSpace: 'nowrap', userSelect: 'none',
      }}>
        {children}{active && <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </th>
    );
  };
  const Td = ({ children, align = 'left', mono, stickyLeft }) => {
    const isSticky = stickyLeft != null;
    return (
      <td style={{
        padding: '10px 8px', fontSize: 12,
        color: theme.ink,
        fontFamily: mono ? (theme.mono || 'monospace') : 'inherit',
        fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        textAlign: align, whiteSpace: 'nowrap',
        borderBottom: `1px solid ${theme.rule}`,
        position: isSticky ? 'sticky' : undefined,
        left: isSticky ? stickyLeft : undefined,
        zIndex: isSticky ? 1 : undefined,
        // Opaque background so scrolled columns don't bleed through.
        background: isSticky ? theme.surface : undefined,
        boxShadow: isSticky ? `inset -1px 0 0 ${theme.rule}` : undefined,
      }}>{children}</td>
    );
  };

  // Tap an event row → drill into the right edit form.
  const drillRoute = {
    'monthly-metrics': 'log-metrics',
    'weekly-metrics':  'log-metrics',
    'event':           'log-event',
    'survey':          'log-survey',
  };
  const onEventClick = (r) => {
    if (r._isGroup) {
      setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
        return next;
      });
      return;
    }
    const route = drillRoute[r.kind];
    if (!route) return; // check-ins are read-only
    navigate(route, { clientId: client.id, editingId: r.id });
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Cadence toggle + column chooser */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, color: theme.inkMuted, fontWeight: 600 }}>Cadence</span>
        {[
          { v: 'week',    label: 'Week' },
          { v: 'month',   label: 'Month' },
          { v: 'quarter', label: 'Quarter' },
          { v: 'year',    label: 'Year' },
          { v: 'all',     label: 'All' },
        ].map(t => (
          <button key={t.v} onClick={() => setCadence(t.v)} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 700,
            background: cadence === t.v ? theme.ink : theme.surface,
            color: cadence === t.v ? (theme.accentInk || '#fff') : theme.ink,
            border: `1px solid ${cadence === t.v ? theme.ink : theme.rule}`,
            borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}

        <button
          onClick={() => setChooserOpen(true)}
          aria-label="Choose columns"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', height: 32,
            background: theme.surface, color: theme.ink,
            border: `1px solid ${theme.rule}`, borderRadius: 8,
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          <Icon name="cog" size={14} color={theme.inkMuted}/>
          Columns
          <span style={{ color: theme.inkMuted, fontWeight: 500, marginLeft: 2 }}>· {visibleCols.size}</span>
        </button>
      </div>

      <div style={{ fontSize: 11, color: theme.inkMuted }}>
        {events.length} log{events.length === 1 ? '' : 's'} for {client.name}{(cadence === 'quarter' || cadence === 'year') && ` · ${sorted.length} ${cadence}${sorted.length === 1 ? '' : 's'}`} · click any column to sort{(cadence === 'quarter' || cadence === 'year') && ' · tap a rollup row to expand'}
      </div>

      <div style={{ overflowX: 'auto', background: theme.surface, border: `1px solid ${theme.rule}`, borderRadius: theme.radius }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {hasToggle && <th style={{ width: TOGGLE_W, padding: '10px 4px', borderBottom: `1px solid ${theme.rule}`, background: theme.bgElev, position: 'sticky', top: 0, left: 0, zIndex: 3 }}/>}
              {visibleColumnObjs.map(col => (
                <Th key={col.id} k={col.sortKey || col.id} align={col.align} stickyLeft={col.id === 'date' ? PERIOD_LEFT : undefined}>{col.label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={visibleColumnObjs.length + ((cadence === 'quarter' || cadence === 'year') ? 1 : 0)} style={{ padding: 24, textAlign: 'center', color: theme.inkMuted, fontSize: 13 }}>No logs yet for this client.</td></tr>
            )}
            {sorted.map(r => {
              const isExpanded = expanded.has(r.id);
              return (
                <React.Fragment key={r.id}>
                  <tr onClick={() => onEventClick(r)} style={{ cursor: 'pointer' }}>
                    {hasToggle && (
                      <td style={{ padding: '10px 4px', borderBottom: `1px solid ${theme.rule}`, color: theme.inkMuted, fontSize: 14, textAlign: 'center', position: 'sticky', left: 0, zIndex: 1, background: theme.surface }}>
                        {r._isGroup && r._children.length > 0 ? (isExpanded ? '▾' : '▸') : ''}
                      </td>
                    )}
                    {visibleColumnObjs.map(col => (
                      <Td key={col.id} align={col.align} mono={col.mono} stickyLeft={col.id === 'date' ? PERIOD_LEFT : undefined}>{col.render(r)}</Td>
                    ))}
                  </tr>
                  {r._isGroup && isExpanded && r._children.map(child => (
                    <tr key={child.id}
                        onClick={() => {
                          const route = drillRoute[child.kind];
                          if (route) navigate(route, { clientId: client.id, editingId: child.id });
                        }}
                        style={{ cursor: drillRoute[child.kind] ? 'pointer' : 'default', background: theme.bgElev }}>
                      <td style={{ width: TOGGLE_W, padding: '8px 4px', borderBottom: `1px solid ${theme.rule}`, position: 'sticky', left: 0, zIndex: 1, background: theme.bgElev }}/>
                      {visibleColumnObjs.map(col => {
                        const isDate = col.id === 'date';
                        return (
                        <td key={col.id} style={{
                          padding: '8px 8px', fontSize: 11,
                          color: theme.inkSoft,
                          fontFamily: col.mono ? (theme.mono || 'monospace') : 'inherit',
                          fontVariantNumeric: col.mono ? 'tabular-nums' : 'normal',
                          textAlign: col.align, whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${theme.rule}`,
                          paddingLeft: isDate ? 24 : 8,
                          position: isDate ? 'sticky' : undefined,
                          left: isDate ? PERIOD_LEFT : undefined,
                          zIndex: isDate ? 1 : undefined,
                          background: isDate ? theme.bgElev : undefined,
                          boxShadow: isDate ? `inset -1px 0 0 ${theme.rule}` : undefined,
                        }}>{col.render({ ...child, _isGroup: false })}</td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {chooserOpen && window.ColumnChooserModal && (
        <window.ColumnChooserModal
          theme={theme}
          columns={COLUMNS}
          groups={COLUMN_GROUPS}
          visible={visibleCols}
          onChange={setVisibleCols}
          onClose={() => setChooserOpen(false)}
          defaults={DEFAULT_VISIBLE}
        />
      )}
    </div>
  );
}

Object.assign(window, { ClientDetail, KV, Stat, EmptyState, ClientDashboardTab });
