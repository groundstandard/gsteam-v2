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
| Clone | a file, not a project | Bobby's "save it on the side" — taken 2026-09-15 to `Desktop\gsteam-v1-clone\2026-09-15\`. Full copy: schema, all 1,945 rows across 32 tables, auth users, realtime, edge functions. See its README. |

Credentials are in `.env.local`, which is gitignored. The v1 connection is only ever used
read-only.

## What is in v2 right now

Schema copied whole from v1 and verified object for object: 28 tables, 1 view, 1 materialized
view, 32 functions, 26 triggers, 78 policies, 76 indexes.

Roster carried over — 90 clients with tier, sign date, cancellation date and reason, assigned
CA and meeting time; the 13 cancel reasons; CA-01; sales_team AM-01; config; 45 calls-board
rows; the GoHighLevel settings.

**Full history copied on 2026-09-15**, on James's instruction: *"dapat lahat nang laman na
meron sa original... pero yung mga pinapaalis ni Bobby, alisin na."* Every table now matches the
original row for row — 270 monthly metrics, 197 edit requests, 1,282 audit rows, 21 growth
events, and the rest. The only removal is Dimitri; two columns that pointed at his profile were
nulled rather than dropping the rows.

Note this differs from Bobby's own words in the transcript, where the full data lives in the
*clone* and the new version starts empty. It is one command to clear the metrics again if he
asks.

Users: bobby (owner) and kurt (ca) copied with their original ids so their magic links keep
working, mike@groundstandard.com created as admin, dimitri removed. His sales_team row AM-01
stays with a null profile_id, because 13 clients name him as their AE and dropping the row
would blank that.

New reporting tables, not in v1: `leads` (with the source bucket Bobby asked for — facebook,
google, website, phone — plus campaign and ad set ids), `ad_accounts`, `ad_campaigns`,
`ad_sets`, `ad_metrics_daily`, and `sync_runs` so a missing number can be told apart from a
failed sync. CTR and cost per lead are a view, never stored twice.

## What is not done

1. No Leads section and no Ads section yet. That is the actual feature work — see SPEC §6.
2. The existing dashboard still calls itself the dashboard. Bobby now calls it the CA rollup
   and wants the name to say so, and it is otherwise not to be changed.
3. No GoHighLevel or Facebook sync. Needs API access for both.
4. No MCP server over the scoreboard yet.
5. Google sign-in is off. v1 has it on; v2 needs a new client secret from the Google console,
   which is not retrievable from the old project.

### Copied beyond the tables

- **Realtime**: the `supabase_realtime` publication with its 18 tables. Missing this is silent —
  the calls board simply stops updating for everyone else. Restored 2026-09-15.
- **Edge Functions**: `admin-edit-user` and `admin-invite-user`, downloaded from the original
  with `functions download --use-api` and redeployed to v2. Both only use `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`, which Supabase sets automatically, so no secrets to carry across.
  **`verify_jwt` must be true** — the CLI deploys it false and ignores the flag, so it is set
  afterwards through the Management API.
- Storage buckets, cron jobs and vault secrets: none exist on the original, nothing to copy.
- Still not carried: **auth settings** — redirect URLs, email templates, providers. Those are
  dashboard configuration and have to be set on v2 before magic links will work on a new URL.

## Where it lives

| | |
|---|---|
| Repo | `groundstandard/gsteam-v2` on GitHub, public, branch `main`. |
| Deploy | https://gsteam-v2.vercel.app — Vercel team Ground Standard Agency, imported from the repo, so a push to `main` deploys. |
| Build | `vercel.json` runs `node scripts/build-config.js`, which writes `config.js` from the Vercel env vars. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set on production, preview and development. |
| Auth redirects | `site_url` is the Vercel URL; the allow list also keeps `localhost:5180` so local work still logs in. |

## Scripts

Run from the project root. All three take connection strings as arguments; none of them hold
credentials.

| Script | What it does |
|---|---|
| `scripts/dump_schema.py <src> <out.sql>` | Reconstructs the public schema as SQL straight from the Postgres catalog. Read-only. |
| `scripts/apply_sql.py <db> <file.sql>` | Applies a SQL file statement by statement, retrying until dependency order sorts itself out. |
| `scripts/copy_roster.py <old> <new> [--commit]` | Copies logins and roster, leaves metrics behind. Dry run by default. |
| `scripts/copy_history.py <old> <new> [--commit]` | The second pass — metrics, check-ins, growth events, edit requests, invites, audit log. Dry run by default. |
| `scripts/dump_clone.py <src> <out-dir>` | Takes the full side copy: schema, every row as gzipped CSV, auth, realtime, sequences. Read-only. |
| `scripts/restore_clone.py <target> <dir> [--commit]` | Puts a dump back on an empty project. Dry run by default. Written, not yet run against a real project. |

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
- **A CSV row count is not a line count.** A jsonb field can hold a newline; CSV quotes it. Ask
  Postgres for `count(*)` instead of counting line breaks in the copied stream.
- **Chain of ownership to respect**: `clients.ae` → `sales_team` → `profiles` → `auth.users`.
  Removing a person means deciding what happens to the records that name them.
