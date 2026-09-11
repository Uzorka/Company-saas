-- 0002_profiles
--
-- Identity, kept separate from employment.
--
--   auth.users  ->  profiles  ->  employees
--
-- An applicant needs no auth account, and an employee record can exist before
-- an account is invited. Collapsing these into one table would force an
-- account to exist for every person the company has ever recorded.

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null check (length(trim(full_name)) > 0),
  avatar_url text,
  phone      text,
  locale     text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Membership status. A suspended member keeps their record and their history;
-- nothing in this product is destroyed.
create type membership_status as enum ('active', 'invited', 'suspended');

-- A user may belong to several organizations — that is what the workspace
-- picker at /auth/workspace exists for.
create table organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  status          membership_status not null default 'invited',
  last_active_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx on organization_members (user_id);
create index organization_members_organization_id_idx on organization_members (organization_id);

create trigger organization_members_updated_at
  before update on organization_members
  for each row execute function set_updated_at();

-- Create the profile row alongside the auth user, so no signed-in user can
-- ever exist without one.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
