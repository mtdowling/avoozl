// Held reconstruction from branches and the journal (task 56.6). Every
// repository is a local scratch repository; the "lost database" is a fresh
// clone with no Avoozl refs and no store at all.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest } from "../../model.mjs";
import { git } from "../git.mjs";
import { EXPORT_FORMAT } from "../driver.mjs";
import { appendRecord } from "../spec-journal.mjs";
import { rebuildSpec, resumeRebuild } from "../spec-rebuild.mjs";
import {
  checkpointBranch,
  sourceRegistry,
  workingBranch,
} from "../working-heads.mjs";

const SPEC = "example-spec";
const REVISION = digest("revision");
const DEF = { t1: digest("t1"), t2: digest("t2"), t3: digest("t3") };
const DRIVER = "1".repeat(16);
const target = { repository: "acme/app", base: "main" };
const person = { kind: "person", login: "owner" };
const checks = [{ name: "npm test", conclusion: "success" }];

function memoryJournal() {
  const entries = [];
  return {
    entries,
    list: async () => structuredClone(entries),
    create: async (body) => {
      const id = 100 + entries.length;
      entries.push({ id, body, author: "owner" });
      return { id };
    },
    permission: async (login) => (login === "owner" ? "admin" : "none"),
  };
}

async function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-rebuild-"));
  t.after(() =>
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    }),
  );
  const at = (name) => path.join(root, name),
    identity = async (dir) => {
      await git(dir, ["config", "user.name", "Fixture"]);
      await git(dir, ["config", "user.email", "fixture@example.invalid"]);
    };
  fs.mkdirSync(at("seed"));
  await git(at("seed"), ["init", "-q", "-b", "main"]);
  await identity(at("seed"));
  fs.writeFileSync(at("seed/app.txt"), "one\n");
  await git(at("seed"), ["add", "."]);
  await git(at("seed"), ["commit", "-q", "-m", "Start"]);
  await git(root, ["clone", "-q", "--bare", at("seed"), at("upstream.git")]);
  await git(root, [
    "clone",
    "-q",
    "--bare",
    at("upstream.git"),
    at("alice.git"),
  ]);
  await git(root, ["clone", "-q", at("upstream.git"), at("driver")]);
  await identity(at("driver"));
  const driver = at("driver"),
    base = await git(driver, ["rev-parse", "HEAD"]),
    commit = async (file, message) => {
      fs.writeFileSync(path.join(driver, file), `${file}\n`);
      await git(driver, ["add", "."]);
      await git(driver, ["commit", "-q", "-m", message]);
      return git(driver, ["rev-parse", "HEAD"]);
    },
    push = (remote, sha, branch) =>
      git(driver, ["push", "-q", at(remote), `${sha}:refs/heads/${branch}`]);
  // The new owner's machine: a fresh clone, nothing retained.
  const fresh = async () => {
    const dir = at(`fresh-${Math.random().toString(36).slice(2)}`);
    await git(root, ["clone", "-q", at("upstream.git"), dir]);
    return dir;
  };
  const registry = sourceRegistry({
    "acme/app": { url: at("upstream.git") },
    "alice/app": { url: at("alice.git"), parent: "acme/app" },
  });
  const options = {
    visibility: "private",
    machine: { hostname: "made-up-host", username: "madeupuser" },
    configFile: at("machine.json"),
  };
  return { root, at, driver, base, commit, push, fresh, registry, options };
}

const approved = new Map(Object.entries(DEF));

async function journalWith(s, records) {
  const journal = memoryJournal();
  for (const fields of records)
    await appendRecord(journal, { spec: SPEC, ...fields }, s.options);
  return journal;
}

const generation = {
  op: "generation-1",
  kind: "generation",
  generation: 1,
  driver: DRIVER,
};

async function rebuild(s, journal, extra = {}) {
  return rebuildSpec({
    root: await s.fresh(),
    registry: s.registry,
    spec: SPEC,
    target,
    entries: await journal.list(),
    replayOptions: {
      visibility: "private",
      permission: journal.permission,
    },
    revision: REVISION,
    approved,
    ...extra,
  });
}

test("a lost database and a missing tail rebuild held from git and the journal", async (t) => {
  const s = await scratch(t),
    // t1 landed through an intent whose outcome record never got written.
    c1 = await s.commit("one.txt", `Task one\n\nAvoozl-Task: t1@${DEF.t1}`);
  await s.push("upstream.git", c1, checkpointBranch(SPEC, "t1"));
  const journal = await journalWith(s, [
    generation,
    {
      op: "checkpoint-t1",
      kind: "checkpoint",
      driver: DRIVER,
      refs: [
        {
          repository: "acme/app",
          branch: checkpointBranch(SPEC, "t1"),
          commit: c1,
        },
      ],
    },
    {
      op: "grant-t2",
      kind: "grant",
      driver: DRIVER,
      tasks: [{ task: "t2", definition: DEF.t2 }],
    },
    {
      op: "land-t1",
      kind: "intent",
      driver: DRIVER,
      revision: REVISION,
      base: s.base,
      tasks: [{ task: "t1", definition: DEF.t1 }],
      refs: [{ repository: "acme/app", commit: c1 }],
      checks,
    },
  ]);
  // t2's trailer reached main with no intent and no evidence.
  const c2 = await s.commit("two.txt", `Task two\n\nAvoozl-Task: t2@${DEF.t2}`);
  await s.push("upstream.git", c2, "main");

  const rebuilt = await rebuild(s, journal);
  assert.equal(rebuilt.held, true);
  assert.equal(rebuilt.generation, 1);
  assert.equal(rebuilt.driver, DRIVER);
  // Nothing completes by itself: the landing waits to be recorded.
  assert.deepEqual(rebuilt.tasks, { t1: "open", t2: "open", t3: "open" });
  assert.deepEqual(
    rebuilt.landings.find((l) => l.op === "land-t1"),
    { op: "land-t1", state: "landed", candidate: c1 },
  );
  const trailers = Object.fromEntries(
    rebuilt.landings.filter((l) => l.trailer).map((l) => [l.trailer, l]),
  );
  assert.equal(trailers.t1.kind, "landed");
  assert.equal(trailers.t1.reason, "intent-evidence");
  assert.equal(trailers.t2.kind, "landed-unverified");
  assert.deepEqual(rebuilt.heldTasks, {
    t1: ["intent-landed"],
    t2: ["landed-unverified"],
  });
  assert.deepEqual(rebuilt.grants, [
    { task: "t2", generation: 1, record: 102 },
  ]);
  assert.equal(rebuilt.heads[0].state, "exact");
  assert.equal(rebuilt.branchProgress, true);

  // Resume is a person's, and unknown spend needs their say-so.
  assert.throws(
    () => resumeRebuild(rebuilt, { by: { kind: "agent" } }),
    /person/,
  );
  assert.throws(() => resumeRebuild(rebuilt, { by: person }), /unknown/);
  const resumed = resumeRebuild(rebuilt, {
    by: person,
    acceptUnknownSpend: true,
  });
  assert.equal(resumed.held, false);
  assert.deepEqual(resumed.reconcile, ["land-t1"]);
  assert.deepEqual(Object.keys(resumed.stillHeld).sort(), ["t1", "t2"]);
  assert.deepEqual(resumed.spend, { state: "unknown" });
});

test("an unavailable fork and a changed head stay unresolved, never done", async (t) => {
  const s = await scratch(t),
    work = await s.commit("three.txt", "Task three"),
    branch = checkpointBranch(SPEC, "t3");
  await s.push("alice.git", work, branch);
  await s.push("upstream.git", s.base, workingBranch(SPEC));
  const journal = await journalWith(s, [
    generation,
    {
      op: "checkpoint-1",
      kind: "checkpoint",
      driver: DRIVER,
      refs: [
        { repository: "alice/app", branch, commit: work },
        { repository: "acme/app", branch: workingBranch(SPEC), commit: s.base },
      ],
    },
  ]);
  // The fork is deleted and someone moves the working branch.
  fs.rmSync(s.at("alice.git"), { recursive: true, force: true });
  const moved = await s.commit("four.txt", "Unverified push");
  await s.push("upstream.git", moved, workingBranch(SPEC));

  const rebuilt = await rebuild(s, journal);
  assert.equal(rebuilt.tasks.t3, "open");
  assert.deepEqual(rebuilt.heldTasks, { t3: ["head-unavailable"] });
  const states = Object.fromEntries(
    rebuilt.unresolved
      .filter((item) => item.kind === "head")
      .map((item) => [item.branch, item.state]),
  );
  assert.deepEqual(states, {
    [branch]: "unavailable",
    [workingBranch(SPEC)]: "advanced",
  });
  // A moved working head is not verified progress.
  assert.equal(rebuilt.branchProgress, false);
  const resumed = resumeRebuild(rebuilt, {
    by: person,
    acceptUnknownSpend: true,
  });
  assert.deepEqual(resumed.stillHeld, { t3: ["head-unavailable"] });
  assert.equal(resumed.branchProgress, false);
});

test("unavailable private controls are unknown, not zero; the private handoff restores them", async (t) => {
  const s = await scratch(t),
    journal = await journalWith(s, [
      generation,
      {
        op: "budget-1",
        kind: "control",
        driver: DRIVER,
        controls: [{ flag: "budget", id: "budget-1" }],
      },
    ]);
  const blind = await rebuild(s, journal);
  assert.deepEqual(blind.spend, { state: "unknown" });
  assert.ok(!("usage" in blind.spend) && !("total" in blind.spend));
  assert.deepEqual(
    blind.unresolved.filter((item) => item.kind === "private-control"),
    [{ kind: "private-control", id: "budget-1", state: "unknown" }],
  );
  assert.throws(() => resumeRebuild(blind, { by: person }), /unknown/);

  const handoff = {
    format: EXPORT_FORMAT,
    version: 1,
    columns: { flow_usage: [{ task_id: "t1", cost: 1.5 }], usage_samples: [] },
  };
  const informed = await rebuild(s, journal, { handoff });
  assert.equal(informed.spend.state, "known");
  assert.deepEqual(informed.spend.usage, handoff.columns.flow_usage);
  assert.equal(
    informed.unresolved.some((item) => item.kind === "private-control"),
    false,
  );
  assert.equal(resumeRebuild(informed, { by: person }).held, false);
});

test("a changed journal record holds the rebuild and refuses resume", async (t) => {
  const s = await scratch(t),
    journal = await journalWith(s, [
      generation,
      {
        op: "outcome-t3",
        kind: "outcome",
        driver: DRIVER,
        revision: REVISION,
        outcomes: [{ task: "t3", kind: "done", definition: DEF.t3 }],
      },
    ]);
  const clean = await rebuild(s, journal);
  assert.equal(clean.tasks.t3, "complete");
  assert.deepEqual(clean.decisions, [
    { kind: "done", task: "t3", record: 101 },
  ]);
  journal.entries[0].edited = true;
  const rebuilt = await rebuild(s, journal);
  assert.equal(rebuilt.held, true);
  assert.equal(rebuilt.unresolved[0].kind, "journal");
  assert.equal(rebuilt.branchProgress, false);
  assert.throws(
    () => resumeRebuild(rebuilt, { by: person, acceptUnknownSpend: true }),
    /journal is held/,
  );
});
