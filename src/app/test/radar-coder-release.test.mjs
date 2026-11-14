// rc-4.1: release capacity per repository and per scope. Fake GitHub only.
// Nearby inputs checked: N=0; N larger than the eligible tasks; five eligible
// tasks with N=2; a claimed issue (keeps its slot, never touched); two
// scopes; an unknown scope name; a repeated tick; ready labels not ours that
// count against N; defaults for issue-radar and worker; invalid settings.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import {
  capacityOf,
  planRelease,
  releaseFor,
  scopeLabelOf,
} from "../radar-coder-release.mjs";
import { fixture } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { FakeGitHub } from "./fake-github.mjs";

const NAMESPACE = "avz_testtesttesttest",
  READY = "ready",
  CLAIM = "crew: in progress";

const markerOf = (issue) =>
  JSON.parse(issue.body.match(/<!-- avoozl-task\n(.*)\n-->/)[1]);
const labelsOf = (issue) => (issue.labels || []).map((label) => label.name);
const leaf = (id, extra = {}) => ({
  id,
  title: "Task " + id,
  acceptance: [id + " passes"],
  projectId: "code",
  ...extra,
});

async function setup(t, repository = {}, tasks = [], coder = "issue-radar") {
  const { store } = fixture(t),
    github = new FakeGitHub(),
    root = temporaryDirectory();
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: NAMESPACE,
      github: {
        mode: "single-repo",
        repositories: {
          "example/code": {
            baseBranch: "main",
            coder,
            managedLabels: { managed: "avoozl", ready: READY },
            ...repository,
          },
        },
      },
    }),
  );
  const ops = new Operations(store, {
    github,
    operator: "Operator",
    workspaceRoot: root,
  });
  store.put("projects", {
    id: "code",
    root: "/tmp/code",
    baseBranch: "main",
    worktreeRoot: "/tmp/code-worktrees",
    checks: [["npm", "test"]],
  });
  await ops.execute("github.configure", {
    repository: "example/code",
    projectId: "code",
    allowedActors: ["maintainer"],
  });
  const plan = await ops.execute("plan.create", {
    id: "rel",
    prompt: "Release",
    text:
      "# rel\n\n" +
      tasks
        .map((task) => "```task\n" + JSON.stringify(task) + "\n```\n")
        .join("\n"),
  });
  const approved = await ops.execute("plan.approve", {
    id: plan.id,
    expectedHash: plan.hash,
    expectedRevision: store.read().revision,
  });
  const issueOf = (id) =>
      github.created.find(
        (issue) =>
          issue.body?.includes?.("avoozl-task") &&
          markerOf(issue).taskId === id,
      ),
    readyIds = () =>
      approved.taskIds.filter((id) => labelsOf(issueOf(id)).includes(READY)),
    tick = () => ops.execute("github.project", { planId: plan.id });
  return { store, github, ops, approved, issueOf, readyIds, tick };
}

const five = () => ["a", "b", "c", "d", "e"].map((id) => leaf("leaf-" + id));

test("with N=2 and five eligible tasks, two get the label in graph order", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  await w.tick();
  assert.deepEqual(w.readyIds(), w.approved.taskIds.slice(0, 2));
});

test("a second tick writes nothing", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  await w.tick();
  const labels = w.github.labels.length,
    updated = w.github.updated.length,
    created = w.github.created.length;
  await w.tick();
  await w.tick();
  assert.equal(w.github.labels.length, labels);
  assert.equal(w.github.updated.length, updated);
  assert.equal(w.github.created.length, created);
});

test("a claimed issue keeps its slot and its labels; a freed slot goes to the next task", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  await w.tick();
  const [first, second, third] = w.approved.taskIds;
  w.issueOf(first).labels.push({ name: CLAIM });
  await w.tick();
  assert.deepEqual(w.readyIds(), [first, second]);
  // The claimed issue is never touched, even with an old label write pending.
  assert.equal(
    w.github.labels.some(([kind, , l]) => kind === "remove" && l === READY),
    false,
  );
  assert.deepEqual(w.readyIds(), [first, second]);
  assert.equal(labelsOf(w.issueOf(third)).includes(READY), false);
  // The claimed issue's task is blocked by nothing now; a claim on a second
  // issue keeps both slots, so the third still waits.
  w.issueOf(second).labels.push({ name: CLAIM });
  await w.tick();
  assert.deepEqual(w.readyIds(), [first, second]);
  assert.equal(labelsOf(w.issueOf(first)).includes(CLAIM), true);
});

test("N=0 releases nothing", async (t) => {
  const w = await setup(t, { release: { capacity: 0 } }, five());
  await w.tick();
  assert.deepEqual(w.readyIds(), []);
  assert.equal(
    w.github.labels.some(([kind]) => kind === "add" && false),
    false,
  );
});

test("N larger than the eligible tasks labels every eligible task and no more", async (t) => {
  const w = await setup(t, { release: { capacity: 9 } }, [
    leaf("free-one"),
    leaf("free-two"),
    leaf("later", { requires: ["free-one"] }),
  ]);
  await w.tick();
  assert.deepEqual(w.readyIds(), w.approved.taskIds.slice(0, 2));
});

test("two scopes release independently, each up to its own N", async (t) => {
  const tasks = [
      leaf("code-a"),
      leaf("code-b"),
      leaf("docs-a", { scope: "docs-ready" }),
      leaf("docs-b", { scope: "docs-ready" }),
      leaf("docs-c", { scope: "docs-ready" }),
    ],
    w = await setup(
      t,
      {
        release: {
          capacity: 1,
          scopes: [{ label: "docs-ready", capacity: 2 }],
        },
      },
      tasks,
    );
  await w.tick();
  const [codeA, codeB, docsA, docsB, docsC] = w.approved.taskIds,
    has = (id, label) => labelsOf(w.issueOf(id)).includes(label);
  assert.deepEqual(
    [codeA, codeB].filter((id) => has(id, READY)),
    [codeA],
  );
  assert.deepEqual(
    [docsA, docsB, docsC].filter((id) => has(id, "docs-ready")),
    [docsA, docsB],
  );
  assert.equal(has(docsA, READY), false);
  // Claiming a docs issue frees nothing in the code scope.
  w.issueOf(docsA).labels.push({ name: CLAIM });
  await w.tick();
  assert.equal(has(codeB, READY), false);
  assert.equal(has(docsC, "docs-ready"), false);
});

test("a task naming an unknown scope falls back to the repository's ready label", async (t) => {
  const w = await setup(t, { release: { capacity: 1 } }, [
    leaf("odd", { scope: "nobody" }),
  ]);
  await w.tick();
  assert.deepEqual(w.readyIds(), w.approved.taskIds);
});

test("ready issues Avoozl does not own count against N", async (t) => {
  const w = await setup(t, { release: { capacity: 2 } }, five());
  w.github.created.push({
    id: 700,
    repository: "example/code",
    node_id: "issue-700",
    number: 700,
    state: "open",
    title: "Someone's",
    body: "no marker",
    labels: [{ name: "avoozl" }, { name: READY }],
    assignees: [],
  });
  await w.tick();
  assert.equal(w.readyIds().length, 1);
});

test("N defaults to 2 for issue-radar and to no cap for worker", async (t) => {
  const radar = await setup(t, {}, five());
  await radar.tick();
  assert.equal(radar.readyIds().length, 2);
  const worker = await setup(t, {}, five(), "worker");
  await worker.tick();
  assert.equal(worker.readyIds().length, 5);
});

test("bad release settings are refused", async (t) => {
  for (const [release, message] of [
    [{ capacity: -1 }, /release\.capacity must be a whole number/],
    [{ capacity: 101 }, /release\.capacity must be a whole number/],
    [{ scopes: [{ label: READY }] }, /cannot use ready/],
    [{ scopes: [{ label: "a" }, { label: "A" }] }, /repeats A/],
    [{ scopes: [{ label: CLAIM }] }, /cannot use crew: in progress/],
    [{ extra: 1 }, /extra/],
  ])
    await assert.rejects(setup(t, { release }, five()), message);
});

test("planRelease: claimed holders keep their label even above the cap", () => {
  const keep = planRelease({
    candidates: [
      { id: "x", label: "r", holds: true, claimed: true },
      { id: "y", label: "r", holds: true, claimed: true },
      { id: "z", label: "r", holds: true, claimed: false },
      { id: "n", label: "r", holds: false, claimed: false },
    ],
    capacity: () => 1,
  });
  assert.deepEqual([...keep].sort(), ["x", "y"]);
  assert.equal(
    scopeLabelOf({ releaseScope: "S" }, { scopes: [{ label: "s" }] }, "r"),
    "s",
  );
  assert.equal(capacityOf({ capacity: 3, scopes: [] }, "r", "r"), 3);
});

test("releaseFor: defaults and fallbacks", () => {
  assert.equal(releaseFor({}, "single-repo").capacity, 2);
  assert.equal(
    releaseFor({ coder: "worker" }, "single-repo").capacity,
    Infinity,
  );
  assert.equal(releaseFor({ coder: "worker", concurrency: 3 }).capacity, 3);
  assert.deepEqual(
    releaseFor(
      { release: { capacity: 4, scopes: [{ label: "d" }] } },
      "single-repo",
    ),
    { capacity: 4, scopes: [{ label: "d", capacity: 4 }] },
  );
});
