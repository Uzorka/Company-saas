import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, EmptyState } from "@/components/states";
import { createClient } from "@/lib/supabase/server";
import { CheckInCapture, type NearestOffice } from "./capture";

export const metadata = { title: "Check in" };

/**
 * Check-in. Phone-first and full screen, per the design.
 *
 * The office list and the fence radius are loaded here so the client can state
 * the classification the moment a position arrives, rather than waiting on a
 * round trip. The record itself is still written by check_in() server-side —
 * what the client computes is a preview, never the stored fact.
 */
export default async function CheckInPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  if (!can(session, "attendance.check_in")) {
    return <PermissionState module="Check in" roles={["Employees"]} />;
  }

  const supabase = await createClient();

  const [{ data: offices }, { data: settings }, { data: employee }] =
    await Promise.all([
      supabase
        .from("offices")
        .select("id, name, latitude, longitude, geofence_radius_m")
        .eq("active", true),
      supabase
        .from("organization_settings")
        .select("default_geofence_radius_m")
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id, first_name")
        .eq("user_id", session.userId)
        .maybeSingle(),
    ]);

  if (!employee) {
    return (
      <EmptyState
        heading="No employee record yet"
        body="Your account exists but isn't linked to an employee record, so there's nothing to record attendance against. Ask HR to complete your profile."
      />
    );
  }

  // The nearest office is resolved on the client once a position arrives —
  // this is just the first active one, used to size the diagram before any
  // reading exists.
  const first = offices?.[0];
  const office: NearestOffice | null = first
    ? {
        id: first.id,
        name: first.name,
        latitude: Number(first.latitude),
        longitude: Number(first.longitude),
        radiusM: first.geofence_radius_m,
      }
    : null;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <div>
        <h1 className="text-h1">Check in</h1>
        <p className="mt-1 text-body text-text-2">
          Location, then a live selfie. We read your position once, at the
          moment you tap — never in the background.
        </p>
      </div>

      <CheckInCapture
        office={office}
        defaultRadiusM={settings?.default_geofence_radius_m ?? 150}
      />
    </div>
  );
}
