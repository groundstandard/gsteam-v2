-- =====================================================================
-- Grand Cast health source (Kurt's fourth handoff, 2026-10-08, 11:34 PM).
--
-- The team decided health follows the client's scoreboard score, and a person can override it:
-- 'scoreboard' = health tracks the score, 'manual' = someone set it by hand, kept until they click
-- "Use scoreboard" on the client panel. Taken from the handoff's migration-003-scoreboard.sql, on our
-- table name. Kurt's other changes (and which clients start as 'scoreboard') are client data, so they
-- are not in this public repo: Desktop\grand-cast-handoff\work\gc_handoff4_changes.sql, which also runs this.
--
-- Run it before the new page goes live: the page writes health_source on every save.
-- Safe to run twice. Same file for v1 and v2.
-- =====================================================================

alter table public.gc_clients
  add column if not exists health_source text check (health_source in ('scoreboard','manual'));
