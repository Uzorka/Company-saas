-- 0007_access_token_hook
--
-- The custom access token hook. This is what makes the whole RLS scheme
-- affordable: it stamps organization_id, roles and permissions into the JWT at
-- sign-in, so has_permission() reads a claim instead of joining user_roles on
-- every row of every query.
--
-- Register it in Supabase under Authentication > Hooks > Customize Access
-- Token, pointing at public.custom_access_token_hook.
--
-- Security note: the claims are computed here, server-side, from the database.
-- The client never supplies them, and the token is signed — so a browser
-- cannot grant itself a permission by editing anything it holds.

create or replace function custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  claims       jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  -- Prefixed to keep it distinct from organization_members.user_id and
  -- user_roles.user_id in the queries below. A bare `user_id` here silently
  -- resolves to the column, not the variable.
  v_user_id    uuid  := (event ->> 'user_id')::uuid;
  active_org   uuid;
  role_slugs   jsonb;
  perm_slugs   jsonb;
begin
  -- Which organization is this session acting in?
  --
  -- The app sets `active_organization_id` in user metadata when the user picks
  -- a workspace. We re-verify membership here rather than trusting it: user
  -- metadata is writable by the user in Supabase, so believing it unchecked
  -- would be a tenant-crossing hole.
  select m.organization_id into active_org
  from organization_members m
  where m.user_id = v_user_id
    and m.status = 'active'
    and m.organization_id = nullif(
      coalesce(event -> 'user_metadata' ->> 'active_organization_id', ''), ''
    )::uuid
  limit 1;

  -- No valid choice yet: fall back to their most recent active membership.
  -- A user with several lands on the workspace picker regardless.
  if active_org is null then
    select m.organization_id into active_org
    from organization_members m
    where m.user_id = v_user_id
      and m.status = 'active'
    order by m.last_active_at desc nulls last, m.created_at asc
    limit 1;
  end if;

  if active_org is null then
    -- Signed in but belonging to nothing. Deliberately no org claim, so every
    -- policy denies: current_org_id() returns null and no row matches.
    claims := claims
      || jsonb_build_object('organization_id', null, 'roles', '[]'::jsonb, 'permissions', '[]'::jsonb);
    return jsonb_set(event, '{claims}', claims);
  end if;

  select coalesce(jsonb_agg(distinct r.slug), '[]'::jsonb) into role_slugs
  from user_roles ur
  join roles r on r.id = ur.role_id
  where ur.user_id = v_user_id
    and ur.organization_id = active_org;

  -- Effective permissions are the UNION across every role the user holds.
  -- Scopes add; they never cancel.
  select coalesce(jsonb_agg(distinct rp.permission_slug), '[]'::jsonb) into perm_slugs
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = v_user_id
    and ur.organization_id = active_org;

  claims := claims || jsonb_build_object(
    'organization_id', active_org,
    'roles',           role_slugs,
    'permissions',     perm_slugs
  );

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook runs as supabase_auth_admin, which needs to read the tables it
-- queries. These grants are scoped to exactly those tables.
grant usage on schema public to supabase_auth_admin;
grant select on organization_members, user_roles, roles, role_permissions
  to supabase_auth_admin;

create policy auth_admin_read_members on organization_members
  for select to supabase_auth_admin using (true);
create policy auth_admin_read_user_roles on user_roles
  for select to supabase_auth_admin using (true);
create policy auth_admin_read_roles on roles
  for select to supabase_auth_admin using (true);
create policy auth_admin_read_role_permissions on role_permissions
  for select to supabase_auth_admin using (true);
