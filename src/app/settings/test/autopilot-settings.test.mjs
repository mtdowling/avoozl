// Settings › Autopilot: turning it on and off writes or removes the
// delivery block, and landing.pr saves while it is off.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { RepositorySettings } from "../repository-settings.mjs";
import { Store } from "../../store/store.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";

function settingsFor(t, value) {
  const root = temporaryDirectory("avoozl-autopilot-"),
    filename = path.join(root, ".avoozl.json"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  fs.writeFileSync(filename, JSON.stringify({ version: 1, ...value }));
  const settings = new RepositorySettings(store, { workspaceRoot: root });
  const read = () => JSON.parse(fs.readFileSync(filename, "utf8"));
  const hash = () => settings.readDeliverySettings().hash;
  return { settings, read, hash };
}

test("landing.pr saves while Autopilot is off, and starts nothing", (t) => {
  const { settings, read, hash } = settingsFor(t, {});
  const saved = settings.updateDeliverySettings({
    landingPr: "auto",
    expectedHash: hash(),
  });
  assert.equal(saved.on, false);
  assert.equal(saved.landingPr, "auto");
  assert.equal(read().delivery, undefined);
});

test("turnOn writes an empty delivery block, and turnOff removes it", (t) => {
  const { settings, read, hash } = settingsFor(t, {
    landing: { pr: "ready" },
  });
  assert.equal(
    settings.updateDeliverySettings({
      delivery: {},
      turnOn: true,
      expectedHash: hash(),
    }).on,
    true,
  );
  assert.deepEqual(read().delivery, {});
  const off = settings.updateDeliverySettings({
    turnOff: true,
    expectedHash: hash(),
  });
  assert.equal(off.on, false);
  assert.equal(read().delivery, undefined);
  assert.deepEqual(read().landing, { pr: "ready" });
});

test("turnOff keeps a delivery block that holds a setting", (t) => {
  const { settings, read, hash } = settingsFor(t, {
    delivery: { reviewRounds: 2, runner: "crew-mode" },
  });
  assert.throws(
    () =>
      settings.updateDeliverySettings({
        turnOff: true,
        expectedHash: hash(),
      }),
    /Autopilot stays on: .*delivery\.reviewRounds\. Remove it there first/,
  );
  assert.deepEqual(read().delivery, { reviewRounds: 2, runner: "crew-mode" });
});

test("turnOff refuses a stale hash", (t) => {
  const { settings } = settingsFor(t, { delivery: {} });
  assert.throws(
    () => settings.updateDeliverySettings({ turnOff: true, expectedHash: "x" }),
    /reload before saving/,
  );
});
