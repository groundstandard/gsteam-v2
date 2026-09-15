-- One conversation, shared by the three people on the scoreboard.
--
-- James, September 16: "iisang conversation lang na nasa loob ng app magagamit
-- nila." One thread rather than three private ones, so nobody has a window into
-- anyone else that they do not have into themselves — and so Kurt can see that
-- Mike already logged Dallas instead of logging it twice.
--
-- The thread is shared; the rights are not. Every message records who sent it,
-- and the tools it triggers run as that person, so a CA reaching past their own
-- book is refused by Postgres exactly as it is in the app.
--
-- Worth writing down for the day a second CA joins: in a shared thread, an answer
-- about one CA's book is readable by the other, even though they could not have
-- asked for it themselves. With one CA and two admins that changes nothing. With
-- two CAs it does, and this table will need splitting.

create table assistant_messages (
  id           bigserial primary key,

  -- 'user' is a person typing, 'assistant' is the reply, 'tool' records what was
  -- actually done so the thread shows the work rather than only the summary.
  role         text not null check (role in ('user', 'assistant', 'tool')),
  content      text not null,

  -- Who typed it. Null on assistant and tool rows, which belong to the thread
  -- rather than to a person.
  author_id    uuid references profiles(id) on delete set null,
  author_name  text,

  -- What the assistant did, if anything: [{name, arguments, result}]. Kept so a
  -- number in the board can be traced back to the sentence that put it there.
  tool_calls   jsonb,

  created_at   timestamptz not null default now()
);

create index assistant_messages_recent_idx on assistant_messages (created_at desc);

alter table assistant_messages enable row level security;

-- Everyone on the scoreboard reads the whole thread. That is the point of it.
create policy assistant_read on assistant_messages
  for select to authenticated using (is_on_the_scoreboard());

-- A person may add their own message and may not sign someone else's name to it.
create policy assistant_write on assistant_messages
  for insert to authenticated
  with check (is_on_the_scoreboard() and role = 'user' and author_id = auth.uid());

-- Assistant and tool rows are written by the edge function with the service role,
-- which these policies do not apply to. Nobody edits or deletes anything: a
-- conversation that can be quietly rewritten is not a record of what happened.

grant select, insert on assistant_messages to authenticated;
grant usage, select on sequence assistant_messages_id_seq to authenticated;
