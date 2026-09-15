import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { listBalances, listLeaveTypes } from "@/lib/leave/queries";
import { BalancesTable } from "./table";

export const metadata = { title: "Leave balances" };

/**
 * Leave entitlements. Source: Phase 6 — leave.
 *
 * This screen is what makes the leave module work. `request_leave` refuses any
 * capped type when the balance is short, `leave_days_remaining` returns 0 when
 * there is no balance row, and a balance row is otherwise created only when a
 * request is finally approved. So a workspace with no entitlements set refuses
 * every annual leave request with "you have 0 days left", and nothing in the
 * product could change that answer.
 *
 * Reading is open to anyone who can see leave; setting needs
 * `leave.manage_policy`, which is what the table's own policy requires.
 */
export default async function LeaveBalancesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);
  const { year: yearParam } = await searchParams;

  const mayView =
    can(session, "leave.view_all") || can(session, "leave.view_department");

  if (!mayView) {
    return (
      <PermissionState
        module="Leave balances"
        roles={[ROLE_LABELS.management, ROLE_LABELS.hr, ROLE_LABELS.hod]}
      />
    );
  }

  const thisYear = new Date().getFullYear();
  const parsedYear = Number(yearParam);
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : thisYear;

  const [{ rows, error }, types] = await Promise.all([
    listBalances(year),
    listLeaveTypes(),
  ]);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load balances"
        body="The request failed. Your data is safe."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/${org}/leave`} className="self-start">
        <Button variant="ghost">
          <ArrowLeft aria-hidden />
          Leave
        </Button>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1">Leave balances</h1>
          <p className="mt-1 max-w-[70ch] text-body text-text-2">
            Entitlement for {year}. Days taken move only when a request is
            finally approved, so they are shown here and set nowhere.
          </p>
        </div>
        <nav className="flex gap-2" aria-label="Leave year">
          {[thisYear - 1, thisYear, thisYear + 1].map((option) => (
            <Link
              key={option}
              href={`/${org}/leave/balances?year=${option}`}
              aria-current={option === year ? "page" : undefined}
            >
              <Button variant={option === year ? "secondary" : "ghost"} size="sm">
                {option}
              </Button>
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          heading="Nobody to show"
          body="There are no active employees in what your role can see, so there are no balances to set."
        />
      ) : (
        <Card>
          <CardBody>
            <BalancesTable
              org={org}
              year={year}
              rows={rows}
              types={types}
              canManage={can(session, "leave.manage_policy")}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
