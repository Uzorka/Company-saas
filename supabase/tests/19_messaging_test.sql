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
