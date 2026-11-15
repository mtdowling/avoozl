// The Release queue reads a gate as met when its plugin said done or a person
// cleared it, as the engine does (RC23.2). Found in the live run of rc-p22.
import assert from "node:assert/strict";
import test from "node:test";
import { releaseQueue } from "../radar-coder-queue.mjs";
import { recordClear } from "../gate-clear.mjs";
import { setup } from "./gate-fixture.mjs";

const identity = { mode: "single-repo", repositories: {} };
const rows = (store) =>
  Object.fromEntries(
    releaseQueue(store, identity).repositories.flatMap((entry) =>
      entry.rows.map((row) => [row.taskId, row]),
    ),
  );

test("a dependent waits on an open gate, and not on a done one", async (t) => {
  const { store, tick, item } = await setup(t);
  assert.match(rows(store)["sdk.2"].reason, /Waiting on sdk\.1/);
  item("done");
  await tick(0);
  const after = rows(store);
  assert.equal(after["sdk.1"], undefined);
  assert.doesNotMatch(after["sdk.2"].reason, /sdk\.1/);
});

test("a dependent is not held by a gate a person cleared", async (t) => {
  const { store } = await setup(t);
  assert.match(rows(store)["sdk.2"].reason, /Waiting on sdk\.1/);
  recordClear(store, "sdk.1", { actor: "person", how: "command", reason: "x" });
  const after = rows(store);
  assert.equal(after["sdk.1"], undefined);
  assert.doesNotMatch(after["sdk.2"].reason, /sdk\.1/);
});
