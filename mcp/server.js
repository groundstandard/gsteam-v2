#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// gsteam-mcp — an MCP server over the GS Team Scoreboard.
//
// Angelo, on the September 14 call: "you want me to create the MCP for GST, so
// your AI could mess around with it" — Bobby: "Yes." [3:48:18]
//
// So this is the scoreboard as tools an agent can call. Reading: the roster, the
// CA rollup numbers, leads with the source split, ad performance by campaign and
// ad set, the calls board, and the sync log.
//
// Writing is the point, not an extra. Bobby [3:48:40]: "instead of Kurt having to
// update this manually and Mike updating this manually... they'll confirm the
// data. They'll have to fill in anything else that they can't find, that the AI
// can't find." So Kurt can say what happened and the agent writes it: monthly
// metrics, a weekly check-in, a growth event, a call status, a lead the
// automation missed. Every write names the person who asked, so the audit trail
// says Kurt rather than "service role".
//
// What it will not do: create or cancel clients, touch pay or bonus figures, or
// delete anything. Those stay in the app, with a human and an approval behind
// them.
//
// Transport is stdio, so it runs wherever Claude runs and no part of the
// scoreboard is exposed to the internet to make it work.
//
// Environment:
//   SUPABASE_URL              required
//   SUPABASE_SERVICE_ROLE_KEY required — server-side key, never shipped to a browser
//   GSTEAM_ALLOW_WRITES       set to "1" to enable the write tools
//   GSTEAM_ACTOR_EMAIL        default person to credit for writes, e.g. kurt@groundstandard.com
//   GSTEAM_DRY_RUN            set to "1" to report what a write would do without doing it
// ─────────────────────────────────────────────────────────────────────────

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';
import { createTools } from '../supabase/functions/_shared/tools.js';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// ── Who is running this ───────────────────────────────────────────────────
//
// Two ways in, and only one of them belongs on someone else's laptop.
//
// **Sign-in (what the three people use).** The anon key — the same public key
// the website ships — plus that person's own email and password. Postgres then
// applies exactly the rules it applies in the app: Kurt reaches his own book and
// no further, Bobby and Mike reach everything, and anyone not on the scoreboard
// reaches nothing at all. Remove someone in the app and their server stops
// working the same minute. No shared secret exists to leak or to rotate.
//
// **Service role (the maintainer's copy).** Bypasses row level security
// completely — every table, every row, past every policy. It has to be asked for
// deliberately with GSTEAM_SERVICE_MODE=1, because the failure it prevents is
// somebody putting it on three laptops for convenience and quietly handing out
// full database access to a scoreboard.
const SUPABASE_URL  = process.env.SUPABASE_URL;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE_MODE  = process.env.GSTEAM_SERVICE_MODE === '1';
const GSTEAM_EMAIL  = (process.env.GSTEAM_EMAIL || '').trim().toLowerCase();
const GSTEAM_PASSWORD = process.env.GSTEAM_PASSWORD || '';
const ALLOW_WRITES  = process.env.GSTEAM_ALLOW_WRITES === '1';

if (!SUPABASE_URL) {
  console.error('gsteam-mcp: SUPABASE_URL is not set.');
  process.exit(1);
}

if (SERVICE_MODE) {
  if (!SERVICE_KEY) {
    console.error('gsteam-mcp: GSTEAM_SERVICE_MODE=1 needs SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
} else if (!ANON_KEY || !GSTEAM_EMAIL || !GSTEAM_PASSWORD) {
  console.error(
    'gsteam-mcp: sign in as yourself — set SUPABASE_ANON_KEY, GSTEAM_EMAIL and GSTEAM_PASSWORD.\n' +
    '            (Maintainers debugging with the service role: GSTEAM_SERVICE_MODE=1.)');
  process.exit(1);
}

const sb = SERVICE_MODE
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  : createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: true },
    });

// Who the session belongs to. Filled by signIn() before any tool runs, so a
// write is stamped with the person Postgres actually authenticated — not with an
// address typed into a config file.
let ME = null;

export async function signIn() {
  if (SERVICE_MODE) return;
  const { data, error } = await sb.auth.signInWithPassword({
    email: GSTEAM_EMAIL,
    password: GSTEAM_PASSWORD,
  });
  if (error) {
    throw new Error(
      `could not sign in as ${GSTEAM_EMAIL}: ${error.message}. ` +
      `Check GSTEAM_EMAIL and GSTEAM_PASSWORD, or reset the password in the app.`);
  }
  const { data: profile, error: perr } = await sb
    .from('profiles').select('id, email, display_name, role').eq('id', data.user.id).maybeSingle();
  if (perr) throw new Error(`signed in, but could not read your profile: ${perr.message}`);
  if (!profile) {
    throw new Error(
      `${GSTEAM_EMAIL} has a login but no profile on this scoreboard, so it can read nothing. ` +
      `Ask Bobby to add you in the app under More → Roster.`);
  }
  ME = profile;
}

export function whoAmI() { return ME; }

// ── Reading the app's own files ───────────────────────────────────────────
//
// The shared tools need two things out of the app: the weekly call grid and the
// scoring engine that paints the board. Both live in src/, and how you read them
// is the one thing that differs between here and the edge function — Node has a
// filesystem, an edge function has fetch. So the reading stays here and the
// using stays shared.

// The weekly call schedule — which account is called on which day, at what time —
// lives in the app's source, not the database: `CALLS_GRID` in src/calls-board.jsx.
// Only the colour and the note are stored in Postgres.
//
// Found the hard way. The first version of the calls_board tool claimed to show
// "which accounts are scheduled when" and returned nothing of the sort, which
// Claude noticed on the very first real question asked of it. Rather than quietly
// narrow the description, the schedule is read from the file it actually lives in.
//
// The three declarations are plain literals, so they are extracted by matching
// brackets and evaluated in an empty VM context — no app code runs, and nothing
// from this process is reachable from inside it.
const SCHEDULE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'calls-board.jsx');

function literalAfter(src, name) {
  // The declarations are column-aligned in that file, so the spacing around the
  // equals sign varies. Match it loosely rather than assuming one space.
  const decl = new RegExp('const\\s+' + name + '\\s*=').exec(src);
  if (!decl) return null;
  let i = decl.index + decl[0].length;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const open = src[i];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) return null;
  let depth = 0, inString = null;
  for (let j = i; j < src.length; j += 1) {
    const ch = src[j];
    if (inString) {
      if (ch === '\\') { j += 1; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

let _schedule;
function loadSchedule() {
  if (_schedule !== undefined) return _schedule;
  try {
    const src = fs.readFileSync(SCHEDULE_FILE, 'utf8');
    const parts = ['CALLS_DAYS', 'CALLS_TIMES', 'CALLS_GRID'].map(n => literalAfter(src, n));
    if (parts.some(p => !p)) throw new Error('could not find the grid declarations');
    const [days, times, grid] = parts.map(p => vm.runInNewContext(`(${p})`, Object.create(null), { timeout: 1000 }));
    _schedule = { days, times, grid };
  } catch (err) {
    // Reading the schedule is a convenience; the statuses still work without it.
    _schedule = { error: err.message };
  }
  return _schedule;
}

// The colours on the calls board are not stored anywhere. Each cell is painted
// from that account's current score — Kurt, 2026-07-28: "auto-color by score" —
// computed in the browser by CABT_clientSubScores in src/calc.jsx.
//
// The `status` column on call_statuses is what the board used before that change,
// and nothing has read it since; every row still says what someone last set in
// July. Reporting it as "the account's colour" was wrong twice over: stale, and
// not the thing on the screen.
//
// So the score is computed here with the same function the app uses, loaded from
// the same file. calc.jsx is plain JavaScript that hangs its exports on `window`,
// so it runs in a VM with a small shim. One engine, one answer — a second
// implementation here would drift from the board within a month.
let _scoring;
function loadScoring() {
  if (_scoring !== undefined) return _scoring;
  try {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const sandbox = { console, Math, Date, JSON, Number, String, Object, Array, isNaN, parseFloat, parseInt };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(dir, 'calc.jsx'), 'utf8'), sandbox, { filename: 'calc.jsx' });

    // Board label → fragment of the real client name, so a cell can find its client.
    const matchSrc = literalAfter(fs.readFileSync(path.join(dir, 'calls-board.jsx'), 'utf8'), 'CALLS_CLIENT_MATCH');
    // The scoring engine reads camelCase fields; Postgres gives snake_case, and a
    // few names differ outright (appointments_booked → apptsBooked). Those aliases
    // are parsed out of api.jsx rather than copied, so they cannot drift.
    const aliasSrc = literalAfter(fs.readFileSync(path.join(dir, 'api.jsx'), 'utf8'), 'SNAKE_TO_CAMEL_OVERRIDES');
    if (!matchSrc || !aliasSrc) throw new Error('could not read the label map or the field aliases');

    _scoring = {
      subScores: sandbox.CABT_clientSubScores,
      toStatus: sandbox.CABT_scoreToStatus,
      labelMatch: vm.runInNewContext(`(${matchSrc})`, Object.create(null), { timeout: 1000 }),
      aliases: vm.runInNewContext(`(${aliasSrc})`, Object.create(null), { timeout: 1000 }),
    };
  } catch (err) {
    _scoring = { error: err.message };
  }
  return _scoring;
}

// ── The tools ─────────────────────────────────────────────────────────────

const sources = { schedule: loadSchedule, scoring: loadScoring };

let TOOLBOX = null;
function toolbox() {
  if (!TOOLBOX) {
    TOOLBOX = createTools({
      sb, me: ME, allowWrites: ALLOW_WRITES, dryRun: DRY_RUN,
      serviceMode: SERVICE_MODE, supabaseUrl: SUPABASE_URL, sources,
    });
  }
  return TOOLBOX;
}

const DRY_RUN = process.env.GSTEAM_DRY_RUN === '1';

export const TOOLS = new Proxy([], {
  get(_, prop) { return Reflect.get(toolbox().TOOLS, prop); },
});
export function takeDryWrites() { return toolbox().takeDryWrites(); }
export const READ_TOOLS = new Proxy([], {
  get(_, prop) { return Reflect.get(toolbox().READ_TOOLS, prop); },
});
export const WRITE_TOOLS = new Proxy([], {
  get(_, prop) { return Reflect.get(toolbox().WRITE_TOOLS, prop); },
});

// ── Wiring ────────────────────────────────────────────────────────────────

// One way in, so a tool behaves the same whether Claude called it or a check
// did. A thrown error becomes an answer the agent can act on rather than a
// crash that kills the connection.
// One way in, so a tool behaves the same whether Claude called it through MCP,
// or somebody typed a sentence into the chat box in the app.
export async function callTool(name, args = {}) {
  return toolbox().callTool(name, args);
}

export function buildServer() {
  // An agent should not have to infer what it is connected to from the tool
  // names. This says which company, which app, which database, and where the
  // numbers show up afterwards — and it is generated from the configuration, so
  // it cannot drift into describing a database the server is not pointed at.
  const instructions = [
    'These tools read and write the GS Team Scoreboard — the client-health board Ground',
    'Standard runs its client associates on. This is the v2 app at https://gsteam-v2.vercel.app.',
    'Anything written here shows up in that app for Kurt, Mike and Bobby, live. It is production',
    'data about real paying clients, not a sandbox.',
    '',
    'Vocabulary, so the answers match how the team talks:',
    '• CA — client associate. Each one owns a "book" of clients.',
    '• The CA Rollup — the dashboard of every client\'s monthly numbers. Bobby\'s name for it.',
    '• The calls board — the weekly call schedule, coloured by account health. The schedule',
    '  itself lives in the app\'s source; only the colour and the note are stored.',
    '• A lead\'s source is one of facebook, google, website, phone, referral, walk_in, other.',
    '',
    ME
      ? `You are acting as ${ME.display_name || ME.email} (${ME.role}). The database enforces that — a client outside their book simply will not be there, and a refused write is the rules working, not a bug.`
      : 'This is a maintenance session with no user behind it. Writes land with no owner.',
    ALLOW_WRITES
      ? 'Writes are enabled. Say plainly what you wrote and to which client. Do not guess a client — if a name is ambiguous, ask which one. Numbers go in as given; do not round or estimate.'
      : 'This connection is read-only. Writes are disabled.',
    DRY_RUN ? 'DRY RUN: writes are reported but nothing is saved. Say so when you report one.' : null,
    '',
    'It cannot create or cancel clients, change pay or bonus figures, or delete anything.',
    'Those stay in the app, with a person and an approval behind them.',
  ].filter(l => l !== null).join('\n');

  const server = new Server(
    { name: 'gsteam-scoreboard', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callTool(req.params.name, req.params.arguments || {}));

  return server;
}

// Only start a transport when run directly — check.js imports buildServer.
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  // Sign in before accepting a single request. A server that connects and then
  // fails every call is harder to diagnose than one that refuses to start.
  try {
    await signIn();
  } catch (err) {
    console.error(`gsteam-mcp: ${err.message}`);
    process.exit(1);
  }
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `gsteam-mcp ready — ${TOOLS.length} tools, writes ${ALLOW_WRITES ? 'on' : 'off'}, ` +
    (ME ? `signed in as ${ME.email} (${ME.role})` : 'service role, no user'));
}
