// Local resource slots shared across workspaces (lt-4.3).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { bindContentRules } from "../content-rules.mjs";
import { drainCheckRuns } from "../check-runs.mjs";
import {
  freeDeadSlots,
  heldSlots,
  releaseSlots,
  slotOfCommand,
  slotWait,
  takeSlots,
} from "../resource-slots.mjs";
import { openSupervisorDatabase } from "../supervisor.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const counts = { "windows-vm": 1, "linux-container": 2 };

function machine(t) {
  const state = temporaryDirectory("avoozl-slots-"),
    a = openSupervisorDatabase(state),
    b = openSupervisorDatabase(state);
  t.after(() => {
    a.close();
    b.close();
  });
  return { state, a, b };
}

test("two workspaces share one windows-vm slot: the second train waits until the first ends", (t) => {
  const { a, b } = machine(t);
  const first = takeSlots(a, {
    names: ["windows-vm"],
    counts,
    workspace: "ws1",
    train: "train-1",
  });
  assert.equal(first.ok, true);
  const second = takeSlots(b, {
    names: ["windows-vm"],
    counts,
    workspace: "ws2",
    train: "train-2",
  });
  assert.equal(second.ok, false);
  assert.deepEqual(second.waiting, {
    slot: "windows-vm",
    train: "train-1",
    workspace: "ws1",
  });
  assert.equal(heldSlots(b).length, 1);
  assert.equal(releaseSlots(a, { train: "train-1" }), 1);
  assert.equal(
    takeSlots(b, {
      names: ["windows-vm"],
      counts,
      workspace: "ws2",
      train: "train-2",
    }).ok,
    true,
  );
});

test("a train takes all its slots or none, and a retry keeps the one it holds", (t) => {
  const { a } = machine(t);
  takeSlots(a, {
    names: ["windows-vm"],
    counts,
    workspace: "ws1",
    train: "train-1",
  });
  const mixed = takeSlots(a, {
    names: ["linux-container", "windows-vm"],
    counts,
    workspace: "ws2",
    train: "train-2",
  });
  assert.equal(mixed.ok, false);
  assert.deepEqual(
    heldSlots(a).map((r) => r.train),
    ["train-1"],
    "nothing of train-2 was kept",
  );
  // A count of two lets two trains hold the container.
  assert.equal(
    takeSlots(a, {
      names: ["linux-container"],
      counts,
      workspace: "w",
      train: "t3",
    }).ok,
    true,
  );
  assert.equal(
    takeSlots(a, {
      names: ["linux-container"],
      counts,
      workspace: "w",
      train: "t4",
    }).ok,
    true,
  );
  assert.equal(
    takeSlots(a, {
      names: ["linux-container"],
      counts,
      workspace: "w",
      train: "t5",
    }).ok,
    false,
  );
  assert.equal(
    takeSlots(a, {
      names: ["linux-container"],
      counts,
      workspace: "w",
      train: "t3",
    }).ok,
    true,
  );
  assert.equal(
    heldSlots(a).filter((r) => r.slot === "linux-container").length,
    2,
  );
});

test("a worker check needing a held slot waits with the train named", (t) => {
  const { a } = machine(t);
  assert.equal(slotWait(a, "windows-vm", counts), null);
  takeSlots(a, {
    names: ["windows-vm"],
    counts,
    workspace: "ws1",
    train: "train-abc",
  });
  assert.equal(
    slotWait(a, "windows-vm", counts),
    "waiting for windows-vm (train-abc)",
  );
  assert.equal(slotWait(a, "linux-container", counts), null);
});

test("the slot a command needs is found from its wrapper prefix", () => {
  const platforms = {
    "windows-x64": { kind: "vm", wrapper: ["/w/vm", "--"], slot: "windows-vm" },
    "macos-arm64": { kind: "native" },
  };
  assert.equal(
    slotOfCommand(["/w/vm", "--", "npm", "test"], platforms),
    "windows-vm",
  );
  assert.equal(slotOfCommand(["npm", "test"], platforms), null);
});

test("a crashed holder's slot is freed by the taker; a live holder's is not", (t) => {
  const { a } = machine(t);
  takeSlots(a, {
    names: ["windows-vm"],
    counts,
    workspace: "ws1",
    train: "train-dead",
    pid: 2 ** 22 + 99,
  });
  assert.equal(
    freeDeadSlots(a, { train: "train-live", alive: () => true }).length,
    0,
  );
  assert.equal(
    freeDeadSlots(a, { train: "train-dead", alive: () => true }).length,
    0,
  );
  assert.equal(heldSlots(a).length, 1);
  const freed = freeDeadSlots(a, { train: "train-dead", alive: () => false });
  assert.equal(freed.length, 1);
  assert.equal(heldSlots(a).length, 0);
});

test("a queued worker check waits for a held slot and runs when it is free", async (t) => {
  const root = temporaryDirectory("avoozl-slotcheck-"),
    store = new Store(path.join(root, "w.sqlite")),
    { a } = machine(t);
  t.after(() => store.close());
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "m.json"),
  });
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  const ran = path.join(root, "ran");
  store.put("projects", { id: "app", root, baseBranch: "main", checks: [] });
  store.put("flow_records", {
    id: "check-run:t:1",
    kind: "check-run",
    taskId: "t",
    projectId: "app",
    commit: "a".repeat(40),
    attempt: 1,
    state: "queued",
    queuedAt: new Date().toISOString(),
  });
  takeSlots(a, {
    names: ["windows-vm"],
    counts,
    workspace: "ws1",
    train: "train-9",
  });
  // A gate that reads the shared database stands in for the machine config.
  const gate = () => slotWait(a, "windows-vm", counts);
  await drainCheckRuns(store, { slotGate: gate });
  assert.equal(store.get("flow_records", "check-run:t:1").state, "queued");
  assert.equal(
    store.get("flow_records", "check-run:t:1").waiting,
    "waiting for windows-vm (train-9)",
  );
  assert.equal(fs.existsSync(ran), false);
  releaseSlots(a, { train: "train-9" });
  await drainCheckRuns(store, { slotGate: gate });
  const done = store.get("flow_records", "check-run:t:1");
  assert.notEqual(done.state, "queued");
  assert.equal(done.waiting, undefined);
});
