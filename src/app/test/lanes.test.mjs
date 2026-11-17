import assert from "node:assert/strict";
import test from "node:test";
import { deliveryPolicy } from "../delivery.mjs";
import { loadLayeredConfig } from "../layered-config.mjs";
import {
  DEFAULT_LANES,
  freeLocalLanes,
  startWithinLanes,
  validateLanes,
} from "../lanes.mjs";
import fs from "node:fs";
import path from "node:path";
import { temporaryDirectory } from "./temporary.mjs";

test("lanes.local defaults to 3", () => {
  assert.equal(DEFAULT_LANES.local, 3);
  assert.deepEqual(validateLanes(undefined), { local: 3 });
  assert.deepEqual(validateLanes({}), { local: 3 });
  assert.deepEqual(validateLanes({ local: 5 }), { local: 5 });
});

test("with 4 ready tasks only 3 start, and the fourth waits", () => {
  const ready = ["t1", "t2", "t3", "t4"];
  assert.deepEqual(startWithinLanes(ready, undefined), ["t1", "t2", "t3"]);
  assert.deepEqual(startWithinLanes(ready, { local: 3 }, 1), ["t1", "t2"]);
  assert.deepEqual(startWithinLanes(ready, { local: 3 }, 3), []);
  assert.deepEqual(startWithinLanes(ready, { local: 0 }), []);
  assert.equal(freeLocalLanes({ local: 2 }, 5), 0);
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

test("delivery concurrency defaults to the lanes, and an explicit value wins", () => {
  assert.equal(deliveryPolicy({ delivery: {} }).concurrency, 3);
  assert.equal(
    deliveryPolicy({ delivery: {}, lanes: { local: 2 } }).concurrency,
    2,
  );
  assert.equal(
    deliveryPolicy({ delivery: { concurrency: 1 }, lanes: { local: 2 } })
      .concurrency,
    1,
  );
});
