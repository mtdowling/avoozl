// Shared fixtures for the integrator engine tests: a real git workspace with a
// bare remote, `landing: train` projects and two taken-over specs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { digest } from "../../model.mjs";
import { bindContentRules } from "../content-rules.mjs";
import { runTrain } from "../integrator-run.mjs";
import { queueBatch, requireTrainSettings } from "../integrator-trains.mjs";
import { landingQueue } from "../landing-queue.mjs";
import { takeOverSpec } from "../spec-takeover.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME ??= temporaryDirectory("avoozl-xdg-");

export const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
export const node = (code, ...rest) => [process.execPath, "-e", code, ...rest];
const leaf = (id, planId = "s1") => ({
  id,
  title: "Task " + id,
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: [id + " works."],
  repository: "app",
  planId,
});

// `full` is the full-validation command; it runs in the landing worktree and
// can read ORIGIN (the bare remote's path) from its own script text.
export async function workspace(
  t,
  { policy = "gated", full, cheap, trigger = {}, maxRebases } = {},
) {
  const root = temporaryDirectory("avoozl-engine-"),
    origin = path.join(root, "origin.git"),
    checkout = path.join(root, "app");
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, checkout);
  for (const [k, v] of [
    ["user.name", "Test"],
    ["user.email", "test@example.com"],
  ])
    git(checkout, "config", k, v);
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  const config = {
    landing: {
      trains: {
        ci: { workflow: "ci.yml" },
        trigger: { minBranches: 1, cooldownSeconds: 0, ...trigger },
        validation: {
          cheap: [cheap ?? node("0")],
          full: { "macos-arm64": { command: full ?? node("0") } },
        },
        ...(maxRebases === undefined ? {} : { failure: { maxRebases } }),
        targets: { main: { policy } },
      },
    },
    machine: { platforms: { "macos-arm64": { kind: "native" } } },
  };
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  bindContentRules(store, {
    workspaceRoot: root,
    configFile: path.join(root, "m.json"),
  });
  store.importSnapshot({
    ...snapshot(),
    tasks: [
      leaf("t1"),
      leaf("t2", "s2"),
      leaf("t3"),
      leaf("t4"),
      ...Array.from({ length: 8 }, (_, i) => leaf(`t${i + 5}`)),
    ],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    landing: "train",
    checks: [node("0")],
    worktreeRoot: path.join(root, "wt"),
  });
  for (const spec of ["s1", "s2"]) {
    store.put("plans", {
      id: spec,
      spec,
      hash: digest("plan " + spec),
      state: "approved",
    });
    store.put("receipts", {
      id: `spec-journal:${spec}`,
      kind: "spec-journal",
      planId: spec,
      home: "local",
    });
    await takeOverSpec(store, { workspaceRoot: root, actor: "Operator" }, spec);
  }
  const w = {
    root,
    origin,
    checkout: fs.realpathSync.native(checkout),
    store,
    config,
  };
  w.settings = () => requireTrainSettings(config, "main");
  return w;
}

// A task branch with one commit from `from`, queued as a batch branch.
export async function queued(
  w,
  id,
  { file = `${id}.txt`, from = "main" } = {},
) {
  const wt = path.join(w.root, "wt", id);
  // A task queued again (sent back and fixed) commits on its own worktree.
  if (!fs.existsSync(wt))
    git(w.checkout, "worktree", "add", "-q", "-b", `avoozl/${id}`, wt, from);
  fs.writeFileSync(path.join(wt, file), id + "\n");
  git(wt, "add", ".");
  git(wt, "commit", "-qm", `Do ${id}`);
  const commit = git(wt, "rev-parse", "HEAD"),
    task = w.store.read().tasks.find((x) => x.id === id);
  w.store.put("task_worktrees", {
    id,
    taskId: id,
    path: wt,
    branch: `avoozl/${id}`,
    repository: "app",
  });
  w.store.put("task_deliveries", {
    attempts: [],
    verifications: [],
    ...w.store.get("task_deliveries", id),
    id,
    taskId: id,
    state: "done",
    commit,
  });
  await queueBatch(w.store, {
    project: w.store.get("projects", "app"),
    task,
    commit,
    config: w.config,
    machine: {},
  });
  return { commit, wt };
}

export const train = (w, extra = {}) =>
  runTrain(w.store, {
    project: w.store.get("projects", "app"),
    target: "main",
    settings: w.settings(),
    config: w.config,
    lease: { leaseId: "lease-1" },
    workspaceRoot: w.root,
    machine: {},
    ...extra,
  });
export const trunk = (w) => git(w.origin, "rev-parse", "main");
export const queue = (w) =>
  landingQueue(w.store, { projectId: "app", base: "main" });

// A command that records, when it runs, what the remote trunk is.
export const probe = (w, log) =>
  node(
    `const {execFileSync}=require('child_process');require('fs').appendFileSync(${JSON.stringify(log)}, execFileSync('git',['rev-parse','main'],{cwd:${JSON.stringify(w.origin)},encoding:'utf8'}))`,
  );
