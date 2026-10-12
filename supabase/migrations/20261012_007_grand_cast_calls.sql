-- =====================================================================
-- Grand Cast call summaries (Kurt's eighth handoff, 2026-10-12).
--
-- Each client keeps the summaries of its weekly strategy calls, taken from Kurt's Otter recordings:
-- date, minutes, link, summary, wins, concerns, next steps, mood and a risk rating. A recent high or
-- medium risk call raises a flag on Needs attention and counts as contact. Taken from the handoff's
-- migration-006-calls.sql, on our table name.
--
-- Run it before the new page goes live: the page writes this column on every save.
-- Safe to run twice. Same file for v1 and v2.
-- =====================================================================

alter table public.gc_clients add column if not exists calls jsonb not null default '[]';
