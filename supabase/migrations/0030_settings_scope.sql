-- Only settings.manage may write organization_settings.
--
-- The previous policy admitted all three settings scopes and left the choice
-- of *columns* to the server action, on the reasoning that column-level
-- policies would duplicate the permission vocabulary in SQL.
--
-- That reasoning was wrong in one specific way: a server action is not a
-- boundary. The anon key is public and the user's JWT is in their cookies, so
-- anyone holding a session can call PostgREST directly and update whatever the
-- policy admits — no server action involved. Confirmed before changing it: HR
-- could set password_min_length to 8 and session_timeout_minutes to 999;
-- Accounts could cut audit_retention_years to 1.
--
-- Nothing is lost by tightening it. HR's actual area is leave_types, whose own
-- policy admits settings.manage_structure. Accounts' area is statutory_rates
-- and paye_bands, whose policies admit settings.manage_payroll. Neither role
-- has a legitimate column in this table; the split lives in the tables it
-- describes, which is where a reader would look for it.

drop policy if exists org_settings_update on organization_settings;

create policy org_settings_update on organization_settings
  for update to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('settings.manage')
  )
  with check (
    organization_id = current_org_id()
    and has_permission('settings.manage')
  );

-- Settings changes are worth a trace. This table has one row per tenant and is
-- edited rarely, so the metadata records which columns actually changed rather
-- than the values — retention periods and lockout thresholds are the sort of
-- thing that gets quietly relaxed.
create or replace function audit_settings_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old    jsonb := to_jsonb(old);
  v_new    jsonb := to_jsonb(new);
  v_changed text[];
begin
  if current_org_id() is null then
    return new;
  end if;

  select array_agg(key order by key) into v_changed
  from jsonb_each(v_new) e(key, value)
  where v_old -> e.key is distinct from e.value
    and e.key <> 'updated_at';

  if v_changed is null then
    return new;
  end if;

  perform write_audit(
    'settings.update',
    'organization_settings',
    new.organization_id::text,
    jsonb_build_object('fields', to_jsonb(v_changed))
  );

  return new;
end;
$$;

create trigger organization_settings_audit_update
  after update on organization_settings
  for each row execute function audit_settings_update();
