// Dynamic client registration. The MCP spec has clients register themselves
// rather than an admin creating one by hand.
//
// Registering buys nothing on its own: a client still has to send a person
// through the authorize screen, and that screen only works for somebody already
// signed in to the scoreboard.
import crypto from 'node:crypto';
import { admin, json, cors, readBody } from '../_lib/oauth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const body = await readBody(req);
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || !redirectUris.length) {
    return json(res, 400, { error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' });
  }

  const clientId = 'gsc_' + crypto.randomBytes(16).toString('hex');
  const { error } = await admin().from('oauth_clients').insert({
    client_id: clientId,
    client_name: body.client_name || null,
    redirect_uris: redirectUris,
  });
  if (error) return json(res, 500, { error: 'server_error', error_description: error.message });

  json(res, 201, {
    client_id: clientId,
    client_name: body.client_name || 'MCP client',
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });
}
