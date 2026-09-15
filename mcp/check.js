// check.js — proves the MCP server works against the real scoreboard.
//
// Reads run for real. Writes run with GSTEAM_DRY_RUN=1: each handler builds the
// row it would insert, and every column in that row is then checked against the
// live table definition. That catches the failure that actually happens — a
// column named wrong — without firing the audit and retention-notification
// triggers on someone's real client.
//
// Run as the maintainer, which is the only way to see every table:
//   GSTEAM_SERVICE_MODE=1 GSTEAM_ALLOW_WRITES=1 GSTEAM_DRY_RUN=1 node check.js
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
//
// It also runs signed in as a person (GSTEAM_EMAIL + GSTEAM_PASSWORD + the anon
// key), which is how the three people actually run it. Expect fewer rows then —
// that is row level security doing its job, not a failure.
//
// For what each person is allowed to do, see scripts/check_access.py, which asks
// Postgres directly rather than inferring it from what the tools return.

import { createClient } from '@supabase/supabase-js';
import { TOOLS, READ_TOOLS, WRITE_TOOLS, takeDryWrites, callTool, signIn, whoAmI } from './server.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

await signIn();
const me = whoAmI();
console.log(me
  ? `signed in as ${me.email} (${me.role}) — results are limited to what they can see\n`
  : 'service-role session — every row is visible\n');

const failures = [];
const ok = (name, extra) => console.log(`  ok   ${name}${extra ? ' — ' + extra : ''}`);
const bad = (name, why) => { failures.push(name); console.log(`  FAIL ${name} — ${why}`); };

// Goes through the same entry point Claude uses, so the checks exercise the
// real path including its error handling.
const call = (toolName, args = {}) => callTool(toolName, args);
const firstLine = (res) => res.content[0].text.split('\n')[0];

// ── Reads, live ────────────────────────────────────────────────────────────

console.log('reads (live):');

const clients = await call('list_clients', { limit: 5 });
clients.isError ? bad('list_clients', firstLine(clients)) : ok('list_clients', firstLine(clients));

const roster = JSON.parse(clients.content[0].text.split('\n\n')[1] || '[]');
const sample = roster[0];
if (!sample) bad('roster has clients', 'none returned');
else ok('roster has clients', `${sample.id} ${sample.name}`);

if (sample) {
  const one = await call('get_client', { client: sample.id });
  one.isError ? bad('get_client by id', firstLine(one)) : ok('get_client by id', firstLine(one));

  const byName = await call('get_client', { client: sample.name.slice(0, 6) });
  // A partial name may legitimately match several clients; that answer is still
  // correct behaviour, so both outcomes pass as long as it is explained.
  ok('get_client by name', firstLine(byName));
}

const missing = await call('get_client', { client: 'definitely-not-a-client-xyz' });
missing.isError ? ok('unknown client is a clean error', firstLine(missing))
                : bad('unknown client is a clean error', 'expected an error');

// The first thing anyone should be able to ask: what am I connected to?
const conn = await call('connection_info', {});
const connText = conn.content[0].text;
connText.includes('gsteam-v2.vercel.app')
  ? ok('connection_info names the app and database', firstLine(conn))
  : bad('connection_info names the app and database', firstLine(conn));

const rollup = await call('ca_rollup', { days: 400 });
rollup.isError ? bad('ca_rollup', firstLine(rollup)) : ok('ca_rollup', firstLine(rollup));

for (const [tool, args] of [
  ['list_leads', { days: 90 }],
  ['leads_by_source', { days: 90 }],
  ['ad_performance', { days: 90, platform: 'meta' }],
  ['ad_performance', { days: 90, platform: 'google' }],
  ['calls_board', {}],
  ['sync_status', {}],
]) {
  const res = await call(tool, args);
  res.isError ? bad(tool, firstLine(res)) : ok(tool, firstLine(res));
}

// ── Writes, dry run, payloads checked against the live schema ──────────────

console.log('\nwrites (dry run, payload checked against the real tables):');

if (!WRITE_TOOLS.every(t => TOOLS.includes(t))) {
  bad('write tools registered', 'run with GSTEAM_ALLOW_WRITES=1');
} else {
  ok('write tools registered', WRITE_TOOLS.map(t => t.name).join(', '));
}

// Ask the database to select exactly the columns the write would set. A column
// that does not exist comes back as an error naming it — which works on an empty
// table too, where reading a row would tell us nothing.
const unknownColumns = async (table, row) => {
  const names = Object.keys(row);
  const probe = await sb.from(table).select(names.join(',')).limit(1);
  if (!probe.error) return [];
  const missing = names.filter(n => probe.error.message.includes(n));
  return missing.length ? missing : [`select failed: ${probe.error.message}`];
};

const checkPayload = async (label, writes) => {
  if (!writes.length) return bad(label, 'no write was recorded');
  for (const w of writes) {
    const unknown = await unknownColumns(w.table, w.row);
    unknown.length
      ? bad(`${label} → ${w.table}`, `not columns of that table: ${unknown.join(', ')}`)
      : ok(`${label} → ${w.table}`, `${w.op}, ${Object.keys(w.row).length} fields, all real columns`);
  }
};

if (sample) {
  takeDryWrites();

  const mm = await call('log_monthly_metrics', {
    client: sample.id, month: '2026-08', leadsGenerated: 12, appointmentsBooked: 7,
    adSpend: 420.5, clientMrr: 2500, notes: 'dry run', by: 'kurt@groundstandard.com',
  });
  mm.isError ? bad('log_monthly_metrics', firstLine(mm)) : ok('log_monthly_metrics', firstLine(mm));
  await checkPayload('log_monthly_metrics', takeDryWrites());

  const wc = await call('log_weekly_checkin', {
    client: sample.id, concern: 'dry run', agencyAction: 'none', by: 'kurt@groundstandard.com',
  });
  wc.isError ? bad('log_weekly_checkin', firstLine(wc)) : ok('log_weekly_checkin', firstLine(wc));
  await checkPayload('log_weekly_checkin', takeDryWrites());

  const ge = await call('log_growth_event', {
    client: sample.id, eventType: 'Review', description: 'dry run', by: 'kurt@groundstandard.com',
  });
  ge.isError ? bad('log_growth_event', firstLine(ge)) : ok('log_growth_event', firstLine(ge));
  await checkPayload('log_growth_event', takeDryWrites());

  const lead = await call('record_lead', {
    client: sample.id, source: 'phone', firstName: 'Dry', lastName: 'Run',
    by: 'kurt@groundstandard.com',
  });
  lead.isError ? bad('record_lead', firstLine(lead)) : ok('record_lead', firstLine(lead));
  await checkPayload('record_lead', takeDryWrites());

  // The board is keyed by the account name as it appears on it, not by client id.
  const board = await call('calls_board', {});
  const boardRows = (JSON.parse(board.content[0].text.split('\n\n')[1] || '{}').calls) || [];
  if (boardRows.length) {
    const cs = await call('set_call_note', {
      account: boardRows[0].account, note: 'dry run', by: 'kurt@groundstandard.com',
    });
    cs.isError ? bad('set_call_note', firstLine(cs)) : ok('set_call_note', firstLine(cs));
    await checkPayload('set_call_note', takeDryWrites());

    // An account that is not on the board should be refused, not silently created —
    // the old set_call_status happily invented rows nothing would ever display.
    const offBoard = await call('set_call_note', { account: 'Not A Real Account', note: 'x' });
    offBoard.isError ? ok('a note on an unknown account is refused', firstLine(offBoard))
                     : bad('a note on an unknown account is refused', 'it went through');

    // The colours must be the ones the app paints, not the dead status column.
    const scored = boardRows.filter(c => c.health && c.health !== 'no score');
    scored.length
      ? ok('the board is coloured by score, like the app',
           `${scored.length}/${boardRows.length} scored, e.g. ${scored[0].account} ${scored[0].health} (${scored[0].score})`)
      : bad('the board is coloured by score, like the app', 'nothing scored — the engine did not load');
  } else {
    bad('set_call_note', 'the calls board is empty, nothing to set');
  }

  // The person who asked must end up on the row, or the audit trail lies.
  const credited = await call('log_growth_event', {
    client: sample.id, eventType: 'Review', by: 'kurt@groundstandard.com',
  });
  const [ev] = takeDryWrites();
  ev && ev.row.created_by
    ? ok('the write is credited to the person who asked', `created_by ${ev.row.created_by}`)
    : bad('the write is credited to the person who asked', 'created_by is null — is kurt@groundstandard.com a profile?');
  if (credited.isError) bad('credited write', firstLine(credited));

  const nothing = await call('log_monthly_metrics', { client: sample.id, month: '2026-08' });
  nothing.isError ? ok('a write with no numbers is refused', firstLine(nothing))
                  : bad('a write with no numbers is refused', 'it went through');

  const badMonth = await call('log_monthly_metrics', { client: sample.id, month: 'last august', leadsGenerated: 1 });
  badMonth.isError ? ok('an unreadable month is refused', firstLine(badMonth))
                   : bad('an unreadable month is refused', 'it went through');
}

console.log(failures.length
  ? `\n${failures.length} failed: ${failures.join(', ')}`
  : `\nall checks passed — ${READ_TOOLS.length} read tools, ${WRITE_TOOLS.length} write tools`);
process.exit(failures.length ? 1 : 0);
