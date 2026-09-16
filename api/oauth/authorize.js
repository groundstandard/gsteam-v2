// Where the person says yes.
//
// This page is served from the same origin as the scoreboard, which is the whole
// trick: they are already signed in there, so the browser already holds their
// session. No password is asked for, no magic link is sent — the page reads who
// they are and offers one button.
//
// GET  → the consent screen.
// POST → the browser hands back its access token; the server checks it, writes a
//        one-time code, and answers with where to send them next.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { admin, sha256, json, cors, readBody, SUPABASE_URL, ANON_KEY } from '../_lib/oauth.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }

  if (req.method === 'GET') return consentPage(req, res);
  if (req.method === 'POST') return issueCode(req, res);
  return json(res, 405, { error: 'method_not_allowed' });
}

async function consentPage(req, res) {
  const url = new URL(req.url, 'https://placeholder');
  const p = Object.fromEntries(url.searchParams);

  const missing = ['client_id', 'redirect_uri', 'code_challenge'].filter((k) => !p[k]);
  if (missing.length) {
    return json(res, 400, { error: 'invalid_request', error_description: `missing ${missing.join(', ')}` });
  }

  const { data: client } = await admin()
    .from('oauth_clients').select('client_id, client_name, redirect_uris')
    .eq('client_id', p.client_id).maybeSingle();

  if (!client) return json(res, 400, { error: 'invalid_client' });
  if (!client.redirect_uris.includes(p.redirect_uri)) {
    return json(res, 400, { error: 'invalid_request', error_description: 'redirect_uri does not match the one registered' });
  }

  cors(res);
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to the scoreboard</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0B0E14; color:#F4F6FA; font:15px/1.55 "Inter Tight",system-ui,sans-serif; padding:24px; }
  .card { width:min(420px,100%); background:#11151D; border:1px solid rgba(255,255,255,.08);
          border-radius:16px; padding:28px; }
  h1 { font-size:19px; margin:0 0 6px; }
  p { color:#C5CCD9; margin:0 0 18px; }
  .who { display:flex; align-items:center; gap:12px; padding:12px 14px; margin-bottom:18px;
         background:#171C26; border:1px solid rgba(255,255,255,.08); border-radius:12px; }
  .dot { width:36px; height:36px; border-radius:18px; background:#E8FF5A; color:#0B0E14;
         display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; }
  .name { font-weight:700; } .role { color:#7B8499; font-size:12px; }
  button { width:100%; padding:12px; border:none; border-radius:10px; background:#E8FF5A; color:#0B0E14;
           font:700 15px/1 inherit; cursor:pointer; }
  button[disabled] { opacity:.5; cursor:default; }
  .muted { color:#7B8499; font-size:12px; margin-top:14px; }
  a { color:#E8FF5A; }
  .err { color:#ff9b90; }
</style></head>
<body><div class="card" id="card">
  <h1>Connect to the scoreboard</h1>
  <p>${esc(client.client_name || 'An MCP client')} is asking to read and write the GS Team Scoreboard as you.</p>
  <div id="body"><p class="muted">Checking who you are…</p></div>
</div>
<script src="/supabase.min.js"></script>
<script src="/config.js"></script>
<script>
(async () => {
  const body = document.getElementById('body');
  const cfg = window.CABT_CONFIG || {};
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  // Same origin as the app, so this is the session they are already using.
  const { data } = await sb.auth.getSession();
  const session = data && data.session;

  if (!session) {
    body.innerHTML = '<p>You are not signed in to the scoreboard in this browser.</p>'
      + '<p class="muted"><a href="/" target="_blank">Sign in here</a>, then reload this page.</p>';
    return;
  }

  const { data: profile } = await sb.from('profiles')
    .select('display_name, email, role').eq('id', session.user.id).maybeSingle();

  if (!profile) {
    body.innerHTML = '<p class="err">That account is not on this scoreboard, so it can read nothing.</p>';
    return;
  }

  const initials = (profile.display_name || profile.email || '?')
    .split(/\\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  body.innerHTML =
    '<div class="who"><div class="dot">' + initials + '</div><div>'
    + '<div class="name">' + (profile.display_name || profile.email) + '</div>'
    + '<div class="role">' + profile.role + ' · ' + profile.email + '</div></div></div>'
    + '<button id="go">Allow</button>'
    + '<p class="muted">It will be able to do exactly what you can do in the app, and nothing more. '
    + 'Anything it writes will carry your name.</p>';

  document.getElementById('go').onclick = async () => {
    const btn = document.getElementById('go');
    btn.disabled = true; btn.textContent = 'Connecting…';
    const params = new URLSearchParams(location.search);
    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({
        client_id: params.get('client_id'),
        redirect_uri: params.get('redirect_uri'),
        code_challenge: params.get('code_challenge'),
        state: params.get('state'),
        refresh_token: session.refresh_token,
      }),
    });
    const out = await res.json();
    if (out.redirect) { location.href = out.redirect; return; }
    btn.disabled = false; btn.textContent = 'Allow';
    body.insertAdjacentHTML('beforeend',
      '<p class="err">' + (out.error_description || out.error || 'Something went wrong.') + '</p>');
  };
})();
</script>
</body></html>`);
}

async function issueCode(req, res) {
  const body = await readBody(req);
  const auth = req.headers.authorization || '';
  const accessToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!accessToken || !body.refresh_token) {
    return json(res, 401, { error: 'access_denied', error_description: 'No session was sent.' });
  }

  // Verify the token rather than trusting the page that sent it.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !who?.user) {
    return json(res, 401, { error: 'access_denied', error_description: 'That session is not valid.' });
  }

  const db = admin();
  const { data: profile } = await db.from('profiles')
    .select('id').eq('id', who.user.id).maybeSingle();
  if (!profile) {
    return json(res, 403, { error: 'access_denied', error_description: 'That account is not on this scoreboard.' });
  }

  const { data: client } = await db.from('oauth_clients')
    .select('client_id, redirect_uris').eq('client_id', body.client_id).maybeSingle();
  if (!client || !client.redirect_uris.includes(body.redirect_uri)) {
    return json(res, 400, { error: 'invalid_client' });
  }

  const code = crypto.randomBytes(32).toString('base64url');
  const { error } = await db.from('oauth_codes').insert({
    code_sha256: sha256(code),
    client_id: client.client_id,
    redirect_uri: body.redirect_uri,
    code_challenge: body.code_challenge,
    profile_id: profile.id,
    refresh_token: body.refresh_token,
  });
  if (error) return json(res, 500, { error: 'server_error', error_description: error.message });

  const redirect = new URL(body.redirect_uri);
  redirect.searchParams.set('code', code);
  if (body.state) redirect.searchParams.set('state', body.state);
  json(res, 200, { redirect: redirect.toString() });
}
