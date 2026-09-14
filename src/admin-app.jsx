// admin-app.jsx — Admin persona screens

function AdminApprovals({ state, theme, navigate, onApprove, onReject, onAssignCA, onEditDecided }) {
  const pending = state.adjustments.filter(a => a.status === 'Pending');
  const unassigned = state.clients.filter(c => !c.assignedCA && !c.cancelDate);
  const cas = state.cas.filter(c => c.active);

  // Bobby 2026-05-11: "approvals are not showing up in my section". Edit
  // Requests (TKT-12.1) lived only on a separate page under More → Edit
  // Requests, so non-commission edits from CAs (Kurt's metric edits etc.)
  // never surfaced on the main Approvals view. Pull pending edit requests
  // in here so the Owner sees every decision-needed item in one place.
  const pendingEditRequests = (state.editRequests || []).filter(r => r.status === 'pending');
  const [editBusy, setEditBusy] = React.useState(null);
  const [editErr, setEditErr] = React.useState(null);
  const decideEditRequest = async (req, status) => {
    setEditBusy(req.id);
    setEditErr(null);
    if (CABT_getApiMode() === 'supabase') {
      try {
        if (status === 'approved') {
          await CABT_api.approveEditRequest(req.id);
        } else {
          const sb = await CABT_sb();
          await sb.from('edit_requests').update({ status: 'rejected' }).eq('id', req.id);
        }
        // Reflect the decision immediately instead of waiting for the realtime
        // push (Bobby 2026-06-22: approving felt slow). Realtime still arrives
        // and re-applies the same status idempotently.
        if (typeof onEditDecided === 'function') onEditDecided(req.id, status);
      } catch (e) {
        // Bobby 2026-05-12: silent catch hid the real failure. Surface the
        // error to the UI so the admin sees something happened instead of
        // clicking Approve and watching nothing change.
        console.error('[edit request decision]', e);
        setEditErr({ id: req.id, message: e?.message || String(e) });
      }
    } else if (typeof onEditDecided === 'function') {
      onEditDecided(req.id, status);
    }
    setEditBusy(null);
  };

  // Diagnostics
  const missingMonth = state.monthlyMetrics.filter(m => !m.month).length;
  const noRetainer = state.clients.filter(c => c.signDate && !c.monthlyRetainer).length;
  const eventsNoAmount = state.growthEvents.filter(e => e.eventType === 'Gear Sale' && !e.saleTotal).length;

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Pending edit requests — Bobby 2026-05-11 visibility fix. */}
      <div>
        <SectionLabel theme={theme}>
          <span>Edit requests · {pendingEditRequests.length}</span>
        </SectionLabel>
        {pendingEditRequests.length === 0 && (
          <Card theme={theme}>
            <div style={{ color: theme.inkMuted, fontSize: 13 }}>No pending edit requests.</div>
          </Card>
        )}
        {pendingEditRequests.length > 0 && typeof window.EditReqCard === 'function' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {editErr && (
              <div style={{
                background: STATUS.red + '15', color: STATUS.red,
                border: `1px solid ${STATUS.red}33`,
                borderRadius: theme.radius - 6 || 8, padding: '10px 14px',
                fontSize: 13, lineHeight: 1.45,
              }}>
                <strong>Approve/Reject failed.</strong> {editErr.message}
              </div>
            )}
            {pendingEditRequests.map(r => (
              <window.EditReqCard
                key={r.id}
                req={r}
                theme={theme}
                state={state}
                onApprove={() => decideEditRequest(r, 'approved')}
                onReject={() => decideEditRequest(r, 'rejected')}
                busy={editBusy === r.id}
              />
            ))}
            {typeof navigate === 'function' && (
              <button
                onClick={() => navigate('edits')}
                style={{
                  alignSelf: 'flex-start', padding: '6px 12px', height: 32,
                  background: 'transparent', color: theme.inkSoft,
                  border: `1px solid ${theme.rule}`, borderRadius: 8,
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Open full Edit Requests queue →
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <SectionLabel theme={theme}>
          <span>Adjustments · {pending.length}</span>
        </SectionLabel>
        {pending.length === 0 && <Card theme={theme}><div style={{ color: theme.inkMuted, fontSize: 13 }}>No pending adjustments.</div></Card>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map(a => {
            const r = state.sales.find(s => s.id === a.repId);
            return (
              <Card theme={theme} key={a.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink }}>{r?.name} · {a.type}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtMoney(a.amount)}</div>
                </div>
                <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 8 }}>
                  {CABT_fmtDate(a.date)} · {a.period} · {a.role}
                </div>
                <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 12, lineHeight: 1.4 }}>{a.reason}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button theme={theme} variant="secondary" size="sm" onClick={() => onReject(a.id)}>Reject</Button>
                  <Button theme={theme} variant="primary" size="sm" fullWidth onClick={() => onApprove(a.id)}>Approve</Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <SectionLabel theme={theme}>Unassigned clients · {unassigned.length}</SectionLabel>
        {unassigned.length === 0 && <Card theme={theme}><div style={{ color: theme.inkMuted, fontSize: 13 }}>All clients assigned.</div></Card>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unassigned.map(c => (
            <Card theme={theme} key={c.id} padding={14}>
              <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, marginBottom: 4 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 10 }}>
                Signed {CABT_fmtDate(c.signDate)} · {CABT_fmtMoney(c.monthlyRetainer)}/mo
              </div>
              <Field label="Assign CA" theme={theme}>
                <Select value="" onChange={(v) => onAssignCA(c.id, v)}
                        options={cas.map(ca => ({ value: ca.id, label: `${ca.id} · ${ca.name}` }))} theme={theme}/>
              </Field>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel theme={theme}>Diagnostics</SectionLabel>
        <Card theme={theme} padding={0}>
          <DiagRow theme={theme} label="Monthly metrics missing month" value={missingMonth} status={missingMonth ? 'red' : 'green'}/>
          <DiagRow theme={theme} label="Clients with sign date but no retainer" value={noRetainer} status={noRetainer ? 'yellow' : 'green'}/>
          <DiagRow theme={theme} label="Gear Sale events without amount" value={eventsNoAmount} status={eventsNoAmount ? 'yellow' : 'green'} last/>
        </Card>
      </div>
    </div>
  );
}

function DiagRow({ theme, label, value, status, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: last ? 'none' : `1px solid ${theme.rule}`, gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: STATUS[status] }}/>
      <span style={{ flex: 1, fontSize: 14, color: theme.ink }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: theme.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function AdminConfig({ state, theme, onUpdate }) {
  const cfg = state.config;
  const [local, setLocal] = React.useState(cfg);
  const update = (k, v) => setLocal(l => ({ ...l, [k]: v }));
  const save = () => onUpdate(local);
  return (
    <div style={{ padding: '8px 16px 120px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner tone="info" icon="alert" theme={theme}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Formula Configurator — every scoring threshold, in one place.</div>
        <div style={{ fontSize: 12, color: theme.inkSoft, lineHeight: 1.5 }}>
          Every threshold below feeds the scoring engine for Performance / Retention / Growth buckets. Change any value, tap <strong>Save config</strong>, and the new threshold takes effect across all open sessions within ~1 second (no reload needed). Cross-check your changes against the legacy CA Bonus Tracker Sheet anytime via <strong>More → Formula Inspector</strong>.
        </div>
      </Banner>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Grace & quarter</SectionLabel>
        <Field label="Grace period (days)" theme={theme}><Input type="number" value={local.gracePeriodDays} onChange={(v) => update('gracePeriodDays', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Quarter start" theme={theme}><Input type="date" value={local.quarterStart} onChange={(v) => update('quarterStart', v)} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Quarter end" theme={theme}><Input type="date" value={local.quarterEnd} onChange={(v) => update('quarterEnd', v)} theme={theme}/></Field>
      </Card>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Ad spend targets</SectionLabel>
        <Field label="Ad spend floor" theme={theme}><Input type="number" prefix="$" value={local.adSpendFloor} onChange={(v) => update('adSpendFloor', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="% of gross" theme={theme}><Input type="number" suffix="×" value={local.adSpendPctOfGross} onChange={(v) => update('adSpendPctOfGross', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Over-delivery cap" theme={theme}><Input type="number" suffix="×" value={local.adSpendOverDeliveryCap} onChange={(v) => update('adSpendOverDeliveryCap', Number(v))} theme={theme}/></Field>
      </Card>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Funnel floors</SectionLabel>
        <Field label="Booking floor" theme={theme}><Input type="number" suffix="×" value={local.bookingFloor} onChange={(v) => update('bookingFloor', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Show floor" theme={theme}><Input type="number" suffix="×" value={local.showFloor} onChange={(v) => update('showFloor', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Close floor" theme={theme}><Input type="number" suffix="×" value={local.closeFloor} onChange={(v) => update('closeFloor', Number(v))} theme={theme}/></Field>
      </Card>
      <Card theme={theme}>
        <SectionLabel theme={theme}>Attrition & satisfaction</SectionLabel>
        <Field label="Green attrition floor" hint="Cancel rate at or below this scores 1.0. Spec default: 0.03 (3%)." theme={theme}><Input type="number" suffix="×" value={local.attritionGreenFloor} onChange={(v) => update('attritionGreenFloor', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Critical attrition ceiling" hint="Cancel rate at or above this scores 0. Spec default: 0.05 (5%)." theme={theme}><Input type="number" suffix="×" value={local.attritionCriticalCeiling} onChange={(v) => update('attritionCriticalCeiling', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Satisfaction lookback (months)" hint="Spec default: 6" theme={theme}><Input type="number" value={local.satisfactionLookbackMonths} onChange={(v) => update('satisfactionLookbackMonths', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="No-response penalty" hint="Default satisfaction when no surveys logged. Spec default: 0.7" theme={theme}><Input type="number" suffix="×" value={local.noResponsePenalty} onChange={(v) => update('noResponsePenalty', Number(v))} theme={theme}/></Field>
      </Card>

      <Card theme={theme}>
        <SectionLabel theme={theme}>MRR Growth & Lead Cost (Phase 10)</SectionLabel>
        <Field label="MRR Growth full credit ($/mo)" hint="Quarter-over-quarter MRR delta hitting this earns 1.0 score. Spec default: 750." theme={theme}><Input type="number" prefix="$" value={local.fullCreditMrrGrowth} onChange={(v) => update('fullCreditMrrGrowth', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Lead Cost — best ($)" hint="≤ this scores 1.0. Spec: 5" theme={theme}><Input type="number" prefix="$" value={local.leadCostBest} onChange={(v) => update('leadCostBest', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Lead Cost — great ($)" hint="≤ this scores 0.75. Spec: 10" theme={theme}><Input type="number" prefix="$" value={local.leadCostGreat} onChange={(v) => update('leadCostGreat', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Lead Cost — acceptable ($)" hint="≤ this scores 0.50. Above scores 0. Spec: 20" theme={theme}><Input type="number" prefix="$" value={local.leadCostAcceptable} onChange={(v) => update('leadCostAcceptable', Number(v))} theme={theme}/></Field>
      </Card>

      <Card theme={theme}>
        <SectionLabel theme={theme}>Retention & bonus pot (Phase 10)</SectionLabel>
        <Field label="Retention cliff" hint="Retention rate below this scores 0; linear from cliff to 1.0 retained. Spec default: 0.97." theme={theme}><Input type="number" suffix="×" value={local.retentionCliff} onChange={(v) => update('retentionCliff', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Pot percentage (default)" hint="Used when no quarter_inputs row is set. Spec default: 0.005 (0.5%)." theme={theme}><Input type="number" suffix="×" value={local.potPercentage} onChange={(v) => update('potPercentage', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Agency gross last month (default)" hint="Used as fallback when no quarter_inputs row. Set per-quarter via Admin → Bonus." theme={theme}><Input type="number" prefix="$" value={local.agencyGrossLastMonth} onChange={(v) => update('agencyGrossLastMonth', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="Ad spend max score cap" hint="Over-target ad spend earns up to this multiplier. Spec default: 2.0" theme={theme}><Input type="number" suffix="×" value={local.adSpendMaxScoreCap} onChange={(v) => update('adSpendMaxScoreCap', Number(v))} theme={theme}/></Field>
      </Card>

      <Card theme={theme}>
        <SectionLabel theme={theme}>Commission rates</SectionLabel>
        <Field label="Membership revenue rate" theme={theme}><Input type="number" suffix="×" value={local.membershipRevenueRate} onChange={(v) => update('membershipRevenueRate', Number(v))} theme={theme}/></Field>
        <div style={{ height: 10 }}/>
        <Field label="SDR flat fee per booking" theme={theme}><Input type="number" prefix="$" value={local.sdrFlatFeePerBooking} onChange={(v) => update('sdrFlatFeePerBooking', Number(v))} theme={theme}/></Field>
      </Card>
      <StickyBar theme={theme}>
        <Button theme={theme} variant="primary" fullWidth onClick={save}>Save config</Button>
      </StickyBar>
    </div>
  );
}

function AdminRoster({ state, theme, onReload, onToast }) {
  const [showInvite, setShowInvite] = React.useState(false);
  // F1.1.2 — selected employee for the detail modal. Shape: { kind: 'ca'|'sales', row }
  const [editing, setEditing] = React.useState(null);
  const callerRole = state.me?.role;
  const canEdit = callerRole === 'owner' || callerRole === 'admin'; // integrator can't edit/invite/reset
  const openCa    = (row) => setEditing({ kind: 'ca',    row });
  const openSales = (row) => setEditing({ kind: 'sales', row });
  const closeEdit = () => setEditing(null);
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button theme={theme} variant="primary" size="sm" icon="plus" onClick={() => setShowInvite(true)}>
            Invite
          </Button>
        </div>
      )}
      {showInvite && (
        <InviteTeammateModal
          theme={theme}
          state={state}
          onClose={() => setShowInvite(false)}
          onSuccess={(msg) => {
            setShowInvite(false);
            if (typeof onToast === 'function') onToast(msg || 'Invited ✓');
            if (typeof onReload === 'function') onReload();
          }}
        />
      )}
      {editing && (
        <EmployeeDetailModal
          theme={theme}
          kind={editing.kind}
          row={editing.row}
          callerRole={callerRole}
          callerId={state.me?.id}
          onClose={closeEdit}
          onSuccess={(msg) => {
            closeEdit();
            if (typeof onToast === 'function') onToast(msg || 'Saved ✓');
            if (typeof onReload === 'function') onReload();
          }}
        />
      )}
      <div>
        <SectionLabel theme={theme}>Client Associates · {state.cas.length}</SectionLabel>
        <Card theme={theme} padding={0}>
          {state.cas.map((c, i) => (
            <RosterRow
              key={c.id}
              theme={theme}
              row={c}
              accent={theme.accent}
              subline={c.email}
              showActiveChip
              isLast={i === state.cas.length - 1}
              onTap={canEdit ? () => openCa(c) : null}
            />
          ))}
        </Card>
      </div>
      <div>
        <SectionLabel theme={theme}>Sales Team · {state.sales.length}</SectionLabel>
        <Card theme={theme} padding={0}>
          {state.sales.map((s, i) => (
            <RosterRow
              key={s.id}
              theme={theme}
              row={s}
              accent={theme.gold}
              subline={`${s.role} · since ${CABT_fmtDate(s.startDate)}`}
              showActiveChip={false}
              isLast={i === state.sales.length - 1}
              onTap={canEdit ? () => openSales(s) : null}
            />
          ))}
        </Card>
      </div>
    </div>
  );
}

function RosterRow({ theme, row, accent, subline, showActiveChip, isLast, onTap }) {
  const initials = (row.name || '').split(' ').map(n => n[0]).filter(Boolean).join('') || '?';
  const tappable = !!onTap;
  return (
    <div
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={tappable ? onTap : undefined}
      onKeyDown={tappable ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }) : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        borderBottom: isLast ? 'none' : `1px solid ${theme.rule}`,
        cursor: tappable ? 'pointer' : 'default',
        background: 'transparent',
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 18, background: accent + '22', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{row.id} · {row.name}</div>
        <div style={{ fontSize: 12, color: theme.inkMuted }}>{subline}</div>
      </div>
      {showActiveChip && (
        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: row.active ? STATUS.green + '22' : theme.rule, color: row.active ? '#2E7D32' : theme.inkMuted, fontWeight: 600 }}>
          {row.active ? 'Active' : 'Inactive'}
        </span>
      )}
      {tappable && (
        <span aria-hidden="true" style={{ color: theme.inkMuted, fontSize: 18, fontWeight: 600, marginLeft: 4 }}>›</span>
      )}
    </div>
  );
}

// ── F1.1.1 — Invite Teammate modal ──────────────────────────────────────────
const INVITE_ERROR_COPY = {
  forbidden: 'You don\'t have permission to invite teammates.',
  bad_email: 'That doesn\'t look like a valid email.',
  missing_display_name: 'Display name is required.',
  bad_role: 'Pick a role.',
  weak_password: 'Password must be at least 8 characters.',
  ca_id_required: 'CA id is required for the Client Associate role.',
  sales_role_required: 'Pick AM or RDR for sales hires.',
  sales_id_required: 'Sales id (e.g. AM-02) is required.',
  create_user_failed: 'Could not create the auth user — email may already exist.',
  profile_insert_failed: 'Could not create the profile row.',
  ca_insert_failed: 'Could not create the CA roster row — id may be taken.',
  sales_insert_failed: 'Could not create the sales-team row — id may be taken.',
  not_signed_in: 'Your session expired. Sign in again.',
  invalid_token: 'Your session expired. Sign in again.',
};

// Compute next sequential id like 'CA-03' / 'AM-04' / 'RDR-01'.
// Strategy: max numeric suffix + 1 (avoids reusing IDs even if rows were deleted).
function CABT_nextSeqId(prefix, existingIds) {
  let max = 0;
  const re = new RegExp('^' + prefix + '-(\\d+)$');
  for (const id of existingIds || []) {
    const m = re.exec(String(id || ''));
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return prefix + '-' + String(max + 1).padStart(2, '0');
}

function InviteTeammateModal({ theme, state, onClose, onSuccess }) {
  // formRole is the UI selection; we map AM/RDR back to role='sales' at submit.
  const [formRole, setFormRole] = React.useState('ca');
  const [email, setEmail] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState(null);

  // Auto-assigned id, computed from existing roster — recomputed on role change.
  const autoId = React.useMemo(() => {
    if (formRole === 'ca')  return CABT_nextSeqId('CA',  (state?.cas   || []).map(c => c.id));
    if (formRole === 'am')  return CABT_nextSeqId('AM',  (state?.sales || []).filter(s => s.role === 'AM' ).map(s => s.id));
    if (formRole === 'rdr') return CABT_nextSeqId('RDR', (state?.sales || []).filter(s => s.role === 'RDR').map(s => s.id));
    return null; // owner/admin/integrator have no roster id
  }, [formRole, state]);

  // Owner is intentionally not in this list — there's only one Owner (Bobby)
  // and it's never created via the Invite flow. Admin is selectable for FIs
  // who should have full-privilege access.
  const ROLE_OPTIONS = [
    { value: 'admin',      label: 'Admin' },
    { value: 'integrator', label: 'Fractional Integrator' },
    { value: 'ca',         label: 'Client Associate' },
    { value: 'am',         label: 'Account Manager' },
    { value: 'rdr',        label: 'Relationship Development Rep' },
  ];

  // Translate UI role → DB role + salesRole
  const dbRoleFor = (fr) => {
    if (fr === 'am' || fr === 'rdr') return 'sales';
    return fr;
  };
  const dbSalesRoleFor = (fr) => {
    if (fr === 'am')  return 'AM';
    if (fr === 'rdr') return 'RDR';
    return null;
  };

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrMsg(null);
    if (!email.trim()) return setErrMsg('Email is required.');
    if (!displayName.trim()) return setErrMsg('Display name is required.');
    if (!password || password.length < 8) return setErrMsg('Password must be at least 8 characters.');
    setSubmitting(true);
    try {
      await CABT_inviteUser({
        email: email.trim(),
        displayName: displayName.trim(),
        role: dbRoleFor(formRole),
        password,
        caId:      formRole === 'ca'                       ? autoId : null,
        salesRole: dbSalesRoleFor(formRole),
        salesId:   (formRole === 'am' || formRole === 'rdr') ? autoId : null,
      });
      onSuccess('Invited ' + email.trim());
    } catch (err) {
      const code = err && err.message;
      setErrMsg(INVITE_ERROR_COPY[code] || (err.detail ? `${code}: ${err.detail}` : code) || 'Invite failed.');
      setSubmitting(false);
    }
  };

  // On desktop (vw>=1024) the modal centers and becomes a card; on mobile
  // it slides up as a bottom sheet. Both follow the same content layout.
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(8, 12, 24, 0.55)',
        zIndex: 1000, display: 'flex',
        alignItems: isDesktop ? 'center' : 'flex-end',
        justifyContent: 'center',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        animation: 'scrimIn 0.18s ease',
        padding: isDesktop ? '32px' : 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
        style={{
          background: theme.bg, width: '100%',
          maxWidth: isDesktop ? 680 : 520,
          maxHeight: isDesktop ? 'calc(92vh - 64px)' : 'calc(92vh - env(safe-area-inset-bottom, 0px))',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          borderBottomLeftRadius: isDesktop ? 24 : 0,
          borderBottomRightRadius: isDesktop ? 24 : 0,
          padding: isDesktop
            ? '20px 24px 24px'
            : '14px 18px calc(env(safe-area-inset-bottom, 0px) + 24px)',
          overflowY: 'auto',
          boxShadow: isDesktop
            ? '0 24px 60px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.14)'
            : '0 -12px 40px rgba(0,0,0,0.32), 0 -2px 8px rgba(0,0,0,0.12)',
          animation: isDesktop
            ? 'modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
            : 'sheetIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Drag-handle indicator (iOS sheet style) — mobile only */}
        {!isDesktop && (
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: theme.rule,
            margin: '0 auto 14px',
          }}/>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div id="invite-modal-title" style={{
            fontFamily: theme.serif || 'inherit',
            fontSize: isDesktop ? 26 : 22, fontWeight: 600, color: theme.ink, letterSpacing: -0.3,
          }}>Invite teammate</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cabt-btn-press"
            style={{
              width: 36, height: 36, borderRadius: 18,
              border: 'none', background: theme.bgElev, color: theme.inkSoft,
              fontSize: 20, cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}
          >×</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Email" required theme={theme}>
            <Input value={email} onChange={setEmail} type="email" placeholder="person@example.com" theme={theme} autoFocus/>
          </Field>
          <Field label="Display name" required theme={theme}>
            <Input value={displayName} onChange={setDisplayName} placeholder="Full name" theme={theme}/>
          </Field>
          <Field label="Role" required theme={theme}>
            <Select value={formRole} onChange={setFormRole} options={ROLE_OPTIONS} theme={theme}/>
          </Field>

          {autoId && (
            <Field label="Assigned ID" hint="Auto-assigned, next in sequence." theme={theme}>
              <div style={{
                display: 'flex', alignItems: 'center', height: 48,
                background: theme.accent + '12', border: `1px solid ${theme.accent}33`,
                borderRadius: 12, padding: '0 14px',
                color: theme.ink, fontSize: 16, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums', letterSpacing: 0.3,
              }}>
                {autoId}
              </div>
            </Field>
          )}

          <Field label="Initial password" required hint="Min 8 chars. Teammate can change later." theme={theme}>
            <Input value={password} onChange={setPassword} type="password" placeholder="••••••••" theme={theme}/>
          </Field>

          {errMsg && (
            <div style={{
              background: STATUS.red + '15', color: STATUS.red, border: `1px solid ${STATUS.red}33`,
              borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.45,
              display: 'flex', alignItems: 'flex-start', gap: 8,
              animation: 'modalIn 0.2s ease',
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
              <span>{errMsg}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button theme={theme} variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button theme={theme} variant="primary" fullWidth type="submit" disabled={submitting} loading={submitting} onClick={submit}>
              {submitting ? 'Inviting…' : 'Send invite'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── F1.1.2 — Employee Detail / Edit / Reset Password modal ──────────────────
const EDIT_ERROR_COPY = {
  forbidden: 'You don\'t have permission to edit teammates.',
  not_signed_in: 'Your session expired. Sign in again.',
  invalid_token: 'Your session expired. Sign in again.',
  user_id_required: 'Could not identify the teammate.',
  target_not_found: 'Teammate record not found.',
  bad_action: 'Internal error: bad action.',
  bad_role: 'Pick a valid role.',
  bad_sales_role: 'Sales sub-role must be AM or RDR.',
  missing_display_name: 'Display name is required.',
  missing_email: 'Email is required.',
  bad_email: 'Enter a valid email address.',
  domain_not_allowed: 'Email must be @groundstandard.com.',
  email_in_use: 'That email is already used by another teammate.',
  email_update_failed: 'Could not update the email.',
  weak_password: 'Password must be at least 8 characters.',
  no_changes: 'Nothing to save — no fields changed.',
  self_role_change_blocked: 'You can\'t change your own role.',
  self_active_change_blocked: 'You can\'t deactivate yourself.',
  cross_role_promote_unsupported: 'Promoting to CA or Sales here isn\'t supported. Use Invite Teammate instead.',
  profile_update_failed: 'Could not update profile.',
  ca_roster_update_failed: 'Could not update CA roster row.',
  sales_roster_update_failed: 'Could not update Sales roster row.',
  password_reset_failed: 'Could not reset the password.',
  // TKT-12.9 — hard-delete error copy
  owner_only: 'Only the owner can hard-delete a teammate.',
  self_delete_blocked: 'You can\'t delete your own account.',
  ca_delete_blocked: 'This CA still has assigned clients or metrics. Reassign those before hard-deleting.',
  sales_delete_blocked: 'This rep still has linked contracts or adjustments. Reassign those before hard-deleting.',
  auth_delete_failed: 'Could not remove the auth account.',
  // Bobby 2026-05-11 follow-up — roster-only delete (no auth account linked)
  roster_id_required: 'Couldn\'t identify the roster entry.',
  bad_roster_kind: 'Internal: bad roster kind.',
  roster_not_found: 'Roster entry not found.',
  roster_lookup_failed: 'Could not look up the roster entry.',
  has_auth_account: 'This teammate has a signed-in account — full delete is required.',
};

function EmployeeDetailModal({ theme, kind, row, callerRole, callerId, onClose, onSuccess }) {
  // `kind` is 'ca' or 'sales'. `row` is the camelCased state.cas[i] or state.sales[i] entry.
  // We need profileId (the auth.users id) to address the EF. If the row was
  // seeded without profile_id, fall back to looking up by email.
  const [userId, setUserId] = React.useState(row.profileId || null);
  const [resolvingId, setResolvingId] = React.useState(!row.profileId);

  React.useEffect(() => {
    if (userId) { setResolvingId(false); return; }
    if (!row.email) { setResolvingId(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const id = await CABT_findUserIdByEmail(row.email);
        if (!cancelled) {
          setUserId(id || null);
          setResolvingId(false);
        }
      } catch (_e) {
        if (!cancelled) setResolvingId(false);
      }
    })();
    return () => { cancelled = true; };
  }, [row.email, userId]);
  const isCa    = kind === 'ca';
  const isSales = kind === 'sales';

  // Mode: 'edit' = profile fields, 'reset' = password reset confirmation,
  // 'delete' = TKT-12.9 owner-only hard-delete with typed email confirmation
  const [mode, setMode] = React.useState('edit');
  // TKT-12.9 — hard-delete UX state
  const isOwner = callerRole === 'owner';
  const isSelf = !!(callerId && (row.profileId === callerId || userId === callerId));
  const [confirmEmail, setConfirmEmail] = React.useState('');
  const confirmEmailMatches = !!row.email && confirmEmail.trim().toLowerCase() === row.email.trim().toLowerCase();

  // ── edit-form state ─────────────────────────────────────────────
  const [displayName, setDisplayName] = React.useState(row.name || '');
  const [email, setEmail] = React.useState(row.email || '');
  // For CA, role select offers ca/admin/integrator (no promote-to-sales).
  // For sales, role select offers AM/RDR/admin/integrator (no promote-to-ca).
  // Underlying DB role is 'sales' for AM/RDR; sub-role goes to sales_team.role.
  const initialFormRole = isCa
    ? 'ca'
    : (row.role === 'AM' ? 'am' : 'rdr');
  const [formRole, setFormRole] = React.useState(initialFormRole);
  const [caId, setCaId]       = React.useState(isCa    ? (row.id || '') : '');
  const [salesId, setSalesId] = React.useState(isSales ? (row.id || '') : '');
  const [active, setActive]   = React.useState(row.active !== false);

  // ── per-sales-rep default commission rates (Bobby 2026-05-01) ──
  const [upfrontRate, setUpfrontRate] = React.useState(
    row.upfrontRate != null ? String(row.upfrontRate) : ''
  );
  const [midRate, setMidRate] = React.useState(
    row.midRate != null ? String(row.midRate) : ''
  );
  const [endRate, setEndRate] = React.useState(
    row.endRate != null ? String(row.endRate) : ''
  );

  // ── reset-password state ────────────────────────────────────────
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  const [submitting, setSubmitting] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState(null);

  const ROLE_OPTIONS_CA = [
    { value: 'ca',         label: 'Client Associate' },
    { value: 'admin',      label: 'Admin' },
    { value: 'integrator', label: 'Fractional Integrator' },
  ];
  const ROLE_OPTIONS_SALES = [
    { value: 'am',         label: 'Account Manager' },
    { value: 'rdr',        label: 'Relationship Development Rep' },
    { value: 'admin',      label: 'Admin' },
    { value: 'integrator', label: 'Fractional Integrator' },
  ];
  const ROLE_OPTIONS = isCa ? ROLE_OPTIONS_CA : ROLE_OPTIONS_SALES;

  const dbRoleFor = (fr) => (fr === 'am' || fr === 'rdr') ? 'sales' : fr;
  const dbSalesRoleFor = (fr) => (fr === 'am' ? 'AM' : (fr === 'rdr' ? 'RDR' : null));

  // Compute the patch we'd send (only fields that actually changed).
  // Used both to gate the Save button and to populate the EF body.
  const buildPatch = () => {
    const patch = {};
    const trimmedName = displayName.trim();
    if (trimmedName && trimmedName !== (row.name || '')) patch.displayName = trimmedName;
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && trimmedEmail !== (row.email || '').toLowerCase()) {
      patch.email = trimmedEmail;
    }
    const newDbRole      = dbRoleFor(formRole);
    const newDbSalesRole = dbSalesRoleFor(formRole);
    const oldDbRole      = isCa ? 'ca' : 'sales';
    const oldDbSalesRole = isSales ? row.role : null;
    if (newDbRole !== oldDbRole) patch.role = newDbRole;
    if (newDbSalesRole !== oldDbSalesRole && (newDbSalesRole != null || isSales)) {
      patch.salesRole = newDbSalesRole; // null clears it (when demoting away from sales)
    }
    if (isCa && caId.trim() !== (row.id || '') && newDbRole === 'ca') {
      patch.caId = caId.trim();
    }
    if (isSales && salesId.trim() !== (row.id || '') && newDbRole === 'sales') {
      patch.salesId = salesId.trim();
    }
    if (active !== (row.active !== false)) patch.active = active;
    return patch;
  };
  const patch = buildPatch();

  // Commission rates change separately — they're in sales_team, not auth/profile.
  // Sent direct to Supabase, not through the EF.
  const buildRatesPatch = () => {
    if (!isSales) return null;
    const p = {};
    const cur = (n) => (n === '' || n == null) ? null : Number(n);
    if (cur(upfrontRate) !== (row.upfrontRate ?? null)) p.upfrontRate = cur(upfrontRate);
    if (cur(midRate)     !== (row.midRate     ?? null)) p.midRate     = cur(midRate);
    if (cur(endRate)     !== (row.endRate     ?? null)) p.endRate     = cur(endRate);
    return Object.keys(p).length ? p : null;
  };
  const ratesPatch = buildRatesPatch();
  const hasChanges = Object.keys(patch).length > 0 || !!ratesPatch;

  const submitEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrMsg(null);
    if (resolvingId) return setErrMsg('Looking up teammate… try again in a moment.');
    if (!userId) return setErrMsg(`No auth account is linked to ${row.email || 'this teammate'}. Have them sign in once first, or re-invite them.`);
    if (!hasChanges) return setErrMsg('Nothing to save — no fields changed.');
    setSubmitting(true);
    try {
      // Profile fields go through the EF (auth-touching); commission rates
      // are direct table updates because they're not auth-related.
      if (Object.keys(patch).length) {
        await CABT_editUser({ action: 'update_profile', userId, ...patch });
      }
      if (ratesPatch) {
        const sb = await CABT_sb();
        const dbPatch = {};
        if ('upfrontRate' in ratesPatch) dbPatch.upfront_rate = ratesPatch.upfrontRate;
        if ('midRate'     in ratesPatch) dbPatch.mid_rate     = ratesPatch.midRate;
        if ('endRate'     in ratesPatch) dbPatch.end_rate     = ratesPatch.endRate;
        const { error } = await sb.from('sales_team').update(dbPatch).eq('id', row.id);
        if (error) throw error;
      }
      onSuccess('Saved ' + (row.name || 'teammate'));
    } catch (err) {
      const code = err && err.message;
      setErrMsg(EDIT_ERROR_COPY[code] || (err.detail ? `${code}: ${err.detail}` : code) || 'Save failed.');
      setSubmitting(false);
    }
  };

  const submitReset = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrMsg(null);
    if (resolvingId) return setErrMsg('Looking up teammate… try again in a moment.');
    if (newPassword.length < 8) return setErrMsg('Password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setErrMsg('Passwords don\'t match.');
    setSubmitting(true);
    try {
      if (userId) {
        // Existing auth account → reset their password.
        await CABT_editUser({ action: 'reset_password', userId, newPassword });
        onSuccess('Password reset for ' + (row.name || 'teammate'));
      } else {
        // No auth account yet (teammate was added to the roster but never
        // invited / signed in). Treat "Set new password" as "create the
        // account with this password" so they can sign in immediately.
        // Bobby 2026-05-04: previously this errored out, leaving Kurt locked.
        const dbRole = isCa ? 'ca' : 'sales';
        const salesRole = isSales ? (row.role || null) : null;
        await CABT_inviteUser({
          email:       row.email,
          displayName: row.name || row.email,
          role:        dbRole,
          password:    newPassword,
          caId:        isCa    ? row.id : null,
          salesRole,
          salesId:     isSales ? row.id : null,
        });
        onSuccess('Account created for ' + (row.name || 'teammate'));
      }
    } catch (err) {
      const code = err && err.message;
      setErrMsg(EDIT_ERROR_COPY[code] || (err.detail ? `${code}: ${err.detail}` : code) || 'Failed.');
      setSubmitting(false);
    }
  };

  // TKT-12.9 — hard-delete submit. Owner-only (also enforced server-side).
  // Refuses self-delete client-side as a fast-path; the Edge Function also
  // rejects to handle direct API callers. Two paths:
  //   • userId present (teammate signed in at least once → has profile)
  //     → action: 'hard_delete' — auth + profile + roster + push_subs
  //   • userId null (teammate added to roster but never signed in)
  //     → action: 'hard_delete_roster_only' — just removes the cas /
  //       sales_team row. No auth or profile to delete.
  // Bobby 2026-05-11 hit the second case trying to delete Alice (CA-02
  // had never signed in) and the modal blocked her with "No auth account
  // is linked" — fixed by routing to the roster-only path automatically.
  const submitDelete = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrMsg(null);
    if (!isOwner) return setErrMsg('Only the owner can hard-delete a teammate.');
    if (isSelf) return setErrMsg('You can\'t delete your own account.');
    if (resolvingId) return setErrMsg('Looking up teammate… try again in a moment.');
    if (!confirmEmailMatches) return setErrMsg('Type the email exactly to confirm.');
    setSubmitting(true);
    try {
      if (userId) {
        await CABT_editUser({ action: 'hard_delete', userId });
      } else {
        await CABT_editUser({
          action: 'hard_delete_roster_only',
          rosterId: row.id,
          rosterKind: kind, // 'ca' or 'sales'
        });
      }
      onSuccess('Hard-deleted ' + (row.name || row.email || 'teammate'));
    } catch (err) {
      const code = err && err.message;
      setErrMsg(EDIT_ERROR_COPY[code] || (err.detail ? `${code}: ${err.detail}` : code) || 'Delete failed.');
      setSubmitting(false);
    }
  };

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(8, 12, 24, 0.55)',
        zIndex: 1000, display: 'flex',
        alignItems: isDesktop ? 'center' : 'flex-end',
        justifyContent: 'center',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        animation: 'scrimIn 0.18s ease',
        padding: isDesktop ? '32px' : 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="emp-modal-title"
        style={{
          background: theme.bg, width: '100%',
          maxWidth: isDesktop ? 680 : 520,
          maxHeight: isDesktop ? 'calc(92vh - 64px)' : 'calc(92vh - env(safe-area-inset-bottom, 0px))',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          borderBottomLeftRadius: isDesktop ? 24 : 0,
          borderBottomRightRadius: isDesktop ? 24 : 0,
          padding: isDesktop
            ? '20px 24px 24px'
            : '14px 18px calc(env(safe-area-inset-bottom, 0px) + 24px)',
          overflowY: 'auto',
          boxShadow: isDesktop
            ? '0 24px 60px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.14)'
            : '0 -12px 40px rgba(0,0,0,0.32), 0 -2px 8px rgba(0,0,0,0.12)',
          animation: isDesktop
            ? 'modalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
            : 'sheetIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {!isDesktop && (
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: theme.rule,
            margin: '0 auto 14px',
          }}/>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div id="emp-modal-title" style={{
            fontFamily: theme.serif || 'inherit',
            fontSize: isDesktop ? 26 : 22, fontWeight: 600, color: theme.ink, letterSpacing: -0.3,
          }}>
            {mode === 'reset'
              ? (userId ? 'Reset password' : 'Set initial password')
              : mode === 'delete'
                ? 'Hard-delete teammate'
                : 'Edit teammate'}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cabt-btn-press"
            style={{
              width: 36, height: 36, borderRadius: 18,
              border: 'none', background: theme.bgElev, color: theme.inkSoft,
              fontSize: 20, cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}
          >×</button>
        </div>
        <div style={{
          fontSize: 13, color: theme.inkMuted, marginBottom: 18,
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        }}>
          <span style={{
            fontFamily: theme.mono || 'inherit', fontSize: 11, fontWeight: 700,
            background: theme.bgElev, padding: '2px 7px', borderRadius: 6,
            color: theme.ink, letterSpacing: 0.3,
          }}>{row.id}</span>
          <span style={{ color: theme.ink, fontWeight: 600 }}>{row.name}</span>
          <span>·</span>
          <span>{row.email}</span>
        </div>

        {mode === 'edit' && (
          <form onSubmit={submitEdit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Display name" required theme={theme}>
              <Input value={displayName} onChange={setDisplayName} placeholder="Full name" theme={theme}/>
            </Field>

            <Field label="Email" required hint="Must be @groundstandard.com. Changing this will sign them out." theme={theme}>
              <Input type="email" value={email} onChange={setEmail} placeholder="person@groundstandard.com" theme={theme}/>
            </Field>

            <Field label="Role" theme={theme}>
              <Select value={formRole} onChange={setFormRole} options={ROLE_OPTIONS} theme={theme}/>
            </Field>

            {isCa && formRole === 'ca' && (
              <Field label="CA ID" hint="e.g. CA-04. Renames are not cascaded — change with care." theme={theme}>
                <Input value={caId} onChange={setCaId} placeholder="CA-04" theme={theme}/>
              </Field>
            )}
            {isSales && (formRole === 'am' || formRole === 'rdr') && (
              <Field label="Sales ID" hint="e.g. AM-02 or RDR-01." theme={theme}>
                <Input value={salesId} onChange={setSalesId} placeholder="AM-02" theme={theme}/>
              </Field>
            )}

            {isSales && (formRole === 'am' || formRole === 'rdr') && (
              <>
                <div style={{ height: 1, background: theme.rule, margin: '6px 0 2px' }}/>
                <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700, marginTop: 6 }}>
                  Default commission rates
                </div>
                <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 2, marginBottom: 8, lineHeight: 1.4 }}>
                  Auto-applied to new contracts this rep books. Admin can still override per-contract from the client edit screen.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                  <Field label="Upfront %" theme={theme}>
                    <Input type="number" inputmode="decimal" value={upfrontRate} onChange={setUpfrontRate} placeholder="0.10" theme={theme}/>
                  </Field>
                  <Field label="Mid %" theme={theme}>
                    <Input type="number" inputmode="decimal" value={midRate} onChange={setMidRate} placeholder="0.05" theme={theme}/>
                  </Field>
                  <Field label="End %" theme={theme}>
                    <Input type="number" inputmode="decimal" value={endRate} onChange={setEndRate} placeholder="0.05" theme={theme}/>
                  </Field>
                </div>
                <div style={{ height: 1, background: theme.rule, margin: '8px 0 2px' }}/>
              </>
            )}

            <Field label="Active" hint="Off = soft-deleted (preserves history)." theme={theme}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 48 }}>
                <button
                  type="button"
                  onClick={() => setActive(!active)}
                  aria-pressed={active}
                  style={{
                    width: 52, height: 30, borderRadius: 999,
                    border: 'none', cursor: 'pointer',
                    background: active ? STATUS.green : theme.rule,
                    position: 'relative', transition: 'background 0.15s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: active ? 25 : 3,
                    width: 24, height: 24, borderRadius: 12, background: '#fff',
                    transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}/>
                </button>
                <span style={{ fontSize: 14, color: theme.ink, fontWeight: 600 }}>
                  {active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </Field>

            <div style={{ height: 1, background: theme.rule, margin: '6px 0 2px' }}/>
            <Button theme={theme} variant="secondary" onClick={() => { setErrMsg(null); setMode('reset'); }}>
              {userId ? 'Reset password…' : 'Set initial password…'}
            </Button>

            {/* TKT-12.9 — hard-delete entry point. Owner-only; hidden for
                admins / integrators. Self-delete is also blocked here as a
                fast-path (server enforces too). */}
            {isOwner && !isSelf && (
              <button
                type="button"
                onClick={() => { setErrMsg(null); setConfirmEmail(''); setMode('delete'); }}
                style={{
                  marginTop: 4,
                  padding: '10px 14px', height: 44,
                  background: 'transparent', color: STATUS.red,
                  border: `1px solid ${STATUS.red}55`,
                  borderRadius: 10, fontSize: 13, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer',
                  letterSpacing: 0.2,
                }}
              >
                Delete teammate (permanent)…
              </button>
            )}

            {errMsg && (
              <div style={{
                background: STATUS.red + '15', color: STATUS.red, border: `1px solid ${STATUS.red}33`,
                borderRadius: theme.radius - 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.4,
              }}>{errMsg}</div>
            )}

            {!hasChanges && !submitting && (
              <div style={{
                fontSize: 12, color: theme.inkMuted, textAlign: 'center',
                padding: '4px 0', fontStyle: 'italic',
              }}>
                Edit any field above to enable Save.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button theme={theme} variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button theme={theme} variant="primary" fullWidth type="submit" disabled={submitting || !hasChanges} loading={submitting} onClick={submitEdit}>
                {submitting ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={submitReset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: theme.inkSoft, lineHeight: 1.5 }}>
              {userId
                ? <>Set a new temporary password for <strong>{row.name}</strong>. They'll need it to sign in next time. Share it with them out-of-band — it's not emailed.</>
                : <><strong>{row.name}</strong> hasn't signed in yet. Setting a password here <strong>creates their account</strong> so they can sign in immediately. Share the password with them out-of-band — it's not emailed.</>}
            </div>
            <Field label="New password" required hint="Min 8 chars." theme={theme}>
              <Input value={newPassword} onChange={setNewPassword} type="password" placeholder="••••••••" theme={theme} autoFocus/>
            </Field>
            <Field label="Confirm password" required theme={theme}>
              <Input value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="••••••••" theme={theme}/>
            </Field>

            {errMsg && (
              <div style={{
                background: STATUS.red + '15', color: STATUS.red, border: `1px solid ${STATUS.red}33`,
                borderRadius: theme.radius - 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.4,
              }}>{errMsg}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button theme={theme} variant="secondary" onClick={() => { setErrMsg(null); setMode('edit'); }} disabled={submitting}>
                Back
              </Button>
              <Button theme={theme} variant="primary" fullWidth type="submit" disabled={submitting} onClick={submitReset}>
                {submitting
                  ? (userId ? 'Resetting…' : 'Creating…')
                  : (userId ? 'Set new password' : 'Create account & set password')}
              </Button>
            </div>
          </form>
        )}

        {/* TKT-12.9 — typed-confirmation hard-delete form. Submit blocked
            until the user types the teammate's email verbatim. */}
        {mode === 'delete' && (
          <form onSubmit={submitDelete} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding: '12px 14px',
              background: STATUS.red + '12',
              border: `1px solid ${STATUS.red}33`,
              borderRadius: theme.radius - 6,
              color: STATUS.red, fontSize: 13, lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>This is permanent.</div>
              <div style={{ color: theme.ink, fontWeight: 500 }}>
                {userId ? (
                  <>The auth account, profile row, {isCa ? 'CA roster row' : 'sales-team roster row'}, and push subscriptions for <strong>{row.name || row.email}</strong> will be removed. Their authored metric / event / check-in rows are kept (their <code>created_by</code> is set to NULL). Use the audit log to recover the prior state if this was a mistake.</>
                ) : (
                  <>Only the {isCa ? 'CA roster row' : 'sales-team roster row'} for <strong>{row.name || row.email}</strong> will be removed — no auth account is linked (this teammate was added to the roster but never signed in). Use the audit log to recover the prior state if this was a mistake.</>
                )}
              </div>
            </div>
            <Field label="Type the email to confirm" required hint={`Must match exactly: ${row.email}`} theme={theme}>
              <Input
                value={confirmEmail}
                onChange={setConfirmEmail}
                placeholder={row.email}
                theme={theme}
                autoFocus
              />
            </Field>

            {errMsg && (
              <div style={{
                background: STATUS.red + '15', color: STATUS.red, border: `1px solid ${STATUS.red}33`,
                borderRadius: theme.radius - 6, padding: '10px 12px', fontSize: 13, lineHeight: 1.4,
              }}>{errMsg}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button theme={theme} variant="secondary" onClick={() => { setErrMsg(null); setMode('edit'); }} disabled={submitting}>
                Back
              </Button>
              <button
                type="submit"
                disabled={submitting || !confirmEmailMatches}
                onClick={submitDelete}
                style={{
                  flex: 1,
                  padding: '12px 16px', height: 48,
                  background: confirmEmailMatches && !submitting ? STATUS.red : (theme.bgElev || theme.rule),
                  color: confirmEmailMatches && !submitting ? '#fff' : theme.inkMuted,
                  border: 'none', borderRadius: 12,
                  fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                  cursor: confirmEmailMatches && !submitting ? 'pointer' : 'not-allowed',
                  letterSpacing: 0.2,
                }}
              >
                {submitting ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { AdminApprovals, AdminConfig, AdminRoster, DiagRow, InviteTeammateModal, EmployeeDetailModal, RosterRow });
