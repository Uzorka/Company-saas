#!/usr/bin/env node
/**
 * Every colour class in the source must name a token that exists.
 *
 * Tailwind v4 reads colours from `@theme` custom properties. A class naming a
 * property that was never declared — `bg-danger-surface` when the token is
 * `error-surface` — is not an error: Tailwind emits nothing, and the element
 * renders with no background at all. It typechecks, it lints, it builds, and
 * the only way to notice is to look at it.
 *
 * That has now happened twice in this codebase (see docs/DECISIONS.md), both
 * times on an error state — the surface a user sees least often in testing and
 * most needs to be legible when they do. So it is a gate.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const CSS = "src/app/globals.css";
const ROOT = "src";

const css = readFileSync(CSS, "utf8");

/** Every token declared in @theme, grouped by its Tailwind namespace. */
function tokens(namespace) {
  return new Set(
    [...css.matchAll(new RegExp(`--${namespace}-([a-z0-9-]+)\\s*:`, "g"))].map(
      (m) => m[1],
    ),
  );
}

const colours = tokens("color");
const shadows = tokens("shadow");

// Which namespace each utility prefix resolves against. `text-` is shared
// between the palette and the type scale, so it is checked against both.
const NAMESPACE = {
  bg: colours, border: colours, text: colours, ring: colours, fill: colours,
  stroke: colours, divide: colours, outline: colours, accent: colours,
  caret: colours, decoration: colours, from: colours, via: colours, to: colours,
  shadow: shadows,
};
const TYPE_SCALE = new Set(["display", "h1", "h2", "h3", "body", "small", "overline", "data"]);

// Tailwind's own palette and keywords, which are not declared as our tokens.
const BUILT_IN = new Set([
  "transparent", "current", "inherit", "black", "white", "auto", "none",
  "left", "right", "center", "justify", "start", "end", "wrap", "nowrap",
  "balance", "pretty", "ellipsis", "clip", "top", "bottom", "middle",
  "baseline", "sub", "super", "solid", "dashed", "dotted", "double", "hidden",
  "collapse", "separate", "spacing", "reverse", "wide", "wider", "widest",
  "tight", "tighter", "snug", "relaxed", "loose", "nowrap", "words", "all",
]);

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if ([".tsx", ".ts"].includes(extname(path))) yield path;
  }
}

const problems = [];

for (const file of files(ROOT)) {
  if (file.includes("__tests__")) continue;
  const source = readFileSync(file, "utf8");

  for (const [line, text] of source.split("\n").entries()) {
    // Only look inside class strings, so a variable named `text-something`
    // or a comment cannot trip this.
    for (const match of text.matchAll(/class(?:Name)?=["'`]([^"'`]+)["'`]|cn\(\s*["']([^"']+)["']/g)) {
      const classes = (match[1] ?? match[2] ?? "").split(/\s+/);
      for (const raw of classes) {
        // Strip variants (hover:, sm:, dark:) and a leading negation.
        const cls = raw.split(":").pop() ?? "";
        const [prefix, ...rest] = cls.split("-");
        const declared = NAMESPACE[prefix];
        if (!declared || rest.length === 0) continue;

        // `bg-brand-600/40` is the same token at 40% alpha. The modifier is
        // not part of the name, and treating it as one reported `black/10` as
        // an undeclared colour.
        const name = rest.join("-").split("/")[0];
        if (BUILT_IN.has(name)) continue;
        if (prefix === "text" && TYPE_SCALE.has(name)) continue;
        // Numeric scales (border-2, text-[11px], from-0%) are not colours.
        if (/^\[|^\d/.test(name)) continue;
        if (prefix === "border" && /^(t|r|b|l|x|y|s|e)$/.test(rest[0])) continue;
        if (declared.has(name)) continue;

        problems.push(`${file}:${line + 1}  ${cls}`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Colour classes naming a token that does not exist in ${CSS}:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\n${problems.length} problem(s). Tailwind emits nothing for these, so the` +
      ` element renders unstyled. Use a declared token or add one to @theme.`,
  );
  process.exit(1);
}

console.log(
  `Design tokens: every class resolves (${colours.size} colours, ${shadows.size} shadows).`,
);
