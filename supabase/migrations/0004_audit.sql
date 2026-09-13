-- 0004_audit
--
-- The immutable record. The one part of the system nobody can edit.
--
-- Built now rather than at the end: the design is explicit that audit writes
-- belong alongside each module rather than retrofitted, so the table has to
-- exist before the first module does. (This is why audit is migration 0004
-- and not 0013 as the brief's numbering suggested — noted in SCHEMA.md.)
--
-- Immutability is enforced by the database, not by application discipline:
-- UPDATE and DELETE are revoked from every role including Management, and a
-- trigger rejects them even if a grant is ever restored by mistake.

create table audit_logs (
  id              bigserial primary key,
  organization_id uuid not null references organizations(id) on delete restrict,
  actor_user_id   uuid references auth.users(id) on delete set null,
  action          text not null check (length(trim(action)) > 0),
  entity_type     text not null,
  entity_id       text,
  metadata        jsonb not null default '{}'::jsonb,
  -- Truncated deliberately: enough to spot an anomaly, not enough to track a
  -- person's movements.
  ip_truncated    text,
  device          text,
  created_at      timestamptz not null default now()
);

create index audit_logs_org_created_idx on audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (organization_id, entity_type, entity_id);
create index audit_logs_actor_idx on audit_logs (organization_id, actor_user_id);

comment on table audit_logs is
  'Append-only. No role may update or delete a row, including Management. '
  'A correction or revocation is a new entry, never an edit. Retained 7 years.';

-- Belt and braces: the grants below remove the privilege, this rejects the
-- statement even if a future migration hands it back by accident.
create or replace function reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_no_update
  before update on audit_logs
  for each row execute function reject_audit_mutation();

create trigger audit_logs_no_delete
  before delete on audit_logs
  for each row execute function reject_audit_mutation();

-- Supabase grants ALL on public tables to anon, authenticated and
-- service_role by default, so every one of them has to be named here.
-- service_role especially: it is the key server-side code uses, it bypasses
-- RLS, and there is no legitimate reason for it to rewrite history.
--
-- Platform roles (postgres, supabase_admin, dashboard_user) keep their
-- grants — revoking those would break the dashboard's own table tooling —
-- and the trigger above still refuses the statement whoever issues it.
revoke update, delete, truncate on audit_logs
  from public, anon, authenticated, service_role;

-- The one supported way to write an audit entry. `security definer` so the
-- caller needs no direct insert privilege, and the organization is taken from
-- the caller's own claim rather than from an argument — a caller cannot forge
-- an entry against another tenant.
create or replace function write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id bigint;
  org_id uuid := current_org_id();
begin
  if org_id is null then
    raise exception 'write_audit requires an organization-scoped session'
      using errcode = 'insufficient_privilege';
  end if;

  insert into audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (org_id, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function write_audit(text, text, text, jsonb) to authenticated, service_role;
