import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { listDepartments, listPositions } from "@/lib/employees/queries";
import { emailReadiness } from "@/lib/recruitment/pipeline";
import { CreateJob } from "./create-job";
import { PipelineBoard, type Applicant } from "./pipeline-board";

export const metadata = { title: "Recruitment" };

type Application = Applicant;

/**
 * Recruitment pipeline. Source: Phase 6.
 *
 * Rejected and withdrawn columns are shown, not hidden — the design is
 * explicit, and a funnel that quietly drops its losses misrepresents itself.
 */
export default async function RecruitmentPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  if (!can(session, "recruitment.view")) {
    return (
      <PermissionState
        module="Recruitment"
        roles={MODULE_ROLES.Recruitment.map((role) => ROLE_LABELS[role])}
      />
    );
  }

  const mayPostJobs = can(session, "recruitment.manage_jobs");

  const mayMove = can(session, "recruitment.move_pipeline");
  const mayHire = can(session, "recruitment.convert_employee");

  const supabase = await createClient();
  const [
    { data: applications, error },
    { data: jobs },
    { rows: departments },
    { rows: positions },
    emailState,
  ] = await Promise.all([
    supabase
      .from("job_applications")
      .select(
        `id, first_name, last_name, email, phone, location, cover_letter,
         stage, created_at, on_hold_at, on_hold_reason, interview_at,
         interview_location, job:jobs(title)`,
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, title, status")
      .order("created_at", { ascending: false }),
    // Needed by the job form's department picker and by the hire form.
    mayPostJobs || mayHire
      ? listDepartments()
      : Promise.resolve({ rows: [], error: false }),
    mayHire ? listPositions() : Promise.resolve({ rows: [], error: false }),
    emailReadiness(),
  ]);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load recruitment"
        body="The request failed. Your data is safe."
      />
    );
  }

  const rows = (applications ?? []) as unknown as Application[];
  const openJobs = (jobs ?? []).filter((j) => j.status === "published").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1">Recruitment</h1>
          <p className="mt-1 text-body text-text-2">
            {openJobs} open {openJobs === 1 ? "role" : "roles"} · {rows.length}{" "}
            {rows.length === 1 ? "applicant" : "applicants"}
          </p>
        </div>
        {mayPostJobs ? (
          <CreateJob
            org={org}
            departments={departments.map((d) => ({ id: d.id, label: d.name }))}
          />
        ) : null}
      </div>

      <PipelineBoard
        org={org}
        rows={rows}
        departments={departments.map((d) => ({ id: d.id, label: d.name }))}
        positions={positions.map((p) => ({
          id: p.id,
          label: p.grade ? `${p.title} · ${p.grade}` : p.title,
        }))}
        canMove={mayMove}
        canHire={mayHire}
        emailReady={emailState}
      />

    </div>
  );
}
