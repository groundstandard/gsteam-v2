// auth-gate.jsx — Email + password sign-in for Supabase mode.
// Dead simple: type email + password, hit Sign in. No magic link, no OAuth.
// Account creation happens in Supabase Studio (owner is the gatekeeper).

function AuthGate({ theme, onAuthed }) {
  const [phase, setPhase] = React.useState('checking');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [showReset, setShowReset] = React.useState(false);
  const [resetEmail, setResetEmail] = React.useState('');
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetError, setResetError] = React.useState(null);
  const [resetSent, setResetSent] = React.useState(false);
  const [hardResetting, setHardResetting] = React.useState(false);

  // Detect missing/broken config — when this is true, sign-in will throw
  // "supabaseKey is required" and the user gets stuck. Show a recovery banner.
  const configBroken = typeof window !== 'undefined' && (
    !window.CABT_CONFIG ||
    !window.CABT_CONFIG.SUPABASE_URL ||
    !window.CABT_CONFIG.SUPABASE_ANON_KEY
  );

  // Emergency: unregister all service workers, clear caches + localStorage,
  // then hard-reload bypassing the SW. This recovers PWAs that cached a stale
  // config.js (empty SUPABASE_ANON_KEY) before the env vars were set in Vercel.
  const hardReset = async () => {
    if (hardResetting) return;
    setHardResetting(true);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      try { localStorage.clear(); sessionStorage.clear(); } catch (_e) {}
    } catch (_e) { /* swallow — best effort */ }
    // Force a real network reload bypassing any leftover state.
    window.location.replace('/?cb=' + Date.now());
  };

  const openReset = () => {
    setResetEmail(email || '');
    setResetError(null);
    setResetSent(false);
    setShowReset(true);
  };
  const closeReset = () => {
    setShowReset(false);
    setResetBusy(false);
  };
  const onResetSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) { setResetError('Enter a valid email.'); return; }
    setResetBusy(true); setResetError(null);
    try {
      await CABT_resetPassword(resetEmail);
      setResetSent(true);
    } catch (e2) {
      setResetError(e2.message || 'Could not send reset link.');
    } finally {
      setResetBusy(false);
    }
  };

  // On mount: check for existing session.
  // 1. Read localStorage directly first — if Supabase has a stored auth token,
  //    assume session is being recovered and stay in checking state.
  // 2. If no stored token, fall through to login form immediately (no wait).
  // 3. The onAuthStateChange listener handles the eventual session recovery.
  // 4. Outer 10s safety net only triggers if Supabase truly hangs.
  React.useEffect(() => {
    let cancelled = false;
    // Check localStorage for any Supabase auth token (key: sb-<ref>-auth-token)
    let hasStoredSession = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const v = localStorage.getItem(k);
          if (v && v.length > 20) { hasStoredSession = true; break; }
        }
      }
    } catch (_e) { /* localStorage may be disabled */ }

    if (!hasStoredSession) {
      // No stored session — go straight to login form, skip the verify step.
      setPhase('needs-login');
      return;
    }

    // Skip the network round-trip entirely if browser reports offline.
    // No point burning 2.5s timeouts when we know there's no network.
    // The onAuthStateChange listener below will pick up the session when the
    // user comes back online.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPhase('needs-login');
      return;
    }

    // Stored session exists — verify it. Long safety net (10s) so we don't
    // flicker to login form on slow networks; the listener below picks it up
    // when Supabase finishes recovery.
    const timeoutId = setTimeout(() => {
      if (!cancelled) setPhase('needs-login');
    }, 10000);
    (async () => {
      try {
        const session = await CABT_currentSession();
        if (cancelled) return;
        if (!session) return; // no session — wait for listener or timeout
        clearTimeout(timeoutId);
        const prof = await CABT_currentProfile();
        if (cancelled) return;
        onAuthed && onAuthed(session, prof);
      } catch (e) {
        if (!cancelled) {
          clearTimeout(timeoutId);
          setError(e.message || String(e));
          setPhase('needs-login');
        }
      }
    })();
    let unsub = null;
    CABT_sb().then(sb => {
      const { data } = sb.auth.onAuthStateChange(async (_evt, session) => {
        if (session && !cancelled) {
          clearTimeout(timeoutId);
          const prof = await CABT_currentProfile();
          onAuthed && onAuthed(session, prof);
        }
      });
      unsub = data?.subscription;
    }).catch(() => {});
    return () => { cancelled = true; clearTimeout(timeoutId); if (unsub) unsub.unsubscribe(); };
  }, []);

  const onSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!email || !email.includes('@')) { setError('Enter a valid email.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setBusy(true); setError(null);
    try {
      const { session, profile } = await CABT_signInWithPassword(email, password);
      if (session) onAuthed && onAuthed(session, profile);
    } catch (e2) {
      setError(e2.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'checking') {
    return (
      <div style={{
        minHeight: '100vh', background: theme.bg, color: theme.inkMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: theme.sans, fontSize: 13,
      }}>
        Verifying session…
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: theme.bg, color: theme.ink,
      fontFamily: theme.sans, padding: '0 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 24,
    }}>
      <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <img
          src="/icons/icon-192.png"
          alt="gsTeam"
          style={{
            width: 56, height: 56, borderRadius: 14, objectFit: 'cover',
            margin: '0 auto 18px', display: 'block',
          }}
        />
        <div style={{
          fontFamily: theme.serif, fontSize: 32, fontWeight: 600, letterSpacing: -0.5,
          lineHeight: 1.1, marginBottom: 10,
        }}>gsTeam Scoreboard</div>
        <div style={{
          fontSize: 13, color: theme.inkSoft, lineHeight: 1.55,
          fontFamily: theme.serif, fontStyle: 'italic', marginBottom: 24,
        }}>
          Sign in with your email and password.
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              background: theme.bgElev || theme.surface, color: theme.ink,
              border: `1px solid ${theme.rule}`, fontFamily: 'inherit',
              fontSize: 15, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              background: theme.bgElev || theme.surface, color: theme.ink,
              border: `1px solid ${theme.rule}`, fontFamily: 'inherit',
              fontSize: 15, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button type="submit" disabled={busy} style={{
            width: '100%', padding: '14px 18px', borderRadius: 12,
            background: theme.accent, color: theme.accentInk, border: 'none',
            fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={openReset}
            disabled={busy}
            style={{
              background: 'none', border: 'none', padding: '6px 0', marginTop: 2,
              fontFamily: 'inherit', fontSize: 12, color: theme.inkMuted,
              textDecoration: 'underline', cursor: busy ? 'wait' : 'pointer',
              alignSelf: 'center',
            }}
          >
            Forgot password?
          </button>
        </form>

        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 8,
            background: '#FFE5E5', color: '#9B1B1B', fontSize: 12, textAlign: 'left',
          }}>
            <strong>Couldn't sign in.</strong> {error}
          </div>
        )}

        {/* Config-broken recovery banner — appears when window.CABT_CONFIG
            is missing/empty (e.g., a stale cached config.js from before
            env vars were set). One-tap recovery: clear caches + reload. */}
        {configBroken && (
          <div style={{
            marginTop: 16, padding: '14px 16px', borderRadius: 12,
            background: '#FFF4D6', color: '#5A3F00', border: '1px solid #E5C66E',
            fontSize: 12, lineHeight: 1.55, textAlign: 'left',
          }}>
            <strong style={{ fontSize: 13 }}>App needs a refresh.</strong>
            <div style={{ marginTop: 4, marginBottom: 10 }}>
              The app is using an outdated cache and can't connect. Tap below to
              clear it and reload — you'll need to sign in again.
            </div>
            <button
              type="button"
              onClick={hardReset}
              disabled={hardResetting}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: '#5A3F00', color: '#FFF4D6', border: 'none',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                cursor: hardResetting ? 'wait' : 'pointer',
                opacity: hardResetting ? 0.6 : 1,
              }}
            >
              {hardResetting ? 'Clearing…' : 'Clear cache and reload'}
            </button>
          </div>
        )}

        <div style={{ marginTop: 24, fontSize: 11, color: theme.inkMuted, lineHeight: 1.6, textAlign: 'center' }}>
          No account? Ask Bobby to create one for you.
        </div>

        {/* Always-available "stuck?" escape hatch — small link below.
            For users who load fine but get stuck verifying / signing in. */}
        {!configBroken && (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button
              type="button"
              onClick={hardReset}
              disabled={hardResetting}
              style={{
                background: 'none', border: 'none', padding: 4,
                fontFamily: 'inherit', fontSize: 11, color: theme.inkMuted,
                textDecoration: 'underline', cursor: hardResetting ? 'wait' : 'pointer',
              }}
            >
              {hardResetting ? 'Clearing…' : 'Stuck? Clear cache and reload'}
            </button>
          </div>
        )}
      </div>

      {showReset && (
        <div
          onClick={closeReset}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.surface || theme.bg, color: theme.ink,
              borderRadius: 16, padding: '22px 22px 20px', width: '100%', maxWidth: 360,
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)', position: 'relative',
              fontFamily: theme.sans,
            }}
          >
            <button
              type="button"
              onClick={closeReset}
              aria-label="Close"
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'none', border: 'none', color: theme.inkMuted,
                fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 6,
              }}
            >×</button>

            {!resetSent ? (
              <>
                <div style={{
                  fontFamily: theme.serif, fontSize: 20, fontWeight: 600,
                  letterSpacing: -0.3, marginBottom: 6,
                }}>Reset your password</div>
                <div style={{
                  fontSize: 12, color: theme.inkSoft, lineHeight: 1.5, marginBottom: 16,
                }}>
                  Enter your email and we'll send you a link to set a new password.
                </div>
                <form onSubmit={onResetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    disabled={resetBusy}
                    autoFocus
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 10,
                      background: theme.bgElev || theme.bg, color: theme.ink,
                      border: `1px solid ${theme.rule}`, fontFamily: 'inherit',
                      fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <button type="submit" disabled={resetBusy} style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    background: theme.accent, color: theme.accentInk, border: 'none',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                    cursor: resetBusy ? 'wait' : 'pointer', opacity: resetBusy ? 0.6 : 1,
                  }}>
                    {resetBusy ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>
                {resetError && (
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 8,
                    background: '#FFE5E5', color: '#9B1B1B', fontSize: 12, lineHeight: 1.45,
                  }}>{resetError}</div>
                )}
              </>
            ) : (
              <>
                <div style={{
                  fontFamily: theme.serif, fontSize: 20, fontWeight: 600,
                  letterSpacing: -0.3, marginBottom: 8,
                }}>Check your email</div>
                <div style={{
                  fontSize: 13, color: theme.inkSoft, lineHeight: 1.55, marginBottom: 18,
                }}>
                  If an account exists for <strong style={{ color: theme.ink }}>{resetEmail}</strong>,
                  we sent a link to reset your password. The link expires in 1 hour.
                </div>
                <button
                  type="button"
                  onClick={closeReset}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    background: theme.accent, color: theme.accentInk, border: 'none',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AuthGate });
