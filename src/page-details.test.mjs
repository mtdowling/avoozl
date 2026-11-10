import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PAGE_DESCRIPTIONS } from "./page-details.mjs";

test("every top-level page has a concise description", () => {
  const html = fs.readFileSync(
      new URL("./index.html", import.meta.url),
      "utf8",
    ),
    views = [...html.matchAll(/data-view="([^"]+)"/g)].map((match) => match[1]);

  for (const view of new Set(views)) assert.ok(PAGE_DESCRIPTIONS[view]);
  assert.ok(PAGE_DESCRIPTIONS["open-workspace"]);
  assert.ok(PAGE_DESCRIPTIONS["open-usage"]);
  for (const description of Object.values(PAGE_DESCRIPTIONS)) {
    assert.ok(description.length > 20);
    assert.ok(description.length < 100);
  }
});

test("page controls precede the shared controls pinned to the right", () => {
  const html = fs.readFileSync(
      new URL("./index.html", import.meta.url),
      "utf8",
    ),
    ids = [
      'class="toolbar-page-actions"',
      'id="show-toc"',
      'class="toolbar-dropdowns"',
      'class="toolbar-common-actions"',
      'id="toggle-left"',
      'id="quick-task"',
      'id="fullscreen"',
      'id="clear-filters"',
    ],
    positions = ids.map((id) => html.indexOf(id));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
});
