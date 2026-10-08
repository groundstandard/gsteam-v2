-- =====================================================================
-- Grand Cast scoreboard snapshot (Kurt's third handoff, 2026-10-08 evening).
--
-- Each client carries a copy of its scoreboard numbers in `sb` (retainer, calls-board slot and score,
-- lifetime and latest results, Meta 90 days), shown on the client panel, the table, the map's
-- "Color by: Scoreboard score" and Insights. Taken from the handoff's migration-003-scoreboard.sql, on
-- our table name. The data itself is not in this public repo: it goes in with
-- Desktop\grand-cast-handoff\work\gc_scoreboard_snapshot.sql, which also runs this.
--
-- Run it before the new page goes live: the page writes `sb` on every save.
-- Safe to run twice. Same file for v1 and v2.
-- =====================================================================

alter table public.gc_clients add column if not exists sb jsonb;
create index if not exists gc_clients_scoreboard_idx on public.gc_clients(scoreboard_id);
