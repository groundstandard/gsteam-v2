// ca-forms.jsx — Log Monthly Metrics, Log Growth Event, Log Survey

// Defined at module scope so parent re-renders don't recreate the component
// reference. If declared inside LogMetricsForm, every keystroke remounts the
// whole section + Inputs lose focus mid-typing.
function SectionCard({ id, title, doneLabel, children, theme, isOpen, done, onToggle }) {
  return (
    <Card theme={theme} padding={0}>
      <button
        onClick={() => onToggle(id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', width: '100%', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 11,
          background: done ? STATUS.green : 'transparent',
          border: `1.5px solid ${done ? STATUS.green : theme.rule}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {done && <Icon name="check" size={13} color="#fff" stroke={2.5}/>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, letterSpacing: -0.15 }}>{title}</div>
          {!isOpen && doneLabel && <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2 }}>{doneLabel}</div>}
        </div>
        <Icon name={isOpen ? 'chev-u' : 'chev-d'} size={18} color={theme.inkMuted} />
      </button>
      {isOpen && (
        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
      )}
    </Card>
  );
}

// ── Smart-card form for Metrics (monthly OR weekly per client cadence) ────
//
// Phase 11 (Bobby 2026-05-05): clients can be on weekly or monthly cadence.
// This form auto-detects the selected client's cadence and:
//   - shows a `weekStart` date picker (ISO Monday) when weekly
//   - shows a `month` picker when monthly
// Numeric fields are identical either way; the backend rolls weekly entries
// up to monthly via v_monthly_metrics_effective for scoring.
function LogMetricsForm({ state, ca, theme, presetClientId, navigate, onSubmit, onDelete, editingId, isAdmin }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);

  // Editing: try weekly first (since IDs are prefixed differently); fall back
  // to monthly. Pre-existing callers still navigate with monthly IDs and that
  // path keeps working.
  const editing = editingId
    ? ((state.weeklyMetrics || []).find(m => m.id === editingId)
       || (state.monthlyMetrics || []).find(m => m.id === editingId))
    : null;
  const editingKind = editing
    ? (editing.weekStart ? 'weekly' : 'monthly')
    : null;

  const initialClient = editing?.clientId || presetClientId || (myClients[0]?.id ?? '');
  const initialClientObj = state.clients.find(c => c.id === initialClient);
  const initialCadence = editingKind || (initialClientObj?.loggingCadence || 'monthly');

  // ISO Monday of current week (used for weekly default + week picker prefill)
  const isoMondayOf = (d = new Date()) => {
    const x = new Date(d);
    const day = x.getDay() || 7;
    if (day !== 1) x.setDate(x.getDate() - (day - 1));
    return x.toISOString().slice(0, 10);
  };

  // Prefill from last entry. Prefer same-cadence; fall back to other.
  const getLastForClient = (cid, cadence) => {
    if (!cid) return null;
    if (cadence === 'weekly') {
      const w = (state.weeklyMetrics || [])
        .filter(m => m.clientId === cid)
        .sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || ''))[0];
      if (w) return w;
      // Fall back to last monthly so MRR / studentsStart prefill works on first weekly entry
      return (state.monthlyMetrics || [])
        .filter(m => m.clientId === cid)
        .sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0] || null;
    }
    return (state.monthlyMetrics || [])
      .filter(m => m.clientId === cid)
      .sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0] || null;
  };

  const lastForInit = getLastForClient(initialClient, initialCadence);

  // Bobby 2026-05-07: MRR is now a CALCULATED field — trailing-3-period
  // average of gross revenue. The CA only enters Gross Revenue; the form
  // computes clientMRR on submit and stores both. Backward compat: old
  // rows where clientMRR was hand-entered still read fine because the
  // column is unchanged. (Pre-2026-05-07 behavior was: MRR == Gross from
  // the same input field.)
  const initialRevenue = editing
    ? (editing.clientGrossRevenue || editing.clientMRR || '')
    : (lastForInit?.clientGrossRevenue || lastForInit?.clientMRR || '');

  // Trailing-3-period average of gross revenue for this client + cadence.
  // Lenient: if fewer than 3 entries exist, averages whatever's available.
  // Skips rows with $0 gross (placeholders where the CA logged funnel /
  // students data but hadn't reconciled revenue yet — Bobby 2026-05-12).
  // `thisRow` is the current form's pending value, included in the average
  // only when > 0. `excludeId` skips the row currently being edited.
  const computeRollingMRR = (clientId, period, cadence, thisGross, excludeId) => {
    const tbl = cadence === 'weekly' ? (state.weeklyMetrics || []) : (state.monthlyMetrics || []);
    const periodKey = cadence === 'weekly' ? 'weekStart' : 'month';
    const priors = tbl
      .filter(m => m.clientId === clientId && m.id !== excludeId && m[periodKey] && m[periodKey] < period)
      .sort((a, b) => (b[periodKey] || '').localeCompare(a[periodKey] || ''))
      .map(m => Number(m.clientGrossRevenue || m.clientMRR || 0))
      .filter(v => v > 0)
      .slice(0, 2);
    const thisVal = Number(thisGross) || 0;
    const all = thisVal > 0 ? [thisVal, ...priors] : priors;
    if (all.length === 0) return 0;
    // Bobby 2026-07-04: all money figures stay to the nearest penny — no more
    // long repeating decimals from the trailing-average.
    return Math.round((all.reduce((s, n) => s + n, 0) / all.length) * 100) / 100;
  };

  const [form, setForm] = React.useState(editing
    ? { ...editing, totalRevenue: initialRevenue, stillActive: !editing.flaggedInactive }
    : {
        clientId: initialClient,
        cadence: initialCadence,
        // Use the right period field for this cadence; the other stays empty.
        month:     initialCadence === 'monthly' ? CABT_currentMonthIso() : '',
        weekStart: initialCadence === 'weekly'  ? isoMondayOf()          : '',
        totalRevenue: initialRevenue,
        leadCost: lastForInit?.leadCost ?? '',
        adSpend: lastForInit?.adSpend ?? '',
        leadsGenerated: '',
        apptsBooked: '',
        leadsShowed: '',
        leadsSigned: '',
        totalStudentsStart: lastForInit?.totalStudentsStart ?? '',
        studentsCancelled: '',
        // TKT-12.2 — "Is account still active this period?" — default true.
        // Unchecking sets flagged_inactive on the row → retention drops to 0.
        stillActive: true,
        notes: '',
      });

  // Re-derive cadence whenever client changes; the form's behavior depends on it.
  const selectedClient = state.clients.find(c => c.id === form.clientId);
  const activeCadence = (editingKind || form.cadence || selectedClient?.loggingCadence || 'monthly');

  const [open, setOpen] = React.useState({ ident: true, money: true, funnel: false, attrition: false, active: true, notes: false });
  const [errors, setErrors] = React.useState({});
  const [warnings, setWarnings] = React.useState({});
  const [duplicateBlock, setDuplicateBlock] = React.useState(null);
  // Bobby 2026-05-12: "I needto be ableto delete a metric. this Jean
  // Jacques MAchado metric was added as a test. it's fake. deletions
  // should be only possible for Admin. If the CA wants to delete, then
  // i just need to be sent to Approvals." Two-step destructive flow:
  // tap "Delete" → confirmation panel replaces the action buttons.
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const updateForm = (key, value) => {
    setForm(f => {
      const next = { ...f, [key]: value };
      // Re-prefill + re-pick cadence when client changes (only if not editing)
      if (!editing && key === 'clientId') {
        const newClient = state.clients.find(c => c.id === value);
        const newCadence = newClient?.loggingCadence || 'monthly';
        next.cadence = newCadence;
        // Match the period field to the new cadence
        if (newCadence === 'weekly') {
          next.weekStart = next.weekStart || isoMondayOf();
          next.month = '';
        } else {
          next.month = next.month || CABT_currentMonthIso();
          next.weekStart = '';
        }
        const last = getLastForClient(value, newCadence);
        if (last) {
          next.totalRevenue = next.totalRevenue || last.clientGrossRevenue || last.clientMRR;
          next.leadCost = next.leadCost || last.leadCost;
          next.adSpend = next.adSpend || last.adSpend;
          next.totalStudentsStart = next.totalStudentsStart || last.totalStudentsStart;
        }
      }
      return next;
    });
  };

  const validate = () => {
    const e = {};
    const w = {};
    if (!form.clientId) e.clientId = 'Required';
    const periodField = activeCadence === 'weekly' ? 'weekStart' : 'month';
    if (!form[periodField]) e[periodField] = 'Required';
    // Bobby 2026-05-12: "I cannot submit a metric unless i do the Gross
    // Revenue This Month." Relaxed — gross revenue is now optional so
    // the CA can save funnel/students data even on months where revenue
    // hasn't been reconciled yet. Empty submits as $0; MRR auto-compute
    // ignores $0 rows so a placeholder doesn't drag the trailing-3 avg.

    // Duplicate check (same client + same period, in the matching table)
    if (form.clientId && form[periodField]) {
      if (activeCadence === 'weekly') {
        const dupe = (state.weeklyMetrics || []).find(m =>
          m.clientId === form.clientId &&
          m.weekStart === form.weekStart &&
          m.id !== editingId
        );
        if (dupe) { setDuplicateBlock(dupe); return false; }
      } else {
        const monthIso = CABT_firstOfMonth(form.month);
        const dupe = (state.monthlyMetrics || []).find(m =>
          m.clientId === form.clientId &&
          m.month === monthIso &&
          m.id !== editingId
        );
        if (dupe) { setDuplicateBlock(dupe); return false; }
      }
    }
    setDuplicateBlock(null);

    // Soft warnings
    if (activeCadence === 'monthly' && form.month) {
      const monthDate = new Date(form.month);
      const now = new Date();
      const monthsOff = Math.abs((monthDate.getFullYear() - now.getFullYear()) * 12 + (monthDate.getMonth() - now.getMonth()));
      if (monthsOff > 1) w.month = `That's ${monthsOff} months from today — typo?`;
    } else if (activeCadence === 'weekly' && form.weekStart) {
      const dt = new Date(form.weekStart + 'T12:00:00');
      const daysOff = Math.abs(Math.round((dt - new Date()) / 86400000));
      if (daysOff > 60) w.weekStart = `That's ${daysOff} days from today — typo?`;
    }

    ['leadsGenerated', 'apptsBooked', 'leadsShowed', 'leadsSigned'].forEach(k => {
      if (form[k] === 0 || form[k] === '0') w[k] = 'Confirm zero is real';
    });

    setErrors(e);
    setWarnings(w);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const num = (v) => v === '' || v == null ? 0 : Number(v);
    const isWeekly = activeCadence === 'weekly';
    const idPrefix = isWeekly ? 'WM' : 'MM';
    const periodFields = isWeekly
      ? { weekStart: form.weekStart }
      : { month: CABT_firstOfMonth(form.month) };
    // Bobby 2026-05-07: clientGrossRevenue = the CA's input (this period's
    // gross). clientMRR is now COMPUTED — trailing-3-period average of gross
    // revenue across this client's prior entries plus this one. Reads are
    // unchanged (every consumer of clientMRR still works), so formulas don't
    // break — they just see a smoothed value going forward.
    // All money is kept to the nearest penny (Bobby 2026-07-04: "all money
    // just to the nearest penny — let's keep it easy").
    const toPenny = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const grossRevenue = toPenny(form.totalRevenue);
    const periodForCalc = isWeekly ? form.weekStart : CABT_firstOfMonth(form.month);
    const computedMRR = computeRollingMRR(form.clientId, periodForCalc, activeCadence, grossRevenue, editingId);
    const row = {
      id: editingId || `${idPrefix}-${Date.now()}`,
      caId: ca.id,
      clientId: form.clientId,
      ...periodFields,
      clientMRR: computedMRR,
      clientGrossRevenue: grossRevenue,
      leadCost: toPenny(form.leadCost),
      adSpend: toPenny(form.adSpend),
      leadsGenerated: num(form.leadsGenerated),
      apptsBooked: num(form.apptsBooked),
      leadsShowed: num(form.leadsShowed),
      leadsSigned: num(form.leadsSigned),
      totalStudentsStart: num(form.totalStudentsStart),
      studentsCancelled: num(form.studentsCancelled),
      flaggedInactive: form.stillActive === false,
      notes: form.notes || '',
    };
    onSubmit(row, !!editing, activeCadence);
  };

  // Section completion indicators
  const periodFilled = activeCadence === 'weekly' ? !!form.weekStart : !!form.month;
  const sectionDone = {
    ident: !!form.clientId && periodFilled,
    money: form.totalRevenue !== '' && form.adSpend !== '',
    funnel: ['leadsGenerated','apptsBooked','leadsShowed','leadsSigned'].every(k => form[k] !== ''),
    attrition: form.totalStudentsStart !== '' && form.studentsCancelled !== '',
    active: typeof form.stillActive === 'boolean',
  };

  if (duplicateBlock) {
    const dupClient = state.clients.find(c => c.id === duplicateBlock.clientId);
    const dupePeriodLabel = duplicateBlock.weekStart
      ? `Week of ${CABT_fmtDate(duplicateBlock.weekStart)}`
      : CABT_fmtMonth(duplicateBlock.month);
    return (
      <div style={{ padding: '16px 16px 100px' }}>
        <Banner tone="error" icon="alert" title={`${dupePeriodLabel} already logged`} theme={theme}>
          You already logged {dupePeriodLabel} for {dupClient?.name}. Edit the existing row instead?
        </Banner>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button theme={theme} variant="secondary" fullWidth onClick={() => setDuplicateBlock(null)}>Cancel</Button>
          <Button theme={theme} variant="primary" fullWidth
                  onClick={() => navigate('log-metrics', { clientId: duplicateBlock.clientId, editingId: duplicateBlock.id })}>
            Edit existing
          </Button>
        </div>
      </div>
    );
  }

  const toggleSection = React.useCallback((id) => setOpen(o => ({ ...o, [id]: !o[id] })), []);
  const sectionProps = (id) => ({
    id, theme, isOpen: open[id], done: sectionDone[id], onToggle: toggleSection,
  });

  const periodLabel  = activeCadence === 'weekly' ? 'Week starting (Mon)' : 'Month';
  const periodDone = activeCadence === 'weekly'
    ? (form.weekStart ? `Week of ${CABT_fmtDate(form.weekStart)}` : 'Required')
    : (form.month ? CABT_fmtMonth(form.month) : 'Required');
  const cadenceHint = activeCadence === 'weekly'
    ? 'This client is on weekly cadence — your numbers roll up into the month for scoring.'
    : 'Prefilled from last month where possible. Tap a section to edit.';
  // TKT-12.1 — when editing as a non-admin, this submission becomes an
  // edit request, not a direct write. Surface that clearly.
  const requestMode = !!editing && !isAdmin;

  return (
    <FormShell theme={theme} gap={12}>
      {requestMode && (
        <div style={{
          fontSize: 13, lineHeight: 1.45, color: theme.ink,
          padding: '10px 12px', borderRadius: 8,
          background: 'rgba(255, 178, 56, 0.12)',
          border: '1px solid rgba(255, 178, 56, 0.35)',
        }}>
          <strong>Request edit.</strong> Your existing entry stays in place until an admin reviews this request.
        </div>
      )}
      <div style={{ fontSize: 13, color: theme.inkSoft, padding: '0 4px' }}>
        {cadenceHint}
      </div>

      <SectionCard {...sectionProps('ident')} title={activeCadence === 'weekly' ? 'Client & week' : 'Client & month'}
        doneLabel={form.clientId && periodFilled
          ? `${state.clients.find(c => c.id === form.clientId)?.name} · ${periodDone}`
          : 'Required'}>
        <Field label="Client" required error={errors.clientId} theme={theme}>
          <Select
            value={form.clientId}
            onChange={(v) => updateForm('clientId', v)}
            options={myClients.map(c => ({
              value: c.id,
              label: `${c.name} · ${(c.loggingCadence || 'monthly')}`,
            }))}
            theme={theme}
          />
        </Field>
        <Field label={periodLabel} required
               error={activeCadence === 'weekly' ? errors.weekStart : errors.month}
               hint={activeCadence === 'weekly' ? warnings.weekStart : warnings.month}
               theme={theme}>
          {activeCadence === 'weekly'
            ? <Input type="date" value={form.weekStart} onChange={(v) => updateForm('weekStart', v)} theme={theme}/>
            : <Input type="month" value={form.month?.slice(0,7)} onChange={(v) => updateForm('month', v + '-01')} theme={theme}/>}
        </Field>
        <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 12,
                      background: theme.bgSoft || 'rgba(255,255,255,0.04)',
                      border: `1px solid ${theme.rule}` }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: theme.inkMuted, textTransform: 'uppercase' }}>Cadence</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, textTransform: 'capitalize' }}>{activeCadence}</span>
        </div>
      </SectionCard>

      <SectionCard {...sectionProps('money')} title="Revenue & spend"
        doneLabel={sectionDone.money ? `Gross ${CABT_fmtMoney(form.totalRevenue)} · Ad ${CABT_fmtMoney(form.adSpend)}` : 'Tap to fill'}>
        <Field label={activeCadence === 'weekly' ? 'Gross revenue this week' : 'Gross revenue this month'}
               hint="Optional — leave blank if you haven't reconciled this period's revenue yet. MRR auto-computes from the trailing-3 months of revenue."
               error={errors.totalRevenue} theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.totalRevenue} onChange={(v) => updateForm('totalRevenue', v)} theme={theme} />
        </Field>
        {/* TKT — Bobby 2026-05-07. Live preview of the computed MRR so the CA
            can see where the trailing-3 average lands as they type. Only
            renders once a gross value is entered. */}
        {form.totalRevenue !== '' && form.totalRevenue != null && (() => {
          const periodForPreview = activeCadence === 'weekly'
            ? form.weekStart
            : (form.month ? CABT_firstOfMonth(form.month) : '');
          if (!form.clientId || !periodForPreview) return null;
          const previewMRR = computeRollingMRR(
            form.clientId, periodForPreview, activeCadence,
            Number(form.totalRevenue) || 0,
            editingId
          );
          return (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', marginTop: -4,
              borderRadius: 999,
              background: theme.bgSoft || 'rgba(255,255,255,0.04)',
              border: `1px solid ${theme.rule}`,
              fontSize: 11,
            }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: theme.inkMuted, textTransform: 'uppercase' }}>MRR (auto)</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtMoney(previewMRR)}</span>
              <span style={{ fontSize: 10, color: theme.inkMuted }}>· trailing-3 avg of gross</span>
            </div>
          );
        })()}
        <Field label="Lead cost" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.leadCost} onChange={(v) => updateForm('leadCost', v)} theme={theme} />
        </Field>
        <Field label="Ad spend" theme={theme}>
          <Input type="number" inputmode="decimal" prefix="$" value={form.adSpend} onChange={(v) => updateForm('adSpend', v)} theme={theme} />
        </Field>
      </SectionCard>

      <SectionCard {...sectionProps('funnel')} title="Funnel counts"
        doneLabel={sectionDone.funnel ? `${form.leadsGenerated} → ${form.apptsBooked} → ${form.leadsShowed} → ${form.leadsSigned}` : 'Tap to fill'}>
        <Field label="Leads generated" hint={warnings.leadsGenerated} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.leadsGenerated} onChange={(v) => updateForm('leadsGenerated', v)} theme={theme} />
        </Field>
        <Field label="Appts booked" hint={warnings.apptsBooked} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.apptsBooked} onChange={(v) => updateForm('apptsBooked', v)} theme={theme} />
        </Field>
        <Field label="Leads showed" hint={warnings.leadsShowed} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.leadsShowed} onChange={(v) => updateForm('leadsShowed', v)} theme={theme} />
        </Field>
        <Field label="Leads signed" hint={warnings.leadsSigned} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.leadsSigned} onChange={(v) => updateForm('leadsSigned', v)} theme={theme} />
        </Field>
      </SectionCard>

      <SectionCard {...sectionProps('attrition')} title="Attrition"
        doneLabel={sectionDone.attrition ? `${form.studentsCancelled} of ${form.totalStudentsStart} cancelled` : 'Tap to fill'}>
        <Field label="Total Students (Start)" hint={activeCadence === 'weekly' ? 'Student count at start of this week. Used as attrition denominator.' : 'Total student count at start of the month. Used as attrition denominator.'} theme={theme}>
          <Input type="number" inputmode="numeric" value={form.totalStudentsStart} onChange={(v) => updateForm('totalStudentsStart', v)} theme={theme} />
        </Field>
        <Field label="Students cancelled" theme={theme}>
          <Input type="number" inputmode="numeric" value={form.studentsCancelled} onChange={(v) => updateForm('studentsCancelled', v)} theme={theme} />
        </Field>
      </SectionCard>

      {/* TKT-12.2 — required active-status check. Default checked. Unchecking
          flips flagged_inactive on the row → retention contribution drops to
          0 for the quarter (even if cancel_date is null) and admins are
          notified. */}
      <SectionCard {...sectionProps('active')} title="Account status"
        doneLabel={form.stillActive === false ? 'Marked inactive · admin will be notified' : 'Active'}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.stillActive !== false}
            onChange={(e) => updateForm('stillActive', e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: theme.accent }}
          />
          <span style={{ fontSize: 14, color: theme.ink, lineHeight: 1.4 }}>
            <strong>This account is still active and receiving service this period.</strong>
          </span>
        </label>
        {form.stillActive === false && (
          <div style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255, 178, 56, 0.12)', border: '1px solid rgba(255, 178, 56, 0.35)',
            fontSize: 12, color: theme.inkSoft, lineHeight: 1.45,
          }}>
            Marking this period inactive will lower your Retention score for this client until they're either re-confirmed active or formally cancelled. Admin will be notified.
          </div>
        )}
      </SectionCard>

      <SectionCard {...sectionProps('notes')} title="Notes (optional)"
        doneLabel={form.notes ? form.notes.slice(0, 50) + (form.notes.length > 50 ? '…' : '') : 'No notes'}>
        <textarea
          value={form.notes}
          onChange={(e) => updateForm('notes', e.target.value)}
          placeholder="Anything worth flagging…"
          rows={4}
          style={{
            width: '100%', resize: 'vertical', minHeight: 80,
            background: theme.bgElev, border: `1px solid ${theme.rule}`,
            borderRadius: theme.radius - 4, padding: 12, fontSize: 15,
            color: theme.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </SectionCard>

      {/* Delete this metric — only when editing an existing row.
          Admin/Owner gets a direct delete; CA gets a "submit delete request"
          that lands in Approvals. */}
      {editing && typeof onDelete === 'function' && !confirmingDelete && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: STATUS.red,
              border: `1px solid ${STATUS.red}55`,
              borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer', letterSpacing: 0.2,
            }}
          >
            Delete this {activeCadence === 'weekly' ? 'week' : 'month'}
          </button>
        </div>
      )}

      {editing && confirmingDelete && (
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          background: STATUS.red + '12',
          border: `1px solid ${STATUS.red}33`,
        }}>
          <div style={{ fontWeight: 700, color: STATUS.red, marginBottom: 6, fontSize: 14 }}>
            {isAdmin ? 'Permanently delete this metric?' : 'Submit delete request?'}
          </div>
          <div style={{ fontSize: 12, color: theme.inkSoft, lineHeight: 1.45, marginBottom: 12 }}>
            {isAdmin
              ? 'This removes the row from the database. The audit log keeps a record.'
              : 'An admin will review the request before the row is actually removed.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button theme={theme} variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={() => onDelete(editingId, activeCadence)}
              style={{
                flex: 1, minHeight: 40,
                padding: '10px 16px',
                background: STATUS.red, color: '#fff',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer', letterSpacing: 0.2,
              }}
            >
              {isAdmin ? 'Permanently delete' : 'Submit delete request'}
            </button>
          </div>
        </div>
      )}

      {/* Sticky save */}
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={handleSubmit}>
          {editing
            ? (requestMode ? 'Submit edit request' : 'Save changes')
            : (activeCadence === 'weekly' ? 'Save weekly metrics' : 'Save monthly metrics')}
        </Button>
      </StickyBar>
    </FormShell>
  );
}

function StickyBar({ theme, children }) {
  // Sticky to viewport bottom while scrolling. Honors safe-area on iOS PWA
  // and respects the form's max-width so the buttons don't stretch full-bleed
  // on desktop. position: sticky keeps it inside the form layout (no overlap
  // with the floating bottom nav, which is z-index 100 + position: fixed).
  return (
    <div style={{
      position: 'sticky',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      marginTop: 12,
      padding: '12px 0 4px',
      background: `linear-gradient(to top, ${theme.bg} 75%, ${theme.bg}E0 90%, transparent)`,
      display: 'flex', gap: 10,
      zIndex: 5,
    }}>{children}</div>
  );
}

// Form container — caps width on desktop so labels + inputs stay grouped
// instead of stretching across a 1900px monitor. Mobile fills available width.
function FormShell({ theme, children, gap = 14 }) {
  return (
    <div style={{
      padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 100px)',
      maxWidth: 640, margin: '0 auto',
      display: 'flex', flexDirection: 'column', gap,
    }}>
      {children}
    </div>
  );
}

// ── Log Growth Event ───────────────────────────────────────────────────────
function LogEventForm({ state, ca, theme, presetClientId, navigate, onSubmit, editingId, isAdmin }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const editing = editingId ? (state.growthEvents || []).find(e => e.id === editingId) : null;
  const [form, setForm] = React.useState(editing ? {
    date: editing.date,
    clientId: editing.clientId,
    eventType: editing.eventType,
    saleTotal: editing.saleTotal != null ? String(editing.saleTotal) : '',
    costToUs:  editing.costToUs  != null ? String(editing.costToUs)  : '',
    notes:     editing.notes || '',
  } : {
    date: CABT_todayIso(),
    clientId: presetClientId || '',
    eventType: '',
    saleTotal: '',
    costToUs: '',
    notes: '',
  });
  const [errors, setErrors] = React.useState({});
  const types = ['Review','Testimonial','Case Study','Membership Add-on','Gear Sale','Referral 1+','VIP Upgrade'];
  const showSale = form.eventType === 'Gear Sale';

  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Required';
    if (!form.clientId) e.clientId = 'Required';
    if (!form.eventType) e.eventType = 'Required';
    if (new Date(form.date) > new Date()) e.date = 'Cannot be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const submit = () => {
    if (!validate()) return;
    onSubmit({
      id: editingId || `GE-${Date.now()}`,
      date: form.date,
      clientId: form.clientId,
      eventType: form.eventType,
      saleTotal: showSale ? Number(form.saleTotal || 0) : 0,
      costToUs: showSale ? Number(form.costToUs || 0) : 0,
      notes: form.notes,
      // Write ca_id (not logged_by): the growth_events RLS insert policy
      // requires ca_id = caller_ca_id(), same as monthly_metrics / surveys.
      // Logging the CA under logged_by left ca_id null, so every CA insert
      // was rejected by row-level security (Kurt 2026-06-22).
      caId: ca.id,
    }, !!editing);
  };
  const requestMode = !!editing && !isAdmin;
  return (
    <FormShell theme={theme}>
      {requestMode && (
        <div style={{
          fontSize: 13, lineHeight: 1.45, color: theme.ink,
          padding: '10px 12px', borderRadius: 8, marginBottom: 4,
          background: 'rgba(255, 178, 56, 0.12)',
          border: '1px solid rgba(255, 178, 56, 0.35)',
        }}>
          <strong>Request edit.</strong> Your existing entry stays in place until an admin reviews this request.
        </div>
      )}
      <Field label="Event date" required error={errors.date} theme={theme}>
        <Input type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} theme={theme}/>
      </Field>
      <Field label="Client" required error={errors.clientId} theme={theme}>
        <Select value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })}
                options={myClients.map(c => ({ value: c.id, label: c.name }))} theme={theme} />
      </Field>
      <Field label="Event type" required error={errors.eventType} theme={theme}>
        <Select value={form.eventType} onChange={(v) => setForm({ ...form, eventType: v })} options={types} theme={theme} />
      </Field>
      {showSale && (
        <>
          <Field label="Sale total" theme={theme}>
            <Input type="number" inputmode="decimal" prefix="$" value={form.saleTotal} onChange={(v) => setForm({ ...form, saleTotal: v })} theme={theme} />
          </Field>
          <Field label="Cost to us" theme={theme}>
            <Input type="number" inputmode="decimal" prefix="$" value={form.costToUs} onChange={(v) => setForm({ ...form, costToUs: v })} theme={theme} />
          </Field>
        </>
      )}
      <Field label="Notes" theme={theme}>
        <Textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={3} theme={theme}/>
      </Field>
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>
          {editing ? (requestMode ? 'Submit edit request' : 'Save changes') : 'Save event'}
        </Button>
      </StickyBar>
    </FormShell>
  );
}

// ── Log Survey Response ────────────────────────────────────────────────────
function LogSurveyForm({ state, ca, theme, presetClientId, navigate, onSubmit, editingId, isAdmin }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const editing = editingId ? (state.surveys || []).find(s => s.id === editingId) : null;
  const [form, setForm] = React.useState(editing ? {
    date: editing.date,
    clientId: editing.clientId,
    overall: editing.overall || 0,
    responsiveness: editing.responsiveness || 0,
    followThrough: editing.followThrough || 0,
    communication: editing.communication || 0,
    anonymous: !!editing.anonymous,
    comment: editing.comment || '',
  } : {
    date: CABT_todayIso(),
    clientId: presetClientId || '',
    overall: 0,
    responsiveness: 0,
    followThrough: 0,
    communication: 0,
    anonymous: false,
    comment: '',
  });
  const [errors, setErrors] = React.useState({});
  const validate = () => {
    const e = {};
    if (!form.date) e.date = 'Required';
    if (!form.clientId) e.clientId = 'Required';
    ['overall', 'responsiveness', 'followThrough', 'communication'].forEach(k => {
      if (!form[k]) e[k] = 'Required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const submit = () => {
    if (!validate()) return;
    onSubmit({ id: editingId || `SR-${Date.now()}`, ...form, submittedBy: ca.id }, !!editing);
  };
  const requestMode = !!editing && !isAdmin;
  return (
    <FormShell theme={theme}>
      {requestMode && (
        <div style={{
          fontSize: 13, lineHeight: 1.45, color: theme.ink,
          padding: '10px 12px', borderRadius: 8, marginBottom: 4,
          background: 'rgba(255, 178, 56, 0.12)',
          border: '1px solid rgba(255, 178, 56, 0.35)',
        }}>
          <strong>Request edit.</strong> Your existing entry stays in place until an admin reviews this request.
        </div>
      )}
      <Field label="Date" required theme={theme}>
        <Input type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} theme={theme}/>
      </Field>
      <Field label="Client" required error={errors.clientId} theme={theme}>
        <Select value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })}
                options={myClients.map(c => ({ value: c.id, label: c.name }))} theme={theme} />
      </Field>
      {[
        ['overall', 'Overall rating'],
        ['responsiveness', 'Responsiveness'],
        ['followThrough', 'Follow-through'],
        ['communication', 'Communication'],
      ].map(([k, label]) => (
        <Field key={k} label={label} required error={errors[k]} theme={theme}>
          <StarRating value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} theme={theme} />
        </Field>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>Anonymous?</div>
          <div style={{ fontSize: 12, color: theme.inkMuted }}>Hide submitter from leadership view</div>
        </div>
        <Toggle value={form.anonymous} onChange={(v) => setForm({ ...form, anonymous: v })} theme={theme} />
      </div>
      <Field label="Comment" theme={theme}>
        <Textarea value={form.comment} onChange={(v) => setForm({ ...form, comment: v })} rows={3} theme={theme}/>
      </Field>
      <Field label="Submitted by" theme={theme}>
        <Input value={ca.name} onChange={() => {}} theme={theme} />
      </Field>
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={submit}>
          {editing ? (requestMode ? 'Submit edit request' : 'Save changes') : 'Save survey'}
        </Button>
      </StickyBar>
    </FormShell>
  );
}

// ── Smart-card form for Check-in (TICKET-2) ────────────────────────────────
// Narrative-only check-in. Routes to weekly_checkins or monthly_checkins
// based on the picked client's logging_cadence. Same 4 narrative fields
// regardless of cadence.
function LogCheckinForm({ state, ca, theme, presetClientId, navigate, onSubmit }) {
  const myClients = state.clients.filter(c => c.assignedCA === ca.id && !c.cancelDate);
  const initialClient = presetClientId || (myClients[0]?.id ?? '');
  const initialClientObj = state.clients.find(c => c.id === initialClient);
  const cadence = initialClientObj?.loggingCadence || 'monthly';

  // Compute current period start: ISO Monday of the current week, or first-of-month
  const today = new Date();
  const isoMonday = (() => {
    const d = new Date(today);
    const day = d.getDay() || 7;            // Sun = 7
    if (day !== 1) d.setDate(d.getDate() - (day - 1));
    return d.toISOString().slice(0, 10);
  })();
  const firstOfMonth = today.toISOString().slice(0, 7) + '-01';

  const [form, setForm] = React.useState({
    clientId: initialClient,
    period: cadence === 'weekly' ? isoMonday : firstOfMonth,
    concern: '',
    win: '',
    accountAction: '',
    agencyAction: '',
    // TKT-12.2 — required active-status check on every check-in.
    stillActive: true,
    notes: '',
  });
  const [errors, setErrors] = React.useState({});

  const updateForm = (key, value) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // If switching client, reset period to match the new client's cadence
      if (key === 'clientId') {
        const c = state.clients.find(cl => cl.id === value);
        const newCadence = c?.loggingCadence || 'monthly';
        next.period = newCadence === 'weekly' ? isoMonday : firstOfMonth;
      }
      return next;
    });
    if (errors[key]) setErrors(e => ({ ...e, [key]: null }));
  };

  const selectedClient = state.clients.find(c => c.id === form.clientId);
  const activeCadence = selectedClient?.loggingCadence || 'monthly';

  const validate = () => {
    const e = {};
    if (!form.clientId) e.clientId = 'Required';
    if (!form.period)   e.period   = 'Required';
    // At least ONE narrative field must be filled (otherwise why log?)
    if (!form.concern && !form.win && !form.accountAction && !form.agencyAction) {
      e.body = 'Fill at least one of: concern, win, account-side, agency-side.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const idPrefix = activeCadence === 'weekly' ? 'WC' : 'MC';
    const periodKey = activeCadence === 'weekly' ? 'weekStart' : 'month';
    const row = {
      id: `${idPrefix}-${Date.now()}`,
      caId: ca.id,
      clientId: form.clientId,
      [periodKey]: form.period,
      concern: form.concern || null,
      win: form.win || null,
      accountAction: form.accountAction || null,
      agencyAction: form.agencyAction || null,
      flaggedInactive: form.stillActive === false,
      notes: form.notes || null,
    };
    onSubmit(row, activeCadence);
  };

  const periodLabel = activeCadence === 'weekly' ? 'Week starting (Mon)' : 'Month';

  return (
    <FormShell theme={theme} gap={12}>
      <div style={{ fontSize: 13, color: theme.inkSoft, padding: '0 4px' }}>
        Narrative check-in. Routes to {activeCadence === 'weekly' ? 'weekly' : 'monthly'} log based on the client's cadence.
      </div>

      <Card theme={theme} padding={14}>
        <Field label="Client" required error={errors.clientId} theme={theme}>
          <Select
            value={form.clientId}
            onChange={(v) => updateForm('clientId', v)}
            options={myClients.map(c => ({
              value: c.id,
              label: `${c.name} · ${c.loggingCadence || 'monthly'}`,
            }))}
            theme={theme}
          />
        </Field>
        <div style={{ height: 10 }}/>
        <Field label={periodLabel} required error={errors.period} theme={theme}>
          {activeCadence === 'weekly'
            ? <Input type="date" value={form.period} onChange={(v) => updateForm('period', v)} theme={theme}/>
            : <Input type="month" value={form.period?.slice(0,7)} onChange={(v) => updateForm('period', v + '-01')} theme={theme}/>
          }
        </Field>
        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 12, background: theme.bgSoft || 'rgba(255,255,255,0.04)', border: `1px solid ${theme.rule}` }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: theme.inkMuted, textTransform: 'uppercase' }}>Cadence</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, textTransform: 'capitalize' }}>{activeCadence}</span>
        </div>
      </Card>

      <Card theme={theme} padding={14}>
        <Field label="Concern" hint="Anything blocking results, churn risk, escalations" theme={theme}>
          <Textarea value={form.concern} onChange={(v) => updateForm('concern', v)} rows={3} placeholder="What's worrying you about this account?" theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Win" hint="Wins worth flagging — milestone, member feedback, growth" theme={theme}>
          <Textarea value={form.win} onChange={(v) => updateForm('win', v)} rows={3} placeholder="What went right?" theme={theme}/>
        </Field>
      </Card>

      <Card theme={theme} padding={14}>
        <Field label="Account-side action" hint="What the client owner/staff needs to do" theme={theme}>
          <Textarea value={form.accountAction} onChange={(v) => updateForm('accountAction', v)} rows={3} placeholder="What does the client need to do?" theme={theme}/>
        </Field>
        <div style={{ height: 10 }}/>
        <Field label="Agency-side action" hint="What you / the agency need to do next" theme={theme}>
          <Textarea value={form.agencyAction} onChange={(v) => updateForm('agencyAction', v)} rows={3} placeholder="What's our next move?" theme={theme}/>
        </Field>
      </Card>

      {/* TKT-12.2 — required active-status check on every check-in. Default
          checked. Unchecking flags the row as inactive → drops the client's
          retention contribution to 0 for the quarter. */}
      <Card theme={theme} padding={14}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.stillActive !== false}
            onChange={(e) => updateForm('stillActive', e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: theme.accent }}
          />
          <span style={{ fontSize: 14, color: theme.ink, lineHeight: 1.4 }}>
            <strong>This account is still active and receiving service this period.</strong>
          </span>
        </label>
        {form.stillActive === false && (
          <div style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255, 178, 56, 0.12)', border: '1px solid rgba(255, 178, 56, 0.35)',
            fontSize: 12, color: theme.inkSoft, lineHeight: 1.45,
          }}>
            Marking this period inactive will lower your Retention score for this client until they're either re-confirmed active or formally cancelled. Admin will be notified.
          </div>
        )}
      </Card>

      <Card theme={theme} padding={14}>
        <Field label="Notes (optional)" theme={theme}>
          <Textarea value={form.notes} onChange={(v) => updateForm('notes', v)} rows={2} placeholder="Anything else worth flagging…" theme={theme}/>
        </Field>
      </Card>

      {errors.body && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(220, 60, 60, 0.08)', border: `1px solid rgba(220, 60, 60, 0.3)`, color: '#dc3c3c', fontSize: 13 }}>
          {errors.body}
        </div>
      )}

      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth onClick={handleSubmit}>
          Save {activeCadence} check-in
        </Button>
      </StickyBar>
    </FormShell>
  );
}

Object.assign(window, { LogMetricsForm, LogEventForm, LogSurveyForm, LogCheckinForm, StickyBar, FormShell });
