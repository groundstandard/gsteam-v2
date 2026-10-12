-- =====================================================================
-- Grand Cast account types (Kurt's eleventh handoff, 2026-10-13, 1:26 AM).
--
-- Blank is a martial arts gym, counted everywhere. 'na' is a business that is not a martial arts gym,
-- shown but left out of gym averages; 'non-ma' is one that is hidden; 'diy' is the do-it-yourself package,
-- where metrics are not tracked, also hidden. Taken from the handoff's migration-008-segment.sql, on our
-- table name. That file also adds three hidden accounts and marks two others; that is client data and
-- lives outside this public repo, in Desktop\grand-cast-handoff\work\gc_handoff11_changes.sql, which also
-- runs this.
--
-- Run it before the new page goes live: the page writes this column on every save.
-- Safe to run twice. Same file for v1 and v2.
-- =====================================================================

alter table public.gc_clients add column if not exists segment text;
