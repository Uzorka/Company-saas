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
