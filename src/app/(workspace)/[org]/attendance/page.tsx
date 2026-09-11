import Link from "next/link";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, EmptyState, ErrorState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { formatAccuracy, formatDistance, exceptionLabel, type ExceptionCode } from "@/lib/attendance/geofence";

export const metadata = { title: "Attendance" };

type Row = {
  id: string;
  work_date: string;
  check_in_at: string;
  check_out_at: string | null;
  attendance_type: "office" | "remote" | "uncertain";
  state: string;
  review_state: string;
  exception_codes: string[];
  check_in_accuracy_m: number | null;
  check_in_distance_m: number | null;
  employees: { first_name: string; last_name: string; employee_no: string } | null;
};

/**
 * Attendance today. Source: Phase 4, HR ATTENDANCE.
 *
 * The same page serves every role: an Employee sees their own days, an HOD
 * their department's, HR the organisation's. That difference is produced by
 * RLS, not by a branch in this file.
 */
export default async function AttendancePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  const mayView =
    can(session, "attendance.view_all") ||
    can(session, "attendance.view_department") ||
    can(session, "attendance.view_self");

  if (!mayView) {
    return (
      <PermissionState
        module="Attendance"
        roles={MODULE_ROLES.Attendance.map((role) => ROLE_LABELS[role])}
      />
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      `id, work_date, check_in_at, check_out_at, attendance_type, state,
       review_state, exception_codes, check_in_accuracy_m, check_in_distance_m,
       employees(first_name, last_name, employee_no)`,
    )
    .order("check_in_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load attendance"
        body="The request failed. Your data is safe."
      />
    );
  }

  const rows = (data ?? []) as unknown as Row[];
  const present = rows.filter((r) => r.attendance_type === "office").length;
  const remote = rows.filter((r) => r.attendance_type === "remote").length;
  const flagged = rows.filter((r) => r.review_state === "pending").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1">Attendance</h1>
          <p className="mt-1 text-body text-text-2">
            Most recent {rows.length} {rows.length === 1 ? "record" : "records"}
          </p>
        </div>
        {can(session, "attendance.check_in") ? (
          <Link href={`/${org}/attendance/check-in`} className={buttonVariants()}>
            Check in
          </Link>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Office" value={present} />
          <Stat label="Remote" value={remote} />
          <Stat label="Needs review" value={flagged} tone={flagged > 0 ? "warn" : undefined} />
          <Stat label="Records" value={rows.length} />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          heading="No attendance recorded yet"
          body="When people check in, their day appears here with the time, whether they were in the office or remote, and how accurate the position reading was."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardBody className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[160px] flex-1">
                    <p className="text-body font-medium">
                      {row.employees
                        ? `${row.employees.first_name} ${row.employees.last_name}`
                        : "Unknown employee"}
                    </p>
                    <p className="font-mono text-[11px] text-text-3">
                      {row.employees?.employee_no} · {row.work_date}
                    </p>
                  </div>

                  <div className="min-w-[140px]">
                    <p className="font-mono text-small">
                      {new Date(row.check_in_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" → "}
                      {row.check_out_at
                        ? new Date(row.check_out_at).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                    <p className="font-mono text-[11px] text-text-3">
                      {formatDistance(row.check_in_distance_m)} ·{" "}
                      {formatAccuracy(row.check_in_accuracy_m)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      tone={
                        row.attendance_type === "office"
                          ? "success"
                          : row.attendance_type === "remote"
                            ? "info"
                            : "warn"
                      }
                    >
                      {row.attendance_type === "office"
                        ? "Office"
                        : row.attendance_type === "remote"
                          ? "Remote"
                          : "Unresolved"}
                    </StatusPill>
                    {row.review_state === "pending" ? (
                      <StatusPill tone="warn">Needs review</StatusPill>
                    ) : null}
                  </div>

                  {row.exception_codes.length > 0 ? (
                    <p className="w-full text-small text-text-2">
                      {row.exception_codes
                        .map(
                          (code) =>
                            exceptionLabel[code as ExceptionCode] ?? code,
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <Card>
      <CardBody className="p-4 sm:p-4">
        <p className="text-small text-text-3">{label}</p>
        <p
          className={`mt-1 font-mono text-h2 ${tone === "warn" && value > 0 ? "text-warn-fg" : ""}`}
          data-numeric
        >
          {value}
        </p>
      </CardBody>
    </Card>
  );
}
