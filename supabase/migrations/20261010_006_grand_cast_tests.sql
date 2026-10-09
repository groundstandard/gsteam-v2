-- =====================================================================
-- Grand Cast test log (Kurt's seventh handoff, 2026-10-10).
--
-- Each client keeps a list of tests: what changed, in which area, from when to when, what should
-- improve, and whether it worked. Shown on the client panel, in the monthly report and in Insights.
-- Taken from the handoff's migration-005-tests.sql, on our table name.
--
-- Run it before the new page goes live: the page writes this column on every save.
-- Safe to run twice. Same file for v1 and v2.
-- =====================================================================

alter table public.gc_clients add column if not exists tests jsonb not null default '[]';
