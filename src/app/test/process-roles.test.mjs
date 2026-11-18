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
import {
  drainProcessRequests,
  processBrief,
  sessionProject,
} from "../executors/process.mjs";
import { enqueueSessionRequests } from "../session-requests.mjs";
import { newPlanStarts, newPlanTask } from "../new-plan.mjs";
import { snapshot } from "./fixtures.mjs";
import { Operations } from "../operations.mjs";
import { createSpecReviewRound } from "../plan-reviews.mjs";
import { recordSessionStatus } from "../session-bindings.mjs";
import { createSpecPlan, specHash } from "../spec-plans.mjs";
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
    "--allowedTools",
    "Edit(.avoozl/output/*)",
  ]);
  const worktree = path.join(os.tmpdir(), "avoozl-read-worktree");
  const tmp = path.join(os.tmpdir(), "avoozl-read-tmp");
  assert.deepEqual(
    harnessPermission(definition, { permissionClass: "read", worktree, tmp })
      .writeRoots,
    [path.resolve(tmp), path.join(path.resolve(worktree), ".avoozl")],
    "never the task folder itself",
  );
  // The harness's own cache folders from project config (P59: Claude Code
  // writes its config folder at start), but none inside the task folder.
  const cache = path.join(os.tmpdir(), "avoozl-read-claude-config");
  assert.deepEqual(
    harnessPermission(definition, {
      permissionClass: "read",
      worktree,
      tmp,
      cacheDirs: [cache],
    }).writeRoots,
    [
      path.resolve(tmp),
      path.join(path.resolve(worktree), ".avoozl"),
      path.resolve(cache),
    ],
  );
  assert.throws(
    () =>
      harnessPermission(definition, {
        permissionClass: "read",
        worktree,
        tmp,
        cacheDirs: [path.join(worktree, "cache")],
      }),
    /overlaps the task folder/,
  );
});

test("a role child's brief holds its prompt, the brief, and how it finishes", () => {
  assert.equal(processBrief("worker", "Do it."), "Do it.", "worker unchanged");
  const verifier = processBrief("verifier", "Check abc.");
  assert.match(verifier, /^You are the Avoozl Verifier/);
  assert.match(verifier, /Check abc\./);
  assert.match(verifier, /Do not run git worktree add/);
  assert.match(verifier, /\.avoozl\/result\.json/);
  assert.match(verifier, /Your shell runs no command here/);
  assert.match(
    processBrief("verifier", "Check abc.", {
      allowCommands: [
        ["node", "check.mjs"],
        ["git", "rev-parse"],
      ],
    }),
    /runs only these commands, one per call, .*`node check\.mjs`, `git rev-parse`/,
  );
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
const output = /OUTPUT:(\\S+) (.+)/.exec(text);
if (output) {
  fs.mkdirSync(".avoozl/output", { recursive: true });
  fs.writeFileSync(".avoozl/output/" + output[1], output[2]);
}
// The model that served it, as Claude Code's JSON output names it.
const served = /SERVED:(\\S+)/.exec(text);
if (served) console.log(JSON.stringify({ modelUsage: { [served[1]]: {} } }));
`;

const gitIn = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function machine(t, { servedModel = null } = {}) {
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
    // How a read-only child writes its result (NK6.1); the fake ignores it.
    resultAllow: ["--result-file"],
    ...(servedModel ? { servedModel } : {}),
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
  return {
    root,
    stateDirectory,
    configDirectory,
    checkout,
    supervisor,
    store,
    log,
  };
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

test("a process planner whose spec folder is in no checkout runs with its repository's sandbox", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-roles-plan-"));
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  store.importSnapshot(snapshot());
  const sandbox = { network: ["localhost:1"] };
  store.put("projects", {
    id: "app",
    root: path.join(root, "app"),
    executor: "process",
    sandbox,
  });
  // A local workspace's own folder holds its specs, outside the checkout.
  const specRoot = path.join(root, "workspace");
  store.setMeta("newPlans", [
    {
      name: "cache",
      goal: "x",
      repositories: ["app"],
      brief: "Mode: draft.",
      root: specRoot,
      attempt: 1,
    },
  ]);
  const [planner] = newPlanStarts(store, { harness: "claude-code" });
  assert.equal(planner.executor, "process");
  assert.equal(planner.repository, "app");
  assert.equal(
    planner.worktree,
    path.join(specRoot, ".kiro", "specs", "cache"),
  );
  assert.deepEqual(sessionProject(store, planner)?.sandbox, sandbox);
  const [chat] = newPlanStarts(store, { harness: "kirocrew" });
  assert.equal(chat.executor, "kirocrew");
  assert.equal(chat.repository, undefined, "a chat keeps its Specs folder");
});

// Plan review as a child (nk-3.1, NK3.3, NK5.2): a round written by
// `writer-model`, reviewed by a fake child that writes its findings to an
// output file and names its served model the way Claude Code does.
const KEY_OF = { from: "output", keyOf: "modelUsage" };
const SPEC = {
  "requirements.md": "# Needs\n\nThe app reads a file.\n",
  "design.md": "# Design\n\nUse src/missing.mjs.\n",
  "tasks.md": "# Tasks\n\n- [ ] 1.1 Read the file\n",
  "avoozl/manifest.json": '{"version":1,"tasks":{}}\n',
};
const FINDING = {
  kind: "wrong-reference",
  severity: "warn",
  file: "design.md",
  quote: "Use src/missing.mjs.",
  claim: "The named source file does not exist.",
  evidence: "Searched src/ for missing.mjs; no matching file was found.",
};

async function reviewChild(t, { servedModel = KEY_OF, served, findings }) {
  const m = machine(t, { servedModel });
  const plan = createSpecPlan(
    m.store,
    { id: "file-reader" },
    { name: "file-reader", exists: true, files: SPEC, hash: specHash(SPEC) },
  );
  m.store.put("session_bindings", {
    id: "writer",
    slot: "writer",
    role: "planner",
    taskId: plan.id,
  });
  recordSessionStatus(
    m.store,
    { slot: "writer", status: "idle" },
    {
      served: {
        model: "writer-model",
        requested: null,
        changed: false,
        withheld: false,
      },
    },
  );
  const { round } = createSpecReviewRound(m.store, {
    planId: plan.id,
    revisionHash: plan.hash,
    reviewerModel: "reviewer-model",
    writer: { slot: "writer" },
  });
  const folder = path.join(m.root, "review-snapshot");
  fs.mkdirSync(folder);
  const output = JSON.stringify({ findings, summary: "Reads one file." });
  enqueueSessionRequests(m.store, {
    starts: [
      {
        executor: "process",
        harness: "fake-cli",
        role: "plan-review",
        task: round.id,
        worktree: folder,
        permissionClass: "read",
        model: "reviewer-model",
        brief: [
          "Review it.",
          `OUTPUT:review.json ${output}`,
          `RESULT:${JSON.stringify({ state: "done", output: "review.json" })}`,
          ...(served ? [`SERVED:${served}`] : []),
        ].join("\n"),
      },
    ],
  });
  const ops = new Operations(m.store, { configDirectory: m.configDirectory });
  await drainProcessRequests(m.store, {
    stateDirectory: m.stateDirectory,
    ops,
  });
  const [binding] = m.store
    .list("session_bindings")
    .filter((b) => b.role === "plan-review");
  assert.equal(binding.permissionClass, "read");
  assert.equal(binding.review.roundId, round.id, "bound to its round");
  const errors = await settle(m, ops, binding.slot);
  assert.match(m.log(binding.slot), /plans_submit_review step above/);
  return {
    round: m.store.get("review_rounds", round.id),
    threads: m.store
      .list("review_threads")
      .filter((x) => x.roundId === round.id),
    errors,
  };
}

test("a plan review child with a served model records its round as a chat's does", async (t) => {
  const { round, threads, errors } = await reviewChild(t, {
    served: "reviewer-model",
    findings: [FINDING],
  });
  assert.deepEqual(errors, []);
  assert.equal(round.state, "done");
  assert.equal(round.reviewerModel, "reviewer-model");
  assert.equal(round.summary, "Reads one file.");
  assert.deepEqual(
    threads.map((x) => [x.kind, x.anchor.quote, x.model]),
    [["wrong-reference", "Use src/missing.mjs.", "reviewer-model"]],
  );
});

test("a plan review child with no served model is skipped with today's reason", async (t) => {
  for (const options of [
    { servedModel: null, served: "reviewer-model" },
    { served: null },
  ]) {
    const { round, threads } = await reviewChild(t, {
      ...options,
      findings: [FINDING],
    });
    assert.equal(round.state, "skipped", JSON.stringify(options));
    assert.equal(
      round.note,
      "The reviewer session has no proven reported model; review skipped.",
    );
    assert.deepEqual(threads, []);
  }
});

test("a plan review child on the writer's model, or over the findings limit, is refused", async (t) => {
  const same = await reviewChild(t, {
    served: "writer-model",
    findings: [FINDING],
  });
  assert.equal(same.round.state, "skipped");
  assert.match(same.round.note, /ran on the model that wrote this revision/);
  assert.deepEqual(same.threads, []);
  const many = await reviewChild(t, {
    served: "reviewer-model",
    findings: Array.from({ length: 51 }, () => FINDING),
  });
  assert.equal(many.round.state, "skipped");
  assert.match(many.round.note, /refused: Submit at most 50 spec findings/);
  assert.deepEqual(many.threads, []);
});

test("servedModel names a field or the one key of an object in the output", () => {
  const base = {
    name: "x",
    start: ["x"],
    resume: ["x"],
    permission: { write: "w", read: "r" },
  };
  assert.deepEqual(
    parseHarnessDefinition({ ...base, servedModel: KEY_OF }).servedModel,
    KEY_OF,
  );
  assert.throws(
    () =>
      parseHarnessDefinition({
        ...base,
        servedModel: { from: "file", path: "x" },
      }),
    /servedModel must be/,
  );
  const definition = parseHarnessDefinition(
    JSON.parse(fs.readFileSync(CLAUDE, "utf8")),
  );
  assert.deepEqual(definition.servedModel, KEY_OF, "Claude Code names it");
});
