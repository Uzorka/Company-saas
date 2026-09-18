-- ===========================================================================
-- Messaging. Depends on the fixtures from 10.
--
-- The rule under test is the one the product promises staff: only the people
-- in a conversation can read it. Most of these assertions exist to prove that
-- the promise is enforced by the database rather than by a hidden button, and
-- the most important one is that Management — who can read payroll, documents
-- and the audit log — cannot read a direct message.
-- ===========================================================================

do $$
declare
  f        record;
  v_dm     conversations;
  v_chan   conversations;
  v_msg    messages;
  n        integer;
  failed   boolean;
begin
  select * into f from fixture;

  -- === A direct message between two people ================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  v_dm := open_direct_message(f.u_hr);
  v_msg := send_message(v_dm.id, 'Can you check my leave balance before Friday?');
  reset role;

  perform assert(v_dm.kind = 'direct', 'A direct conversation is created');
  perform assert(
    (select count(*) from conversation_members where conversation_id = v_dm.id) = 2,
    'with exactly the two people in it'
  );

  -- Opening it again returns the same conversation, not a second one.
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  perform assert(
    (open_direct_message(f.u_hr)).id = v_dm.id,
    'Opening it again returns the same conversation, not a second history'
  );
  reset role;

  -- === Both participants can read it ======================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = v_dm.id;
  reset role;
  perform assert(n = 1, 'The sender can read their own message');

  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = v_dm.id;
  reset role;
  perform assert(n = 1, 'and so can the person it was sent to');

  -- === And nobody else. This is the whole point. ==========================
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = v_dm.id;
  reset role;
  perform assert(n = 0, 'Management cannot read a direct message');

  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from conversations where id = v_dm.id;
  reset role;
  perform assert(n = 0, 'and cannot see that the conversation exists at all');

  perform set_config('request.jwt.claims', claims_for(f.u_acct, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = v_dm.id;
  reset role;
  perform assert(n = 0, 'nor can Accounts, who can see everyone''s salary');

  -- === Nor can someone in another workspace ===============================
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_b)::text, true);
  set local role authenticated;
  select count(*) into n from messages;
  reset role;
  perform assert(n = 0, 'Another workspace sees none of this one''s messages');

  -- === Writing into a conversation you are not in =========================
  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, f.org_a),
      format($q$insert into messages (organization_id, conversation_id, author_id, body)
                values (%L, %L, %L, 'Adding myself to this conversation.')$q$,
             f.org_a, v_dm.id, f.u_mgmt)
    ) = 0,
    'Nobody can post into a conversation they are not part of'
  );

  -- === Adding yourself to someone else's direct message ===================
  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, f.org_a),
      format($q$insert into conversation_members (conversation_id, user_id, organization_id)
                values (%L, %L, %L)$q$, v_dm.id, f.u_mgmt, f.org_a)
    ) = 0,
    'and cannot join one — a direct message stays between two people'
  );

  -- === A message cannot be rewritten or removed, by anyone ================
  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, f.org_a),
      format('update messages set body = ''I never said that.'' where id = %L', v_msg.id)
    ) = 0,
    'The author cannot edit a message after sending it'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, f.org_a),
      format('delete from messages where id = %L', v_msg.id)
    ) = 0,
    'and cannot delete one'
  );

  perform assert(
    (select body from messages where id = v_msg.id)
      = 'Can you check my leave balance before Friday?',
    'so the message still says what it said'
  );

  -- === Channels are different on purpose ==================================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  v_chan := create_channel('Sales Lagos', 'Depot coordination');
  reset role;

  perform assert(v_chan.name = 'sales-lagos',
    'A channel name becomes a handle: lower case, spaces to dashes');

  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from conversations where id = v_chan.id;
  reset role;
  perform assert(n = 1, 'Anyone in the workspace can discover a channel');

  -- Discoverable is not the same as readable.
  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  perform send_message(v_chan.id, 'Two trucks are held at Apapa this morning.');
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = v_chan.id;
  reset role;
  perform assert(n = 0, 'but its messages are unreadable until you join it');

  -- Joining is something you do to yourself.
  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, f.org_a),
      format($q$insert into conversation_members (conversation_id, user_id, organization_id)
                values (%L, %L, %L)$q$, v_chan.id, f.u_emp, f.org_a)
    ) = 1,
    'Anyone can join a channel'
  );

  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from messages where conversation_id = v_chan.id;
  reset role;
  perform assert(n = 1, 'and then reads what was said before they arrived');

  -- But not on someone else's behalf.
  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, f.org_a),
      format($q$insert into conversation_members (conversation_id, user_id, organization_id)
                values (%L, %L, %L)$q$, v_chan.id, f.u_other, f.org_a)
    ) = 0,
    'Nobody is added to a channel by somebody else'
  );

  -- === Sending as someone else ============================================
  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, f.org_a),
      format($q$insert into messages (organization_id, conversation_id, author_id, body)
                values (%L, %L, %L, 'Signed, the head of HR.')$q$,
             f.org_a, v_chan.id, f.u_hr)
    ) = 0,
    'and no message can be posted under another person''s name'
  );

  -- === A direct message needs two real members of this workspace ==========
  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
    set local role authenticated;
    perform open_direct_message(f.u_emp);
    reset role;
  exception when others then failed := true; reset role;
  end;
  perform assert(failed, 'You cannot open a conversation with yourself');

  -- u_other is a real account at the rival company in org_b. Passing a valid
  -- user id from another tenant is exactly the shape this check exists for.
  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
    set local role authenticated;
    perform open_direct_message(f.u_other);
    reset role;
  exception when others then failed := true; reset role;
  end;
  perform assert(
    failed,
    'You cannot open a conversation with someone in another company'
  );

  -- And a colleague in the same workspace can be, which is what makes the
  -- check above a boundary rather than a blanket refusal.
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  perform assert(
    (open_direct_message(f.u_acct)).kind = 'direct',
    'A colleague in the same workspace can be messaged'
  );
  reset role;

  raise notice '--- messaging assertions passed ---';
end
$$;


-- ===========================================================================
-- Attachments, typing, appearance, and channels with participants.
--
-- Everything here was added on top of the privacy rule, so most of these check
-- that it still holds: a file, a typing flicker and a room's colour are all
-- things that could leak who is talking to whom.
-- ===========================================================================
do $$
declare
  f      record;
  v_chan conversations;
  v_dm   conversations;
  v_msg  messages;
  n      integer;
  failed boolean;
begin
  select * into f from fixture;

  -- === A channel created with people already in it ========================
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;
  v_chan := create_channel('Ops Standup', 'Daily at 08:15',
                           array[f.u_hr, f.u_acct]);
  reset role;

  perform assert(
    (select count(*) from conversation_members where conversation_id = v_chan.id) = 3,
    'A channel is created with the participants the author chose'
  );

  -- Someone from another company, named as a participant, is not added.
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;
  v_chan := create_channel('Rivals', null, array[f.u_other]);
  reset role;

  perform assert(
    (select count(*) from conversation_members where conversation_id = v_chan.id) = 1,
    'but naming someone from another company adds only yourself'
  );

  -- === A direct message never gains a third person ========================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  v_dm := open_direct_message(f.u_hr);
  reset role;

  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
    set local role authenticated;
    perform add_to_channel(v_dm.id, f.u_mgmt);
    reset role;
  exception when others then failed := true; reset role;
  end;
  perform assert(failed, 'A direct message cannot be turned into a group');

  perform assert(
    (select count(*) from conversation_members where conversation_id = v_dm.id) = 2,
    'and still has exactly two people in it'
  );

  -- Nor by someone outside it reaching in.
  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
    set local role authenticated;
    perform add_to_channel(v_dm.id, f.u_mgmt);
    reset role;
  exception when others then failed := true; reset role;
  end;
  perform assert(failed, 'and somebody outside it cannot add themselves');

  -- === An attachment belongs to the conversation it claims ================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  v_msg := send_message(
    v_dm.id, 'Here is the delivery note.',
    f.org_a::text || '/' || v_dm.id::text || '/note.pdf',
    'note.pdf', 'application/pdf', 12345);
  reset role;

  perform assert(v_msg.attachment_name = 'note.pdf', 'A file can be sent with a message');

  -- A path naming another conversation is refused: it would attach a file
  -- from a room the sender may not even be in.
  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
    set local role authenticated;
    perform send_message(v_dm.id, 'Borrowed.',
      f.org_a::text || '/' || v_chan.id::text || '/stolen.pdf',
      'stolen.pdf', 'application/pdf', 1);
    reset role;
  exception when others then failed := true; reset role;
  end;
  perform assert(failed, 'A file path naming another conversation is refused');

  -- A photo with no words is a message; nothing at all is not.
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  perform send_message(v_dm.id, null,
    f.org_a::text || '/' || v_dm.id::text || '/photo.jpg',
    'photo.jpg', 'image/jpeg', 2048);
  reset role;

  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
    set local role authenticated;
    perform send_message(v_dm.id, '   ', null, null, null, null);
    reset role;
  exception when others then failed := true; reset role;
  end;
  perform assert(failed, 'A message with neither words nor a file is refused');

  -- === Typing is as private as the conversation ===========================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  perform set_typing(v_dm.id);
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from typing_in_conversation(v_dm.id);
  reset role;
  perform assert(n = 1, 'The other person sees that you are typing');

  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from typing_in_conversation(v_dm.id);
  reset role;
  perform assert(n = 0, 'and nobody outside the conversation does');

  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;
  select count(*) into n from typing_indicators where conversation_id = v_dm.id;
  reset role;
  perform assert(n = 0, 'nor can they read the table directly');

  -- Nobody types on somebody else's behalf.
  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, f.org_a),
      format($q$insert into typing_indicators (conversation_id, user_id, organization_id)
                values (%L, %L, %L)$q$, v_dm.id, f.u_hr, f.org_a)
    ) = 0,
    'and no one can claim somebody else is typing'
  );

  -- === Appearance is yours alone ==========================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  perform set_conversation_appearance(v_dm.id, 'forest', 'compact');
  reset role;

  perform assert(
    (select theme from conversation_members
      where conversation_id = v_dm.id and user_id = f.u_emp) = 'forest',
    'Your own colour for a conversation is saved'
  );
  perform assert(
    (select theme from conversation_members
      where conversation_id = v_dm.id and user_id = f.u_hr) = 'default',
    'and the other person''s view is untouched'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, f.org_a),
      format('update conversation_members set theme = ''plum'' where conversation_id = %L and user_id = %L',
             v_dm.id, f.u_hr)
    ) = 0,
    'You cannot change how someone else sees a conversation'
  );

  -- An unknown theme is refused rather than stored and rendered as nothing.
  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
    set local role authenticated;
    perform set_conversation_appearance(v_dm.id, 'neon', 'compact');
    reset role;
  exception when others then failed := true; reset role;
  end;
  perform assert(failed, 'An unknown theme is refused');

  raise notice '--- rich messaging assertions passed ---';
end
$$;
