# Updating the scoreboard by talking to Claude

For Bobby, Kurt and Mike. Fifteen minutes to set up, once.

When it is done, you tell Claude what happened and it writes it to the scoreboard:

> "Log 41 leads, 18 appointments booked and $1,200 ad spend for 10th Planet Dallas for August."
> "Leave a note on Fresno: owner's on vacation this week, front desk isn't following up."
> "Put a gear sale on Bodega — 14 people, $890."
> "What calls do we have Wednesday, and which ones need attention?"

It writes to the real board. Whatever you log shows up for the other two, immediately, with
your name on it.

## What you need first

1. **Claude Desktop** — the app, not the website. https://claude.ai/download
2. **Node.js** — https://nodejs.org, the LTS button. Click through the installer.
3. **Git** — https://git-scm.com/download/win
4. **The service role key** — ask Angelo. It is the password to the whole scoreboard, so it
   goes in your config file and nowhere else. Not in Slack, not in email.

## Setting it up

Open PowerShell (Start → type "powershell") and paste these, one line at a time:

```powershell
cd ~\Desktop
git clone https://github.com/groundstandard/gsteam-v2.git
cd gsteam-v2\mcp
powershell -ExecutionPolicy Bypass -File setup.ps1 -ServiceKey "PASTE-THE-KEY-HERE" -Email you@groundstandard.com
```

Use your own address in that last line — `bobby@`, `kurt@` or `mike@groundstandard.com`. That is
the name that ends up on everything you log, so it has to be yours.

The script checks everything before it changes anything: that Node is new enough, that the key
actually opens the scoreboard, and that your address is one of the three on it. If any of that
fails it tells you which and stops, and your Claude settings are left untouched.

## Then — and this part trips everyone up

**Quit Claude Desktop properly.** Right-click its icon in the system tray, next to the clock,
and choose Quit. Closing the window only hides it; the old connection stays up and you will
spend twenty minutes wondering why nothing changed.

Open it again, start a new chat, and ask:

> Use the gsteam connection_info tool. Which scoreboard is it pointed at?

It should answer: GS Team Scoreboard v2, gsteam-v2.vercel.app, 90 clients, writes live, credited
to you. If it says anything else, stop and send Angelo what it said.

## What it can and cannot do

**It can:** read the roster, a client's numbers, the CA rollup, leads and their sources, ad
performance by campaign and ad set, the calls board and the sync log. And it can log monthly
metrics, a weekly check-in, a growth event, a call note, and a lead the automation missed.

**It cannot:** add or cancel a client, change anyone's pay or bonus, or delete anything. Those
stay in the app where there is a person and an approval behind them.

**One thing worth understanding:** the colours on the calls board are not something anyone sets.
Each one is that account's current score — it goes amber or red when the client's numbers move,
and nothing else changes it. You can leave a note on a call; you cannot paint a cell. If Claude
tells you an account is red at 42, that 42 is where the colour came from.

## If something looks wrong

Ask it. It is better at saying "I don't have that" than at guessing, and it will tell you when a
number is old:

> "Why is Grit red?"
> "When did anyone last update Universal?"
> "Has the GoHighLevel sync run?"

An empty Leads or Ads screen is not a bug yet — those fill up when the GoHighLevel and Facebook
syncs are connected, which has not happened. The tools say so rather than showing zeroes.
