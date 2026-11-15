// Opening a large workspace (41 specs on a private plans branch, 527 tasks,
// 931 edges) must not read the whole plans branch on every read.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Operations } from "../operations.mjs";
import { RepositorySettings } from "../repository-settings.mjs";
import { FakeGitHub } from "./fake-github.mjs";
import { fixture, snapshot } from "./fixtures.mjs";
import { BIG, bigSnapshot } from "./big-workspace.mjs";
import { specFiles } from "./spec-fixture.mjs";
import { temporaryDirectory } from "./temporary.mjs";

process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-xdg-");

const mirror = {
  source: "acme/app",
  mirror: "acme/app-private",
  plansBranch: "avoozl-plans",
};
const LATENCY_MS = 2;

// Each GitHub read waits a little, like a network call, and is counted.
class SlowGitHub extends FakeGitHub {
  reads = 0;
  heads = 0;
  oid = "a".repeat(40);
  async contents(...args) {
    this.reads += 1;
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return super.contents(...args);
  }
  async treeEntries(...args) {
    this.reads += 1;
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return super.treeEntries(...args);
  }
  async blobTexts(...args) {
    this.reads += 1;
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return super.blobTexts(...args);
  }
  async branch() {
    this.heads += 1;
    this.shas.set(this.oid, "avoozl-plans");
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return { name: "avoozl-plans", commit: { sha: this.oid } };
  }
}

function workspace(t) {
  const { root, store } = fixture(t),
    github = new SlowGitHub();
  store.importSnapshot(bigSnapshot(snapshot()));
  assert.equal(store.read().tasks.length, BIG.tasks);
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      github: {
        mode: "plans-repo",
        planningRepository: "acme/plans",
        repositories: { "acme/app-private": { baseBranch: "main", mirror } },
      },
    }),
  );
  store.setMeta("workspaceRepository", { root });
  for (let i = 0; i < BIG.specs; i += 1)
    for (const [file, text] of Object.entries(specFiles()))
      github.files.set(`avoozl-plans:.kiro/specs/spec-${i}/${file}`, text);
  const ops = new Operations(store, {
    github,
    workspaceRoot: root,
    configuration: new RepositorySettings(store, { workspaceRoot: root }),
  });
  return { ops, github };
}

// The page's first load reads the plan list, then the specs table.
const FIRST_LOAD = ["plan.list", "plan.table"];

test("the plan list reads nothing from the plans branch", async (t) => {
  const { ops, github } = workspace(t);
  await ops.execute("plan.list", { limit: 100 });
  assert.equal(github.reads, 0);
  assert.equal(github.heads, 0);
});

test("a second read inside the cache window makes no GitHub call", async (t) => {
  const { ops, github } = workspace(t);
  await ops.execute("plan.table");
  const first = github.reads;
  assert.ok(first > 0);
  await ops.execute("plan.table");
  await ops.execute("plan.specs");
  assert.equal(github.reads, first);
});

test("after the window, an unchanged branch costs one head call and no file reads", async (t) => {
  const { ops, github } = workspace(t);
  await ops.execute("plan.table");
  const reads = github.reads;
  ops.privateSpecsAt = 1;
  await ops.execute("plan.table");
  assert.equal(github.reads, reads);
  assert.equal(github.heads, 2);
  ops.privateSpecsAt = 1;
  github.oid = "b".repeat(40);
  await ops.execute("plan.table");
  assert.equal(github.reads, reads * 2);
});

// What every plan.* operation did before: one file at a time, every time.
async function legacyRefresh(github) {
  const get = (file) => github.contents(null, file, mirror.plansBranch);
  for (const entry of await get(".kiro/specs"))
    for (const file of [...Object.keys(specFiles()), "critique.md"])
      await get(`.kiro/specs/${entry.name}/${file}`).catch(() => null);
}

test("first load reads far less, and sooner, than the old path", async (t) => {
  const old = workspace(t);
  // The operations get the old path's reads from legacyRefresh, not their own.
  old.ops.privateSpecsAt = Date.now();
  let started = performance.now();
  for (const name of FIRST_LOAD) {
    await legacyRefresh(old.github);
    await old.ops.execute(name, { limit: 100 });
  }
  const oldMs = performance.now() - started,
    oldReads = old.github.reads;

  const fresh = workspace(t);
  started = performance.now();
  for (const name of FIRST_LOAD) await fresh.ops.execute(name, { limit: 100 });
  const newMs = performance.now() - started;

  assert.ok(oldReads > BIG.specs, "the old path reads every spec file");
  assert.ok(
    fresh.github.reads < oldReads,
    `${fresh.github.reads} reads against ${oldReads}`,
  );
  assert.ok(
    newMs < oldMs,
    `${newMs.toFixed(0)} ms against ${oldMs.toFixed(0)} ms`,
  );
});
