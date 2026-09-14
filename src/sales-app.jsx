// sales-app.jsx — Sales persona screens (Account Manager + Relationship Development Rep)

function CABT_salesRollupB(rep, state) {
  if (!rep) return null;
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();

  const isAM  = rep.role === 'AM'  || rep.role === 'AE';
  const isRDR = rep.role === 'RDR' || rep.role === 'SDR';

  const myContracts = state.clients.filter(c => {
    if (isAM)  return c.ae === rep.id;
    if (isRDR) return c.sdrBookedBy === rep.id;
    return false;
  });

  const cfg = state.config || {};
  const rdrFee = Number(
    cfg.rdrPerBookingFee ?? cfg.rdr_per_booking_fee
    ?? cfg.sdrFlatFeePerBooking ?? cfg.sdr_flat_fee_per_booking ?? 100
  );

  const ymd = (d) => d.toISOString().slice(0, 10);
  const milestones = [];

  myContracts.forEach(c => {
    const sign = new Date(c.signDate);
    const term = Number(c.termMonths) || 12;
    const retainer = Number(c.monthlyRetainer) || 0;
    const contractValue = retainer * term;
    const cancel = c.cancelDate ? new Date(c.cancelDate) : null;
    const apply = (dateObj, gross, clawable) => {
      if (clawable && cancel && cancel < dateObj) return 0;
      return gross;
    };
    if (isAM) {
      const upfrontDate = new Date(sign);
      const midDate     = new Date(sign); midDate.setMonth(midDate.getMonth() + Math.floor(term / 2));
      const endDate     = new Date(sign); endDate.setMonth(endDate.getMonth() + term);
      const upGross  = contractValue * Number(c.upfrontPct || 0);
      const midGross = term > 6 ? contractValue * Number(c.midPct || 0) : 0;
      const endGross = contractValue * Number(c.endPct || 0);
      const upAmt  = apply(upfrontDate, upGross,  false);
      const midAmt = apply(midDate,     midGross, true);
      const endAmt = apply(endDate,     endGross, true);
      const statusFor = (dateObj, amt, gross) => {
        if (amt === 0 && gross > 0) return 'clawed';
        return dateObj <= today ? 'paid' : 'pending';
      };
      milestones.push({ clientId: c.id, label: 'Upfront',  date: ymd(upfrontDate), amount: upAmt,  gross: upGross,  status: statusFor(upfrontDate, upAmt, upGross) });
      if (midGross > 0) milestones.push({ clientId: c.id, label: 'Midpoint', date: ymd(midDate), amount: midAmt, gross: midGross, status: statusFor(midDate, midAmt, midGross) });
      milestones.push({ clientId: c.id, label: 'End', date: ymd(endDate), amount: endAmt, gross: endGross, status: statusFor(endDate, endAmt, endGross) });
    } else if (isRDR) {
      if (c.ae && c.ae === rep.id) return;
      const bookingDate = new Date(sign);
      milestones.push({
        clientId: c.id, label: 'Booking',
        date: ymd(bookingDate), amount: rdrFee, gross: rdrFee,
        status: bookingDate <= today ? 'paid' : 'pending',
      });
    }
  });

  const ytdMilestones = milestones.filter(m => new Date(m.date) >= yearStart);
  const paidYtd = ytdMilestones.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const pending = milestones.filter(m => m.status === 'pending').reduce((s, m) => s + m.amount, 0);
  const myAdj = state.adjustments.filter(a => a.repId === rep.id);
  const adjPaid = myAdj.filter(a => a.status === 'Paid').reduce((s, a) => s + Number(a.amount || 0), 0);
  const adjPending = myAdj.filter(a => a.status === 'Pending').reduce((s, a) => s + Number(a.amount || 0), 0);
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const upcoming = milestones.filter(m => {
    const d = new Date(m.date);
    return d >= today && d <= in30 && m.status === 'pending';
  });
  return {
    rep, contracts: myContracts, milestones,
    paidYtd: paidYtd + adjPaid, pending: pending + adjPending,
    activeContracts: myContracts.filter(c => !c.cancelDate).length,
    upcoming,
  };
}

function SalesHome({ state, rep, theme, navigate, profile, onSignOut }) {
  if (!rep) return null;
  const r = CABT_salesRollupB(rep, state);
  if (!r) return null;
  const pendingAdj = state.adjustments.filter(a => a.repId === rep.id && a.status === 'Pending').length;
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: theme.accent, color: theme.accentInk, borderRadius: theme.radius + 4, padding: '22px' }}>
        <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600 }}>
          {CABT_roleLabel(rep.role, rep.role)} · {rep.name}
        </div>
        <div style={{ fontFamily: theme.serif, fontSize: 42, fontWeight: 600, marginTop: 6, letterSpacing: -1, lineHeight: 1 }}>
          {CABT_fmtMoney(r.paidYtd)}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>YTD earned · <span style={{ color: theme.gold, fontWeight: 600 }}>{CABT_fmtMoney(r.pending)}</span> pending</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Card theme={theme}>
          <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>Active contracts</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: theme.ink, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{r.activeContracts}</div>
        </Card>
        <Card theme={theme}>
          <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>Pending adj</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: theme.ink, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{pendingAdj}</div>
        </Card>
      </div>
      <Button theme={theme} icon="plus" fullWidth onClick={() => navigate('log-contract')}>Log new contract</Button>
      <Button theme={theme} icon="edit" variant="secondary" fullWidth onClick={() => navigate('log-adjustment')}>Log adjustment</Button>

      {/* Profile + Sign out — Bobby 2026-05-06: Sales had no sign out option. */}
      {(profile || rep) && (
        <Card theme={theme} padding={16}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22,
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent}CC)`,
              color: theme.accentInk,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: theme.serif, fontWeight: 600, fontSize: 18, letterSpacing: -0.3, flexShrink: 0,
            }}>{((profile && (profile.display_name || profile.displayName)) || rep.name || 'S').split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(profile && (profile.display_name || profile.displayName)) || rep.name}
              </div>
              <div style={{ fontSize: 12, color: theme.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(profile && profile.email) || rep.email}
              </div>
            </div>
          </div>
        </Card>
      )}
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
    </div>
  );
}

function LogContractForm({ state, rep, theme, navigate, onSubmit }) {
  const isAM = rep && (rep.role === 'AM' || rep.role === 'AE');
  const [form, setForm] = React.useState({
    name: '', stripeCustomerId: '', signDate: CABT_todayIso(),
    monthlyRetainer: '', termMonths: 12,
    ae: isAM ? rep.id : '', sdrBookedBy: '',
    upfrontPct: rep?.upfrontRate || 0.10,
    midPct:     rep?.midRate     || 0.05,
    endPct:     rep?.endRate     || 0.05,
    hasMembershipAddon: false, membershipStartDate: '',
    notes: '',
  });
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const ams  = state.sales.filter(s => s.role === 'AM' || s.role === 'AE')
                          .map(s => ({ value: s.id, label: s.name }));
  const rdrs = [
    { value: '', label: 'None' },
    ...state.sales.filter(s => s.role === 'RDR' || s.role === 'SDR')
                  .map(s => ({ value: s.id, label: s.name })),
  ];

  const validate = () => {
    const e = {};
    if (!form.name) e.name = 'Required';
    if (!form.signDate) e.signDate = 'Required';
    if (form.signDate && new Date(form.signDate) > new Date()) e.signDate = 'Cannot be in the future';
    if (!form.monthlyRetainer || Number(form.monthlyRetainer) <= 0) e.monthlyRetainer = 'Required';
    if (!form.termMonths || Number(form.termMonths) <= 0) e.termMonths = 'Required';
    if (form.hasMembershipAddon && !form.membershipStartDate) e.membershipStartDate = 'Required when membership is on';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate() || busy) return;
    setBusy(true);
    const localId = `CL-${Date.now().toString().slice(-6)}`;
    const payload = {
      id: localId, name: form.name.trim(),
      stripeCustomerId: form.stripeCustomerId,
      signDate: form.signDate, cancelDate: null,
      monthlyRetainer: Number(form.monthlyRetainer),
      hasMembershipAddon: !!form.hasMembershipAddon,
      membershipStartDate: form.hasMembershipAddon ? form.membershipStartDate : null,
      termMonths: Number(form.termMonths),
      ae: form.ae || null, sdrBookedBy: form.sdrBookedBy || null,
      upfrontPct: Number(form.upfrontPct), midPct: Number(form.midPct), endPct: Number(form.endPct),
      stripeTruthMode: 'stripe_wins', assignedCa: null, notes: form.notes,
    };
    try {
      let saved = payload;
      if (CABT_getApiMode() === 'supabase') {
        try {
          const sb = await CABT_sb();
          const { data: nextIdData } = await sb.rpc('next_client_id');
          if (nextIdData) payload.id = nextIdData;
        } catch (_) {}
        saved = await CABT_api.submitContract(payload);
      }
      onSubmit(saved);
    } catch (e) {
      console.error('submitContract failed:', e);
      setErrors({ ...errors, _root: e?.message || 'Save failed — try again' });
      setBusy(false);
    }
  };

  return (
    <FormShell theme={theme}>
      <Banner tone="info" icon="alert" theme={theme}>
        CA assignment is left blank — admin will assign after you submit.
      </Banner>
      {errors._root && <Banner tone="error" icon="alert" theme={theme}>{errors._root}</Banner>}
      <Field label="Business name" required error={errors.name} theme={theme}>
        <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} theme={theme} placeholder="e.g. Ronin BJJ Austin"/>
      </Field>
      <Field label="Sign date" required error={errors.signDate} theme={theme}>
        <Input type="date" value={form.signDate} onChange={(v) => setForm({ ...form, signDate: v })} theme={theme}/>
      </Field>
      <Field label="Monthly retainer" required error={errors.monthlyRetainer} theme={theme}>
        <Input type="number" inputmode="decimal" prefix="$" value={form.monthlyRetainer} onChange={(v) => setForm({ ...form, monthlyRetainer: v })} theme={theme}/>
      </Field>
      <Field label="Term (months)" required error={errors.termMonths} theme={theme}>
        <Input type="number" inputmode="numeric" value={form.termMonths} onChange={(v) => setForm({ ...form, termMonths: v })} theme={theme}/>
      </Field>
      <Field label="Account Manager" theme={theme}>
        <Select value={form.ae} onChange={(v) => setForm({ ...form, ae: v })} options={ams} theme={theme}/>
      </Field>
      <Field label="Relationship Development Rep (booked by)" theme={theme}>
        <Select value={form.sdrBookedBy} onChange={(v) => setForm({ ...form, sdrBookedBy: v })} options={rdrs} theme={theme}/>
      </Field>
      {/* Commission % fields hidden from sales reps (Bobby 2026-05-01).
          Defaults are auto-applied from the AM's per-rep rates set by admin
          in Roster. Admin can override per-contract from the client edit. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>Membership add-on?</div>
          <div style={{ fontSize: 12, color: theme.inkMuted }}>Adds 5% revenue share</div>
        </div>
        <Toggle value={form.hasMembershipAddon} onChange={(v) => setForm({ ...form, hasMembershipAddon: v })} theme={theme}/>
      </div>
      {form.hasMembershipAddon && (
        <Field label="Membership start date" required error={errors.membershipStartDate} theme={theme}>
          <Input type="date" value={form.membershipStartDate} onChange={(v) => setForm({ ...form, membershipStartDate: v })} theme={theme}/>
        </Field>
      )}
      <Field label="Notes" theme={theme}>
        <Textarea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={3}
          placeholder="Anything admins should know about this account…"
          theme={theme}/>
      </Field>

      <button onClick={() => setShowAdvanced(s => !s)} style={{
        background: 'transparent', border: 'none', color: theme.inkMuted,
        fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
        textAlign: 'left', padding: '4px 0', textDecoration: 'underline',
      }}>
        {showAdvanced ? 'Hide advanced' : 'Show advanced (Stripe customer ID)'}
      </button>
      {showAdvanced && (
        <Field label="Stripe customer ID" hint="Optional — wires future automation" theme={theme}>
          <Input value={form.stripeCustomerId} onChange={(v) => setForm({ ...form, stripeCustomerId: v })} theme={theme} placeholder="cus_..."/>
        </Field>
      )}

      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save contract'}
        </Button>
      </StickyBar>
    </FormShell>
  );
}

function SalesCommissions({ state, rep, theme }) {
  if (!rep) return null;
  const r = CABT_salesRollupB(rep, state);
  if (!r) return null;
  const isAM = rep.role === 'AM' || rep.role === 'AE';
  const amYtd = state.sales.filter(s => s.role === 'AM' || s.role === 'AE')
    .reduce((s, ae) => s + (CABT_salesRollupB(ae, state)?.paidYtd || 0), 0);
  const rdrYtd = state.sales.filter(s => s.role === 'RDR' || s.role === 'SDR')
    .reduce((s, sd) => s + (CABT_salesRollupB(sd, state)?.paidYtd || 0), 0);
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    months.push({ key: d.toISOString().slice(0,7), label: d.toLocaleDateString('en-US', { month: 'short' }), year: d.getFullYear() });
  }
  const monthTotals = months.map(m => {
    const total = r.milestones.filter(ms => ms.date.slice(0,7) === m.key).reduce((s, ms) => s + ms.amount, 0);
    return { ...m, total };
  });
  const maxMonth = Math.max(1, ...monthTotals.map(m => m.total));
  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <KPI theme={theme} label="Paid YTD"        value={CABT_fmtMoney(r.paidYtd)} />
        <KPI theme={theme} label="Pending"         value={CABT_fmtMoney(r.pending)} />
        <KPI theme={theme} label={isAM ? 'RDR team YTD' : 'AM team YTD'} value={CABT_fmtMoney(isAM ? rdrYtd : amYtd)} />
        <KPI theme={theme} label="Active contracts" value={r.activeContracts} />
      </div>
      <Card theme={theme}>
        <SectionLabel theme={theme}>12-month calendar</SectionLabel>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90, marginTop: 4 }}>
          {monthTotals.map((m, i) => {
            const isCurrent = m.key === now.toISOString().slice(0,7);
            const h = m.total > 0 ? (m.total / maxMonth * 64) + 8 : 4;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: '100%', height: h, background: isCurrent ? theme.accent : theme.gold,
                  opacity: m.total === 0 ? 0.18 : 1, borderRadius: 3, transition: 'height .3s',
                }}/>
                <div style={{ fontSize: 9, color: theme.inkMuted, fontWeight: 600 }}>{m.label}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <div>
        <SectionLabel theme={theme}>Contracts · {r.contracts.length}</SectionLabel>
        {r.contracts.length === 0 && (
          <Card theme={theme}>
            <div style={{ color: theme.inkMuted, fontSize: 13 }}>No contracts {isAM ? 'assigned to you yet' : 'booked by you yet'}.</div>
          </Card>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {r.contracts.map(c => {
            const ms = r.milestones.filter(m => m.clientId === c.id);
            const value = (Number(c.monthlyRetainer) || 0) * (Number(c.termMonths) || 0);
            return (
              <Card theme={theme} key={c.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink, letterSpacing: -0.15 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: theme.inkMuted }}>{CABT_fmtMoney(value)} value</div>
                </div>
                <div style={{ fontSize: 12, color: theme.inkMuted, marginBottom: 8 }}>
                  {CABT_fmtMoney(c.monthlyRetainer)}/mo · {c.termMonths}mo · Signed {CABT_fmtDate(c.signDate)}
                  {c.cancelDate && <span style={{ color: STATUS.red, fontWeight: 600 }}> · Cancelled {CABT_fmtDate(c.cancelDate)}</span>}
                </div>
                {/* TKT-12.5 — vesting-milestones list rendered as a row-per-
                    milestone table with explicit Date / Amount columns + a
                    Status chip. Pending milestones with 0–30 days until vest
                    get the accent-color row highlight. Paid amounts render
                    with a strikethrough so cleared milestones are visually
                    distinct from active ones. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 1fr) minmax(96px, 1.2fr) minmax(80px, 1fr) auto', columnGap: 10, rowGap: 4, alignItems: 'center', fontSize: 12, marginTop: 2 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>Milestone</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>Date</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'right' }}>Amount</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'right' }}>Status</div>
                  {ms.map((m, i) => {
                    const colors = { paid: STATUS.green, pending: STATUS.yellow, clawed: STATUS.red };
                    const c2 = colors[m.status];
                    const dObj = new Date(m.date);
                    const daysUntil = Math.round((dObj - new Date()) / 86400000);
                    const isUpcoming30 = m.status === 'pending' && daysUntil >= 0 && daysUntil <= 30;
                    const rowBg = isUpcoming30 ? theme.accent + '14' : 'transparent';
                    const rowBorder = isUpcoming30 ? theme.accent + '55' : 'transparent';
                    const cell = { padding: '6px 8px', background: rowBg, borderTop: `1px solid ${rowBorder}`, borderBottom: `1px solid ${rowBorder}` };
                    const firstCell = { ...cell, borderLeft: `1px solid ${rowBorder}`, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 };
                    const lastCell  = { ...cell, borderRight: `1px solid ${rowBorder}`, borderTopRightRadius: 6, borderBottomRightRadius: 6 };
                    return (
                      <React.Fragment key={i}>
                        <div style={{ ...firstCell, fontSize: 11, fontWeight: 700, color: theme.ink, textTransform: 'uppercase', letterSpacing: 0.3 }}>{m.label}</div>
                        <div style={{ ...cell, fontSize: 12, color: theme.inkSoft, fontVariantNumeric: 'tabular-nums' }}>{CABT_fmtDate(m.date)}</div>
                        <div style={{
                          ...cell,
                          fontSize: 13, fontWeight: 700, color: theme.ink,
                          textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          textDecoration: m.status === 'paid' ? 'line-through' : 'none',
                          textDecorationColor: m.status === 'paid' ? c2 : 'currentColor',
                          opacity: m.status === 'paid' ? 0.7 : 1,
                        }}>{CABT_fmtMoney(m.amount)}</div>
                        <div style={{ ...lastCell, textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                            background: c2 + '1F', color: c2,
                            border: `1px solid ${c2}55`,
                            fontSize: 10, fontWeight: 700, textTransform: 'capitalize', letterSpacing: 0.3,
                          }}>
                            {m.status}{isUpcoming30 && ' · soon'}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KPI({ theme, label, value }) {
  return (
    <Card theme={theme} padding={14}>
      <div style={{ fontSize: 11, color: theme.inkMuted, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: theme.ink, marginTop: 4, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3 }}>{value}</div>
    </Card>
  );
}

function LogAdjustmentForm({ state, rep, theme, isAdmin, navigate, onSubmit }) {
  const [form, setForm] = React.useState({
    date: CABT_todayIso(),
    repId: rep?.id || '',
    role: (rep?.role === 'AE' ? 'AM' : rep?.role === 'SDR' ? 'RDR' : rep?.role) || 'AM',
    type: '', amount: '', reason: '',
    linkedClient: '', period: defaultPeriod(),
    status: 'Pending',
  });
  const [errors, setErrors] = React.useState({});
  const [busy, setBusy] = React.useState(false);

  const validate = () => {
    const e = {};
    if (!form.repId) e.repId = 'Required';
    if (!form.type) e.type = 'Required';
    if (form.amount === '' || form.amount == null || isNaN(Number(form.amount))) e.amount = 'Required';
    if (!form.reason) e.reason = 'Required';
    if (!form.linkedClient) e.linkedClient = 'Required — adjustments must reference an existing client';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate() || busy) return;
    setBusy(true);
    const payload = {
      id: `CA-${Date.now().toString().slice(-8)}`,
      repId: form.repId, role: form.role, type: form.type,
      amount: Number(form.amount), reason: form.reason,
      linkedClient: form.linkedClient || null, period: form.period,
      status: isAdmin ? form.status : 'Pending', date: form.date,
    };
    try {
      let saved = payload;
      if (CABT_getApiMode() === 'supabase') {
        saved = await CABT_api.submitAdjustment(payload);
      }
      onSubmit(saved);
    } catch (e) {
      console.error('submitAdjustment failed:', e);
      setErrors({ ...errors, _root: e?.message || 'Save failed — try again' });
      setBusy(false);
    }
  };

  const reps = state.sales.map(s => ({
    value: s.id,
    label: `${s.name} · ${s.role === 'AE' ? 'AM' : s.role === 'SDR' ? 'RDR' : s.role}`,
  }));

  return (
    <FormShell theme={theme}>
      {errors._root && <Banner tone="error" icon="alert" theme={theme}>{errors._root}</Banner>}
      <Field label="Date" theme={theme}>
        <Input type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} theme={theme}/>
      </Field>
      <Field label="Rep" required error={errors.repId} theme={theme}>
        <Select value={form.repId} onChange={(v) => {
          const r = state.sales.find(s => s.id === v);
          const role = r?.role === 'AE' ? 'AM' : r?.role === 'SDR' ? 'RDR' : r?.role;
          setForm({ ...form, repId: v, role: role || form.role });
        }} options={reps} theme={theme}/>
      </Field>
      <Field label="Type" required error={errors.type} hint="Penalty/Correction can be negative" theme={theme}>
        <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })}
                options={['Bonus', 'Correction', 'Penalty', 'Spiff']} theme={theme}/>
      </Field>
      <Field label="Amount" required error={errors.amount} hint="Use negative for clawbacks/penalties" theme={theme}>
        <Input type="number" inputmode="decimal" prefix="$" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} theme={theme}/>
      </Field>
      <Field label="Reason" required error={errors.reason} theme={theme}>
        <Textarea value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} rows={3} theme={theme} error={errors.reason}/>
      </Field>
      <Field label="Linked client" required error={errors.linkedClient}
             hint="Adjustments must tie back to a real account on the books"
             theme={theme}>
        <Select value={form.linkedClient} onChange={(v) => setForm({ ...form, linkedClient: v })}
          options={[
            { value: '', label: 'Pick a client…' },
            ...(isAdmin
                  ? state.clients
                  : state.clients.filter(c => c.ae === rep?.id || c.sdrBookedBy === rep?.id)
               ).map(c => ({ value: c.id, label: c.name })),
          ]} theme={theme}/>
      </Field>
      <Field label="Period" theme={theme}>
        <Select value={form.period} onChange={(v) => setForm({ ...form, period: v })}
                options={periodOptions()} theme={theme}/>
      </Field>
      {isAdmin && (
        <Field label="Status" hint="Admin only — sales submissions default to Pending" theme={theme}>
          <Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={['Pending', 'Paid', 'Rejected']} theme={theme}/>
        </Field>
      )}
      <StickyBar theme={theme}>
        <Button theme={theme} variant="secondary" onClick={() => navigate('back')}>Cancel</Button>
        <Button theme={theme} variant="primary" fullWidth disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Submit adjustment'}
        </Button>
      </StickyBar>
    </FormShell>
  );
}

function defaultPeriod() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}
function periodOptions() {
  const d = new Date();
  const y = d.getFullYear();
  return [
    `Q1 ${y - 1}`, `Q2 ${y - 1}`, `Q3 ${y - 1}`, `Q4 ${y - 1}`,
    `Q1 ${y}`,     `Q2 ${y}`,     `Q3 ${y}`,     `Q4 ${y}`,
    `Q1 ${y + 1}`, `Q2 ${y + 1}`,
  ];
}

Object.assign(window, {
  SalesHome, LogContractForm, SalesCommissions, LogAdjustmentForm,
  KPI, CABT_salesRollupB,
});
