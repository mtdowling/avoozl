// Every role on `process` (R97.3, R94.4, design §4.28): reviewer, responder,
// decide and assistant children, read-only roles in the read-only class, and
// each role's result read back from its result file.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  fillHarnessArgv,
  harnessPermission,
  parseHarnessDefinition,
} from "../harness-definitions.ts";
import { supervisorPaths } from "../supervisor.ts";
import {
  deliveryPolicy,
  planReviewDispatches,
} from "../../delivery/delivery.ts";
import { drainProcessRequests, processBrief } from "../process.ts";
import { enqueueSessionRequests } from "../../sessions/session-requests.ts";
import { snapshot } from "../../test/fixtures.ts";
import { initCheckout, openFakeSupervisor } from "./process-machine.ts";
import { Store } from "../../store/store.ts";
import type { SessionBinding } from "../../sessions/session-bindings.ts";

const CLAUDE = fileURLToPath(
  new URL("../../../../examples/harnesses/claude-code.json", import.meta.url),
);

test("Claude Code's read class is dontAsk and may write only its result file", () => {
  const definition = parseHarnessDefinition(
    JSON.parse(fs.readFileSync(CLAUDE, "utf8")),
  );
  assert.equal(definition.permission.read, "dontAsk");
  // Absolute from the session's folder: a relative rule moves with `cd`.
  assert.deepEqual(
    fillHarnessArgv(definition.resultAllow ?? [], { worktree: "/w" }),
    [
      "--allowedTools",
      "Edit(//w/.avoozl/result.json)",
      "--allowedTools",
      "Edit(//w/.avoozl/output/*)",
    ],
  );
  const worktree = path.join(os.tmpdir(), "avoozl-read-worktree");
  const tmp = path.join(os.tmpdir(), "avoozl-read-tmp");
  assert.deepEqual(
    harnessPermission(definition, { permissionClass: "read", worktree, tmp })
      .writeRoots,
    [path.resolve(tmp), path.join(path.resolve(worktree), ".avoozl")],
    "never the task folder itself",
  );
  // The harness's own cache folders from repository config (P59: Claude Code
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

// A session that ran `cd repo` kept that folder in Claude Code; relative
// result rules then pointed into repo/ and its result was refused.
test("no child is moved off its folder: briefs say no cd, result rules are absolute", async () => {
  const { STAY_IN_FOLDER } = await import("../process.ts");
  const { ROLE_TABLE } = await import("../../agents/role-table.ts");
  for (const [setting, row] of Object.entries(ROLE_TABLE))
    if (row.process && row.prompt)
      // A role pattern (review:*) is checked by one of its names.
      for (const role of row.roles ?? [setting])
        if (typeof role === "string")
          assert.ok(processBrief(role, "x").includes(STAY_IN_FOLDER), role);
  for (const role of ["check-decide", "review:security"])
    assert.ok(processBrief(role, "x").includes(STAY_IN_FOLDER), role);
  const { processSteps } = await import("../../delivery/delivery.ts");
  assert.match(processSteps({ id: "7.1" }).join("\n"), /Do not run cd/);
  // Whatever folder the shell sits in, the rules name the session's own.
  const definition = parseHarnessDefinition(
    JSON.parse(fs.readFileSync(CLAUDE, "utf8")),
  );
  const worktree = "/private/var/folders/x/T/avoozl-review-a";
  for (const rule of fillHarnessArgv(definition.resultAllow ?? [], {
    worktree,
  }))
    if (rule !== "--allowedTools")
      assert.ok(rule.startsWith(`Edit(/${worktree}/.avoozl/`), rule);
});

test("a role child's brief holds its prompt, the brief, and how it finishes", () => {
  assert.equal(processBrief("worker", "Do it."), "Do it.", "worker unchanged");
  const reviewer = processBrief("review:security", "Check abc.");
  assert.match(reviewer, /^You are an Avoozl Reviewer/);
  assert.match(reviewer, /Check abc\./);
  assert.match(reviewer, /Do not run git worktree add/);
  assert.match(reviewer, /\.avoozl\/result\.json/);
  assert.match(reviewer, /Your shell runs no command here/);
  assert.match(
    processBrief("review:security", "Check abc.", {
      allowCommands: [
        ["node", "check.mjs"],
        ["git", "rev-parse"],
      ],
    }),
    /runs only these commands, one per call, .*`node check\.mjs`, `git rev-parse`/,
  );
  assert.match(processBrief("responder", "x"), /plans_post_reply/);
  assert.equal(
    processBrief("conflict-fix", "x"),
    "x",
    "no prompt for a role outside the table",
  );
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

const gitIn = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function machine(t: TestContext) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-roles-")),
  );
  const stateDirectory = path.join(root, "state");
  const configDirectory = path.join(root, "config");
  const checkout = path.join(root, "checkout");
  initCheckout(checkout);
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
  });
  const supervisor = openFakeSupervisor({
    stateDirectory,
    configDirectory,
    bytes,
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
  Object.assign(data.tasks[0], { repository: "app" });
  store.initialize(data);
  store.put("repositories", {
    id: "app",
    root: checkout,
    executor: "process",
    harness: "fake-cli",
  });
  const log = (slot: string) => {
    const file = path.join(
      supervisorPaths(stateDirectory).children,
      slot,
      "log",
    );
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  };
  return { root, stateDirectory, checkout, supervisor, store, log };
}

async function settle(
  { store, supervisor, stateDirectory }: ReturnType<typeof machine>,
  ops: unknown,
  slot: string,
) {
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

test("a reviewer runs read-only in a detached worktree Avoozl adds, and its verdict is its report", async (t) => {
  const m = machine(t);
  const commit = gitIn(m.checkout, "rev-parse", "HEAD");
  const worktree = path.join(m.root, "avoozl-sample-task-review-c-1");
  const report = {
    verdict: "approved",
    text: "Meets the bar.",
    findings: [],
    closures: [],
    taskId: "other-task",
    commit: "0".repeat(40),
  };
  enqueueSessionRequests(m.store, {
    starts: [
      {
        executor: "process",
        role: "review:c",
        task: "sample-task",
        commit,
        worktree,
        brief: `Review.\nRESULT:${JSON.stringify({ state: "done", report })}`,
      },
    ],
  });
  const reports: { name: string; input: unknown }[] = [];
  const ops = {
    execute: async (name: string, input: unknown) =>
      reports.push({ name, input }),
  };
  const { errors } = await drainProcessRequests(m.store, {
    stateDirectory: m.stateDirectory,
    ops,
  });
  assert.deepEqual(errors, []);
  const [binding] = m.store.list<SessionBinding>("session_bindings");
  assert.equal(binding.permissionClass, "read");
  assert.equal(gitIn(worktree, "rev-parse", "HEAD"), commit);
  assert.deepEqual(await settle(m, ops, binding.slot), []);
  assert.match(m.log(binding.slot), /You are an Avoozl Reviewer/);
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
        findings: [],
        closures: [],
        text: "Meets the bar.",
      },
    },
  ]);
  assert.ok(!fs.existsSync(worktree), "the detached worktree is removed");
  assert.doesNotMatch(gitIn(m.checkout, "worktree", "list"), /review-c-1/);
});

test("a process repository's review requests name process", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-roles-route-"));
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const data = snapshot();
  Object.assign(data.tasks[0], { repository: "app" });
  store.initialize(data);
  const checkout = path.join(root, "app");
  store.put("repositories", { id: "app", root: checkout, executor: "process" });
  store.put("task_deliveries", {
    id: "sample-task",
    taskId: "sample-task",
    state: "done",
    commit: "a".repeat(40),
    attempts: [{ attempt: 1, outcome: "done", commit: "a".repeat(40) }],
  });
  const policy = deliveryPolicy({
    delivery: {
      reviewers: [
        {
          id: "c",
          focus: "conventions",
          agent: "avoozl-reviewer",
          distinctFrom: "session",
        },
      ],
    },
  });
  const [review] = planReviewDispatches(store, policy);
  assert.equal(review.executor, "process");
  assert.equal(review.permissionClass, "read");
  assert.equal(review.commit, "a".repeat(40));
  assert.equal(
    review.worktree,
    path.join(root, ".avoozl-worktrees", "avoozl-sample-task-review-c-1"),
  );
  assert.ok(
    review.brief?.includes("a".repeat(40)),
    "the brief names the commit",
  );
});
