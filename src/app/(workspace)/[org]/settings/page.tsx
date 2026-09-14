import { requireOrg, can, canAny } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState } from "@/components/states";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import {
  getSettings,
  listOffices,
  listRoles,
  listPermissions,
} from "@/lib/settings/queries";
import { SettingsForm } from "./settings-form";
import { Offices } from "./offices";
import { RolesMatrix } from "./roles";

export const metadata = { title: "Settings" };

/**
 * Settings. Source: Phase 9 — administration.
 *
 * Opening the screen needs only a settings permission of some kind; saving
 * needs `settings.manage`, and that is enforced by the database, not here
 * (migration 0030). HR and Accounts see the values their colleagues work
 * under without being able to change them — which is more useful than hiding
 * the page, and honest about where the boundary is.
 */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  const mayOpen = canAny(
    session,
    "settings.manage",
    "settings.manage_structure",
    "settings.manage_payroll",
  );

  if (!mayOpen) {
    return (
      <PermissionState
        module="Settings"
        roles={[ROLE_LABELS.management, ROLE_LABELS.hr, ROLE_LABELS.accounts]}
      />
    );
  }

  const canEdit = can(session, "settings.manage");
  const canManageOffices = can(session, "attendance.manage_locations");
  const canSeeRoles = can(session, "roles.view");

  const [settings, offices, roles, permissions] = await Promise.all([
    getSettings(),
    listOffices(),
    canSeeRoles ? listRoles() : Promise.resolve([]),
    canSeeRoles ? listPermissions() : Promise.resolve([]),
  ]);

  if (!settings) {
    return (
      <ErrorState
        heading="Couldn't load settings"
        body="This workspace has no settings row. Re-run supabase/seed.sql, which creates one."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-h1">Settings</h1>
        <p className="mt-1 max-w-[70ch] text-body text-text-2">
          {canEdit
            ? "Changes apply to everyone in this workspace and are recorded in the audit log."
            : "Read-only. Changing these needs full settings access; your role manages its own area elsewhere."}
        </p>
      </div>

      <SettingsForm org={org} settings={settings} canEdit={canEdit} />

      <Offices
        org={org}
        offices={offices}
        canManage={canManageOffices}
        defaultRadius={settings.default_geofence_radius_m}
      />

      {canSeeRoles ? (
        <RolesMatrix roles={roles} permissions={permissions} />
      ) : null}
    </div>
  );
}
