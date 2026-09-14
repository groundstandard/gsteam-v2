// app-shell.jsx — top-level App: role switcher, navigation, sync banner, tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "athletic",
  "accentColor": "#E8FF5A",
  "scorecardViz": "bars",
  "showFrame": true,
  "density": "regular",
  "fontScale": 1.0,
  "demoOffline": false,
  "showSavedToast": true,
  "apiMode": "supabase",
  "apiUrl": ""
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [state, setState] = React.useState(() => CABT_loadState());
  const [authedSession, setAuthedSession] = React.useState(null);
  const [authedProfile, setAuthedProfile] = React.useState(null);
  const [loadingLive, setLoadingLive] = React.useState(false);
  const [role, setRole] = React.useState('CA'); // 'CA' | 'Sales' | 'Admin'
  const [activeUserId, setActiveUserId] = React.useState('CA-01');
  const [route, setRoute] = React.useState({ name: 'home', params: {} });
  const [history, setHistory] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const [pendingSync, setPendingSync] = React.useState(0);
  // Initialize from navigator.onLine immediately so OfflineScreen renders on
  // first paint when offline — no flicker, no waiting for useEffect to fire.
  const [isOffline, setIsOffline] = React.useState(
    typeof navigator !== 'undefined' && navigator.onLine === false
  );
  const [logSheet, setLogSheet] = React.useState(false);
  const [updateWorker, setUpdateWorker] = React.useState(null); // PWA new version
  // Branded confirm dialog (replaces native window.confirm). Set with
  // askConfirm({ title, message, danger?, confirmLabel?, onConfirm }).
  const [confirmState, setConfirmState] = React.useState(null);
  const askConfirm = (opts) => setConfirmState(opts);
  const closeConfirm = () => setConfirmState(null);

  // Shared sign-out handler — Bobby 2026-05-06: "wala mga sign out yung admin
  // lang meron." CA had it gated on apiMode === 'supabase' (subtle bug — CA
  // sometimes didn't see the button); Sales had no sign out at all. Now all
  // three roles use the same handler. Renders the button whenever there's
  // an authed session; the actual remote sign-out runs through CABT_signOut.
  const signOutHandler = (authedSession || authedProfile) ? () => askConfirm({
    title: 'Sign out of gsTeam?',
    message: "You'll need to sign in again next time.",
    confirmLabel: 'Sign out',
    danger: true,
    onConfirm: async () => {
      try { await CABT_signOut(); } catch (_e) {}
      setAuthedSession(null);
      setAuthedProfile(null);
      closeConfirm();
    },
  }) : null;
  const [installable, setInstallable] = React.useState(!!window.CABT_INSTALL_PROMPT);
  const [installed, setInstalled] = React.useState(false);

  // Listen for "new version available" event dispatched by index.html SW handler.
  React.useEffect(() => {
    const onUpdate = (e) => setUpdateWorker(e.detail?.worker || true);
    const onInstallable = () => setInstallable(true);
    const onInstalled = () => { setInstallable(false); setInstalled(true); };
    window.addEventListener('cabt-update-available', onUpdate);
    window.addEventListener('cabt-install-available', onInstallable);
    window.addEventListener('cabt-install-completed', onInstalled);
    return () => {
      window.removeEventListener('cabt-update-available', onUpdate);
      window.removeEventListener('cabt-install-available', onInstallable);
      window.removeEventListener('cabt-install-completed', onInstalled);
    };
  }, []);

  const acceptUpdate = () => {
    if (updateWorker && updateWorker.postMessage) {
      updateWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  const promptInstall = async () => {
    const p = window.CABT_INSTALL_PROMPT;
    if (!p) return;
    p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    window.CABT_INSTALL_PROMPT = null;
    setInstallable(false);
  };

  // Detect already-installed PWA (display-mode: standalone)
  const isStandalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true);

  // Handle PWA manifest shortcuts on launch (?shortcut=ca-today, etc.)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shortcut = params.get('shortcut');
    if (!shortcut) return;
    if (shortcut === 'ca-today')           { setRole('CA');    setRoute({ name: 'home', params: {} }); }
    else if (shortcut === 'admin-approvals') { setRole('Admin'); setRoute({ name: 'home', params: {} }); }
    else if (shortcut === 'sales-commissions') { setRole('Sales'); setRoute({ name: 'commissions', params: {} }); }
    // Clear param so reload doesn't re-trigger
    if (window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('shortcut');
      url.searchParams.delete('source');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    }
  }, []);

  React.useEffect(() => { if (t.apiMode === 'local') CABT_saveState(state); }, [state, t.apiMode]);

  // Real offline detection — listen to browser online/offline events.
  // Tweak `demoOffline` overrides for testing (forces offline state).
  React.useEffect(() => {
    if (t.demoOffline) { setIsOffline(true); return; }
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [t.demoOffline]);

  // Sync apiMode tweak → api.jsx mode key
  React.useEffect(() => { CABT_setApiMode(t.apiMode); }, [t.apiMode]);

  // When in supabase mode and authed, fetch real state
  const reloadLive = React.useCallback(() => {
    if (t.apiMode !== 'supabase') return Promise.resolve();
    setLoadingLive(true);
    return CABT_api.loadState().then(s => {
      setState(prev => ({ ...prev, ...s }));
      if (s.role === 'owner' || s.role === 'admin') setRole('Admin');
      else if (s.role === 'sales') setRole('Sales');
      else setRole('CA');
      setLoadingLive(false);
    }).catch(err => {
      console.error('Live load failed:', err);
      setLoadingLive(false);
    });
  }, [t.apiMode]);

  React.useEffect(() => {
    if (t.apiMode !== 'supabase' || !authedSession) return;
    reloadLive();
  }, [t.apiMode, authedSession, reloadLive]);

  // Realtime sync — when any user (or this user from another tab) inserts/updates/
  // deletes a row, splice it into local state so the UI reflects it without a refresh.
  // Each event shape: { table, eventType, new, old } already in UI camelCase.
  React.useEffect(() => {
    if (t.apiMode !== 'supabase' || !authedSession) return;
    let unsub = null;
    let cancelled = false;
    const apply = ({ table, eventType, new: row, old }) => {
      const collectionByTable = {
        clients: 'clients',
        cas: 'cas',
        sales_team: 'sales',
        monthly_metrics: 'monthlyMetrics',
        weekly_metrics: 'weeklyMetrics',
        growth_events: 'growthEvents',
        surveys: 'surveys',
        adjustments: 'adjustments',
        weekly_checkins: 'weeklyCheckins',
        monthly_checkins: 'monthlyCheckins',
        pending_clients: 'pendingClients',
        cancel_reasons: 'cancelReasons',
        quarter_inputs: 'allQuarterInputs',
        open_questions: 'openQuestions',
        edit_requests: 'editRequests',
        reviews: 'reviews',
        call_statuses: 'callStatuses',
        // config: handled specially below (single-row table, store the
        // values jsonb directly on state.config rather than a list).
      };
      // config is a single-row table (id=1) — its `values` JSONB drives every
      // scoring threshold. Push UPDATEs straight onto state.config so admin
      // edits propagate live across sessions without a reload.
      if (table === 'config') {
        if (eventType === 'UPDATE' || eventType === 'INSERT') {
          if (row && row.values) setState(s => ({ ...s, config: row.values }));
        }
        return;
      }
      const key = collectionByTable[table];
      if (!key) return;
      setState(s => {
        const list = s[key] || [];
        if (eventType === 'INSERT') {
          if (!row || list.some(x => x.id === row.id)) return s; // idempotent
          return { ...s, [key]: [...list, row] };
        }
        if (eventType === 'UPDATE') {
          if (!row) return s;
          return { ...s, [key]: list.map(x => x.id === row.id ? { ...x, ...row } : x) };
        }
        if (eventType === 'DELETE') {
          const id = (old && old.id) || (row && row.id);
          if (!id) return s;
          return { ...s, [key]: list.filter(x => x.id !== id) };
        }
        return s;
      });
    };
    CABT_subscribeRealtime([
      'clients', 'cas', 'sales_team',
      'monthly_metrics', 'weekly_metrics', 'growth_events', 'surveys',
      'adjustments', 'weekly_checkins', 'monthly_checkins', 'pending_clients',
      'cancel_reasons', 'quarter_inputs', 'open_questions',
      'edit_requests', 'reviews', 'config', 'call_statuses',
    ], apply).then(fn => { if (cancelled) fn?.(); else unsub = fn; });
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [t.apiMode, authedSession]);

  // Theme override: clone selected theme and override accent
  const baseTheme = THEMES[t.theme] || THEMES.editorial;
  const theme = { ...baseTheme, accent: t.accentColor || baseTheme.accent };

  const navigate = (name, params = {}) => {
    if (name === 'back') {
      setHistory(h => {
        if (h.length === 0) { setRoute({ name: 'home', params: {} }); return h; }
        const prev = h[h.length - 1];
        setRoute(prev);
        return h.slice(0, -1);
      });
      return;
    }
    setHistory(h => [...h, route]);
    setRoute({ name, params });
  };

  const showToast = (msg) => {
    if (!t.showSavedToast) return;
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const queueOrApply = (mutator, msg) => {
    if (isOffline) {
      setPendingSync(n => n + 1);
      // Still apply locally
      setState(mutator);
      showToast('Saved locally · will sync');
    } else {
      setState(mutator);
      showToast(msg || 'Saved ✓');
    }
    navigate('back');
  };

  // Action handlers
  //
  // Phase 12 TKT-12.1 (Bobby 2026-05-06) — non-admin edits to existing rows
  // route through the Edit Requests queue instead of touching the row
  // directly. Admins / owners keep direct-edit. New rows always insert
  // directly regardless of role.
  // Bobby 2026-05-15: also fall back to state.role so admins still get
  // admin-only buttons (e.g. Cancel Account) before authedProfile loads.
  const isAdminAuth = ['owner', 'admin'].includes(authedProfile?.role)
                   || ['owner', 'admin'].includes(state?.role);
  const computeFieldDiff = (original, next) => {
    if (!original) return {};
    // Bobby 2026-05-12: field_changes JSONB MUST use snake_case column names
    // because fn_apply_edit_request feeds them straight into a dynamic SQL
    // `UPDATE %I SET %I = %L`. Storing camelCase keys (clientMRR, apptsBooked)
    // made the trigger generate UPDATE statements against columns that don't
    // exist — Postgres errored silently inside the BEFORE-UPDATE, rolling
    // back the approve. Convert keys here so the diff matches real columns.
    const c2s = (typeof window !== 'undefined' && window.camelToSnake)
      || ((s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()));
    const changed = {};
    Object.keys(next).forEach((k) => {
      // Skip identity / metadata keys — never propose those as edits.
      if (['id', 'caId', 'clientId', 'createdAt', 'createdBy', 'updatedAt', 'cadence'].includes(k)) return;
      const a = original[k];
      const b = next[k];
      if (a === b) return;
      // Tolerate "" vs 0 vs null for numeric fields that came back from DB as 0
      if ((a == null || a === '') && (b == null || b === '')) return;
      if (typeof a === 'number' && typeof b === 'string' && Number(b) === a) return;
      if (typeof b === 'number' && typeof a === 'string' && Number(a) === b) return;
      const dbKey = c2s(k);
      changed[dbKey] = { old: a == null ? null : a, new: b == null ? null : b };
    });
    return changed;
  };
  const requestEdit = async (tableName, row, originalRow) => {
    const changes = computeFieldDiff(originalRow, row);
    if (Object.keys(changes).length === 0) {
      showToast('No changes detected');
      navigate('back');
      return;
    }
    try {
      await CABT_api.submitEditRequest({
        tableName,
        rowId: row.id,
        fieldChanges: changes,
        reason: row._editReason || null,
      });
      showToast('Edit requested · admin will review');
    } catch (e) {
      showToast('Edit request failed');
      console.error('[requestEdit]', e);
    }
    navigate('back');
  };
  // Bobby 2026-07-27: let a CA set the cancel reason on an account; it goes to
  // the owner's Approvals queue instead of applying directly. Inline (no
  // navigate-away) so it can sit on the Account Status card.
  const requestCancelReason = async (client, reasonCode) => {
    if (!client) return;
    try {
      await CABT_api.submitEditRequest({
        tableName: 'clients',
        rowId: client.id,
        // snake_case column key (canonical field_changes format).
        fieldChanges: { cancel_reason: { old: client.cancelReason || null, new: reasonCode || null } },
        reason: 'Cancel reason set by CA',
      });
      showToast('Reason submitted · admin will review');
    } catch (e) {
      showToast('Submit failed');
      console.error('[requestCancelReason]', e);
    }
  };

  // Bobby 2026-05-12: "I needto be ableto delete a metric ... deletions
  // should be only possible for Admin. If the CA wants to delete, then
  // i just need to be sent to Approvals." Generic delete-or-request that
  // every log-* form's onDelete handler routes through.
  //
  // Admin/Owner: directly DELETE the row from Supabase.
  // Non-admin (CA): submit an edit_request with field_changes carrying a
  // _action='delete' sentinel that the apply trigger interprets as a
  // DELETE on approve.
  const requestDelete = async (tableName, rowId) => {
    try {
      await CABT_api.submitEditRequest({
        tableName,
        rowId,
        fieldChanges: { _action: 'delete' },
        reason: 'Delete requested by CA',
      });
      showToast('Delete request submitted · admin will review');
    } catch (e) {
      showToast('Delete request failed');
      console.error('[requestDelete]', e);
    }
    navigate('back');
  };

  const deleteRow = async (tableName, stateKey, rowId) => {
    if (!isAdminAuth && CABT_getApiMode() === 'supabase') {
      return requestDelete(tableName, rowId);
    }
    setState(s => ({
      ...s,
      [stateKey]: (s[stateKey] || []).filter(r => r.id !== rowId),
    }));
    if (CABT_getApiMode() === 'supabase') {
      try {
        await CABT_api.deleteRow(tableName, rowId);
        showToast('Deleted');
      } catch (e) {
        showToast('Delete failed');
        console.error('[deleteRow]', e);
      }
    }
    navigate('back');
  };

  const deleteMetric = (rowId, cadence = 'monthly') => {
    const isWeekly = cadence === 'weekly';
    return deleteRow(
      isWeekly ? 'weekly_metrics' : 'monthly_metrics',
      isWeekly ? 'weeklyMetrics'  : 'monthlyMetrics',
      rowId,
    );
  };
  const deleteEvent = (rowId) => deleteRow('growth_events', 'growthEvents', rowId);
  const deleteSurvey = (rowId) => deleteRow('surveys', 'surveys', rowId);

  const submitMetrics = async (row, isEdit, cadence = 'monthly') => {
    const isWeekly = cadence === 'weekly';
    const stateKey = isWeekly ? 'weeklyMetrics' : 'monthlyMetrics';
    const tableName = isWeekly ? 'weekly_metrics' : 'monthly_metrics';

    // Non-admin edit → route to edit-request queue, leave the row untouched.
    if (isEdit && !isAdminAuth && CABT_getApiMode() === 'supabase') {
      const original = (state[stateKey] || []).find(m => m.id === row.id);
      return requestEdit(tableName, row, original);
    }

    const mutator = (s) => ({
      ...s,
      [stateKey]: isEdit
        ? (s[stateKey] || []).map(m => m.id === row.id ? row : m)
        : [...(s[stateKey] || []), row],
    });
    const msg = isWeekly ? 'Weekly metrics saved' : 'Monthly metrics saved';
    if (CABT_getApiMode() === 'supabase') {
      setState(mutator);
      try {
        if (isWeekly) {
          if (isEdit) await CABT_api.updateWeeklyMetrics(row.id, row);
          else        await CABT_api.submitWeeklyMetrics(row);
        } else {
          if (isEdit) await CABT_api.updateMonthlyMetrics(row.id, row);
          else        await CABT_api.submitMonthlyMetrics(row);
        }
        showToast(msg);
        navigate('back');
      } catch (e) {
        // Kurt 2026-06-22: "things I'm adding aren't saving." The failure was
        // silent (generic toast) and we navigated back regardless, so a row
        // looked saved until a reload dropped it. Roll back the optimistic
        // insert, stay on the form, and show the real reason.
        if (!isEdit) {
          setState(s => ({ ...s, [stateKey]: (s[stateKey] || []).filter(m => m.id !== row.id) }));
        }
        console.error('[submitMetrics]', e);
        showToast('Save failed: ' + (e?.message || String(e)));
      }
    } else {
      queueOrApply(mutator, msg);
    }
  };
  const submitEvent = async (row, isEdit) => {
    if (isEdit && !isAdminAuth && CABT_getApiMode() === 'supabase') {
      const original = (state.growthEvents || []).find(e => e.id === row.id);
      return requestEdit('growth_events', row, original);
    }
    const mutator = (s) => ({
      ...s,
      growthEvents: isEdit
        ? (s.growthEvents || []).map(e => e.id === row.id ? row : e)
        : [...(s.growthEvents || []), row],
    });
    if (CABT_getApiMode() === 'supabase') {
      setState(mutator);
      try {
        if (isEdit) await CABT_api.updateEvent(row.id, row);
        else        await CABT_api.submitEvent(row);
        showToast('Event saved');
        navigate('back');
      } catch (e) {
        // Kurt 2026-06-22: "events are not saving." The failure was silent —
        // the row was added to local state optimistically and we navigated
        // back regardless, so it looked saved until a reload dropped it.
        // Now: roll back the optimistic insert, surface the real error, and
        // stay on the form so the entry isn't lost.
        if (!isEdit) {
          setState(s => ({ ...s, growthEvents: (s.growthEvents || []).filter(ev => ev.id !== row.id) }));
        }
        console.error('[submitEvent]', e);
        showToast('Save failed: ' + (e?.message || String(e)));
      }
    } else {
      queueOrApply(mutator, 'Event saved');
    }
  };
  const submitCheckin = async (row, cadence) => {
    if (CABT_getApiMode() === 'supabase') {
      try {
        if (cadence === 'weekly') await CABT_api.submitWeeklyCheckin(row);
        else                      await CABT_api.submitMonthlyCheckin(row);
        showToast(`${cadence === 'weekly' ? 'Weekly' : 'Monthly'} check-in saved`);
        navigate('back');
      } catch (e) { showToast('Save failed'); console.error('[submitCheckin]', e); }
    } else {
      // Local mode — keep narrative in a local-only collection so devs can preview UI
      setState(s => ({ ...s, [cadence === 'weekly' ? 'weeklyCheckins' : 'monthlyCheckins']:
        [...(s[cadence === 'weekly' ? 'weeklyCheckins' : 'monthlyCheckins'] || []), row] }));
      showToast(`${cadence === 'weekly' ? 'Weekly' : 'Monthly'} check-in saved`);
      navigate('back');
    }
  };
  const submitSurvey = async (row, isEdit) => {
    if (isEdit && !isAdminAuth && CABT_getApiMode() === 'supabase') {
      const original = (state.surveys || []).find(v => v.id === row.id);
      return requestEdit('surveys', row, original);
    }
    const mutator = (s) => ({
      ...s,
      surveys: isEdit
        ? (s.surveys || []).map(v => v.id === row.id ? row : v)
        : [...(s.surveys || []), row],
    });
    if (CABT_getApiMode() === 'supabase') {
      setState(mutator);
      try {
        if (isEdit) await CABT_api.updateSurvey(row.id, row);
        else        await CABT_api.submitSurvey(row);
        showToast('Survey saved');
      } catch (e) { showToast('Save failed'); console.error('[submitSurvey]', e); }
      navigate('back');
    } else {
      queueOrApply(mutator, 'Survey saved');
    }
  };
  const submitContract = (row) => queueOrApply(s => ({ ...s, clients: [...s.clients, row] }), 'Contract logged');
  const submitClient = (row) => queueOrApply(s => ({
    ...s,
    clients: [...s.clients, row],
    // If this was approved from a Stripe-pending row, mark it approved
    pendingClients: (s.pendingClients || []).map(p =>
      p.stripeCustomerId && p.stripeCustomerId === row.stripeCustomerId
        ? { ...p, status: 'approved', approvedAt: CABT_todayIso(), approvedAs: row.id }
        : p
    ),
  }), 'Client added');
  const submitAdjustment = (row) => queueOrApply(s => ({ ...s, adjustments: [...s.adjustments, row] }), 'Adjustment submitted');
  const approveAdj = (id) => { setState(s => ({ ...s, adjustments: s.adjustments.map(a => a.id === id ? { ...a, status: 'Paid' } : a) })); showToast('Approved'); };
  const rejectAdj = (id) => { setState(s => ({ ...s, adjustments: s.adjustments.map(a => a.id === id ? { ...a, status: 'Rejected' } : a) })); showToast('Rejected'); };
  // Optimistically reflect an edit-request decision in local state the moment
  // the API call succeeds, instead of waiting for the realtime push to round-
  // trip (Bobby 2026-06-22: approving felt slow — the card lingered in Pending
  // until realtime caught up). Idempotent: when realtime does arrive it maps
  // the same id to the same status, so no double-apply.
  const applyEditDecision = (reqId, status) => {
    setState(s => ({ ...s, editRequests: (s.editRequests || []).map(r => r.id === reqId ? { ...r, status } : r) }));
  };
  const assignCA = async (cid, caId) => {
    // Bobby 2026-06-22: assigning a CA "still shows not assigned" after going
    // back in. Root cause: this only updated local state and never persisted
    // to Supabase, so a reload reverted it. Now it writes through the API,
    // matching setCadence / setClientRates, and surfaces any failure.
    setState(s => ({ ...s, clients: s.clients.map(c => c.id === cid ? { ...c, assignedCA: caId } : c) }));
    if (CABT_getApiMode() === 'supabase') {
      try { await CABT_api.assignCA(cid, caId); showToast('CA assigned'); }
      catch (e) { showToast('Assign failed: ' + (e?.message || String(e))); console.error('[assignCA]', e); }
    } else {
      showToast('CA assigned');
    }
  };
  const setCadence = async (cid, cadence) => {
    setState(s => ({ ...s, clients: s.clients.map(c => c.id === cid ? { ...c, loggingCadence: cadence } : c) }));
    if (CABT_getApiMode() === 'supabase') {
      try { await CABT_api.updateClient(cid, { loggingCadence: cadence }); showToast(`Cadence: ${cadence}`); }
      catch (e) { showToast('Cadence save failed'); console.error('[setCadence]', e); }
    } else {
      showToast(`Cadence: ${cadence}`);
    }
  };
  const setClientRates = async (cid, rates, label = 'Rates') => {
    // rates = any subset of client fields (rates, tier, cancel, name, …);
    // only the changed keys are sent. `label` just customises the toast copy.
    setState(s => ({ ...s, clients: s.clients.map(c => c.id === cid ? { ...c, ...rates } : c) }));
    if (CABT_getApiMode() === 'supabase') {
      try { await CABT_api.updateClient(cid, rates); showToast(`${label} updated`); }
      catch (e) { showToast(`${label} save failed`); console.error('[setClientRates]', e); }
    } else {
      showToast(`${label} updated`);
    }
  };
  // Weekly Client Calls board — optimistically set an account's status, then
  // persist. Realtime echoes it to every other viewer. Throws on failure so the
  // board can surface a retry.
  const setCallStatus = async (id, status) => {
    setState(s => {
      const list = s.callStatuses || [];
      const next = list.some(x => x.id === id)
        ? list.map(x => x.id === id ? { ...x, status } : x)
        : [...list, { id, status }];
      return { ...s, callStatuses: next };
    });
    if (CABT_getApiMode() === 'supabase') {
      await CABT_api.upsertCallStatus({ id, status });
    }
  };
  // Kurt 2026-07-28: a shared free-text note per account on the Calls board.
  // Optimistic like setCallStatus; realtime echoes it to every viewer.
  const setCallNote = async (id, note) => {
    setState(s => {
      const list = s.callStatuses || [];
      const next = list.some(x => x.id === id)
        ? list.map(x => x.id === id ? { ...x, note } : x)
        : [...list, { id, note }];
      return { ...s, callStatuses: next };
    });
    if (CABT_getApiMode() === 'supabase') {
      await CABT_api.upsertCallStatus({ id, note });
    }
  };
  // Bobby 2026-05-15: dedicated "Cancel Account" flow — sets cancel_date +
  // cancel_reason directly on the clients row without going through monthly
  // metrics. Admin/owner only. Also supports retroactive edits on already-
  // cancelled clients (just open the same modal; it pre-fills existing values).
  const cancelAccount = async (clientId, cancelDate, cancelReason) => {
    const updates = { cancelDate, cancelReason };
    const isReactivating = cancelDate == null && cancelReason == null;
    setState(s => ({ ...s, clients: s.clients.map(c => c.id === clientId ? { ...c, ...updates } : c) }));
    if (CABT_getApiMode() === 'supabase') {
      try {
        await CABT_api.updateClient(clientId, updates);
        showToast(isReactivating ? 'Account reactivated' : 'Account updated');
      } catch (e) {
        showToast('Save failed');
        console.error('[cancelAccount]', e);
      }
    } else {
      showToast(isReactivating ? 'Account reactivated' : 'Account updated');
    }
  };

  const updateConfig = async (cfg) => {
    // Optimistic local update first
    setState(s => ({ ...s, config: cfg }));
    if (CABT_getApiMode() === 'supabase') {
      try {
        const sb = await CABT_sb();
        const { error } = await sb.from('config').update({
          values: cfg, updated_at: new Date().toISOString(),
        }).eq('id', 1);
        if (error) throw error;
        showToast('Formula Configurator saved');
        navigate('back');
      } catch (e) { showToast('Save failed: ' + (e?.message || 'unknown')); console.error('[updateConfig]', e); }
    } else {
      showToast('Formula Configurator saved');
      navigate('back');
    }
  };
  const syncNow = () => { setPendingSync(0); setIsOffline(false); setTweak('demoOffline', false); showToast('Synced ✓'); };
  const resetData = () => { CABT_resetState(); setState(CABT_loadState()); showToast('Reset to seed'); };

  // Auth role gating (hoisted up so the topbar can use it). Admin/owner/
  // integrator can switch tabs and pick which CA/sales rep they're viewing
  // as. Non-admins see ONLY their own data — no role switcher, no user picker.
  const dbRole = authedProfile?.role || state?.role || null;
  const isAdminAccount = (authedProfile && ['owner', 'admin', 'integrator'].includes(authedProfile.role))
    || (state && (state.role === 'owner' || state.role === 'admin' || state.role === 'integrator'));
  const allowedRoles = (() => {
    if (!dbRole) return ['CA'];
    if (dbRole === 'owner' || dbRole === 'admin' || dbRole === 'integrator') return ['CA', 'Sales', 'Admin'];
    if (dbRole === 'sales') return ['Sales'];
    return ['CA'];
  })();

  // For non-admin accounts, lock activeUserId to their OWN CA/sales row so
  // they can't see (let alone edit) other people's books. Bobby 2026-05-04:
  // "per account magkaiba ng account si Kurt at iba pa... sa admin lang may ganto."
  const myCaId    = authedProfile?.caId    || authedProfile?.ca_id    || null;
  const mySalesId = authedProfile?.salesId || authedProfile?.sales_id || null;
  React.useEffect(() => {
    if (isAdminAccount) return; // admins can browse anyone
    if (role === 'CA' && myCaId && activeUserId !== myCaId) setActiveUserId(myCaId);
    if (role === 'Sales' && mySalesId && activeUserId !== mySalesId) setActiveUserId(mySalesId);
  }, [isAdminAccount, role, myCaId, mySalesId, activeUserId]);

  // Active user
  const activeCA = state.cas.find(c => c.id === activeUserId);
  const activeRep = state.sales.find(s => s.id === activeUserId);

  // Resolve when role changes — admins fall back to first roster entry if
  // the active id no longer exists; non-admins are pinned via the effect above.
  React.useEffect(() => {
    if (!isAdminAccount) return;
    if (role === 'CA' && !state.cas.some(c => c.id === activeUserId)) setActiveUserId('CA-01');
    if (role === 'Sales' && !state.sales.some(s => s.id === activeUserId)) setActiveUserId('AE-01');
    setRoute({ name: 'home', params: {} });
    setHistory([]);
  }, [role]);

  // Title
  const titleFor = (r) => {
    if (role === 'CA') {
      return ({
        'home': 'Today',
        'book': 'Accounts',
        'dashboard': 'Dashboard',
        'profile': 'Me',
        'client-detail': 'Client',
        'log-metrics': 'Log Metrics',
        'log-event': 'Log Event',
        'log-survey': 'Survey',
        'scorecard': 'Scorecard',
      })[r.name] || 'CA';
    }
    if (role === 'Sales') {
      return ({
        'home': 'Sales',
        'commissions': 'Commissions',
        'log-contract': 'New Contract',
        'log-adjustment': 'Adjustment',
      })[r.name] || 'Sales';
    }
    return ({
      'home': 'Dashboard',
      'dashboard': 'Dashboard',
      'approvals': 'Approvals',
      'edits': 'Edit Requests',
      'reviews': 'Reviews Inbox',
      'bonus': 'Annual Bonus',
      'revenue': 'Revenue Ledger',
      'clients': 'Client Rollup',
      'client-calc': 'Client Calc',
      'add-client': 'Add Client',
      'pending-clients': 'Pending Clients',
      'questions': 'Open Questions',
      'formula-configurator': 'Formula Configurator',
      'roster': 'Roster',
      'more': 'More',
    })[r.name] || 'Admin';
  };

  // Render content
  const renderContent = () => {
    if (role === 'CA') {
      const ca = activeCA || state.cas[0];
      switch (route.name) {
        case 'home': return <CAHome state={state} ca={ca} theme={theme} navigate={navigate} />;
        case 'book': return <CABook state={state} ca={ca} theme={theme} navigate={navigate} initialFilter={route.params.filter}/>;
        case 'dashboard': return <AdminDashboard state={state} theme={theme} navigate={navigate} scopeCa={ca?.id}/>;
        case 'client-detail': return <ClientDetail state={state} ca={ca} theme={theme} clientId={route.params.clientId} navigate={navigate} isAdmin={isAdminAuth} onCancelAccount={cancelAccount} onUpdateClient={setClientRates} onRequestCancelReason={requestCancelReason}/>;
        case 'log-metrics': return <LogMetricsForm state={state} ca={ca} theme={theme} presetClientId={route.params.clientId} editingId={route.params.editingId} navigate={navigate} onSubmit={submitMetrics} onDelete={deleteMetric} isAdmin={isAdminAuth}/>;
        case 'log-event': return <LogEventForm state={state} ca={ca} theme={theme} presetClientId={route.params.clientId} editingId={route.params.editingId} navigate={navigate} onSubmit={submitEvent} onDelete={deleteEvent} isAdmin={isAdminAuth}/>;
        case 'log-survey': return <LogSurveyForm state={state} ca={ca} theme={theme} presetClientId={route.params.clientId} editingId={route.params.editingId} navigate={navigate} onSubmit={submitSurvey} onDelete={deleteSurvey} isAdmin={isAdminAuth}/>;
        case 'log-checkin': return <LogCheckinForm state={state} ca={ca} theme={theme} presetClientId={route.params.clientId} navigate={navigate} onSubmit={submitCheckin}/>;
        case 'scorecard': return <CAScorecard state={state} ca={ca} theme={theme} viz={t.scorecardViz}/>;
        case 'calls-board': return <CallsBoard state={state} theme={theme} navigate={navigate} isAdmin={isAdminAuth} onSetNote={setCallNote}/>;
        case 'profile': return <CAProfile state={state} ca={ca} theme={theme} navigate={navigate} profile={authedProfile} onSignOut={signOutHandler}/>;
        default: return null;
      }
    }
    if (role === 'Sales') {
      const rep = activeRep || state.sales[0];
      switch (route.name) {
        case 'home': return <SalesHome state={state} rep={rep} theme={theme} navigate={navigate} profile={authedProfile} onSignOut={signOutHandler}/>;
        case 'commissions': return <SalesCommissions state={state} rep={rep} theme={theme}/>;
        case 'log-contract': return <LogContractForm state={state} rep={rep} theme={theme} navigate={navigate} onSubmit={submitContract}/>;
        case 'log-adjustment': return <LogAdjustmentForm state={state} rep={rep} theme={theme} isAdmin={false} navigate={navigate} onSubmit={submitAdjustment}/>;
        default: return null;
      }
    }
    // Admin
    switch (route.name) {
      // Admin lands on Dashboard by default — Bobby 2026-05-05 ("mauuna yung
      // dashboard page"). Approvals moved to its own route + tab.
      case 'home':        return <AdminDashboard state={state} theme={theme} navigate={navigate}/>;
      case 'dashboard':   return <AdminDashboard state={state} theme={theme} navigate={navigate}/>;
      case 'approvals':   return <AdminApprovals state={state} theme={theme} navigate={navigate} onApprove={approveAdj} onReject={rejectAdj} onAssignCA={assignCA} onEditDecided={applyEditDecision}/>;
      case 'edits':       return <AdminEditApprovals state={state} theme={theme} onEditDecided={applyEditDecision}/>;
      case 'reviews':     return <AdminReviewsInbox state={state} theme={theme}/>;
      case 'bonus':       return <AdminAnnualBonus state={state} theme={theme}/>;
      case 'revenue':     return <AdminRevenueLedger state={state} theme={theme}/>;
      case 'clients':         return <AdminClientRollup state={state} theme={theme} navigate={navigate}/>;
      case 'client-calc':      return <AdminClientCalc state={state} theme={theme} clientId={route.params.clientId} navigate={navigate} onSetCadence={setCadence} onSetRates={setClientRates}/>;
      case 'client-detail':    return <ClientDetail state={state} ca={state.cas.find(c => c.id === state.clients.find(cl => cl.id === route.params.clientId)?.assignedCA) || state.cas[0]} theme={theme} clientId={route.params.clientId} navigate={navigate} isAdmin={isAdminAuth} onCancelAccount={cancelAccount} onUpdateClient={setClientRates} onRequestCancelReason={requestCancelReason}/>;
      // Bobby 2026-05-12: "I clicked to edit the metric and the screen is
      // blank." The CA role had log-* routes wired; the Admin role never
      // did, so navigating from Client Detail's tap-to-edit cards rendered
      // null (default case). Mirror the CA log-* routes here. We resolve
      // the CA via the client's assigned_ca → falls back to the first CA
      // if for some reason the client isn't tied to one yet.
      case 'log-metrics':      return <LogMetricsForm state={state} ca={state.cas.find(c => c.id === state.clients.find(cl => cl.id === route.params.clientId)?.assignedCA) || state.cas[0]} theme={theme} presetClientId={route.params.clientId} editingId={route.params.editingId} navigate={navigate} onSubmit={submitMetrics} onDelete={deleteMetric} isAdmin={isAdminAuth}/>;
      case 'log-event':        return <LogEventForm   state={state} ca={state.cas.find(c => c.id === state.clients.find(cl => cl.id === route.params.clientId)?.assignedCA) || state.cas[0]} theme={theme} presetClientId={route.params.clientId} editingId={route.params.editingId} navigate={navigate} onSubmit={submitEvent}   onDelete={deleteEvent}  isAdmin={isAdminAuth}/>;
      case 'log-survey':       return <LogSurveyForm  state={state} ca={state.cas.find(c => c.id === state.clients.find(cl => cl.id === route.params.clientId)?.assignedCA) || state.cas[0]} theme={theme} presetClientId={route.params.clientId} editingId={route.params.editingId} navigate={navigate} onSubmit={submitSurvey}  onDelete={deleteSurvey} isAdmin={isAdminAuth}/>;
      case 'log-checkin':      return <LogCheckinForm state={state} ca={state.cas.find(c => c.id === state.clients.find(cl => cl.id === route.params.clientId)?.assignedCA) || state.cas[0]} theme={theme} presetClientId={route.params.clientId} navigate={navigate} onSubmit={submitCheckin}/>;
      case 'add-client':       return <AdminAddClient state={state} theme={theme} navigate={navigate} onSubmit={submitClient} presetFromStripe={route.params.presetFromStripe}/>;
      case 'pending-clients':  return <AdminPendingClients state={state} theme={theme} navigate={navigate}/>;
      case 'questions':   return <AdminOpenQuestions state={state} theme={theme}/>;
      case 'audit-log':   return <AdminAuditLog state={state} theme={theme}/>;
      case 'formula-inspector': return <AdminFormulaInspector state={state} theme={theme} navigate={navigate}/>;
      case 'bulk-cadence': return <AdminBulkCadence state={state} theme={theme} navigate={navigate}/>;
      case 'formula-configurator': return <AdminConfig state={state} theme={theme} onUpdate={updateConfig}/>;
      case 'roster':      return <AdminRoster state={state} theme={theme} onReload={reloadLive} onToast={showToast}/>;
      case 'calls-board': return <CallsBoard state={state} theme={theme} navigate={navigate} isAdmin={isAdminAuth} onSetNote={setCallNote}/>;
      case 'more':        return <AdminMore theme={theme} navigate={navigate} profile={authedProfile} onSignOut={signOutHandler}/>;
      default: return null;
    }
  };

  // Tab bar
  // Tabs use the gsTeam custom nav-* icon set (defined in ui.jsx). They
  // share a consistent style — line stroke, optional accent dot — so the
  // bar reads as a single family.
  // Tab order — Bobby 2026-05-06:
  //   CA:    Today, Log, Dashboard, Accounts, Score, Me
  //   Sales: Home, Contract, Commissions, Adjust
  //   Admin: Dashboard, Clients, Revenue, Bonuses, Approvals, More
  const tabs = role === 'CA'
    ? [
        { name: 'home',       icon: 'nav-today',    label: 'Today' },
        { name: 'log-picker', icon: 'nav-log',      label: 'Log', primary: true },
        { name: 'dashboard',  icon: 'chart',        label: 'Dashboard' },
        { name: 'book',       icon: 'nav-accounts', label: 'Accounts' },
        { name: 'scorecard',  icon: 'nav-score',    label: 'Score' },
        { name: 'profile',    icon: 'nav-me',       label: 'Me' },
      ]
    : role === 'Sales'
    ? [
        { name: 'home',           icon: 'nav-today', label: 'Home' },
        { name: 'log-contract',   icon: 'nav-log',   label: 'Contract', primary: true },
        { name: 'commissions',    icon: 'cash',      label: 'Commissions' },
        { name: 'log-adjustment', icon: 'edit',      label: 'Adjust' },
      ]
    : [
        { name: 'home',      icon: 'chart',        label: 'Dashboard' },
        { name: 'clients',   icon: 'nav-accounts', label: 'Clients' },
        { name: 'revenue',   icon: 'nav-score',    label: 'Revenue' },
        { name: 'bonus',     icon: 'cash',         label: 'Bonuses' },
        { name: 'approvals', icon: 'shield',       label: 'Approvals' },
        { name: 'more',      icon: 'cog',          label: 'More' },
      ];

  // App body — used both inside and outside the iPhone frame.
  // Bobby 2026-05-15 bug fix: this used to be rendered as <Body .../>
  // JSX, which made React treat it as a NEW component type on every App
  // render (because the function reference changed each time App ran).
  // That unmounted + remounted the whole subtree on every theme toggle
  // or role switch, resetting every useState inside (e.g. the
  // "Include cancelled" checkbox on the dashboard). The component is
  // now invoked as a plain function call below so React reconciles its
  // children directly against App's tree.
  const Body = ({ width, height, isPhone }) => (
    <div style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.ink,
      display: 'flex', flexDirection: 'column', position: 'relative',
      fontFamily: theme.sans, fontSize: 14 * t.fontScale,
      overflow: 'hidden',
    }}>
      {/* Top bar — uses env(safe-area-inset-top) so the iPhone status bar /
         Dynamic Island doesn't overlap content in standalone PWA mode. */}
      <div style={{
        flexShrink: 0,
        padding: isPhone
          ? '54px 16px 8px'
          : 'calc(env(safe-area-inset-top, 0px) + 14px) 18px 10px',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 18px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 18px)',
        background: theme.bg,
        borderBottom: `1px solid ${theme.rule}`,
        position: 'relative', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <img
            src="/icons/icon-192.png"
            alt="gsTeam"
            style={{
              width: 28, height: 28, borderRadius: 7, objectFit: 'cover',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, fontSize: 12, color: theme.inkMuted, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            gsTeam Scoreboard
          </div>
          <ThemeToggle
            isDark={t.theme === 'athletic'}
            theme={theme}
            onToggle={() => {
              const next = t.theme === 'athletic' ? 'fintech' : 'athletic';
              setTweak({ theme: next, accentColor: THEMES[next].accent });
            }}
          />
          <RoleSwitcher role={role} onChange={setRole} theme={theme} allowedRoles={allowedRoles}/>
          {/* Sign out lives in role-specific menus (CA → Me, Admin → More).
             No global top-bar button — keeps the header tidy. */}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{
            fontFamily: theme.serif, fontSize: 28, fontWeight: 600, color: theme.ink,
            letterSpacing: -0.5, lineHeight: 1.1,
          }}>
            {history.length > 0 && (
              <button onClick={() => navigate('back')} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                marginRight: 6, color: theme.inkMuted, verticalAlign: -2,
              }}><Icon name="chev-l" size={22}/></button>
            )}
            {titleFor(route)}
          </div>
          {/* User picker — ONLY admins can switch which CA / sales rep
              they're viewing as. Non-admins see their own data only.
              Bobby 2026-05-04. */}
          {isAdminAccount && role === 'CA' && (
            <UserPicker
              value={activeUserId}
              onChange={setActiveUserId}
              users={state.cas.filter(c => c.active)}
              theme={theme}
            />
          )}
          {isAdminAccount && role === 'Sales' && (
            <UserPicker
              value={activeUserId}
              onChange={setActiveUserId}
              users={state.sales}
              theme={theme}
            />
          )}
        </div>
      </div>

      {/* Sync banner */}
      {(isOffline || pendingSync > 0) && (
        <div style={{
          padding: '8px 16px', background: STATUS.yellow + '20', color: '#8C5A00',
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <Icon name={isOffline ? 'wifi-off' : 'sync'} size={14}/>
          <span style={{ flex: 1 }}>
            {isOffline ? `Offline · ${pendingSync || 0} pending sync` : `${pendingSync} pending sync`}
          </span>
          {!isOffline && pendingSync > 0 && (
            <button onClick={syncNow} style={{ background: 'transparent', border: 'none', color: '#8C5A00', fontWeight: 700, fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>Sync now</button>
          )}
        </div>
      )}

      {/* PWA "New version available" banner */}
      {updateWorker && (
        <div style={{
          padding: '8px 16px', background: theme.accent + '20', color: theme.ink,
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          borderBottom: `1px solid ${theme.rule}`,
        }}>
          <Icon name="sync" size={14}/>
          <span style={{ flex: 1 }}>New version available</span>
          <button onClick={acceptUpdate} style={{
            background: theme.accent, color: theme.accentInk, border: 'none',
            fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Update</button>
        </div>
      )}

      {/* PWA "Install app" banner — only when installable + not already installed */}
      {installable && !installed && !isStandalone && (
        <div style={{
          padding: '8px 16px', background: '#0E1A35' + '15', color: theme.ink,
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          borderBottom: `1px solid ${theme.rule}`,
        }}>
          <Icon name="plus" size={14}/>
          <span style={{ flex: 1 }}>Install gsTeam to your home screen</span>
          <button onClick={() => setInstallable(false)} style={{
            background: 'transparent', border: 'none', color: theme.inkMuted,
            fontWeight: 600, fontSize: 11, padding: '4px 6px', cursor: 'pointer', fontFamily: 'inherit',
          }}>Later</button>
          <button onClick={promptInstall} style={{
            background: theme.accent, color: theme.accentInk, border: 'none',
            fontWeight: 700, fontSize: 12, padding: '4px 10px', borderRadius: 999,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Install</button>
        </div>
      )}

      {/* Admin-account users get a sidebar nav on desktop (≥1100px) for ALL
         tabs they view — CA, Sales, Admin. Mobile users + non-admin accounts
         still get the floating island tab bar. */}
      {(!isPhone && vw >= 1100) ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left sidebar nav — desktop admin only */}
          <nav style={{
            flexShrink: 0, width: 220,
            background: theme.bgElev,
            borderRight: `1px solid ${theme.rule}`,
            padding: '20px 14px',
            display: 'flex', flexDirection: 'column', gap: 4,
            overflowY: 'auto',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: theme.inkMuted,
              letterSpacing: 1, textTransform: 'uppercase',
              padding: '0 12px 8px',
            }}>{role === 'CA' ? 'Accounts' : role === 'Sales' ? 'Sales' : 'Admin'}</div>
            {tabs.map(tb => {
              const active = route.name === tb.name
                || (tb.name === 'log-picker' && (route.name === 'log-metrics' || route.name === 'log-event' || route.name === 'log-survey' || route.name === 'log-checkin'));
              return (
                <button
                  key={tb.name}
                  onClick={() => {
                    if (tb.name === 'log-picker') {
                      setLogSheet(true);
                      return;
                    }
                    setLogSheet(false); // Close picker if switching to a non-log tab
                    setHistory([]);
                    setRoute({ name: tb.name, params: {} });
                  }}
                  className="cabt-btn-press"
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '11px 12px',
                    background: active ? theme.accent + '15' : 'transparent',
                    border: 'none', borderRadius: 10,
                    color: active ? theme.ink : theme.inkSoft,
                    fontSize: 14, fontWeight: active ? 700 : 500, fontFamily: 'inherit',
                    cursor: 'pointer', textAlign: 'left',
                    WebkitTapHighlightColor: 'transparent',
                    position: 'relative',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {active && (
                    <span aria-hidden="true" style={{
                      position: 'absolute', left: 0, top: 8, bottom: 8,
                      width: 3, borderRadius: '0 3px 3px 0',
                      background: '#B5894A',
                    }}/>
                  )}
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, color: active ? theme.accent : theme.inkMuted,
                  }}>
                    <Icon name={tb.icon} size={18} stroke={active ? 2.1 : 1.85}/>
                  </span>
                  <span style={{ flex: 1 }}>{tb.label}</span>
                </button>
              );
            })}
            <div style={{ marginTop: 'auto', paddingTop: 16,
              fontSize: 10, fontWeight: 600, color: theme.inkMuted,
              letterSpacing: 1, textTransform: 'uppercase',
              padding: '12px 12px 0', borderTop: `1px solid ${theme.rule}`,
            }}>gsTeam Scoreboard</div>
          </nav>
          {/* Content area — full-width admin console (Bobby asked for full
             screen on all devices). No floating-nav clearance needed when
             sidebar is active. Inner content keeps a small horizontal pad
             so cards don't touch the sidebar border. */}
          <div style={{
            flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative',
            paddingBottom: 32,
          }}>
            <div style={{ width: '100%', padding: '0 16px' }}>
              {renderContent()}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        }}>
          <div style={{ margin: '0 auto' }}>
            {renderContent()}
          </div>
        </div>
      )}

      {/* Premium floating island tab bar.
         Glassmorphism: layered semi-transparent bg + heavy backdrop blur.
         Inner highlight at top + drop shadow + accent-tinted glow.
         Position fixed on real mobile / desktop, absolute inside iOS frame.
         Hidden when desktop-admin sidebar nav is active. */}
      {!(!isPhone && vw >= 1100) && (
      <div style={{
        position: isPhone ? 'absolute' : 'fixed',
        left: 12, right: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        // Layered glass: theme bg at 78% opacity + saturate-blur for depth
        background: t.theme === 'athletic'
          ? 'linear-gradient(180deg, rgba(28,32,42,0.92), rgba(20,24,32,0.88))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,246,238,0.88))',
        border: `1px solid ${t.theme === 'athletic' ? 'rgba(255,255,255,0.06)' : 'rgba(14,26,53,0.06)'}`,
        borderRadius: 999,
        padding: '8px 10px',
        boxShadow: t.theme === 'athletic'
          ? '0 18px 48px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 18px 48px rgba(14,26,53,0.18), 0 2px 6px rgba(14,26,53,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        zIndex: 100,
      }}>
        {tabs.map(tb => {
          const active = route.name === tb.name
            || (tb.name === 'log-picker' && (route.name === 'log-metrics' || route.name === 'log-event' || route.name === 'log-survey' || route.name === 'log-checkin'));
          return (
            <button
              key={tb.name}
              className="cabt-tab-btn"
              onClick={() => {
                if (tb.name === 'log-picker') { setLogSheet(true); return; }
                setLogSheet(false); // Close picker on any other tab tap
                setHistory([]); setRoute({ name: tb.name, params: {} });
              }}
              aria-label={tb.label}
              aria-current={active ? 'page' : undefined}
              style={{
                position: 'relative', flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '8px 0 6px',
                minHeight: 48,
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderRadius: 18,
                color: active ? theme.accent : theme.inkMuted, fontFamily: 'inherit',
                transition: 'color 0.18s ease, transform 0.08s ease',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              {/* Animated gradient pill highlight behind active non-primary tab */}
              {active && !tb.primary && (
                <span aria-hidden="true" style={{
                  position: 'absolute', inset: '4px 6px',
                  background: `linear-gradient(180deg, ${theme.accent}28, ${theme.accent}14)`,
                  borderRadius: 14, zIndex: 0,
                  animation: 'tabPillIn 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: `inset 0 1px 0 ${theme.accent}33`,
                }}/>
              )}
              {/* Tiny gold accent bar indicator above active label */}
              {active && !tb.primary && (
                <span aria-hidden="true" style={{
                  position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)',
                  width: 16, height: 2.5, borderRadius: 2,
                  background: theme.accent,
                  boxShadow: `0 0 8px ${theme.accent}99`,
                  zIndex: 2,
                  animation: 'tabPillIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                }}/>
              )}
              {tb.primary ? (
                <div style={{
                  width: 46, height: 46, borderRadius: 23,
                  background: `linear-gradient(180deg, ${theme.accent} 0%, ${theme.accent}E0 100%)`,
                  color: theme.accentInk,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 2,
                  boxShadow: active
                    ? `0 8px 22px ${theme.accent}77, 0 2px 4px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.35)`
                    : `0 6px 16px ${theme.accent}55, 0 2px 4px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.3)`,
                  transform: active ? 'translateY(-3px) scale(1.04)' : 'translateY(-1px) scale(1)',
                  transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease',
                  position: 'relative', zIndex: 1,
                }}><Icon name={tb.icon} size={22} stroke={2.4}/></div>
              ) : (
                <span style={{
                  position: 'relative', zIndex: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: active ? 'translateY(-1px)' : 'translateY(0)',
                  transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                  filter: active ? `drop-shadow(0 0 6px ${theme.accent}55)` : 'none',
                }}>
                  <Icon name={tb.icon} size={22} stroke={active ? 2.2 : 1.85}/>
                </span>
              )}
              <span style={{
                position: 'relative', zIndex: 1,
                fontSize: 10.5, fontWeight: active ? 700 : 600, letterSpacing: 0.2,
                transition: 'font-weight 0.15s ease, color 0.18s ease',
              }}>{tb.label}</span>
            </button>
          );
        })}
      </div>
      )}

      {/* Log picker sheet (CA) */}
      {logSheet && role === 'CA' && (
        <LogPickerSheet
          theme={theme}
          onClose={() => setLogSheet(false)}
          onPick={(name) => {
            setLogSheet(false);
            setHistory([]);
            setRoute({ name, params: {} });
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 100, transform: 'translateX(-50%)',
          background: theme.ink, color: theme.bg,
          padding: '10px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 6,
          animation: 'toastIn .25s ease',
        }}>
          <Icon name="check" size={14}/>{toast}
        </div>
      )}
    </div>
  );

  // Layout: phone frame on desktop with margins, full-bleed on small screens
  const [vw, setVw] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  React.useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  // Desktop admin mode: wide screen + admin role → full-bleed wide layout
  // (no iPhone frame). isAdminAccount + allowedRoles are hoisted above
  // (see the auth-role gating block).
  const isDesktop = vw >= 1100;

  // Hard guard: if the current `role` state isn't in allowedRoles (e.g., URL
  // forced it, or stale state from before role gating), snap it back.
  React.useEffect(() => {
    if (allowedRoles.length && !allowedRoles.includes(role)) {
      setRole(allowedRoles[0]);
    }
  }, [allowedRoles.join(','), role]);
  // Bobby 2026-05-04: desktop layout (sidebar nav, full-bleed content,
  // no iPhone frame) is now available to ALL roles on a wide screen, not
  // just admins. Keep the variable name for readability but drop the role
  // gate. CA / Sales users on a >=1100px monitor get the same console UX.
  const isDesktopWide = isDesktop;
  const useFrame = t.showFrame && vw >= 720 && !isDesktopWide;
  const isTablet = vw >= 720 && vw < 1100;

  // No internet on initial open → show dedicated offline screen IMMEDIATELY.
  // Render before auth-gate so we don't waste 5+ seconds on Supabase timeouts
  // before showing the offline UI. Once authed and connection drops, the
  // inline sync banner (lower) handles it instead so user keeps cached data.
  if (t.apiMode === 'supabase' && isOffline && !authedSession) {
    return <OfflineScreen onRetry={() => window.location.reload()}/>;
  }

  // Supabase mode requires a signed-in session before rendering the app.
  // Skip auth-gate entirely if offline — already handled above.
  if (t.apiMode === 'supabase' && !authedSession) {
    return (
      <AuthGate
        theme={theme}
        onAuthed={(sess, prof) => { setAuthedSession(sess); setAuthedProfile(prof); }}
      />
    );
  }
  if (t.apiMode === 'supabase' && loadingLive) {
    return (
      <div style={{
        minHeight: '100vh', background: theme.bg, color: theme.inkMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: theme.sans, fontSize: 13,
      }}>Loading your book…</div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', minHeight: '100dvh',
      backgroundColor: useFrame
        ? (t.theme === 'athletic' ? '#06080C' : t.theme === 'fintech' ? '#EEF1F5' : '#E8E2D5')
        : theme.bg,
      backgroundImage: useFrame
        ? (t.theme === 'athletic'
            ? `radial-gradient(circle at 30% 20%, rgba(232,255,90,0.05), transparent 55%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.03), transparent 60%)`
            : t.theme === 'fintech'
            ? `radial-gradient(circle at 30% 20%, rgba(79,70,229,0.05), transparent 55%), radial-gradient(circle at 80% 80%, rgba(15,23,42,0.04), transparent 60%)`
            : `radial-gradient(circle at 30% 20%, rgba(14,26,53,0.04), transparent 50%), radial-gradient(circle at 80% 80%, rgba(181,137,74,0.06), transparent 60%)`)
        : 'none',
      display: 'flex', alignItems: useFrame ? 'center' : 'stretch',
      justifyContent: 'center',
      fontFamily: theme.sans,
      padding: useFrame ? '40px 20px' : 0,
    }}>
      <style>{`
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes sheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes scrimIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tabPillIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes modalIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        body { margin: 0; }
        * { box-sizing: border-box; }
        input, select, button, textarea { font-family: inherit; }
        .cabt-tab-btn:active { transform: scale(0.94); }
        .cabt-input-wrap { position: relative; }
        .cabt-input { transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease; }
        .cabt-input:focus { outline: none; box-shadow: 0 0 0 3px var(--cabt-accent-soft, rgba(232,255,90,0.18)); }
        .cabt-btn-press { transition: transform 0.08s ease, opacity 0.15s ease; }
        .cabt-btn-press:active { transform: scale(0.97); }
        .cabt-btn-press:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.001ms !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      {useFrame ? (
        <IOSDevice width={402} height={874} dark={t.theme === 'athletic'}>
          {Body({ width: 402, height: 874, isPhone: true })}
        </IOSDevice>
      ) : isDesktopWide ? (
        <div style={{
          width: '100%', height: '100dvh', maxHeight: '100dvh',
        }}>
          {Body({ width: '100%', height: '100dvh', isPhone: false })}
        </div>
      ) : (
        <div style={{ width: '100%', height: '100dvh', maxHeight: '100dvh' }}>
          {Body({ width: '100%', height: '100dvh', isPhone: false })}
        </div>
      )}
      {/* Branded confirm dialog — portal-rendered, centered on viewport,
         responsive across mobile + desktop. Replaces window.confirm(). */}
      <ConfirmDialog
        open={!!confirmState}
        theme={theme}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel || 'Confirm'}
        cancelLabel={confirmState?.cancelLabel || 'Cancel'}
        danger={!!confirmState?.danger}
        onConfirm={() => {
          const fn = confirmState?.onConfirm;
          if (fn) Promise.resolve(fn()).finally(closeConfirm);
          else closeConfirm();
        }}
        onCancel={closeConfirm}
      />
    </div>
  );
}

// "No Internet Connection" full-screen page shown when the app opens
// without connectivity (PWA or browser, iOS or Android).
// On-brand: navy + cream + gold accent. Auto-redirects on reconnect.
function OfflineScreen({ onRetry }) {
  const [reconnecting, setReconnecting] = React.useState(false);

  React.useEffect(() => {
    const back = () => {
      setReconnecting(true);
      setTimeout(() => window.location.replace('/'), 600);
    };
    window.addEventListener('online', back);
    const id = setInterval(() => {
      if (!navigator.onLine) return;
      fetch('/manifest.webmanifest', { method: 'HEAD', cache: 'no-store' })
        .then((r) => { if (r && r.ok) back(); })
        .catch(() => {});
    }, 4000);
    return () => { window.removeEventListener('online', back); clearInterval(id); };
  }, []);

  const closeApp = () => {
    window.close();
    setTimeout(() => { window.location.href = 'about:blank'; }, 100);
  };

  return (
    <div style={{
      minHeight: '100vh', minHeight: '100dvh',
      background: '#F5EFE4', color: '#0E1A35',
      fontFamily: '-apple-system, "Segoe UI", "Helvetica Neue", system-ui, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'max(env(safe-area-inset-top), 24px) max(env(safe-area-inset-right), 24px) max(env(safe-area-inset-bottom), 24px) max(env(safe-area-inset-left), 24px)',
    }}>
      {reconnecting && (
        <div style={{
          position: 'fixed', left: '50%', top: 'calc(env(safe-area-inset-top, 0px) + 24px)',
          transform: 'translateX(-50%)',
          background: '#0E1A35', color: '#F5EFE4',
          padding: '12px 20px', borderRadius: 999,
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 100,
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#B5894A' }}/>
          Back online · reloading…
        </div>
      )}
      <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{
          width: 132, height: 132, borderRadius: '50%',
          background: 'rgba(14, 26, 53, 0.08)',
          border: '1px solid rgba(14, 26, 53, 0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 28,
        }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#0E1A35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 015.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0122.58 9"/>
            <path d="M1.42 9a15.91 15.91 0 014.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 016.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </div>
        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 24, fontWeight: 600, color: '#0E1A35',
          margin: '0 0 12px', letterSpacing: -0.4,
        }}>No Internet Connection</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#5C6478', margin: '0 0 36px', padding: '0 8px' }}>
          Please check your Wi-Fi or mobile data and try again.
        </p>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={onRetry || (() => window.location.reload())} style={{
            width: '100%', padding: 16, borderRadius: 14,
            background: '#0E1A35', color: '#F5EFE4', border: 'none',
            boxShadow: '0 4px 12px rgba(14, 26, 53, 0.18)',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            letterSpacing: 0.1,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/>
              <path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/>
            </svg>
            Refresh
          </button>
          <button onClick={closeApp} style={{
            width: '100%', padding: 16, borderRadius: 14,
            background: 'transparent', color: '#0E1A35', border: '1.5px solid rgba(14, 26, 53, 0.18)',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            letterSpacing: 0.1,
          }}>
            Close App
          </button>
        </div>
        <div style={{
          fontSize: 11, color: '#B5894A', marginTop: 28,
          letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600,
        }}>gsTeam</div>
        <div style={{ width: 28, height: 2, background: '#B5894A', marginTop: 14 }}/>
      </div>
    </div>
  );
}

function LogPickerSheet({ theme, onClose, onPick }) {
  const items = [
    { name: 'log-checkin', icon: 'edit',      label: 'Check-in',        desc: 'Concern, win, account + agency actions' },
    { name: 'log-metrics', icon: 'chart',     label: 'Metrics',         desc: 'Leads, ad spend, MRR, attrition (weekly or monthly per client)' },
    { name: 'log-event',   icon: 'cal',       label: 'Growth event',    desc: 'Workshop, gear sale, milestone' },
    { name: 'log-survey',  icon: 'star',      label: 'Client survey',   desc: 'Satisfaction snapshot' },
  ];
  // Sheet must sit ABOVE the floating tab bar. Tab bar height ~60px + 14px gap
  // + safe-area-inset-bottom = the clearance we need below the Cancel button.
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 90,
      background: 'rgba(8, 12, 24, 0.45)',
      animation: 'scrimIn .18s ease',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', background: theme.surface, color: theme.ink,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        // Bottom padding clears the floating tab bar (~60px height + 14px gap
        // + safe-area-inset-bottom) plus a 16px breathing buffer.
        padding: '12px 0 calc(env(safe-area-inset-bottom, 0px) + 102px)',
        boxShadow: '0 -16px 48px rgba(0,0,0,0.22), 0 -2px 8px rgba(0,0,0,0.08)',
        animation: 'sheetIn .22s cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: theme.rule, margin: '4px auto 14px',
        }}/>
        <div style={{
          padding: '0 20px 12px',
          fontSize: 11, color: theme.inkMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700,
        }}>
          What are you logging?
        </div>
        {items.map((it, i) => (
          <button key={it.name} onClick={() => onPick(it.name)} className="cabt-btn-press" style={{
            display: 'flex', alignItems: 'center', gap: 14, width: '100%',
            background: 'transparent', border: 'none',
            padding: '14px 20px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
            borderTop: i === 0 ? `1px solid ${theme.rule}` : 'none',
            borderBottom: `1px solid ${theme.rule}`,
            WebkitTapHighlightColor: 'transparent',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: theme.accent + '15', color: theme.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name={it.icon} size={20}/></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>{it.label}</div>
              <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 1 }}>{it.desc}</div>
            </div>
            <Icon name="chev-r" size={16} color={theme.inkMuted}/>
          </button>
        ))}
        <button onClick={onClose} className="cabt-btn-press" style={{
          display: 'block', width: 'calc(100% - 40px)', margin: '16px 20px 0',
          padding: '14px', background: 'transparent', border: `1.5px solid ${theme.rule}`,
          borderRadius: 12, color: theme.ink, fontSize: 15, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          WebkitTapHighlightColor: 'transparent',
        }}>Cancel</button>
      </div>
    </div>
  );
}

function ThemeToggle({ isDark, theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: 30, height: 28, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        border: `1px solid ${theme.rule}`,
        borderRadius: 999,
        color: theme.inkSoft,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background .15s, color .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = theme.ink; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = theme.inkSoft; }}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={14} stroke={1.8}/>
    </button>
  );
}

// Role switcher labels — internal role values stay 'CA' | 'Sales' | 'Admin'
// (used everywhere downstream); only the on-screen pill text changes.
// Bobby 2026-05-04: rename "CA" → "Accounts".
const ROLE_LABEL = { CA: 'Accounts', Sales: 'Sales', Admin: 'Admin' };

function RoleSwitcher({ role, onChange, theme, allowedRoles }) {
  const roles = allowedRoles && allowedRoles.length ? allowedRoles : ['CA', 'Sales', 'Admin'];
  // If only one tab is allowed, render a static pill — no clickable switcher.
  // Prevents non-admins from even seeing the pretense of choice.
  if (roles.length === 1) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center',
        background: theme.surface, borderRadius: 999, padding: '5px 12px',
        border: `1px solid ${theme.rule}`,
        fontSize: 11, fontWeight: 700, color: theme.ink, fontFamily: 'inherit',
        letterSpacing: 0.2,
      }}>{ROLE_LABEL[roles[0]] || roles[0]}</div>
    );
  }
  return (
    <div style={{ display: 'flex', background: theme.rule, borderRadius: 999, padding: 2, gap: 0 }}>
      {roles.map(r => (
        <button key={r} onClick={() => onChange(r)} style={{
          padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 999,
          background: role === r ? theme.surface : 'transparent',
          color: role === r ? theme.ink : theme.inkMuted,
          cursor: 'pointer', fontFamily: 'inherit', boxShadow: role === r ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}>{ROLE_LABEL[r] || r}</button>
      ))}
    </div>
  );
}

function UserPicker({ value, onChange, users, theme }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      backgroundColor: theme.surface, color: theme.ink, border: `1px solid ${theme.rule}`,
      borderRadius: 999, padding: '5px 26px 5px 10px', fontSize: 11, fontWeight: 600,
      fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${theme.inkMuted.replace('#', '%23')}' d='M0 0h10L5 6z'/></svg>")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 8px center',
      backgroundSize: '10px 6px',
    }}>
      {users.map(u => <option key={u.id} value={u.id}>{u.id} · {u.name}</option>)}
    </select>
  );
}


ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
