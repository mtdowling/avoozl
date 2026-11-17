// Every role on `process` (R97.3, R94.4, design §4.28): verifier, reviewer,
// retro and planner children, read-only roles in the read-only class, and
// each role's result read back from its result file.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  approveHarnessDefinition,
  fillHarnessArgv,
  harnessDefinitionHash,
  harnessPermission,
  parseHarnessDefinition,
} from "../harness-definitions.mjs";
import { startSupervisor, supervisorPaths } from "../supervisor.mjs";
import { sandboxKind } from "../sandbox.mjs";
import { planVerifierDispatches } from "../delivery.mjs";
import { drainProcessRequests, processBrief } from "../executors/process.mjs";
import { enqueueSessionRequests } from "../session-requests.mjs";
import { newPlanStarts, newPlanTask } from "../new-plan.mjs";
import { snapshot } from "./fixtures.mjs";
import { Store } from "../store.mjs";

const CLAUDE = fileURLToPath(
  new URL("../../../examples/harnesses/claude-code.json", import.meta.url),
);

test("Claude Code's read class is dontAsk and may write only its result file", () => {
  const definition = parseHarnessDefinition(
    JSON.parse(fs.readFileSync(CLAUDE, "utf8")),
  );
  assert.equal(definition.permission.read, "dontAsk");
  assert.deepEqual(fillHarnessArgv(definition.resultAllow, {}), [
    "--allowedTools",
    "Edit(.avoozl/result.json)",
  ]);
  const worktree = path.join(os.tmpdir(), "avoozl-read-worktree");
  const tmp = path.join(os.tmpdir(), "avoozl-read-tmp");
  assert.deepEqual(
    harnessPermission(definition, { permissionClass: "read", worktree, tmp })
      .writeRoots,
    [path.resolve(tmp), path.join(path.resolve(worktree), ".avoozl")],
    "never the task folder itself",
  );
});

test("a role child's brief holds its prompt, the brief, and how it finishes", () => {
  assert.equal(processBrief("worker", "Do it."), "Do it.", "worker unchanged");
  const verifier = processBrief("verifier", "Check abc.");
  assert.match(verifier, /^You are the Avoozl Verifier/);
  assert.match(verifier, /Check abc\./);
  assert.match(verifier, /Do not run git worktree add/);
  assert.match(verifier, /\.avoozl\/result\.json/);
  assert.match(
    processBrief("review:security", "x"),
    /^You are an Avoozl Reviewer/,
  );
  assert.match(processBrief("retro", "x"), /"report": <the reply object>/);
  assert.match(processBrief("planner", "x"), /skip plans_create_plan/);
  assert.equal(processBrief("pr-review", "x"), "x", "no prompt for it here");
});

// A fake CLI for read roles: it prints its brief and writes only its result
// file, which is all a read-only child may write.
const AGENT = `
import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
console.log("cwd:", process.cwd(), "|", text);
const result = /RESULT:(.+)/.exec(text);
if (result) fs.writeFileSync(".avoozl/result.json", result[1]);
`;

const gitIn = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function machine(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-roles-")),
  );
  const stateDirectory = path.join(root, "state");
  const configDirectory = path.join(root, "config");
  const checkout = path.join(root, "checkout");
  fs.mkdirSync(checkout);
  gitIn(checkout, "init", "-q", "-b", "main");
  gitIn(checkout, "config", "user.name", "Test");
  gitIn(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  gitIn(checkout, "add", ".");
  gitIn(checkout, "commit", "-q", "-m", "Start");
  const agent = path.join(root, "agent.mjs");
  fs.writeFileSync(agent, AGENT);
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const bytes = JSON.stringify({
    name: "fake-cli",
    start: ["node", agent, "start"],
    resume: ["node", agent, "resume"],
    promptFrom: "stdin",
    permission: { write: "workspace-write", read: "read-only" },
    writeRoots: ["{worktree}", "{tmp}"],
  });
  fs.writeFileSync(
    path.join(configDirectory, "harnesses", "fake-cli.json"),
    bytes,
  );
  const hash = harnessDefinitionHash(Buffer.from(bytes));
  approveHarnessDefinition({ configDirectory, name: "fake-cli", hash });
  if (!sandboxKind())
    fs.writeFileSync(
      path.join(configDirectory, "harness-unconfined.json"),
      JSON.stringify({ "fake-cli": hash }),
    );
  const supervisor = startSupervisor({
    stateDirectory,
    configDirectory,
    intervalMs: 60_000,
  });
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => {
    supervisor.close();
    store.close();
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  });
  const data = snapshot();
  data.tasks[0].repository = "app";
  store.importSnapshot(data);
  store.put("projects", {
    id: "app",
    root: checkout,
    executor: "process",
    harness: "fake-cli",
  });
  const log = (slot) => {
    const file = path.join(
      supervisorPaths(stateDirectory).children,
      slot,
      "log",
    );
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  };
  return { root, stateDirectory, checkout, supervisor, store, log };
}

async function settle({ store, supervisor, stateDirectory }, ops, slot) {
  const end = Date.now() + 30_000;
  for (;;) {
    supervisor.pass();
    const { errors } = await drainProcessRequests(store, {
      stateDirectory,
      ops,
    });
    if (store.get("session_bindings", slot)?.status === "closed") return errors;
    if (Date.now() > end) throw Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test("a verifier runs read-only in a detached worktree Avoozl adds, and its verdict is its report", async (t) => {
  const m = machine(t);
  const commit = gitIn(m.checkout, "rev-parse", "HEAD");
  const worktree = path.join(m.root, "avoozl-sample-task-verify-1");
  const report = {
    verdict: "approved",
    text: "Meets the bar.",
    checks: [{ command: "npm test", exitCode: 0 }],
    taskId: "other-task",
    commit: "0".repeat(40),
  };
  enqueueSessionRequests(m.store, {
    starts: [
      {
        executor: "process",
        role: "verifier",
        task: "sample-task",
        commit,
        worktree,
        brief: `Verify.\nRESULT:${JSON.stringify({ state: "done", report })}`,
      },
    ],
  });
  const reports = [];
  const ops = { execute: async (name, input) => reports.push({ name, input }) };
  const { errors } = await drainProcessRequests(m.store, {
    stateDirectory: m.stateDirectory,
    ops,
  });
  assert.deepEqual(errors, []);
  const [binding] = m.store.list("session_bindings");
  assert.equal(binding.permissionClass, "read");
  assert.equal(gitIn(worktree, "rev-parse", "HEAD"), commit);
  assert.deepEqual(await settle(m, ops, binding.slot), []);
  assert.match(m.log(binding.slot), /You are the Avoozl Verifier/);
  assert.ok(m.log(binding.slot).includes(`cwd: ${worktree} `));
  // Avoozl names the task and reads the commit itself; the file's own
  // taskId and commit are ignored.
  assert.deepEqual(reports, [
    {
      name: "session.report",
      input: {
        taskId: "sample-task",
        kind: "done",
        commit,
        verdict: "approved",
        checks: [{ command: "npm test", exitCode: 0 }],
        text: "Meets the bar.",
      },
    },
  ]);
  assert.ok(!fs.existsSync(worktree), "the detached worktree is removed");
  assert.doesNotMatch(gitIn(m.checkout, "worktree", "list"), /verify-1/);
});

test("a retro runs in a scratch folder and its result file is its reply", async (t) => {
  const m = machine(t);
  m.store.put("flow_retros", {
    id: "retro-1",
    n: 1,
    state: "running",
    triggers: [],
    reverts: [],
    proposals: [],
    dropped: [],
    startedAt: new Date().toISOString(),
  });
  const reply = {
    bottleneck: { stage: "review", evidence: "Reviews wait 3 hours." },
    proposals: [],
  };
  enqueueSessionRequests(m.store, {
    starts: [
      {
        executor: "process",
        role: "retro",
        task: "retro-1",
        repository: "app",
        brief: `Numbers.\nRESULT:${JSON.stringify({ state: "done", report: reply })}`,
      },
    ],
  });
  const ops = { execute: async () => assert.fail("a retro sends no report") };
  await drainProcessRequests(m.store, {
    stateDirectory: m.stateDirectory,
    ops,
  });
  const [binding] = m.store.list("session_bindings");
  assert.equal(binding.permissionClass, "read");
  const scratch = /cwd: (\S+) /;
  assert.deepEqual(await settle(m, ops, binding.slot), []);
  const folder = scratch.exec(m.log(binding.slot))[1];
  assert.match(path.basename(folder), /^avoozl-retro-/);
  assert.ok(!fs.existsSync(folder), "the scratch folder is removed");
  const retro = m.store.get("flow_retros", "retro-1");
  assert.equal(retro.state, "done");
  assert.equal(retro.bottleneck.stage, "review");
});

test("a process project's verifier and new-plan planner requests name process", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-roles-route-"));
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const data = snapshot();
  Object.assign(data.tasks[0], { repository: "app", verify: "agent" });
  store.importSnapshot(data);
  const checkout = path.join(root, "app");
  store.put("projects", { id: "app", root: checkout, executor: "process" });
  store.put("task_deliveries", {
    id: "sample-task",
    taskId: "sample-task",
    state: "done",
    commit: "a".repeat(40),
    attempts: [{ attempt: 1, outcome: "done", commit: "a".repeat(40) }],
  });
  const [verify] = planVerifierDispatches(store);
  assert.equal(verify.executor, "process");
  assert.equal(verify.permissionClass, "read");
  assert.equal(verify.commit, "a".repeat(40));
  assert.equal(
    verify.worktree,
    path.join(root, ".avoozl-worktrees", "avoozl-sample-task-verify-1"),
  );
  assert.ok(verify.brief.includes(verify.worktree), "the brief names it");

  store.setMeta("newPlans", [
    {
      name: "cache",
      goal: "x",
      repositories: ["app"],
      brief: "Mode: draft.",
      root: checkout,
      attempt: 1,
    },
  ]);
  const [planner] = newPlanStarts(store, {});
  assert.equal(planner.task, newPlanTask("cache"));
  assert.equal(planner.executor, "process");
  assert.equal(
    planner.worktree,
    path.join(checkout, ".kiro", "specs", "cache"),
  );
  store.put("projects", { id: "app", root: checkout });
  assert.equal(newPlanStarts(store, {})[0].executor, "kirocrew");
  assert.equal(newPlanStarts(store, {})[0].worktree, checkout);
});
