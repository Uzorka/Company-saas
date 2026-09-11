-- Development seed.
--
-- Creates one tenant with its settings, offices and the five default roles.
-- It deliberately creates NO user accounts and NO passwords: accounts are made
-- through Supabase Auth, and committing reusable credentials to a repository
-- is how test passwords end up in production.
--
-- To attach yourself after signing up, see the block at the foot of this file.
--
-- Office coordinates and geofence radii below are the design's sample values.
-- Real ones are pending from the client (docs/BACKLOG.md).

insert into organizations (id, name, slug, status, sector)
values (
  '00000000-0000-4000-8000-000000000001',
  'CHF Heron Nigeria',
  'chfheron',
  'active',
  'FMCG distribution'
)
on conflict (slug) do nothing;

insert into organization_settings (organization_id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (organization_id) do nothing;

insert into offices (organization_id, name, address, latitude, longitude, geofence_radius_m)
values
  ('00000000-0000-4000-8000-000000000001', 'Head Office, Victoria Island', 'Victoria Island, Lagos',  6.431200, 3.421900, 150),
  ('00000000-0000-4000-8000-000000000001', 'Ikeja depot',                  'Ikeja, Lagos',            6.601800, 3.351500, 200),
  ('00000000-0000-4000-8000-000000000001', 'Port Harcourt depot',          'Port Harcourt, Rivers',   4.815600, 7.049800, 180),
  ('00000000-0000-4000-8000-000000000001', 'Abuja office',                 'Abuja, FCT',              9.057900, 7.495100, 120)
on conflict do nothing;

select provision_default_roles('00000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Attaching a real account.
--
-- 1. Sign up through the app or the Supabase dashboard.
-- 2. Find your user id:      select id, email from auth.users;
-- 3. Run, with that id and the role slug you want:
--
--      insert into organization_members (organization_id, user_id, status)
--      values ('00000000-0000-4000-8000-000000000001', '<your-user-id>', 'active');
--
--      insert into user_roles (organization_id, user_id, role_id)
--      select '00000000-0000-4000-8000-000000000001', '<your-user-id>', id
--      from roles
--      where organization_id = '00000000-0000-4000-8000-000000000001'
--        and slug = 'management';
--
-- 4. Sign out and back in — the access token hook stamps the new claims into
--    a fresh token, so an existing session will not see the change.
-- ---------------------------------------------------------------------------
