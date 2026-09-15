// assistant.jsx — the chat box inside the scoreboard.
//
// James, September 16: "iisang conversation lang na nasa loob ng app magagamit
// nila." One thread, shared by Bobby, Kurt and Mike. You are already signed in,
// so there is nothing to install and no password to put anywhere: the same
// session that draws the board is the one that writes to it.
//
// It updates live, so when Kurt logs Dallas, Mike sees it happen instead of
// logging it again ten minutes later.

function AssistantChat({ state, theme, profile }) {
  const [messages, setMessages] = React.useState(null);   // null = still loading
  const [draft, setDraft]       = React.useState('');
  const [sending, setSending]   = React.useState(false);
  const [error, setError]       = React.useState(null);
  const endRef = React.useRef(null);

  const load = React.useCallback(async () => {
    try {
      const rows = await CABT_api.fetchAssistantThread();
      setMessages(rows);
    } catch (e) {
      setError(e.message || String(e));
      setMessages([]);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Live, because the thread is shared. Someone else's message arriving while
  // you are typing is the whole point of one conversation instead of three.
  React.useEffect(() => {
    let stop = () => {};
    CABT_subscribeRealtime(['assistant_messages'], () => load()).then(fn => { stop = fn; });
    return () => stop();
  }, [load]);

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
      load();
    }
  };

  const onKey = (e) => {
    // Enter sends, Shift+Enter is a new line — the way every chat box works.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const mine = (m) => m.authorId && profile && m.authorId === profile.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '8px 16px 0' }}>
        <SectionLabel theme={theme}>Assistant</SectionLabel>
        <div style={{ fontSize: 12, color: theme.inkMuted, marginTop: 4, marginBottom: 8, lineHeight: 1.5 }}>
          One conversation, shared by everyone on the scoreboard. Tell it what happened and it
          writes it to the board — under your name, and only where you are allowed to write.
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 16px' }}>
        {messages === null ? (
          <div style={{ fontSize: 13, color: theme.inkMuted, padding: 12 }}>Loading the thread…</div>
        ) : !messages.length ? (
          <AssistantEmpty theme={theme} onPick={setDraft} />
        ) : (
          messages.map(m => (
            <AssistantBubble key={m.id} theme={theme} message={m} isMine={mine(m)} />
          ))
        )}
        {sending && (
          <div style={{ fontSize: 12, color: theme.inkMuted, padding: '8px 4px' }}>Thinking…</div>
        )}
        {error && (
          <div style={{
            fontSize: 12, color: '#C6483C', padding: '8px 10px', marginTop: 8,
            border: '1px solid rgba(198,72,60,0.35)', borderRadius: 8,
          }}>{error}</div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{
        padding: '10px 16px 16px', borderTop: `1px solid ${theme.rule}`,
        background: theme.bg, display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Log 41 leads for Dallas for August…"
          style={{
            flex: 1, resize: 'none', minHeight: 40, maxHeight: 140,
            padding: '10px 12px', background: theme.surface, color: theme.ink,
            border: `1px solid ${theme.rule}`, borderRadius: 10,
            fontSize: 14, fontFamily: 'inherit', outline: 'none', lineHeight: 1.4,
          }}
        />
        <Button theme={theme} onClick={send} disabled={sending || !draft.trim()} icon="send">
          {sending ? 'Sending' : 'Send'}
        </Button>
      </div>
    </div>
  );
}

// What it can do, in the words someone would actually use. Tapping one fills the
// box rather than sending it, so nobody writes to a live board by accident.
function AssistantEmpty({ theme, onPick }) {
  const examples = [
    'What calls do we have Wednesday, and which ones need attention?',
    'Why is Grit red?',
    'Log 41 leads, 18 appointments booked and $1,200 ad spend for Dallas for August.',
    "Leave a note on Fresno: owner's away this week.",
    'What does CA-01 look like over the last 90 days?',
  ];
  return (
    <div style={{ padding: '12px 4px' }}>
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
              border: `1px solid ${theme.rule}`, borderRadius: 8,
              fontSize: 13, fontFamily: 'inherit',
            }}
          >{x}</button>
        ))}
      </div>
    </div>
  );
}

function AssistantBubble({ theme, message, isMine }) {
  const isUser = message.role === 'user';
  const when = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 14,
    }}>
      <div style={{ fontSize: 10, color: theme.inkMuted, marginBottom: 3, padding: '0 4px' }}>
        {isUser ? (message.authorName || 'Someone') : 'Assistant'}{when ? ` · ${when}` : ''}
      </div>
      <div style={{
        maxWidth: '85%', padding: '10px 13px', borderRadius: 12,
        background: isUser ? (isMine ? theme.accent : theme.bgElev) : theme.surface,
        color: isUser && isMine ? theme.accentInk : theme.ink,
        border: isUser && isMine ? 'none' : `1px solid ${theme.rule}`,
        fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>{message.content}</div>

      {/* What it actually did, not only what it said about it. */}
      {message.toolCalls && message.toolCalls.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5, padding: '0 4px' }}>
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
  );
}

Object.assign(window, { AssistantChat });
