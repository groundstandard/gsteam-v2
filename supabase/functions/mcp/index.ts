// mcp — the scoreboard as a remote MCP server.
//
// Bobby: "How do I connect to it using my Claude?" The local server answered
// that with a clone, an npm install and a PowerShell command. This answers it
// with a URL and a header — the same shape GoHighLevel's own MCP uses:
//
//   { "mcpServers": { "gsteam": {
//       "url": "https://<project>.supabase.co/functions/v1/mcp",
//       "headers": { "Authorization": "Bearer <token>" } } } }
//
// The token is issued per person by scripts/mint_mcp_token.py and stands in for
// their session. Every request exchanges it for a short-lived access token and
// runs the tools with that, so Postgres applies the same rules it applies in the
// app: Kurt reaches his own book and no further, and revoking someone is
// deleting one row.
//
// Speaks JSON-RPC over POST — initialize, tools/list, tools/call. No SSE: every
// call here is a request and a response, and a stream would only add a way to
// fail.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createTools } from '../_shared/tools.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('GSTEAM_APP_URL') ?? 'https://gsteam-v2.vercel.app';

const PROTOCOL_VERSION = '2024-11-05';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id',
};

const rpc = (id: unknown, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// ── Who is calling ─────────────────────────────────────────────────────────
//
// The bearer token is opaque. Its hash finds the row; the refresh token on that
// row buys a real access token; that access token is what the database sees.
// Access tokens are cached per token for fifty minutes — Supabase issues them
// for an hour, and refresh tokens rotate on use, so exchanging one per request
// would churn the row and race with itself.

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

type Session = { accessToken: string; expires: number; profile: Record<string, unknown> };
const sessions = new Map<string, Session>();

async function authenticate(bearer: string) {
  const hash = await sha256(bearer);

  const cached = sessions.get(hash);
  if (cached && cached.expires > Date.now()) return cached;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: row } = await admin
    .from('mcp_tokens')
    .select('id, profile_id, refresh_token, revoked_at')
    .eq('token_sha256', hash)
    .maybeSingle();

  if (!row) throw new Error('That token is not recognised.');
  if (row.revoked_at) throw new Error('That token has been revoked.');

  // Exchange the refresh token for a session. This is what makes the limits
  // real: the tools run as the person, not as the server.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error } = await asUser.auth.refreshSession({ refresh_token: row.refresh_token });
  if (error || !sess?.session) {
    throw new Error(`Could not open a session for that token: ${error?.message ?? 'no session returned'}`);
  }

  // Refresh tokens rotate, so the row has to keep the newest one or the next
  // request would present a spent one.
  await admin.from('mcp_tokens')
    .update({ refresh_token: sess.session.refresh_token, last_used_at: new Date().toISOString() })
    .eq('id', row.id);

  const { data: profile } = await admin
    .from('profiles').select('id, email, display_name, role').eq('id', row.profile_id).maybeSingle();
  if (!profile) throw new Error('That token belongs to nobody on this scoreboard.');

  const session: Session = {
    accessToken: sess.session.access_token,
    expires: Date.now() + 50 * 60 * 1000,
    profile,
  };
  sessions.set(hash, session);
  return session;
}

// ── The app's own schedule and scoring ─────────────────────────────────────
// Same as the assistant function: fetched from the deployed site so the remote
// server and the board cannot disagree about who is red.

let _sources: { schedule: () => unknown; scoring: () => unknown } | null = null;

function literalAfter(src: string, name: string): string | null {
  const decl = new RegExp('const\\s+' + name + '\\s*=').exec(src);
  if (!decl) return null;
  let i = decl.index + decl[0].length;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const open = src[i];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) return null;
  let depth = 0;
  let inString: string | null = null;
  for (let j = i; j < src.length; j += 1) {
    const ch = src[j];
    if (inString) {
      if (ch === '\\') { j += 1; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) { depth -= 1; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

async function loadSources() {
  if (_sources) return _sources;
  const [board, calc, api] = await Promise.all([
    fetch(`${APP_URL}/src/calls-board.jsx`).then(r => r.text()),
    fetch(`${APP_URL}/src/calc.jsx`).then(r => r.text()),
    fetch(`${APP_URL}/src/api.jsx`).then(r => r.text()),
  ]);
  const lit = (src: string, name: string) => {
    const text = literalAfter(src, name);
    if (!text) throw new Error(`could not find ${name}`);
    return new Function(`return (${text});`)();
  };
  const schedule = {
    days: lit(board, 'CALLS_DAYS'),
    times: lit(board, 'CALLS_TIMES'),
    grid: lit(board, 'CALLS_GRID'),
  };
  const shim: Record<string, unknown> = {};
  new Function('window', 'console', calc)(shim, console);
  const scoring = {
    subScores: shim.CABT_clientSubScores,
    toStatus: shim.CABT_scoreToStatus,
    labelMatch: lit(board, 'CALLS_CLIENT_MATCH'),
    aliases: lit(api, 'SNAKE_TO_CAMEL_OVERRIDES'),
  };
  _sources = { schedule: () => schedule, scoring: () => scoring };
  return _sources;
}

function instructionsFor(me: Record<string, string>) {
  return [
    'These tools read and write the GS Team Scoreboard — the client-health board Ground',
    `Standard runs its client associates on. The app is at ${APP_URL}. Anything written here`,
    'shows up there for Bobby, Kurt and Mike, live. It is production data about real paying',
    'clients, not a sandbox.',
    '',
    `You are acting as ${me.display_name || me.email} (${me.role}). The database enforces that:`,
    'a client outside their book is not there to be found, and a refused write is the rules',
    'working rather than a fault. Never guess a client — if a name matches more than one, ask.',
    '',
    'Nothing happens unless you call a tool for it. Never report something as done, logged or',
    'noted unless a tool call came back successful in this turn.',
    '',
    'Vocabulary: a CA is a client associate and owns a "book" of clients. The CA Rollup is the',
    'dashboard of monthly numbers. The calls board is the weekly call schedule, coloured by each',
    "account's score — that colour is computed, so it cannot be set; only the note can be written.",
    '',
    'The Leads and Ads sections are empty because the GoHighLevel and ad syncs are not connected',
    'yet. An empty table is not the same as a zero.',
  ].join('\n');
}

// ── The request ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET') {
    // Some clients probe with GET before posting. Say what this is rather than
    // returning a bare 405.
    return new Response(
      JSON.stringify({ name: 'gsteam-scoreboard', transport: 'streamable-http', protocol: PROTOCOL_VERSION }),
      { headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  const { id = null, method, params = {} } = body;

  // Notifications carry no id and expect no answer.
  const isNotification = id === null || id === undefined;
  if (method === 'notifications/initialized') return new Response(null, { status: 202, headers: cors });

  const auth = req.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) {
    return rpcError(id, -32001, 'Missing Authorization header. Paste the token you were given as "Bearer <token>".', 401);
  }

  let session: Session;
  try {
    session = await authenticate(bearer);
  } catch (err) {
    return rpcError(id, -32001, (err as Error).message, 401);
  }
  const me = session.profile as Record<string, string>;

  if (method === 'initialize') {
    return rpc(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'gsteam-scoreboard', version: '1.0.0' },
      instructions: instructionsFor(me),
    });
  }

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
    auth: { persistSession: false },
  });
  const sources = await loadSources();
  const { TOOLS, callTool } = createTools({
    sb: asUser,
    me,
    allowWrites: true,
    dryRun: false,
    serviceMode: false,
    supabaseUrl: SUPABASE_URL,
    sources,
  });

  if (method === 'tools/list') {
    return rpc(id, {
      tools: (TOOLS as Array<Record<string, unknown>>).map(t => ({
        name: t.name, description: t.description, inputSchema: t.inputSchema,
      })),
    });
  }

  if (method === 'tools/call') {
    const name = (params as { name?: string }).name ?? '';
    const args = (params as { arguments?: Record<string, unknown> }).arguments ?? {};
    const out = await callTool(name, args);
    return rpc(id, out);
  }

  if (method === 'ping') return rpc(id, {});

  if (isNotification) return new Response(null, { status: 202, headers: cors });
  return rpcError(id, -32601, `Method not found: ${method}`);
});
