-- The sections Bobby asked for that were never built: analytics, search, the
-- Google listing, and social.
--
-- > "Maybe each source should have its own section... We have Google advertising.
-- > There should be something for Semrush or Google Analytics, or in that case
-- > maybe certain things are combined, so we don't have the same information
-- > twice. And whatever other sources are attached: social media, Stripe."
-- > — Bobby, 14 September, 3:56:36
--
-- Combined where they would repeat each other, as he asked: a client's website
-- day is one row, whether the number came from Analytics, Search Console or the
-- Google Business Profile. Social is per platform, because a follower on
-- Instagram and a follower on Facebook are not the same thing and summing them
-- would say nothing.
--
-- Everything is daily, like the ad tables, so any window can be summed and a
-- re-run replaces a day instead of doubling it.

-- ---------------------------------------------------------------------------
-- Which account belongs to which client.
--
-- Every source names accounts its own way: a GA4 property id, a Search Console
-- site URL, a Google location path, a Facebook page id. Nothing joins them to a
-- client but a human decision, so the decision is stored rather than guessed at
-- read time.
-- ---------------------------------------------------------------------------
create table client_channels (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references clients(id) on delete cascade,
  source      text not null check (source in
                ('ga4', 'search_console', 'gbp', 'instagram', 'facebook_page')),
  account_id  text not null,
  name        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (source, account_id)
);

create index client_channels_client_idx on client_channels (client_id);

-- ---------------------------------------------------------------------------
-- One row per client per day: how the website and the listing did.
-- ---------------------------------------------------------------------------
create table web_metrics_daily (
  id            uuid primary key default gen_random_uuid(),
  day           date not null,
  client_id     text not null references clients(id) on delete cascade,

  -- Google Analytics
  sessions      integer not null default 0,
  users         integer not null default 0,
  new_users     integer not null default 0,
  pageviews     integer not null default 0,
  conversions   integer not null default 0,

  -- Search Console
  search_clicks      integer not null default 0,
  search_impressions integer not null default 0,
  search_position    numeric(6,2),

  -- Google Business Profile. Calls and directions are the two that matter for a
  -- gym: someone asking for directions is closer to walking in than a pageview.
  map_views          integer not null default 0,
  listing_website    integer not null default 0,
  listing_calls      integer not null default 0,
  listing_directions integer not null default 0,

  synced_at     timestamptz not null default now(),
  unique (day, client_id)
);

create index web_metrics_client_day_idx on web_metrics_daily (client_id, day desc);

-- ---------------------------------------------------------------------------
-- Where the website traffic came from. This is the question Bobby actually
-- asked — "did the lead come in from Facebook? From Google? From the website?"
-- — for everyone who arrived, not only the ones who filled a form in.
-- ---------------------------------------------------------------------------
create table web_sources_daily (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  client_id  text not null references clients(id) on delete cascade,
  source     text not null,          -- google, facebook, (direct), chatgpt.com
  medium     text not null,          -- organic, cpc, referral, (none)
  sessions   integer not null default 0,
  users      integer not null default 0,
  conversions integer not null default 0,
  synced_at  timestamptz not null default now(),
  unique (day, client_id, source, medium)
);

create index web_sources_client_day_idx on web_sources_daily (client_id, day desc);

-- ---------------------------------------------------------------------------
-- Social, per platform.
-- ---------------------------------------------------------------------------
create table social_metrics_daily (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  client_id   text not null references clients(id) on delete cascade,
  platform    text not null check (platform in ('instagram', 'facebook')),

  followers   integer not null default 0,
  reach       integer not null default 0,
  impressions integer not null default 0,
  engaged     integer not null default 0,

  synced_at   timestamptz not null default now(),
  unique (day, client_id, platform)
);

create index social_metrics_client_day_idx on social_metrics_daily (client_id, day desc);

-- ---------------------------------------------------------------------------
-- Same access as the ad tables: the three people on the scoreboard can read
-- everything, nobody can write from the app, and anon gets nothing at all.
-- The syncs use the service key.
-- ---------------------------------------------------------------------------
alter table client_channels     enable row level security;
alter table web_metrics_daily   enable row level security;
alter table web_sources_daily   enable row level security;
alter table social_metrics_daily enable row level security;

create policy client_channels_read     on client_channels     for select to authenticated using (true);
create policy web_metrics_read         on web_metrics_daily   for select to authenticated using (true);
create policy web_sources_read         on web_sources_daily   for select to authenticated using (true);
create policy social_metrics_read      on social_metrics_daily for select to authenticated using (true);

revoke all on client_channels, web_metrics_daily, web_sources_daily, social_metrics_daily from anon;
revoke insert, update, delete, truncate on
  client_channels, web_metrics_daily, web_sources_daily, social_metrics_daily from authenticated;
grant select on client_channels, web_metrics_daily, web_sources_daily, social_metrics_daily to authenticated;

-- Search Console and Analytics both count a visit from Google. Reading them in
-- one place makes the overlap obvious rather than letting two sections claim the
-- same person twice — the repetition Bobby specifically did not want.
create view web_performance_v as
select w.*,
       case when w.sessions > 0
            then round(w.conversions::numeric / w.sessions * 100, 2) end as conversion_pct,
       case when w.search_impressions > 0
            then round(w.search_clicks::numeric / w.search_impressions * 100, 2) end as search_ctr_pct,
       w.listing_calls + w.listing_directions as listing_actions
from web_metrics_daily w;

alter view web_performance_v set (security_invoker = on);
grant select on web_performance_v to authenticated;
