# Decisions

Each entry: the decision, why, and its status. `Proposed` means it needs the client's sign-off before Phase 1 closes.

## D1 — Design beats brief where they conflict — **Accepted**
The approved Claude Design output is the visual and behavioural source of truth. Where the master build prompt and the design disagree, the conflict is surfaced for a decision rather than silently resolved. Sixteen such conflicts are listed in `PHASE_0_PLAN.md` §0.10.

## D2 — Org-scoped routes `/[org]/…`, not `/dashboard/…` — **Accepted**
The design shows an organisation switcher in the topbar from day one. A `/dashboard/*` prefix would bake single-tenancy into every URL. Deviates from the brief's route list, deliberately.

## D3 — Geofence default 150 m, per-office configurable, warn outside 25–250 m — **Proposed**
The brief says 10 m; the design says 150 m. Consumer GPS cannot resolve 10 m reliably, so a 10 m fence would misclassify genuine office arrivals as remote or uncertain. The design is both approved and technically correct.

## D4 — Ship light mode only — **Proposed**
The dark ramp is defined but no per-screen dark treatment was designed, and the design explicitly forbids inventing one. Build with CSS custom properties so dark is a later token swap. Requires removing "Dark mode works" from the MVP-ready criteria.

## D5 — Out-of-range field visits block capture, and the blocked attempt is logged — **Proposed**
The design blocks capture out of range; the brief records and flags. Blocking is the approved, stronger anti-fraud position. Logging the blocked attempt keeps a genuine pin error visible to the HOD instead of silent.

## D6 — Company code is a routing hint, not a credential — **Proposed**
Supabase Auth authenticates on email + password. The code resolves an org slug before sign-in and scopes the redirect and workspace picker. No security is derived from it.

## D7 — shadcn/ui used as behaviour primitives with its theme layer fully replaced — **Accepted**
shadcn's neutral scale, 256px sidebar and 40px controls do not match the approved tokens (186/58px sidebar, 38/44px controls, five named radii). Components will not look like stock shadcn, by design.

## D8 — Payslip PDF via print stylesheet for MVP — **Proposed**
`@media print` plus browser print-to-PDF meets the A4 greyscale requirement exactly with no dependency. Server-side PDF generation is a later enhancement if a signed document is required.

## D9 — Permission-slug policies, never role-name policies — **Accepted**
RLS tests `has_permission('attendance.view_all')`, never `role = 'hr'`. Roles are data; the union of a user's roles produces their permissions.

## D10 — JWT claims for org and permissions — **Accepted**
A custom access token hook stamps `organization_id`, `role_slugs[]` and `permission_slugs[]` into the token, so policies read claims rather than joining `user_roles` per row.

## D11 — Salary in a separate table — **Accepted**
`employee_compensation` is separate from `employees` so roles without payroll access are denied at table level and salary fields are absent from the response, not merely hidden in the UI.

## D12 — Audit immutability enforced by the database — **Accepted**
UPDATE and DELETE revoked from every role including Management, plus a rejecting trigger. Application discipline is not the control.

## D13 — Payroll separation of duties enforced in SQL — **Accepted**
`approved_by ≠ submitted_by` as a constraint; run lines frozen by trigger at approval; publication irreversible with corrections as next-period adjustments.

## D14 — Second-approver workflow modelled as data — **Accepted**
`role_grant_requests` carries the mandatory reason and the second approver for any grant touching Payroll, Documents, Settings or Audit. The brief's RBAC tables had nowhere to store this.

## D15 — Offline scope limited to check-in and field-visit capture — **Accepted**
Matches the design's open item. Service worker plus IndexedDB outbox plus idempotent endpoints, built in Phase 4 rather than retrofitted. Everything else requires connectivity and says so plainly.

## D16 — Retention runs on `pg_cron`, not application cron — **Proposed**
24-month photos, 12-month coordinates, 7-year audit. Running next to the data means a deploy cannot skip it. Values configurable; changes require a written policy note, per the design's open item pending legal counsel.

## D17 — No face matching — **Proposed**
One HR review string reads "Selfie matches the profile photo." Read as a human reviewer's note. Automated face recognition is a materially different product with biometric-data implications under the Nigeria Data Protection Act, and the design's own principle treats capture as operational evidence, not forensic proof.

## D18 — Design's build order adopted: attendance before employee screens — **Accepted**
The design puts the verification loop second so real field data arrives early. Resolved against the brief's ordering by building the employee **record** in Phase 3 and the employee **screens** in Phase 4, with attendance immediately after.

## D19 — Undesigned screens built from approved components only — **Accepted**
Notifications centre, announcements composer, shift-pattern admin and org chart have no design. They will reuse existing approved components and are flagged for a design pass. The design's rule stands: a requirement that doesn't fit an existing component is a design question, not an invented variant.

## D20 — Repository placement — **Open, blocking Phase 1**
`uzorka/uzorka` currently holds an unrelated Vite/Capacitor project at its root. Recommendation: a fresh repository. Alternatives: a subdirectory, or replacing the root contents.

## D21 — Settings permissions split by subject — **Accepted**
The design's Settings scope for HR and Accounts is "Some areas", scoped by
subject rather than department: HR owns departments and leave types, Accounts
owns payroll rates and statutory settings, and neither can open the other's. A
single `settings.manage` slug cannot express that — it gave both roles full
settings access, including each other's areas. Split into `settings.manage`,
`settings.manage_structure` and `settings.manage_payroll`. Found by checking
the seeded permission sets against the matrix rather than by reading the code.

## D22 — The RLS suite runs against real PostgreSQL, not a mock — **Accepted**
A local PostgreSQL 16 cluster plus a test-only shim (`supabase/tests/00_supabase_shim.sql`)
providing the `auth` schema, `auth.uid()` and the anon/authenticated/service_role
roles. Policies are asserted as the actual database roles with claims set the
way PostgREST sets them, so a pass reflects what the policies do rather than
what they look like they do. The shim is never applied to a real project.

## D23 — The RLS suite is mutation-tested — **Accepted**
Four deliberate regressions — org isolation weakened to `using (true)`, HR
granted the payroll module, the audit log made editable, and the tenant check
dropped from the audit policy — were each confirmed to fail the suite. A
security suite that cannot fail is not evidence, and the first attempt at one
of these mutations was itself a no-op that looked like a pass.

## D24 — Audit entries are written only through `write_audit()` — **Accepted**
There is deliberately no INSERT policy on `audit_logs`. The function is
`security definer` and takes the organization from the caller's own JWT claim
rather than from an argument, so a client cannot forge an entry against
another tenant even if it can call the function.

## D25 — Unconfigured environments get a screen, not a stack trace — **Accepted**
A clone without `.env.local` is the first thing a new contributor hits.
`isSupabaseConfigured()` is checked before any client is created, and the
workspace and picker render a setup screen naming the exact fix. "Safe error
messages, never a stack trace" applies to developers too.

## D26 — Department headship is a table, not a column — **Accepted**
The design says an HOD may head more than one department. Every "Dept only"
scope in the matrix resolves through `department_heads`, keyed on `user_id`
rather than an employee id — the scope has to resolve from a JWT, and not
every head necessarily has an employee record yet.

## D27 — The three employee scopes are three separate RLS policies — **Accepted**
Postgres ORs permissive policies together, which is precisely the union
semantics the matrix calls for. Someone who is both an HOD and an employee
sees their department and themselves, with no special case anywhere in the
code.

## D28 — An HOD cannot read next-of-kin details — **Accepted**
Heading a department is a reason to see who is in it, not a reason to hold
their emergency contacts. `employee_emergency_contacts` is gated on
`employees.update` (HR and Management) or being the person themselves. The
design does not state this explicitly; it follows from its data-minimisation
principle, and it is cheap to loosen later if the client disagrees.

## D29 — Shift patterns built as data without a designed screen — **Accepted**
"Late" and "Absent" are computed against an expected start, and Phase 4 shows
a 09:00 sales shift beside an 08:00 warehouse shift, but no screen was ever
designed for managing them. Built as `shift_patterns` and `employee_shifts`
with three seeded patterns so Phase 4 has something real to compare against
rather than a hardcoded time. Flagged for a design pass.

## D30 — No employees are seeded — **Accepted**
Departments, positions and shift patterns are seeded; people are not. An
employee record with no attendance, tasks, leave or payslips is a row
pretending to be a record, and it would make the directory look finished while
every screen behind it was empty. The demo population belongs to Phase 10,
once the modules that give those records meaning exist.

## D31 — Search terms are stripped of PostgREST delimiters — **Accepted**
Commas and parentheses delimit an `or(...)` group, so "Okonkwo, Adaeze" in the
search box would be parsed as filter syntax. They are replaced with spaces and
the resulting whitespace is collapsed — without the collapse the pattern
carries a double space and matches nothing, which is a silent failure rather
than a loud one.
