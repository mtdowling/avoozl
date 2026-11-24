// Settings › Autopilot: picking Autopilot writes the delivery block and this
// machine's loop, Off removes the loop, landing.pr saves while off, and
// Needs you says when ready tasks wait on a missing loop.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Operations, type OperationContext } from "../../api/operations.ts";
import { readyCandidates } from "../../delivery/delivery.ts";
import { Store } from "../../store/store.ts";
import { fixture } from "../../test/fixtures.ts";
import { temporaryDirectory } from "../../test/temporary.ts";
import { withStatus } from "../../test/refusal.ts";
import type { ConflictsView } from "../../test/view-shapes.ts";

// What delivery.settings.get and .update answer.
interface Settings {
  on: boolean;
  delivery: {
    timeboxMinutes?: number;
    checkInMinutes?: number;
    missedCheckIns?: number;
  };
  loop: { run: string[]; every?: string } | null;
  hash: string;
  landingPr?: string;
}

function setup(
  t: TestContext,
  value: Record<string, unknown> = {},
  machine: Record<string, unknown> | null = null,
) {
  const root = temporaryDirectory("avoozl-autopilot-"),
    configDirectory = path.join(root, "machine"),
    machineFile = path.join(configDirectory, "config.json"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1, ...value }),
  );
  if (machine) {
    fs.mkdirSync(configDirectory, { recursive: true });
    fs.writeFileSync(machineFile, JSON.stringify(machine));
  }
  const ops = new Operations(store, { workspaceRoot: root, configDirectory });
  const workspace = () =>
    JSON.parse(fs.readFileSync(path.join(root, ".avoozl.json"), "utf8"));
  const machineValue = () => JSON.parse(fs.readFileSync(machineFile, "utf8"));
  const get = () => ops.execute<Settings>("delivery.settings.get", {});
  const update = (input: Record<string, unknown>, context?: OperationContext) =>
    ops.execute<Settings>(
      "delivery.settings.update",
      input,
      undefined,
      context,
    );
  return { ops, workspace, machineValue, get, update };
}

test("picking Autopilot writes delivery and this machine's loop; Off removes only the loop", async (t) => {
  const { workspace, machineValue, get, update } = setup(
    t,
    {},
    { version: 1, lanes: { local: 2 } },
  );
  const before = await get();
  assert.equal(before.on, false);
  assert.equal(before.loop, null);
  const on = await update({
    delivery: {},
    turnOn: true,
    expectedHash: before.hash,
    loop: { run: ["specs"], every: "1m" },
  });
  assert.equal(on.on, true);
  assert.deepEqual(on.loop, { run: ["specs"], every: "1m" });
  assert.deepEqual(workspace().delivery, {});
  assert.deepEqual(machineValue().lanes, { local: 2 });
  const off = await update({ expectedHash: on.hash, loop: null });
  assert.equal(off.loop, null);
  assert.equal(off.on, true, "the workspace block stays for other machines");
  assert.equal(machineValue().loop, undefined);
  assert.deepEqual(machineValue().lanes, { local: 2 });
});

test("Autopilot saves wall-clock limits and check-ins", async (t) => {
  const { workspace, get, update } = setup(t, {
    delivery: { reviewRounds: 2 },
  });
  const saved = await update({
    expectedHash: (await get()).hash,
    delivery: {
      timeboxMinutes: 180,
      checkInMinutes: 20,
      missedCheckIns: 2,
    },
  });
  assert.deepEqual(saved.delivery, {
    timeboxMinutes: 180,
    checkInMinutes: 20,
    missedCheckIns: 2,
  });
  assert.deepEqual(workspace().delivery, {
    reviewRounds: 2,
    timeboxMinutes: 180,
    checkInMinutes: 20,
    missedCheckIns: 2,
  });
});

test("a bad loop writes nothing, and an agent tool may change it", async (t) => {
  const { workspace, get, update } = setup(t);
  const { hash } = await get();
  await assert.rejects(
    update({
      delivery: {},
      turnOn: true,
      expectedHash: hash,
      loop: { run: [] },
    }),
    /loop\.run must list/,
  );
  assert.equal(workspace().delivery, undefined);
  const saved = await update(
    { expectedHash: hash, loop: { run: ["specs"] } },
    { caller: { sessionKey: "dashboard:agent" }, mcp: true },
  );
  assert.deepEqual(saved.loop, { run: ["specs"] });
});

test("landing.pr saves while Autopilot is off, and starts nothing", async (t) => {
  const { workspace, get, update } = setup(t);
  const saved = await update({
    landingPr: "auto",
    expectedHash: (await get()).hash,
  });
  assert.equal(saved.landingPr, "auto");
  assert.equal(saved.loop, null);
  assert.equal(workspace().delivery, undefined);
});

test("Needs you says Autopilot is off while ready tasks wait on a missing loop", async (t) => {
  const { root, store } = fixture(t),
    configDirectory = path.join(root, "machine");
  fs.writeFileSync(path.join(root, ".avoozl.json"), '{"version": 1}');
  assert.ok(readyCandidates(store).length, "the fixture has ready tasks");
  const ops = new Operations(store, { workspaceRoot: root, configDirectory });
  const off = async () =>
    (await ops.execute<ConflictsView>("conflicts.view", {})).items.filter(
      (item) => item.reason === "autopilot-off",
    );
  assert.deepEqual(await off(), [
    {
      kind: "needs-human",
      reason: "autopilot-off",
      id: "autopilot-off",
      taskId: null,
      title: "Autopilot is off on this machine, so ready tasks wait.",
      detail: "Turn it on in Settings › Autopilot, or run avoozl next --claim.",
    },
  ]);
  fs.mkdirSync(configDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(configDirectory, "config.json"),
    JSON.stringify({ version: 1, loop: { run: ["specs"] } }),
  );
  assert.deepEqual(await off(), []);
});
