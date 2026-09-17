#!/usr/bin/env node
/**
 * The page transition must not break `position: fixed`.
 *
 * Wrapping every route in a transformed element makes that element the
 * containing block for fixed descendants. The slide-over — used on Employees,
 * Tasks, Leave, Settings and Attendance — is `fixed inset-0` and is rendered
 * inline inside the page, not portalled. A residual transform on the wrapper
 * would move every panel and scrim in the app off the viewport.
 *
 * So this loads a harness with exactly that structure, waits for the spring to
 * settle, and asks the browser where the fixed child actually is.
 */
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const EXECUTABLE =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

let failures = 0;
const check = (ok, name, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

await page.goto(`${base}/motioncheck`, { waitUntil: "networkidle" });
// Longer than the spring's perceptual duration, so it has settled.
await page.waitForTimeout(1200);

const result = await page.evaluate(() => {
  const wrapper = document.querySelector('[data-testid="wrapper"]');
  const fixed = document.querySelector('[data-testid="fixed-child"]');
  const box = fixed.getBoundingClientRect();
  return {
    transform: getComputedStyle(wrapper).transform,
    top: Math.round(box.top),
    left: Math.round(box.left),
    height: Math.round(box.height),
    viewportHeight: window.innerHeight,
  };
});

check(
  result.transform === "none",
  "the settled wrapper leaves no transform behind",
  `transform: ${result.transform}`,
);

check(
  result.top === 0 && result.left === 0,
  "a fixed child sits at the viewport origin",
  `top ${result.top}, left ${result.left}`,
);

check(
  result.height === result.viewportHeight,
  "a fixed inset-0 child covers the viewport",
  `${result.height}px of ${result.viewportHeight}px`,
);

// And again after scrolling: a broken containing block shows up as a fixed
// element that scrolls away with the page.
await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(150);
const afterScroll = await page.evaluate(() => {
  const box = document
    .querySelector('[data-testid="fixed-child"]')
    .getBoundingClientRect();
  return Math.round(box.top);
});

check(
  afterScroll === 0,
  "and stays there when the page scrolls",
  `top ${afterScroll} after scrolling 400px`,
);

await browser.close();

if (failures > 0) {
  console.error(`\n${failures} motion check(s) failed.`);
  process.exit(1);
}
console.log("\nMotion: the page transition does not break fixed positioning.");
