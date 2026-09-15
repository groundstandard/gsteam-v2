# gsteam-mcp

The scoreboard as tools an AI can call. Bobby asked for this on the September 14 call:

> Angelo: "you want me to create the MCP for GST, so your AI could mess around with it"
> Bobby: "Yes." [3:48:18]

And the reason, in his words [3:48:40]:

> "I want to populate this with the information from Go High Level, from Facebook, instead of
> Kurt having to update this manually and Mike updating this manually, and then Kurt and Mike,
> they'll confirm the data. They'll have to fill in anything else that they can't find, that
> the AI can't find."

So Kurt says what happened, in a sentence, and the agent writes it to the scoreboard:

> "Log 41 leads and $1,200 ad spend for 10th Planet Dallas for August."
> "Ronin BJJ is at risk this week — owner's away and the front desk isn't following up."
> "Put a gear sale on Atlas Combat Club, 14 people, $890."

## The tools

**Reading**

| Tool | What it answers |
|---|---|
| `connection_info` | Which scoreboard, which app, who you are signed in as, and whether writes are live — proved with the live client and people counts. Deliberately does not print the Supabase project id. |
| `list_clients` | The roster — active, cancelled or all, filtered by CA or name. |
| `get_client` | One client: the roster row, recent monthly metrics, leads by source. |
| `ca_rollup` | One row per client with the metrics summed over a window — what a book looks like and how it is performing. |
| `list_leads` | Leads over a window, with source and how far each got. |
| `leads_by_source` | The Facebook / Google / website / phone split, with the funnel for each. |
| `ad_performance` | Spend, clicks, CTR, leads and cost per lead by campaign or ad set. |
| `calls_board` | The weekly calls board: which account is called on which day and at what time, its health colour, and the note on that call. Takes one `day` or the whole week. |
| `sync_status` | The last runs of each sync, so a missing number can be told from a failed job. |

**Writing** — only with `GSTEAM_ALLOW_WRITES=1`

| Tool | What it writes |
|---|---|
| `log_monthly_metrics` | A client's month. Re-logging the same month updates that row instead of adding a second. |
| `log_weekly_checkin` | The week's concern, win, and what each side is doing. |
| `log_growth_event` | A gear sale, review, referral or seminar. |
| `set_call_note` | The shared note on an account's weekly call. The colour is not settable — see below. |
| `record_lead` | A lead the automation missed — a phone call, a walk-in. |
| `update_lead` | Correct a lead's source, or stamp it booked, showed, signed or lost. |

It will **not** create or cancel clients, touch pay or bonus figures, or delete anything. Those
stay in the app, with a human and an approval behind them.

## Setup

For Bobby, Kurt or Mike setting this up on their own machine, hand them
[FOR-THE-TEAM.md](FOR-THE-TEAM.md) instead of this file — it assumes nothing and ends with one
command:

    powershell -ExecutionPolicy Bypass -File setup.ps1 -ServiceKey "<key>" -Email you@groundstandard.com

That installs the dependencies, proves the key opens the scoreboard, refuses an address that is
not one of the three people on it, writes the Claude Desktop config (backing up whatever was
there and leaving other servers alone), and tells them to quit Claude from the tray rather than
closing the window.

By hand:

    cd mcp
    npm install

Then add it to Claude. **Claude Desktop** — `claude_desktop_config.json`
(`%APPDATA%\Claude\` on Windows, `~/Library/Application Support/Claude/` on macOS):

```json
{
  "mcpServers": {
    "gsteam": {
      "command": "node",
      "args": ["C:\\Users\\Admin\\Desktop\\gsteam-v2\\mcp\\server.js"],
      "env": {
        "SUPABASE_URL": "https://obfekzpumitnybxfgnol.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "the service role key",
        "GSTEAM_ALLOW_WRITES": "1",
        "GSTEAM_ACTOR_EMAIL": "kurt@groundstandard.com"
      }
    }
  }
}
```

**Claude Code** — same shape, `claude mcp add gsteam node /path/to/mcp/server.js` then set the
env vars, or drop the block above into `.mcp.json`.

Restart Claude afterwards — a full quit, not just closing the window. On Windows the app keeps
running in the system tray and the server process with it, so a half-restart leaves the old code
running and you debug a bug you already fixed.

It should list fifteen tools. Ask it "what are you connected to?" — it should name GS Team
Scoreboard v2, the Vercel URL and the Supabase project, with 90 clients and three people on it.

## Environment

Two ways in, and only one belongs on someone else's laptop.

**Signed in — what the three people use.** No secret at all: the anon key is the same public key
the website ships, and the password is their own.

| | |
|---|---|
| `SUPABASE_URL` | Required. |
| `SUPABASE_ANON_KEY` | The public key. Says which project, nothing about who you are. |
| `GSTEAM_EMAIL` / `GSTEAM_PASSWORD` | That person's own login. |
| `GSTEAM_ALLOW_WRITES` | `1` turns the write tools on. Left off, they are not even listed. |
| `GSTEAM_DRY_RUN` | `1` reports what each write *would* do and writes nothing. |

**Service role — the maintainer's copy.** Bypasses row level security completely.

| | |
|---|---|
| `GSTEAM_SERVICE_MODE` | Must be exactly `1`. It has to be asked for, so it cannot be the accidental default. |
| `SUPABASE_SERVICE_ROLE_KEY` | The key itself. |
| `GSTEAM_ACTOR_EMAIL` | Optional. Names a person to credit; an address nobody owns says so on every write. |

## Two kinds of access, kept apart

The scoreboard has exactly three people on it — Bobby, Kurt and Mike — and that is Bobby's
call, not a technical limit to work around. Whoever maintains this server is not one of them and
should not be added to the roster to make testing convenient.

So the maintainer's copy is configured differently: **no `GSTEAM_ACTOR_EMAIL`**, because putting
one of their addresses there signs their name to your test, and **`GSTEAM_DRY_RUN=1` by
default**, switched off only for a deliberate end-to-end check that is then cleaned up. An
address that is not on the scoreboard no longer writes a silent blank — every write says
"Credited to nobody: <address> is not on this scoreboard."

## Who gets the credit, and who is stopped

Signed in, the author is the authenticated user and cannot be anyone else — there is no address
to type and therefore none to mistype or borrow.

More to the point, the limits stop being this server's opinion. Postgres applies the same rules
it applies in the app: Kurt reaches his own book and no further, Bobby and Mike reach everything,
and someone with a login but no profile reaches nothing at all. Remove a person in the app and
their server stops working the same minute — there is no shared key to rotate, because there is
no shared key.

`scripts/check_access.py` proves it by asking Postgres directly, as each person, inside a
transaction it rolls back. It found two real holes the first time it ran: the calls board asked
only whether the caller was logged in rather than whether they were on the scoreboard, and
signups were open, so anyone at all could get a login. Both are closed.

## Checking it

    GSTEAM_ALLOW_WRITES=1 GSTEAM_DRY_RUN=1 node check.js

Reads run against the live database. Writes run as a dry run, and every column each write would
set is checked against the real table — which catches the failure that actually happens, a
column named wrong, without firing the audit and retention-notification triggers on a real
client's row.

Last run: 8 read tools and 6 write tools, all passing, against 52 active clients and a
45-row calls board.

## The board's colours are computed, not stored

Worth knowing before anyone tries to "set" one. Each cell on the calls board is painted from
that account's current score — Kurt, 2026-07-28: "auto-color by score" — computed by
`CABT_clientSubScores` in `src/calc.jsx`. The colour moves when the client's numbers move, and
nothing else changes it.

The `status` column on `call_statuses` is what the board used *before* that change. Nothing has
read it since; every row still holds whatever someone set in July. The first version of this
server reported that column as the account's colour and offered a tool to write it — so it
would have told Kurt that Grit was healthy while the board showed red, and let him "set" a
value that changed nothing on screen.

Now the server loads `calc.jsx` and scores the accounts with the same function the app uses —
one engine, one answer, rather than a second implementation that drifts within a month. The
only thing settable on that board is the note, which is what `set_call_note` does.

Three things the first real use of it found, all now fixed. `calls_board` promised "which
accounts are scheduled when" and returned no schedule at all — the grid lives in
`src/calls-board.jsx`, not in the database, so the server now reads it from there. And every
date was a day early: `toISOString()` is UTC, and at 1am in Manila that is still yesterday, so
"today" slipped back a day and a Monday week-start became Sunday. And the health colours came
from a column the app stopped reading in July — see above.

## A caution worth keeping

This server holds the service role key, which bypasses row level security completely. It is
meant to run locally, beside Claude, on a machine that belongs to someone who already has full
access to the scoreboard. Do not put it on a public host without putting real authentication in
front of it first.
