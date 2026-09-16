// Shared bits for the OAuth endpoints.
//
// Claude's custom connectors accept a URL and nothing else, so the only way to
// let someone connect without installing anything is to be an OAuth provider.
// These five endpoints are the whole of it, and they are deliberately small: the
// access token they issue is a row in mcp_tokens, which already existed, so
// everything downstream of the handshake is unchanged.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const ANON_KEY = process.env.SUPABASE_ANON_KEY;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const admin = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// The public origin this is served from — the issuer, and what every URL in the
// metadata is built off. Taken from the request rather than configured, so a
// preview deployment advertises itself and not production.
export const originOf = (req) => {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
};

export const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, mcp-protocol-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
};

export const json = (res, status, body) => {
  cors(res);
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

export const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
};

// PKCE. The client sends a challenge up front and the verifier at the end; an
// intercepted code is worth nothing without it.
export const verifyPkce = (verifier, challenge) => {
  const hashed = crypto.createHash('sha256').update(verifier).digest('base64url');
  return hashed === challenge;
};
