-- A high-risk role grant needs a second approver, wherever it is written.
--
-- `enforce_second_approver()` has guarded `role_grant_requests` since 0003.
-- Nothing required anyone to go through that table. `user_roles_manage` lets
-- any holder of `roles.manage` insert straight into `user_roles`, so the
-- control was advisory: confirmed against the running database, Management
-- granted the Management role to another user directly, with no second
-- approver and no request row to show for it.
--
-- This is the third control in this codebase found sitting on a table that was
-- not on the path — after the settings policy (0030) and the public form's
-- rate limit (0032). The shape is always the same: the rule is real, the
-- enforcement point is optional.
--
-- So the rule now holds at `user_roles`, which is where a grant actually takes
-- effect. Management, HR and Accounts are flagged high_risk by
-- provision_default_roles; HOD and Employee are not and are unaffected.

create or replace function enforce_high_risk_user_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_high_risk boolean;
  v_role_name text;
begin
  -- No organization-scoped session means a seed, a migration, or the bootstrap
  -- of a brand-new tenant's first administrator. There is no second person to
  -- approve anything at that point, and refusing would make a tenant
  -- impossible to create. Every grant made through the application has a
  -- session by definition.
  if current_org_id() is null then
    return new;
  end if;

  select high_risk, name into v_high_risk, v_role_name
  from roles where id = new.role_id;

  if not coalesce(v_high_risk, false) then
    return new;
  end if;

  -- An approved request, for this user and this role, approved by someone who
  -- is not the requester. The table's own constraint already guarantees that
  -- last part; this only has to find the row.
  if not exists (
    select 1 from role_grant_requests r
    where r.organization_id = new.organization_id
      and r.target_user_id = new.user_id
      and r.role_id = new.role_id
      and r.status = 'active'
      and r.second_approver_id is not null
  ) then
    raise exception
      'Granting % needs an approved request with a second approver: it carries payroll, document, settings or audit access',
      coalesce(v_role_name, 'this role')
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger user_roles_high_risk_guard
  before insert or update on user_roles
  for each row execute function enforce_high_risk_user_role();

-- Revoking a grant is not a delete, and the audit log should show who did it.
create or replace function audit_role_grant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_org_id() is null then
    return coalesce(new, old);
  end if;

  perform write_audit(
    case tg_op when 'DELETE' then 'roles.revoke' else 'roles.grant' end,
    'user_roles',
    coalesce(new.user_id, old.user_id)::text,
    jsonb_build_object(
      'role',
      (select name from roles where id = coalesce(new.role_id, old.role_id))
    )
  );

  return coalesce(new, old);
end;
$$;

create trigger user_roles_audit
  after insert or delete on user_roles
  for each row execute function audit_role_grant();
