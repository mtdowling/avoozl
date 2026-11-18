// Bisect when CI goes red on a landed trunk (lt-11.2): real git with a bare
// remote, a fake GitHub that names the failing jobs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readTrainCi } from "../integrator-ci.mjs";
import { bisectRedTrain } from "../integrator-red.mjs";
import { integratorPass } from "../integrator-trains.mjs";
import {
  git,
  node,
  queued,
  train,
  trunk,
  workspace,
} from "./integrator-fixture.mjs";

const JOBS = { "test (macos)": "macos-arm64", "test (windows)": "windows-x64" };
// Fails while t2.txt exists: t2 is the bad member once it has landed.
const REJECTS_T2 = node("process.exit(require('fs').existsSync('t2.txt')?1:0)");

async function landedTrain(t, { bisectOnRed = true, concluded = true } = {}) {
  const w = await workspace(t, { policy: "optimistic" });
  w.store.put("projects", {
    ...w.store.get("projects", "app"),
    repository: "example/app",
  });
  for (const id of ["t1", "t2", "t3"]) await queued(w, id);
  const landed = await train(w);
  assert.equal(landed.train.outcome, "landed");
  if (concluded)
    w.store.put("landing_trains", {
      ...landed.train,
      ci: { run: 99, status: "completed", conclusion: "failure" },
    });
  const settings = {
    ...w.settings(),
    ci: { ...w.settings().ci, bisectOnRed, jobPlatforms: JOBS },
  };
  const calls = { jobs: 0 };
  const github = (failing) => ({
    async runJobs() {
      calls.jobs += 1;
      return [
        ...failing.map((name) => ({ name, conclusion: "failure" })),
        { name: "lint", conclusion: "success" },
      ];
    },
  });
  const red = (failing, extra = {}) =>
    bisectRedTrain(w.store, {
      project: w.store.get("projects", "app"),
      target: "main",
      settings,
      config: w.config,
      github: github(failing),
      workspaceRoot: w.root,
      ...extra,
    });
  return { w, landed, calls, red };
}

test("a failed run on a train's head is bisected and the culprit is reverted before the next train", async (t) => {
  const { w, landed, red } = await landedTrain(t);
  w.config.landing.trains.validation.full["macos-arm64"].command = REJECTS_T2;
  const before = trunk(w),
    out = await red(["test (macos)"]);
  assert.equal(out.state, "culprit");
  const record = w.store.get("landing_trains", landed.train.id);
  assert.equal(record.redCi.culprit, "t2");
  assert.equal(record.redCi.repaired, true);
  assert.deepEqual(record.culprits, ["t2"]);
  // One plain fast-forward revert of t2 on top of the pushed head.
  assert.notEqual(trunk(w), before);
  git(w.origin, "merge-base", "--is-ancestor", before, trunk(w));
  assert.equal(git(w.origin, "rev-list", "--count", `${before}..main`), "1");
  assert.equal(git(w.origin, "show", "main:t1.txt"), "t1");
  assert.equal(git(w.origin, "show", "main:t3.txt"), "t3");
  assert.throws(() => git(w.origin, "cat-file", "-e", "main:t2.txt"));
  // Handled once: the next call does nothing.
  assert.equal((await red(["test (macos)"])).state, null);
});

test("a failed run on a head no train pushed changes nothing", async (t) => {
  const { w, calls, red } = await landedTrain(t, { concluded: false });
  const github = {
    workflowRuns: async () => [
      {
        id: 5,
        workflow: ".github/workflows/ci.yml",
        headSha: "f".repeat(40),
        event: "push",
        status: "completed",
        conclusion: "failure",
      },
    ],
  };
  await readTrainCi(w.store, {
    github,
    repository: "example/app",
    projectId: "app",
    target: "main",
    workflow: "ci.yml",
  });
  const before = trunk(w),
    out = await red(["test (macos)"]);
  assert.equal(out.state, null);
  assert.equal(calls.jobs, 0);
  assert.equal(trunk(w), before);
});

test("a platform with no local environment opens one Needs you item naming the failing jobs", async (t) => {
  const { w, red } = await landedTrain(t),
    before = trunk(w),
    out = await red(["test (windows)"]);
  assert.equal(out.state, "needs-you");
  assert.equal(out.notify.length, 1);
  assert.match(out.notify[0].text, /test \(windows\)/);
  assert.equal(trunk(w), before);
  assert.equal((await red(["test (windows)"])).notify.length, 0);
});

test("with bisectOnRed off nothing happens", async (t) => {
  const { w, calls, red } = await landedTrain(t, { bisectOnRed: false }),
    before = trunk(w),
    out = await red(["test (macos)"]);
  assert.equal(out.state, null);
  assert.equal(calls.jobs, 0);
  assert.equal(trunk(w), before);
  assert.ok(fs.existsSync(path.join(w.root, "origin.git")));
});

test("the integrator pass bisects before it starts the next train", async (t) => {
  const w = await workspace(t),
    order = [];
  await integratorPass(w.store, {
    config: w.config,
    sessionId: "s1",
    run: {
      ci: async () => order.push("ci"),
      bisectRed: async () => {
        order.push("red");
        return {};
      },
      train: async () => {
        order.push("train");
        return {};
      },
    },
  });
  assert.deepEqual(order, ["ci", "red", "train", "ci"]);
});
