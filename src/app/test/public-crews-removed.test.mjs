// The public crew sign-off and audit were removed: opening a workspace drops
// their stored records and the stops they pulled, and keeps everything else.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Store } from "../store/store.mjs";
import { temporaryDirectory } from "./temporary.mjs";

test("old sign-off and audit records and their stops are dropped on open", () => {
  const file = path.join(
    temporaryDirectory("avoozl-public-gone-"),
    "workspace.sqlite",
  );
  let store = new Store(file);
  store.setMeta("publicSignoff", { "o/r": { complete: true } });
  store.setMeta("publicCrewAuditCursors", { "o/r": { since: "x" } });
  store.setMeta("publicCrewAudit", { "o/r": [] });
  store.setMeta("kept", { value: 1 });
  store.put("flow_stops", {
    id: "s1",
    by: { kind: "system", name: "public crew audit" },
  });
  store.put("flow_stops", {
    id: "s2",
    reason: "Stop public crews was pressed.",
  });
  store.put("flow_stops", { id: "s3", reason: "Mine." });
  store.close();
  store = new Store(file);
  try {
    for (const key of [
      "publicSignoff",
      "publicCrewAuditCursors",
      "publicCrewAudit",
    ])
      assert.equal(store.getMeta(key), null, key);
    assert.deepEqual(store.getMeta("kept"), { value: 1 });
    assert.deepEqual(
      store.list("flow_stops").map((s) => s.id),
      ["s3"],
    );
  } finally {
    store.close();
  }
});
