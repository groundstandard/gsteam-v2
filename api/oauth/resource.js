// Which authorization server guards this resource. MCP clients fetch this to
// find out where to send someone before they can call the server.
import { originOf, json, cors } from '../_lib/oauth.js';

export default function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  const origin = originOf(req);
  json(res, 200, {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['scoreboard'],
    resource_name: 'GS Team Scoreboard',
  });
}
