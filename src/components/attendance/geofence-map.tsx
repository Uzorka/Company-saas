import { cn } from "@/lib/utils";

/**
 * Position diagram. Source: the design's "static map, pin + accuracy circle".
 *
 * Drawn to scale as an SVG rather than fetched from a tile provider. No
 * provider was specified anywhere in the design pack and none is free at
 * scale, so rather than pick a vendor on the client's behalf — or ship a
 * broken map — this renders the information the map actually carries: the
 * office pin, the geofence to scale, the employee's position, and the
 * accuracy circle around it.
 *
 * Swapping in real tiles later means adding a background layer under this
 * geometry, not rewriting it. Recorded as DECISIONS.md D32.
 */
export function GeofenceMap({
  distanceM,
  accuracyM,
  radiusM,
  classified,
  className,
}: {
  distanceM: number | null;
  accuracyM: number | null;
  radiusM: number;
  classified: "office" | "remote" | "uncertain";
  className?: string;
}) {
  const size = 240;
  const centre = size / 2;

  // Scale so the fence and the employee (plus their accuracy circle) both fit
  // with a margin, whichever reaches further out.
  const extent = Math.max(
    radiusM * 1.4,
    (distanceM ?? 0) + (accuracyM ?? 0) + radiusM * 0.3,
  );
  const perMetre = (centre - 16) / Math.max(extent, 1);

  const fenceR = radiusM * perMetre;
  const personOffset = (distanceM ?? 0) * perMetre;
  const accuracyR = (accuracyM ?? 0) * perMetre;

  const tone =
    classified === "office"
      ? { stroke: "#0F7A54", fill: "#E7F4EE" }
      : classified === "remote"
        ? { stroke: "#1B4F8C", fill: "#EEF4FB" }
        : { stroke: "#8A5600", fill: "#FDF2DF" };

  const hasPosition = distanceM !== null;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn("w-full max-w-[240px]", className)}
      role="img"
      aria-label={
        hasPosition
          ? `Position diagram: ${Math.round(distanceM)} metres from the office pin, geofence ${radiusM} metres, accuracy ${accuracyM === null ? "unknown" : `${Math.round(accuracyM)} metres`}.`
          : "Position diagram: no location captured."
      }
    >
      <rect width={size} height={size} rx="14" fill="#F8F9FB" />

      {/* The geofence, to scale. */}
      <circle
        cx={centre}
        cy={centre}
        r={fenceR}
        fill="#EEF4FB"
        stroke="#AFC9E7"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />

      {/* The office pin. */}
      <circle cx={centre} cy={centre} r="5" fill="#1B4F8C" />

      {hasPosition ? (
        <>
          {/* Accuracy circle — a fix is a circle, not a point, and the diagram
              says so rather than implying precision it does not have. */}
          {accuracyR > 0 ? (
            <circle
              cx={centre}
              cy={centre - personOffset}
              r={accuracyR}
              fill={tone.fill}
              fillOpacity="0.55"
              stroke={tone.stroke}
              strokeOpacity="0.4"
              strokeWidth="1"
            />
          ) : null}
          <line
            x1={centre}
            y1={centre}
            x2={centre}
            y2={centre - personOffset}
            stroke={tone.stroke}
            strokeWidth="1"
            strokeDasharray="3 3"
            strokeOpacity="0.6"
          />
          <circle
            cx={centre}
            cy={centre - personOffset}
            r="5"
            fill={tone.stroke}
            stroke="#fff"
            strokeWidth="1.5"
          />
        </>
      ) : null}

      <text
        x={centre}
        y={size - 10}
        textAnchor="middle"
        fontSize="10"
        fontFamily="IBM Plex Mono, monospace"
        fill="#4A5666"
      >
        {hasPosition
          ? `${Math.round(distanceM)}m from pin · fence ${radiusM}m`
          : "no position captured"}
      </text>
    </svg>
  );
}
