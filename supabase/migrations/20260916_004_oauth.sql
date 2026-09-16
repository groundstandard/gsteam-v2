-- OAuth for the remote MCP server.
--
-- Claude's custom connectors take a URL and nothing else — no header field — so
-- the only way to connect without installing anything is to be an OAuth provider.
-- These two tables are the whole of it. The access tokens it issues are rows in
-- mcp_tokens, which already exists, so everything downstream is unchanged.
--
-- Clients register themselves: the MCP spec has the client do dynamic
-- registration rather than an admin creating one by hand. That is safe here
-- because registering buys nothing on its own — a client still has to send a
-- person through the authorize screen, and that screen only works for somebody
-- already signed in to the scoreboard.

create table oauth_clients (
  client_id      text primary key,
  client_name    text,
  redirect_uris  text[] not null,
  created_at     timestamptz not null default now()
);

-- Authorization codes. Single use, short lived, and bound to the PKCE challenge
-- the client sent, so an intercepted code is worth nothing without the verifier.
create table oauth_codes (
  code_sha256    text primary key,
  client_id      text not null references oauth_clients(client_id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  profile_id     uuid not null references profiles(id) on delete cascade,
  refresh_token  text not null,
  expires_at     timestamptz not null default (now() + interval '5 minutes'),
  used_at        timestamptz
);

create index oauth_codes_expiry_idx on oauth_codes (expires_at);

alter table oauth_clients enable row level security;
alter table oauth_codes   enable row level security;

-- No policies: only the service role touches these. The authorize screen runs in
-- the browser as the signed-in person, but it does not write here — it hands its
-- session to the server, which does.
revoke all on oauth_clients from anon, authenticated;
revoke all on oauth_codes   from anon, authenticated;
