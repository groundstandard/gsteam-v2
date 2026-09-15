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

// ── Helpers ───────────────────────────────────────────────────────────────

// Local calendar date, not UTC. toISOString() would have been the obvious
// choice and is wrong here: at 1am in Manila it is still the previous day in
// UTC, so "today" became yesterday, and a Monday week-start became Sunday. The
// people using this mean the date on their own wall.
const iso = (d) => [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, '0'),
  String(d.getDate()).padStart(2, '0'),
].join('-');
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

// Every tool takes the same window, so it is resolved in one place. Defaults to
// the last 30 days rather than all time — an agent asking a vague question gets
// a useful answer instead of five years of rows.
function resolveWindow({ from, to, days } = {}) {
  if (from || to) return { from: from || null, to: to || iso(new Date()) };
  return { from: daysAgo(days || 30), to: iso(new Date()) };
}

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Results come back as a readable summary first and the rows after it, so an
// agent can answer without parsing and still has the detail when it needs it.
function result(summary, data) {
  const body = data === undefined ? '' : '\n\n' + JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text: summary + body }] };
}

function failure(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function must(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data || [];
}

// A client can be named by id (CL-0026) or by name, because an agent will have
// whichever the person typed.
async function findClient(ref) {
  if (!ref) return null;
  const byId = await must(sb.from('clients').select('*').eq('id', ref).limit(1), 'clients');
  if (byId.length) return byId[0];
  const byName = await must(
    sb.from('clients').select('*').ilike('name', `%${ref}%`).limit(5), 'clients');
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    const e = new Error(`"${ref}" matches ${byName.length} clients: ${byName.map(c => `${c.id} ${c.name}`).join(', ')}. Use the id.`);
    e.ambiguous = true;
    throw e;
  }
  return null;
}

// Ids in this schema are text with a prefix, generated by whoever writes the
// row — there is no sequence to lean on.
const newId = (prefix) => `${prefix}-${Date.now()}`;

// "Any date in the month" is what a person means when they say a month.
function monthStart(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(v).trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

// Weeks start Monday, the way the check-in form has always treated them.
function weekStartOf(v) {
  const d = v ? new Date(v) : new Date();
  if (Number.isNaN(d.getTime())) return iso(new Date());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return iso(d);
}

// The service role has no logged-in user behind it, so a write would otherwise
// land with nobody's name on it. Passing who asked keeps the audit trail true:
// this is Kurt asking through an agent, and the row should say Kurt.
// Who a write belongs to. Signed in, it is the authenticated user and cannot be
// anyone else. In service mode there is no user behind the connection at all, so
// an address may be named — and if it matches nobody, the write says so rather
// than landing with a blank owner nobody notices for a month.
const _actorCache = new Map();
async function resolveActor(email) {
  if (ME) return { actor: ME, note: '' };

  const wanted = (email || process.env.GSTEAM_ACTOR_EMAIL || '').trim().toLowerCase();
  if (!wanted) return { actor: null, note: ' Credited to nobody: this is a service-role session with no user behind it.' };
  if (!_actorCache.has(wanted)) {
    const rows = await must(
      sb.from('profiles').select('id, email, display_name').ilike('email', wanted).limit(1), 'profiles');
    _actorCache.set(wanted, rows[0] || null);
  }
  const actor = _actorCache.get(wanted);
  return {
    actor,
    note: actor ? '' : ` Credited to nobody: ${wanted} is not on this scoreboard.`,
  };
}


// Dry run. These tools write to a live client database, so there has to be a way
// to see exactly what a write would do without doing it — for a nervous first
// week, and for the checks in check.js, which must not fire the audit and
// retention-notification triggers on real rows.
const DRY_RUN = process.env.GSTEAM_DRY_RUN === '1';
const _dryWrites = [];

async function insertRow(table, row) {
  if (DRY_RUN) {
    _dryWrites.push({ op: 'insert', table, row });
    return { data: { ...row, _dryRun: true }, error: null };
  }
  return sb.from(table).insert(row).select().single();
}

async function updateRow(table, patch, id) {
  if (DRY_RUN) {
    _dryWrites.push({ op: 'update', table, id, row: patch });
    return { data: { id, ...patch, _dryRun: true }, error: null };
  }
  return sb.from(table).update(patch).eq('id', id).select().single();
}

async function upsertRow(table, row) {
  if (DRY_RUN) {
    _dryWrites.push({ op: 'upsert', table, row });
    return { data: { ...row, _dryRun: true }, error: null };
  }
  return sb.from(table).upsert(row).select().single();
}

// check.js reads this to verify the payloads without a database round trip.
export function whoAmI() { return ME; }

export function takeDryWrites() {
  return _dryWrites.splice(0, _dryWrites.length);
}

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

// Same reshaping the app does on the way out of Postgres.
function toCamel(row, aliases) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[aliases[k] || k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out;
}

const normName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Returns Map(board label → { client, score, status }) — the same three things
// the board's own tooltip shows.
async function scoreByLabel() {
  const s = loadScoring();
  if (s.error) return { error: s.error };

  const [clients, monthly, weekly, surveys, config] = await Promise.all([
    must(sb.from('clients').select('*'), 'clients'),
    must(sb.from('monthly_metrics').select('*'), 'monthly_metrics'),
    must(sb.from('weekly_metrics').select('*'), 'weekly_metrics').catch(() => []),
    must(sb.from('surveys').select('*'), 'surveys').catch(() => []),
    sb.from('config').select('values').eq('id', 1).maybeSingle().then(r => r.data?.values || {}, () => ({})),
  ]);

  const c = clients.map(r => toCamel(r, s.aliases));
  const mm = monthly.map(r => toCamel(r, s.aliases));
  const wm = weekly.map(r => toCamel(r, s.aliases));
  const sv = surveys.map(r => toCamel(r, s.aliases));

  const byLabel = new Map();
  for (const [label, fragment] of Object.entries(s.labelMatch)) {
    const frag = normName(fragment);
    const client = c.find(x => normName(x.name).includes(frag));
    if (!client) continue;
    const sub = s.subScores(client, mm, sv, config, new Date(), wm);
    byLabel.set(label, {
      client: { id: client.id, name: client.name },
      score: sub.composite,
      status: s.toStatus(sub.composite),
    });
  }
  return { byLabel };
}

// The board paints green / yellow / red; the words on the screen are these.
const SCORE_WORD = { green: 'on track', yellow: 'watch', red: 'at risk' };

// ── Tools ─────────────────────────────────────────────────────────────────

const WINDOW_PROPS = {
  from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to 30 days ago.' },
  to:   { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
  days: { type: 'integer', description: 'Shorthand for the last N days. Ignored if from/to are given.' },
};

const READ_TOOLS = [
  {
    name: 'connection_info',
    description: 'Which scoreboard, which app and which database these tools are connected to, and whether writes are live. Answer "what am I connected to?" with this rather than guessing from the tool names.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const project = (SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || SUPABASE_URL;
      const KNOWN = {
        obfekzpumitnybxfgnol: { app: 'https://gsteam-v2.vercel.app', name: 'GS Team Scoreboard v2' },
        wlaebsifygvnoyridobr: { app: 'https://team.groundstandard.com', name: 'GS Team Scoreboard v1 (the live original)' },
      };
      const known = KNOWN[project];

      // Prove it rather than assert it: the counts come from the database this
      // server is actually talking to, right now.
      const [clientCount, profileRows] = await Promise.all([
        sb.from('clients').select('id', { count: 'exact', head: true }),
        sb.from('profiles').select('email').order('email'),
      ]);

      // "Connected" has to mean it could actually read. Without this the tool
      // answered cheerfully on a bad key — the URL is right, so the name and the
      // project id are right, and only the counts come back empty.
      const reason = clientCount.error?.message || profileRows.error?.message;
      if (reason) {
        return failure(
          `Configured for Supabase project ${project}, but nothing can be read from it: ${reason}. ` +
          `The URL is right; check SUPABASE_SERVICE_ROLE_KEY.`);
      }
      const count = clientCount.count;
      const profiles = profileRows.data || [];

      return result(
        known
          ? `Connected to ${known.name} — ${known.app}. ` +
            `Writes are ${ALLOW_WRITES ? (DRY_RUN ? 'enabled but in dry run, so nothing is saved' : 'live') : 'disabled'}. ` +
            (ME
              ? `Signed in as ${ME.display_name || ME.email} (${ME.role}); this session can only do what they can do in the app.`
              : SERVICE_MODE
                ? 'Running with the service role, which bypasses row level security entirely.'
                : 'NOT signed in — no user behind this session, so almost nothing is readable.')
          : `Connected to a database this server does not recognise as either scoreboard. ` +
            `Check SUPABASE_URL in the config before trusting anything it says.`,
        {
          // The project id is deliberately not here. It is public — it sits in
          // the website's own config.js — so hiding it protects nothing, but
          // printing an identifier into every chat transcript is a habit worth
          // not having. The app name already answers the question this tool
          // exists for: v1 or v2.
          scoreboard: known?.name || 'unrecognised',
          app: known?.app || null,
          writes: ALLOW_WRITES ? (DRY_RUN ? 'dry-run' : 'live') : 'disabled',
          signedInAs: ME ? { email: ME.email, role: ME.role, name: ME.display_name } : null,
          access: ME
            ? `signed in — Postgres limits this session to what ${ME.display_name || ME.email} can do in the app`
            : SERVICE_MODE
              ? 'service role — row level security does not apply to this session'
              : 'not signed in — call signIn() first, or nothing here will be readable',
          clientsOnRecord: count ?? null,
          people: profiles.map(p => p.email),
        });
    },
  },
  {
    name: 'list_clients',
    description: 'The client roster: name, tier, sign date, assigned CA, and cancellation if there is one.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'cancelled', 'all'], description: 'Defaults to active.' },
        ca:     { type: 'string', description: 'Restrict to one CA id, e.g. CA-01.' },
        search: { type: 'string', description: 'Match part of a client name.' },
        limit:  { type: 'integer', description: 'Defaults to 100.' },
      },
    },
    handler: async ({ status = 'active', ca, search, limit = 100 }) => {
      let q = sb.from('clients').select('*').order('name').limit(limit);
      if (status === 'active')    q = q.is('cancel_date', null);
      if (status === 'cancelled') q = q.not('cancel_date', 'is', null);
      if (ca)     q = q.eq('assigned_ca', ca);
      if (search) q = q.ilike('name', `%${search}%`);
      const rows = await must(q, 'clients');
      return result(
        `${rows.length} ${status === 'all' ? '' : status + ' '}client${rows.length === 1 ? '' : 's'}${ca ? ` for ${ca}` : ''}.`,
        rows.map(c => ({
          id: c.id, name: c.name, assignedCA: c.assigned_ca,
          monthlyRetainer: c.monthly_retainer, signDate: c.sign_date,
          cancelDate: c.cancel_date, ae: c.ae,
        })),
      );
    },
  },
  {
    name: 'get_client',
    description: 'One client in full: the roster row, its recent monthly metrics, and its leads by source.',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client id (CL-0026) or part of the name.' },
        months: { type: 'integer', description: 'How many months of metrics to include. Defaults to 6.' },
      },
      required: ['client'],
    },
    handler: async ({ client, months = 6 }) => {
      const c = await findClient(client);
      if (!c) return failure(`No client matches "${client}".`);
      const metrics = await must(
        sb.from('monthly_metrics').select('*').eq('client_id', c.id)
          .order('month', { ascending: false }).limit(months), 'monthly_metrics');
      const leads = await must(
        sb.from('leads').select('source').eq('client_id', c.id), 'leads');
      const bySource = {};
      leads.forEach(l => { bySource[l.source] = (bySource[l.source] || 0) + 1; });
      return result(
        `${c.name} (${c.id}) — CA ${c.assigned_ca || 'unassigned'}, ${money(c.monthly_retainer)}/mo, signed ${c.sign_date || '?'}` +
        (c.cancel_date ? `, cancelled ${c.cancel_date}` : '') +
        `. ${metrics.length} month${metrics.length === 1 ? '' : 's'} of metrics, ${leads.length} lead${leads.length === 1 ? '' : 's'} on record.`,
        { client: c, metrics, leadsBySource: bySource },
      );
    },
  },
  {
    name: 'ca_rollup',
    description: "The CA rollup: one row per client with the monthly metrics summed over a window — what a CA's book looks like and how it is performing.",
    inputSchema: {
      type: 'object',
      properties: { ...WINDOW_PROPS, ca: { type: 'string', description: 'Restrict to one CA id.' } },
    },
    handler: async ({ from, to, days, ca }) => {
      const w = resolveWindow({ from, to, days });
      let cq = sb.from('clients').select('*').is('cancel_date', null);
      if (ca) cq = cq.eq('assigned_ca', ca);
      const clients = await must(cq, 'clients');
      const ids = clients.map(c => c.id);
      if (!ids.length) return result('No clients match.', []);

      let mq = sb.from('monthly_metrics').select('*').in('client_id', ids);
      if (w.from) mq = mq.gte('month', w.from);
      if (w.to)   mq = mq.lte('month', w.to);
      const metrics = await must(mq, 'monthly_metrics');

      const byClient = {};
      metrics.forEach(m => {
        const g = byClient[m.client_id] || (byClient[m.client_id] = {
          months: 0, leadsGenerated: 0, appointmentsBooked: 0,
          appointmentsShowed: 0, appointmentsClosed: 0, adSpend: 0, clientMrr: 0,
        });
        g.months += 1;
        g.leadsGenerated      += Number(m.leads_generated || 0);
        g.appointmentsBooked  += Number(m.appointments_booked || 0);
        g.appointmentsShowed  += Number(m.appointments_showed || 0);
        g.appointmentsClosed  += Number(m.appointments_closed || 0);
        g.adSpend             += Number(m.ad_spend || 0);
        g.clientMrr           += Number(m.client_mrr || 0);
      });

      const rows = clients.map(c => {
        const g = byClient[c.id] || { months: 0, leadsGenerated: 0, appointmentsBooked: 0, appointmentsShowed: 0, appointmentsClosed: 0, adSpend: 0, clientMrr: 0 };
        return {
          id: c.id, name: c.name, ca: c.assigned_ca, monthsReported: g.months,
          leadsGenerated: g.leadsGenerated, appointmentsBooked: g.appointmentsBooked,
          appointmentsShowed: g.appointmentsShowed, appointmentsClosed: g.appointmentsClosed,
          adSpend: Math.round(g.adSpend * 100) / 100,
          avgMrr: g.months ? Math.round((g.clientMrr / g.months) * 100) / 100 : null,
          costPerLead: g.leadsGenerated ? Math.round((g.adSpend / g.leadsGenerated) * 100) / 100 : null,
        };
      }).sort((a, b) => b.leadsGenerated - a.leadsGenerated);

      const reported = rows.filter(r => r.monthsReported > 0).length;
      return result(
        `${rows.length} active client${rows.length === 1 ? '' : 's'}${ca ? ` for ${ca}` : ''}, ${w.from || 'start'} to ${w.to}. ` +
        `${reported} reported metrics in that window.`,
        rows,
      );
    },
  },
  {
    name: 'list_leads',
    description: 'Leads over a window, with where each one came from and how far it got.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WINDOW_PROPS,
        client: { type: 'string', description: 'Client id or part of the name.' },
        source: { type: 'string', enum: ['facebook', 'google', 'website', 'phone', 'referral', 'walk_in', 'other'] },
        limit:  { type: 'integer', description: 'Defaults to 100.' },
      },
    },
    handler: async ({ from, to, days, client, source, limit = 100 }) => {
      const w = resolveWindow({ from, to, days });
      let q = sb.from('leads').select('*, client:clients(id, name)')
        .order('created_at', { ascending: false }).limit(limit);
      if (w.from) q = q.gte('created_at', w.from);
      if (w.to)   q = q.lte('created_at', w.to + 'T23:59:59.999Z');
      if (source) q = q.eq('source', source);
      if (client) {
        const c = await findClient(client);
        if (!c) return failure(`No client matches "${client}".`);
        q = q.eq('client_id', c.id);
      }
      const rows = await must(q, 'leads');
      const booked = rows.filter(l => l.booked_at).length;
      const signed = rows.filter(l => l.signed_at).length;
      return result(
        `${rows.length} lead${rows.length === 1 ? '' : 's'} ${w.from} to ${w.to}` +
        (rows.length ? ` — ${booked} booked, ${signed} signed.` : '. Nothing recorded in this window.'),
        rows,
      );
    },
  },
  {
    name: 'leads_by_source',
    description: 'The lead source split Bobby asked for — Facebook, Google, website, phone — with the funnel for each.',
    inputSchema: {
      type: 'object',
      properties: { ...WINDOW_PROPS, client: { type: 'string', description: 'Client id or part of the name.' } },
    },
    handler: async ({ from, to, days, client }) => {
      const w = resolveWindow({ from, to, days });
      let q = sb.from('leads').select('source, booked_at, showed_at, signed_at');
      if (w.from) q = q.gte('created_at', w.from);
      if (w.to)   q = q.lte('created_at', w.to + 'T23:59:59.999Z');
      if (client) {
        const c = await findClient(client);
        if (!c) return failure(`No client matches "${client}".`);
        q = q.eq('client_id', c.id);
      }
      const rows = await must(q, 'leads');
      const by = {};
      rows.forEach(l => {
        const g = by[l.source] || (by[l.source] = { source: l.source, leads: 0, booked: 0, showed: 0, signed: 0 });
        g.leads += 1;
        if (l.booked_at) g.booked += 1;
        if (l.showed_at) g.showed += 1;
        if (l.signed_at) g.signed += 1;
      });
      const out = Object.values(by).sort((a, b) => b.leads - a.leads);
      return result(
        rows.length
          ? `${rows.length} leads ${w.from} to ${w.to}, across ${out.length} source${out.length === 1 ? '' : 's'}.`
          : `No leads recorded ${w.from} to ${w.to}. The GoHighLevel sync is not connected yet, so this is not the same as a quiet month.`,
        out,
      );
    },
  },
  {
    name: 'ad_performance',
    description: 'Ad spend, clicks, CTR, leads and cost per lead by campaign or ad set, summed over a window.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WINDOW_PROPS,
        platform: { type: 'string', enum: ['meta', 'google'], description: 'Defaults to meta.' },
        level:    { type: 'string', enum: ['campaign', 'adset'], description: 'Defaults to campaign. Ad sets exist on Meta only.' },
        client:   { type: 'string', description: 'Client id or part of the name.' },
      },
    },
    handler: async ({ from, to, days, platform = 'meta', level = 'campaign', client }) => {
      const w = resolveWindow({ from, to, days });
      let q = sb.from('ad_metrics_daily_v').select('*').eq('level', level);
      if (w.from) q = q.gte('day', w.from);
      if (w.to)   q = q.lte('day', w.to);
      if (client) {
        const c = await findClient(client);
        if (!c) return failure(`No client matches "${client}".`);
        q = q.eq('client_id', c.id);
      }
      const [rows, accounts, campaigns, adSets] = await Promise.all([
        must(q, 'ad_metrics_daily_v'),
        must(sb.from('ad_accounts').select('*').eq('platform', platform), 'ad_accounts'),
        must(sb.from('ad_campaigns').select('*'), 'ad_campaigns'),
        must(sb.from('ad_sets').select('*'), 'ad_sets'),
      ]);

      const accountIds = new Set(accounts.map(a => a.id));
      const platformCampaigns = campaigns.filter(c => accountIds.has(c.ad_account_id));
      const campaignIds = new Set(platformCampaigns.map(c => c.id));
      const platformSets = adSets.filter(s => campaignIds.has(s.ad_campaign_id));
      const names = new Map(
        level === 'adset'
          ? platformSets.map(s => [s.id, s.name])
          : platformCampaigns.map(c => [c.id, c.name]),
      );

      // Summed first, ratios second. Averaging a daily CTR or cost per lead
      // gives a number that is wrong in a way nobody can see.
      const grouped = {};
      rows.filter(r => names.has(r.ref_id)).forEach(r => {
        const g = grouped[r.ref_id] || (grouped[r.ref_id] = { spend: 0, impressions: 0, clicks: 0, leads: 0 });
        g.spend       += Number(r.spend || 0);
        g.impressions += Number(r.impressions || 0);
        g.clicks      += Number(r.clicks || 0);
        g.leads       += Number(r.leads || 0);
      });

      const out = Object.entries(grouped).map(([id, g]) => ({
        id, name: names.get(id),
        spend: Math.round(g.spend * 100) / 100,
        impressions: g.impressions, clicks: g.clicks, leads: g.leads,
        ctrPct: g.impressions ? Math.round((g.clicks / g.impressions) * 10000) / 100 : null,
        costPerLead: g.leads ? Math.round((g.spend / g.leads) * 100) / 100 : null,
      })).sort((a, b) => b.spend - a.spend);

      const total = out.reduce((t, r) => ({
        spend: t.spend + r.spend, impressions: t.impressions + r.impressions,
        clicks: t.clicks + r.clicks, leads: t.leads + r.leads,
      }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });

      return result(
        out.length
          ? `${platform} ${level === 'adset' ? 'ad sets' : 'campaigns'}, ${w.from} to ${w.to}: ` +
            `${money(total.spend)} spent, ${total.leads} leads, ` +
            `${total.leads ? money(total.spend / total.leads) : '—'} per lead.`
          : `No ${platform} data ${w.from} to ${w.to}. The ad sync is not connected yet, so this is not the same as no spend.`,
        { total, rows: out },
      );
    },
  },
  {
    name: 'calls_board',
    description: "The weekly client calls board: which account is called on which day and at what time, each one's health colour, and any note left for that call. The colour is the account's current score, the same number the board paints with.",
    inputSchema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'One day only — Monday through Friday. Omit for the whole week.' },
      },
    },
    handler: async ({ day } = {}) => {
      const notes = await must(sb.from('call_statuses').select('*'), 'call_statuses');
      const noteFor = new Map(notes.map(r => [r.id.toLowerCase(), r.note]));
      const sched = loadSchedule();
      const scored = await scoreByLabel();

      if (sched.error) {
        return failure(
          `The schedule could not be read (${sched.error}). It lives in src/calls-board.jsx, ` +
          `not in the database, so this server has to sit beside the app to see it.`);
      }

      const wanted = day
        ? sched.days.filter(d => d.toLowerCase().startsWith(day.toLowerCase().slice(0, 3)))
        : sched.days;
      if (day && !wanted.length) {
        return failure(`"${day}" is not a day on the board. It runs ${sched.days.join(', ')}.`);
      }

      const week = [];
      sched.times.forEach(time => {
        const cells = sched.grid[time] || [];
        sched.days.forEach((d, i) => {
          const account = cells[i];
          if (!account) return;
          const s = scored.byLabel?.get(account);
          week.push({
            day: d, time, account,
            client: s?.client.name || null,
            health: s ? SCORE_WORD[s.status] : 'no score',
            score: s?.score != null ? Math.round(s.score * 100) : null,
            note: noteFor.get(account.toLowerCase()) || null,
          });
        });
      });

      // The day filter narrows what is shown, not what counts as scheduled.
      const calls = week.filter(c => wanted.includes(c.day));
      const attention = calls.filter(c => c.health === 'at risk' || c.health === 'watch');

      const headline = scored.error
        ? `${calls.length} call${calls.length === 1 ? '' : 's'} ${day ? `on ${wanted[0]}` : 'this week'}, ` +
          `but the health colours could not be computed (${scored.error}), so only the schedule and notes are below.`
        : `${calls.length} call${calls.length === 1 ? '' : 's'} ${day ? `on ${wanted[0]}` : 'this week'}. ` +
          (attention.length
            ? `${attention.length} need${attention.length === 1 ? 's' : ''} attention: ` +
              attention.map(c => `${c.account} (${c.health})`).join(', ') + '.'
            : 'All on track.');

      return result(headline, { calls });
    },
  },
  {
    name: 'sync_status',
    description: 'The last runs of each data sync, so a missing number can be told apart from a failed job.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Defaults to 20.' } },
    },
    handler: async ({ limit = 20 }) => {
      const rows = await must(
        sb.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(limit),
        'sync_runs');
      if (!rows.length) {
        return result('No sync has ever run. GoHighLevel and Facebook are not connected yet, so the leads and ad tables are empty by design — not because the numbers are zero.', []);
      }
      const failed = rows.filter(r => r.status === 'failed');
      return result(
        `${rows.length} recent run${rows.length === 1 ? '' : 's'}` +
        (failed.length ? `, ${failed.length} failed.` : ', all ok.'),
        rows,
      );
    },
  },
];

// Writes. "Kurt and Mike, they'll confirm the data. They'll have to fill in
// anything else that they can't find, that the AI can't find." [3:48:40]
const WRITE_TOOLS = [
  {
    name: 'log_monthly_metrics',
    description: "Log or correct a client's monthly numbers — the row Kurt would otherwise type into the form. Re-logging the same client and month updates that row instead of adding a second one.",
    inputSchema: {
      type: 'object',
      properties: {
        client:              { type: 'string', description: 'Client id or part of the name.' },
        month:               { type: 'string', description: 'The month, YYYY-MM or YYYY-MM-DD.' },
        leadsGenerated:      { type: 'integer' },
        appointmentsBooked:  { type: 'integer' },
        appointmentsShowed:  { type: 'integer' },
        appointmentsClosed:  { type: 'integer' },
        adSpend:             { type: 'number' },
        clientMrr:           { type: 'number', description: 'Monthly recurring revenue the client is paying.' },
        clientGrossRevenue:  { type: 'number' },
        studentsAcquired:    { type: 'integer' },
        studentsCancelled:   { type: 'integer' },
        totalStudentsStart:  { type: 'integer' },
        notes:               { type: 'string' },
        by:                  { type: 'string', description: 'Email of the person asking, so the audit trail names them.' },
      },
      required: ['client', 'month'],
    },
    handler: async (args) => {
      const c = await findClient(args.client);
      if (!c) return failure(`No client matches "${args.client}".`);
      const month = monthStart(args.month);
      if (!month) return failure(`"${args.month}" is not a month I can read. Use YYYY-MM or YYYY-MM-DD.`);
      const { actor, note: actorNote } = await resolveActor(args.by);

      const fields = {
        leads_generated:      args.leadsGenerated,
        appointments_booked:  args.appointmentsBooked,
        appointments_showed:  args.appointmentsShowed,
        appointments_closed:  args.appointmentsClosed,
        ad_spend:             args.adSpend,
        client_mrr:           args.clientMrr,
        ca_logged_mrr:        args.clientMrr,
        client_gross_revenue: args.clientGrossRevenue,
        students_acquired:    args.studentsAcquired,
        students_cancelled:   args.studentsCancelled,
        total_students_start: args.totalStudentsStart,
        notes:                args.notes,
      };
      const patch = {};
      Object.entries(fields).forEach(([k, v]) => { if (v != null) patch[k] = v; });
      if (!Object.keys(patch).length) {
        return failure('Nothing to log — pass at least one number besides the client and month.');
      }

      const existing = await must(
        sb.from('monthly_metrics').select('*').eq('client_id', c.id).eq('month', month).limit(1),
        'monthly_metrics');

      if (existing.length) {
        const { data, error } = await updateRow('monthly_metrics',
          { ...patch, updated_at: new Date().toISOString(), source: 'mcp' }, existing[0].id);
        if (error) return failure(`Could not update ${c.name} for ${month}: ${error.message}`);
        return result(`Updated ${c.name} (${c.id}) for ${month}: ${Object.keys(patch).join(', ')}.` + actorNote, data);
      }

      if (!c.assigned_ca) return failure(`${c.name} has no assigned CA, and a metrics row needs one.`);
      const row = {
        id: newId('MM'), client_id: c.id, ca_id: c.assigned_ca, month,
        source: 'mcp', created_by: actor?.id || null, ...patch,
      };
      const { data, error } = await insertRow('monthly_metrics', row);
      if (error) return failure(`Could not log ${c.name} for ${month}: ${error.message}`);
      return result(
        `Logged ${c.name} (${c.id}) for ${month}${actor ? `, on behalf of ${actor.display_name || actor.email}` : ''}.` + actorNote,
        data);
    },
  },
  {
    name: 'log_weekly_checkin',
    description: "A week's check-in on a client — the concern, the win, and what each side is doing about it.",
    inputSchema: {
      type: 'object',
      properties: {
        client:        { type: 'string', description: 'Client id or part of the name.' },
        weekStart:     { type: 'string', description: 'Any date in the week, YYYY-MM-DD. Defaults to this week.' },
        concern:       { type: 'string' },
        win:           { type: 'string' },
        accountAction: { type: 'string', description: 'What the client is doing.' },
        agencyAction:  { type: 'string', description: 'What we are doing.' },
        notes:         { type: 'string' },
        by:            { type: 'string', description: 'Email of the person asking.' },
      },
      required: ['client'],
    },
    handler: async (args) => {
      const c = await findClient(args.client);
      if (!c) return failure(`No client matches "${args.client}".`);
      if (!c.assigned_ca) return failure(`${c.name} has no assigned CA, and a check-in needs one.`);
      const { actor, note: actorNote } = await resolveActor(args.by);
      const week = weekStartOf(args.weekStart);

      const patch = {};
      if (args.concern)       patch.concern = args.concern;
      if (args.win)           patch.win = args.win;
      if (args.accountAction) patch.account_action = args.accountAction;
      if (args.agencyAction)  patch.agency_action = args.agencyAction;
      if (args.notes)         patch.notes = args.notes;
      if (!Object.keys(patch).length) return failure('Nothing to record — pass a concern, a win, an action or a note.');

      const existing = await must(
        sb.from('weekly_checkins').select('*').eq('client_id', c.id).eq('week_start', week).limit(1),
        'weekly_checkins');

      if (existing.length) {
        const { data, error } = await updateRow('weekly_checkins',
          { ...patch, updated_at: new Date().toISOString() }, existing[0].id);
        if (error) return failure(`Could not update the check-in: ${error.message}`);
        return result(`Updated the week of ${week} for ${c.name}.` + actorNote, data);
      }

      const { data, error } = await insertRow('weekly_checkins', {
        id: newId('WC'), client_id: c.id, ca_id: c.assigned_ca, week_start: week,
        created_by: actor?.id || null, ...patch,
      });
      if (error) return failure(`Could not record the check-in: ${error.message}`);
      return result(`Recorded the week of ${week} for ${c.name} (${c.id}).` + actorNote, data);
    },
  },
  {
    name: 'log_growth_event',
    description: 'A growth event on a client — a gear sale, a review, a referral, a seminar.',
    inputSchema: {
      type: 'object',
      properties: {
        client:      { type: 'string', description: 'Client id or part of the name.' },
        eventType:   { type: 'string', description: 'e.g. Gear Sale, Review, Referral 1+, Seminar.' },
        date:        { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
        description: { type: 'string' },
        attendees:   { type: 'integer' },
        saleTotal:   { type: 'number' },
        costToUs:    { type: 'number' },
        notes:       { type: 'string' },
        by:          { type: 'string', description: 'Email of the person asking.' },
      },
      required: ['client', 'eventType'],
    },
    handler: async (args) => {
      const c = await findClient(args.client);
      if (!c) return failure(`No client matches "${args.client}".`);
      if (!c.assigned_ca) return failure(`${c.name} has no assigned CA, and an event needs one.`);
      const { actor, note: actorNote } = await resolveActor(args.by);
      const when = args.date || iso(new Date());
      const { data, error } = await insertRow('growth_events', {
        id: newId('GE'), client_id: c.id, ca_id: c.assigned_ca,
        date: when, event_type: args.eventType,
        description: args.description || null, attendees: args.attendees ?? null,
        sale_total: args.saleTotal ?? null, cost_to_us: args.costToUs ?? 0,
        notes: args.notes || null, created_by: actor?.id || null,
        logged_by: actor?.display_name || actor?.email || 'mcp',
      });
      if (error) return failure(`Could not log the event: ${error.message}`);
      return result(`Logged "${args.eventType}" for ${c.name} (${c.id}) on ${when}.` + actorNote, data);
    },
  },
  {
    name: 'set_call_note',
    description: "Leave or replace the shared note on an account's weekly call. Everyone on the board sees it live. The colour beside it is not settable — it is computed from that account's score, so it moves when the numbers do.",
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The name as it appears on the board, e.g. Fresno.' },
        note:    { type: 'string', description: 'The note. Pass an empty string to clear it.' },
        by:      { type: 'string', description: 'Email of the person asking.' },
      },
      required: ['account', 'note'],
    },
    handler: async ({ account, note, by }) => {
      const sched = loadSchedule();
      const onBoard = !sched.error && Object.values(sched.grid)
        .flat().filter(Boolean).find(a => a.toLowerCase() === account.toLowerCase());
      if (!sched.error && !onBoard) {
        const all = Object.values(sched.grid).flat().filter(Boolean).sort();
        return failure(`"${account}" is not on the calls board. It has: ${all.join(', ')}.`);
      }
      const name = onBoard || account;
      const { actor, note: actorNote } = await resolveActor(by);
      const { data, error } = await upsertRow('call_statuses', {
        id: name, note: note || null,
        updated_at: new Date().toISOString(), updated_by: actor?.id || null,
      });
      if (error) return failure(`Could not set the note on ${name}: ${error.message}`);
      return result(
        (note ? `Note on ${name}: "${note}"` : `Cleared the note on ${name}.`) + actorNote,
        data);
    },
  },
  {
    name: 'record_lead',
    description: 'Record a lead the automation did not capture — a phone call or a walk-in. Marked as manual so no sync overwrites it.',
    inputSchema: {
      type: 'object',
      properties: {
        client:    { type: 'string', description: 'Client id or part of the name.' },
        source:    { type: 'string', enum: ['facebook', 'google', 'website', 'phone', 'referral', 'walk_in', 'other'] },
        firstName: { type: 'string' },
        lastName:  { type: 'string' },
        email:     { type: 'string' },
        phone:     { type: 'string' },
        createdAt: { type: 'string', description: 'When the lead came in, ISO timestamp. Defaults to now.' },
        note:      { type: 'string', description: 'Free text kept with the lead, e.g. how it arrived.' },
      },
      required: ['client', 'source'],
    },
    handler: async ({ client, source, firstName, lastName, email, phone, createdAt, note }) => {
      const c = await findClient(client);
      if (!c) return failure(`No client matches "${client}".`);
      const row = {
        client_id: c.id, source, origin: 'manual',
        first_name: firstName || null, last_name: lastName || null,
        email: email || null, phone: phone || null,
        created_at: createdAt || new Date().toISOString(),
        source_detail: note || null,
        external_id: `mcp-${Date.now()}`,
      };
      const { data, error } = await insertRow('leads', row);
      if (error) return failure(`Could not record the lead: ${error.message}`);
      return result(`Recorded a ${source} lead for ${c.name} (${c.id}).`, data);
    },
  },
  {
    name: 'update_lead',
    description: 'Correct or confirm a lead — fix its source, or stamp it booked, showed, signed or lost.',
    inputSchema: {
      type: 'object',
      properties: {
        id:         { type: 'string', description: 'The lead id.' },
        source:     { type: 'string', enum: ['facebook', 'google', 'website', 'phone', 'referral', 'walk_in', 'other'] },
        bookedAt:   { type: 'string', description: 'ISO timestamp, or "now".' },
        showedAt:   { type: 'string', description: 'ISO timestamp, or "now".' },
        signedAt:   { type: 'string', description: 'ISO timestamp, or "now".' },
        lostAt:     { type: 'string', description: 'ISO timestamp, or "now".' },
        lostReason: { type: 'string' },
        value:      { type: 'number', description: 'What the signed member is worth per month.' },
      },
      required: ['id'],
    },
    handler: async ({ id, source, bookedAt, showedAt, signedAt, lostAt, lostReason, value }) => {
      const stamp = (v) => (v === 'now' ? new Date().toISOString() : v);
      const patch = {};
      if (source)     patch.source = source;
      if (bookedAt)   patch.booked_at = stamp(bookedAt);
      if (showedAt)   patch.showed_at = stamp(showedAt);
      if (signedAt)   patch.signed_at = stamp(signedAt);
      if (lostAt)     patch.lost_at = stamp(lostAt);
      if (lostReason) patch.lost_reason = lostReason;
      if (value != null) patch.value = value;
      if (!Object.keys(patch).length) return failure('Nothing to change — pass at least one field besides the id.');
      patch.confirmed_at = new Date().toISOString();

      const { data, error } = await updateRow('leads', patch, id);
      if (error) return failure(`Could not update lead ${id}: ${error.message}`);
      if (!data)  return failure(`No lead with id ${id}.`);
      return result(`Updated lead ${id}: ${Object.keys(patch).join(', ')}.`, data);
    },
  },
];

export const TOOLS = ALLOW_WRITES ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
export { READ_TOOLS, WRITE_TOOLS };
const BY_NAME = new Map(TOOLS.map(t => [t.name, t]));

// ── Wiring ────────────────────────────────────────────────────────────────

// One way in, so a tool behaves the same whether Claude called it or a check
// did. A thrown error becomes an answer the agent can act on rather than a
// crash that kills the connection.
export async function callTool(name, args = {}) {
  const tool = BY_NAME.get(name);
  if (!tool) {
    const writeOnly = WRITE_TOOLS.some(t => t.name === name);
    return failure(writeOnly
      ? `${name} is a write tool and writes are off. Start the server with GSTEAM_ALLOW_WRITES=1 to enable it.`
      : `Unknown tool: ${name}`);
  }
  try {
    return await tool.handler(args);
  } catch (err) {
    // An ambiguous client name is the agent's problem to fix, not a crash.
    return failure(err.ambiguous ? err.message : `${name} failed: ${err.message}`);
  }
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
