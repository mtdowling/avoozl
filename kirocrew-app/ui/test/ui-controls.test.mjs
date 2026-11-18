// No view renders a raw <select> or checkbox: the page's own SelectField and
// Checkbox in src/ui/ draw them (UC1.1, UC1.3). Each keeps its label, its
// aria-describedby and its keyboard behavior. The render checks skip when no
// Chrome is found.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildHarness } from "./browser/build.mjs";
import { findChrome, launch } from "./browser/chrome.mjs";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const views = readdirSync(src, { recursive: true })
  .map((name) => name.split(path.sep).join("/"))
  .filter((name) => /\.tsx$/.test(name) && !name.startsWith("ui/"));

test("no view renders a raw <select> or checkbox", () => {
  const raw = views.filter((name) =>
    /<select\b|type=["']checkbox["']/.test(
      readFileSync(path.join(src, name), "utf8"),
    ),
  );
  assert.deepEqual(raw, []);
});

const chrome = findChrome();
const skip = chrome
  ? false
  : "no Chrome found; set AVOOZL_CHROME to run the controls test";
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
  test(
    `SelectField and Checkbox keep label, description and keyboard in ${theme}`,
    { skip },
    async () => {
      await page.open(harness.url({ theme }), {
        width: 600,
        height: 500,
        dark: theme === "dark",
      });
      await page.until(
        `Boolean(document.querySelector('[data-part="select"]'))`,
      );
      const state = await page.evaluate(`(() => {
      const select = document.querySelector('[data-part="select"]')
      const box = document.querySelector('[data-part="checkbox"]')
      select.focus()
      const focused = document.activeElement === select
      box.click()
      return { name: select.labels[0].textContent.trim(), described: select.getAttribute('aria-describedby'), value: select.value, focused, checked: box.checked, boxLabel: box.labels[0].textContent.trim(), boxDescribed: box.getAttribute('aria-describedby') }
    })()`);
      assert.equal(state.name.startsWith("Mode"), true);
      assert.deepEqual(
        [state.described, state.value, state.focused],
        ["part-help", "b", true],
      );
      assert.deepEqual(
        [state.checked, state.boxLabel, state.boxDescribed],
        [true, "Confirm", "part-help"],
      );
    },
  );
