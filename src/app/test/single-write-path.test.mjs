// One SQLite write path, CLI half: with no server URL the CLI changes the
// workspace database only inside an Operations call. The servers' half is in
// single-write-path-servers.test.mjs.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Store } from "../store.mjs";
import {
  assertInsideOperations,
  dbPath,
  dump,
  seed,
  seeded,
  setup,
} from "./write-path.mjs";

test("CLI local mode writes SQLite only inside Operations", () => {
  const context = setup(),
    { workspace, avoozl, writes } = context;
  seed(context);
  assertInsideOperations(writes(), "init and import");
  const before = writes().length;
  for (const args of [
    ["update", "sample-task", "--title", "Renamed", "--workspace", workspace],
    ["tick", "--workspace", workspace],
  ]) {
    const result = avoozl(args);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.ok(writes().length > before, "update and tick wrote");
  assertInsideOperations(writes(), "update and tick");
  const store = new Store(dbPath(workspace));
  try {
    assert.equal(
      store.read().tasks.find((task) => task.id === "sample-task").title,
      "Renamed",
    );
  } finally {
    store.close();
  }
});

test("CLI local mode cannot write when Operations refuses", () => {
  const allowed = setup(),
    file = seeded(allowed),
    { workspace } = allowed,
    denied = setup({ deny: true }),
    before = dump(dbPath(workspace));
  for (const args of [
    ["update", "sample-task", "--title", "Bypass", "--workspace", workspace],
    ["import", file, "--workspace", workspace],
    ["tick", "--workspace", workspace],
  ]) {
    const result = denied.avoozl(args);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.match(result.stderr, /Operations denied/, args.join(" "));
  }
  assert.deepEqual(dump(dbPath(workspace)), before, "nothing was written");

  const fresh = path.join(denied.root, "fresh"),
    init = denied.avoozl(["init", fresh]);
  assert.notEqual(init.status, 0);
  const store = new Store(dbPath(fresh));
  try {
    assert.equal(store.initialized(), false, "init wrote no snapshot");
  } finally {
    store.close();
  }
});
