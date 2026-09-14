/**
 * End-to-end checks against a real browser and the production build.
 *
 * SCOPE, STATED HONESTLY
 *
 * Public surfaces only: the marketing pages, the careers site and the sign-in
 * screens. The workspace needs a signed-in session against a live Supabase
 * project, which this environment cannot reach — so every authenticated
 * journey is covered by the database suite and by unit tests, and not here.
 * That gap is real and named in docs/BACKLOG.md rather than disguised by a
 * suite that only tests what happens to be reachable.
 *
 * What this does cover is the part no other check touches: that the pages
 * actually render in a browser, that navigation between them works, that
 * forms validate, and that nothing overflows its viewport on a phone.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const EXECUTABLE =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const results = [];
let failed = 0;

/**
 * Every assertion polls.
 *
 * The first version of this suite read each condition once, immediately after
 * navigation, and failed differently on every run — the typeface check one
 * time, the sign-in fields the next. That is the worst kind of gate: it trains
 * whoever sees it to re-run until green, and then a real regression reads as
 * one more flake.
 *
 * The cause was reading state that had not settled. A page that has responded
 * is not a page that has applied its stylesheet, hydrated its form, or
 * finished swapping its webfont. So conditions are polled to a deadline and
 * only reported after they have had a fair chance to become true.
 */
async function check(name, probe, detail = "", timeout = 8000) {
  const deadline = Date.now() + timeout;
  let ok = false;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await probe();
      if (last) {
        ok = true;
        break;
      }
    } catch (error) {
      last = error.message;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  results.push({ name, ok, detail: ok ? "" : detail || String(last ?? "") });
  if (!ok) failed += 1;
}

/**
 * `networkidle` is unreliable here: the App Router prefetches route payloads
 * on hover and idle, so "no requests for 500ms" is a race rather than a
 * milestone. Wait for the document and its fonts instead, which is what the
 * assertions actually depend on.
 */
async function open(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });

try {
  // ---------------------------------------------------------------------
  // The public journey
  // ---------------------------------------------------------------------
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await open(page, `${BASE}/`);
  await check("Home renders the company headline", async () =>
    (await page.locator("h1").first().textContent())?.includes("Nigerian home"),
  );

  // The notice is what keeps a public deployment carrying a real company's
  // name honest, so its absence is a failure, not a cosmetic difference.
  await check(
    "The demonstration notice is on the page",
    async () =>
      (await page.getByRole("note").count()) > 0 ||
      (await page.getByText(/product demonstration/i).count()) > 0,
  );

  await check(
    "The tenant typeface is actually applied",
    async () =>
      (await page.evaluate(
        () => getComputedStyle(document.body).fontFamily.split(",")[0].replace(/["']/g, ""),
      )) === "Plus Jakarta Sans",
    "regression guard for D84 — the product rendered in the system font for nine phases",
  );

  for (const [label, path, expect] of [
    ["About", "/about", /About/i],
    ["Services", "/services", /Services/i],
    ["Careers", "/careers", /Careers|roles/i],
    ["Contact", "/contact", /Contact/i],
  ]) {
    await page.getByRole("navigation").getByRole("link", { name: label }).first().click();
    await page.waitForURL(`**${path}`, { timeout: 15000 });
    await check(`Nav: ${label} reaches ${path}`, async () =>
      expect.test((await page.locator("h1").first().textContent()) ?? ""),
    );
  }

  // The contact page must point at the real company rather than dead-end.
  await open(page, `${BASE}/contact`);
  await check(
    "Contact links out to the company's own site",
    async () => (await page.locator('a[href*="chfheron.com"]').count()) > 0,
  );

  // ---------------------------------------------------------------------
  // Sign-in
  // ---------------------------------------------------------------------
  await open(page, `${BASE}/auth/login`);
  const submit = page.locator('button[type="submit"]').first();
  await check("Sign-in has a submit button", async () => (await submit.count()) === 1);
  await check(
    "The primary button label is white on the brand colour",
    async () =>
      (await submit.evaluate((el) => getComputedStyle(el).color)) === "rgb(255, 255, 255)",
    "regression guard for D80 — tailwind-merge was deleting text-white",
  );
  // Matched on the real field names rather than what they were assumed to be —
  // the first version guessed "workspace" and failed against "companyCode".
  for (const field of ["companyCode", "email", "password"]) {
    await check(`Sign-in asks for ${field}`, async () =>
      (await page.locator(`input[name="${field}"]`).count()) === 1,
    );
  }

  // ---------------------------------------------------------------------
  // Routes that used to 404
  // ---------------------------------------------------------------------
  for (const [label, path] of [
    ["an unbuilt module", "/chfheron/documents"],
    ["a typo under a workspace", "/chfheron/not-a-real-screen"],
  ]) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await check(
      `${label} does not hit a framework 404`,
      async () =>
        response?.status() !== 404 ||
        (await page.getByText("This page could not be found").count()) === 0,
      path,
    );
  }

  await page.close();

  // ---------------------------------------------------------------------
  // Phone width: nothing may scroll sideways.
  //
  // A horizontal scrollbar on a phone is the most common responsive defect and
  // the least likely to be noticed on a desktop, so it is asserted rather than
  // eyeballed.
  // ---------------------------------------------------------------------
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const path of ["/", "/about", "/services", "/careers", "/contact", "/auth/login"]) {
    await open(phone, `${BASE}${path}`);
    await check(
      `No sideways scroll at 390px: ${path}`,
      async () =>
        (await phone.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )) <= 0,
      "page scrolls sideways",
    );
  }
  await phone.close();
} finally {
  await browser.close();
}

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? `  — ${r.detail}` : ""}`);
}

// A suite that asserts nothing is not a passing suite.
if (results.length < 20) {
  console.error(`\nOnly ${results.length} checks ran — expected at least 20. Treating as a failure.`);
  process.exit(1);
}

if (failed > 0) {
  console.error(`\nE2E FAILED — ${failed} of ${results.length} checks.`);
  process.exit(1);
}

console.log(`\nE2E passed — ${results.length} checks.`);
