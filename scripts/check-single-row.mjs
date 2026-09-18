#!/usr/bin/env node
/**
 * `maybeSingle()` must be asking for something that can only be one row.
 *
 * PostgREST treats more than one row as an error, not as "take the first". So
 * a query that looks right, and is right for the person who wrote it, fails
 * for whoever can see more rows — and fails as a null, which reads as "not
 * found" rather than "you asked wrongly".
 *
 * Three of these shipped. The worst refused every file upload with "You are
 * not in that conversation", because a member may read every membership row of
 * a conversation they are in: two rows for a direct message, more for a
 * channel. The policy working correctly is what broke it. The other two made
 * an HR user's own leave screen empty, because RLS hands HR every employee
 * where it hands an employee only themselves.
 *
 * The check: the columns compared with `.eq()` must cover a primary key or a
 * unique index on that table, read from the database the migrations build.
 * `organization_id` counts as present throughout — every table here is
 * org-scoped by RLS, so a per-tenant unique constraint really is unique to the
 * caller. An explicit `.limit(1)` is accepted as saying "first of many, on
 * purpose", which is what an ordered lookup means.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "src";
const PSQL = "/usr/lib/postgresql/16/bin/psql";
const DB = process.env.TEST_DB ?? "heron_test";

/** table -> array of unique column sets (primary keys and unique indexes). */
function readUniques() {
  const out = execFileSync(
    PSQL,
    ["-h", process.env.PGHOST ?? "/tmp", "-p", process.env.PGPORT ?? "5433",
     "-U", process.env.PGUSER ?? "postgres", "-d", DB, "-At", "-F", "\t", "-c",
     `select c.relname,
             string_agg(a.attname, ',' order by a.attname)
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
       where n.nspname = 'public'
         and (i.indisunique or i.indisprimary)
         and i.indpred is null
       group by c.relname, i.indexrelid`],
    { encoding: "utf8" },
  );

  const uniques = new Map();
  for (const line of out.trim().split("\n")) {
    if (!line) continue;
    const [table, columns] = line.split("\t");
    if (!uniques.has(table)) uniques.set(table, []);
    uniques.get(table).push(new Set(columns.split(",")));
  }
  return uniques;
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if ([".ts", ".tsx"].includes(extname(path))) yield path;
  }
}

const uniques = readUniques();
if (uniques.size === 0) {
  console.error(`No tables found in ${DB}. Run scripts/db-test.sh first.`);
  process.exit(1);
}

const problems = [];
let checked = 0;

for (const file of files(ROOT)) {
  if (file.includes("__tests__")) continue;
  const source = readFileSync(file, "utf8");

  // Each `.maybeSingle()` belongs to the nearest `.from()` before it.
  //
  // Matching forward from `.from()` instead was wrong: in a Promise.all of
  // several queries it ran past the end of one statement and blamed the first
  // table for the next query's call. It reported the check-in screen's
  // `offices` lookup, which has no `.maybeSingle()` at all.
  const froms = [...source.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)];

  for (const call of source.matchAll(/\.maybeSingle\(\)/g)) {
    let owner = null;
    for (const from of froms) {
      if (from.index < call.index) owner = from;
      else break;
    }
    if (!owner) continue;

    const table = owner[1];
    const chain = source.slice(owner.index + owner[0].length, call.index);
    checked++;

    // An explicit limit(1) is a deliberate "first of these".
    if (/\.limit\(\s*1\s*\)/.test(chain)) continue;

    const columns = new Set(
      [...chain.matchAll(/\.eq\(\s*["'`](\w+)["'`]/g)].map((m) => m[1]),
    );
    // RLS supplies this on every table in this schema.
    columns.add("organization_id");

    const sets = uniques.get(table);
    if (!sets) continue; // not one of ours — a view, or the storage schema

    const covered = sets.some((set) => [...set].every((c) => columns.has(c)));
    if (covered) continue;

    const line = source.slice(0, call.index).split("\n").length;
    const filtered = [...columns].filter((c) => c !== "organization_id");
    problems.push(
      `${file}:${line}  ${table}.maybeSingle() filtered by ` +
        `${filtered.length ? filtered.join(", ") : "nothing"} — not unique`,
    );
  }
}

if (problems.length > 0) {
  console.error("Single-row reads that can match more than one row:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nPostgREST returns an error, not the first row, so this comes back null" +
      "\nand reads as \"not found\". Filter by a key, or say .limit(1) if you" +
      "\ndo mean the first of several.",
  );
  process.exit(1);
}

console.log(`Single-row reads: ${checked} checked, each can match one row.`);
