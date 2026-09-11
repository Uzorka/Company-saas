/**
 * Geofence logic, mirroring supabase/migrations/0012_geofence.sql.
 *
 * Deliberately duplicated in two languages. The database is authoritative —
 * it is what a record is actually written with — but the check-in screen has
 * to tell the employee what will be recorded *before* they commit to it, which
 * the design insists on ("Classification is stated before the selfie, not
 * after"). A round trip per GPS reading would make that unusable on a phone
 * in a depot.
 *
 * The two implementations are kept honest by a test that runs the same table
 * of cases through both.
 */

export type AttendanceType = "office" | "remote" | "uncertain";

export type Coordinates = {
  latitude: number;
  longitude: number;
  /** Radius of the fix in metres, as reported by the device. */
  accuracyM: number | null;
};

/**
 * Absolute accuracy beyond which a fix is flagged for a person to look at,
 * even when it is geometrically decisive. A judgement, not a design constant:
 * the design treats ±140m as needing attention and ±8-12m as routine.
 */
export const POOR_ACCURACY_THRESHOLD_M = 100;

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. Haversine, spherical earth. */
export function distanceMetres(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;

  return (
    Math.round(EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(a)) * 100) / 100
  );
}

/**
 * Which side of the fence is the employee on?
 *
 * A GPS fix is a circle of radius `accuracyM`, not a point. Only a fix whose
 * entire circle falls on one side of the fence is decisive:
 *
 *   distance + accuracy <= radius  ->  certainly inside
 *   distance - accuracy >  radius  ->  certainly outside
 *   otherwise                      ->  cannot tell
 *
 * A missing accuracy figure is unresolvable, not perfect.
 */
export function classifyAttendance(
  distanceM: number | null,
  accuracyM: number | null,
  radiusM: number,
): AttendanceType {
  if (distanceM === null || accuracyM === null) return "uncertain";
  if (distanceM + accuracyM <= radiusM) return "office";
  if (distanceM - accuracyM > radiusM) return "remote";
  return "uncertain";
}

export type ExceptionCode =
  | "no_location"
  | "no_accuracy"
  | "poor_accuracy"
  | "position_unresolved"
  | "no_selfie";

/** Why this record needs a person. Empty means it does not. */
export function exceptionCodes({
  distanceM,
  accuracyM,
  hasSelfie,
  classified,
}: {
  distanceM: number | null;
  accuracyM: number | null;
  hasSelfie: boolean;
  classified: AttendanceType;
}): ExceptionCode[] {
  const codes: ExceptionCode[] = [];

  if (distanceM === null) codes.push("no_location");
  if (accuracyM === null && distanceM !== null) codes.push("no_accuracy");
  if (accuracyM !== null && accuracyM > POOR_ACCURACY_THRESHOLD_M) {
    codes.push("poor_accuracy");
  }
  if (classified === "uncertain") codes.push("position_unresolved");
  if (!hasSelfie) codes.push("no_selfie");

  return codes;
}

export const exceptionLabel: Record<ExceptionCode, string> = {
  no_location: "No location captured",
  no_accuracy: "Device reported no accuracy",
  poor_accuracy: "Poor GPS accuracy",
  position_unresolved: "Could not confirm which side of the geofence",
  no_selfie: "No selfie captured",
};

/**
 * What the employee is told before they commit.
 *
 * The copy matters as much as the classification: the design is explicit that
 * remote is neutral, not a warning — "treating it as a warning would teach
 * field staff to game their check-in position."
 */
export function classificationCopy(
  classified: AttendanceType,
  distanceM: number | null,
  officeName: string,
): { title: string; detail: string; tone: "success" | "info" | "warn" } {
  const distance =
    distanceM === null
      ? ""
      : distanceM < 1000
        ? `${Math.round(distanceM)} m`
        : `${(distanceM / 1000).toFixed(1)} km`;

  switch (classified) {
    case "office":
      return {
        title: `Inside the ${officeName} geofence`,
        detail: `${distance} from the office pin. This will be recorded as Worked in Office.`,
        tone: "success",
      };
    case "remote":
      return {
        title: "Outside the geofence",
        detail: `${distance} from ${officeName}. This will be recorded as Worked Remotely — a normal state, and no explanation is needed.`,
        tone: "info",
      };
    case "uncertain":
      return {
        title: "Signal is too weak to confirm your position",
        detail:
          "Your accuracy reading is recorded with the check-in so HR can judge it fairly. You can retry, or continue and have it reviewed.",
        tone: "warn",
      };
  }
}

export function formatAccuracy(accuracyM: number | null): string {
  return accuracyM === null ? "no reading" : `±${Math.round(accuracyM)}m`;
}

export function formatDistance(distanceM: number | null): string {
  if (distanceM === null) return "—";
  return distanceM < 1000
    ? `${Math.round(distanceM)} m`
    : `${(distanceM / 1000).toFixed(1)} km`;
}
