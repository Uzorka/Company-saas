import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { RoleWithPermissions, PermissionRow } from "@/lib/settings/queries";

/**
 * Roles and what each can do.
 *
 * Read-only, and deliberately so for now. Changing a grant is not a checkbox:
 * `role_grant_requests` exists precisely because a grant touching Payroll,
 * Documents, Settings or Audit needs a written reason and a second approver,
 * and shipping a matrix of toggles that silently skipped that flow would
 * quietly remove the control the schema was built to enforce.
 *
 * So this answers the question people actually bring to a permissions screen —
 * "who can see payroll?" — without pretending to offer an edit the product has
 * not built the approval path for. See docs/BACKLOG.md.
 */
export function RolesMatrix({
  roles,
  permissions,
}: {
  roles: RoleWithPermissions[];
  permissions: PermissionRow[];
}) {
  const modules = [...new Set(permissions.map((p) => p.module))].sort();

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div>
          <h2 className="text-h3">Roles and permissions</h2>
          <p className="mt-1 max-w-[70ch] text-small text-text-2">
            What each role can reach. Permissions are the union across every
            role a person holds. Changing a grant needs a written reason and a
            second approver, so it is not editable here yet.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-small">
            <caption className="sr-only">
              Permission modules by role
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 text-left font-medium">
                  Module
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    scope="col"
                    className="px-3 py-2 text-left font-medium"
                  >
                    <span className="block">{role.name}</span>
                    {role.high_risk ? (
                      <span className="mt-1 block">
                        <StatusPill tone="warn">High risk</StatusPill>
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => {
                const inModule = permissions.filter((p) => p.module === module);
                return (
                  <tr key={module} className="border-b border-border">
                    <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                      {module}
                      <span className="ml-1.5 font-mono text-[11px] text-text-3">
                        {inModule.length}
                      </span>
                    </th>
                    {roles.map((role) => {
                      const held = inModule.filter((p) =>
                        role.permissions.includes(p.slug),
                      ).length;
                      return (
                        <td key={role.id} className="px-3 py-2.5">
                          {held === 0 ? (
                            <span className="text-text-3">None</span>
                          ) : held === inModule.length ? (
                            <span className="font-medium text-success-fg">Full</span>
                          ) : (
                            // The useful answer is "some, and how many" — a
                            // tick would say "yes" to a role holding one
                            // permission out of nine.
                            <span className="text-text-2">
                              {held} of {inModule.length}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
