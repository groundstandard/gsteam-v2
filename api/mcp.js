// The scoreboard as a remote MCP server, served from the app's own domain.
//
// It lives here rather than on Supabase for one reason: OAuth discovery happens
// at the root of a domain (/.well-known/...), and Supabase functions only answer
// under /functions/v1/. Being on the same origin as the app turned out to be
// worth more than that anyway — the consent screen can see that the person is
// already signed in, so connecting asks for one click and no password.
//
// Speaks JSON-RPC over POST: initialize, tools/list, tools/call. No SSE; every
// call here is a request and a response.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createTools } from '../supabase/functions/_shared/tools.js';
import { admin, sha256, cors, readBody, originOf, SUPABASE_URL, ANON_KEY } from './_lib/oauth.js';

const PROTOCOL_VERSION = '2024-11-05';

const rpc = (res, id, result) => {
  cors(res);
  res.status(200).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
};

const rpcError = (res, id, code, message, status = 200, extraHeaders = {}) => {
  cors(res);
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
};

// ── Who is calling ─────────────────────────────────────────────────────────
// The bearer token is opaque. Its hash finds the row; the refresh token on that
// row buys a real access token; that access token is what Postgres sees, so the
// limits are the app's own.

const sessions = new Map();

async function authenticate(bearer) {
  const hash = sha256(bearer);
  const cached = sessions.get(hash);
  if (cached && cached.expires > Date.now()) return cached;

  const db = admin();
  const { data: row } = await db.from('mcp_tokens')
    .select('id, profile_id, refresh_token, revoked_at')
    .eq('token_sha256', hash).maybeSingle();

  if (!row) throw new Error('That token is not recognised.');
  if (row.revoked_at) throw new Error('That token has been revoked.');

  const asUser = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error } = await asUser.auth.refreshSession({ refresh_token: row.refresh_token });
  if (error || !sess?.session) {
    throw new Error(`Could not open a session for that token: ${error?.message ?? 'no session'}`);
  }

  // Refresh tokens rotate; keep the newest or the next request presents a spent one.
  await db.from('mcp_tokens')
    .update({ refresh_token: sess.session.refresh_token, last_used_at: new Date().toISOString() })
    .eq('id', row.id);

  const { data: profile } = await db.from('profiles')
    .select('id, email, display_name, role').eq('id', row.profile_id).maybeSingle();
  if (!profile) throw new Error('That token belongs to nobody on this scoreboard.');

  const session = { accessToken: sess.session.access_token, expires: Date.now() + 50 * 60 * 1000, profile };
  sessions.set(hash, session);
  return session;
}

// ── The app's own schedule and scoring ─────────────────────────────────────
// Read off disk here, since the app ships in the same deployment.

let _sources = null;

function literalAfter(src, name) {
  const decl = new RegExp('const\\s+' + name + '\\s*=').exec(src);
  if (!decl) return null;
  let i = decl.index + decl[0].length;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const open = src[i];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) return null;
  let depth = 0;
  let inString = null;
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

function loadSources() {
  if (_sources) return _sources;
  const dir = path.join(process.cwd(), 'src');
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const board = read('calls-board.jsx');
  const lit = (src, name) => {
    const text = literalAfter(src, name);
    if (!text) throw new Error(`could not find ${name}`);
    return vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 1000 });
  };

  const schedule = {
    days: lit(board, 'CALLS_DAYS'),
    times: lit(board, 'CALLS_TIMES'),
    grid: lit(board, 'CALLS_GRID'),
  };

  const shim = {};
  const ctx = { console, window: shim };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('calc.jsx'), ctx, { filename: 'calc.jsx' });

  const scoring = {
    subScores: ctx.CABT_clientSubScores,
    toStatus: ctx.CABT_scoreToStatus,
    labelMatch: lit(board, 'CALLS_CLIENT_MATCH'),
    aliases: lit(read('api.jsx'), 'SNAKE_TO_CAMEL_OVERRIDES'),
  };

  _sources = { schedule: () => schedule, scoring: () => scoring };
  return _sources;
}

function instructionsFor(me, appUrl) {
  return [
    'These tools read and write the GS Team Scoreboard — the client-health board Ground',
    `Standard runs its client associates on. The app is at ${appUrl}. Anything written here`,
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }

  const origin = originOf(req);

  if (req.method === 'GET') {
    cors(res);
    res.status(200).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      name: 'gsteam-scoreboard', transport: 'streamable-http', protocol: PROTOCOL_VERSION,
    }));
  }
  if (req.method !== 'POST') return rpcError(res, null, -32600, 'Method not allowed', 405);

  const body = await readBody(req);
  const { id = null, method, params = {} } = body || {};

  if (method === 'notifications/initialized') { cors(res); return res.status(202).end(); }

  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) {
    // Point the client at the authorization server rather than just refusing.
    return rpcError(res, id, -32001, 'Authorization required.', 401, {
      'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    });
  }

  let session;
  try {
    session = await authenticate(bearer);
  } catch (err) {
    return rpcError(res, id, -32001, err.message, 401, {
      'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    });
  }
  const me = session.profile;

  if (method === 'initialize') {
    return rpc(res, id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'gsteam-scoreboard', version: '1.0.0' },
      instructions: instructionsFor(me, origin),
    });
  }
  if (method === 'ping') return rpc(res, id, {});

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
    auth: { persistSession: false },
  });

  const { TOOLS, callTool } = createTools({
    sb: asUser,
    me,
    allowWrites: true,
    dryRun: false,
    serviceMode: false,
    supabaseUrl: SUPABASE_URL,
    sources: loadSources(),
  });

  if (method === 'tools/list') {
    return rpc(res, id, {
      tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  }

  if (method === 'tools/call') {
    const out = await callTool(params.name || '', params.arguments || {});
    return rpc(res, id, out);
  }

  if (id === null || id === undefined) { cors(res); return res.status(202).end(); }
  return rpcError(res, id, -32601, `Method not found: ${method}`);
}
