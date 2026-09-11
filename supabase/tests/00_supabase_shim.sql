-- Test-only shim reproducing the parts of a Supabase project that migrations
-- depend on: the auth schema, auth.users, auth.uid(), and the anon /
-- authenticated / service_role database roles.
--
-- This file is NEVER applied to a real Supabase project — Supabase provides
-- all of it. It exists so the migrations and, more importantly, the RLS
-- policies can be executed and tested locally against real PostgreSQL.

create schema if not exists auth;

create table if not exists auth.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text unique,
  raw_user_meta_data   jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

-- Supabase reads the current user from the request.jwt.claims GUC. Tests set
-- that GUC directly, which is exactly what PostgREST does per request.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''),
    ''
  )::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', 'anon');
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- Supabase's auth service role. The access token hook runs as this role.
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
