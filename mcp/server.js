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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const ALLOW_WRITES = process.env.GSTEAM_ALLOW_WRITES === '1';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('gsteam-mcp: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before starting.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

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
const _actorCache = new Map();
async function resolveActor(email) {
  const wanted = (email || process.env.GSTEAM_ACTOR_EMAIL || '').trim().toLowerCase();
  if (!wanted) return null;
  if (_actorCache.has(wanted)) return _actorCache.get(wanted);
  const rows = await must(
    sb.from('profiles').select('id, email, display_name').ilike('email', wanted).limit(1), 'profiles');
  const actor = rows[0] || null;
  _actorCache.set(wanted, actor);
  return actor;
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

// ── Tools ─────────────────────────────────────────────────────────────────

const WINDOW_PROPS = {
  from: { type: 'string', description: 'Start date, YYYY-MM-DD. Defaults to 30 days ago.' },
  to:   { type: 'string', description: 'End date, YYYY-MM-DD. Defaults to today.' },
  days: { type: 'integer', description: 'Shorthand for the last N days. Ignored if from/to are given.' },
};

const READ_TOOLS = [
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
    description: 'The weekly client calls board: which account is called on which day and at what time, with its current colour and note.',
    inputSchema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'One day only — Monday through Friday. Omit for the whole week.' },
      },
    },
    handler: async ({ day } = {}) => {
      const rows = await must(sb.from('call_statuses').select('*'), 'call_statuses');
      const status = new Map(rows.map(r => [r.id.toLowerCase(), r]));
      const sched = loadSchedule();

      if (sched.error) {
        return result(
          `${rows.length} accounts have a status, but the schedule could not be read ` +
          `(${sched.error}). It lives in src/calls-board.jsx, not in the database, so this ` +
          `server has to sit beside the app to see it.`,
          rows);
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
          const s = status.get(account.toLowerCase());
          week.push({
            day: d, time, account,
            status: s ? s.status : 'none',
            note: s?.note || null,
            statusUpdatedAt: s?.updated_at || null,
          });
        });
      });
      // The day filter narrows what is shown, not what counts as scheduled —
      // otherwise asking for Wednesday would report the whole rest of the week
      // as accounts with no slot on the board.
      const calls = week.filter(c => wanted.includes(c.day));

      // The colour is only as good as the last person who touched it — say how
      // old it is rather than letting a July status read as this week's view.
      const stamps = calls.map(c => c.statusUpdatedAt).filter(Boolean).sort();
      const freshest = stamps[stamps.length - 1];
      const staleness = freshest
        ? ` The newest status is from ${freshest.slice(0, 10)}.`
        : '';

      const unscheduled = rows.filter(r =>
        !week.some(c => c.account.toLowerCase() === r.id.toLowerCase()));

      return result(
        `${calls.length} call${calls.length === 1 ? '' : 's'} ${day ? `on ${wanted[0]}` : 'this week'}.` +
        staleness +
        (unscheduled.length ? ` ${unscheduled.length} account${unscheduled.length === 1 ? ' has' : 's have'} a status but no slot on the board.` : ''),
        { calls, unscheduled: unscheduled.map(r => ({ account: r.id, status: r.status, note: r.note })) },
      );
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
      const actor = await resolveActor(args.by);

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
        return result(`Updated ${c.name} (${c.id}) for ${month}: ${Object.keys(patch).join(', ')}.`, data);
      }

      if (!c.assigned_ca) return failure(`${c.name} has no assigned CA, and a metrics row needs one.`);
      const row = {
        id: newId('MM'), client_id: c.id, ca_id: c.assigned_ca, month,
        source: 'mcp', created_by: actor?.id || null, ...patch,
      };
      const { data, error } = await insertRow('monthly_metrics', row);
      if (error) return failure(`Could not log ${c.name} for ${month}: ${error.message}`);
      return result(
        `Logged ${c.name} (${c.id}) for ${month}${actor ? `, on behalf of ${actor.display_name || actor.email}` : ''}.`,
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
      const actor = await resolveActor(args.by);
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
        return result(`Updated the week of ${week} for ${c.name}.`, data);
      }

      const { data, error } = await insertRow('weekly_checkins', {
        id: newId('WC'), client_id: c.id, ca_id: c.assigned_ca, week_start: week,
        created_by: actor?.id || null, ...patch,
      });
      if (error) return failure(`Could not record the check-in: ${error.message}`);
      return result(`Recorded the week of ${week} for ${c.name} (${c.id}).`, data);
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
      const actor = await resolveActor(args.by);
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
      return result(`Logged "${args.eventType}" for ${c.name} (${c.id}) on ${when}.`, data);
    },
  },
  {
    name: 'set_call_status',
    description: 'Set an account colour on the weekly client calls board, with an optional note.',
    inputSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'The name as it appears on the board, e.g. Modernman.' },
        status:  { type: 'string', enum: ['none', 'healthy', 'watch', 'at_risk', 'escalated'] },
        note:    { type: 'string' },
        by:      { type: 'string', description: 'Email of the person asking.' },
      },
      required: ['account', 'status'],
    },
    handler: async ({ account, status, note, by }) => {
      const actor = await resolveActor(by);
      const existing = await must(
        sb.from('call_statuses').select('id').ilike('id', account).limit(1), 'call_statuses');
      const known = existing.length > 0;
      const id = known ? existing[0].id : account;
      const { data, error } = await upsertRow('call_statuses', {
        id, status, note: note ?? null,
        updated_at: new Date().toISOString(), updated_by: actor?.id || null,
      });
      if (error) return failure(`Could not set ${account}: ${error.message}`);
      return result(
        `${id} is now ${status}${note ? ` — "${note}"` : ''}.` +
        (known ? '' : ' That account was not on the board, so it has been added.'),
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
  const project = (SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || SUPABASE_URL;
  const instructions = [
    'These tools read and write the GS Team Scoreboard — the client-health board Ground',
    'Standard runs its client associates on. This is the v2 app at https://gsteam-v2.vercel.app,',
    `backed by the Supabase project ${project}. Anything written here shows up in that app for`,
    'Kurt, Mike and Bobby, live. It is production data about real paying clients, not a sandbox.',
    '',
    'Vocabulary, so the answers match how the team talks:',
    '• CA — client associate. Each one owns a "book" of clients.',
    '• The CA Rollup — the dashboard of every client\'s monthly numbers. Bobby\'s name for it.',
    '• The calls board — the weekly call schedule, coloured by account health. The schedule',
    '  itself lives in the app\'s source; only the colour and the note are stored.',
    '• A lead\'s source is one of facebook, google, website, phone, referral, walk_in, other.',
    '',
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
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`gsteam-mcp ready — ${TOOLS.length} tools, writes ${ALLOW_WRITES ? 'on' : 'off'}`);
}
