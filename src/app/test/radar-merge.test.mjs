// rc-5.3: manual mode and the conflict label (RC5.3, RC5.6, RC5.7, design D7),
// with a fake GitHub that records every write. Nothing reaches the network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { mergeNeedsYou, mergeStep } from "../radar-merge.mjs";
import { fixture } from "./fixtures.mjs";
import { FakeGitHub } from "./fake-github.mjs";

const REPO = "example/code";
const CONFLICT = "avoozl:merge-conflict";

function pull(number, extra = {}) {
  return {
    number,
    title: `Change ${number}`,
    html_url: `https://github.com/${REPO}/pull/${number}`,
    draft: false,
    state: "open",
    user: { login: "crew-bot" },
    head: { sha: `sha${number}`, repo: { full_name: REPO } },
    labels: [],
    mergeable: true,
    mergeable_state: "clean",
    checks: [{ name: "build", status: "completed", conclusion: "success" }],
    ...extra,
  };
}

// Every call that could change GitHub lands in `writes`. A merge or arm call
// would be a bug, so the fake has none and a call would throw.
function fake(pulls) {
  const github = {
    writes: [],
    reads: 0,
    failList: null,
    available: () => true,
    pulls,
    async listPullRequests() {
      github.reads += 1;
      if (github.failList) throw Error(github.failList);
      return github.pulls
        .filter((p) => p.state === "open")
        .map((p) => ({ ...p, labels: [...p.labels] }));
    },
    async pullRequest(_repo, number) {
      return structuredClone(github.pulls.find((p) => p.number === number));
    },
    async checkRuns(_repo, sha) {
      return structuredClone(
        github.pulls.find((p) => p.head.sha === sha)?.checks ?? [],
      );
    },
    async commitStatus() {
      return { statuses: [] };
    },
    async addLabels(_repo, number, labels) {
      github.writes.push(["add", number, ...labels]);
      const p = github.pulls.find((entry) => entry.number === number);
      for (const name of labels) p.labels.push({ name });
    },
    async removeLabel(_repo, number, label) {
      github.writes.push(["remove", number, label]);
      const p = github.pulls.find((entry) => entry.number === number);
      p.labels = p.labels.filter((entry) => entry.name !== label);
    },
  };
  return github;
}

const policy = (extra = {}) => ({
  mode: "single-repo",
  repositories: {
    [REPO]: {
      coder: "issue-radar",
      baseBranch: "main",
      requiredChecks: ["build"],
      radar: { planLabel: "avoozl:plan", conflictLabel: CONFLICT },
      ...extra,
    },
  },
});
const MANUAL = { ship: "manual" };
const AUTO = { ship: "auto-merge" };

let clock = Date.parse("2026-11-14T10:00:00Z");
function run(store, github, shipPolicy, options = {}) {
  clock += 3 * 60 * 1000;
  return mergeStep(store, github, options.policy ?? policy(), shipPolicy, {
    now: clock,
    ...options,
  });
}
const rows = (store, kind) =>
  mergeNeedsYou(store).filter((r) => r.kind === kind);

test("manual: one Ready to merge row per green pull request, and nothing is armed", async (t) => {
  const { store } = fixture(t),
    github = fake([pull(1), pull(2)]);
  const first = await run(store, github, MANUAL);
  assert.equal(rows(store, "ready-to-merge").length, 2);
  assert.deepEqual(
    rows(store, "ready-to-merge").map((r) => r.pullRequest),
    [1, 2],
  );
  assert.equal(first.notify.length, 2);
  // Two more ticks: still one row each, no new notice, no write of any kind.
  for (let i = 0; i < 2; i += 1)
    assert.equal((await run(store, github, MANUAL)).notify.length, 0);
  assert.equal(rows(store, "ready-to-merge").length, 2);
  assert.deepEqual(github.writes, []);
});

test("manual: a row needs every required check green on a clean, open, non-draft, same-repository pull request", async (t) => {
  const { store } = fixture(t),
    github = fake([
      pull(1, { checks: [{ name: "build", status: "in_progress" }] }),
      pull(2, {
        checks: [{ name: "build", status: "completed", conclusion: "failure" }],
      }),
      pull(3, {
        checks: [{ name: "lint", status: "completed", conclusion: "success" }],
      }),
      pull(4, { draft: true }),
      pull(5, { head: { sha: "sha5", repo: { full_name: "fork/code" } } }),
      pull(6, { mergeable: null, mergeable_state: "unknown" }),
      pull(7, { checks: [] }),
      pull(8, { mergeable_state: "blocked" }),
      pull(9),
    ]);
  await run(store, github, MANUAL);
  assert.deepEqual(
    rows(store, "ready-to-merge").map((r) => r.pullRequest),
    [9],
  );
});

test("a row goes when its pull request stops being ready, merges or closes", async (t) => {
  const { store } = fixture(t),
    github = fake([pull(1), pull(2)]);
  await run(store, github, MANUAL);
  github.pulls[0].checks = [
    { name: "build", status: "completed", conclusion: "failure" },
  ];
  github.pulls[1].state = "closed";
  await run(store, github, MANUAL);
  assert.deepEqual(rows(store, "ready-to-merge"), []);
});

test("auto-merge shows no Ready to merge row and arms nothing here", async (t) => {
  const { store } = fixture(t),
    github = fake([pull(1)]);
  await run(store, github, AUTO);
  assert.deepEqual(rows(store, "ready-to-merge"), []);
  assert.deepEqual(github.writes, []);
});

test("a conflicted pull request gets the label and one row; resolving removes both", async (t) => {
  const { store } = fixture(t),
    github = fake([
      pull(1, { mergeable: false, mergeable_state: "dirty" }),
      pull(2),
    ]);
  const first = await run(store, github, AUTO);
  assert.deepEqual(github.writes, [["add", 1, CONFLICT]]);
  assert.equal(rows(store, "needs-human").length, 1);
  assert.equal(rows(store, "needs-human")[0].pullRequest, 1);
  assert.match(rows(store, "needs-human")[0].title, /merge conflict/i);
  assert.equal(first.notify.length, 1);
  // Two more ticks: the label is on, so nothing is written again.
  for (let i = 0; i < 2; i += 1) await run(store, github, AUTO);
  assert.deepEqual(github.writes, [["add", 1, CONFLICT]]);
  assert.equal(rows(store, "needs-human").length, 1);
  // Resolved.
  github.pulls[0].mergeable = true;
  github.pulls[0].mergeable_state = "clean";
  await run(store, github, AUTO);
  assert.deepEqual(github.writes.at(-1), ["remove", 1, CONFLICT]);
  assert.deepEqual(rows(store, "needs-human"), []);
  assert.deepEqual(github.pulls[0].labels, []);
});

test("conflicts are labelled in manual mode too, and a conflicted pull request is never ready", async (t) => {
  const { store } = fixture(t),
    github = fake([pull(1, { mergeable: false, mergeable_state: "dirty" })]);
  await run(store, github, MANUAL);
  assert.deepEqual(github.writes, [["add", 1, CONFLICT]]);
  assert.deepEqual(rows(store, "ready-to-merge"), []);
});

test("an unknown mergeability changes nothing; a closed pull request drops its row", async (t) => {
  const { store } = fixture(t),
    github = fake([pull(1, { mergeable: false, mergeable_state: "dirty" })]);
  await run(store, github, AUTO);
  github.pulls[0].mergeable = null;
  github.pulls[0].mergeable_state = "unknown";
  await run(store, github, AUTO);
  assert.equal(rows(store, "needs-human").length, 1);
  assert.equal(github.writes.length, 1);
  github.pulls[0].state = "closed";
  await run(store, github, AUTO);
  assert.deepEqual(rows(store, "needs-human"), []);
});

test("a label set by hand on a clean pull request is removed, and the label name is the configured one", async (t) => {
  const { store } = fixture(t),
    github = fake([
      pull(1, { labels: [{ name: "clash" }] }),
      pull(2, { mergeable: false, mergeable_state: "dirty" }),
    ]);
  await run(store, github, AUTO, {
    policy: policy({ radar: { conflictLabel: "clash" } }),
  });
  assert.deepEqual(github.writes, [
    ["remove", 1, "clash"],
    ["add", 2, "clash"],
  ]);
});

test("only the conflict label is ever written; Radar's labels are left alone", async (t) => {
  const { store } = fixture(t),
    github = fake([
      pull(1, {
        mergeable: false,
        mergeable_state: "dirty",
        labels: [
          { name: "avoozl:plan" },
          { name: "crew: in progress" },
          { name: "ready" },
        ],
      }),
      pull(2, {
        labels: [{ name: "avoozl:plan" }, { name: "crew: in progress" }],
      }),
    ]);
  await run(store, github, MANUAL);
  await run(store, github, MANUAL);
  for (const [, , label] of github.writes) assert.equal(label, CONFLICT);
});

test("repositories not coded by Issue Radar are skipped without a read", async (t) => {
  const { store } = fixture(t),
    github = fake([pull(1, { mergeable: false, mergeable_state: "dirty" })]);
  await run(store, github, MANUAL, { policy: policy({ coder: "worker" }) });
  assert.equal(github.reads, 0);
  assert.deepEqual(github.writes, []);
});

test("a repository that cannot be read keeps its rows, writes nothing and says why", async (t) => {
  const { store } = fixture(t),
    github = fake([
      pull(1),
      pull(2, { mergeable: false, mergeable_state: "dirty" }),
    ]);
  await run(store, github, MANUAL);
  const writes = github.writes.length;
  github.failList = "boom";
  const result = await run(store, github, MANUAL);
  assert.equal(github.writes.length, writes);
  assert.equal(rows(store, "ready-to-merge").length, 1);
  assert.equal(rows(store, "needs-human").length, 1);
  assert.equal(result.notify.length, 0);
  assert.match(result.errors[0], /boom/);
});

test("a read inside the interval is skipped unless forced", async (t) => {
  const { store } = fixture(t),
    github = fake([pull(1)]);
  await mergeStep(store, github, policy(), MANUAL, { now: clock });
  const reads = github.reads;
  await mergeStep(store, github, policy(), MANUAL, { now: clock + 1000 });
  assert.equal(github.reads, reads);
  await mergeStep(store, github, policy(), MANUAL, {
    now: clock + 1000,
    force: true,
  });
  assert.equal(github.reads, reads + 1);
});

test("a write that fails is retried next tick and does not hide the row", async (t) => {
  const { store } = fixture(t),
    github = fake([pull(1, { mergeable: false, mergeable_state: "dirty" })]),
    add = github.addLabels;
  github.addLabels = async () => {
    throw Error("denied");
  };
  const result = await run(store, github, AUTO);
  assert.equal(rows(store, "needs-human").length, 1);
  assert.match(result.errors[0], /denied/);
  github.addLabels = add;
  await run(store, github, AUTO);
  assert.deepEqual(github.writes, [["add", 1, CONFLICT]]);
});

test("conflicts.view carries both kinds of row", async (t) => {
  const { root, store } = fixture(t),
    github = fake([
      pull(1),
      pull(2, { mergeable: false, mergeable_state: "dirty" }),
    ]);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            requiredChecks: ["build"],
            coder: "issue-radar",
          },
        },
      },
      delivery: MANUAL,
    }),
  );
  await run(store, github, MANUAL);
  const ops = new Operations(store, { github, workspaceRoot: root }),
    view = await ops.execute("conflicts.view", {});
  assert.equal(
    view.items.filter((i) => i.kind === "ready-to-merge" && i.pullRequest === 1)
      .length,
    1,
  );
  assert.equal(
    view.items.filter((i) => i.kind === "needs-human" && i.pullRequest === 2)
      .length,
    1,
  );
});

test("the tick runs the step: a row and a label, then both gone when resolved", async (t) => {
  const { root, store } = fixture(t),
    fake_ = fake([
      pull(1),
      pull(2, { mergeable: false, mergeable_state: "dirty" }),
    ]),
    github = Object.assign(new FakeGitHub(), fake_);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      namespace: "avz_0123456789abcdef",
      github: {
        mode: "single-repo",
        repositories: {
          [REPO]: {
            baseBranch: "main",
            requiredChecks: ["build"],
            coder: "issue-radar",
          },
        },
      },
      delivery: MANUAL,
    }),
  );
  const ops = new Operations(store, { github, workspaceRoot: root }),
    items = async () => (await ops.execute("conflicts.view", {})).items;
  // The page's own tick plans only; it reads and writes nothing here.
  await ops.execute("workspace.tick", {});
  assert.equal(fake_.reads, 0);
  await ops.execute("workspace.tick", { cron: true, sessions: [] });
  assert.deepEqual(fake_.writes, [["add", 2, CONFLICT]]);
  assert.deepEqual((await items()).map((i) => [i.kind, i.pullRequest]).sort(), [
    ["needs-human", 2],
    ["ready-to-merge", 1],
  ]);
  fake_.pulls[1].mergeable = true;
  fake_.pulls[1].mergeable_state = "clean";
  store.setMeta("radarMerge", {
    ...store.getMeta("radarMerge"),
    readAt: new Date(0).toISOString(),
  });
  await ops.execute("workspace.tick", { cron: true, sessions: [] });
  assert.deepEqual(fake_.writes.at(-1), ["remove", 2, CONFLICT]);
  assert.deepEqual((await items()).map((i) => [i.kind, i.pullRequest]).sort(), [
    ["ready-to-merge", 1],
    ["ready-to-merge", 2],
  ]);
});
