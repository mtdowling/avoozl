#!/usr/bin/env node
// Screenshots of batch approval on the Specs page (harness ?page=specs) at
// 390 and 1280 px, light and dark: the list with Batch chips and two specs
// picked, and the Approve N specs dialog, <out>/<shot>-<width>-<theme>.png.
//
//   node test/browser/batch-approve-shots.mjs <out dir>
//
// AVOOZL_CHROME names the browser; AVOOZL_HOST_CSS the host's stylesheet.
import fs from "node:fs";
import path from "node:path";
import { buildHarness } from "./build.mjs";
import { findChrome, launch } from "./chrome.mjs";

const [out] = process.argv.slice(2);
if (!out) {
  console.error("Usage: batch-approve-shots.mjs <out dir>");
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
const check = (id) =>
  `document.querySelector('[data-spec-check="${id}"]').click()`;
try {
  const page = await browser.page();
  const settle = () => page.evaluate("new Promise((r) => setTimeout(r, 250))");
  for (const [width, height] of [
    [390, 800],
    [1280, 800],
  ])
    for (const theme of ["light", "dark"]) {
      await page.open(harness.url({ page: "specs", theme }), {
        width,
        height,
        dark: theme === "dark",
      });
      await page.until(`Boolean(document.querySelector('[data-spec-check]'))`);
      await page.evaluate(check("byte-types"));
      await page.evaluate(check("compression"));
      await settle();
      await page.screenshot(path.join(out, `specs-${width}-${theme}.png`));
      await page.evaluate(
        `document.querySelector('[data-approve-specs-open]').click()`,
      );
      await page.until(
        `Boolean(document.querySelector('[data-approve-list]'))`,
      );
      await settle();
      await page.screenshot(path.join(out, `approve-${width}-${theme}.png`));
      console.log(width, theme);
    }
  if (page.errors.length) console.error(page.errors.join("\n"));
} finally {
  await browser.close();
  harness.remove();
}
