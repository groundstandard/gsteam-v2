-- GS Team Scoreboard v2 — reporting tables.
--
-- New surface only. Nothing here touches the tables the CA rollup reads, because Bobby was
-- explicit that the existing dashboard keeps working exactly as it does today (transcript
-- 3:52:37). These tables are what the GoHighLevel and Facebook syncs write into, and what the
-- new Leads and Ads sections read.
--
-- Source of truth for the shape: docs/SPEC-v2.md sections 5 and 6.

-- ---------------------------------------------------------------------------
-- Leads. The gap Bobby named: the old app never recorded where a lead came from.
-- ---------------------------------------------------------------------------

create type lead_source as enum ('facebook', 'google', 'website', 'phone', 'referral', 'walk_in', 'other');

create table leads (
  id             uuid primary key default gen_random_uuid(),
  -- clients.id is text (CL-0001 style), not a uuid — the foreign key must match.
  client_id      text not null references clients(id) on delete cascade,

  -- Where it came from. source is the bucket Bobby asked for; source_detail keeps the raw
  -- string the platform gave us, so a mis-bucketed lead can be traced and re-bucketed.
  source         lead_source not null default 'other',
  source_detail  text,

  -- Ad attribution, when the lead came from a campaign. Kept as platform ids rather than
  -- foreign keys: a lead can arrive before the nightly ad sync has seen that campaign.
  platform            text,
  platform_campaign_id text,
  platform_adset_id    text,

  -- Identity, as far as we are allowed to hold it.
  external_id    text,
  first_name     text,
  last_name      text,
  email          text,
  phone          text,

  -- The funnel, matching the counts the scorecard already speaks in.
  created_at     timestamptz not null default now(),
  booked_at      timestamptz,
  showed_at      timestamptz,
  signed_at      timestamptz,
  lost_at        timestamptz,
  lost_reason    text,

  value          numeric(12,2),

  -- Provenance. 'ghl' | 'meta' | 'manual' — so a human correction is never overwritten by
  -- the next sync, and so Kurt and Mike can see what the automation could not find.
  origin         text not null default 'ghl',
  confirmed_by   uuid references profiles(id),
  confirmed_at   timestamptz,

  raw            jsonb,
  synced_at      timestamptz not null default now(),

  unique (client_id, origin, external_id)
);

create index leads_client_created_idx on leads (client_id, created_at desc);
create index leads_source_idx         on leads (source, created_at desc);
create index leads_campaign_idx       on leads (platform, platform_campaign_id);

-- ---------------------------------------------------------------------------
-- Ads. One section per source, subsections by campaign and ad set (transcript 3:56:36).
-- ---------------------------------------------------------------------------

create table ad_accounts (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null references clients(id) on delete cascade,
  platform     text not null check (platform in ('meta', 'google')),
  account_id   text not null,
  name         text,
  currency     text not null default 'USD',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (platform, account_id)
);

create table ad_campaigns (
  id             uuid primary key default gen_random_uuid(),
  ad_account_id  uuid not null references ad_accounts(id) on delete cascade,
  platform_id    text not null,
  name           text,
  status         text,
  objective      text,
  started_at     timestamptz,
  synced_at      timestamptz not null default now(),
  unique (ad_account_id, platform_id)
);

create table ad_sets (
  id              uuid primary key default gen_random_uuid(),
  ad_campaign_id  uuid not null references ad_campaigns(id) on delete cascade,
  platform_id     text not null,
  name            text,
  status          text,
  synced_at       timestamptz not null default now(),
  unique (ad_campaign_id, platform_id)
);

-- Daily rows, one per level. Daily rather than monthly so any date range Mike asks for can be
-- summed, and so a re-sync of one day cannot corrupt a month.
create table ad_metrics_daily (
  id           uuid primary key default gen_random_uuid(),
  day          date not null,
  level        text not null check (level in ('account', 'campaign', 'adset')),
  ref_id       uuid not null,               -- ad_accounts.id | ad_campaigns.id | ad_sets.id
  client_id    text not null references clients(id) on delete cascade,

  spend        numeric(12,2) not null default 0,
  impressions  bigint        not null default 0,
  clicks       bigint        not null default 0,
  leads        integer       not null default 0,

  synced_at    timestamptz not null default now(),
  unique (day, level, ref_id)
);

create index ad_metrics_client_day_idx on ad_metrics_daily (client_id, day desc);

-- CTR and cost per lead are derived, never stored — two places to be wrong otherwise.
create view ad_metrics_daily_v as
select m.*,
       case when m.impressions > 0 then round(m.clicks::numeric / m.impressions * 100, 2) end as ctr_pct,
       case when m.leads > 0       then round(m.spend / m.leads, 2)                        end as cost_per_lead
from ad_metrics_daily m;

-- ---------------------------------------------------------------------------
-- Sync bookkeeping. Kurt and Mike need to know whether a number is missing because the
-- business had none, or because the sync failed at 3am.
-- ---------------------------------------------------------------------------

create table sync_runs (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('ghl', 'meta', 'google_ads', 'stripe', 'ga4', 'semrush')),
  client_id     text references clients(id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running' check (status in ('running', 'ok', 'failed')),
  rows_written  integer not null default 0,
  window_from   date,
  window_to     date,
  error         text
);

create index sync_runs_recent_idx on sync_runs (source, started_at desc);

-- ---------------------------------------------------------------------------
-- Row level security. Same posture as the rest of the app: signed-in staff read, service role
-- writes. The syncs run as the service role, so they bypass these by design.
-- ---------------------------------------------------------------------------

alter table leads            enable row level security;
alter table ad_accounts      enable row level security;
alter table ad_campaigns     enable row level security;
alter table ad_sets          enable row level security;
alter table ad_metrics_daily enable row level security;
alter table sync_runs        enable row level security;

create policy leads_read            on leads            for select to authenticated using (true);
create policy ad_accounts_read      on ad_accounts      for select to authenticated using (true);
create policy ad_campaigns_read     on ad_campaigns     for select to authenticated using (true);
create policy ad_sets_read          on ad_sets          for select to authenticated using (true);
create policy ad_metrics_read       on ad_metrics_daily for select to authenticated using (true);
create policy sync_runs_read        on sync_runs        for select to authenticated using (true);

-- Humans may correct a lead by hand — that is the "fill in anything else that they can't
-- find" part of the brief. Everything else is sync-owned.
create policy leads_manual_write on leads for update to authenticated using (true) with check (true);
create policy leads_manual_insert on leads for insert to authenticated with check (origin = 'manual');
