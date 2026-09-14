"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/session";
import { type FormState, describeWriteError } from "@/lib/forms/result";

/**
 * Settings mutations.
 *
 * The database is the boundary, not this file. `organization_settings` admits
 * only `settings.manage` (migration 0030), and `offices` only
 * `attendance.manage_locations` — so a caller who bypasses these actions and
 * talks to PostgREST directly gets the same answer. The validation here is
 * about giving a person a usable error, not about deciding who may write.
 *
 * Bounds below mirror the table's CHECK constraints deliberately. The
 * constraint is the guarantee; this is the sentence explaining it before the
 * database has to raise one.
 */

const settingsSchema = z.object({
  timezone: z.string().trim().min(1, "Choose a timezone").max(64),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "A currency code is three letters, e.g. NGN"),
  defaultGeofenceRadiusM: z.coerce
    .number()
    .int()
    .min(1, "A geofence needs a radius of at least 1 metre")
    .max(5000, "5000m is the maximum — beyond that it stops meaning anything"),
  sessionTimeoutMinutes: z.coerce.number().int().min(1).max(1440),
  failedLoginLimit: z.coerce.number().int().min(1).max(20),
  lockoutMinutes: z.coerce.number().int().min(1).max(1440),
  passwordMinLength: z.coerce
    .number()
    .int()
    .min(8, "Eight characters is the floor this product will accept")
    .max(72),
  selfieRetentionMonths: z.coerce.number().int().min(1).max(120),
  coordinateRetentionMonths: z.coerce.number().int().min(1).max(120),
  auditRetentionYears: z.coerce.number().int().min(1).max(25),
});

export async function updateSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = settingsSchema.safeParse({
    timezone: formData.get("timezone"),
    currencyCode: formData.get("currencyCode"),
    defaultGeofenceRadiusM: formData.get("defaultGeofenceRadiusM"),
    sessionTimeoutMinutes: formData.get("sessionTimeoutMinutes"),
    failedLoginLimit: formData.get("failedLoginLimit"),
    lockoutMinutes: formData.get("lockoutMinutes"),
    passwordMinLength: formData.get("passwordMinLength"),
    selfieRetentionMonths: formData.get("selfieRetentionMonths"),
    coordinateRetentionMonths: formData.get("coordinateRetentionMonths"),
    auditRetentionYears: formData.get("auditRetentionYears"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values." };
  }

  const session = await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase
    .from("organization_settings")
    .update({
      timezone: parsed.data.timezone,
      currency_code: parsed.data.currencyCode,
      default_geofence_radius_m: parsed.data.defaultGeofenceRadiusM,
      session_timeout_minutes: parsed.data.sessionTimeoutMinutes,
      failed_login_limit: parsed.data.failedLoginLimit,
      lockout_minutes: parsed.data.lockoutMinutes,
      password_min_length: parsed.data.passwordMinLength,
      selfie_retention_months: parsed.data.selfieRetentionMonths,
      coordinate_retention_months: parsed.data.coordinateRetentionMonths,
      audit_retention_years: parsed.data.auditRetentionYears,
    })
    .eq("organization_id", session.organizationId);

  if (error) {
    return {
      error: describeWriteError(error.code, error.message, "Settings already saved."),
    };
  }

  revalidatePath("/[org]/settings", "page");
  return { done: true };
}

const officeSchema = z.object({
  name: z.string().trim().min(1, "Name the office").max(120),
  address: z.string().trim().max(240).optional().or(z.literal("")),
  latitude: z.coerce
    .number()
    .min(-90, "Latitude runs from -90 to 90")
    .max(90, "Latitude runs from -90 to 90"),
  longitude: z.coerce
    .number()
    .min(-180, "Longitude runs from -180 to 180")
    .max(180, "Longitude runs from -180 to 180"),
  geofenceRadiusM: z.coerce
    .number()
    .int()
    .min(1, "A geofence needs a radius of at least 1 metre")
    .max(5000, "5000m is the maximum"),
});

/**
 * Create an office.
 *
 * The coordinates and radius here decide whether someone standing at this site
 * is recorded as present or as remote, so they are not cosmetic. The form asks
 * for them as plain decimal degrees rather than hiding them behind a map,
 * which the product does not have a tile provider for (docs/BACKLOG.md).
 */
export async function createOffice(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = officeSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    geofenceRadiusM: formData.get("geofenceRadiusM"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase.from("offices").insert({
    organization_id: session.organizationId,
    name: parsed.data.name,
    address: parsed.data.address || null,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    geofence_radius_m: parsed.data.geofenceRadiusM,
  });

  if (error) {
    return {
      error: describeWriteError(
        error.code,
        error.message,
        `An office called “${parsed.data.name}” already exists.`,
      ),
    };
  }

  revalidatePath("/[org]/settings", "page");
  revalidatePath("/[org]/attendance", "page");
  return { done: true };
}
