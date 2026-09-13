import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { BOARD_STAGES, stageLabel, stageTone, type Stage } from "@/lib/recruitment/model";
import { formatDate } from "@/lib/employees/display";

export const metadata = { title: "Recruitment" };

type Application = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  location: string | null;
  stage: Stage;
  created_at: string;
  job: { title: string } | null;
};

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

  const supabase = await createClient();
  const [{ data: applications, error }, { data: jobs }] = await Promise.all([
    supabase
      .from("job_applications")
      .select("id, first_name, last_name, email, location, stage, created_at, job:jobs(title)")
      .order("created_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, title, status")
      .order("created_at", { ascending: false }),
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
      <div>
        <h1 className="text-h1">Recruitment</h1>
        <p className="mt-1 text-body text-text-2">
          {openJobs} open {openJobs === 1 ? "role" : "roles"} · {rows.length}{" "}
          {rows.length === 1 ? "applicant" : "applicants"}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          heading="No applicants yet"
          body="Applications from the careers site land here. Rejected and withdrawn candidates stay on the board — the design keeps them visible and searchable rather than sweeping them away."
        />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-full gap-3" style={{ minWidth: "1200px" }}>
            {BOARD_STAGES.map((stage) => {
              const inStage = rows.filter((row) => row.stage === stage);
              return (
                <section
                  key={stage}
                  className="flex w-[190px] shrink-0 flex-col gap-2"
                  aria-label={stageLabel[stage]}
                >
                  <header className="flex items-center justify-between px-1">
                    <h2 className="text-small font-semibold">{stageLabel[stage]}</h2>
                    <span className="font-mono text-[11px] text-text-3" data-numeric>
                      {inStage.length}
                    </span>
                  </header>

                  <div className="flex min-h-[70px] flex-col gap-2 rounded-xl bg-surface p-2">
                    {inStage.length === 0 ? (
                      <p className="px-1 py-3 text-center text-[11px] text-text-3">
                        —
                      </p>
                    ) : (
                      inStage.map((row) => (
                        <Card key={row.id}>
                          <CardBody className="p-3 sm:p-3">
                            <div className="flex items-start gap-2">
                              <Avatar
                                name={`${row.first_name} ${row.last_name}`}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-small font-medium">
                                  {row.first_name} {row.last_name}
                                </p>
                                <p className="truncate text-[11px] text-text-3">
                                  {row.job?.title}
                                </p>
                              </div>
                            </div>
                            <p className="mt-2 font-mono text-[10px] text-text-3">
                              {formatDate(row.created_at)}
                            </p>
                          </CardBody>
                        </Card>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {BOARD_STAGES.map((stage) => (
          <StatusPill key={stage} tone={stageTone[stage]}>
            {stageLabel[stage]} · {rows.filter((r) => r.stage === stage).length}
          </StatusPill>
        ))}
      </div>

      <p className="text-small text-text-3">
        Moving a candidate, panel notes and converting to an employee open from
        the applicant detail screen. Hiring goes through conversion — it creates
        the employee record rather than only changing a status.
      </p>
    </div>
  );
}
