#!/usr/bin/env node
// Screenshots of Settings › GitHub and Settings › Issue Radar in the full app
// shell on fake data (harness ?page=app&roles=...&ghfull=1): desktop (1280 px)
// and phone (375 px), light and dark: <out>/<name>-<width>-<theme>.png.
// Pages the build does not have yet (Issue Radar before) are skipped.
//
//   AVOOZL_HOST_CSS=<host css> node test/browser/github-sections-shots.mjs <out dir>
import fs from "node:fs";
import path from "node:path";
import { buildHarness } from "./build.mjs";
import { findChrome, launch } from "./chrome.mjs";

const [out] = process.argv.slice(2);
if (!out) {
  console.error("Usage: github-sections-shots.mjs <out dir>");
  process.exit(2);
}
const chrome = findChrome();
if (!chrome) {
  console.error("No Chrome found; set AVOOZL_CHROME.");
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
const harness = await buildHarness({ hostCss: process.env.AVOOZL_HOST_CSS });
const browser = await launch(chrome);
try {
  const page = await browser.page();
  const settle = () => page.evaluate("new Promise((r) => setTimeout(r, 400))");
  const scope = (width) =>
    width < 768 ? "[data-top-rail-list]" : "[data-left-nav]";
  const menu = (width) =>
    width >= 768
      ? "true"
      : `(() => { if (!document.querySelector('[data-top-rail-list]')) document.querySelector('[data-top-rail-bar]').click(); return true })()`;
  const head = (width) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-head]')].find((x) => x.textContent.includes('Settings')); if (b && !b.hasAttribute('data-open')) b.click(); return Boolean(b) })()`;
  // The last match: Needs you has an Issue Radar page of its own above.
  const item = (width, text) =>
    `(() => { const b = [...document.querySelectorAll('${scope(width)} [data-nav-item]')].filter((x) => x.textContent.trim() === ${JSON.stringify(text)}).at(-1); if (b) b.click(); return Boolean(b) })()`;
  const shots = [
    ["github-plans", "plans", "GitHub"],
    ["github-single", "single", "GitHub"],
    ["radar-single", "single", "Issue Radar"],
  ];
  for (const theme of ["light", "dark"])
    for (const width of [1280, 375])
      for (const [name, roles, tab] of shots) {
        const size = { width, height: 900, dark: theme === "dark" };
        const url = harness.url({ page: "app", theme, roles, ghfull: "1" });
        const steps = [menu(width), head(width), item(width, tab)];
        const open = async (height) => {
          await page.open(url, { ...size, height });
          await page.until(
            `Boolean(document.querySelector('[data-shell-main]'))`,
          );
          let found = true;
          for (const step of steps) {
            await settle();
            found = await page.evaluate(step);
          }
          await settle();
          return found;
        };
        if (!(await open(900))) {
          console.log(`skip ${name}: no ${tab} page`);
          continue;
        }
        const height = Math.min(
          5000,
          Math.ceil(
            await page.evaluate(
              "(() => { const s = [...document.querySelectorAll('*')].reduce((a, e) => (e.scrollHeight - e.clientHeight > a.scrollHeight - a.clientHeight ? e : a), document.documentElement); return document.documentElement.clientHeight + s.scrollHeight - s.clientHeight })()",
            ),
          ),
        );
        await open(height);
        const file = path.join(out, `${name}-${width}-${theme}.png`);
        await page.screenshot(file);
        console.log(file);
      }
  if (page.errors.length) console.error(page.errors.join("\n"));
} finally {
  await browser.close();
  harness.remove();
}
