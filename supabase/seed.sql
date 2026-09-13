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

-- ---------------------------------------------------------------------------
-- Phase 3: department structure, positions and shift patterns.
--
-- Names, codes and headcounts follow the design's Phase 4 and Phase 7 data.
-- Employee records are NOT seeded here — the demo population (25-35 people
-- with attendance, tasks and leave) belongs to Phase 10, once the modules that
-- give those records meaning exist. Inventing people now would mean inventing
-- their attendance too.
-- ---------------------------------------------------------------------------

insert into departments (organization_id, code, name, description)
values
  ('00000000-0000-4000-8000-000000000001', 'DPT-SLS', 'Sales',       'Modern trade, open market and the national field organisation.'),
  ('00000000-0000-4000-8000-000000000001', 'DPT-LOG', 'Logistics',   'Fleet, dispatch and the depot network across three cities.'),
  ('00000000-0000-4000-8000-000000000001', 'DPT-WHS', 'Warehouse',   'Receiving, FEFO picking and dispatch at Ikeja and Apapa.'),
  ('00000000-0000-4000-8000-000000000001', 'DPT-FIN', 'Finance',     'Treasury, payroll, receivables and brand-owner settlement.'),
  ('00000000-0000-4000-8000-000000000001', 'DPT-HR',  'People',      'Hiring, HR operations and depot training.'),
  ('00000000-0000-4000-8000-000000000001', 'DPT-CMP', 'Compliance',  'NAFDAC, customs documentation and quality assurance.'),
  ('00000000-0000-4000-8000-000000000001', 'DPT-MGT', 'Management',  'Executive and functional leadership.')
on conflict (organization_id, code) do nothing;

insert into positions (organization_id, department_id, title)
select '00000000-0000-4000-8000-000000000001', d.id, t.title
from departments d
join (values
  ('DPT-SLS', 'Head of Sales'),
  ('DPT-SLS', 'Sales Representative'),
  ('DPT-SLS', 'Field Sales Representative'),
  ('DPT-SLS', 'Merchandiser'),
  ('DPT-SLS', 'Sales Analyst'),
  ('DPT-LOG', 'Director, Operations'),
  ('DPT-LOG', 'Dispatch Supervisor'),
  ('DPT-LOG', 'Delivery Driver'),
  ('DPT-LOG', 'Fleet Officer'),
  ('DPT-WHS', 'Warehouse Supervisor'),
  ('DPT-WHS', 'Warehouse Assistant'),
  ('DPT-WHS', 'Stock Controller'),
  ('DPT-FIN', 'Head of Finance'),
  ('DPT-FIN', 'Accounts Officer'),
  ('DPT-FIN', 'Payroll Officer'),
  ('DPT-FIN', 'Credit Controller'),
  ('DPT-HR',  'Head of People'),
  ('DPT-HR',  'HR Officer'),
  ('DPT-HR',  'Recruiter'),
  ('DPT-CMP', 'Compliance Officer'),
  ('DPT-MGT', 'Managing Director')
) as t(dept_code, title) on t.dept_code = d.code
where d.organization_id = '00000000-0000-4000-8000-000000000001'
on conflict (organization_id, department_id, title) do nothing;

-- Shift patterns. The design computes "Late" against an expected start and
-- shows a 09:00 sales shift alongside an 08:00 warehouse shift, so these are
-- the two it implies plus a field pattern for reps who start on the road.
-- No screen was designed for managing them — flagged in docs/BACKLOG.md.
insert into shift_patterns (organization_id, name, starts_at, ends_at, workdays, grace_minutes)
values
  ('00000000-0000-4000-8000-000000000001', 'Office · 09:00-17:00',    time '09:00', time '17:00', '{1,2,3,4,5}',   15),
  ('00000000-0000-4000-8000-000000000001', 'Warehouse · 08:00-16:00', time '08:00', time '16:00', '{1,2,3,4,5,6}', 10),
  ('00000000-0000-4000-8000-000000000001', 'Field · 08:30-17:30',     time '08:30', time '17:30', '{1,2,3,4,5,6}', 30)
on conflict (organization_id, name) do nothing;


-- ---------------------------------------------------------------------------
-- Phase 6: leave types. Source: Phase 7 settings, const LEAVE_TYPES.
--
-- Confirm these against the client's actual policy before anyone relies on
-- them — they are the design's values, not a legal position (docs/BACKLOG.md).
-- ---------------------------------------------------------------------------
insert into leave_types (organization_id, name, description, annual_entitlement_days,
                         accrual_days_per_month, document_required_after_days, paid)
values
  ('00000000-0000-4000-8000-000000000001', 'Annual leave',
   'Accrues 1.67 days a month', 20, 1.67, null, true),
  ('00000000-0000-4000-8000-000000000001', 'Sick leave',
   '3+ consecutive days needs a certificate', 10, null, 3, true),
  ('00000000-0000-4000-8000-000000000001', 'Compassionate',
   'At HR discretion', 5, null, null, true),
  ('00000000-0000-4000-8000-000000000001', 'Maternity',
   'Statutory, full pay', 80, null, null, true),
  ('00000000-0000-4000-8000-000000000001', 'Unpaid leave',
   'Needs HOD and HR approval', null, null, null, false)
on conflict (organization_id, name) do nothing;


-- ---------------------------------------------------------------------------
-- Phase 7: statutory rates and tax bands.
--
-- ⚠ THESE ARE THE DESIGN'S SAMPLE VALUES, NOT TAX ADVICE.
--
-- The percentages come from the design's settings screen and the bands are
-- illustrative. Confirm every figure against current FIRS, PenCom and NHF
-- guidance — and against the client's own payroll practice — before anyone is
-- paid from them. The brief excludes filing, remittance and pension APIs from
-- the MVP, and nothing here should be presented as compliance.
--
-- They are data, effective-dated, so correcting them is an insert, not a
-- code change. Published payslips keep the figures they were calculated with.
-- ---------------------------------------------------------------------------
insert into statutory_rates (organization_id, code, rate_percent, effective_from)
values
  ('00000000-0000-4000-8000-000000000001', 'pension_employee', 8.0,  date '2020-01-01'),
  ('00000000-0000-4000-8000-000000000001', 'pension_employer', 10.0, date '2020-01-01'),
  ('00000000-0000-4000-8000-000000000001', 'nhf',              2.5,  date '2020-01-01')
on conflict do nothing;

-- Six illustrative progressive bands, annual thresholds.
insert into paye_bands (organization_id, band_order, lower_bound, upper_bound, rate_percent, effective_from)
values
  ('00000000-0000-4000-8000-000000000001', 1,       0,   300000,  7.0, date '2020-01-01'),
  ('00000000-0000-4000-8000-000000000001', 2,  300000,   600000, 11.0, date '2020-01-01'),
  ('00000000-0000-4000-8000-000000000001', 3,  600000,  1100000, 15.0, date '2020-01-01'),
  ('00000000-0000-4000-8000-000000000001', 4, 1100000,  1600000, 19.0, date '2020-01-01'),
  ('00000000-0000-4000-8000-000000000001', 5, 1600000,  3200000, 21.0, date '2020-01-01'),
  ('00000000-0000-4000-8000-000000000001', 6, 3200000,     null, 24.0, date '2020-01-01')
on conflict do nothing;
