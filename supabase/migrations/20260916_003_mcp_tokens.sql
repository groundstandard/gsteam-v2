-- Long-lived tokens for the remote MCP server.
--
-- Bobby's Claude connects with a URL and an Authorization header, the same shape
-- GoHighLevel's own MCP uses. A Supabase access token expires in an hour, which
-- is no use in a config file someone pastes once — so each person gets an opaque
-- token that stands in for their session.
--
-- The token is never stored. Only its SHA-256 is kept, so a copy of this table
-- does not let anyone in. What is stored beside it is that person's refresh
-- token, which the server exchanges for a short-lived access token per request —
-- and that access token is what Postgres sees, so row level security applies
-- exactly as it does when they use the app.
--
-- Revoking someone is deleting their row. There is no shared key to rotate.

create table mcp_tokens (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  token_sha256  text not null unique,
  label         text,

  -- Exchanged for an access token on each request. Rotates, so it is updated
  -- in place.
  refresh_token text not null,

  created_at    timestamptz not null default now(),
  created_by    uuid references profiles(id),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index mcp_tokens_profile_idx on mcp_tokens (profile_id) where revoked_at is null;

alter table mcp_tokens enable row level security;

-- Nobody reads this table through the API. The edge function uses the service
-- role; a person's own token is shown to them once, when it is made, and never
-- again. No policy means no access for anon or authenticated, which is correct.

revoke all on mcp_tokens from anon, authenticated;
