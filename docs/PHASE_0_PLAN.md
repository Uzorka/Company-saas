# Phase 0 — Design Inspection & Technical Implementation Plan

**Product:** Company Management SaaS (working tenant: *CHF Heron Nigeria*, FMCG distribution, Lagos)
**Design source of truth:** `design/project/` — 9 Claude Design files, read in full
**Status:** Planning only. No application code written. Phase 1 awaits approval.

---

## 0.1 What was inspected

| File | Covers |
|---|---|
| `Developer Handoff.dc.html` | Master spec — tokens, routes, permissions, 15 screen specs, 15 components, nav, breakpoints, forms, 16 animations, 8 workflows, 5 dashboards, build order, open items |
| `Phase 1 - Design System.dc.html` | Foundations, controls, data display, navigation, overlays, verification UI, states, mobile, a11y |
| `Phase 2 - Public Website.dc.html` | Home, about, services, leadership, careers, job detail, contact, login, footer, application flow states |
| `Phase 3 - Auth and App Shell.dc.html` | 4 auth screens + session expiry + permission-denied + onboarding + profile; app shell; per-role sidebar `NAV`; 5 dashboards with exact KPI sets; mobile shell |
| `Phase 4 - Employees, Departments, Attendance.dc.html` | Directory, dept list/detail, 13-state check-in machine (`CI`), HR attendance today, location settings, profile slide-over, attendance detail, correction dialog, create employee |
| `Phase 5 - Tasks, Field Visits, Leave.dc.html` | Task board/list, task detail, 13-state field-visit machine (`FV`), HOD evidence review, leave balance/request/approvals/calendar |
| `Phase 6 - Payroll, Recruitment, Documents.dc.html` | 6-status payroll run, period detail, adjustments, publish confirm, payslips, jobs, 8-stage pipeline, applicant detail, convert-to-employee, documents + sensitivity, doc preview, restricted state |
| `Phase 7 - Reports, Settings, Admin.dc.html` | 6 report families with exact KPIs/series/tables, settings (company, offices, structure, rates, security), role cards + 10×5 matrix, audit log + detail, platform admin |
| `Phase 8 - Motion, Responsive, Prototype.dc.html` | 16 animations with reduced-motion fallbacks, 5 device breakpoints with per-device rules, 12 clickable end-to-end flows, final inventories |
| `support.js` | Claude Design prototype runtime only (`<x-dc>`, `sc-for`, `{{ }}`, `DCLogic`). **Contains no product logic — nothing to port.** |

**Tally confirmed by the design:** 58 screens · 15 components · 8 workflows · 16 animations · 5 breakpoints.

---

## 0.2 Complete screen inventory (58)

### Public website — 5 (Phase 2)
1. Home · 2. About · 3. Services · 4. Careers list · 5. Contact
*(Leadership is a section of About; Job detail is counted under Recruitment's public surface in the design's own numbering.)*

### Auth — 4 (Phase 3)
6. Sign in (company code + email + password) · 7. Forgot password · 8. Reset password · 9. Workspace picker
Plus specified non-counted states: session expired, permission denied, account setup, profile.

### Dashboards — 5 (Phase 3)
10. Management · 11. HR · 12. Accounts · 13. HOD · 14. Employee — one route, five layouts.

### Employees & departments — 4 (Phase 4)
15. Directory · 16. Employee profile (slide-over: personal / employment / documents / attendance) · 17. Create employee · 18. Departments list + detail

### Attendance — 4 (Phase 4)
19. Attendance today (HR) · 20. Attendance history + corrections · 21. Check-in capture (13 states) · 22. Exceptions / attendance detail + correction dialog

### Tasks & field visits — 5 (Phase 5)
23. Task board (Kanban) · 24. Task list · 25. Task detail · 26. Field-visit capture (13 states) · 27. HOD evidence review queue

### Leave — 4 (Phase 5)
28. Leave balance + own requests · 29. Request leave form · 30. Approvals queue · 31. Leave calendar (+ leave detail drawer)

### Payroll — 4 (Phase 6)
32. Period list · 33. Run detail (6-status pipeline, totals, per-employee rows) · 34. Adjustments ledger + add-adjustment · 35. Publish confirmation

### Payslips — 2 (Phase 6)
36. Payslip list · 37. Payslip document (A4 print layout)

### Recruitment — 5 (Phase 6)
38. Jobs table · 39. New/edit job · 40. Pipeline board (8 stages) · 41. Applicant slide-over (profile, CV, notes, timeline) · 42. Convert to employee

### Documents — 2 (Phase 6)
43. Library (grid, 3 sensitivity levels) · 44. Preview drawer

### Reports — 6 (Phase 7)
45. Management · 46. HR · 47. Payroll · 48. Tasks · 49. Recruitment · 50. Attendance

### Settings — 4 (Phase 7)
51. Company profile + offices/geofences · 52. Structure (departments, leave types) · 53. Payroll rates · 54. Security & retention

### Roles & audit — 2 (Phase 7)
55. Roles + 10×5 permission matrix (+ grant-role confirm) · 56. Audit log + detail drawer

### Platform admin — 2 (Phase 7)
57. Organisation list · 58. Organisation detail

---

## 0.3 Complete route map

The design specifies **three surfaces**. Recommendation: **one Next.js app**, route groups + middleware, domains attachable later on Vercel without code change.

### Public — `chfheron.com`
| Route | Purpose | Access |
|---|---|---|
| `/` | Company home | Public |
| `/about` | History, leadership, coverage | Public |
| `/services` | Distribution, warehousing, trade marketing | Public |
| `/careers` | Open roles list | Public |
| `/careers/[slug]` | Role detail + application form | Public |
| `/contact` | Enquiry form, offices, map | Public |

### Auth — `app.heron.app/auth`
| Route | Purpose | Access |
|---|---|---|
| `/auth/login` | Company code, email, password | Unauthenticated |
| `/auth/forgot` | Request reset link | Unauthenticated |
| `/auth/reset/[token]` | Set new password | Unauthenticated |
| `/auth/workspace` | Pick workspace when user has several | Authenticated |

### Workspace — `app.heron.app/[org]`
| Route | Purpose | Access |
|---|---|---|
| `/[org]/dashboard` | Role-specific landing | All roles, content differs |
| `/[org]/employees` | Directory | HR, Management full · HOD dept |
| `/[org]/employees/[id]` | Profile | HR, Management · HOD dept · self |
| `/[org]/employees/new` | Create employee | HR, Management |
| `/[org]/departments` | Departments, heads, headcount | HR, Management · HOD own |
| `/[org]/attendance` | Today + exceptions | HR, Management · HOD dept · Employee own |
| `/[org]/attendance/history` | History + corrections | same |
| `/[org]/attendance/check-in` | Location → selfie capture | Every role, for themselves |
| `/[org]/tasks` | Board / list | HOD full · Employee own |
| `/[org]/tasks/[id]` | Detail, proof requirement, activity | HOD · assignee |
| `/[org]/tasks/[id]/verify` | Field-visit capture | Assignee only |
| `/[org]/leave` | Balance + own requests | All roles |
| `/[org]/leave/approvals` | Approval queue by wait time | HOD, HR |
| `/[org]/payroll` | Period list, current run | Accounts, Management |
| `/[org]/payroll/[period]` | Run detail, adjustments, rows | Accounts, Management |
| `/[org]/payslips` | Published payslips | Accounts, Management all · Employee own |
| `/[org]/payslips/[id]` | Document, print, PDF | Accounts, Management · owner |
| `/[org]/recruitment` | Jobs + pipeline board | HR, Management |
| `/[org]/recruitment/applicants/[id]` | Profile, CV, notes | HR, Management |
| `/[org]/documents` | Library, 3 sensitivity levels | All roles, scoped |
| `/[org]/reports` | Six report families | Management, HR, Accounts, HOD scoped |
| `/[org]/settings` | Company, structure, payroll, security | Management full · HR/Accounts by area |
| `/[org]/settings/roles` | Role list + permission matrix | Management |
| `/[org]/audit` | Immutable activity log | Management read-only |
| `/[org]/notifications` | Notification centre | All roles |

### Platform admin — `admin.heron.app`
| Route | Purpose | Access |
|---|---|---|
| `/admin/organisations` | Tenant list with status | Platform owner |
| `/admin/organisations/[id]` | Tenant detail, configuration | Platform owner |

> **Deviation from the build prompt, deliberate:** the prompt lists `/dashboard/employees`, `/dashboard/payroll`, etc. The approved design uses **org-scoped roots** (`/[org]/employees`). The design wins — the `/dashboard/*` prefix would bake single-tenancy into every URL and break the org switcher that Phase 3 shows in the topbar from day one.

---

## 0.4 Reusable component inventory (15 approved components)

| # | Component | Variants | States | Hard rules from design |
|---|---|---|---|---|
| 1 | **Button** | primary, secondary, ghost, destructive, icon-only · sm 30 / md 38 / lg 44 | default, hover, active, focus, disabled, loading | One primary per view. Destructive never default focus. Icon-only needs `aria-label`. |
| 2 | **Input & field** | text, textarea, select, date, search, file, checkbox, radio, toggle, slider | default, focus, filled, error, disabled, read-only | Persistent label always. Placeholder is an example, never a label. 38px desktop / 44px mobile. |
| 3 | **Table** | sticky header, sortable, row select, bulk bar, row action, pagination · 44 comfortable / 36 compact | default, hover, selected, sorted, empty, loading | Becomes **cards** under 640px. Never horizontally scrolled on a phone. |
| 4 | **Card** | stat, record, kanban, document, role · e1 resting / e2 hover | default, hover, selected, dragging | Sensitivity tint applies to the **whole card**, not just a badge. |
| 5 | **Status pill** | 5 semantic states, pill radius, 11px/600 | static | Colour **+ glyph + word**, always all three. |
| 6 | **Avatar** | 24 / 32 / 40px, initials or photo, presence dot, stacked +n | default, presence, stacked | Initials = 2 chars on `brand-50` with `brand-700` ink. |
| 7 | **Slide-over** | 480px desktop / 80% tablet / full-screen mobile · e4 | entering, open, exiting | Esc + scrim close. Focus returns to trigger row. List stays visible behind. |
| 8 | **Dialog** | confirm, destructive, irreversible · max 460px · e4 | entering, open, exiting | Focus trap. Destructive puts the **safe** action first. Irreversible restates the consequence. |
| 9 | **Bottom sheet** | filters, actions · max 88vh | entering, open, dragging, exiting | Phone only. Same options, same order as the desktop toolbar. |
| 10 | **Toast** | success, info · bottom-right desktop / top mobile | entering, visible, paused, exiting | Auto-dismiss 5s, pause on hover, stack to 3 then collapse to a counter. **Never** for errors needing a decision. |
| 11 | **Timeline** | approval chain, audit trail, run status | done, active, todo | Active node pulses. Shows how long a stage has waited. |
| 12 | **Capture panel** | camera stage, location bar, accuracy readout, CTA | requesting, ready, capturing, success, denied, poor accuracy, offline | **Camera only, no gallery.** Location read at the action. Accuracy always in metres. |
| 13 | **Evidence viewer** | photo tiles, static map with pin + radius, accuracy, timestamps | default, zoomed, missing evidence | Accept or return for re-capture, with a **mandatory reason** on return. |
| 14 | **Empty / error / permission** | empty, filtered-empty, error, permission-restricted | static | Each names a cause and offers a recovery action. Never a dead end. |
| 15 | **Nav shell** | sidebar (186 / 58 collapsed), topbar, breadcrumb, bottom nav, command palette | expanded, collapsed, mobile | Role-filtered. **Restricted items stay visible with a lock.** ⌘K everywhere. |

**shadcn/ui mapping.** 1–8, 10 map onto shadcn primitives (Button, Input/Form, Table, Card, Badge, Avatar, Sheet, Dialog, Sonner) **retokenised to the Heron palette** — shadcn's default neutral/zinc tokens are replaced wholesale, not extended. 9 (bottom sheet) is `Sheet side="bottom"` with drag. 11 (timeline), 12 (capture panel), 13 (evidence viewer), 14 (state blocks) have **no shadcn equivalent** and are built from scratch against the Phase 1/4/5 specs. 15 is custom — shadcn's sidebar defaults (256/48px) do not match the approved 186/58px.

---

## 0.5 Role-to-screen access matrix

The design's 10 modules × 5 roles, verbatim (`▲` = carries salary, personal or audit data):

| Module | Management | HR | Accounts | HOD | Employee |
|---|---|---|---|---|---|
| Employees | Full | Full | Read | Dept only | None |
| Attendance | Full | Full | Read | Dept only | Own only |
| Tasks | Full | Read | None | Full | Own only |
| Leave | Approve | Approve | Read | Approve | Own only |
| ▲ Payroll | Full | **None** | Full | None | Own only |
| Recruitment | Full | Full | None | Dept only | None |
| ▲ Documents | Full | Full | Read | Dept only | Own only |
| Reports | Full | Read | Read | Dept only | None |
| ▲ Settings | Full | Some areas | Some areas | None | None |
| ▲ Audit | Read | None | None | None | None |

**Six scopes, not five.** `Own only` is a *different* scope, not a weaker `Read` — an Employee sees their own payslip inside a module they otherwise cannot open. `Some areas` is scoped **by subject, not department**: HR owns departments and leave types; Accounts owns payroll rates and statutory settings; neither can open the other's.

**Screen-level access** follows the route table in §0.3. Two design rules override the usual approach:
- **Restricted, not hidden.** A module a role cannot open **stays in the sidebar with a lock glyph**. Clicking it shows the permission state naming which roles can access it and how to request it — never a 404, never a silently removed nav item.
- **No role is hardcoded in a component.** Every gate resolves through the permission layer.

**Per-role sidebar** (exact, from Phase 3 `NAV`):
- Management — Dashboard, Employees, Departments, Attendance, Tasks, Leave, Payroll, Recruitment, Reports, Audit, Settings
- HR — Dashboard, Employees, Departments, Attendance, Leave, Recruitment, Documents, Reports, Settings
- Accounts — Dashboard, Payroll, Payslips, Employees, Reports, Settings
- HOD — Dashboard, My department, Attendance, Tasks, Field visits, Leave, Reports
- Employee — Dashboard, Check in, My tasks, Leave, Payslips, Documents, Notifications

Mobile bottom nav is **four items maximum**: Home, Attendance, Tasks, More. The sidebar does not exist under 640px, and a hamburger drawer recreating it is explicitly forbidden.

---

## 0.6 Proposed database entity list

Every company-owned table carries `organization_id`. All money is `numeric(14,2)` + `currency_code`. All decisive timestamps are `timestamptz` written by the **server**, never the client.

**Tenancy & identity**
`organizations` · `organization_settings` · `offices` (lat, lng, `geofence_radius_m`, active) · `profiles` (1:1 `auth.users`) · `organization_members` (user ↔ org, status) · `platform_admins`

**RBAC**
`roles` · `permissions` · `role_permissions` · `user_roles` (multi-role; effective permissions = union) · `role_grant_requests` (reason, second approver, status — the design requires a **second approver** for any grant touching Payroll / Documents / Settings / Audit)

**People & structure**
`departments` (head, parent, active) · `department_heads` (an HOD may head several) · `positions` · `employees` (employee_no, names, photo, work email, phone, dept, position, manager, employment type/status, hire date) · `employee_emergency_contacts` · `employee_compensation` (effective-dated) · `employee_documents` · `shift_patterns` + `employee_shifts` *(required by the design — "Late" is computed against an expected start; Phase 4 shows a 09:00 sales shift and an 08:00 warehouse shift)*

**Attendance**
`attendance_records` (check-in/out time, lat, lng, `accuracy_m`, `distance_from_office_m`, `attendance_type` office|remote|uncertain, office_id, review status, device meta) · `attendance_evidence` (selfie object key, kind) · `attendance_breaks` *(the design's "Start a break" action)* · `attendance_corrections` (new record referencing the original + mandatory reason — **never an edit**) · `attendance_exceptions`

**Tasks & field visits**
`tasks` (verification_mode: none|photo|location|photo_location|photo_location_report) · `task_assignees` · `task_comments` · `task_attachments` · `task_activity` · `task_target_locations` (name, address, lat, lng, allowed radius, contact, instructions) · `field_visits` (state, distance, accuracy, submitted/verified/returned + reason) · `field_visit_evidence`

**Leave**
`leave_types` · `leave_policies` · `leave_balances` · `leave_requests` · `leave_approvals` (stage, approver, note/reason, timestamps)

**Payroll**
`payroll_periods` (6 statuses) · `salary_components` · `employee_salary_components` · `payroll_runs` · `payroll_run_lines` (**immutable snapshot** — a later salary change must never alter a published payslip) · `payroll_adjustments` (author + reason) · `payslips` · `statutory_rates` (effective-dated; PAYE progressive bands, pension 8%/10%, NHF 2.5% — all configurable, locked mid-period) · `paye_bands`

**Recruitment**
`jobs` (slug, published state) · `job_applications` · `application_stage_history` · `application_notes` · `applicant_conversions` (links applicant → created employee; applicant record kept, never deleted)

**Documents, comms, audit**
`documents` (mandatory `sensitivity`: company|restricted|confidential, no default) · `document_versions` · `document_access_log` (every confidential view) · `notifications` · `announcements` (org-wide or per-department) · `audit_logs` (org, actor, action, entity_type, entity_id, metadata, truncated IP, device, timestamp) · `retention_policies`

**~55 tables across 14 migrations** (`001_organizations` … `014_reports_support`, per the prompt's ordering).

---

## 0.7 Supabase Storage bucket plan

| Bucket | Public | Contents | Access rule |
|---|---|---|---|
| `public-assets` | ✅ | Logos, marketing imagery, leadership photos | Public read; write = Management |
| `employee-documents` | ❌ | Contracts, IDs, certificates | Own file, or HR/Management; HOD dept only |
| `attendance-selfies` | ❌ | Check-in selfies | Subject, their line manager, HR, Management. **Signed URLs only, short TTL.** 24-month retention |
| `applicant-documents` | ❌ | CVs, supporting files | HR, Management. Every view logged; marked confidential |
| `task-attachments` | ❌ | Task files | Task participants + HOD of the owning department |
| `field-visit-evidence` | ❌ | Visit photos | Assignee, HOD, HR, Management |
| `company-documents` | ❌ | Library, scoped by sensitivity | By document sensitivity + role |
| `payslips` | ❌ | Generated payslip PDFs (if server-rendered) | Owner, Accounts, Management |

Every bucket except `public-assets` is private, path-prefixed `{organization_id}/…`, guarded by storage RLS **and** validated server-side for size/MIME. No permanent public URL is ever issued for private objects. Browser-side validation is a convenience, never the control.

---

## 0.8 RLS strategy

1. **Org isolation is the outermost gate.** Every company table has `organization_id NOT NULL` and a policy requiring it to match the caller's active org. There is no cross-tenant query in the product — *including for platform admins* (the design states this explicitly).
2. **Claims in the JWT, not a subquery per row.** A Supabase **custom access token hook** stamps `organization_id`, `role_slugs[]` and `permission_slugs[]` into the token at sign-in and on org switch. Policies read `auth.jwt()`, so they stay index-friendly instead of joining `user_roles` on every row.
3. **Permission-level, not role-level, policies.** Policies test `has_permission('attendance.view_all')`, never `role = 'hr'`. Scope narrowing happens in SQL: `view_all` → whole org; `view_department` → departments the user heads; `view_self` → own employee row.
4. **Helper functions**, `security definer`, `search_path` pinned: `current_org_id()`, `has_permission(text)`, `heads_department(uuid)`, `is_self(uuid)`. Written once in `003_rbac`; never reimplemented in a policy.
5. **No `authenticated = true` policy on any sensitive table.** Default deny; every table gets explicit per-command policies. Verified by an automated RLS audit test in Phase 10.
6. **Audit is append-only at the database level.** `audit_logs` gets INSERT for the service path only; UPDATE and DELETE are **revoked from every role including Management** — enforced by grants + a rejecting trigger, not by application discipline. Management's reads of the audit log are themselves logged.
7. **Payroll separation of duties in SQL.** A constraint prevents `approved_by = submitted_by` on a run. `payroll_run_lines` become immutable once the period is `approved` (trigger). Publication is irreversible; corrections become next-period adjustments.
8. **Employee data minimisation.** Salary columns live in `employee_compensation`, not `employees`, so a role without payroll access is denied at the table level and salary fields are *absent from the response*, not merely hidden in the UI.
9. **Storage RLS mirrors table RLS**, keyed on the `{organization_id}/` path prefix.
10. **Server-side authorisation is independent of RLS**, not a substitute for it: every mutation runs through a server action / route handler that re-checks permission with Zod-validated input. Two layers, both required.

---

## 0.9 Implementation phase plan

The design's own build order (§13 of the handoff) puts **attendance second**, ahead of employees — because the verification loop is the reason the product exists and real field data should be arriving while the rest is written. That conflicts with the prompt's phase list, which puts employees third and attendance fourth. **Recommendation: follow the design's order.** Employees/departments are needed *as a data dependency* for attendance, so the resolution is to build the employee **record** in Phase 3 and the employee **screens** in Phase 4 — attendance can then land immediately after.

| Phase | Scope | Exit criteria |
|---|---|---|
| **1** | Next.js + TS strict, Tailwind retokenised to Heron, shadcn retheme, Motion, Supabase clients, env structure, public shell, app shell (186/58 sidebar, topbar, breadcrumb, bottom nav, ⌘K), all 15 base components, the 4 universal states, design tokens | Lint + typecheck + build clean; component gallery renders every variant |
| **2** | Organizations, profiles, org members, auth (login with company code, forgot, reset, workspace picker, session expiry, lockout at 3/15min), roles, permissions, user_roles, role_permissions, **custom access token hook**, RLS foundation, authorisation helpers, protected routes, permission-state screens, audit foundation | Five seeded roles sign in; a cross-tenant read is refused by RLS in a test |
| **3** | Departments, positions, employees, compensation (effective-dated), emergency contacts, documents, HOD relationships, shift patterns, directory + search + filters, profile slide-over, create employee | HOD sees only their department; salary columns absent for non-payroll roles |
| **4** | Offices + configurable geofence, check-in (all 13 `CI` states), check-out, GPS + accuracy handling, selfie capture panel, office/remote/uncertain classification, history, HR attendance dashboard, review, corrections, exceptions, audit | Geofence + accuracy unit tests pass; every exception state reachable and recoverable |
| **5** | Tasks, comments, attachments, Kanban, 5 verification modes, target locations, field-visit capture (all 13 `FV` states), evidence viewer, HOD review queue, return-with-reason, notifications | A visit can be submitted, returned and re-captured with the original preserved |
| **6** | Leave types, policies, balances, requests, HOD → HR approval chain, coverage warning, calendar, timeline component, notifications, audit | Balance moves only on final approval; approval history complete |
| **7** | Salary components, periods, 6-status pipeline, calculation (numeric, in SQL), adjustments, separation of duties, approval, publication, payslips, A4 print layout, CSV export | Accounts cannot approve its own run; a published payslip is unchanged by a later salary edit |
| **8** | Public website + content layer, careers, job detail, application form, private CV storage, jobs admin, 8-stage pipeline, applicant detail, convert-to-employee | Public application lands in the pipeline; conversion links and preserves the applicant record |
| **9** | 6 report families, roles UI + matrix + grant flow with second approver, permissions UI, company/office/attendance/payroll/security settings, audit log UI, platform admin foundation | Every block on a report tab shares one time scope; a flagged-module grant cannot complete with one person |
| **10** | Responsive QA across the 5 designed devices, security + RLS audit, a11y, performance, seed data, unit + integration + E2E, Vercel + Supabase deployment, docs | The 14 MVP-ready criteria all pass |

Quality gate after every phase: lint, `tsc --noEmit`, unit tests, integration tests, production build. No phase closes with a critical failure.

---

## 0.10 Genuine technical conflicts between the approved design and the stack/brief

These are real, and each needs your decision. None are style preferences.

### C1 — Geofence default: brief says 10 m, design says 150 m ⚠️ *highest impact*
The build prompt sets a **10 metre** default radius. The approved design sets **150 m** (slider default), with configured offices at 150/200/180/120 m and a warning outside **25–250 m**. The design is also the technically correct one: consumer phone GPS typically resolves ±5–20 m in the open and far worse beside a warehouse wall, so a 10 m fence would classify most genuine office arrivals as *remote* or *uncertain*. **Recommendation: implement the design — default 150 m, per-office configurable, warn outside 25–250 m.** The prompt's own "don't pretend 10-metre geolocation is accurate" instruction supports this.

### C2 — Dark mode: brief requires it, design forbids shipping it
The prompt's MVP-ready list includes "Dark mode works." The design states the dark ramp is authoritative for surfaces and ink but **per-screen dark treatments were never designed — "do not invent them. Ship light-only and schedule dark as its own phase."** These cannot both hold. **Recommendation: build with CSS custom properties and a `data-theme` hook so dark is a token swap later, ship light-only, and drop dark mode from the MVP-ready criteria.** Inventing 58 screens of dark treatment is exactly the redesign the prompt forbids.

### C3 — Route shape: `/dashboard/*` vs `/[org]/*`
Covered in §0.3. The design's org-scoped routes win; the prompt's route list needs updating rather than the design.

### C4 — Out-of-range field visits: design blocks, brief records-and-flags
The design says **"Out of range blocks capture"** and range is checked *before the camera opens*. The prompt says to capture and flag. Blocking is the stronger anti-fraud position and it is what was approved. **Recommendation: block capture out of range, per the design — but log the blocked attempt** so a genuine pin error is visible to the HOD rather than silent.

### C5 — Company code in a Supabase Auth login
Supabase Auth authenticates on email + password; it has no concept of a company code. The design's login has three fields and remembers the code. **Resolution: the company code resolves an org slug client-side before sign-in and scopes the post-login redirect and the workspace picker — it is a routing hint, not a credential.** No security is derived from it. Worth confirming you're happy with that framing.

### C6 — Static map with pin and accuracy circle
The evidence viewer, check-in screens and contact page all show a static map with a pin and a radius circle. **No tile provider is specified anywhere in the design pack, and none is free at scale.** Needs a decision: Mapbox static images, Google Static Maps, or a self-hosted/OSM tile source. Cost and CSP both depend on it. This is the single most concrete missing input.

### C7 — Offline queueing on Vercel + App Router
The design promises, in user-facing copy, that check-in and visit capture **queue offline and sync later**. That requires a service worker plus an IndexedDB outbox plus idempotent server endpoints — real work, and it interacts awkwardly with Next.js App Router's default caching. The design scopes it correctly (check-in and visit capture only; everything else says it needs connectivity). **Recommendation: build it in Phase 4 rather than retrofitting, and treat the promise in the copy as a requirement, not a nicety** — that copy is shown to field staff before they need it.

### C8 — Payslip PDF
The design shows "Download PDF" and requires a one-page, greyscale-safe A4 layout. **Recommendation for MVP: a print stylesheet (`@media print`) plus the browser's print-to-PDF**, which meets the greyscale and A4 requirements exactly and adds no dependency. Server-side PDF generation (and the `payslips` bucket) becomes a Phase 7+ enhancement if banks require a signed document.

### C9 — PAYE is progressive over 6 bands
The settings screen shows "PAYE · Progressive, per FIRS bands · 6 bands." That is a band table with effective dates, not a percentage. The demo figures in the design (12% flat) are illustrative only. **The rates must be configurable data, and the app must not present its calculation as tax advice** — the prompt already excludes statutory filing from MVP, and I will keep that boundary visible in the UI.

### C10 — "Selfie matches the profile photo"
One HR review string in Phase 4 reads *"Selfie matches the profile photo."* Taken literally that implies face recognition, which is a materially different product (biometric data under the Nigeria Data Protection Act, and the design's own principle says this is **operational evidence, not forensic proof**). **Reading it as a human reviewer's note, not an automated match. Confirm.** No face-matching will be implemented unless you say otherwise.

### C11 — Second-approver workflow for role grants
The design requires a written reason **and a second approver** for any grant touching Payroll, Documents, Settings or Audit — HR seconds Accounts and Management grants. The prompt's RBAC tables have no place to store that. Added as `role_grant_requests` in §0.6. It is a stateful workflow, not a checkbox.

### C12 — 2FA required for Management and Accounts
Phase 7 security settings list 2FA as **Required** for those two roles, plus a 10-character password minimum and 3-attempt/15-minute lockout. The prompt doesn't mention any of it. Supabase Auth supports TOTP MFA. **Recommendation: implement lockout and password policy in Phase 2; enforce MFA for those roles in Phase 2 as well** — retrofitting an auth requirement after roles ship is painful.

### C13 — Shift patterns are implied but unspecified
"Late" and "Absent" both depend on an expected start time per employee (Phase 4 shows a 09:00 sales shift and an 08:00 warehouse shift). No shift-pattern screen was designed. **Recommendation: build `shift_patterns` + `employee_shifts` as data with a minimal admin surface under Settings → Structure, and flag the missing screen to design.**

### C14 — shadcn/ui defaults vs the approved system
shadcn ships its own neutral scale, 256px sidebar, 40px controls and radius conventions — none of which match the Heron tokens (186/58px sidebar, 38/44px controls, the five named radii). **shadcn will be used as unstyled behaviour + a11y primitives with its theme layer fully replaced.** That is the intended use, but it means the components will not look like stock shadcn, by design.

### C15 — Retention jobs need a scheduler
24-month photo retention, 12-month coordinate retention and 7-year audit retention need scheduled deletion. Vercel Cron or `pg_cron` in Supabase. **Recommendation: `pg_cron`,** so retention runs next to the data and cannot be skipped by a deploy. Values configurable, changes requiring a written policy note, per the design's open item.

### C16 — Design's build order vs the prompt's phase order
Resolved in §0.9 (record in Phase 3, attendance in Phase 4). Noting it so the deviation is deliberate and visible.

---

## 0.11 Missing files or information — needed before or during development

**Blocking Phase 1**
1. **Where does this application live?** The repository `uzorka/uzorka`, branch `claude/zen-noether-h3qcee`, currently contains an **unrelated Vite/React "Bible Explained" application** (plus a Capacitor Android wrapper) at its root. There is no Next.js project here. Options: (a) a fresh repository, (b) a subdirectory such as `apps/company-management/` in this one, or (c) replacing the root contents. Phase 0 documentation and the design pack are committed under `docs/` and `design/` where nothing collides, but Phase 1 cannot scaffold until you choose. **Recommendation: a fresh repository** — the two products share nothing, and the existing Android/Vercel config would fight a Next.js app at the same root.
2. **Supabase project + credentials** — project URL, anon key, service-role key (server-only), and whether one project serves dev and prod or two. `.env.example` will be committed; no real credential ever will be.
3. **Map tile provider** (C6) — needed the moment the capture panel is built.

**Blocking Phase 8 (public website)**
4. **Real company content** — is *CHF Heron Nigeria* the actual client, or a design placeholder? Needed: legal name, registered details, real services copy, leadership names/titles/photos, office addresses and coordinates, client logos (with permission), contact desks, and the production domain(s). Everything in the design is plausible-but-invented sample content and **must not ship as fact**.
5. **Logo and brand assets** — the design uses a single `H` monogram on `brand-600`. Needs real files (SVG preferred) and a favicon set.

**Needed for Phase 4 / Phase 7**
6. **Real office coordinates and radii** for each site (the design's four are sample values).
7. **Shift patterns and expected start times** per department (C13).
8. **Attendance policy** — what counts as late, what happens to a missed check-out, whether remote check-in is allowed for all roles or only field staff.
9. **Current statutory rates** and the PAYE band table you want seeded (C9), plus confirmation that the pension 8%/10% and NHF 2.5% figures in the design are current.
10. **Leave policy specifics** — the design seeds Annual 20d (1.67/mo accrual), Sick 10d (certificate at 3+ days), Compassionate 5d, Maternity 16 weeks, Unpaid uncapped. Confirm these are the client's real policy.

**Design gaps — no screen exists**
11. Notifications centre (Phase 3 shows a bell with a count and the Employee sidebar has a Notifications item; no screen was designed).
12. Announcements composer (the brief requires it; the design shows announcements only as dashboard content).
13. Shift-pattern administration (C13).
14. Employee org chart (listed in the Phase 8 screen inventory as an Employees screen, but not designed anywhere).

Per the design's own rule — *"If a new requirement doesn't fit one of these components, that is a design question — raise it rather than inventing a variant"* — I will build 11–14 from existing approved components only, and flag them for a design pass rather than inventing new patterns.

**Open items the design explicitly refuses to resolve in code** (build the stated default, leave the alternative reachable): biometric check-in offered on second sign-in; same-period payroll reversal not built (data model able to represent it); retention 24/12 months as configurable defaults pending legal counsel; dark mode not shipped; offline depth limited to check-in and visit capture.

---

## 0.12 What I will not do

- Not redesign anything. Where the design and the brief disagree, the conflict is listed above for your decision rather than silently resolved.
- Not invent dark-mode treatments, new components, or screens that weren't designed.
- Not ship fake buttons, placeholder statistics, or TODO functionality presented as complete.
- Not commit real credentials, and not present payroll output as statutory compliance advice.
