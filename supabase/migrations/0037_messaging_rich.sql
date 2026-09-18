-- ===========================================================================
-- Attachments, typing, appearance, and channels you are invited to.
--
-- Everything here sits under the rule migration 0036 established and does not
-- weaken it: membership decides who reads a conversation, and nobody outside
-- it can read anything — a file, a typing flicker, or a message.
--
-- ONE THING DOES CHANGE, AND IT IS WORTH NAMING
--
-- A channel's creator can now add other people to it. Until now you could only
-- add yourself. That is how every group chat works and it is what was asked
-- for, but it means someone can put you in a room without asking. So: it
-- applies to channels only, never to a direct message, and you can leave.
-- A direct message still cannot gain a third person by any route.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Attachments.
--
-- The file lives in storage; the row records what it is. Kept on `messages`
-- rather than in a side table because a message carries at most one
-- attachment here, and a join to answer "is there a picture" on every message
-- in a conversation is a cost paid on every render.
-- ---------------------------------------------------------------------------
alter table messages
  add column if not exists attachment_path  text,
  add column if not exists attachment_name  text,
  add column if not exists attachment_type  text,
  add column if not exists attachment_size  bigint
    check (attachment_size is null or attachment_size between 0 and 26214400);

-- A message is either words, a file, or both — never neither.
--
-- 0036 made `body` NOT NULL with a length check, which was right when a
-- message could only be words and is wrong now: a photo sent with no caption
-- has nothing to put there. The column becomes nullable and the pair is
-- checked together instead, so "neither" is still refused.
alter table messages alter column body drop not null;
alter table messages drop constraint if exists messages_body_check;
alter table messages
  drop constraint if exists messages_says_something;
alter table messages
  add constraint messages_says_something
  check (
    length(trim(coalesce(body, ''))) between 1 and 4000
    or attachment_path is not null
  );

-- An attachment needs all of its parts or none of them. Half a record is a
-- broken image in the conversation with no way to tell what it was.
alter table messages
  drop constraint if exists messages_attachment_complete;
alter table messages
  add constraint messages_attachment_complete
  check (
    attachment_path is null
    or (attachment_name is not null and attachment_type is not null)
  );

comment on column messages.attachment_path is
  'Object path in the message-attachments bucket, always <org>/<conversation>/'
  '<uuid>-<name>. Read through a short-lived signed URL; the bucket is private '
  'and the first path segment is checked against the caller''s organization.';


-- ---------------------------------------------------------------------------
-- Appearance, per person per conversation.
--
-- Stored on the membership rather than on the conversation, deliberately:
-- WhatsApp works this way and it is the right model. Two people in a room
-- should not be arguing over its colour, and someone who needs a denser
-- layout to read comfortably should not need anyone's agreement to have one.
-- ---------------------------------------------------------------------------
alter table conversation_members
  add column if not exists theme  text not null default 'default',
  add column if not exists layout text not null default 'comfortable';

alter table conversation_members
  drop constraint if exists conversation_members_theme_known;
alter table conversation_members
  add constraint conversation_members_theme_known
  check (theme in ('default', 'heron', 'slate', 'forest', 'plum', 'sand'));

alter table conversation_members
  drop constraint if exists conversation_members_layout_known;
alter table conversation_members
  add constraint conversation_members_layout_known
  check (layout in ('comfortable', 'compact'));


-- ---------------------------------------------------------------------------
-- Typing.
--
-- One row per person per conversation, overwritten rather than appended: this
-- is a state, not a history, and nobody wants a permanent record of when
-- somebody started and stopped typing.
--
-- Readable only by the other members, on the same terms as the messages
-- themselves. A typing indicator visible to someone who cannot read the
-- conversation would leak that it is happening.
-- ---------------------------------------------------------------------------
create table if not exists typing_indicators (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  started_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table typing_indicators enable row level security;
alter table typing_indicators force row level security;

create policy typing_read on typing_indicators
  for select to authenticated
  using (
    organization_id = current_org_id()
    and is_conversation_member(conversation_id)
  );

create policy typing_write_self on typing_indicators
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and user_id = auth.uid()
    and is_conversation_member(conversation_id)
  );

create policy typing_update_self on typing_indicators
  for update to authenticated
  using (organization_id = current_org_id() and user_id = auth.uid())
  with check (organization_id = current_org_id() and user_id = auth.uid());

create policy typing_clear_self on typing_indicators
  for delete to authenticated
  using (organization_id = current_org_id() and user_id = auth.uid());

grant select, insert, update, delete on typing_indicators to authenticated;


-- ---------------------------------------------------------------------------
-- Creating a channel with the people in it.
--
-- Replaces the 0036 version. Everyone named is added at once, because a group
-- chat where the creator has to tell six people to go and find a room is not
-- a group chat.
--
-- Only people who are active members of this workspace can be added. Without
-- that check, a user id from another company would be put into the room and
-- would then be able to read it — the membership table is what the message
-- policy trusts, so this is the place that has to be careful.
-- ---------------------------------------------------------------------------
drop function if exists create_channel(text, text);

create or replace function create_channel(
  p_name         text,
  p_topic        text default null,
  p_participants uuid[] default '{}'
)
returns conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := current_org_id();
  v_me     uuid := auth.uid();
  v_name   text := trim(coalesce(p_name, ''));
  v_result conversations;
  v_added  integer := 0;
begin
  if v_org is null or v_me is null then
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
          nullif(trim(coalesce(p_topic, '')), ''), v_me)
  returning * into v_result;

  insert into conversation_members (conversation_id, user_id, organization_id)
  values (v_result.id, v_me, v_org);

  -- Everyone else named, provided they are really in this workspace.
  insert into conversation_members (conversation_id, user_id, organization_id)
  select v_result.id, m.user_id, v_org
  from organization_members m
  where m.organization_id = v_org
    and m.status = 'active'
    and m.user_id = any(coalesce(p_participants, '{}'))
    and m.user_id <> v_me
  on conflict do nothing;

  get diagnostics v_added = row_count;

  perform write_audit('messages.channel_created', 'conversation', v_result.id::text,
    jsonb_build_object('name', v_name, 'participants', v_added + 1));

  return v_result;
end;
$$;

grant execute on function create_channel(text, text, uuid[]) to authenticated;


/**
 * Add someone to a channel after the fact.
 *
 * Any member can add another — the same latitude Slack gives, and a channel is
 * discoverable by everyone in the workspace anyway, so this saves a step
 * rather than granting access that was otherwise unreachable.
 *
 * Never a direct message. That refusal is the one thing in this function worth
 * being certain of: the whole promise made to staff is that a private
 * conversation stays between the two of them.
 */
create or replace function add_to_channel(
  p_conversation uuid,
  p_user         uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org  uuid := current_org_id();
  v_kind conversation_kind;
begin
  if v_org is null or auth.uid() is null then
    raise exception 'Not signed in to a workspace' using errcode = 'insufficient_privilege';
  end if;

  if not is_conversation_member(p_conversation) then
    raise exception 'You are not in that conversation'
      using errcode = 'insufficient_privilege';
  end if;

  select kind into v_kind from conversations
   where id = p_conversation and organization_id = v_org;

  if v_kind is null then
    raise exception 'That conversation does not exist' using errcode = 'no_data_found';
  end if;

  if v_kind <> 'channel' then
    raise exception 'A direct message stays between the two people in it'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from organization_members
    where organization_id = v_org and user_id = p_user and status = 'active'
  ) then
    raise exception 'That person is not in this workspace'
      using errcode = 'no_data_found';
  end if;

  insert into conversation_members (conversation_id, user_id, organization_id)
  values (p_conversation, p_user, v_org)
  on conflict do nothing;
end;
$$;

grant execute on function add_to_channel(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Sending, with an attachment.
--
-- Replaces the 0036 version. The file is already in storage by the time this
-- runs — the upload happens from the browser to a path the server has checked
-- — and this records what was sent and clears the typing flag in the same
-- statement, so an indicator cannot be left hanging by a message that arrived.
-- ---------------------------------------------------------------------------
drop function if exists send_message(uuid, text);

create or replace function send_message(
  p_conversation    uuid,
  p_body            text default null,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_type text default null,
  p_attachment_size bigint default null
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

  -- The path is produced by the server and checked here too: the first two
  -- segments must be this organization and this conversation. A path naming
  -- somebody else's room would otherwise attach their file to this message.
  if p_attachment_path is not null then
    if split_part(p_attachment_path, '/', 1) <> v_org::text
       or split_part(p_attachment_path, '/', 2) <> p_conversation::text then
      raise exception 'That file does not belong to this conversation'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into messages (
    organization_id, conversation_id, author_id, body,
    attachment_path, attachment_name, attachment_type, attachment_size
  )
  values (
    v_org, p_conversation, auth.uid(), nullif(trim(coalesce(p_body, '')), ''),
    p_attachment_path, p_attachment_name, p_attachment_type, p_attachment_size
  )
  returning * into v_result;

  update conversations
     set last_message_at = v_result.created_at
   where id = p_conversation;

  -- Sending is reading: otherwise your own message arrives as unread.
  update conversation_members
     set last_read_at = v_result.created_at
   where conversation_id = p_conversation and user_id = auth.uid();

  -- And you have plainly stopped typing.
  delete from typing_indicators
   where conversation_id = p_conversation and user_id = auth.uid();

  return v_result;
end;
$$;

grant execute on function send_message(uuid, text, text, text, text, bigint)
  to authenticated;


/** Say you are typing. Overwrites rather than appends — it is a state. */
create or replace function set_typing(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid := current_org_id();
begin
  if v_org is null or auth.uid() is null then return; end if;
  if not is_conversation_member(p_conversation) then return; end if;

  insert into typing_indicators (conversation_id, user_id, organization_id)
  values (p_conversation, auth.uid(), v_org)
  on conflict (conversation_id, user_id)
  do update set started_at = now();
end;
$$;

grant execute on function set_typing(uuid) to authenticated;


/**
 * Who is typing in this conversation, other than you.
 *
 * Six seconds. Long enough to survive the gap between keystrokes and the poll
 * interval, short enough that a closed tab stops claiming to be typing almost
 * immediately. Stale rows are cleaned up here rather than by a scheduled job:
 * this is the only thing that reads them, so it is the only thing that needs
 * to care, and the table stays at roughly one row per person actually typing.
 */
create or replace function typing_in_conversation(p_conversation uuid)
returns setof uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_conversation_member(p_conversation) then
    return;
  end if;

  delete from typing_indicators
   where conversation_id = p_conversation
     and started_at < now() - interval '6 seconds';

  return query
    select user_id from typing_indicators
     where conversation_id = p_conversation
       and user_id <> auth.uid();
end;
$$;

grant execute on function typing_in_conversation(uuid) to authenticated;


/** Your own appearance for one conversation. Nobody else's view changes. */
create or replace function set_conversation_appearance(
  p_conversation uuid,
  p_theme        text,
  p_layout       text
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update conversation_members
     set theme = p_theme, layout = p_layout
   where conversation_id = p_conversation
     and user_id = auth.uid();
$$;

grant execute on function set_conversation_appearance(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- The bucket.
--
-- Private, like every bucket here but `public-assets`. Files are served
-- through short-lived signed URLs issued by the server only after it has
-- confirmed the caller is in the conversation.
--
-- The policy below is the outer boundary — the caller's own organization — and
-- not the whole rule. Path segment two is the conversation id, and whether a
-- particular person may see a particular conversation is decided by
-- `is_conversation_member`, which is checked when the signed URL is issued.
-- Both together are what keeps one company's photograph out of another
-- company's chat, and one team's file out of a room they are not in.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (local test cluster) — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('message-attachments', 'message-attachments', false, 26214400)
  on conflict (id) do nothing;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'member reads conversation attachments'
  ) then
    execute $p$
      create policy "member reads conversation attachments"
        on storage.objects for select to authenticated
        using (
          bucket_id = 'message-attachments'
          and (storage.foldername(name))[1] = current_org_id()::text
          and is_conversation_member(((storage.foldername(name))[2])::uuid)
        )
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'member writes conversation attachments'
  ) then
    execute $p$
      create policy "member writes conversation attachments"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'message-attachments'
          and (storage.foldername(name))[1] = current_org_id()::text
          and is_conversation_member(((storage.foldername(name))[2])::uuid)
        )
    $p$;
  end if;

  -- No update and no delete. A file someone sent is part of the conversation,
  -- and messages cannot be edited or removed either.
end;
$$;
