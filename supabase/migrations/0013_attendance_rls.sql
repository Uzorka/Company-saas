-- 0013_attendance_rls
--
-- Attendance policies, plus the write paths.
--
-- Check-in is not an ordinary insert: the classification, the exception codes
-- and the timestamp all have to be computed server-side from the caller's own
-- identity, or an employee could record themselves as being at the office by
-- posting whatever they liked. So there is no INSERT policy on
-- attendance_records at all — the only way in is check_in(), which is
-- security definer and derives everything it can rather than accepting it.

alter table attendance_records     enable row level security;
alter table attendance_evidence    enable row level security;
alter table attendance_breaks      enable row level security;
alter table attendance_corrections enable row level security;

alter table attendance_records     force row level security;
alter table attendance_evidence    force row level security;
alter table attendance_breaks      force row level security;
alter table attendance_corrections force row level security;

-- The three scopes again. Postgres ORs them, so an HOD who is also an
-- employee sees their department and themselves.
create policy attendance_select_all on attendance_records
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('attendance.view_all'));

create policy attendance_select_department on attendance_records
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('attendance.view_department')
    and exists (
      select 1 from employees e
      where e.id = attendance_records.employee_id
        and e.department_id in (select headed_department_ids())
    )
  );

create policy attendance_select_self on attendance_records
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('attendance.view_self')
    and employee_id = my_employee_id()
  );

-- Review actions only. Times are immutable (see the trigger in 0011) and a
-- correction is a separate record, so this covers flagging and approving.
create policy attendance_review on attendance_records
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('attendance.review'))
  with check (organization_id = current_org_id() and has_permission('attendance.review'));

-- Deliberately no INSERT and no DELETE policy. Records are created by
-- check_in() and never removed.

-- Visibility follows the parent record — the policies above already decide who
-- may see it, so this cannot widen access to a selfie. The explicit tenant
-- check is belt and braces: inheriting isolation from a join is correct but
-- invisible, and a future change to the parent policy should not be able to
-- silently widen this one.
create policy attendance_evidence_select on attendance_evidence
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_evidence.attendance_record_id
    )
  );

create policy attendance_breaks_select on attendance_breaks
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_breaks.attendance_record_id
    )
  );

create policy attendance_breaks_own on attendance_breaks
  for all to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_breaks.attendance_record_id
        and r.employee_id = my_employee_id()
    )
  )
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_breaks.attendance_record_id
        and r.employee_id = my_employee_id()
    )
  );

-- Corrections are visible to whoever can see the record they correct, and
-- writable only with attendance.review. No update, no delete: a correction is
-- itself a historical fact.
create policy attendance_corrections_select on attendance_corrections
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_corrections.attendance_record_id
    )
  );

create policy attendance_corrections_insert on attendance_corrections
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('attendance.review')
    and corrected_by = auth.uid()
  );

grant select on attendance_records, attendance_evidence, attendance_breaks,
                attendance_corrections
  to authenticated;
grant update on attendance_records to authenticated;
grant insert, update, delete on attendance_breaks to authenticated;
grant insert on attendance_corrections to authenticated;
