// Which requests the service worker answers, and which it must not touch.
//
// This is the check that would have caught the blank consent screen: the worker
// handed every same-origin navigation the app shell, including /api/oauth/
// authorize, so Claude's sign-in page rendered the React app instead — nothing
// on screen, and a connector that could never finish connecting.
//
// Run:  node scripts/check-sw-routes.js

import fs from 'node:fs';
import vm from 'node:vm';

const SOURCE = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const ORIGIN = 'https://gsteam-v2.vercel.app';

const handlers = {};
const sandbox = {
  self: {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    location: { origin: ORIGIN },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  },
  caches: { open: async () => ({ put: () => {}, addAll: async () => {} }), match: async () => undefined, keys: async () => [] },
  fetch: async () => ({ status: 200, type: 'basic', clone: () => ({}) }),
  Response: class {},
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  console,
};
sandbox.self.caches = sandbox.caches;
vm.createContext(sandbox);
vm.runInContext(SOURCE, sandbox, { filename: 'service-worker.js' });

const onFetch = handlers.fetch;
if (!onFetch) { console.log('FAIL — the worker registered no fetch handler'); process.exit(1); }

// Does the worker take over this request, or leave it to the network?
function intercepted(url, mode = 'navigate', method = 'GET') {
  let took = false;
  onFetch({ request: { url, mode, method }, respondWith: (p) => { took = true; Promise.resolve(p).catch(() => {}); } });
  return took;
}

const failures = [];
const expect = (label, url, shouldIntercept, mode) => {
  const got = intercepted(url, mode);
  if (got === shouldIntercept) {
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label} — ${got ? 'the worker answered it' : 'the worker let it through'}`);
  }
};

console.log('must reach the server untouched:');
expect('the OAuth consent screen', `${ORIGIN}/api/oauth/authorize?client_id=x`, false);
expect('the token endpoint', `${ORIGIN}/api/oauth/token`, false, 'cors');
expect('dynamic client registration', `${ORIGIN}/api/oauth/register`, false, 'cors');
expect('the MCP endpoint', `${ORIGIN}/mcp`, false, 'cors');
expect('OAuth discovery', `${ORIGIN}/.well-known/oauth-authorization-server`, false, 'cors');
expect('protected resource metadata', `${ORIGIN}/.well-known/oauth-protected-resource`, false, 'cors');

console.log('\nstill served by the worker, as before:');
expect('the app itself', `${ORIGIN}/`, true);
expect('a route inside the app', `${ORIGIN}/reporting`, true);
expect('a script the app loads', `${ORIGIN}/src/calc.jsx`, true, 'cors');
expect('the config with the keys in it', `${ORIGIN}/config.js`, true, 'cors');

console.log('\nnever touched at all:');
expect('Supabase', 'https://obfekzpumitnybxfgnol.supabase.co/rest/v1/clients', false, 'cors');

console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
