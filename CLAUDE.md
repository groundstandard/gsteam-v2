# GS Team Scoreboard v2

The clean rebuild Bobby asked for on September 14, 2026. The brief, with quotes and
timestamps from that call, is in [docs/SPEC-v2.md](docs/SPEC-v2.md) — read it before changing
anything, because the Otter summary of that meeting is wrong in one important way: the clone
and the new version are two different databases, not one.

## The three databases

| | Project ref | What it is |
|---|---|---|
| Live v1 | `wlaebsifygvnoyridobr` | The scoreboard in use today at team.groundstandard.com. Untouched. |
| **v2** | `obfekzpumitnybxfgnol` | This project. Same schema, roster only, plus the new reporting tables. |
| Clone | not created yet | Bobby's "save it on the side" — a full copy of v1 with every row, kept as the reference to check incoming GoHighLevel and Facebook numbers against. |

Credentials are in `.env.local`, which is gitignored. The v1 connection is only ever used
read-only.

## What is in v2 right now

Schema copied whole from v1 and verified object for object: 28 tables, 1 view, 1 materialized
view, 32 functions, 26 triggers, 78 policies, 76 indexes.

Roster carried over — 90 clients with tier, sign date, cancellation date and reason, assigned
CA and meeting time; the 13 cancel reasons; CA-01; sales_team AM-01; config; 45 calls-board
rows; the GoHighLevel settings.

Metrics deliberately left behind: monthly_metrics, weekly_metrics, check-ins, growth_events,
edit_requests, audit_log all sit at zero. That is the brief, not an oversight.

Users: bobby (owner) and kurt (ca) copied with their original ids so their magic links keep
working, mike@groundstandard.com created as admin, dimitri removed. His sales_team row AM-01
stays with a null profile_id, because 13 clients name him as their AE and dropping the row
would blank that.

New reporting tables, not in v1: `leads` (with the source bucket Bobby asked for — facebook,
google, website, phone — plus campaign and ad set ids), `ad_accounts`, `ad_campaigns`,
`ad_sets`, `ad_metrics_daily`, and `sync_runs` so a missing number can be told apart from a
failed sync. CTR and cost per lead are a view, never stored twice.

## What is not done

1. The app still points at nothing. Needs `.env` with the v2 URL and anon key, then
   `node scripts/build-config.js`.
2. No Leads section and no Ads section yet. That is the actual feature work — see SPEC §6.
3. The existing dashboard still calls itself the dashboard. Bobby now calls it the CA rollup
   and wants the name to say so, and it is otherwise not to be changed.
4. No GoHighLevel or Facebook sync. Needs API access for both.
5. No MCP server over the scoreboard yet.
6. Not deployed. No Vercel project, no URL.
7. The clone of v1 has not been made.

## Scripts

Run from the project root. All three take connection strings as arguments; none of them hold
credentials.

| Script | What it does |
|---|---|
| `scripts/dump_schema.py <src> <out.sql>` | Reconstructs the public schema as SQL straight from the Postgres catalog. Read-only. |
| `scripts/apply_sql.py <db> <file.sql>` | Applies a SQL file statement by statement, retrying until dependency order sorts itself out. |
| `scripts/copy_roster.py <old> <new> [--commit]` | Copies logins and roster, leaves metrics behind. Dry run by default. |

## Things that cost time, so they are written down

- **The Supabase CLI cannot dump without Docker.** `supabase db dump` shells out to pg_dump in
  a container. No Docker on this machine, hence `scripts/dump_schema.py`.
- **The schema has a genuine dependency cycle.** The matview `v_client_sub_scores` selects from
  `fn_client_sub_scores`, and another function selects from that matview. No single ordering
  works, which is why `apply_sql.py` retries instead of ordering perfectly.
- **`clients.id` is text**, not uuid — `CL-0026` style. Foreign keys to it must be text.
- **Materialized views are relkind `m`**, not `v`. A dump that only looks for `v` silently
  misses them and then fails on the index that belongs to one.
- **`auth.users.confirmed_at` is a generated column** and rejects any value, so a copy has to
  exclude generated columns.
- **A comment-only SQL chunk can hang a naive splitter.** `(--[^\n]*\n?)+` backtracks
  exponentially on a long comment header; check line by line instead.
- **Chain of ownership to respect**: `clients.ae` → `sales_team` → `profiles` → `auth.users`.
  Removing a person means deciding what happens to the records that name them.
