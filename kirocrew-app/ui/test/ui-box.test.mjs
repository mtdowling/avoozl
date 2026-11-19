// Box writes the page's layout and text classes from src/ui/box.json. The
// class check reads className strings, so it can't see these: this test holds
// every class in the table to Kiro Crew's stylesheet, and checks Box turns
// props into exactly those classes, in light and dark.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildHarness } from "./browser/build.mjs";
import { findChrome, launch } from "./browser/chrome.mjs";
import { kirocrewStylesheet } from "./kirocrew-css.mjs";

const table = JSON.parse(
  readFileSync(new URL("../src/ui/box.json", import.meta.url), "utf8"),
);
const classes = [
  ...Object.values(table.flags),
  ...Object.values(table.scales).flatMap((scale) => Object.values(scale)),
];
const escape = (token) => token.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

test("every class Box writes is in Kiro Crew's stylesheet", async () => {
  const css = await kirocrewStylesheet();
  assert.deepEqual(
    classes.filter((name) => !css.includes(`.${escape(name)}`)),
    [],
  );
});

test("no class is in the table twice", () => {
  assert.equal(new Set(classes).size, classes.length);
});

const chrome = findChrome();
const skip = chrome
  ? false
  : "no Chrome found; set AVOOZL_CHROME to run the Box render test";
const entry = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "browser",
  "ui-parts.tsx",
);
let harness, browser, page;
before(async () => {
  if (skip) return;
  harness = await buildHarness({ entry });
  browser = await launch(chrome);
  page = await browser.page();
});
after(async () => {
  await browser?.close();
  harness?.remove();
});

for (const theme of ["light", "dark"])
  test(`Box renders its props as classes in ${theme}`, { skip }, async () => {
    await page.open(harness.url({ theme }), {
      width: 600,
      height: 700,
      dark: theme === "dark",
    });
    await page.until(`Boolean(document.querySelector('[data-part="box"]'))`);
    const box = await page.evaluate(
      `(() => { const el = document.querySelector('[data-part="box"]'); const s = getComputedStyle(el); return { tag: el.tagName, className: el.className, display: s.display, direction: s.flexDirection, gap: s.rowGap, size: s.fontSize } })()`,
    );
    assert.deepEqual(box, {
      tag: "SECTION",
      className: "flex flex-col gap-2 text-xs",
      display: "flex",
      direction: "column",
      gap: "8px",
      size: "12px",
    });
  });

for (const theme of ["light", "dark"])
  test(
    `the Plain parts render their element with the look props in ${theme}`,
    { skip },
    async () => {
      await page.open(harness.url({ theme }), {
        width: 600,
        height: 900,
        dark: theme === "dark",
      });
      await page.until(
        `Boolean(document.querySelector('[data-part="plain-button"]'))`,
      );
      const read = (part) =>
        page.evaluate(
          `(() => { const el = document.querySelector('[data-part="${part}"]'); return [el.tagName, el.className, el.getAttribute('style')] })()`,
        );
      assert.deepEqual(await read("plain-button"), [
        "BUTTON",
        "underline",
        "background: none; border: 0px;",
      ]);
      assert.deepEqual(await read("plain-link"), ["A", "underline", null]);
      assert.deepEqual(await read("plain-input"), [
        "INPUT",
        "rounded border text-sm",
        null,
      ]);
      assert.deepEqual(await read("plain-textarea"), [
        "TEXTAREA",
        "rounded border text-xs",
        null,
      ]);
    },
  );
