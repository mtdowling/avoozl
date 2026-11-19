// Reproduce, then fix (triage-agent ta-4.3, TA3, TA7.3, TA7.7, design §D4)
// with real git and a bare remote. The checks run through an injected
// runner, except the one test of the sandbox itself.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { commandEvidence } from "../git.mjs";
import { integrateVerified } from "../delivery.mjs";
import { landDirect } from "../direct-landing.mjs";
import { sandboxKind } from "../sandbox.mjs";
import { pathVerdict } from "../verify.mjs";
import { ownerQueue, runRows } from "../triage.mjs";
import { sandboxedCheck } from "../triage-reproduce.mjs";
import { CHECK, triageWorkspace } from "./triage-fixture.mjs";

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// The checks as the repository runs them, without the sandbox; every argv
// they ran is kept.
function runner() {
  const ran = [];
  return {
    ran,
    check: async (dir, argv) => {
      ran.push(argv);
      return commandEvidence(dir, argv);
    },
  };
}

const REPRO = {
  path: "tests/greet.js",
  text: "if (require('../greet.js')() !== 'hi') throw Error('The greeting has a trailing space.');\n",
};
const bug = (extra = {}) => ({
  class: "bug",
  reason: "The greeting ends in a space.",
  reproduction: REPRO,
  fix: { bounded: true, why: "One string in greet.js." },
  ...extra,
});

async function triaged(w, number, result, check) {
  await w.tick({ run: { check: check.check } });
  w.answer(number, result);
  await w.tick({ run: { check: check.check } });
  return w.store
    .read()
    .tasks.find((task) => task.intake?.issue?.number === number);
}

// The worker's fix on the task's own worktree, and the verifier's pass.
async function workerFixes(w, task) {
  const worktree = w.store.get("task_worktrees", task.id).path;
  assert.equal(
    git(worktree, "log", "-1", "--format=%s"),
    `Add a reproduction of o/app#${task.intake.issue.number}`,
    "the reproduction is the first commit",
  );
  fs.writeFileSync(
    path.join(worktree, "greet.js"),
    "module.exports = () => 'hi';\n",
  );
  git(worktree, "commit", "-qam", "Drop the trailing space");
  const commit = git(worktree, "rev-parse", "HEAD");
  w.store.put("task_deliveries", {
    id: task.id,
    taskId: task.id,
    state: "verified",
    commit,
    attempts: [],
    verifications: [],
  });
  return commit;
}

test("a collaborator's reproduced bug lands with the reproduction passing", async (t) => {
  const w = triageWorkspace(t),
    check = runner();
  w.fake.add(1, { user: { login: "maintainer" } });
  w.fake.permissions.set("maintainer", "write");
  const task = await triaged(w, 1, bug(), check);
  assert.ok(task, "a fix started");
  assert.equal(w.runOf(1).outcome, "reproduced");
  assert.equal(task.ship, undefined, "it lands by the landing setting");
  const commit = await workerFixes(w, task);
  await integrateVerified(w.store);
  await landDirect(w.store, { workspaceRoot: w.root, rounds: 2, machine: {} });
  const origin = path.join(w.root, "origin.git"),
    landed = git(origin, "rev-parse", "main");
  git(origin, "merge-base", "--is-ancestor", commit, landed);
  assert.equal(
    git(origin, "show", `${landed}:tests/greet.js`),
    REPRO.text.trimEnd(),
    "the reproduction landed",
  );
  // The landed head passes its checks with the reproduction in it.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-landed-"));
  git(w.checkout, "worktree", "add", "--detach", dir, landed);
  assert.equal((await commandEvidence(dir, CHECK)).exitCode, 0);
  // Only the repository's own check ever ran.
  for (const argv of check.ran) assert.deepEqual(argv, CHECK);
  assert.ok(check.ran.length >= 2);
});

test("a stranger's reproduced bug stops at Fix ready", async (t) => {
  const w = triageWorkspace(t),
    check = runner();
  w.fake.add(2, { user: { login: "passerby" } });
  const task = await triaged(w, 2, bug(), check);
  assert.equal(task.ship, "manual");
  const owner = ownerQueue(w.store).find((row) => row.number === 2);
  assert.equal(owner.triage.owner.kind, "fix-ready");
  assert.match(owner.triage.owner.reason, /^Fix ready/);
  await workerFixes(w, task);
  await integrateVerified(w.store);
  assert.equal(
    w.store.get("task_deliveries", task.id).awaitingIntegrate,
    w.store.get("task_deliveries", task.id).commit,
    "it waits for a person's Integrate",
  );
});

test("a reproduction that passes on the base is not a reproduction", async (t) => {
  const w = triageWorkspace(t),
    check = runner();
  w.fake.add(3);
  const passing = { path: "tests/ok.js", text: "// passes\n" };
  await triaged(w, 3, bug({ reproduction: passing }), check);
  assert.equal(
    runRows(w.store).find((run) => run.number === 3 && run.attempt === 1)
      .outcome,
    "not-reproduced",
  );
  assert.equal(w.store.read().tasks.length, 0, "no fix starts");
  // The run is told once, and tries again.
  const retry = w.runOf(3);
  assert.equal(retry.attempt, 2);
  assert.match(retry.note, /passed on the base branch/);
  w.answer(3, bug({ reproduction: passing }));
  await w.tick({ run: { check: check.check } });
  assert.equal(
    runRows(w.store).filter((run) => run.number === 3).length,
    2,
    "no third try",
  );
  assert.ok(ownerQueue(w.store).some((row) => row.number === 3));
});

test("a command named in a result is never run", async (t) => {
  const w = triageWorkspace(t),
    check = runner();
  w.fake.add(4);
  await w.tick({ run: { check: check.check } });
  assert.throws(
    () => w.answer(4, { ...bug(), command: ["rm", "-rf", "/"] }),
    /not allowed/,
  );
  await w.tick({ run: { check: check.check } });
  assert.deepEqual(check.ran, []);
});

test("the sandboxed checks reach no network", {
  skip: sandboxKind() ? false : "no sandbox on this machine",
}, async (t) => {
  const server = net.createServer((socket) => socket.end("hello"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address(),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-net-")),
    probe = [
      process.execPath,
      "-e",
      `const s=require('net').connect(${port},'127.0.0.1');s.on('data',()=>process.exit(0));s.on('error',()=>process.exit(3));setTimeout(()=>process.exit(4),3000)`,
    ];
  assert.equal(
    (await commandEvidence(dir, probe)).exitCode,
    0,
    "the probe connects outside the sandbox",
  );
  assert.notEqual(
    (await sandboxedCheck(dir, probe)).exitCode,
    0,
    "and not inside it",
  );
});

test("a second missing-information case posts no second question", async (t) => {
  const w = triageWorkspace(t),
    check = runner();
  w.fake.add(5, { user: { login: "reporter" } });
  await w.tick({ run: { check: check.check } });
  const ask = { class: "bug", reason: "No steps.", question: "Which version?" };
  w.answer(5, ask);
  await w.tick({ run: { check: check.check } });
  assert.equal(
    w.fake.writes.filter((entry) => entry.kind === "comment").length,
    1,
  );
  // The author answers; the next run still lacks what it needs.
  w.fake.comments.push({
    id: 70,
    number: 5,
    body: "Not sure.",
    login: "reporter",
    at: w.fake.tick(),
  });
  w.fake.edit(5, {});
  await w.tick({ run: { check: check.check } });
  w.answer(5, ask);
  await w.tick({ run: { check: check.check } });
  assert.equal(
    w.fake.writes.filter((entry) => entry.kind === "comment").length,
    1,
    "no second question",
  );
  assert.match(
    ownerQueue(w.store).find((row) => row.number === 5).triage.owner.reason,
    /already asked once/,
  );
});

test("a reproduction or fix touching a protected path waits for the owner", async (t) => {
  const w = triageWorkspace(t),
    check = runner();
  w.fake.add(6);
  await triaged(
    w,
    6,
    bug({ reproduction: { path: ".github/workflows/ci.yml", text: "x" } }),
    check,
  );
  assert.equal(w.store.read().tasks.length, 0);
  assert.deepEqual(check.ran, [], "nothing ran for it");
  assert.match(
    ownerQueue(w.store).find((row) => row.number === 6).triage.owner.reason,
    /protected path/,
  );
  // A fix's commit that touches one is held by Verify like any task's.
  assert.deepEqual(
    pathVerdict([".github/workflows/ci.yml", "greet.js"], {}).protected,
    [".github/workflows/ci.yml"],
  );
});
