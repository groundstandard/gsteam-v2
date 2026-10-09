-- =====================================================================
-- Grand Cast settings (Kurt's fifth handoff, 2026-10-09).
--
-- One row, id 'main', holding the alert thresholds edited on the new Health rules view
-- (data.rules) and the Scorecard targets set on Insights (data.targets). Taken from the
-- handoff's migration-004-settings.sql, on our table name, and with the same access as the
-- other Grand Cast tables: the handoff let every signed-in user read and write it, which here
-- would include Sales.
--
-- Run it before the new page goes live: the page reads this table on load.
-- Safe to run twice. Same file for v1 and v2.
-- =====================================================================

create table if not exists public.gc_settings (
  id   text primary key,            -- always 'main'
  data jsonb not null default '{}'  -- {rules: {...}, targets: {...}}
);

alter table public.gc_settings enable row level security;

drop policy if exists "gc read settings"  on public.gc_settings;
drop policy if exists "gc write settings" on public.gc_settings;

create policy "gc read settings"  on public.gc_settings for select to authenticated using (public.gc_can_use());
create policy "gc write settings" on public.gc_settings for all    to authenticated using (public.gc_can_use()) with check (public.gc_can_use());

-- Live updates: a change on one open page shows on the others.
do $$ begin
  begin alter publication supabase_realtime add table public.gc_settings; exception when duplicate_object then null; end;
end $$;
