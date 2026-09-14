// calls-board.jsx — Weekly Client Calls board.
//
// A live, shared weekly call schedule. Each account cell is auto-colored by that
// account's current score (green = on track, amber = watch, red = at risk), so
// the board doubles as a health map. Tap any account to jot a shared note for
// that call; notes save to Supabase and sync to every viewer in real time.
// Kurt 2026-07-28: "auto-color by score" + "just a note" field for the calls.

// Score status → colour. Anything without a matched account / score is neutral
// (theme-aware, resolved at render).
const CALLS_SCORE_COLORS = {
  green:  { bg: '#2f9e5f', fg: '#ffffff', label: 'On track' },
  yellow: { bg: '#d9a520', fg: '#241a00', label: 'Watch' },
  red:    { bg: '#d0392c', fg: '#ffffff', label: 'At risk' },
};

// Fixed dark header — legible in both themes (matches the original navy graphic).
const CALLS_HEADER_BG = '#211a3a';

const CALLS_DAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const CALLS_TIMES = [
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM',
];
// grid[time] = [Mon, Tue, Wed, Thu, Fri] account label or null.
const CALLS_GRID = {
  '9:30 AM':  ['All Hands (GSA)', 'All in Jiu-Jitsu', null, null, null],
  '10:00 AM': [null, 'Simpleman', null, null, 'Bodega'],
  '10:30 AM': [null, 'SOMA MVMT', null, null, null],
  '11:00 AM': [null, null, null, 'Royal', 'Cobrinha SW'],
  '11:30 AM': ['Infinity', 'Hamptons JJ', 'GFV', 'Signature', 'Tetris Orlando'],
  '12:00 PM': ['Soulcraft', null, 'Mason Dixon JJ', 'Killer B', null],
  '12:30 PM': ['Modernman', 'almighty', 'Riptide', 'Breathe', 'Champion'],
  '1:00 PM':  ['Fresno', 'JJ Hub', null, null, 'Edgar'],
  '1:30 PM':  [null, null, null, 'Scottsdale', null],
  '2:00 PM':  ['Miami', 'Jiu Jitsu Modern', 'Hammer', null, 'San Jose'],
  '2:30 PM':  ['Longos', 'OM BJJ', 'Orlando 10P', null, 'Miguel'],
  '3:00 PM':  ['Mythic', 'Sugoi', 'Universal', 'Artistry', 'Champion Chiro'],
  '3:30 PM':  ['Range', 'WNK', 'Grit', null, null],
  '4:00 PM':  ['Academy Eden Prarier', null, 'Verde Valley', 'Centerline', 'Robby'],
};

// Board labels are short / abbreviated; map each to a distinctive fragment of the
// real account name so we can look up its score. Labels with no entry here
// (internal meetings like "All Hands", or accounts we can't resolve) stay neutral.
const CALLS_CLIENT_MATCH = {
  'All in Jiu-Jitsu':    'all in',
  'Simpleman':           'simple man',
  'Bodega':              'bodega',
  'SOMA MVMT':           'soma mvmt',
  'Royal':               'royal jiu',
  'Cobrinha SW':         'cobrinha',
  'Hamptons JJ':         'hamptons',
  'GFV':                 'farmington',
  'Signature':           'singature',
  'Tetris Orlando':      'tetris',
  'Soulcraft':           'soulcraft',
  'San Jose':            'san jose',
  'Mason Dixon JJ':      'mason dixon',
  'Killer B':            'killer b',
  'Jiu Jitsu Modern':    'jitsu modern',
  'Modernman':           'modern man barber',
  'almighty':            'almighty',
  'Riptide':             'rip tide',
  'Breathe':             'breathe',
  'Champion':            'champion martial',
  'Fresno':              'fresno',
  'JJ Hub':              'jitsu hub',
  'Infinity':            'infinity bjj',
  'Scottsdale':          'scottsdale',
  'Miami':               'miami',
  'Hammer':              'hammer sports',
  'Longos':              'longo',
  'OM BJJ':              'om bjj',
  'Orlando 10P':         'orlando',
  'Sugoi':               'sugoi',
  'Universal':           'universal mma',
  'Artistry':            'artistry',
  'Champion Chiro':      'chiropractic',
  'Range':               'range bjj',
  'Grit':                'grit bjj',
  'Mythic':              'mythic',
  'Academy Eden Prarier':'eden prairie',
  'Verde Valley':        'verde valley',
  'Centerline':          'centerline',
  'Robby':               'roberts family',
};

function CallsBoard({ state, theme, navigate, isAdmin, onSetNote }) {
  const [editing, setEditing] = React.useState(null); // account label being noted
  const [draft, setDraft]     = React.useState('');
  const [busy, setBusy]       = React.useState(false);
  const [err, setErr]         = React.useState(false);

  // Live note per account label.
  const noteById = React.useMemo(() => {
    const m = {};
    (state.callStatuses || []).forEach(s => { if (s && s.id) m[s.id] = s.note || ''; });
    return m;
  }, [state.callStatuses]);

  // Match each board label to a client and compute its score status.
  const scoreByLabel = React.useMemo(() => {
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const clients = state.clients || [];
    const map = {};
    Object.entries(CALLS_CLIENT_MATCH).forEach(([label, frag]) => {
      const nf = norm(frag);
      const client = clients.find(c => norm(c.name).includes(nf));
      if (!client) return;
      const sub = CABT_clientSubScores(client, state.monthlyMetrics, state.surveys, state.config, new Date(), state.weeklyMetrics || []);
      map[label] = { client, score: sub.composite, status: CABT_scoreToStatus(sub.composite) };
    });
    return map;
  }, [state.clients, state.monthlyMetrics, state.weeklyMetrics, state.surveys, state.config]);

  const cellColors = (label) => {
    const s = scoreByLabel[label];
    const sc = s && CALLS_SCORE_COLORS[s.status];
    return sc || { bg: theme.bgElev, fg: theme.ink }; // no match / no score → neutral
  };

  const openNote  = (label) => { setEditing(label); setDraft(noteById[label] || ''); setErr(false); };
  const closeNote = () => { if (!busy) setEditing(null); };
  const saveNote  = async () => {
    setBusy(true); setErr(false);
    try {
      await onSetNote(editing, draft.trim());
      setEditing(null);
    } catch (e) {
      console.error('[callNote]', e);
      setErr(true);
    }
    setBusy(false);
  };

  const headCell = {
    padding: '11px 8px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
    textTransform: 'uppercase', color: '#f4f2fa', background: CALLS_HEADER_BG,
    whiteSpace: 'nowrap', borderBottom: '2px solid rgba(255,255,255,0.10)',
  };

  const editScore = editing ? scoreByLabel[editing] : null;

  return (
    <div style={{ padding: '8px 16px 100px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontFamily: theme.serif, fontSize: 24, fontWeight: 700, color: theme.ink, letterSpacing: -0.4 }}>
          Weekly Client Calls
        </div>
        <div style={{ fontSize: 13, color: theme.inkMuted, marginTop: 2 }}>
          Each account is colored by its current score. Tap an account to add a note for that call — notes are shared live.
        </div>
      </div>

      {/* Legend */}
      <Card theme={theme} padding={12}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: theme.inkMuted }}>Score</span>
          {['green', 'yellow', 'red'].map(k => {
            const c = CALLS_SCORE_COLORS[k];
            return (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: theme.ink }}>
                <span style={{ width: 13, height: 13, borderRadius: 4, background: c.bg, border: `1px solid ${theme.rule}` }}/>
                {c.label}
              </span>
            );
          })}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: theme.ink }}>
            <span style={{ width: 13, height: 13, borderRadius: 4, background: theme.bgElev, border: `1px solid ${theme.rule}` }}/>
            No score
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: theme.ink }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: theme.ink }}/>
            Has note
          </span>
        </div>
      </Card>

      {/* Grid */}
      <div style={{ overflowX: 'auto', border: `1px solid ${theme.rule}`, borderRadius: theme.radius, background: theme.surface }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', width: 76, minWidth: 76 }}>Time</th>
              {CALLS_DAYS.map(d => (
                <th key={d} style={{ ...headCell, textAlign: 'center' }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CALLS_TIMES.map(time => {
              const rowCells = CALLS_GRID[time] || [null, null, null, null, null];
              return (
                <tr key={time}>
                  <td style={{
                    padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#f4f2fa',
                    background: CALLS_HEADER_BG, whiteSpace: 'nowrap', textAlign: 'center',
                    position: 'sticky', left: 0, zIndex: 1,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>{time}</td>
                  {rowCells.map((label, di) => {
                    if (!label) {
                      return <td key={di} style={{ borderBottom: `1px solid ${theme.rule}`, borderLeft: `1px solid ${theme.rule}`, background: theme.surface, height: 42 }}/>;
                    }
                    const c = cellColors(label);
                    const sc = scoreByLabel[label];
                    const hasNote = !!(noteById[label] && noteById[label].trim());
                    const scoreTxt = sc ? (sc.score != null ? `score ${(sc.score * 100).toFixed(0)}` : 'no score yet') : 'no score';
                    return (
                      <td key={di} style={{ borderBottom: `1px solid ${theme.rule}`, borderLeft: `1px solid ${theme.rule}`, padding: 0 }}>
                        <button
                          onClick={() => openNote(label)}
                          title={`${label} — ${scoreTxt}${hasNote ? ' · has note' : ''}. Tap to add a note.`}
                          style={{
                            position: 'relative', width: '100%', minHeight: 42, padding: '8px 10px',
                            border: 'none', cursor: 'pointer',
                            background: c.bg, color: c.fg,
                            fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                            textAlign: 'center', lineHeight: 1.25, transition: 'background .15s',
                          }}
                        >
                          {label}
                          {hasNote && (
                            <span style={{
                              position: 'absolute', top: 5, right: 5,
                              width: 7, height: 7, borderRadius: 999,
                              background: c.fg, opacity: 0.9,
                            }}/>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11.5, color: theme.inkMuted, textAlign: 'center', lineHeight: 1.5 }}>
        Colors reflect each account's score. Notes are shared and saved live — everyone sees the same board.
      </div>

      {/* Note editor */}
      {editing && (
        <div
          onClick={closeNote}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(10,8,20,0.55)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420, background: theme.surface,
              border: `1px solid ${theme.rule}`, borderRadius: theme.radius,
              padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ fontFamily: theme.serif, fontSize: 20, fontWeight: 700, color: theme.ink, letterSpacing: -0.3 }}>
              {editing}
            </div>
            <div style={{ fontSize: 12.5, color: theme.inkMuted, marginTop: 2 }}>
              {editScore
                ? `${editScore.client.name} · ${editScore.score != null ? 'Score ' + (editScore.score * 100).toFixed(0) : 'No score yet'}`
                : 'No matched account — note only'}
            </div>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Add a note for this call…"
              autoFocus
              rows={4}
              style={{
                width: '100%', marginTop: 14, padding: '10px 12px',
                background: theme.bgElev, color: theme.ink,
                border: `1px solid ${theme.rule}`, borderRadius: 10,
                fontFamily: 'inherit', fontSize: 14, lineHeight: 1.45, resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            {err && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: '#d0392c' }}>
                Couldn't save. Please try again.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={closeNote}
                disabled={busy}
                style={{
                  flex: 1, height: 42, borderRadius: 10, cursor: busy ? 'default' : 'pointer',
                  background: theme.surface, color: theme.ink, border: `1px solid ${theme.rule}`,
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                }}
              >Cancel</button>
              <button
                onClick={saveNote}
                disabled={busy}
                style={{
                  flex: 1, height: 42, borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
                  background: theme.ink, color: theme.accentInk || '#fff', border: 'none',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 700, opacity: busy ? 0.7 : 1,
                }}
              >{busy ? 'Saving…' : 'Save note'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CallsBoard });
