# Build state

**Current phase:** Phase 8 complete. A system review then found that the
read-side screens shipped without their write paths, the dashboard was never
replaced, and five nav items pointed at routes that do not exist. The
structural repairs (D57-D59) and the create paths (D60) are done; the five
missing screens, the invite flow and demo data are open — see `BACKLOG.md`.
**Next phase:** Phase 9 — reports, settings and administration.

Phase 4 proceeded under two stated assumptions rather than waiting: the
geofence default is the design's 150m (D33) and the position diagram is a
to-scale SVG rather than map tiles (D32). Both are cheap to change — one is a
settings value, the other one component.

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
Phase 4: `/[org]/attendance`, `/[org]/attendance/check-in`.
Phase 5: `/[org]/tasks`, `/[org]/tasks/visits`.
Phase 6: `/[org]/leave`, `/[org]/leave/approvals`.
Phase 7: `/[org]/payroll`, `/[org]/payroll/[period]`, `/[org]/payslips`.
Phase 8: public `/`, `/about`, `/services`, `/careers`, `/careers/[slug]`,
`/contact`; workspace `/[org]/recruitment`.

### Phase 8 — recruitment and the public website
- **Three migrations.** `0025_recruitment` (jobs, applications, stage history,
  notes, conversions), `0026_recruitment_actions`, `0027_recruitment_rls`.
- **The one public read policy in the product**: `anon` may select from
  `jobs`, filtered to `published` in the policy itself. The structural audit
  names that exception and separately asserts the policy filters — so adding
  a second public table is a decision someone has to make in that file.
- **Applicants are not users.** Applying needs no account. `apply_for_job()`
  runs as `anon`, takes the organization from the job, and accepts only
  published roles — a draft cannot be applied to even with its id.
- **Hired is unreachable by a stage move.** It happens through conversion,
  which creates the employee record. The unique constraint on
  `applicant_conversions` makes a duplicate conversion impossible.
- Rejected and withdrawn stay on the board and stay searchable.
- **A single content layer** at `src/content/company.ts` drives every public
  page, per the brief's rule against hard-coded content.
- **The deployment says it is a demonstration.** CHF Heron is a real client
  and the demo carries their real name, so `<DemoNotice />` renders on the
  public site and the sign-in screens, stating the site is not operated by or
  affiliated with them. Leadership and contact details are deliberately blank;
  services and offices are marked `CONFIRM` pending a check against
  chfheron.com. See `DECISIONS.md` D56 and `BACKLOG.md`.

### Phase 7 — payroll and payslips
- **Three migrations.** `0022_payroll` (rates, bands, components, periods, run
  lines, adjustments, payslips), `0023_payroll_actions` (calculation and the
  six-status pipeline), `0024_payroll_rls` `0025_recruitment`
`0026_recruitment_actions` `0027_recruitment_rls`.
- **All arithmetic in SQL, in numeric.** Nothing about a payslip is computed
  in JavaScript. `src/lib/payroll/model.ts` formats and nothing more.
- **A run line is a snapshot.** Employee name, number and department are
  denormalised onto it alongside every figure, so a later raise, rename or
  transfer cannot alter a payslip already issued.
- **Progressive tax from a band table**, each band taxing only its own slice.
  Generic rather than Nigeria-specific — hard-coding one country's schedule
  into a function makes it a lie the moment it changes.
- **Separation of duties** as a table constraint *and* a check in
  `advance_payroll()`: whoever submits a run cannot approve it.
- **Figures freeze at approval** by trigger, and **payslips are immutable** —
  update and delete revoked, plus a rejecting trigger.
- An adjustment on a locked run is **refused rather than silently ignored**,
  because the lines can no longer be recalculated to include it.

### Phase 6 — leave
- **Three migrations.** `0019_leave` (types, balances, requests, approvals),
  `0020_leave_actions` (the workflow), `0021_leave_rls` `0022_payroll` `0023_payroll_actions`
`0024_payroll_rls` `0025_recruitment`
`0026_recruitment_actions` `0027_recruitment_rls`.
- **A balance moves only on final approval.** Deducting at submission would
  make a declined request cost the employee days; deducting at HOD approval
  would strand them if HR declines. Both are covered by assertions.
- **Two stages that ask different questions** — the HOD judges coverage, HR
  judges policy. The chain collapses to HR alone when the requester has no
  head of department, and a department head's own request skips the stage
  they would be signing.
- **Insufficient balance blocks submission**, stating the shortfall, rather
  than being declined a week later.
- Document requirement per type — sick leave over three consecutive days
  needs a certificate.
- **No insert or update policy on `leave_requests`.** Everything goes through
  the three functions, so the chain, the self-approval block and the balance
  rule cannot be routed around.
- Timeline component, with the waiting stage marked active and how long it
  has waited — measured from the previous decision, not from submission.

### Phase 5 — tasks and field visits
- **Three migrations.** `0016_tasks` (tasks, assignees, target locations,
  comments, attachments, activity, field visits and their evidence),
  `0017_tasks_rls`, `0018_field_visit_actions` `0019_leave` `0020_leave_actions`
`0021_leave_rls` `0022_payroll` `0023_payroll_actions`
`0024_payroll_rls` `0025_recruitment`
`0026_recruitment_actions` `0027_recruitment_rls`.
- **Five verification modes**, chosen per task. `none` is a first-class mode
  and the default: the design is explicit that forcing proof on desk work is
  wrong.
- **Out of range blocks capture.** `submit_field_visit()` computes the
  distance from the task's own target and *refuses* a submission from the
  wrong place rather than recording it flagged. Measured against the near
  edge of the accuracy circle, so a coarse fix at the door is not turned away
  — but it is flagged for a person.
- **A returned visit keeps its original evidence** and carries a mandatory
  reason of at least ten characters. Re-capture adds an attempt rather than
  replacing one.
- **Assignment is bounded by department.** An HOD holding `tasks.create`
  still cannot create work outside a department they head.
- Board on desktop, list under 768px — the design rules out a horizontally
  scrolling board on a phone. Both render from the same rows.
- Review queue showing distance, accuracy, report and flags before the
  decision; accept is one click, return demands a reason.

## Components added
`ui/button` `ui/field` `ui/card` `ui/avatar` `ui/status-pill` `states/index`
`shell/app-shell` `shell/sidebar` `shell/topbar` `shell/bottom-nav`
`shell/command-palette`

## Database migrations
`0001_organizations` `0002_profiles` `0003_rbac` `0004_audit` `0005_rls`
`0006_permission_catalogue` `0007_access_token_hook`
`0008_departments_positions` `0009_employees` `0010_employees_rls`
`0011_attendance` `0012_geofence` `0013_attendance_rls`
`0014_attendance_actions` `0015_storage` `0016_tasks` `0017_tasks_rls`
`0018_field_visit_actions` `0019_leave` `0020_leave_actions`
`0021_leave_rls` `0022_payroll` `0023_payroll_actions`
`0024_payroll_rls` `0025_recruitment`
`0026_recruitment_actions` `0027_recruitment_rls`

Audit was built as `0004` rather than the brief's `013` because the design
requires audit writes alongside each module rather than retrofitted at the
end — the table has to exist before the first module does.

## Environment variables required
`NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY`
`SUPABASE_SERVICE_ROLE_KEY` (server-only) `NEXT_PUBLIC_SITE_URL`.
A map provider key is pending the provider decision.

## Tests
**111 unit and component tests** — status vocabulary, role navigation, motion
tokens, the sidebar's restricted-not-hidden rule, open-redirect rejection
(absolute, protocol-relative, backslash, javascript: and data: targets), and
the permission vocabulary.

**193 database assertions** against real PostgreSQL, run as the `authenticated`
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
- **The public site is mostly placeholders, deliberately.** The design pack
  contains invented executives with invented biographies, a founding year and
  coverage figures — sample content that made the mockups feel real. Those are
  claims about a real business and named people, so the *structure* is built
  and the *claims* are left empty. A section with no content does not render
  at all: the site is smaller until it is filled in, rather than confidently
  wrong. One file, `src/content/company.ts`, is the only edit needed.
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
