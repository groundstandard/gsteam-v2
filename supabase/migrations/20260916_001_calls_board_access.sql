-- The calls board let in anyone with a login, not anyone on the scoreboard.
--
-- Its policies asked only `auth.uid() is not null`, while every other table asks
-- whether the caller is an owner, an admin, or the CA whose book it is. Signups
-- were also open, so a stranger could create an account and then read and edit
-- the weekly call notes for all 45 accounts.
--
-- Found by asking Postgres, as a user with a login but no profile, what it would
-- let them do: nothing on the roster, nothing on the metrics, and all 45 rows of
-- the calls board.
--
-- Being on the scoreboard means having a profile. That is the line every other
-- table draws, and now this one draws it too.

create or replace function public.is_on_the_scoreboard()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

comment on function public.is_on_the_scoreboard() is
  'True when the caller has a profile — i.e. Bobby put them on the team, not merely that they signed up.';

drop policy if exists call_statuses_sel on public.call_statuses;
drop policy if exists call_statuses_upd on public.call_statuses;
drop policy if exists call_statuses_ins on public.call_statuses;

create policy call_statuses_sel on public.call_statuses
  for select to authenticated using (is_on_the_scoreboard());

create policy call_statuses_ins on public.call_statuses
  for insert to authenticated with check (is_on_the_scoreboard());

create policy call_statuses_upd on public.call_statuses
  for update to authenticated using (is_on_the_scoreboard()) with check (is_on_the_scoreboard());
