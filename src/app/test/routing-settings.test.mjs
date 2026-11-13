// Settings > Delivery and the Routing page's edits (tasks 11.8, 11.12, and
// Phase 15's skipped Settings fields): validated writes with an expected
// revision, person-only, machine-local where the spec says so.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { workspace, MACHINE } from "./fixtures/crews/workspace.mjs";

const mcp = [undefined, { mcp: true }];

test("Settings > Delivery writes PR feedback and the writer model, validated", async (t) => {
  const env = await workspace(t, { ids: ["w1"] }),
    { ops } = env;
  const before = await ops.execute("delivery.settings.get", {});
  assert.equal(before.on, true);
  assert.deepEqual(before.delivery, {});
  await assert.rejects(
    ops.execute(
      "delivery.settings.update",
      { delivery: { prFeedback: false }, expectedHash: before.hash },
      ...mcp,
    ),
    /Only a person/,
  );
  await assert.rejects(
    ops.execute("delivery.settings.update", {
      delivery: { feedbackRounds: 21 },
      expectedHash: before.hash,
    }),
    /feedbackRounds must be a whole number 1–20/,
  );
  await assert.rejects(
    ops.execute("delivery.settings.update", {
      delivery: { concurrency: 3 },
      expectedHash: before.hash,
    }),
    /delivery\.concurrency is not set here/,
  );
  const after = await ops.execute("delivery.settings.update", {
    delivery: { prFeedback: false, feedbackRounds: 3, model: "model-w" },
    expectedHash: before.hash,
  });
  assert.deepEqual(after.delivery, {
    model: "model-w",
    prFeedback: false,
    feedbackRounds: 3,
  });
  const file = JSON.parse(
    fs.readFileSync(path.join(env.root, ".avoozl.json"), "utf8"),
  );
  assert.equal(file.delivery.concurrency, 10, "other delivery keys are kept");
  await assert.rejects(
    ops.execute("delivery.settings.update", {
      delivery: {},
      expectedHash: before.hash,
    }),
    /changed; reload/,
  );
});

test("Turn on delivery writes an empty delivery section through the same save", async (t) => {
  const env = await workspace(t, { ids: ["w1"] }),
    { ops } = env,
    file = path.join(env.root, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  delete config.delivery;
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  const off = await ops.execute("delivery.settings.get", {});
  assert.equal(off.on, false);
  await assert.rejects(
    ops.execute("delivery.settings.update", {
      delivery: {},
      expectedHash: off.hash,
    }),
    /Delivery is off/,
  );
  await assert.rejects(
    ops.execute(
      "delivery.settings.update",
      { delivery: {}, expectedHash: off.hash, turnOn: true },
      ...mcp,
    ),
    /Only a person/,
  );
  const on = await ops.execute("delivery.settings.update", {
    delivery: {},
    expectedHash: off.hash,
    turnOn: true,
  });
  assert.equal(on.on, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).delivery, {});
});

test("the routing prompt is saved on this machine only, by a person", async (t) => {
  const env = await workspace(t, { ids: ["w1"] }),
    { ops } = env;
  const view = await ops.execute("routing.view", {});
  assert.equal(view.enabled, false, "off by default");
  assert.ok(view.examples.length >= 5, "canned example prompts");
  await assert.rejects(
    ops.execute("routing.update", {
      where: "workspace",
      routing: { prompt: "x" },
      expectedHash: view.configHash,
    }),
    /saved on this machine only/,
  );
  await assert.rejects(
    ops.execute(
      "routing.update",
      { routing: { enabled: true }, expectedHash: view.machineHash },
      ...mcp,
    ),
    /Only a person/,
  );
  await ops.execute("routing.update", {
    routing: { enabled: true, prompt: "Tests go remote." },
    expectedHash: view.machineHash,
  });
  const machine = JSON.parse(fs.readFileSync(MACHINE, "utf8"));
  assert.equal(machine.routing.prompt, "Tests go remote.");
  assert.ok(machine.crews, "crew settings are kept");
  const next = await ops.execute("routing.view", {});
  assert.equal(next.enabled, true);
  assert.equal(next.prompt, "Tests go remote.");
  assert.equal(
    (await ops.execute("routing.view", {}, ...mcp)).prompt,
    null,
    "sessions do not read the prompt",
  );
  await assert.rejects(
    ops.execute("routing.update", {
      routing: {},
      expectedHash: view.machineHash,
    }),
    /changed; reload/,
  );
  // The provider box: one low line, saved on this machine.
  await assert.rejects(
    ops.execute("providers.settings.update", {
      providers: { lowPercent: 80, fallback: ["m"] },
      expectedHash: next.providers.hash,
    }),
    /fallback was removed/,
  );
  await ops.execute("providers.settings.update", {
    providers: { lowPercent: 70 },
    expectedHash: next.providers.hash,
  });
  const after = await ops.execute("routing.view", {});
  assert.equal(after.providers.lowPercent, 70);
  assert.equal(after.providers.defaultLowPercent, 80);
  assert.equal(after.prompt, "Tests go remote.", "the prompt is kept");
});
