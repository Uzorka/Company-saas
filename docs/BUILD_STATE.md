# Build state

**Current phase:** Phase 3 — departments and employees. Complete and green.
**Next phase:** Phase 4 — attendance and check-in. **Awaiting approval, and
blocked on two decisions: the geofence default and the map provider.**

## Completed

### Phase 0 — Design inspection & technical plan
Read all 9 Claude Design files in full (`design/project/`), including the
imported `support.js` (prototype runtime; no product logic). Produced the
screen inventory (58), route map (34 paths across 4 surfaces), component
inventory (15), role-to-screen access matrix, database entity list (~55
tables), storage bucket plan (8 buckets), RLS strategy (10 rules), 10-phase
implementation plan, 16 technical conflicts and 14 missing inputs. See
`PHASE_0_PLAN.md`.

### Phase 1 — Foundation
- Next.js 16 App Router, TypeScript strict, Tailwind v4, ESLint, Vitest.
- **Design tokens** as Tailwind v4 `@theme` custom properties in
  `src/app/globals.css`: the full brand and neutral ramps, four semantic
  pairs, validation surfaces, the 8-step type scale, 5 radii, 4 elevations,
  5 motion durations, 3 easings, shell geometry. Light mode only; the dark
  ramp is declared but not applied.
- IBM Plex Sans and IBM Plex Mono wired through `next/font`.
- Reduced-motion and focus-visible handled globally; a skip-to-content
  utility as the first tab stop.
- **Components:** Button (4 variants x 3 sizes, loading, disabled),
  IconButton (label required), Field + Input + Textarea + Select, Card,
  Avatar, StatusPill, and all four universal states (empty, filtered-empty,
  error, permission).
- **App shell:** 186/58px animated sidebar with role-filtered navigation and
  the restricted-not-hidden lock, topbar with breadcrumb + org identity +
  notification count, mobile bottom nav capped at four items, More bottom
  sheet, and a working command palette on Cmd/Ctrl+K.
- **Supabase clients:** browser, request-scoped server, and a service-role
  client fenced behind `server-only`.
- `.env.example` committed; no real credentials anywhere.

### Phase 2 — Supabase and security foundation
- **Seven migrations**, all applied and exercised against real PostgreSQL 16:
  `0001_organizations` (tenants, settings, offices, platform admins),
  `0002_profiles` (identity split from employment), `0003_rbac` (roles,
  permissions, user_roles, the second-approver workflow, and the helper
  functions every policy is built on), `0004_audit` (append-only log),
  `0005_rls` (policies for every table so far), `0006_permission_catalogue`
  (61 permissions and default-role provisioning), `0007_access_token_hook`.
- **Row Level Security** on every table, forced for owners too. Policies test
  permissions, never role names, and read JWT claims rather than joining
  user_roles per row.
- **Audit immutability enforced by the database**: update and delete revoked
  from every role including Management, plus rejecting triggers. Entries are
  written only through `write_audit()`, which takes the organization from the
  caller's own claim so no client can forge one against another tenant.
- **Auth**: sign in (company code, email, password), forgot, reset with the
  org's password policy, workspace picker that skips itself for
  single-workspace users, sign out. Server actions validate with Zod.
- **Session layer**: `getSession`, `requireSession`, `requireOrg`, `can`,
  `canAny`, `assertPermission` — all reading verified JWT claims.
- **Middleware** refreshes the session cookie and keeps unauthenticated
  callers out of the workspace. Redirect targets are validated against open
  redirects.
- **Local database harness**: `scripts/db-start.sh`, `db-test.sh`,
  `db-rls-test.sh`, plus a Supabase shim so migrations and policies can be run
  and asserted locally. Wired into `npm run check`.
- **Setup-required screen** so a clone without `.env.local` explains itself
  instead of returning a 500.

### Phase 3 — departments and employees
- **Three migrations.** `0008_departments_positions` (departments, positions,
  headship as its own table since an HOD may head several), `0009_employees`
  (employees, emergency contacts, effective-dated compensation, documents,
  shift patterns), `0010_employees_rls`.
- **The three employee scopes as three separate policies.** Postgres ORs
  permissive policies, which is exactly the union semantics the matrix needs:
  someone who is both an HOD and an employee sees their department and
  themselves.
- **Compensation is a separate table**, so HR — who may edit everything else
  about a person — cannot read their salary. Enforced in the database, not by
  a UI check.
- **Emergency contacts are narrower than the directory**: an HOD can see who
  is in their department but not their next of kin.
- **Shift patterns** built as data. The design computes "Late" against an
  expected start and shows 09:00 and 08:00 shifts, but never designed a screen
  for managing them — flagged in BACKLOG.
- **DataTable** that becomes cards under 640px and drops non-essential columns
  at tablet width (removed, never squeezed), and **SlideOver** that returns
  focus to the row that opened it.
- **Directory** with URL-backed search and filters, filters as a bottom sheet
  on phones, and a profile slide-over that keeps the list behind it.
- **Departments** grid with live headcounts.

## Routes added
Phase 1: `/` and `/[org]/dashboard`.
Phase 2: `/auth/login`, `/auth/forgot`, `/auth/reset`, `/auth/workspace`.
Phase 3: `/[org]/employees`, `/[org]/departments`.

## Components added
`ui/button` `ui/field` `ui/card` `ui/avatar` `ui/status-pill` `states/index`
`shell/app-shell` `shell/sidebar` `shell/topbar` `shell/bottom-nav`
`shell/command-palette`

## Database migrations
`0001_organizations` `0002_profiles` `0003_rbac` `0004_audit` `0005_rls`
`0006_permission_catalogue` `0007_access_token_hook`
`0008_departments_positions` `0009_employees` `0010_employees_rls`

Audit was built as `0004` rather than the brief's `013` because the design
requires audit writes alongside each module rather than retrofitted at the
end — the table has to exist before the first module does.

## Environment variables required
`NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY`
`SUPABASE_SERVICE_ROLE_KEY` (server-only) `NEXT_PUBLIC_SITE_URL`.
A map provider key is pending the provider decision.

## Tests
**43 unit and component tests** — status vocabulary, role navigation, motion
tokens, the sidebar's restricted-not-hidden rule, open-redirect rejection
(absolute, protocol-relative, backslash, javascript: and data: targets), and
the permission vocabulary.

**66 database assertions** against real PostgreSQL, run as the `authenticated`
and `anon` roles with claims set the way PostgREST sets them:
- Tenant isolation in both directions, including audit entries.
- HR holds no payroll permission; Accounts holds no recruitment or HR
  permission; neither inherits the other.
- Settings is subject-scoped: HR owns structure, Accounts owns payroll rates,
  neither can open the other's, and neither holds full settings access.
- Employee "own only" works as a distinct scope, not a weaker read.
- Audit entries cannot be updated or deleted by anyone, Management included.
- A session with no org claim reads nothing; anon is refused outright.
- The workspace picker still lists memberships before an org is chosen.
- An HOD sees their own department's people and nobody else's, and cannot
  read salary for anyone — including their own team.
- HR sees every employee and zero salary rows.
- Accounts reads salary but cannot create an employee.
- An Employee sees exactly one employee row and one salary row, both theirs.
- An HOD cannot read next-of-kin details for their own team.
- Employees cannot be deleted by anyone — there is no delete policy.
- A structural audit: every table has RLS, no unconditional `authenticated`
  policy (two named exemptions, justified in place), every organization-owned
  table gates on `current_org_id()`, anon holds no privileges, audit_logs
  grants no mutation, and every security-definer function pins `search_path`.

The suite is mutation-tested. Eight deliberate regressions were each confirmed
to fail it: org isolation weakened to `using (true)`, HR granted the payroll
module, the audit log made editable, the tenant check dropped from the audit
policy, HR allowed to read salary, the HOD department restriction removed, an
employee allowed to see everyone, and an HOD allowed to read next of kin. A
suite that cannot fail is not evidence — and two of these attempts were
themselves no-ops on the first try, which is exactly why they get checked.

## Known limitations
- **Nothing has run against a real Supabase project yet.** The migrations and
  policies are exercised against local PostgreSQL 16 with a shim providing the
  `auth` schema and the anon/authenticated/service_role roles. That validates
  the SQL and the policies, but not the access token hook end to end — that
  needs a project with the hook registered in the dashboard.
- The dashboard and public home are still deliberate placeholders showing
  components, not fabricated statistics.
- Failed-login lockout (3 attempts / 15 minutes) and 2FA for Management and
  Accounts are **stored as settings but not yet enforced** — both need
  Supabase Auth configuration that only exists on a real project.
- The notification count is hard-zero until the notifications table lands in
  Phase 5. It shows nothing rather than an invented badge.
- Dialog, toast, timeline, capture panel and evidence viewer are still
  unbuilt — they land with the modules that use them. Table and slide-over
  arrived with Phase 3.
- **Create-employee and the full employee profile are not built.** The
  directory's Add button is present only when the caller holds
  `employees.create`, and the slide-over shows the directory fields plus a
  note about what is still to come — no fake form, no dead button beyond the
  one the next phase fills in.
- **No employees are seeded.** Departments, positions and shifts are; people
  are not, because a person without attendance, tasks or leave is a row
  pretending to be a record. The demo population belongs to Phase 10.

## Awaiting decisions
C1 geofence default (10 m vs 150 m) · C2 dark mode · C4 out-of-range field
visits · C6 map provider · C10 selfie/face-matching. Full list in
`PHASE_0_PLAN.md` sections 0.10-0.11.

## Blocked
Nothing blocks Phase 3 — it is migrations and UI, both testable locally.

To *run* what exists, a Supabase project is needed. The walkthrough is in
`docs/SUPABASE_SETUP.md`, with `supabase/setup/install.sql` (generated from
the migrations) and `supabase/setup/verify.sql` to confirm it took.

Note that this build environment's network policy blocks `supabase.com` and
`*.supabase.co`, so end-to-end sign-in cannot be verified from a session here
— hence the paste-and-verify scripts. Widening the policy is optional and
described at the foot of the setup doc.
