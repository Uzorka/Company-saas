-- ===========================================================================
-- Messaging: channels and direct messages.
--
-- THE DECISION THIS SCHEMA ENCODES
--
-- Only the people in a conversation can read it. Not Management, not the
-- account that installed the product, not a support screen — nobody. That is
-- enforced by the policies below rather than by hiding a button, because a
-- rule about private correspondence that lives in a component is not a rule.
--
-- It is a deliberate choice with a cost: there is no in-app way to investigate
-- harassment reported through another channel. The alternative costs more. A
-- workforce that knows management can read its messages does not use the tool,
-- or uses it carefully, and a messaging feature nobody trusts is worse than
-- none — it collects personal data and delivers nothing. Under the Nigeria
-- Data Protection Act the same point has legal weight: staff must be told what
-- is collected and who can see it, and "your employer reads this" is a
-- disclosure most employers would rather not have to make.
--
-- A lawful order is answered by the database owner in the Supabase dashboard:
-- deliberate, logged by the platform, and outside the application entirely.
-- That is the correct shape for something that should be rare and difficult.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- No edit and no delete. A conversation someone acted on is not something to
-- rewrite afterwards, which is the same rule as task comments and the audit
-- log. Sending is the decision.
-- ===========================================================================

create type conversation_kind as enum ('channel', 'direct');

create table conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            conversation_kind not null,

  -- Channels have a name; a direct message is named by who is in it.
  name            text check (
                    (kind = 'channel' and length(trim(name)) between 1 and 80)
                    or (kind = 'direct' and name is null)
                  ),
  topic           text check (topic is null or length(topic) <= 300),

  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  -- Moves on every message, so the conversation list can order by activity
  -- without an aggregate over every message in the workspace.
  last_message_at timestamptz not null default now()
);

create index conversations_org_idx
  on conversations (organization_id, last_message_at desc);

-- One channel of a given name per workspace. Case-insensitive, because
-- #sales and #Sales being different channels is a mistake nobody enjoys.
create unique index conversations_channel_name_idx
  on conversations (organization_id, lower(name)) where kind = 'channel';

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  -- What they have read, for the unread count. Theirs to move, nobody else's.
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx
  on conversation_members (user_id, organization_id);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  author_id       uuid not null references auth.users(id),
  body            text not null check (length(trim(body)) between 1 and 4000),
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at desc);

comment on table messages is
  'Readable only by the members of the conversation. No update and no delete '
  'policy exists for anyone, including Management.';


-- ---------------------------------------------------------------------------
-- Membership, as a function.
--
-- A policy on `messages` that joined `conversation_members` directly, while a
-- policy on `conversation_members` referred to `messages`, would recurse.
-- `security definer` steps outside RLS for this one question — "is this person
-- in this conversation" — which is the standard way out and the only place the
-- answer is computed.
-- ---------------------------------------------------------------------------
create or replace function is_conversation_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from conversation_members m
    where m.conversation_id = p_conversation
      and m.user_id = auth.uid()
  );
$$;

revoke all on function is_conversation_member(uuid) from public;
grant execute on function is_conversation_member(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Row level security.
--
-- Read this as the privacy policy, because it is the privacy policy. Nothing
-- below grants Management anything, and that absence is the feature.
-- ---------------------------------------------------------------------------
alter table conversations        enable row level security;
alter table conversation_members enable row level security;
alter table messages             enable row level security;

alter table conversations        force row level security;
alter table conversation_members force row level security;
alter table messages             force row level security;

-- A channel is discoverable by anyone in the workspace — that is what makes it
-- a channel rather than a private group. A direct message is visible only to
-- the two people in it, and is not listed, hinted at or counted for anyone
-- else.
create policy conversations_read on conversations
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (kind = 'channel' or is_conversation_member(id))
  );

create policy conversations_insert on conversations
  for insert to authenticated
  with check (organization_id = current_org_id() and created_by = auth.uid());

-- A channel's name and topic are editable by its members. A direct message has
-- neither, so there is nothing to edit.
create policy conversations_update on conversations
  for update to authenticated
  using (
    organization_id = current_org_id()
    and kind = 'channel'
    and is_conversation_member(id)
  )
  with check (organization_id = current_org_id() and kind = 'channel');

-- No delete policy. A conversation with history is not something one member
-- gets to erase for everyone.

-- Who is in a conversation is visible to the people in it. For a channel that
-- is the member list; for a direct message it is the two of you.
create policy conversation_members_read on conversation_members
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (user_id = auth.uid() or is_conversation_member(conversation_id))
  );

-- Joining is something you do to yourself, and only to a channel. Being added
-- to a direct message is done by the function that creates it, which puts both
-- people in at once — there is no way to add a third.
create policy conversation_members_join on conversation_members
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and user_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id
        and c.organization_id = current_org_id()
        and c.kind = 'channel'
    )
  );

-- You may move your own read marker and nothing else about yourself.
create policy conversation_members_update_self on conversation_members
  for update to authenticated
  using (organization_id = current_org_id() and user_id = auth.uid())
  with check (organization_id = current_org_id() and user_id = auth.uid());

-- Leaving a channel. Not a direct message: the other person's conversation
-- would lose half its participants and the history would become unreadable
-- to them.
create policy conversation_members_leave on conversation_members
  for delete to authenticated
  using (
    organization_id = current_org_id()
    and user_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id and c.kind = 'channel'
    )
  );

-- The one that matters. Membership, and nothing else, decides.
create policy messages_read on messages
  for select to authenticated
  using (
    organization_id = current_org_id()
    and is_conversation_member(conversation_id)
  );

create policy messages_insert on messages
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and author_id = auth.uid()
    and is_conversation_member(conversation_id)
  );

-- Deliberately no update and no delete policy, for anyone. A message someone
-- read and acted on is not something to revise or remove afterwards.

grant select on conversations, conversation_members, messages to authenticated;
grant insert on conversations, conversation_members, messages to authenticated;
grant update on conversations, conversation_members to authenticated;
grant delete on conversation_members to authenticated;


-- ---------------------------------------------------------------------------
-- Starting a conversation.
--
-- Both of these are functions rather than inserts because each has to write
-- two tables in one breath: a conversation with no members is invisible to
-- everyone including the person who just made it, and a direct message needs
-- both participants added at once — the insert policy above deliberately lets
-- a person add only themselves.
-- ---------------------------------------------------------------------------
create or replace function create_channel(
  p_name  text,
  p_topic text default null
)
returns conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := current_org_id();
  v_name   text := trim(coalesce(p_name, ''));
  v_result conversations;
begin
  if v_org is null or auth.uid() is null then
    raise exception 'Not signed in to a workspace' using errcode = 'insufficient_privilege';
  end if;

  -- Channel names are handles, not titles: lower case, no spaces, so that
  -- #sales-lagos is unambiguous when someone types it.
  v_name := lower(regexp_replace(v_name, '\s+', '-', 'g'));
  v_name := regexp_replace(v_name, '[^a-z0-9._-]', '', 'g');

  if length(v_name) < 2 then
    raise exception 'A channel name needs at least two letters or digits'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from conversations
    where organization_id = v_org and kind = 'channel' and lower(name) = v_name
  ) then
    raise exception 'There is already a channel called %', v_name
      using errcode = 'unique_violation';
  end if;

  insert into conversations (organization_id, kind, name, topic, created_by)
  values (v_org, 'channel', v_name,
          nullif(trim(coalesce(p_topic, '')), ''), auth.uid())
  returning * into v_result;

  insert into conversation_members (conversation_id, user_id, organization_id)
  values (v_result.id, auth.uid(), v_org);

  return v_result;
end;
$$;

grant execute on function create_channel(text, text) to authenticated;


/**
 * Open a direct conversation, or return the one that already exists.
 *
 * Idempotent on purpose. "Message Amaka" must land in the conversation you
 * already have with Amaka — a second one would split the history in half and
 * leave unread messages somewhere you never look.
 */
create or replace function open_direct_message(p_other_user uuid)
returns conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := current_org_id();
  v_me     uuid := auth.uid();
  v_result conversations;
begin
  if v_org is null or v_me is null then
    raise exception 'Not signed in to a workspace' using errcode = 'insufficient_privilege';
  end if;

  if p_other_user = v_me then
    raise exception 'You cannot open a conversation with yourself'
      using errcode = 'check_violation';
  end if;

  -- Both must be members of this workspace. Without this check the id of
  -- someone in another company would open a conversation with them.
  if not exists (
    select 1 from organization_members
    where organization_id = v_org and user_id = p_other_user and status = 'active'
  ) then
    raise exception 'That person is not in this workspace'
      using errcode = 'no_data_found';
  end if;

  select c.* into v_result
  from conversations c
  where c.organization_id = v_org
    and c.kind = 'direct'
    and exists (select 1 from conversation_members m
                 where m.conversation_id = c.id and m.user_id = v_me)
    and exists (select 1 from conversation_members m
                 where m.conversation_id = c.id and m.user_id = p_other_user)
  limit 1;

  if found then
    return v_result;
  end if;

  insert into conversations (organization_id, kind, created_by)
  values (v_org, 'direct', v_me)
  returning * into v_result;

  insert into conversation_members (conversation_id, user_id, organization_id)
  values (v_result.id, v_me, v_org), (v_result.id, p_other_user, v_org);

  return v_result;
end;
$$;

grant execute on function open_direct_message(uuid) to authenticated;


/**
 * Send a message.
 *
 * The insert policy already requires membership and an honest author. This
 * exists to move `last_message_at` in the same statement — a conversation list
 * ordered by an aggregate over every message in the workspace is the query
 * that gets slow first, and a trigger would fire on a table whose policies
 * already say everything worth saying.
 */
create or replace function send_message(
  p_conversation uuid,
  p_body         text
)
returns messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := current_org_id();
  v_result messages;
begin
  if v_org is null or auth.uid() is null then
    raise exception 'Not signed in to a workspace' using errcode = 'insufficient_privilege';
  end if;

  if not is_conversation_member(p_conversation) then
    raise exception 'You are not in that conversation'
      using errcode = 'insufficient_privilege';
  end if;

  insert into messages (organization_id, conversation_id, author_id, body)
  values (v_org, p_conversation, auth.uid(), p_body)
  returning * into v_result;

  update conversations
     set last_message_at = v_result.created_at
   where id = p_conversation;

  -- Sending is reading: otherwise your own message arrives as unread.
  update conversation_members
     set last_read_at = v_result.created_at
   where conversation_id = p_conversation and user_id = auth.uid();

  return v_result;
end;
$$;

grant execute on function send_message(uuid, text) to authenticated;


/** Mark a conversation read up to now. Yours only — the policy says so. */
create or replace function mark_conversation_read(p_conversation uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update conversation_members
     set last_read_at = now()
   where conversation_id = p_conversation
     and user_id = auth.uid();
$$;

grant execute on function mark_conversation_read(uuid) to authenticated;
