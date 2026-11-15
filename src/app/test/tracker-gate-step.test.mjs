// Tracker gates, the plugin part and the tick step (RC23.6 to RC23.8, RC23.13)
// with the test-only fake gate plugin, run by the real plugin loader.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { gateRecord, BACKOFF_MINUTES } from "../gate-step.mjs";
import { checkReply, ContractError } from "../plugin-contract.mjs";
import { validateEntry } from "../plugins.mjs";
import { readyCandidates } from "../delivery.mjs";
import { workspace, ours, T0 } from "./gate-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

test("the gate part is in the manifest, the loader and the contract", () => {
  const ok = checkReply("gate", "status", {
    state: "done",
    evidence: "shipped",
    link: "https://tracker.example.test/REV-1",
  });
  assert.deepEqual(ok, {
    state: "done",
    evidence: "shipped",
    link: "https://tracker.example.test/REV-1",
  });
  for (const bad of [
    { state: "sideways" },
    { state: "open", evidence: "x".repeat(501) },
    { state: "open", link: "javascript:alert(1)" },
    null,
  ])
    assert.throws(() => checkReply("gate", "status", bad), ContractError);
});

test("the backoff gaps grow 1, 2, 5, 15, 30 and reset when the state changes", async (t) => {
  const { store, tick, item, calls } = await workspace(t);
  item("open");
  assert.deepEqual(BACKOFF_MINUTES, [1, 2, 5, 15, 30]);
  let now = 0;
  const gaps = [];
  for (let i = 0; i < 7; i++) {
    const before = calls();
    // Not due half a minute early.
    if (i > 0) {
      await tick(now - 0.5);
      assert.equal(calls(), before, "read too early");
    }
    await tick(now);
    assert.equal(calls(), before + 1);
    const next = gateRecord(store, "sdk.1").nextCheck;
    const gap = (Date.parse(next) - (T0 + now * 60_000)) / 60_000;
    gaps.push(gap);
    now += gap;
  }
  assert.deepEqual(gaps, [1, 2, 5, 15, 30, 30, 30]);
  // A change of state starts the gaps again.
  item("failed", "rejected");
  await tick(now);
  const record = gateRecord(store, "sdk.1");
  assert.equal(record.state, "failed");
  assert.equal(
    (Date.parse(record.nextCheck) - (T0 + now * 60_000)) / 60_000,
    1,
  );
});

test("a throwing, invalid or hanging plugin gives unknown, and unknown counts in a row", async (t) => {
  const { store, tick, item, outside } = await workspace(t);
  item("open");
  outside({ mode: "throw" });
  await tick(0);
  let record = gateRecord(store, "sdk.1");
  assert.equal(record.state, "unknown");
  assert.match(record.evidence, /tracker is down/);
  assert.equal(record.unknownRun, 1);
  outside({ mode: "invalid" });
  await tick(1);
  record = gateRecord(store, "sdk.1");
  assert.equal(record.state, "unknown");
  assert.equal(record.unknownRun, 2);
  outside({ mode: "hang" });
  await tick(5, { timeoutMs: 300 });
  record = gateRecord(store, "sdk.1");
  assert.equal(record.state, "unknown");
  assert.match(record.evidence, /timed out/);
  assert.equal(record.unknownRun, 3);
  // A good read ends the run.
  outside({ mode: null });
  await tick(30);
  assert.equal(gateRecord(store, "sdk.1").state, "open");
  assert.equal(gateRecord(store, "sdk.1").unknownRun, 0);
});

test("done releases the dependent on the same pass; a later open read adds one note and nothing else", async (t) => {
  const { store, tick, item, calls } = await workspace(t);
  item("open");
  await tick(0);
  assert.deepEqual(ours(readyCandidates(store)), []);
  item("done", "the review shipped", "https://tracker.example.test/REV-1");
  await tick(1);
  const record = gateRecord(store, "sdk.1");
  assert.equal(record.state, "done");
  assert.equal(record.link, "https://tracker.example.test/REV-1");
  assert.deepEqual(ours(readyCandidates(store)), ["sdk.2"]);
  // The tracker reopens: one read, one note, still released.
  item("open", "reopened");
  const before = calls();
  await tick(2);
  await tick(3);
  await tick(60);
  assert.equal(calls(), before + 1);
  assert.deepEqual(ours(readyCandidates(store)), ["sdk.2"]);
  assert.equal(gateRecord(store, "sdk.1").state, "done");
  const notes = store
    .events({ limit: 500 })
    .filter((event) => event.kind === "gate.differs");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].taskId, "sdk.1");
});

test("a content rule hit stores the withheld text, not the evidence", async (t) => {
  const { store, tick, item } = await workspace(t, { rules: true });
  item("open", "see the forbiddenword notes", "https://tracker.example.test/1");
  await tick(0);
  const record = gateRecord(store, "sdk.1");
  assert.equal(record.evidence, "withheld by content rules");
  assert.equal(record.link, null);
  assert.ok(!JSON.stringify(record).includes("forbiddenword"));
});

test("no credential is read from or written to settings: a token in plugin config is refused and the schema has no gate token field", () => {
  assert.throws(
    () =>
      validateEntry({
        id: "fake-gate",
        path: "x",
        contract: 1,
        config: { token: "abc123" },
      }),
    /looks like a credential/,
  );
  assert.doesNotThrow(() =>
    validateEntry({
      id: "fake-gate",
      path: "x",
      contract: 1,
      config: { tokenEnv: "TRACKER_TOKEN" },
    }),
  );
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(import.meta.dirname, "..", "..", "avoozl-config.schema.json"),
      "utf8",
    ),
  );
  const names = [];
  (function walk(value, trail) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (trail.at(-1) === "properties") names.push([...trail, key].join("."));
      walk(child, [...trail, key]);
    }
  })(schema, []);
  assert.deepEqual(
    names.filter(
      (name) =>
        /gate|tracker/i.test(name) &&
        /token|secret|password|cookie|credential/i.test(name),
    ),
    [],
  );
});
