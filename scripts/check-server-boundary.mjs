#!/usr/bin/env node
/**
 * A Server Component may not hand a function to a Client Component.
 *
 * React has nothing to serialise a function into, so the request fails with
 * "A server error occurred" and an error id — no stack, no component, nothing
 * a reader can act on. It builds, typechecks and lints cleanly, because none
 * of those render the page, and a dynamic route is never prerendered.
 *
 * That is exactly how the payroll run screen shipped: it was the only place in
 * the app that built `DataTable`'s columns — each with a `cell` render
 * function — inside a Server Component. Every other table sits in a file that
 * is already "use client".
 *
 * The check: for each file WITHOUT "use client", find components it imports
 * from files WITH "use client", and flag any JSX prop on them whose value is
 * an arrow function or a `function` expression. Event handlers are the common
 * case and render props are the subtle one; both are caught.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";

const ROOT = "src";

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if ([".tsx"].includes(extname(path))) yield path;
  }
}

const all = [...files(ROOT)];
const isClient = new Map();
for (const file of all) {
  isClient.set(file, /^\s*["']use client["']/m.test(readFileSync(file, "utf8").slice(0, 200)));
}

/** Resolve an import specifier to a file in this project, or null. */
function resolveImport(fromFile, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;

  for (const candidate of [`${base}.tsx`, join(base, "index.tsx")]) {
    if (isClient.has(candidate)) return candidate;
  }
  return null;
}

const problems = [];

for (const file of all) {
  if (isClient.get(file) || file.includes("__tests__")) continue;
  const source = readFileSync(file, "utf8");

  // Which imported names come from a "use client" file?
  const clientNames = new Map();
  for (const m of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    const target = resolveImport(file, m[2]);
    if (!target || !isClient.get(target)) continue;
    for (const raw of m[1].split(",")) {
      const name = raw.replace(/^\s*type\s+/, "").split(/\s+as\s+/).pop().trim();
      if (name) clientNames.set(name, target);
    }
  }
  if (clientNames.size === 0) continue;

  // Each JSX opening tag for one of those components.
  //
  // Found by scanning rather than by one regular expression: a prop value like
  // `getRowKey={(row) => row.id}` contains a `>`, and a non-greedy match ends
  // the tag there — which is how the first version of this gate passed the
  // exact bug it was written for. Depth counting does not have that problem.
  for (const [name, target] of clientNames) {
    const opening = new RegExp(`<${name}(?=[\\s/>])`, "g");
    for (const match of source.matchAll(opening)) {
      let i = match.index + match[0].length;
      let depth = 0;
      while (i < source.length) {
        const char = source[i];
        if (char === "{") depth++;
        else if (char === "}") depth--;
        else if (char === ">" && depth === 0) break;
        i++;
      }
      const props = source.slice(match.index + match[0].length, i);
      const fn = props.match(
        /(\w+)\s*=\s*\{\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>|(\w+)\s*=\s*\{\s*(?:async\s+)?function\b/,
      );
      if (!fn) continue;
      const prop = fn[1] ?? fn[2];
      const line = source.slice(0, match.index).split("\n").length;
      problems.push(
        `${file}:${line}  <${name} ${prop}={...}> — a function passed to a client component (${target})`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Functions crossing the server/client boundary:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nReact cannot serialise a function, so the request fails at render with" +
      "\n\"A server error occurred\". Move the JSX into a \"use client\" component," +
      "\nor pass plain data and build the callback there.",
  );
  process.exit(1);
}

console.log("Server boundary: no functions passed from server to client components.");
