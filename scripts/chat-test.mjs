#!/usr/bin/env node
/**
 * Every chat theme must be readable, and your own words must be on the right.
 *
 * Six themes times two bubble kinds is twelve colour pairs, all of them
 * chosen by the person reading them. A theme that renders white on pale sand
 * is not a preference, it is a screen somebody cannot use — and the
 * accessibility gate cannot see any of it, because the conversation needs a
 * signed-in session it has no way to get.
 *
 * So the presentation is rendered on its own at /chatcheck, and the browser is
 * asked what colour each bubble actually computed to. The geometry is checked
 * in the same pass: outgoing right, incoming left is the whole reason this
 * layout was asked for.
 */
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 760, height: 1500 } });
await page.goto(`${base}/chatcheck`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const rgb = (s) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const results = await page.evaluate(() => {
  const out = [];
  for (const block of document.querySelectorAll("[data-theme-block]")) {
    for (const bubble of block.querySelectorAll("[data-bubble]")) {
      const cs = getComputedStyle(bubble);
      const p = bubble.querySelector("p");
      const box = bubble.getBoundingClientRect();
      out.push({
        theme: block.dataset.themeBlock,
        side: bubble.dataset.bubble,
        bg: cs.backgroundColor,
        fg: getComputedStyle(p).color,
        right: Math.round(box.right),
      });
    }
  }
  return out;
});

let fails = 0;
for (const r of results) {
  const ratio = (() => {
    const a = lum(rgb(r.bg)), b = lum(rgb(r.fg));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  })();
  const ok = ratio >= 4.5;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.theme.padEnd(8)} ${r.side.padEnd(7)} ${ratio.toFixed(2)}:1`);
}

const byTheme = new Map();
for (const r of results) {
  const entry = byTheme.get(r.theme) ?? {};
  entry[r.side] = r.right;
  byTheme.set(r.theme, entry);
}
const sided = [...byTheme.values()].every((e) => e.mine > e.theirs);
console.log(`${sided ? "PASS" : "FAIL"}  own messages sit right of incoming ones`);
if (!sided) fails++;

await page.screenshot({ path: "/tmp/claude-0/chat.png", fullPage: true });
await browser.close();
process.exit(fails > 0 ? 1 : 0);
