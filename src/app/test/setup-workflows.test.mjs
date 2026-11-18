// Setup's workflow check under `landing: train` (lt-1.3).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { repositorySetup } from "../repository-setup.mjs";
import {
  batchBranchWorkflows,
  pushTrigger,
  runsOnBranch,
} from "../setup-workflows.mjs";
import { Store } from "../store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const WORKFLOWS = {
  "none.yml":
    "name: A\non:\n  push:\n  pull_request:\njobs:\n  t:\n    runs-on: x\n",
  "main-only.yml":
    "name: B\non:\n  push:\n    branches: [main]\njobs:\n  t:\n    runs-on: x\n",
  "all.yaml":
    "name: C\non:\n  push:\n    branches:\n      - '**'\n  pull_request:\njobs:\n  t:\n    runs-on: x\n",
};

function workspace(t, files = WORKFLOWS) {
  const root = temporaryDirectory("avoozl-setup-wf-"),
    checkout = path.join(root, "app"),
    dir = path.join(checkout, ".github", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files))
    fs.writeFileSync(path.join(dir, name), text);
  git(checkout, "init", "-q", "-b", "main");
  git(
    checkout,
    "remote",
    "add",
    "origin",
    "https://example.invalid/acme/app.git",
  );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks: [], edges: [] });
  store.put("projects", { id: "app", root: checkout, baseBranch: "main" });
  return { store, dir };
}

const github = {
  currentUser: async () => ({ login: "me" }),
  permission: async () => ({ permission: "admin" }),
};
const hashes = (dir) =>
  Object.fromEntries(
    fs.readdirSync(dir).map((n) => [
      n,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(dir, n)))
        .digest("hex"),
    ]),
  );

test("setup under train lists the workflows a batch branch would start and edits none", async (t) => {
  const { store, dir } = workspace(t),
    before = hashes(dir);
  const preview = await repositorySetup(store, github, {
    repository: "acme/app",
    project: "app",
    landing: "train",
    confirm: true,
  });
  assert.deepEqual(preview.workflows, [
    {
      workflow: ".github/workflows/all.yaml",
      line: "branches: ['**', '!avoozl-batch/**']",
    },
    {
      workflow: ".github/workflows/none.yml",
      line: "branches-ignore: ['avoozl-batch/**']",
    },
  ]);
  assert.deepEqual(hashes(dir), before, "no workflow file changed");
  assert.equal(store.get("projects", "app").landing, "train");
  assert.deepEqual(preview.github, [], "train needs no pull request ruleset");
});

test("a workflow that already ignores the prefix is not listed", () => {
  const trigger = pushTrigger(
    "on:\n  push:\n    branches-ignore:\n      - 'avoozl-batch/**'\n      - docs\n",
  );
  assert.deepEqual(trigger.branchesIgnore, ["avoozl-batch/**", "docs"]);
  assert.equal(runsOnBranch(trigger, "avoozl-batch/x"), false);
  assert.equal(runsOnBranch(trigger, "feature"), true);
});

test("flow-style triggers and negative patterns are read", () => {
  assert.equal(runsOnBranch(pushTrigger("on: push\n"), "avoozl-batch/x"), true);
  assert.equal(
    runsOnBranch(pushTrigger("on: [pull_request]\n"), "avoozl-batch/x"),
    false,
  );
  assert.equal(
    runsOnBranch(
      pushTrigger("on:\n  push:\n    branches: ['**', '!avoozl-batch/**']\n"),
      "avoozl-batch/x",
    ),
    false,
  );
  assert.equal(
    runsOnBranch(
      pushTrigger("on:\n  push:\n    tags: ['v*']\n"),
      "avoozl-batch/x",
    ),
    false,
  );
  assert.deepEqual(
    batchBranchWorkflows(temporaryDirectory("avoozl-empty-")),
    [],
  );
});
