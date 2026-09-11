#!/usr/bin/env node
/**
 * Run the same table of cases through the SQL and the TypeScript geofence
 * implementations and assert they agree.
 *
 * The logic is duplicated on purpose — the database is authoritative, but the
 * check-in screen has to state the classification before the employee commits
 * to it, and a round trip per GPS reading is not viable on a phone in a depot.
 * Duplication is only safe if it is checked, so this is that check.
 */
import { execFileSync } from "node:child_process";
import { classifyAttendance, exceptionCodes } from "../src/lib/attendance/geofence.ts";

const CASES = [
  // distance, accuracy, radius
  [42, 8, 150],
  [42, 140, 150],
  [3800, 140, 150],
  [3800, 12, 150],
  [149, 8, 150],
  [151, 8, 150],
  [150, 20, 150],
  [0, 0, 150],
  [5, 50, 10],
  [3, 5, 10],
  [200, 5, 10],
  [100, 100, 200],
  [100, 101, 200],
  [null, null, 150],
  [42, null, 150],
  [250, 99, 150],
  [251, 100, 150],
];

const sqlValues = CASES.map(
  ([d, a, r]) =>
    `(${d === null ? "null::numeric" : d}, ${a === null ? "null::numeric" : a}, ${r}::numeric)`,
).join(",");

const query = `
  select
    coalesce(d::text, 'null') || '|' || coalesce(a::text, 'null') || '|' || r::text
      || '|' || classify_attendance(d, a, r)::text
      || '|' || array_to_string(
           attendance_exception_codes(d, a, r, true, classify_attendance(d, a, r)), ',')
  from (values ${sqlValues}) as t(d, a, r);
`;

const raw = execFileSync(
  "psql",
  ["-h", "/tmp", "-p", process.env.PGPORT ?? "5433", "-U", "postgres",
   "-d", process.env.TEST_DB ?? "heron_test", "-tAc", query],
  { encoding: "utf8", env: { ...process.env, PATH: `${process.env.PATH}:/usr/lib/postgresql/16/bin` } },
);

let failures = 0;
let checked = 0;

for (const line of raw.trim().split("\n")) {
  if (!line.trim()) continue;
  const [d, a, r, sqlClass, sqlCodesRaw] = line.split("|");

  const distance = d === "null" ? null : Number(d);
  const accuracy = a === "null" ? null : Number(a);
  const radius = Number(r);

  const tsClass = classifyAttendance(distance, accuracy, radius);
  const tsCodes = exceptionCodes({
    distanceM: distance,
    accuracyM: accuracy,
    hasSelfie: true,
    classified: tsClass,
  });

  const sqlCodes = sqlCodesRaw ? sqlCodesRaw.split(",").filter(Boolean) : [];
  const label = `distance=${d} accuracy=${a} radius=${r}`;
  checked += 1;

  if (tsClass !== sqlClass) {
    console.error(`MISMATCH classification  ${label}: sql=${sqlClass} ts=${tsClass}`);
    failures += 1;
    continue;
  }
  if ([...tsCodes].sort().join(",") !== [...sqlCodes].sort().join(",")) {
    console.error(
      `MISMATCH exceptions      ${label}: sql=[${sqlCodes}] ts=[${tsCodes}]`,
    );
    failures += 1;
    continue;
  }
  console.log(`ok  ${label} -> ${sqlClass}${sqlCodes.length ? ` [${sqlCodes}]` : ""}`);
}

if (checked !== CASES.length) {
  console.error(`Expected ${CASES.length} cases, checked ${checked}.`);
  process.exit(1);
}

if (failures > 0) {
  console.error(`\n${failures} of ${checked} cases disagree between SQL and TypeScript.`);
  process.exit(1);
}

console.log(`\nSQL and TypeScript agree on all ${checked} geofence cases.`);
