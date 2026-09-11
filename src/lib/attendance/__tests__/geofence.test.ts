import { describe, expect, it } from "vitest";
import {
  classifyAttendance,
  distanceMetres,
  exceptionCodes,
  formatAccuracy,
  formatDistance,
  classificationCopy,
  POOR_ACCURACY_THRESHOLD_M,
} from "@/lib/attendance/geofence";

// The design's Head Office, Victoria Island — 150m fence.
const OFFICE = { latitude: 6.4312, longitude: 3.4219 };

describe("distanceMetres", () => {
  it("is zero at the same point", () => {
    expect(distanceMetres(OFFICE, OFFICE)).toBe(0);
  });

  it("matches a known separation", () => {
    // Victoria Island to the Ikeja depot, from the design's office list.
    const ikeja = { latitude: 6.6018, longitude: 3.3515 };
    const d = distanceMetres(OFFICE, ikeja);
    // ~20km. Asserted as a range because the exact figure depends on the
    // earth model, and pinning it to the metre would test the constant rather
    // than the behaviour.
    expect(d).toBeGreaterThan(19_000);
    expect(d).toBeLessThan(21_000);
  });

  it("is symmetric", () => {
    const other = { latitude: 6.45, longitude: 3.43 };
    expect(distanceMetres(OFFICE, other)).toBeCloseTo(
      distanceMetres(other, OFFICE),
      2,
    );
  });

  it("resolves a short distance", () => {
    // ~111m north.
    const north = { latitude: OFFICE.latitude + 0.001, longitude: OFFICE.longitude };
    const d = distanceMetres(OFFICE, north);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});

describe("classifyAttendance", () => {
  const RADIUS = 150;

  it("calls a confidently-inside fix office", () => {
    // The design's happy path: 42m away, ±8m.
    expect(classifyAttendance(42, 8, RADIUS)).toBe("office");
  });

  it("calls a confidently-outside fix remote", () => {
    expect(classifyAttendance(3800, 12, RADIUS)).toBe("remote");
  });

  it("treats remote as decisive even when the fix is coarse, if the geometry allows", () => {
    // 3.8km away with ±140m is still unambiguously outside a 150m fence.
    expect(classifyAttendance(3800, 140, RADIUS)).toBe("remote");
  });

  it("refuses to guess when the accuracy circle straddles the fence", () => {
    // 42m away but ±140m: could be anywhere from the pin to 182m out.
    expect(classifyAttendance(42, 140, RADIUS)).toBe("uncertain");
  });

  it("refuses to guess just inside the fence when accuracy overlaps it", () => {
    // 149m ±8m spans 141-157m. The fence is at 150m. Not resolvable, and
    // claiming "office" here would be the product overstating what it knows.
    expect(classifyAttendance(149, 8, RADIUS)).toBe("uncertain");
  });

  it("reproduces the design's own worked example", () => {
    // "Configured radius = 10m, reported GPS accuracy = 50m — this should be
    // flagged as uncertain or require HR review."
    expect(classifyAttendance(5, 50, 10)).toBe("uncertain");
  });

  it("treats a missing accuracy reading as unresolvable, not as perfect", () => {
    expect(classifyAttendance(42, null, RADIUS)).toBe("uncertain");
  });

  it("treats a missing position as unresolvable", () => {
    expect(classifyAttendance(null, 8, RADIUS)).toBe("uncertain");
    expect(classifyAttendance(null, null, RADIUS)).toBe("uncertain");
  });

  it("resolves cleanly at a tight radius when the fix is good enough", () => {
    // A 10m fence is only usable with a fix better than the fence itself.
    expect(classifyAttendance(3, 5, 10)).toBe("office");
    expect(classifyAttendance(200, 5, 10)).toBe("remote");
  });
});

describe("exceptionCodes", () => {
  it("is empty for a clean office check-in", () => {
    expect(
      exceptionCodes({
        distanceM: 42,
        accuracyM: 8,
        hasSelfie: true,
        classified: "office",
      }),
    ).toEqual([]);
  });

  it("flags a decisive but coarse fix for review", () => {
    // Certainly remote, but ±140m does not corroborate where they say they are.
    const codes = exceptionCodes({
      distanceM: 3800,
      accuracyM: 140,
      hasSelfie: true,
      classified: "remote",
    });
    expect(codes).toContain("poor_accuracy");
    expect(codes).not.toContain("position_unresolved");
  });

  it("flags an unresolved position", () => {
    expect(
      exceptionCodes({
        distanceM: 42,
        accuracyM: 140,
        hasSelfie: true,
        classified: "uncertain",
      }),
    ).toEqual(expect.arrayContaining(["poor_accuracy", "position_unresolved"]));
  });

  it("flags a denied location without pretending it succeeded", () => {
    const codes = exceptionCodes({
      distanceM: null,
      accuracyM: null,
      hasSelfie: true,
      classified: "uncertain",
    });
    expect(codes).toContain("no_location");
    expect(codes).toContain("position_unresolved");
  });

  it("flags a missing selfie but still records the check-in", () => {
    // Partial success is explicit: losing the photo must not cost the
    // employee their recorded time.
    const codes = exceptionCodes({
      distanceM: 42,
      accuracyM: 8,
      hasSelfie: false,
      classified: "office",
    });
    expect(codes).toEqual(["no_selfie"]);
  });

  it("uses the documented accuracy threshold", () => {
    const at = exceptionCodes({
      distanceM: 10,
      accuracyM: POOR_ACCURACY_THRESHOLD_M,
      hasSelfie: true,
      classified: "office",
    });
    const beyond = exceptionCodes({
      distanceM: 10,
      accuracyM: POOR_ACCURACY_THRESHOLD_M + 1,
      hasSelfie: true,
      classified: "office",
    });
    expect(at).not.toContain("poor_accuracy");
    expect(beyond).toContain("poor_accuracy");
  });
});

describe("classificationCopy", () => {
  it("presents remote neutrally, not as a warning", () => {
    // The design: "Deliberately neutral: blue, not amber. Treating it as a
    // warning would teach field staff to game their check-in position."
    const copy = classificationCopy("remote", 3800, "Head Office");
    expect(copy.tone).toBe("info");
    expect(copy.detail).toMatch(/normal state/i);
  });

  it("states the office classification before the selfie is taken", () => {
    const copy = classificationCopy("office", 42, "Head Office");
    expect(copy.tone).toBe("success");
    expect(copy.detail).toMatch(/Worked in Office/);
  });

  it("offers a route forward when the position is unresolved", () => {
    const copy = classificationCopy("uncertain", 42, "Head Office");
    expect(copy.tone).toBe("warn");
    expect(copy.detail).toMatch(/retry|continue/i);
  });
});

describe("formatting", () => {
  it("shows accuracy in metres, and says so when there is none", () => {
    expect(formatAccuracy(8)).toBe("±8m");
    expect(formatAccuracy(140.4)).toBe("±140m");
    expect(formatAccuracy(null)).toBe("no reading");
  });

  it("switches to kilometres past 1000m", () => {
    expect(formatDistance(42)).toBe("42 m");
    expect(formatDistance(999)).toBe("999 m");
    expect(formatDistance(3800)).toBe("3.8 km");
    expect(formatDistance(null)).toBe("—");
  });
});
