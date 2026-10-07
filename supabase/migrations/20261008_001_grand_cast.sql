-- =====================================================================
-- Grand Cast inside the GS Team Scoreboard (Kurt's client map, handed off 2026-10-07).
--
-- Adapted from the handoff's schema.sql. Two changes, both on purpose:
--   1. Its own table names (gc_plans, gc_clients, gc_log) and bucket (grand-cast-logos).
--      The scoreboard already has a `clients` table; the handoff's file would have
--      collided with it.
--   2. Access follows the scoreboard's roles: owner, admin, integrator and CA read and
--      write; sales sees nothing. The handoff's "any signed-in user" policies would also
--      have landed on the scoreboard's own clients table and opened it to everyone.
--
-- Data goes in separately (gc_seed.sql, kept out of this public repo).
-- Safe to run twice.
-- =====================================================================

create table if not exists public.gc_plans (
  id        text primary key,
  name      text not null,
  color     text not null default '#7D8A99',
  term      int  not null default 0,      -- contract length in months (drives renewal dates)
  cadence   int  not null default 0,      -- days between strategy calls (0 = no call tracking)
  standard  boolean not null default false,
  blurb     text,
  position  int  not null default 0
);

create table if not exists public.gc_clients (
  id                text primary key,
  name              text not null,
  service_id        text references public.gc_plans(id) on update cascade,
  status            text not null default 'active' check (status in ('active','cancelled')),
  since             date,
  cancelled_on      date,
  cancel_reason     text,
  cancel_note       text,
  health            text not null default '' check (health in ('','green','yellow','red')),
  last_call         date,
  last_contact      date,
  price             numeric(10,2),
  manager           text,
  location          text,                 -- "City, ST"; the map groups by the ST part
  notes             text,
  logo_url          text,
  logo_path         text,                 -- path in the 'grand-cast-logos' bucket
  referred_by       text references public.gc_clients(id) on delete set null,
  referred_by_other text,
  addons            text[] not null default '{}',
  scoreboard_id     text,                 -- reserved: the matching row in public.clients
  updated_at        timestamptz not null default now()
);
create index if not exists gc_clients_service_idx on public.gc_clients(service_id);
create index if not exists gc_clients_referred_by_idx on public.gc_clients(referred_by);

create table if not exists public.gc_log (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references public.gc_clients(id) on delete cascade,
  kind        text not null default 'note' check (kind in ('note','call','contact','win','issue')),
  text        text not null default '',
  at          timestamptz not null default now(),
  author_id   uuid references auth.users(id) on delete set null,
  author_name text
);
create index if not exists gc_log_client_idx on public.gc_log(client_id, at desc);

-- Who may use the Grand Cast: the scoreboard's own roles, read through caller_role().
create or replace function public.gc_can_use()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.caller_role() in ('owner', 'admin', 'integrator', 'ca'), false);
$$;

alter table public.gc_plans   enable row level security;
alter table public.gc_clients enable row level security;
alter table public.gc_log     enable row level security;

drop policy if exists "gc read plans"    on public.gc_plans;
drop policy if exists "gc write plans"   on public.gc_plans;
drop policy if exists "gc read clients"  on public.gc_clients;
drop policy if exists "gc write clients" on public.gc_clients;
drop policy if exists "gc read log"      on public.gc_log;
drop policy if exists "gc write log"     on public.gc_log;

create policy "gc read plans"    on public.gc_plans   for select to authenticated using (public.gc_can_use());
create policy "gc write plans"   on public.gc_plans   for all    to authenticated using (public.gc_can_use()) with check (public.gc_can_use());
create policy "gc read clients"  on public.gc_clients for select to authenticated using (public.gc_can_use());
create policy "gc write clients" on public.gc_clients for all    to authenticated using (public.gc_can_use()) with check (public.gc_can_use());
create policy "gc read log"      on public.gc_log     for select to authenticated using (public.gc_can_use());
create policy "gc write log"     on public.gc_log     for all    to authenticated using (public.gc_can_use()) with check (public.gc_can_use());

-- Live updates: every open copy of the page refreshes when data changes.
do $$ begin
  begin alter publication supabase_realtime add table public.gc_plans;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.gc_clients; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.gc_log;     exception when duplicate_object then null; end;
end $$;

-- Logos: public read (shown as <img>), upload and delete for the same roles.
insert into storage.buckets (id, name, public) values ('grand-cast-logos', 'grand-cast-logos', true)
  on conflict (id) do nothing;
drop policy if exists "grand cast upload logos" on storage.objects;
drop policy if exists "grand cast delete logos" on storage.objects;
create policy "grand cast upload logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'grand-cast-logos' and public.gc_can_use());
create policy "grand cast delete logos" on storage.objects for delete to authenticated
  using (bucket_id = 'grand-cast-logos' and public.gc_can_use());
