// assistant.jsx — the chat bubble in the corner of the scoreboard.
//
// James, September 16: "iisang conversation lang na nasa loob ng app magagamit
// nila... pag click lalabas yung buong conversation." Not a tab — a bubble that
// sits over whatever you are looking at, so asking a question does not cost you
// the screen you were reading.
//
// One thread, shared by Bobby, Kurt and Mike. Everyone's messages sit on the
// right the way your own do in any chat app; the assistant answers on the left.
// Your own are in the accent colour and say "You"; the others carry their name,
// because in a shared thread the question "who said that" is asked constantly.
//
// You are already signed in, so there is nothing to install and no password to
// put anywhere: the session drawing the board is the one writing to it.

const ASSIST_SEEN_KEY = 'cabt_assistant_seen_v1';

function AssistantLauncher({ theme, profile, isPhone }) {
  const [open, setOpen]         = React.useState(false);
  const [messages, setMessages] = React.useState(null);
  const [unread, setUnread]     = React.useState(0);

  const lastSeen = () => {
    try { return Number(localStorage.getItem(ASSIST_SEEN_KEY) || 0); } catch (e) { return 0; }
  };
  const markSeen = (id) => {
    try { localStorage.setItem(ASSIST_SEEN_KEY, String(id || 0)); } catch (e) { /* private mode */ }
  };

  const load = React.useCallback(async () => {
    try {
      const rows = await CABT_api.fetchAssistantThread();
      setMessages(rows);
      const newest = rows.length ? rows[rows.length - 1].id : 0;
      setUnread(rows.filter(m => m.id > lastSeen()).length);
      return newest;
    } catch (e) {
      setMessages([]);
      return 0;
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Live: someone else's message arriving while you are reading is the point of
  // one shared thread rather than three private ones.
  React.useEffect(() => {
    let stop = () => {};
    CABT_subscribeRealtime(['assistant_messages'], () => load()).then(fn => { stop = fn; });
    return () => stop();
  }, [load]);

  const openPanel = () => {
    setOpen(true);
    if (messages && messages.length) markSeen(messages[messages.length - 1].id);
    setUnread(0);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Ask the assistant"
          className="cabt-btn-press"
          style={{
            position: 'absolute', right: 18, bottom: 96, zIndex: 120,
            width: 54, height: 54, borderRadius: 27, border: 'none', cursor: 'pointer',
            background: theme.accent, color: theme.accentInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 28px rgba(0,0,0,0.30), 0 2px 6px rgba(0,0,0,0.18)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Icon name="chat" size={24} />
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20,
              padding: '0 5px', borderRadius: 10,
              background: '#C6483C', color: '#fff',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${theme.bg}`,
            }}>{unread > 9 ? '9+' : unread}</span>
          )}
        </button>
      )}

      {open && (
        <AssistantPanel
          theme={theme}
          profile={profile}
          isPhone={isPhone}
          messages={messages}
          onReload={load}
          onClose={() => {
            if (messages && messages.length) markSeen(messages[messages.length - 1].id);
            setUnread(0);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function AssistantPanel({ theme, profile, messages, onReload, onClose, isPhone }) {
  const [draft, setDraft]     = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError]     = React.useState(null);
  const endRef = React.useRef(null);

  React.useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft(''); setSending(true); setError(null);
    try {
      await CABT_api.askAssistant(text);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSending(false);
      onReload();
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // A dialog over the board, not a takeover of it: big enough to hold a real
  // conversation, small enough that the screen behind it is still there. On a
  // phone there is no room for that distinction, so it fills the screen.
  const card = isPhone
    ? { position: 'absolute', inset: 0, borderRadius: 0, border: 'none' }
    : {
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(860px, 92%)', height: 'min(680px, 86%)',
        borderRadius: 16, border: `1px solid ${theme.rule}`,
        boxShadow: '0 30px 80px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      };

  return (
    <>
      {/* Clicking away closes it, the way every dialog in the app does. */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 125,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        }}
      />
      <div style={{
        ...card, zIndex: 130,
        display: 'flex', flexDirection: 'column',
        background: theme.bg,
      }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '14px 16px 12px',
        borderBottom: `1px solid ${theme.rule}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 17, flexShrink: 0,
          background: theme.accent, color: theme.accentInk,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="chat" size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.ink }}>Assistant</div>
          <div style={{
            fontSize: 11, color: theme.inkMuted,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            Shared with everyone on the scoreboard
            {profile ? ` · you are ${profile.display_name || profile.email}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 34, height: 34, borderRadius: 17, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${theme.rule}`, color: theme.inkSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Thread */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
        {messages === null ? (
          <div style={{ fontSize: 13, color: theme.inkMuted, padding: 12 }}>Loading the thread…</div>
        ) : !messages.length ? (
          <AssistantEmpty theme={theme} onPick={setDraft} />
        ) : (
          messages.map(m => (
            <AssistantBubble
              key={m.id}
              theme={theme}
              message={m}
              isMine={!!(m.authorId && profile && m.authorId === profile.id)}
            />
          ))
        )}
        {sending && (
          <div style={{ fontSize: 12, color: theme.inkMuted, padding: '6px 4px' }}>Thinking…</div>
        )}
        {error && (
          <div style={{
            fontSize: 12, color: '#C6483C', padding: '8px 10px', marginTop: 8,
            border: '1px solid rgba(198,72,60,0.35)', borderRadius: 8,
          }}>{error}</div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div style={{
        flexShrink: 0, padding: '10px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)',
        borderTop: `1px solid ${theme.rule}`,
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Log 41 leads for Dallas for August…"
          style={{
            flex: 1, resize: 'none', minHeight: 42, maxHeight: 140,
            padding: '11px 13px', background: theme.surface, color: theme.ink,
            border: `1px solid ${theme.rule}`, borderRadius: 12,
            fontSize: 14, fontFamily: 'inherit', outline: 'none', lineHeight: 1.4,
          }}
        />
        <Button theme={theme} onClick={send} disabled={sending || !draft.trim()}>
          {sending ? 'Sending' : 'Send'}
        </Button>
        </div>
      </div>
    </>
  );
}

// People on the right, the assistant on the left. Your own are in the accent
// colour and say "You"; everyone else carries their name, because in a shared
// thread "who said that" is the question people ask most.
function AssistantBubble({ theme, message, isMine }) {
  const isPerson = message.role === 'user';
  const when = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  const who = isPerson
    ? (isMine ? 'You' : (message.authorName || 'Someone'))
    : 'Assistant';

  const avatar = (
    <div style={{
      width: 28, height: 28, borderRadius: 14, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700,
      background: isPerson
        ? (isMine ? theme.accent : theme.bgElev)
        : theme.surface,
      color: isPerson && isMine ? theme.accentInk : theme.inkSoft,
      border: isPerson && isMine ? 'none' : `1px solid ${theme.rule}`,
    }}>
      {isPerson ? initials(who === 'You' ? (message.authorName || 'You') : who) : <Icon name="chat" size={14} />}
    </div>
  );

  return (
    <div style={{
      display: 'flex', gap: 8, marginBottom: 14,
      flexDirection: isPerson ? 'row-reverse' : 'row',
      alignItems: 'flex-end',
    }}>
      {avatar}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isPerson ? 'flex-end' : 'flex-start',
        maxWidth: '78%',
      }}>
        <div style={{ fontSize: 10, color: theme.inkMuted, marginBottom: 3, padding: '0 3px' }}>
          {who}{when ? ` · ${when}` : ''}
        </div>
        <div style={{
          padding: '10px 13px',
          borderRadius: 14,
          borderBottomRightRadius: isPerson ? 4 : 14,
          borderBottomLeftRadius: isPerson ? 14 : 4,
          background: isPerson ? (isMine ? theme.accent : theme.bgElev) : theme.surface,
          color: isPerson && isMine ? theme.accentInk : theme.ink,
          border: isPerson && isMine ? 'none' : `1px solid ${theme.rule}`,
          fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{message.content}</div>

        {/* What it actually did, not only what it said about it. */}
        {message.toolCalls && message.toolCalls.length ? (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5, padding: '0 3px',
            justifyContent: isPerson ? 'flex-end' : 'flex-start',
          }}>
            {message.toolCalls.map((t, i) => (
              <span key={i} style={{
                fontSize: 10, color: theme.inkMuted, padding: '2px 7px',
                border: `1px solid ${theme.rule}`, borderRadius: 999,
                fontFamily: theme.mono,
              }}>{t.name}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const initials = (name) => (name || '?')
  .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

// What it can do, in words somebody would actually use. Tapping one fills the
// box rather than sending it — nothing writes to a live board by accident.
function AssistantEmpty({ theme, onPick }) {
  const examples = [
    'What calls do we have Wednesday, and which ones need attention?',
    'Why is Grit red?',
    'Log 41 leads, 18 appointments booked and $1,200 ad spend for Dallas for August.',
    "Leave a note on Fresno: owner's away this week.",
    'What does CA-01 look like over the last 90 days?',
  ];
  return (
    <div style={{ padding: '8px 2px' }}>
      <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 12, lineHeight: 1.6 }}>
        Nothing here yet. It can read the roster, the CA Rollup, the calls board and the leads,
        and it can log metrics, check-ins, events, call notes and leads. It cannot add or cancel
        a client, change pay, or delete anything.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {examples.map(x => (
          <button
            key={x}
            type="button"
            onClick={() => onPick(x)}
            style={{
              textAlign: 'left', padding: '9px 12px', cursor: 'pointer',
              background: theme.surface, color: theme.inkSoft,
              border: `1px solid ${theme.rule}`, borderRadius: 10,
              fontSize: 13, fontFamily: 'inherit',
            }}
          >{x}</button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AssistantLauncher });
