// assistant — the chat box inside the scoreboard.
//
// Kurt or Mike types a sentence; Claude reads the thread, calls the same tools
// the MCP server exposes, and answers. One conversation shared by the three of
// them, so the work is visible to everyone doing it.
//
// The part that matters: **every tool call runs as the person who typed it.**
// The caller's own token is passed straight through to Postgres, so row level
// security decides what happens, not this function. A CA asking about another
// CA's client does not get a polite refusal from an if-statement — the client is
// not there to be found.
//
// The service role is used for exactly one thing: writing the assistant's own
// replies into the thread, which no person is allowed to forge.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createTools } from '../_shared/tools.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const APP_URL = Deno.env.get('GSTEAM_APP_URL') ?? 'https://gsteam-v2.vercel.app';

const MODEL = 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 6;      // enough to look something up, act, and confirm
const HISTORY = 40;             // messages of thread carried into each turn

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// ── The app's own schedule and scoring, fetched rather than read ───────────
//
// The tools need the call grid and the scoring engine out of the app's source.
// Node reads them off disk; here they are fetched from the deployed site and
// evaluated once per instance. Same files, so the chat box and the board cannot
// disagree about who is red.

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

  const evalLiteral = (src: string, name: string) => {
    const text = literalAfter(src, name);
    if (!text) throw new Error(`could not find ${name}`);
    return new Function(`return (${text});`)();
  };

  const schedule = {
    days: evalLiteral(board, 'CALLS_DAYS'),
    times: evalLiteral(board, 'CALLS_TIMES'),
    grid: evalLiteral(board, 'CALLS_GRID'),
  };

  // calc.jsx is plain JavaScript that hangs its exports on `window`.
  const shim: Record<string, unknown> = {};
  new Function('window', 'console', calc)(shim, console);

  const scoring = {
    subScores: shim.CABT_clientSubScores,
    toStatus: shim.CABT_scoreToStatus,
    labelMatch: evalLiteral(board, 'CALLS_CLIENT_MATCH'),
    aliases: evalLiteral(api, 'SNAKE_TO_CAMEL_OVERRIDES'),
  };

  _sources = { schedule: () => schedule, scoring: () => scoring };
  return _sources;
}

// ── Talking to Claude ──────────────────────────────────────────────────────

function systemPrompt(me: { display_name?: string; email: string; role: string }) {
  return [
    `You are the assistant inside the GS Team Scoreboard — the client-health board Ground`,
    `Standard runs its client associates on. The app is at ${APP_URL}.`,
    ``,
    `You are talking to ${me.display_name || me.email} (${me.role}) in a thread that Bobby,`,
    `Kurt and Mike all read. Address whoever just spoke; the others will read it later.`,
    ``,
    `Every tool call runs as the person who typed the message, and the database enforces`,
    `that. If a client is not in a CA's book it will not be found — that is the rules`,
    `working, not a fault to route around. Never guess a client: if a name matches more`,
    `than one, ask which.`,
    ``,
    `Writes are live, on real paying clients. Take numbers exactly as given — never round,`,
    `never estimate, never fill a gap with a plausible figure. Say plainly what you wrote`,
    `and to which client, and if a number looks wrong say so rather than writing it quietly.`,
    ``,
    `Vocabulary: a CA is a client associate and owns a "book" of clients. The CA Rollup is`,
    `the dashboard of monthly numbers. The calls board is the weekly call schedule, coloured`,
    `by each account's score — that colour is computed, so it cannot be set; only the note`,
    `beneath it can be written.`,
    ``,
    `The Leads and Ads sections are empty because the GoHighLevel and Facebook syncs are not`,
    `connected yet. Say that when it comes up. An empty table is not the same as a zero.`,
    ``,
    `Be brief. These are working notes, not a report.`,
  ].join('\n');
}

async function askClaude(messages: unknown[], tools: unknown[], system: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, system, tools, messages }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  return await res.json();
}

// ── The request ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!ANTHROPIC_KEY) {
      return json({ error: 'The assistant has no API key yet. Set ANTHROPIC_API_KEY on this function.' }, 503);
    }

    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Not signed in.' }, 401);

    // The caller's own token, passed through to Postgres. This is what makes the
    // limits real rather than advisory.
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Not signed in.' }, 401);

    const { data: me } = await asUser
      .from('profiles').select('id, email, display_name, role').eq('id', userData.user.id).maybeSingle();
    if (!me) return json({ error: 'You are not on this scoreboard.' }, 403);

    const body = await req.json().catch(() => ({}));
    const text = (body.message ?? '').toString().trim();
    if (!text) return json({ error: 'Say something.' }, 400);

    const asService = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // The person's own message goes in under their own name, through their own
    // session, so the policy on that table is the thing that vouches for it.
    const { error: insErr } = await asUser.from('assistant_messages').insert({
      role: 'user', content: text, author_id: me.id, author_name: me.display_name || me.email,
    });
    if (insErr) return json({ error: `Could not post your message: ${insErr.message}` }, 400);

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

    const { data: history } = await asUser
      .from('assistant_messages')
      .select('role, content, author_name')
      .order('created_at', { ascending: false })
      .limit(HISTORY);

    // Tool rows are the record for people reading the thread, not context for
    // the model — the model gets the tool results inside its own turn.
    const messages: Record<string, unknown>[] = (history ?? [])
      .reverse()
      .filter(m => m.role !== 'tool')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.role === 'user' && m.author_name ? `${m.author_name}: ${m.content}` : m.content,
      }));

    const toolDefs = TOOLS.map((t: any) => ({
      name: t.name, description: t.description, input_schema: t.inputSchema,
    }));

    const performed: { name: string; arguments: unknown; result: string }[] = [];
    let reply = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const answer = await askClaude(messages, toolDefs, systemPrompt(me));
      const uses = (answer.content ?? []).filter((c: any) => c.type === 'tool_use');
      const said = (answer.content ?? []).filter((c: any) => c.type === 'text')
        .map((c: any) => c.text).join('\n').trim();

      if (!uses.length) { reply = said || reply; break; }

      messages.push({ role: 'assistant', content: answer.content });
      const results = [];
      for (const use of uses) {
        const out = await callTool(use.name, use.input ?? {});
        const rendered = out.content?.[0]?.text ?? '';
        performed.push({ name: use.name, arguments: use.input, result: rendered.slice(0, 2000) });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: rendered,
          is_error: !!out.isError,
        });
      }
      messages.push({ role: 'user', content: results });
      if (said) reply = said;
    }

    if (!reply) reply = 'I ran out of steps before I could answer that. Try asking for one thing at a time.';

    // Written with the service role: an assistant reply is not something a person
    // should be able to put words into.
    await asService.from('assistant_messages').insert({
      role: 'assistant',
      content: reply,
      tool_calls: performed.length ? performed : null,
    });

    return json({ reply, tools: performed.map(p => p.name) });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
