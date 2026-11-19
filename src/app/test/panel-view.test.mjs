// panel.view: the side panel's one read. Each part fails alone, and the
// sample workspace fills every section.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { demoOperations, installDemo } from "../demo.mjs";
import { panelView } from "../panel-view.mjs";

test("a part that throws is null and the others still come back", async () => {
  const view = await panelView({
    a: () => 1,
    b: async () => {
      throw new Error("down");
    },
    c: async () => [3],
  });
  assert.deepEqual([view.a, view.b, view.c], [1, null, [3]]);
  assert.ok(Date.parse(view.readAt));
});

test("panel.view fills every section from the sample workspace", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-panel-view-"));
  const { root } = await installDemo(path.join(tmp, "demo"));
  const demo = demoOperations(root);
  try {
    const view = await demo.execute("panel.view", {});
    for (const part of [
      "conflicts",
      "remote",
      "queue",
      "flow",
      "specs",
      "instance",
    ])
      assert.notEqual(view[part], null, `${part} was read`);
    assert.ok(view.conflicts.length > 0, "something waits on a person");
    // No repository is released by label, so the release queue is empty.
    assert.deepEqual(view.queue.repositories, []);
    assert.ok(view.instance.name, "the instance has a name");
    assert.equal("driver" in view, false, "no driver session part");
  } finally {
    demo.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
