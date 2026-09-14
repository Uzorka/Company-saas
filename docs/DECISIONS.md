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

## D32 — The geofence "map" is a to-scale SVG diagram, not map tiles — **Proposed**
No tile provider is named anywhere in the design pack, and none is free at
scale. Rather than pick a vendor on the client's behalf or ship a broken map,
`GeofenceMap` draws the information the map actually carries: the office pin,
the geofence to scale, the employee's position, and the accuracy circle around
it. The accuracy circle is the part that matters — it shows visually why a
reading is or is not decisive. Adding real tiles later means putting a
background layer under this geometry, not rewriting it. Still open: the client
may want real tiles, which is C6 in the Phase 0 plan.

## D33 — Geofence default stays at the design's 150m — **Proposed, unanswered**
The brief says 10m; the design says 150m with per-office overrides. Built as
150m in `organization_settings.default_geofence_radius_m`, configurable per
office. This is a one-value change if the client insists on 10m — but the
classification logic will then mark most office arrivals `uncertain`, because
a 10m fence cannot be resolved by a fix with ±15m accuracy. That is the honest
outcome, not a bug.

## D34 — A GPS fix is a circle, and classification says so — **Accepted**
`classify_attendance` resolves office/remote only when the entire accuracy
circle falls on one side of the fence:

    distance + accuracy <= radius  -> office
    distance - accuracy >  radius  -> remote
    otherwise                      -> uncertain

So 149m with ±8m is *uncertain*, not "office" — 141-157m straddles a 150m
fence. Claiming otherwise would be the product asserting something it cannot
know, on a record that determines someone's pay.

Classification and review are separate: a fix can be geometrically decisive
and still poor enough in absolute terms to deserve a person's glance (3.8km
away with ±140m is certainly outside the fence, but does not corroborate where
the employee says they are). The absolute threshold is 100m — a judgement, not
a design constant.

## D35 — Geofence logic is duplicated in SQL and TypeScript, and cross-checked — **Accepted**
The database is authoritative. But the design requires the classification to be
stated *before* the selfie is taken, and a round trip per GPS reading is not
viable on a phone in a depot. So the logic exists in both languages, and
`scripts/check-geofence-parity.mjs` runs 17 cases through both and fails the
build if they disagree. Duplication is only safe when it is checked.

## D36 — Attendance records can only be written by check_in() — **Accepted**
There is no INSERT policy on `attendance_records`. The function is security
definer and derives the employee, organization, timestamp, classification and
review state itself; the caller supplies only a position and an accuracy —
facts that genuinely come from the device. An employee therefore cannot record
themselves as being at the office by posting a chosen value, which is the whole
point of the module.

`check_in_at` is additionally immutable by trigger: not even HR can rewrite a
captured time. A correction is a new row in `attendance_corrections` carrying a
mandatory reason of at least ten characters.

## D37 — Every capture failure still records the time — **Accepted**
Location denied, camera denied, and an unresolvable fix all still produce a
record, flagged for review. The design's reasoning, which I agree with: "a
flagged check-in beats no check-in, because an employee who can't record time
will stop trusting the tool." A failed selfie upload likewise does not roll back
the check-in — the record exists and is flagged for the missing photo.

## D38 — Out-of-range visits are refused, not recorded — **Accepted**
The design says range is checked before the camera opens, so
`submit_field_visit()` raises rather than writing a flagged row. A visit
submitted from the wrong place is not a state the table should be able to
hold. The brief proposed record-and-flag; the design's position is stronger
and it is what shipped (C4 in the Phase 0 plan).

The range test measures the **near edge** of the accuracy circle, not its
centre: someone genuinely at the door with a poor fix is not turned away, and
the recorded accuracy lets the reviewer judge it afterwards. A coarse fix is
accepted and flagged, never silently trusted.

## D39 — Cancelled is a filter, not a board column — **Accepted**
`BOARD_COLUMNS` has four lanes. A lane for abandoned work fills up and never
empties, and it pushes the live columns off a laptop screen. Cancelled tasks
remain visible and queryable; they just are not a destination.

## D40 — A task due today is not overdue — **Accepted**
`isOverdue` compares calendar dates, not timestamps. Marking a task overdue at
09:00 on its due date makes every morning look like a crisis and trains people
to ignore the colour.

## D41 — An HOD cannot create work outside their department — **Accepted**
`tasks.create` alone is not enough: the insert policy also requires either
`tasks.assign_any` or a department the caller heads. Without that pairing, the
"Dept only" scope in the matrix would hold for reading tasks but not for
creating them, which is the more consequential direction.

## D42 — A leave balance moves only on final approval — **Accepted**
Not at submission, and not at HOD approval. Deducting early would make a
declined request cost the employee days, and deducting at the first stage
would strand days in limbo if HR then declines. Three assertions guard the
three moments.

## D43 — A department head's own leave skips the HOD stage — **Accepted**
`first_leave_stage()` routes to the HOD only when one exists *other than the
requester*. Otherwise the two stages collapse into one person signing their
own request, which is the thing the chain exists to prevent. The timeline
renders three nodes rather than four in that case, so a stage that never
applied does not look like a missing step.

## D44 — Public holidays are not modelled — **Open**
`working_days_between()` excludes weekends only. Nigerian public holidays need
the client's calendar, and guessing them would silently miscount leave. The
day count is *stored on the request*, so adding a holiday table later cannot
retroactively change what an approved request cost. Flagged in BACKLOG.

## D45 — Test the effect of a refused write, not just for an exception — **Accepted**
RLS refuses a write two different ways. A missing table privilege raises; a
policy that matches no rows does not — the statement succeeds having changed
nothing. A test asserting only that an exception occurred gives a **false
pass** on the second case, and would keep passing if the policy were later
dropped.

Found when "an employee cannot reset their own balance" failed: the data was
safe (zero rows changed), but the assertion was looking for the wrong thing.
Added `rows_changed_by()` to the shared fixtures and asserted on the effect.
Any future write test should use it rather than `denies()`.

## D46 — Payroll arithmetic lives in SQL, in numeric — **Accepted**
Money is `numeric(14,2)` and every figure on a payslip is computed by
`calculate_payroll()`. The TypeScript layer formats and totals for display and
does nothing else. Floating point is fine for a progress bar and wrong for
someone's salary, and two implementations of the same sum will eventually
disagree.

## D47 — A run line is a snapshot, not a join — **Accepted**
Employee name, number and department are copied onto `payroll_run_lines`
alongside every computed figure. A raise, a rename or a transfer next quarter
must not change a payslip already issued. Verified by a test that raises the
salary after publication and asserts the recorded net is unchanged.

## D48 — Progressive tax comes from a band table, not a function — **Accepted**
`paye_bands` is generic: any progressive schedule can be expressed in it, and
correcting a rate is an insert rather than a migration. `calculate_paye_annual`
taxes each band's own slice — computing a single top rate over the whole
amount is the classic error, and a test pins the difference (₦32,000 versus
₦44,000 on the same income).

The seeded rates and bands are **the design's sample values, not tax advice**,
and the seed file says so. They need checking against current FIRS, PenCom and
NHF guidance before anyone is paid from them.

## D49 — An adjustment on a locked run is refused, not ignored — **Accepted**
Once a run is approved its lines cannot be recalculated, so an adjustment
added afterwards would silently never apply. The insert policy refuses it and
the message says corrections go to the next period.

## D50 — Test the guard, not the grant — **Accepted**
"An approved run's lines cannot be edited" was passing because `authenticated`
holds no UPDATE grant on `payroll_run_lines` — the lock trigger was never
exercised, and dropping it did not fail the suite. The trigger exists for
paths that bypass grants entirely (security-definer functions, service-role),
so it is now tested as the table owner. Dropping it now fails.

Same shape as D45: a passing test proves something, but not always the thing
its name claims.

## D51 — The public site ships with empty content, not invented content — **Accepted**
The design pack contains a complete-looking company: six named executives with
biographies, a founding year, coverage figures, client logos. All of it was
invented to make the mockups feel real, which is the right thing for a mockup
and the wrong thing for a live corporate website.

Publishing invented executives would state things about a real business, and
about named people, that nobody has verified. So `src/content/company.ts`
holds the structure with empty arrays, and every section renders only when it
has content. The site is smaller until the client supplies theirs, rather than
plausible and false.

This also satisfies the brief's own rule — "do not hard-code company content
across many components" — with a single file to edit.

## D52 — `anon` reaches exactly one table, and the audit says so by name — **Accepted**
Published jobs are public by definition, so `anon` holds SELECT on `jobs` and
nothing else. The structural audit was updated to name that exception rather
than relax the rule, and gained a second check asserting the public policy
filters to `published`. A behavioural test confirms an anonymous caller is
refused on `job_applications`, `application_notes` and `employees`.

## D53 — Hiring is a conversion, not a stage — **Accepted**
`move_application_stage()` refuses `hired` outright. Hiring creates an
employee record; offering it as a drag target would let someone mark a person
hired with nothing behind it. `applicant_conversions` has a unique constraint
on the application, so converting twice is impossible rather than discouraged.

## D54 — A failed CV upload does not fail the application — **Accepted**
The application row is written first, then the CV. If the upload fails the
application still stands and HR can ask for the CV. Losing a document is
recoverable; losing someone's application is not, and they would never know.

## D55 — `denies()` catches four error classes, not everything — **Accepted**
Broadened from two to include `no_data_found` and `unique_violation` — the
other classes our functions raise deliberately. Deliberately not wider: a
catch-all would let a typo or a dropped function read as a successful
refusal, which is the same false-pass problem as D45 and D50 in a new place.

## D56 — The demo carries CHF Heron's real name, and says so on every page — **Accepted**
CHF Heron Nigeria is a real client, and the product is being pitched *to* them
using their own business as the worked example. That is a better demo than
"Acme Corp" — a distribution business with warehouses, field reps and a
payroll is exactly what this product is for.

It also creates a problem D51 did not have. The deployment is on a public URL.
A public page carrying a real company's name, services and addresses, with no
notice, is indistinguishable from that company's official website — and CHF
Heron has not commissioned, reviewed or approved it.

So three rules now hold together:

1. **`company.demo.isDemo` renders a notice on every publicly reachable
   surface** — the public site and the sign-in screens — stating that this is
   a product demonstration, not operated by or affiliated with CHF Heron, and
   that enquiries sent here do not reach them. Setting the flag to false is
   the single switch for a deployment the client has actually asked for on a
   domain they control.

2. **Only business facts the company itself publishes, and nothing about named
   individuals.** Real executive names and titles are findable online. They
   stay out: publishing identifiable people on an unaffiliated site is worse
   than the invented names D51 refused, not better, because the harm lands on
   someone real. `leadership` stays empty and the About page says why.

3. **No contact route.** Email and phone are blank and there is no enquiry
   form. A demo that funnels real enquiries to the client's switchboard sends
   them traffic they never agreed to; a stale directory number sends callers
   to a stranger.

The services and offices that *are* published came from public directory
listings and search results, not from chfheron.com — the build environment
cannot reach it. Each is marked `CONFIRM` in `src/content/company.ts` and
listed in `BACKLOG.md`. Directory data goes stale, and a wrong address in a
pitch is worse than no address.

This supersedes D51's "empty until the client supplies content" only for
business-level facts. D51's rule about invented people stands, and now
extends to real ones.

## D57 — An unbuilt screen stays in the nav, marked, and is not a link — **Accepted**
A review found `/reports`, `/settings`, `/audit`, `/documents` and
`/notifications` in the sidebar as ordinary links to routes that do not exist.
Every one 404'd. The bell in the topbar did the same, and the HOD "Field
visits" item pointed at `/tasks?view=visits`, a query parameter the tasks page
ignores.

Two ways out: drop them, or mark them. Marked, because the modules are real,
named in the brief, and part of what is being pitched — removing them would
make the product look smaller than it is. So `NavItem.built` is now a required
field. An item with `built: false` renders as plain text with a "Soon" marker
in the sidebar and the mobile sheet, and is excluded from the command palette
entirely, because the palette exists to go somewhere.

The bell was removed outright rather than marked: it had no screen to open and
no table to count, so it was an icon with a permanently empty badge. It comes
back with the notifications screen.

Three tests guard the regression — no anchor on an unbuilt item, a "Soon"
marker on each, and a working link on every built one.

## D58 — Sign-out exists in the UI — **Accepted**
The topbar avatar was a `<button>` with no `onClick` and no menu. `signOut()`
had been written in Phase 3 and never called from anywhere. It is now an
account menu: the user's name, role and organization, and a Sign out item.

It is a `<form action={signOut}>` submit rather than a click handler, because
sign-out is a server action and a form is the path that works without
client-side JavaScript having to succeed first.

## D59 — The dashboard is a launcher until it has real figures — **Accepted**
`/[org]/dashboard` was still the Phase 1 component gallery: a heading reading
"Phase 1 / Foundation", a row of status pills, six buttons labelled Primary,
Secondary, Ghost, Destructive, Loading and Disabled, and an empty state saying
"No modules yet". Every user saw it on landing, through Phases 4 to 8.

The brief specifies five role dashboards. Those need figures — today's
attendance, pending approvals, the payroll position — and the honest version of
a figure nobody has computed is not a zero on a card, it is no card. So the
dashboard is now a role-filtered launcher: the modules this user can open, and
a plainly labelled list of the ones that are not built. It stops lying without
inventing statistics to replace the lie.

## D60 — Create paths: forms over the policies that already existed — **Accepted**
The review found every module was a review-and-approve screen with its first
step missing. Seven writes were added: employee, department, position, task,
leave request, payroll period and job.

Almost none of it needed new database work. `employees_insert`,
`departments_manage`, `positions_manage`, `tasks_insert`,
`payroll_periods_insert` and `jobs_manage` were all written in Phases 4–8 and
had never had a caller. That is the useful finding: the security model was
finished and the product could not use it.

Three rules held throughout:

1. **`organization_id` comes from the verified session, never the form.** A
   hidden field naming the tenant is a tenant-switching bug waiting to happen.
   The policies refuse a cross-tenant insert anyway, and there is now a test
   that names another tenant's id directly and asserts zero rows change.

2. **Nothing re-implements a database rule.** Leave goes through
   `submit_leave_request()` because the balance check, the working-day count
   and the two-stage routing have to happen together — `leave_requests` has no
   insert policy at all, and that stays true. The leave form deliberately does
   not show a computed day count alongside the dates: it would be a second
   implementation of `working_days_between()` and the two would drift.

3. **A new row starts in the least privileged state it can.** A payroll period
   is created in `draft`, never costed — `calculate_payroll()` is a separate,
   deliberate step, because costing a payroll should not happen as a side
   effect of naming one. A job is created as a draft unless the author ticks
   publish, because `jobs_public_read` makes a published row readable by
   anonymous visitors: publishing is the one action in the workspace that puts
   text on the public internet, so it is an explicit choice with the
   consequence written next to it.

One schema change was genuinely needed, as migration 0028: `tasks.reference`
was `not null` with no default and no trigger, so every insert had to supply
one. The sequence and `next_task_reference()` had existed since 0016 with
nothing wired to them. Making it a column default keeps allocation in the
database, where a client cannot skip it, choose its own, or race another
writer.

25 new assertions. Three of them were mutation-tested: dropping the permission
check from `employees_insert`, dropping `created_by = auth.uid()` from
`tasks_insert`, and reverting 0028 each make the suite fail.

## D61 — The create panel calls the action, rather than reacting to it — **Accepted**
`CreatePanel` needs to close the slide-over when the row is written. The
obvious shape — `useActionState` plus an effect watching `state.done` — is
exactly the pattern `react-hooks/set-state-in-effect` exists to catch, and it
was flagged. Suppressing the rule was not the fix; it was right.

So the panel calls the action inside a transition and acts on the result in
the submit handler. Same behaviour, no state set from an effect, and the
pending flag still comes from React rather than being tracked by hand.

## D62 — install.sql is re-runnable, and proves it against a replica — **Accepted**
The generated bundle carried the note "safe to run once on a fresh project",
which was true, and I told the user it was idempotent, which was not. Adding
migration 0028 meant re-pasting it, and it stopped at
`create type organization_status already exists` — Postgres has no
`create type if not exists`, and the whole file is one transaction, so nothing
was half-applied but nothing was applied either.

Handing over a single statement for 0028 would have fixed that afternoon and
left the same trap set for the next migration. So the bundle now carries a
`schema_migrations` ledger: every migration is wrapped in a guard that records
itself and is skipped when already present. Re-pasting after new migrations
applies only the new ones. The wrapper uses the `$mig$` dollar tag, which the
migrations themselves never use (`$$` and `$p$` are theirs), so nested
function bodies still quote correctly.

That alone does not help an existing project, which has the tables and an
empty ledger — it would try migration 0001 again and fail identically. Hence
`adopt.sql`, generated alongside: for each migration it looks for an object
that migration creates and records it only if present. Detection rather than a
hardcoded list of what someone probably has, because such a list is wrong
precisely on the database that matters.

Verified by building a replica of the live project — migrations 0001–0027
applied the old way, no ledger, 0028 absent — then running adopt (26 recorded,
0015 and 0028 correctly reported absent), install (applied exactly those two),
confirming `tasks.reference` gained its default, and running install a third
time for zero applications and zero errors.

That replica caught a real bug: the first sentinel for 0015 read
`storage.buckets` directly, and plpgsql resolves the whole expression before
`and` can short-circuit, so it raised wherever the storage schema is absent.
It now checks `pg_policies`, a catalogue view that is empty rather than
missing.

## D63 — The verification script now covers the whole product, and the ledger is a migration — **Accepted**
The live database turned out to be fourteen migrations behind: `install.sql`
had been run once at Phase 4, when it contained migrations 0001–0015, and
everything from Phase 5 on — tasks, field visits, leave, payroll, payslips,
recruitment — had never reached it. The app had been querying tables that do
not exist.

`verify.sql` did not catch this, because it was written at Phase 4 and only
ever checked Phase 4's objects. A database missing four modules entirely
reported all-PASS. That is the failure worth naming: a verification script
frozen at the moment it was written stops verifying and starts reassuring.
It now checks the Phase 5–8 tables by name, the 0028 column default, the
seeded leave types and payroll reference data, the storage policies, and the
ledger.

Two things came out of extending it.

Its existing "RLS enabled on every public table" check failed — on
`schema_migrations`, the ledger added in D62. Correct catch: the table was
created by the bundle with no RLS and no revoke, so PostgREST would have
exposed it. It now has RLS enabled and forced with no policies, and no grants
to `anon` or `authenticated`.

And it existed only in the generated bundle, not as a migration, so applying
migrations directly produced a different schema from pasting `install.sql` —
which is exactly how the structural audit ends up checking something the live
database does not have. It is now `0000_schema_migrations.sql`, created
`if not exists` because the bundle's header must create it before the first
guard can read it.

The ledger check reports what it found rather than asserting a count. "28 of
28" would need editing on every new migration, and a check that goes stale
silently is worse than one that states the number. Completeness is proved by
the checks that name actual objects.

## D64 — Demo data is generated, reversible, and never hand-costed — **Accepted**
23 fictional employees with 437 attendance records, 10 tasks, 3 field visits,
4 leave requests at four points in the chain, two payroll runs and 9
applicants. `supabase/seed.sql` had always deferred this — "inventing people
now would mean inventing their attendance too" — and the modules now exist to
give it meaning.

Four things shape it.

**The payroll figures are not written down.** Both runs are costed by
`calculate_payroll()`, the same function the application calls, with the
request claims set the way the access token hook stamps them. Hand-written
numbers would make the tax engine look correct without ever running it; as it
is, the demo payslips show real progressive PAYE (18.6% at ₦610k rising to
20.8% at ₦2.4m), pension at 8% and NHF at 2.5%.

**Attendance is generated from a hash of (employee, day)**, not listed. That
keeps it current whenever the file is run, and gives each person a stable
character — one is reliably early, another often late — instead of noise that
looks identical for everyone. Roughly 5% of weekdays have no record at all,
because an absence in this product is the absence of a row.

**No accounts, no passwords.** `employees.user_id` stays null, which the
schema supports. Nothing writes to `auth.users`: creating sign-in credentials
from a SQL file is how test passwords reach production. The consequence is
that `department_heads`, which points at a user, names the one real account.

**Every row has a fixed id in a reserved range**, so the file is idempotent and
`demo-seed-remove.sql` can match on identity rather than guessing from names
or dates. Anything created through the app has a random id and is never
touched.

Two bugs surfaced only because the file was run twice rather than once.
`calculate_payroll()` moves a period from draft to `processing`, so the
publish step guarded on `status = 'draft'` never fired, and the re-run then
recosted a period whose lines already had payslips pointing at them. The guard
is now the absence of lines, which is what "not yet costed" actually means.

The teardown disables `payslips_immutable` and `payroll_run_lines_locked` for
the length of its transaction. That is a real trade and it is stated in the
file: an issued payslip is a document, and nothing reaching the database
through the application may withdraw one. This script is not the application —
it runs as the table owner, deletes only ids it wrote itself, and re-enables
both triggers in the same transaction, so a failure rolls back the data and
the triggers together. Verified: seed, remove, re-seed, remove, and remove
again on a clean database, with the triggers confirmed re-enabled and the
configuration — departments, positions, leave types, PAYE bands, roles, the
real account — untouched at 681 rows removed.

## D65 — Session and organization are resolved once per request — **Accepted**
Every screen was slow, and the cause was not query cost: it was round trips.

`requireOrg()` ran in the workspace layout and again in the page inside it.
Each call verified the JWT through `getClaims()` and issued its own
`organizations` lookup, and the layout then fetched the same organization row a
third time for the sidebar name. Each `createClient()` built a fresh client
that re-read cookies and re-established auth state. None of it was wrong; all
of it was repeated, and every repeat was a sequential round trip that had to
finish before the page's own data could start loading.

`createClient`, `getSession` and `requireOrg` are now wrapped in React's
`cache()`, and a shared `getOrganization()` serves both the slug check and the
sidebar. One request resolves each of these once. Nothing about the
authorisation changed — the same token is verified, the same slug is checked
against it, RLS is untouched — it is verified once instead of three times.

The remaining latency is the count of genuine data round trips, and the
distance between the Vercel region and the Supabase region. That second one is
deployment configuration, not code, and is worth checking before optimising
further: a mismatched pair puts 200-400ms on every single query.

## D66 — The app had no loading state at all — **Accepted**
There was not one `loading.tsx` in the project. Every navigation is a server
render, so the browser held the previous screen, unchanged and unmarked, until
the next one was ready. On a slow connection that is indistinguishable from a
click that did nothing, which is exactly what it was reported as.

Ten `loading.tsx` files now cover the workspace, each rendering a skeleton
shaped like the screen it stands in for — rows for a directory, columns for the
task board, a wide table for a payroll run — so the layout does not jump when
the real content arrives. The pulse animates one container rather than each
element, so the skeleton breathes together instead of shimmering out of step,
and it respects `prefers-reduced-motion`.

## D67 — "Payslips" means your own, and says so when you have none — **Accepted**
The payslips screen ran an unfiltered query and let RLS decide the scope. For
an employee that is correct: `payslips_select_own` matches their own row. For
Management, `payslips_select_all` matches every payslip in the company — so a
screen headed "Payslips" rendered 23 full payslip documents, one per employee,
and called them yours.

It now filters on the caller's own employee record explicitly. Where a policy
is deliberately broad, the query has to say what it actually wants; leaning on
RLS for scope means the answer changes with the caller's permissions, which is
right for security and wrong for a heading that says "your".

An account with no employee record now gets a different empty state from an
employee with no payslips yet. They are not the same situation: one is waiting
for a payroll run, the other never will be, and telling an administrator "no
payslips yet" invites them to wait for something that cannot arrive. The
demo seed also attaches the signed-in account to an employee record, because
without one every self-scoped screen in the product is empty for the only
person who can sign in.

## D68 — The workspace root and unknown paths answer, rather than 404 — **Accepted**
Reported as "404, nothing loads". The build was clean and every route present;
running the production build locally and sweeping the paths showed the app
serving 200 everywhere except three cases, all of which were real gaps:

`/{org}` — the bare workspace URL — had no page at all. Bookmark the workspace,
trim the path in the address bar, or share a link without a screen on the end,
and a signed-in user got a flat framework 404 from a product that was working.
It now redirects to the dashboard, rather than rendering a second copy of it,
so one dashboard URL serves the breadcrumb, the sidebar's active state and the
browser history alike.

Adding that page created a problem of its own, caught by re-running the sweep:
`[org]` is a dynamic segment at the top of the tree, so every unmatched
single-segment URL in the product — `/nope`, anything — suddenly matched it and
got bounced toward a dashboard that cannot exist. The page now checks the slug
resolves to a real organization first and calls `notFound()` when it does not,
which is the behaviour that existed before and should have survived the change.

The five unbuilt screens (`/reports`, `/settings`, `/audit`, `/documents`,
`/notifications`) 404'd too. D57 made them non-links in the sidebar, but a URL
can still be typed, bookmarked from an older build, or followed from a shared
link — and being told a page does not exist, by a product whose own sidebar
lists it, reads as a bug. A catch-all under `[org]` now renders inside the app
shell and distinguishes the two cases: a planned module says it is not built
yet, a typo says nothing answers to that address. Both keep the sidebar and
offer a way back.

The root `not-found.tsx` replaces the framework's unstyled default, which gave
no sign the rest of the product was fine or how to return to it.

None of this is proof it was the cause of what was reported — the sweep can
only show which paths were broken, not which one was in the address bar. The
question of whether the deployment itself is serving the current build is
separate and still open.

## D69 — The loading signal goes where the content will be — **Accepted**
*(Revised. The first version put a spinner on the clicked nav item; see the
note at the end.)*
The route skeletons from D66 only appear once the new route begins rendering.
Between the click and that moment there was still nothing: the old screen sat
unchanged, which reads as a dead control and gets clicked again — which is
exactly how it was reported.

The signal belongs in the content area. Someone who clicks "Employees" is
already looking at the space the directory will fill — putting a spinner back
on the sidebar item asks them to look away from where they are looking to find
out whether anything is happening.

So the content area is covered while a navigation runs: an overlay with a
spinner, over `<main>` only. The sidebar and topbar stay uncovered and usable,
which is the point of scoping it to that box rather than the viewport.

It is an overlay rather than a replacement, so the page underneath keeps its
height and the layout does not collapse and snap back when the new screen
arrives.

The fade is held at zero opacity for the first 150ms by the keyframe itself,
not a JavaScript timer. Most navigations here finish faster than that, and an
overlay that flashes on every quick click is its own kind of noise — it makes a
fast app look like it is struggling. A timer would do the same job with a
re-render and a cleanup to get wrong.

**A bar across the top** carries the same state for surfaces with no content
area of their own: the public site and the sign-in screens.

Both are driven by Next's `useLinkStatus()`, which is only valid inside a
`<Link>`. Each link therefore renders a marker component that reports into a
small external store, and the bar subscribes to it. The store counts rather
than flags: a prefetch and a click can overlap, and two overlapping navigations
that both cleared a boolean would hide the bar while one was still running.

The command palette pushes routes programmatically, so `useLinkStatus()` never
sees it — and that is the slowest kind of jump, the one where the palette has
already closed and nothing is left on screen. It now runs inside a transition
that reports into the same store.

The bar is indeterminate on purpose. The server never says how far along a
navigation is, and a bar that fakes it creeps to 90% and stalls, which teaches
people to distrust it. Under `prefers-reduced-motion` it stays visible and
stops moving: the signal matters more than the motion.

Verified in the production build rather than assumed — both keyframes, both
classes and both reduced-motion overrides are present in the shipped CSS. A
silently dropped keyframe would leave an overlay pinned at zero opacity, or a
bar that renders and never moves: worse than nothing, because it looks like the
app has frozen.

**Revision.** The first attempt put the spinner on the clicked item — sidebar
row, bottom-nav icon, dashboard card, table row. That was wrong for the reason
above, and the markers that drove it are now headless: they still call
`useLinkStatus()`, because it is only valid inside the `<Link>` it describes,
and they render nothing. Seven of them report; one overlay draws.

## D70 — The create paths are audited by trigger, not by remembering — **Accepted**
Every database function had called `write_audit()` since it was written. The
plain inserts behind the create UI (D60) did not: creating an employee, a
department, a position, a task, a payroll period, an office or a job left no
trace at all.

That had to be closed before the audit screen existed. An audit log that
silently omits a whole class of action is worse than no audit log, because
someone reading it concludes nothing happened.

Triggers rather than calls in the server actions. A caller can forget; a
trigger cannot, and it also covers rows created by a future import, an admin
working in the SQL editor, or a second client. Publishing a job is logged as
its own event rather than folded into a generic update, because it is the one
workspace action that puts text on the public internet.

Two bugs, both found by running rather than reading:

`plpgsql` compiles every branch of a `CASE` against the actual row type, so
`new.name` in the departments branch raised on a `jobs` row even though that
branch is never taken. Fields are now read through `to_jsonb(new)`, where a
missing key is simply NULL.

And `current_org_id()` cast `current_setting('request.jwt.claims', true)`
straight to `jsonb`. That is NULL-safe when the setting was never set, but an
empty *string* is not NULL, and `''::jsonb` raises. Nothing had reached that
path, because every caller already had claims by the time a policy ran; a
trigger on every insert reaches it immediately. It matters well beyond the
triggers — every RLS policy in the product calls this function, so an empty
claims header turned what should be a clean denial into a database error.
Returning NULL is the right answer to "which organization is this?" when there
is no usable claim, and NULL fails every policy closed exactly as an absent
claim already did.

Six new assertions, two of them mutation-tested: dropping the employees
trigger, and reverting the `current_org_id()` hardening, each fail the suite.
An insert with no session still succeeds and goes unlogged — refusing a write
because it could not be *logged* would be the tail wagging the dog, and seeds
and migrations have no session by definition.

## D71 — The audit screen has no controls, because there is nothing to offer — **Accepted**
`audit_logs` has no insert policy for any application role, and a trigger
rejects every update and delete. So the screen carries no edit, delete or
resolve control — not because they were left out, but because the product has
nothing it could truthfully put there.

It pages rather than scrolls: the log is append-only and unbounded, and it is
read by someone looking for a specific thing on a specific day. Filters plus
fifty rows answer that better than an infinite scroll nobody reaches the end
of. Ordering is by timestamp *and* id, because two entries written in the same
millisecond would otherwise come back in arbitrary order, and sequence is the
one thing an audit reader must be able to trust.

Filters submit as a plain GET form so the filtered view has its own URL. An
auditor's job includes being able to say "this is what I looked at", which
component state cannot express.

The filter options are read from the log itself rather than hard-coded, since
the set of audited actions grows whenever an audited operation is added, and a
hand-maintained list goes stale silently.

Tone is assigned by consequence rather than by module: publishing and approving
read as significant, declines and returns as negative, routine traffic as
neutral. Colouring by module would make the entire payroll section red and
teach people to stop looking at it.
