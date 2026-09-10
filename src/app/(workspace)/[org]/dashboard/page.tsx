import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";

export const metadata = { title: "Dashboard" };

/**
 * Phase 1 placeholder. The real five-layout dashboard lands in Phase 2, once
 * roles resolve from the session. This page exists so the shell, tokens and
 * base components can be reviewed against the design in a browser — it shows
 * no fabricated statistics.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-overline uppercase text-text-3">Phase 1</p>
        <h1 className="text-h1 mt-1">Foundation</h1>
        <p className="mt-2 max-w-[68ch] text-body text-text-2">
          The shell, design tokens and base components are in place. Modules
          land from Phase 2 onward, once authentication and role resolution
          exist.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2.5">
          <StatusPill tone="success">Present</StatusPill>
          <StatusPill tone="warn">In review</StatusPill>
          <StatusPill tone="danger">Absent</StatusPill>
          <StatusPill tone="info">Remote</StatusPill>
          <StatusPill tone="mute">Not checked in</StatusPill>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </CardBody>
      </Card>

      <EmptyState
        heading="No modules yet"
        body="Employees, attendance, tasks, leave, payroll and recruitment arrive in later phases. Each ships with its own empty, filtered-empty, error and permission states."
      />
    </div>
  );
}
