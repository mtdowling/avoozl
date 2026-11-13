// Tasks 12.9 and 12.10: retrospectives and PDCA (Requirement 47).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pdcaResult, recordRetroReply, retroStep } from "../flow-retro.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const leaf = (id) => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
});

function setup(t, n) {
  const root = temporaryDirectory("avoozl-retro-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  const ids = Array.from({ length: n }, (_, i) => "t" + (i + 1));
  store.importSnapshot({ ...snapshot(), tasks: ids.map(leaf), edges: [] });
  store.put("projects", { id: "app", root, baseBranch: "main", checks: [] });
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({ version: 1 }, null, 2) + "\n",
  );
  const ops = new Operations(store, { workspaceRoot: root });
  let clock = Date.parse("2026-11-12T08:00:00Z");
  // Finish tasks one after another: 10 min queued, 30 min coding each.
  const finish = (list) => {
    for (const id of list) {
      const at = (m) => new Date(clock + m * 60_000).toISOString();
      store.db
        .prepare("INSERT INTO flow_spans VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(
          "q" + id,
          id,
          1,
          null,
          null,
          "queued",
          at(0),
          at(10),
          "events",
          null,
        );
      store.db
        .prepare("INSERT INTO flow_spans VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(
          "c" + id,
          id,
          1,
          null,
          "worker",
          "coding",
          at(10),
          at(40),
          "events",
          null,
        );
      store.mutate("finish " + id, (data) => {
        data.tasks.find((x) => x.id === id).integration = {
          commit: "x",
          at: at(40),
        };
      });
      clock += 40 * 60_000;
    }
    return clock;
  };
  return { root, store, ops, ids, finish };
}

const reply = JSON.stringify({
  bottleneck: {
    stage: "queued",
    repository: "app",
    evidence: "queued is 25% of lead time over 10 tasks",
  },
  proposals: [
    {
      type: "settings",
      file: "workspace",
      key: "flow.batch.max",
      from: 3,
      to: 5,
      metric: "lead time",
      direction: "down",
      evidence: "10 of 10 tasks were small in one epic",
    },
    {
      type: "settings",
      file: "workspace",
      key: "contentRules.sets",
      from: [],
      to: [],
      metric: "lead time",
      direction: "down",
      evidence: "rules slow briefs",
    },
    {
      type: "plan",
      spec: "example",
      change: "Split t3 in two",
      metric: "first-pass rate",
      direction: "up",
      evidence: "t3 was slow",
    },
  ],
});

test("ten finished tasks start one retro; its proposals are typed, bounded and never applied", async (t) => {
  const s = setup(t, 25);
  s.finish(s.ids.slice(0, 10));
  const now = Date.parse("2026-11-12T16:00:00Z"),
    first = retroStep(s.store, {}, { now, folder: "Avoozl/app" });
  assert.equal(first.dispatch.length, 1);
  assert.equal(first.dispatch[0].agent, "avoozl-retro");
  assert.equal(first.dispatch[0].role, "retro");
  assert.match(first.dispatch[0].brief, /"leadTimeMs"/);
  assert.doesNotMatch(
    first.dispatch[0].brief,
    /Works\./,
    "no task text, only numbers",
  );
  // One at a time: a second step starts nothing.
  assert.equal(
    retroStep(s.store, {}, { now: now + 60_000, folder: "Avoozl/app" }).dispatch
      .length,
    0,
  );
  const { retro } = recordRetroReply(
    s.store,
    "retro-1",
    "Here it is:\n" + reply,
  );
  assert.equal(retro.state, "done");
  assert.equal(retro.bottleneck.stage, "queued");
  assert.deepEqual(
    retro.proposals.map((p) => p.key || p.change),
    ["flow.batch.max", "Split t3 in two"],
  );
  assert.match(retro.dropped[0].reason, /guards safety/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(s.root, ".avoozl.json"), "utf8")).flow,
    undefined,
    "nothing applied",
  );
  // Only a person decides; Approve writes through the Settings operation
  // with an expected hash.
  await assert.rejects(
    s.ops.execute(
      "flow.retro.decide",
      { retroId: "retro-1", proposalId: "p1", decision: "approve" },
      undefined,
      { caller: { sessionKey: "dashboard:x" } },
    ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    s.ops.execute("flow.retro.decide", {
      retroId: "retro-1",
      proposalId: "p1",
      decision: "approve",
      expectedHash: "stale",
    }),
    /changed; reload/,
  );
  const { hash } = await s.ops.execute("flow.settings.get", {});
  await s.ops.execute("flow.retro.decide", {
    retroId: "retro-1",
    proposalId: "p1",
    decision: "approve",
    expectedHash: hash,
  });
  const file = JSON.parse(
    fs.readFileSync(path.join(s.root, ".avoozl.json"), "utf8"),
  );
  assert.deepEqual(file.flow, { batch: { max: 5 } });
  const decided = s.store.get("flow_retros", "retro-1").proposals[0];
  assert.equal(decided.status, "approved");
  assert.equal(decided.pdca.before, 40 * 60_000, "lead time over the last 10");
  await s.ops.execute("flow.retro.decide", {
    retroId: "retro-1",
    proposalId: "p2",
    decision: "reject",
    reason: "Not now",
  });
  // PDCA: 10 more tasks, lead time unchanged, did not help: the next retro
  // carries a typed revert proposal.
  const later = s.finish(s.ids.slice(10, 20)) + 2 * 3600_000;
  const second = retroStep(
    s.store,
    { flow: { batch: { max: 5 } } },
    { now: later, folder: "Avoozl/app" },
  );
  assert.equal(
    s.store.get("flow_retros", "retro-1").proposals[0].pdca.result,
    "no change",
  );
  assert.equal(second.dispatch.length, 1);
  const next = recordRetroReply(
    s.store,
    "retro-2",
    JSON.stringify({
      bottleneck: { stage: "queued", evidence: "same" },
      proposals: [],
    }),
  ).retro;
  assert.deepEqual(
    next.proposals.map((p) => [p.key, p.from, p.to, p.revertOf]),
    [["flow.batch.max", 5, 3, "retro-1:p1"]],
  );
});

test("a retro that times out or answers nothing valid is recorded failed", async (t) => {
  const s = setup(t, 10);
  s.finish(s.ids);
  const now = Date.parse("2026-11-12T16:00:00Z");
  retroStep(s.store, {}, { now, folder: "Avoozl/app" });
  retroStep(s.store, {}, { now: now + 11 * 60_000 });
  assert.match(s.store.get("flow_retros", "retro-1").error, /timed out/);
  s.store.put("flow_retros", {
    id: "retro-9",
    state: "running",
    startedAt: new Date(now).toISOString(),
    triggers: [],
    proposals: [],
  });
  assert.equal(
    recordRetroReply(s.store, "retro-9", "no json here").retro.state,
    "failed",
  );
  // A removal of a review role needs a second confirmation.
  s.store.put("flow_retros", {
    id: "retro-10",
    state: "done",
    startedAt: new Date(now).toISOString(),
    proposals: [
      {
        id: "p1",
        type: "settings",
        file: "workspace",
        key: "delivery.reviewers",
        from: [{ id: "r" }],
        to: [],
        metric: "lead time",
        direction: "down",
        evidence: "e",
        status: "open",
        removesCheck: true,
      },
    ],
  });
  await assert.rejects(
    s.ops.execute("flow.retro.decide", {
      retroId: "retro-10",
      proposalId: "p1",
      decision: "approve",
      expectedHash: "x",
    }),
    /removes a check/,
  );
  // Retro instructions live on this machine only.
  await s.ops.execute("flow.instructions.update", {
    instructions: "Prefer fewer review rounds.",
  });
  assert.equal(
    (await s.ops.execute("flow.settings.get", {})).instructions,
    "Prefer fewer review rounds.",
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(s.root, ".avoozl.json"), "utf8"),
    /fewer review/,
  );
});

test("PDCA marks helped, no change or worse at a 10% move in the expected direction", () => {
  assert.equal(pdcaResult(100, 85, "down"), "helped");
  assert.equal(pdcaResult(100, 95, "down"), "no change");
  assert.equal(pdcaResult(100, 120, "down"), "worse");
  assert.equal(pdcaResult(0.5, 0.6, "up"), "helped");
});

const approved = (id, extra) => ({
  id,
  metric: "lead time",
  direction: "down",
  evidence: "e",
  status: "approved",
  pdca: { before: 40 * 60_000, window: 10, at: 10 },
  ...extra,
});

test("PDCA measures every approved proposal of one retro in the same tick, once", async (t) => {
  const s = setup(t, 10);
  s.store.put("flow_retros", {
    id: "retro-1",
    n: 1,
    state: "done",
    triggers: [],
    startedAt: "2026-11-01T08:00:00Z",
    proposals: [
      approved("p1", {
        type: "settings",
        file: "workspace",
        key: "flow.batch.max",
        from: 3,
        to: 5,
      }),
      approved("p2", { type: "plan", spec: "example", change: "Split t3" }),
    ],
  });
  s.finish(s.ids);
  const now = Date.parse("2026-11-12T16:00:00Z");
  retroStep(s.store, {}, { now, folder: "Avoozl/app" });
  assert.deepEqual(
    s.store.get("flow_retros", "retro-1").proposals.map((p) => p.pdca.result),
    ["no change", "no change"],
  );
  assert.deepEqual(
    s.store.get("flow_retros", "retro-2").reverts.map((r) => r.revertOf),
    ["retro-1:p1", "retro-1:p2"],
  );
  retroStep(s.store, {}, { now: now + 60_000, folder: "Avoozl/app" });
  assert.deepEqual(s.store.getMeta("flow.retro.state").reverts, []);
});

test("a retry trigger within an hour of the last retro waits for the next count trigger", async (t) => {
  const s = setup(t, 10),
    now = Date.parse("2026-11-12T16:00:00Z");
  s.store.put("flow_retros", {
    id: "retro-1",
    n: 1,
    state: "done",
    triggers: [],
    proposals: [],
    startedAt: new Date(now - 30 * 60_000).toISOString(),
  });
  s.store.put("session_bindings", {
    id: "w",
    slot: "w",
    taskId: "t1",
    role: "worker",
    attempt: 3,
    source: "tick",
    status: "working",
    boundAt: new Date(now - 5 * 60_000).toISOString(),
  });
  assert.equal(retroStep(s.store, {}, { now }).retro, null);
  assert.equal(
    retroStep(s.store, {}, { now: now + 2 * 3600_000 }).retro,
    null,
    "an hour passing is not a count trigger",
  );
  s.finish(s.ids);
  const started = retroStep(s.store, {}, { now: now + 3 * 3600_000 });
  assert.equal(started.retro, "retro-2");
  assert.deepEqual(
    s.store
      .get("flow_retros", "retro-2")
      .triggers.map((x) => x.kind)
      .sort(),
    ["count", "retry"],
  );
});

test("a slow task triggers a retro past 3x the usual lead time by default; a saved factor stays", (t) => {
  const run = (saved, coding) => {
    const s = setup(t, 6),
      config = saved ? { flow: { retro: { slowFactor: saved } } } : {};
    const clock = s.finish(s.ids.slice(0, 5)),
      at = (m) => new Date(clock + m * 60_000).toISOString();
    s.store.db
      .prepare("INSERT INTO flow_spans VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(
        "ct6",
        "t6",
        1,
        null,
        "worker",
        "coding",
        at(0),
        at(coding),
        "events",
        null,
      );
    s.store.mutate("finish t6", (data) => {
      data.tasks.find((x) => x.id === "t6").integration = {
        commit: "x",
        at: at(coding),
      };
    });
    const step = retroStep(s.store, config, { now: clock + 200 * 60_000 });
    return step.retro
      ? s.store.get("flow_retros", step.retro).triggers.map((x) => x.kind)
      : [];
  };
  // The usual lead time is 40 min.
  assert.deepEqual(run(null, 100), [], "2.5x is not slow by default");
  assert.deepEqual(run(null, 130), ["slow"], "3.25x is slow by default");
  assert.deepEqual(run(2, 100), ["slow"], "a saved 2x is kept");
});

test("a retro keeps at most 3 of its own proposals, plus the reverts it owes", async (t) => {
  const s = setup(t, 10);
  const revert = {
    type: "settings",
    file: "workspace",
    key: "flow.batch.max",
    from: 5,
    to: 3,
    metric: "lead time",
    direction: "down",
    evidence: "PDCA: did not help",
    revertOf: "retro-1:p1",
  };
  s.store.put("flow_retros", {
    id: "retro-2",
    n: 2,
    state: "running",
    triggers: [],
    reverts: [revert],
    proposals: [],
    startedAt: "2026-11-12T08:00:00Z",
  });
  const plan = (n) => ({
    type: "plan",
    spec: "example",
    change: "Change " + n,
    metric: "lead time",
    direction: "down",
    evidence: "e",
  });
  const { retro } = recordRetroReply(
    s.store,
    "retro-2",
    JSON.stringify({
      bottleneck: { stage: "queued", evidence: "e" },
      proposals: [1, 2, 3, 4].map(plan),
    }),
  );
  assert.deepEqual(
    retro.proposals.map((p) => p.change || p.revertOf),
    ["Change 1", "Change 2", "Change 3", "retro-1:p1"],
  );
  assert.equal(retro.dropped[0].reason, "more than 3 proposals");
});
