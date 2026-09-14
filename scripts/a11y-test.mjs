/**
 * Accessibility gate.
 *
 * Builds nothing and starts nothing — it expects a server already running at
 * BASE_URL, which `npm run test:a11y` arranges.
 *
 * This exists because the audit was run once by hand, two real violations were
 * fixed, and then two more were introduced within the same hour by a content
 * change. A one-off audit measures a moment; only a gate keeps a property.
 *
 * Public surfaces only. The workspace needs a signed-in session against a real
 * Supabase project, which this environment does not have — that gap is named
 * in docs/BACKLOG.md rather than papered over with a lower standard.
 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const EXECUTABLE =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PAGES = [
  "/",
  "/about",
  "/services",
  "/careers",
  "/contact",
  "/auth/login",
  "/auth/forgot",
];

// Both widths, because the two things most likely to break are contrast (any
// width) and layout-driven overlap (narrow only).
const VIEWPORTS = [
  { name: "phone", width: 400, height: 900 },
  { name: "desktop", width: 1280, height: 900 },
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const browser = await chromium.launch({ executablePath: EXECUTABLE });
let failures = 0;
let checks = 0;

for (const viewport of VIEWPORTS) {
  for (const path of PAGES) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
    });
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.addScriptTag({ content: axeSource });
      const result = await page.evaluate(
        async (tags) =>
          await window.axe.run(document, { runOnly: { type: "tag", values: tags } }),
        TAGS,
      );
      checks += 1;

      const violations = result.violations.filter((v) => v.nodes.length);
      for (const v of violations) {
        failures += 1;
        console.error(`FAIL  ${viewport.name} ${path}  [${v.impact}] ${v.id}: ${v.help}`);
        for (const node of v.nodes.slice(0, 2)) {
          console.error(`        ${node.html.slice(0, 120)}`);
        }
      }
    } catch (error) {
      failures += 1;
      console.error(`FAIL  ${viewport.name} ${path}  could not be checked: ${error.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
}

await browser.close();

if (checks !== PAGES.length * VIEWPORTS.length) {
  console.error(
    `\nOnly ${checks} of ${PAGES.length * VIEWPORTS.length} page/viewport pairs were checked. Treating as a failure.`,
  );
  process.exit(1);
}

if (failures > 0) {
  console.error(`\nAccessibility gate FAILED — ${failures} violation(s).`);
  process.exit(1);
}

console.log(`Accessibility gate passed — ${checks} page/viewport pairs, 0 violations (WCAG 2.1 AA).`);
