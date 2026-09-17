#!/usr/bin/env node
/**
 * Every column the app asks for must exist.
 *
 * The recruitment screen went down in production with "Couldn't load
 * recruitment" because the deployed code selected `on_hold_at` and the
 * database was one migration behind. Nothing caught it: a PostgREST select is
 * a string, so TypeScript sees nothing, the build sees nothing, and the first
 * thing that notices is a user.
 *
 * This reads every `.from(table).select(columns)` in the source and checks the
 * names against the test database, which has every migration applied. It
 * catches a typo, a renamed column, and — the case that actually happened —
 * code that has moved ahead of the schema with no migration behind it.
 *
 * It cannot check what a *deployed* database has; that is what
 * supabase/setup/verify.sql is for. What it can do is make sure the migrations
 * in this repository would support the code in this repository.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "src";
const PSQL = "/usr/lib/postgresql/16/bin/psql";
const DB = process.env.TEST_DB ?? "heron_test";

/** table -> Set(columns), read from the database the migrations just built. */
function readSchema() {
  const out = execFileSync(
    PSQL,
    ["-h", process.env.PGHOST ?? "/tmp", "-p", process.env.PGPORT ?? "5433",
     "-U", process.env.PGUSER ?? "postgres", "-d", DB, "-At", "-F", "\t", "-c",
     `select table_name, column_name from information_schema.columns
       where table_schema = 'public'`],
    { encoding: "utf8" },
  );

  const schema = new Map();
  for (const line of out.trim().split("\n")) {
    if (!line) continue;
    const [table, column] = line.split("\t");
    if (!schema.has(table)) schema.set(table, new Set());
    schema.get(table).add(column);
  }
  return schema;
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if ([".ts", ".tsx"].includes(extname(path))) yield path;
  }
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const problems = [];

function checkSelect(file, line, table, select, schema) {
  const columns = schema.get(table);
  if (!columns) {
    problems.push(`${file}:${line}  no such table: ${table}`);
    return;
  }

  for (const part of splitTopLevel(select)) {
    // `*`, and PostgREST's aggregate/cast syntax, are not plain columns.
    if (part === "*" || part.includes("::") || part.startsWith("...")) continue;

    const embed = part.match(/^(?:([\w]+)\s*:\s*)?([\w]+)\s*(?:!\s*[\w]+\s*)?\(([\s\S]*)\)$/);
    if (embed) {
      // `alias:table(cols)` — the embedded table's own columns.
      const [, , embedded, inner] = embed;
      if (!schema.has(embedded)) {
        problems.push(`${file}:${line}  embeds a table that does not exist: ${embedded}`);
        continue;
      }
      checkSelect(file, line, embedded, inner, schema);
      continue;
    }

    // `alias:column` or `column`.
    const name = part.includes(":") ? part.split(":").pop().trim() : part;
    if (!/^\w+$/.test(name)) continue;
    if (!columns.has(name)) {
      problems.push(`${file}:${line}  ${table} has no column "${name}"`);
    }
  }
}

const schema = readSchema();
if (schema.size === 0) {
  console.error(
    `No tables found in ${DB}. Run scripts/db-test.sh first — this checks the` +
      ` code against the schema the migrations build.`,
  );
  process.exit(1);
}

let checked = 0;

for (const file of files(ROOT)) {
  if (file.includes("__tests__")) continue;
  const source = readFileSync(file, "utf8");

  // Two shapes carry a select in this codebase:
  //   .from("table") … .select(`cols`)         — the chain may span lines
  //   selectFrom("table", `cols`)              — the export helper
  //
  // The second was added and the gate did not see it, which left eight new
  // selects unchecked and the count unchanged at 65. A gate that silently
  // covers less than it did is worse than one that fails.
  const patterns = [
    /\.from\(\s*["'`](\w+)["'`]\s*\)[\s\S]{0,200}?\.select\(\s*([`"'])([\s\S]*?)\2/g,
    /\bselectFrom\(\s*["'`](\w+)["'`]\s*,\s*([`"'])([\s\S]*?)\2/g,
  ];

  for (const match of patterns.flatMap((p) => [...source.matchAll(p)])) {
    const [, table, , select] = match;
    // A select built from a variable is not checkable here.
    if (select.includes("${")) continue;
    const line = source.slice(0, match.index).split("\n").length;
    checked++;
    checkSelect(file, line, table, select, schema);
  }
}

if (problems.length > 0) {
  console.error("Selects that name something the schema does not have:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\n${problems.length} problem(s) across ${checked} select(s). Either the` +
      ` name is wrong, or the migration that adds it has not been written.`,
  );
  process.exit(1);
}

console.log(`Selects: ${checked} checked, every column exists.`);
