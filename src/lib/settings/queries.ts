import "server-only";
import { createClient } from "@/lib/supabase/server";

export type OrgSettings = {
  organization_id: string;
  default_geofence_radius_m: number;
  currency_code: string;
  timezone: string;
  session_timeout_minutes: number;
  failed_login_limit: number;
  lockout_minutes: number;
  password_min_length: number;
  selfie_retention_months: number;
  coordinate_retention_months: number;
  audit_retention_years: number;
  email_from_name: string | null;
  email_from_address: string | null;
  email_reply_to: string | null;
};

export type OfficeRow = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
};

export type RoleWithPermissions = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  high_risk: boolean;
  is_system: boolean;
  permissions: string[];
};

export async function getSettings(): Promise<OrgSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("*")
    .maybeSingle();
  return (data as OrgSettings) ?? null;
}

export async function listOffices(): Promise<OfficeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("offices")
    .select("id, name, address, latitude, longitude, geofence_radius_m")
    .order("name");
  return (data ?? []) as OfficeRow[];
}

/**
 * Roles with the permission slugs each holds.
 *
 * Two queries and a join in memory rather than a nested select: there are five
 * roles and sixty permissions, so the join is trivial, and doing it here keeps
 * the shape obvious instead of unpacking PostgREST's nesting.
 */
export async function listRoles(): Promise<RoleWithPermissions[]> {
  const supabase = await createClient();

  const [{ data: roles }, { data: grants }] = await Promise.all([
    supabase
      .from("roles")
      .select("id, slug, name, description, high_risk, is_system")
      .order("name"),
    supabase.from("role_permissions").select("role_id, permission_slug"),
  ]);

  const byRole = new Map<string, string[]>();
  for (const grant of (grants ?? []) as { role_id: string; permission_slug: string }[]) {
    const list = byRole.get(grant.role_id) ?? [];
    list.push(grant.permission_slug);
    byRole.set(grant.role_id, list);
  }

  return ((roles ?? []) as Omit<RoleWithPermissions, "permissions">[]).map(
    (role) => ({ ...role, permissions: (byRole.get(role.id) ?? []).sort() }),
  );
}

export type PermissionRow = { slug: string; module: string; description: string };

export async function listPermissions(): Promise<PermissionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("permissions")
    .select("slug, module, description")
    .order("module")
    .order("slug");
  return (data ?? []) as PermissionRow[];
}
