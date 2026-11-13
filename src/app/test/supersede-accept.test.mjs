// Tasks 9.8 (supersede by hand) and 9.7 (acceptFrom: "validation" and the
// typed-acceptance paths it closes). Design §5.2, Requirements 36.11, 38.4,
// 38.5 and 39. Isolated temporary workspaces only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { planCheckRuns, planVerifierDispatches } from "../delivery.mjs";
import { readDeliveryPolicy } from "../tick.mjs";
import { lintSpec, readSpecFolder } from "../spec-plans.mjs";
import { queryTasks } from "../../model.mjs";
import { snapshot } from "./fixtures.mjs";
import { specFiles, writeSpec } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const SHA = (c) => c.repeat(40);

const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  kind: "leaf",
  completion: "integrated",
  ...extra,
});

function workspace(t, { tasks = [], edges = [], policy } = {}) {
  const root = temporaryDirectory("avoozl-supersede-"),
    store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges });
  if (policy)
    fs.writeFileSync(
      path.join(root, ".avoozl.json"),
      JSON.stringify({ version: 1, ...policy }),
    );
  return { root, store, ops: new Operations(store, { workspaceRoot: root }) };
}

const ready = (ops) =>
  queryTasks(ops.read(), { scope: "all", q: "ready:true" }).map((t) => t.id);
const task = (ops, id) => ops.read().tasks.find((t) => t.id === id);
const refused = (promise, pattern) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.status, 409);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });

const approve = async (ops, id = "config") => {
  const preview = await ops.execute("plan.preview", { id });
  return ops.execute("plan.approve", {
    id,
    expectedHash: preview.reviewedHash,
    expectedRevision: preview.expectedRevision,
  });
};

test("supersede moves dependents to the new task, and re-approval leaves the chain alone", async (t) => {
  const { root, ops } = workspace(t),
    directory = writeSpec(root, "config"),
    plan = await ops.execute("plan.create", { spec: "config" });
  await approve(ops);
  assert.ok(ready(ops).includes("config.1.1"));

  const result = await ops.execute("task.supersede", {
    id: "config.1.1",
    create: { id: "config-load", title: "Read the config file again" },
    reason: "The first task named the wrong file.",
  });
  assert.equal(result.task.id, "config-load");
  const old = task(ops, "config.1.1"),
    replacement = task(ops, "config-load");
  assert.equal(old.status, "superseded");
  assert.equal(old.supersededBy, "config-load");
  assert.equal(replacement.supersedes, "config.1.1");
  assert.equal(replacement.planId, undefined);
  assert.deepEqual(replacement.checks, ["npm test"]);
  // Not complete, never ready, hidden by default.
  const status = ops.read().statuses.find((s) => s.id === "superseded");
  assert.equal(status.complete, false);
  assert.deepEqual(ready(ops), ["config-load"]);
  assert.ok(
    !queryTasks(ops.read(), { scope: "all" }).some(
      (t) => t.id === "config.1.1",
    ),
  );
  // config.1.2 requires config.1.1, which now means config-load. The edge
  // itself is not rewritten.
  assert.ok(
    ops
      .read()
      .edges.some((e) => e.from === "config.1.1" && e.to === "config.1.2"),
  );

  // Re-approve after an unrelated change: the chain and status stay.
  const manifest = path.join(directory, "avoozl/manifest.json"),
    value = JSON.parse(fs.readFileSync(manifest, "utf8"));
  value.tasks["1"].summary = "The whole goal.";
  fs.writeFileSync(manifest, JSON.stringify(value, null, 2) + "\n");
  await ops.execute("plan.save", { id: "config", expectedHash: plan.hash });
  await approve(ops);
  assert.equal(task(ops, "config.1.1").status, "superseded");
  assert.equal(task(ops, "config.1.1").supersededBy, "config-load");
  assert.equal(task(ops, "config-load").supersedes, "config.1.1");
  assert.ok(!ready(ops).includes("config.1.2"));

  await ops.execute("task.update", { id: "config-load", status: "accepted" });
  assert.ok(ready(ops).includes("config.1.2"));
  // A replacement can itself be replaced; the old task cannot be again.
  await refused(
    ops.execute("task.supersede", { id: "config.1.1", create: {} }),
    /already superseded by config-load/,
  );
});

test("supersede copies edges unless told, picks an ID, and refuses cycles and taken IDs", async (t) => {
  const { ops } = workspace(t, {
    tasks: [leaf("a"), leaf("b"), leaf("c"), leaf("d")],
    edges: [
      { id: "a:requires:b", from: "a", to: "b", kind: "requires" },
      {
        id: "d:requires:b",
        from: "d",
        to: "b",
        kind: "requires",
        condition: "integrated",
      },
      { id: "b:requires:c", from: "b", to: "c", kind: "requires" },
    ],
  });
  await refused(
    ops.execute("task.supersede", { id: "b", create: { id: "a" } }),
    /already exists/,
  );
  // b's replacement requiring c, which waits on b, would wait on itself.
  await refused(
    ops.execute("task.supersede", { id: "b", create: { requires: ["c"] } }),
    /cycle/,
  );
  assert.equal(task(ops, "b").status, "planned", "a refusal writes nothing");
  await assert.rejects(
    ops.execute("task.supersede", { id: "b", create: { acceptFrom: null } }),
    /cannot be set/,
  );
  const { task: copy } = await ops.execute("task.supersede", { id: "b" });
  assert.equal(copy.id, "b-r2");
  assert.deepEqual(
    ops
      .read()
      .edges.filter((e) => e.to === "b-r2")
      .map((e) => [e.from, e.condition ?? null])
      .sort(),
    [
      ["a", null],
      ["d", "integrated"],
    ],
  );
  const { task: chosen } = await ops.execute("task.supersede", {
    id: "b-r2",
    create: { requires: ["a"] },
  });
  assert.deepEqual(
    ops
      .read()
      .edges.filter((e) => e.to === chosen.id)
      .map((e) => e.from),
    ["a"],
  );
  // c follows the chain to its newest task.
  await ops.execute("task.update", { id: "a", status: "accepted" });
  assert.ok(!ready(ops).includes("c"));
  await ops.execute("task.update", { id: chosen.id, status: "accepted" });
  assert.ok(ready(ops).includes("c"));
});

test("supersede is refused for GitHub and plugin tasks", async (t) => {
  const { ops } = workspace(t, {
    tasks: [
      leaf("gh", { github: { repository: "example/fixture", number: 4 } }),
      leaf("pl", { authority: "plugin:tracker" }),
    ],
  });
  await refused(ops.execute("task.supersede", { id: "gh", create: {} }));
  await refused(
    ops.execute("task.supersede", { id: "pl", create: {} }),
    /plugin:tracker/,
  );
  assert.equal(task(ops, "gh").status, "planned");
});

test("a superseded task gets no new verifier or check run; its running session is left alone", async (t) => {
  const checkout = temporaryDirectory("avoozl-checkout-"),
    { store, ops } = workspace(t, {
      tasks: [leaf("a", { repository: "app", checks: ["npm test"] })],
    });
  store.put("projects", { id: "app", root: checkout, baseBranch: "main" });
  store.put("task_deliveries", {
    id: "a",
    taskId: "a",
    state: "done",
    commit: SHA("a"),
    attempts: [{ attempt: 1, outcome: "done", commit: SHA("a") }],
  });
  await ops.execute("session.bind", {
    taskId: "a",
    slot: "slot-1",
    attempt: 1,
    source: "tick",
    title: "avoozl:a Task a",
  });
  assert.equal(planCheckRuns(store).length, 1);
  assert.deepEqual(planVerifierDispatches(store), [], "a command-only bar");
  store.mutate("judge", (draft) => {
    draft.tasks.find((x) => x.id === "a").verify = "agent";
  });
  assert.equal(planVerifierDispatches(store).length, 1);
  await ops.execute("task.supersede", { id: "a", create: { id: "a-new" } });
  assert.deepEqual(planVerifierDispatches(store), []);
  assert.deepEqual(planCheckRuns(store), []);
  assert.ok(store.get("session_bindings", "slot-1"), "the binding is kept");
  assert.equal(store.get("task_deliveries", "a").state, "done");
});

test("acceptFrom is a manifest field on local integrated leaves only", async (t) => {
  const root = temporaryDirectory(),
    manifest = JSON.parse(specFiles()["avoozl/manifest.json"]);
  manifest.tasks["1.1"].acceptFrom = "validation";
  writeSpec(root, "config", {
    "avoozl/manifest.json": JSON.stringify(manifest, null, 2),
  });
  const lint = (name) =>
    lintSpec({ spec: readSpecFolder(root, name), plan: { id: name } })
      .diagnostics;
  assert.deepEqual(lint("config"), []);
  const bad = structuredClone(manifest);
  bad.tasks["1"].acceptFrom = "validation";
  bad.tasks["1.2"].acceptFrom = "typed";
  writeSpec(root, "bad", {
    "avoozl/manifest.json": JSON.stringify(bad, null, 2),
  });
  const found = lint("bad").map((d) => `${d.code} ${d.taskId}`);
  assert.ok(found.includes("leaf.accept-from bad.1"), found.join(", "));
  assert.ok(found.includes("manifest.schema bad.1.2"), found.join(", "));
  const { ops } = workspace(t);
  writeSpec(ops.workspaceRoot, "config", {
    "avoozl/manifest.json": JSON.stringify(manifest, null, 2),
  });
  await ops.execute("plan.create", { spec: "config" });
  await approve(ops);
  assert.equal(task(ops, "config.1.1").acceptFrom, "validation");
  assert.equal(task(ops, "config.1.2").acceptFrom, undefined);
});

const receipt = (commit) => ({
  commit,
  at: new Date().toISOString(),
  branch: "main",
  repo: "/tmp/app",
  evidence: ["Typed by hand."],
});

test("task.update cannot type its way past acceptFrom", async (t) => {
  const { ops } = workspace(t, {
    tasks: [leaf("w", { acceptFrom: "validation", checks: ["npm test"] })],
  });
  await refused(
    ops.execute("task.update", { id: "w", integration: receipt(SHA("1")) }),
  );
  await refused(ops.execute("task.update", { id: "w", status: "accepted" }));
  await refused(
    ops.execute("task.update", { id: "w", checks: ["true"] }),
    /approved plan/,
  );
  await refused(
    ops.execute("task.update", { id: "w", acceptFrom: undefined }),
    /plan approval/,
  );
  await refused(
    ops.execute("task.update", {
      id: "xyz",
      create: true,
      acceptFrom: "validation",
    }),
  );
  // Other edits, and resending the same checks, still work.
  await ops.execute("task.update", {
    id: "w",
    notes: "Still going.",
    checks: ["npm test"],
    status: "partial",
  });
  assert.equal(task(ops, "w").notes, "Still going.");
  assert.equal(task(ops, "w").integration, undefined);
});

function record(store, taskId, commit, argv, exitCode, at) {
  const id = `ev-${commit.slice(0, 4)}-${argv.join("-")}-${at}`;
  store.put("evidence", {
    id,
    kind: "command",
    taskId,
    commit,
    argv,
    exitCode,
    startedAt: at,
    endedAt: at,
  });
  return id;
}

function integrate(store, id, commit) {
  store.mutate("Integrate " + id, (data) => {
    data.tasks.find((t) => t.id === id).integration = {
      commit,
      branch: "avoozl/" + id,
      into: "main",
      at: new Date().toISOString(),
    };
  });
}

test("task.accept on an acceptFrom leaf takes only Avoozl's validation at the integrated commit", async (t) => {
  const { store, ops } = workspace(t, {
    tasks: [
      leaf("w", {
        acceptFrom: "validation",
        checks: ["npm test", "scripts/validate.sh"],
      }),
    ],
  });
  await refused(
    ops.execute("task.accept", { id: "w", evidence: "Looks right." }),
    /typed evidence/,
  );
  await refused(ops.execute("task.accept", { id: "w", componentOnly: true }));
  await refused(ops.execute("task.accept", { id: "w" }), /no integrated/);
  const reviewed = SHA("c"),
    landed = SHA("d");
  // Every check passed, but at the reviewed commit, not the landed one.
  record(store, "w", reviewed, ["npm", "test"], 0, "2026-01-01T00:00:01Z");
  record(
    store,
    "w",
    reviewed,
    ["scripts/validate.sh"],
    0,
    "2026-01-01T00:00:02Z",
  );
  integrate(store, "w", landed);
  await refused(
    ops.execute("task.accept", { id: "w" }),
    /every declared check/,
  );
  // At the landed commit one check is missing, then fails, then passes.
  record(store, "w", landed, ["npm", "test"], 0, "2026-01-01T00:01:00Z");
  await refused(ops.execute("task.accept", { id: "w" }));
  record(
    store,
    "w",
    landed,
    ["scripts/validate.sh"],
    1,
    "2026-01-01T00:01:01Z",
  );
  await refused(ops.execute("task.accept", { id: "w" }));
  // The checks role passes it at the landed commit (a verdict on the delivery).
  store.put("task_deliveries", {
    id: "w",
    taskId: "w",
    state: "integrated",
    commit: landed,
    attempts: [],
    verifications: [
      {
        attempt: 1,
        commit: landed,
        outcome: "accepted",
        checks: [
          { command: "npm test", exitCode: 0 },
          { command: "scripts/validate.sh", exitCode: 0 },
        ],
        at: "2026-01-01T00:02:00Z",
      },
    ],
  });
  const accepted = await ops.execute("task.accept", { id: "w" });
  assert.equal(accepted.status, "accepted");
  assert.match(
    accepted.acceptanceEvidence.evidence,
    new RegExp(`^2 configured checks passed at commit ${landed.slice(0, 12)}`),
  );
  // The newest result for each check is the checks role's, which has no
  // evidence record of its own.
  assert.equal(accepted.acceptanceEvidence.derivedFrom, undefined);
});

test("derived acceptance evidence is for the current commit and every declared check", async (t) => {
  const { store, ops } = workspace(t, {
    tasks: [leaf("p", { checks: ["npm test", "npm run lint"] })],
  });
  const old = SHA("1"),
    current = SHA("2");
  record(store, "p", old, ["npm", "test"], 0, "2026-01-01T00:00:01Z");
  record(store, "p", old, ["npm", "run", "lint"], 0, "2026-01-01T00:00:02Z");
  record(store, "p", current, ["npm", "test"], 0, "2026-01-01T00:01:00Z");
  integrate(store, "p", current);
  // The older commit passed everything; the current one ran only one check.
  const partial = await ops.execute("task.accept", { id: "p" });
  assert.equal(partial.acceptanceEvidence.evidence, "");
  assert.equal(partial.acceptanceEvidence.derivedFrom, undefined);
  const lint = record(
    store,
    "p",
    current,
    ["npm", "run", "lint"],
    0,
    "2026-01-01T00:01:01Z",
  );
  const full = await ops.execute("task.accept", { id: "p" });
  assert.match(
    full.acceptanceEvidence.evidence,
    new RegExp(`^2 configured checks passed at commit ${current.slice(0, 12)}`),
  );
  assert.ok(full.acceptanceEvidence.derivedFrom.includes(lint));
});

test("a leaf whose repository has review roles takes no typed integration or complete status", async (t) => {
  const { root, ops } = workspace(t, {
    tasks: [
      leaf("r", { repository: "app" }),
      leaf("free", { repository: "other" }),
    ],
    policy: {
      delivery: {
        model: "fake-a",
        reviewers: [
          {
            id: "conventions",
            focus: "conventions",
            agent: "avoozl-reviewer",
            model: "fake-b",
          },
        ],
        repositories: { other: { reviewers: [] } },
      },
    },
  });
  // The policy must load, or the refusals below would test nothing.
  assert.equal(readDeliveryPolicy(root).status, "loaded");
  await refused(
    ops.execute("task.update", { id: "r", status: "accepted" }),
    /Repository app has review roles/,
  );
  await refused(
    ops.execute("task.update", { id: "r", integration: receipt(SHA("e")) }),
    /Repository app has review roles/,
  );
  assert.equal(task(ops, "r").status, "planned");
  assert.equal(task(ops, "r").integration, undefined);
  // A repository whose own list is empty has no review roles.
  await ops.execute("task.update", { id: "free", status: "accepted" });
  assert.equal(task(ops, "free").status, "accepted");
});

test("with no review roles, task.update keeps typed completion and the acceptFrom refusals", async (t) => {
  const { ops } = workspace(t, {
    tasks: [
      leaf("plain", { repository: "app" }),
      leaf("gated", { repository: "app", acceptFrom: "validation" }),
    ],
  });
  await ops.execute("task.update", {
    id: "plain",
    integration: receipt(SHA("e")),
  });
  await ops.execute("task.update", { id: "plain", status: "accepted" });
  assert.equal(task(ops, "plain").status, "accepted");
  await refused(
    ops.execute("task.update", { id: "gated", status: "accepted" }),
    /completes only through Avoozl's validation/,
  );
  await refused(
    ops.execute("task.update", { id: "plain", acceptFrom: "validation" }),
    /acceptFrom changes only through plan approval/,
  );
});
