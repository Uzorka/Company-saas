#!/usr/bin/env node
/**
 * Every update and delete must ask what it actually changed.
 *
 * RLS refuses a write in two ways and only one of them raises. Missing a table
 * privilege raises; a policy that matches no rows does not — the statement
 * succeeds having changed nothing. An action that checks only `error` reports
 * success for a write the database refused: the screen updates, the row does
 * not, and the person finds out on the next refresh.
 *
 * Verified against the running database: an employee updating a task they are
 * not assigned to changed 0 rows and raised nothing, and setTaskStatus
 * returned ok. Three of the five occurrences were in code written the same
 * day the rule was first applied elsewhere, which is why this is a gate and
 * not a habit.
 *
 * The rule: a PostgREST `.update()` or `.delete()` chain must contain
 * `.select(`, so the caller receives the rows and can treat zero as a refusal.
 * `refusedIfEmpty` in src/lib/forms/result.ts is the shared way to say so.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "src/lib";

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (extname(path) === ".ts") yield path;
  }
}

const problems = [];

for (const file of files(ROOT)) {
  if (file.includes("__tests__")) continue;
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(/\.\s*(update|delete)\s*\(/g)) {
    const start = match.index;
    // The statement runs to its terminating semicolon.
    const end = source.indexOf(";", start);
    const chain = source.slice(start, end === -1 ? source.length : end);

    // Only PostgREST chains — a chain with no filter is something else
    // entirely (Map.delete, a local array, the storage or admin clients).
    const isPostgrest = /\.\s*(eq|neq|in|is|match|gt|lt|gte|lte)\s*\(/.test(chain);
    if (!isPostgrest) continue;
    if (chain.includes(".select(")) continue;

    const line = source.slice(0, start).split("\n").length;
    problems.push(`${file}:${line}  .${match[1]}() with no .select()`);
  }
}

if (problems.length > 0) {
  console.error("Writes that cannot tell a refusal from a success:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nAdd .select(...) to the chain and pass the rows through refusedIfEmpty()" +
      " (src/lib/forms/result.ts). Zero rows is the refusal.",
  );
  process.exit(1);
}

console.log("Write guards: every update and delete checks what it changed.");
