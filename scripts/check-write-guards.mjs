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

/**
 * A second rule, about reads.
 *
 * `profiles` has no foreign key from anything that names a user: every such
 * column references `auth.users`, and `profiles` references `auth.users` too.
 * Two tables pointing at the same parent is not a relationship PostgREST can
 * follow, so `actor:profiles(full_name)` does not return a null name — it
 * fails the entire request.
 *
 * The audit log shipped with exactly that embed and showed "Couldn't load the
 * audit log" to the one role allowed to read it, until a user reported it.
 * Resolve names with a second select and a Map instead.
 */
const PROFILE_EMBED = /\w+\s*:\s*profiles\s*\(/;

for (const file of files(ROOT)) {
  if (file.includes("__tests__")) continue;
  const source = readFileSync(file, "utf8");

  for (const [line, text] of source.split("\n").entries()) {
    // A comment explaining why not to do this is not doing it.
    const code = text.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) continue;
    if (PROFILE_EMBED.test(text)) {
      problems.push(
        `${file}:${line + 1}  embeds profiles() — no foreign key for PostgREST to follow`,
      );
    }
  }

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
  console.error("Queries that cannot do what they look like they do:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nFor a write: add .select(...) and pass the rows through refusedIfEmpty()" +
      " (src/lib/forms/result.ts) — zero rows is the refusal." +
      "\nFor a profiles embed: select the ids, then read profiles separately" +
      " and join them in a Map.",
  );
  process.exit(1);
}

console.log(
  "Query guards: writes check what they changed, and nothing embeds profiles().",
);
