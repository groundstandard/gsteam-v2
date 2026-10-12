-- =====================================================================
-- Grand Cast bubble name (Kurt's tenth handoff, 2026-10-12, 11:39 PM).
--
-- An optional short name an editor sets per client, shown inside its bubble on the map; without one the
-- page shortens the full name itself. Taken from the handoff's migration-007-short-name.sql, on our
-- table name. The same handoff's data correction is client data and lives outside this public repo,
-- in Desktop\grand-cast-handoff\work\gc_handoff10_changes.sql, which also runs this.
--
-- Run it before the new page goes live: the page writes this column on every save.
-- Safe to run twice. Same file for v1 and v2.
-- =====================================================================

alter table public.gc_clients add column if not exists short_name text;
