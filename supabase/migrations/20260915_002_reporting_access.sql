-- Close two holes the reporting tables were created with.
--
-- 1. `ad_metrics_daily_v` is owned by postgres and Postgres runs a view with its owner's
--    rights unless told otherwise, so selecting through the view skipped the row level
--    security on ad_metrics_daily entirely. Nothing has leaked — the table is still empty —
--    but the moment the Facebook sync writes to it, every ad number would be readable.
--
-- 2. Supabase's default privileges hand `anon` full DML on any new table. RLS stops it today
--    because none of these tables has a policy for anon, but a future policy written as
--    `using (true)` without naming a role would suddenly apply to the public key too. The
--    app is signed-in only, so anon has no business here at all.

alter view public.ad_metrics_daily_v set (security_invoker = on);

revoke all on public.leads            from anon;
revoke all on public.ad_accounts      from anon;
revoke all on public.ad_campaigns     from anon;
revoke all on public.ad_sets          from anon;
revoke all on public.ad_metrics_daily from anon;
revoke all on public.ad_metrics_daily_v from anon;
revoke all on public.sync_runs        from anon;

-- authenticated keeps select; writes stay with the syncs (service role) and the one
-- hand-correction policy on leads.
revoke insert, update, delete, truncate on public.ad_accounts      from authenticated;
revoke insert, update, delete, truncate on public.ad_campaigns     from authenticated;
revoke insert, update, delete, truncate on public.ad_sets          from authenticated;
revoke insert, update, delete, truncate on public.ad_metrics_daily from authenticated;
revoke insert, update, delete, truncate on public.sync_runs        from authenticated;
revoke delete, truncate on public.leads from authenticated;

grant select on public.ad_metrics_daily_v to authenticated;
