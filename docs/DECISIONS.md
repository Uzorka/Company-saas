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
