import assert from "node:assert/strict";
import test from "node:test";
import { deliveryPolicy } from "../../delivery/delivery.mjs";
import { loadLayeredConfig } from "../../settings/layered-config.mjs";
import { DEFAULT_LANES, validateLanes } from "../lanes.mjs";
import fs from "node:fs";
import path from "node:path";
import { temporaryDirectory } from "../../test/temporary.mjs";

test("lanes.local defaults to 3", () => {
  assert.equal(DEFAULT_LANES.local, 3);
  assert.deepEqual(validateLanes(undefined), { local: 3 });
  assert.deepEqual(validateLanes({}), { local: 3 });
  assert.deepEqual(validateLanes({ local: 5 }), { local: 5 });
});

test("lanes rejects a bad shape or value", () => {
  assert.throws(() => validateLanes([]), /lanes must be an object/);
  assert.throws(() => validateLanes({ remote: 2 }), /lanes\.remote is not/);
  for (const local of [-1, 33, 1.5, "3", null])
    assert.throws(() => validateLanes({ local }), /whole number 0–32/);
});

test("a saved lanes value is checked when config loads", () => {
  const root = temporaryDirectory("avoozl-lanes-");
  const load = (lanes) => {
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, lanes }),
    );
    return loadLayeredConfig({
      workspaceRoot: root,
      env: { XDG_CONFIG_HOME: temporaryDirectory("avoozl-empty-xdg-") },
    }).config;
  };
  assert.equal(load({ local: 2 }).lanes.local, 2);
  assert.throws(() => load({ local: 99 }), /lanes\.local/);
});

test("delivery concurrency defaults to the lanes, and the machine's lanes win", () => {
  assert.equal(deliveryPolicy({ delivery: {} }).concurrency, 3);
  assert.equal(
    deliveryPolicy({ delivery: {}, lanes: { local: 2 } }).concurrency,
    2,
  );
  assert.equal(
    deliveryPolicy({ delivery: {}, lanes: { local: 2 } }, { machineLanes: 1 })
      .concurrency,
    1,
  );
});
