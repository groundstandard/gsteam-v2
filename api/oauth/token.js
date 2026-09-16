// Swap the one-time code for a token the MCP server accepts.
//
// The token issued here is a row in mcp_tokens — the same shape the local server
// already used — so nothing downstream had to change to support OAuth.

import crypto from 'node:crypto';
import { admin, sha256, json, cors, readBody, verifyPkce } from '../_lib/oauth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'invalid_request' });

  const body = await readBody(req);
  const db = admin();

  if (body.grant_type === 'refresh_token') {
    // Our access tokens do not expire on their own — the session behind them is
    // refreshed server-side — so a refresh just hands the same one back rather
    // than inventing a second token for the same person.
    const hash = sha256(body.refresh_token || '');
    const { data: row } = await db.from('mcp_tokens')
      .select('id, revoked_at').eq('token_sha256', hash).maybeSingle();
    if (!row || row.revoked_at) return json(res, 400, { error: 'invalid_grant' });
    return json(res, 200, {
      access_token: body.refresh_token,
      refresh_token: body.refresh_token,
      token_type: 'Bearer',
      scope: 'scoreboard',
    });
  }

  if (body.grant_type !== 'authorization_code') {
    return json(res, 400, { error: 'unsupported_grant_type' });
  }
  if (!body.code || !body.code_verifier) {
    return json(res, 400, { error: 'invalid_request', error_description: 'code and code_verifier are required' });
  }

  const { data: row } = await db.from('oauth_codes')
    .select('*').eq('code_sha256', sha256(body.code)).maybeSingle();

  if (!row) return json(res, 400, { error: 'invalid_grant', error_description: 'Unknown code.' });
  if (row.used_at) return json(res, 400, { error: 'invalid_grant', error_description: 'That code was already used.' });
  if (new Date(row.expires_at) < new Date()) {
    return json(res, 400, { error: 'invalid_grant', error_description: 'That code has expired.' });
  }
  if (row.client_id !== body.client_id) return json(res, 400, { error: 'invalid_grant' });
  if (body.redirect_uri && row.redirect_uri !== body.redirect_uri) {
    return json(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri does not match.' });
  }
  if (!verifyPkce(body.code_verifier, row.code_challenge)) {
    return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE check failed.' });
  }

  // Spend the code before issuing anything, so a replay finds it used.
  await db.from('oauth_codes').update({ used_at: new Date().toISOString() })
    .eq('code_sha256', row.code_sha256);

  const token = 'gst_' + crypto.randomBytes(32).toString('base64url');
  const { error } = await db.from('mcp_tokens').insert({
    profile_id: row.profile_id,
    token_sha256: sha256(token),
    refresh_token: row.refresh_token,
    label: `oauth · ${row.client_id}`,
  });
  if (error) return json(res, 500, { error: 'server_error', error_description: error.message });

  json(res, 200, {
    access_token: token,
    refresh_token: token,
    token_type: 'Bearer',
    scope: 'scoreboard',
  });
}
