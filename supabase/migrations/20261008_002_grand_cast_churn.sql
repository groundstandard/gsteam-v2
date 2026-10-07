-- =====================================================================
-- Grand Cast churn tracking (Kurt's second handoff, 2026-10-08).
--
-- The columns behind the new cancel form: what the client said (category + specific reason), the
-- account manager's root cause, controllable, notice date, contract timing, early warning, competitor,
-- win-back, and save attempts. Taken from the handoff's migration-002-churn.sql, on our table name.
--
-- Run it before the new page goes live: the page writes these columns on every save.
-- Safe to run twice. Same file for v1 and v2.
-- =====================================================================

alter table public.gc_clients
  add column if not exists notice_on        date,
  add column if not exists cancel_category  text,
  add column if not exists root_category    text,
  add column if not exists root_reason      text,
  add column if not exists controllable     text check (controllable in ('yes','partial','no')),
  add column if not exists contract_timing  text check (contract_timing in ('onboarding','midterm','renewal','monthly')),
  add column if not exists warned           text check (warned in ('yes','no','unsure')),
  add column if not exists first_warning_on date,
  add column if not exists competitor       text,
  add column if not exists win_back         text check (win_back in ('yes','maybe','no')),
  add column if not exists win_back_on      date,
  add column if not exists saves            jsonb not null default '[]';

-- Reasons saved with the old flat list become category + specific reason (as in the handoff). This covers
-- Kurt's own clients and the 38 cancelled ones brought in from the scoreboard.
update public.gc_clients set cancel_category = 'price',      cancel_reason = null                              where cancel_category is null and cancel_reason = 'Price or budget';
update public.gc_clients set cancel_category = 'results',    cancel_reason = null                              where cancel_category is null and cancel_reason = 'Not seeing results';
update public.gc_clients set cancel_category = 'business',   cancel_reason = null                              where cancel_category is null and cancel_reason = 'Closed or sold the gym';
update public.gc_clients set cancel_category = 'competitor', cancel_reason = 'Switched to another agency'     where cancel_category is null and cancel_reason = 'Switched to another provider';
update public.gc_clients set cancel_category = 'competitor', cancel_reason = 'Took it in-house or hired staff' where cancel_category is null and cancel_reason = 'Took it in-house';
update public.gc_clients set cancel_category = 'business',   cancel_reason = 'Paused or seasonal'             where cancel_category is null and cancel_reason = 'Paused or seasonal';
update public.gc_clients set cancel_category = 'other',      cancel_reason = null                              where cancel_category is null and cancel_reason = 'Other';

-- The three reasons Kurt asked for on Oct 8 now sit under Fit and adoption, keeping the specific reason.
update public.gc_clients set cancel_category = 'fit'
 where cancel_category is null and cancel_reason in ('Absentee owner', 'Conflict of interest', 'Agency ended agreement');

-- Cancelled clients by stated category, to check the conversion.
select coalesce(cancel_category, '(none)') as category, count(*) as clients
  from public.gc_clients where status = 'cancelled' group by 1 order by 2 desc;
