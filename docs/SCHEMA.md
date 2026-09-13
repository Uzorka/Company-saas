# Schema

Migrations `0001` to `0007` exist and are applied. Everything below them is
still planned. The full set is grouped by the migration that creates it.

**Built:** `0001_organizations` `0002_profiles` `0003_rbac` `0004_audit`
`0005_rls` `0006_permission_catalogue` `0007_access_token_hook`
`0008_departments_positions` `0009_employees` `0010_employees_rls`
`0011_attendance` `0012_geofence` `0013_attendance_rls`
`0014_attendance_actions` `0015_storage` `0016_tasks` `0017_tasks_rls`
`0018_field_visit_actions` `0019_leave` `0020_leave_actions` `0021_leave_rls` `0022_payroll`
`0023_payroll_actions` `0024_payroll_rls`.

Two deliberate departures from the plan, both discovered while building:

* **Audit moved from `013` to `0004`.** The design requires audit writes
  alongside each module rather than retrofitted at the end, so the table has
  to exist before the first module does.
* **Settings permissions split three ways** — `settings.manage` (full, for
  Management), `settings.manage_structure` (departments and leave types, HR)
  and `settings.manage_payroll` (rates and statutory settings, Accounts).
  The design's "Some areas" scope is by subject, and a single `settings.manage`
  slug would have handed HR and Accounts each other's areas.

Conventions: every company-owned table carries `organization_id uuid not null references organizations(id)`. Money is `numeric(14,2)` plus a stored `currency_code` (default `NGN`). Decisive timestamps are `timestamptz` written by the server. Nothing is hard-deleted.

## 001_organizations
`organizations` (id, name, slug, sector, status: active|trial|setup|suspended, theme, created_at)
`organization_settings` (per-tenant configuration, incl. default geofence radius and retention values)
`offices` (organization_id, name, address, latitude, longitude, geofence_radius_m, active)
`platform_admins` (user_id) — platform scope only; no cross-tenant query exists, including for platform admins

## 002_profiles
`profiles` (id = auth.users.id, full_name, avatar_url, phone, locale)
`organization_members` (organization_id, user_id, status, joined_at) — a user may belong to several orgs

## 003_rbac
`roles` · `permissions` · `role_permissions` · `user_roles` (multi-role, union semantics)
`role_grant_requests` (requested_by, target_user, role, reason **required**, second_approver, status: requested|awaiting_second_approver|active|revoked)
Helper functions: `current_org_id()`, `has_permission(text)`, `heads_department(uuid)`, `is_self(uuid)`

## 004_departments_positions
`departments` (name, code, head_employee_id, parent_id, active)
`department_heads` (an HOD may head more than one department)
`positions` (title, department_id, grade)

## 005_employees
`employees` (employee_no, first_name, last_name, photo_url, work_email, phone, department_id, position_id, manager_id, hod_id, employment_type, employment_status, hire_date)
`employee_emergency_contacts`
`employee_compensation` (effective-dated; **separate table** so roles without payroll access are denied at table level and salary is absent from the response, not merely hidden)
`employee_documents`
`shift_patterns` · `employee_shifts` — expected start times; required to compute Late/Absent

## 006_attendance
`attendance_records` (employee_id, office_id, check_in_at, check_out_at, latitude, longitude, accuracy_m, distance_from_office_m, attendance_type: office|remote|uncertain, review_status, device_meta)
`attendance_evidence` (record_id, kind, storage_key)
`attendance_breaks`
`attendance_corrections` (new record referencing the original + mandatory reason — never an edit)
`attendance_exceptions`

## 007_tasks
`tasks` (title, description, created_by, department_id, priority, start_date, due_date, status, verification_mode: none|photo|location|photo_location|photo_location_report)
`task_assignees` · `task_comments` · `task_attachments` · `task_activity`
`task_target_locations` (name, address, latitude, longitude, allowed_radius_m, contact_person, instructions)
`field_visits` (task_id, state, latitude, longitude, accuracy_m, distance_m, submitted_at, reviewed_by, return_reason)
`field_visit_evidence`

## 008_notifications
`notifications` (recipient, kind, entity, read_at) · `announcements` (org-wide or per-department)

## 009_leave
`leave_types` · `leave_policies` · `leave_balances` · `leave_requests` · `leave_approvals` (stage, approver, note or mandatory reason, timestamps)

## 010_payroll
`payroll_periods` (status: draft|processing|review|approved|published|closed)
`salary_components` · `employee_salary_components`
`payroll_runs` (submitted_by, approved_by — constrained to differ)
`payroll_run_lines` — **immutable snapshot**; frozen by trigger once the period reaches `approved`, so a later salary change cannot alter a published payslip
`payroll_adjustments` (author, reason, amount)
`payslips`
`statutory_rates` (effective-dated; locked mid-period) · `paye_bands` (progressive, 6 bands)

## 011_recruitment
`jobs` (title, slug, department, location, employment_type, description, responsibilities, requirements, deadline, status, published_at)
`job_applications` · `application_stage_history` · `application_notes`
`applicant_conversions` (application_id → employee_id; the applicant record is kept and linked, never deleted)

## 012_documents
`documents` (name, description, category, sensitivity: company|restricted|confidential — **mandatory, no default**, retention_months)
`document_versions` · `document_access_log` (every confidential view: viewer, timestamp, reason)

## 013_audit
`audit_logs` (organization_id, actor_user_id, action, entity_type, entity_id, metadata jsonb, ip_truncated, device, created_at)
UPDATE and DELETE revoked from every role including Management; enforced by grants **and** a rejecting trigger. Reads by Management are themselves logged. Retained 7 years.

## 014_reports_support
Materialised views and indexes backing the six report families, plus `pg_cron` retention jobs (24-month photo, 12-month coordinate, 7-year audit — all configurable).
