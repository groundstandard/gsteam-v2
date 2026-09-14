# GS Team Scoreboard v2 — what Bobby asked for

Everything here is taken from the September 14, 2026 Zoom (Bobby, Mike Spyrou, Kurt, Angelo),
transcript timestamps in brackets. Where the Otter summary and the transcript disagree, the
transcript wins.

## 1. Two databases, not one

**The clone is a backup. The new version is the clean one.** The summary collapses these into
one line; Bobby was explicit that they are separate.

> "I don't want to lose all of this data. What I want to do is I want to check to see if this
> data is going to be accurate when the new data comes in. So how do we save this?" [3:48:40]
> "Can you maybe clone this and just save this on the side?" [3:49:31]
> "Clone it, save it on the side, and then give me a brand new version." [3:49:41]

- **Clone** — full copy, every table, every row. Parked. Its only job is to be the reference
  Bobby checks the incoming GoHighLevel and Facebook numbers against.
- **New version** — fresh database, roster only.

## 2. What survives into the new version

> "I want the roster to stay. You can delete the data, right? But I want to keep the client
> tier." [3:50:36]
> "Client sign date. If they canceled, if they canceled, then we want to know if they canceled.
> But all of the data on this stuff doesn't need to be there." [3:50:54]

Keep per client: name, tier, sign date, cancellation flag + date + reason, assigned CA.
Delete: every metric row — monthly, weekly, check-ins, growth events, reviews, surveys,
adjustments, edit requests, audit log.

## 3. Users

> "We could take Dimitri out and add Kurt and Mike, mike@groundstandard.com." [3:49:41]

Remove Dimitri. Add Kurt and mike@groundstandard.com.

## 4. Where the data comes from

> "I want to connect the MCP to this, and then I want to populate this with the information
> from Go High Level, from Facebook, instead of Kurt having to update this manually and Mike
> updating this manually, and then Kurt and Mike, they'll confirm the data. They'll have to
> fill in anything else that they can't find, that the AI can't find." [3:48:40]

Two separate pieces, often confused:

- **The MCP server** is so Bobby's agents can read and write the scoreboard from Claude.
  Angelo offered it, Bobby said yes: "you want me to create the MCP for GST, so your AI could
  mess around with it" — "Yes." [3:48:18]
- **The sync** is what actually fills the tables from GoHighLevel and Facebook on a schedule.
  Kurt and Mike stay in the loop to confirm and to fill what the automation cannot find.

## 5. Lead source — the gap Bobby named

> "Now we're gonna have to know a little bit more information. Like if a lead, I want to know:
> did the lead come in from Facebook? Did the lead come in from Google? Did the lead come in
> from the website? Did the lead come in from the phone?" [3:51:14]
> "We weren't differentiating where the lead was coming from because I didn't need to know that
> data to pay you and Kurt." [3:52:37]

Every lead carries its source: Facebook · Google · website · phone.

## 6. Reporting — new sections, and the existing dashboard is not to be touched

> "This dashboard shouldn't be changed because it serves a purpose." [3:52:37]
> "This is the client associate rollup, the CA rollup. Basically this is just like what's my
> book look like and how is it performing. There's nothing to do with actual reports."

So the current dashboard stays exactly as it is, renamed to what it actually is. Everything
below is new surface beside it.

**Ad management as its own tab** — Mike's ask [3:56:10]:

> "Ad management should be its own tab... maybe look at each campaign's performance, like
> that's active. Active campaign performance, leads generated, lead costs, CTR. Just at a
> glance, be like, okay, they're looking good, they need some work."

**One section per source, each with subsections** — Bobby [3:56:36]:

> "Maybe each source should have its own section, and each section should have subsections.
> So for the meta advertising, the subsections would be by campaign and ad set... We have
> Google advertising. There should be something for Semrush or Google Analytics, or in that
> case maybe certain things are combined, so we don't have the same information twice. And
> whatever other sources are attached: social media, Stripe."

| Section | Subsections |
|---|---|
| Meta advertising | campaign, ad set |
| Google advertising | campaign |
| Semrush / Google Analytics | combined where the two would repeat each other |
| Social media | per platform |
| Stripe | revenue |
| Leads | all leads, by source |

Bobby also floated, without deciding: a members section and a finances section. Not in scope
until he says so.

## 7. Timeline

> Bobby: "When can you do that?" — Angelo: "Give me at least tomorrow or the next day."
> [3:50:08]

Meeting was September 14. That puts it on September 15 or 16.

## Open questions for Bobby

1. Where does the clone live — its own Supabase project parked on the side, or a backup file?
   A parked project costs money every month; a file costs nothing but is harder to read.
2. Which GoHighLevel account do we pull from — agency level across all sub-accounts, or one
   sub-account at a time?
3. Which Facebook ad accounts, and who grants access?
4. The current dashboard needs a name now that it is "the CA rollup" and not the whole app.
