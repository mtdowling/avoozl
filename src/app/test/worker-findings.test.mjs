// Findings without MCP (worker-paths WP3.2, WP4.2; design D4): a chat reports
// them by command line, a `process` child by its result file, and both reach
// the same falsifier and gate. Go ahead resumes the same child. Every value
// is fake: a temporary workspace, a real checkout, a fake CLI as the harness.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { deliveryPolicy, planReadyDispatches } from "../delivery.mjs";
import { drainProcessRequests } from "../executors/process.mjs";
import {
  approveHarnessDefinition,
  harnessDefinitionHash,
} from "../harness-definitions.mjs";
import { Operations } from "../operations.mjs";
import { issueReportToken } from "../report-match.mjs";
import { sandboxKind } from "../sandbox.mjs";
import { enqueueSessionRequests } from "../session-requests.mjs";
import { Store } from "../store.mjs";
import { startSupervisor } from "../supervisor.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });
const FINDINGS = {
  read: "src/app.js and its test",
  cause: "the loader skips empty lines",
  plan: "keep empty lines in the loader",
  check: "the loader test with an empty line",
  confidence: "high",
};
const STANDS = {
  verdict: "stands",
  evidence: "The loader is the only reader of that file.",
  confidence: "high",
};

// The fake harness CLI: on its first run it writes findings when its brief
// asks for them; when Avoozl resumes it with Go ahead it edits and says done.
const agent = () => `
import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
fs.mkdirSync(".avoozl", { recursive: true });
fs.appendFileSync(".avoozl/agent.log", process.argv[2] + " " + process.argv[3] + "|" + text.split("\\n")[0] + "\\n");
fs.mkdirSync(".avoozl", { recursive: true });
const write = (value) => fs.writeFileSync(".avoozl/result.json", JSON.stringify(value));
if (process.argv[2] === "start" && /"state": "findings"/.test(text))
  write({ state: "findings", report: ${JSON.stringify(FINDINGS)} });
else if (/^Go ahead/.test(text)) {
  fs.writeFileSync("a.txt", "a\\n");
  write({ state: "done", text: "Kept empty lines." });
}
`;

// A workspace with a real checkout and one leaf `a` that investigates first.
// With `process`, a supervisor and an approved fake harness run on it too.
async function workspace(t, { process: onProcess = false } = {}) {
  const root = temporaryDirectory("avoozl-findings-"),
    checkout = path.join(root, "app");
  fs.mkdirSync(checkout);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  fs.writeFileSync(
    path.join(root, ".avoozl.json"),
    JSON.stringify({
      version: 1,
      delivery: { concurrency: 2, investigate: { mode: "all" } },
    }),
  );
  const { dbPath } = workspaceConfig({ workspace: root, env: {} });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  t.after(() => store.close());
  store.importSnapshot({
    ...snapshot(),
    tasks: [
      {
        id: "a",
        title: "Task a",
        kind: "leaf",
        scope: "catalog",
        status: "planned",
        epic: "sample",
        track: "catalog",
        tags: [],
        acceptance: ["Works."],
        checks: [],
        repository: "app",
      },
    ],
    edges: [],
  });
  store.put("projects", {
    id: "app",
    root: fs.realpathSync.native(checkout),
    baseBranch: "main",
    ...(onProcess ? { executor: "process", harness: "fake-cli" } : {}),
  });
  const ops = new Operations(store, { workspaceRoot: root }),
    w = { root, store, ops };
  // The tick sees every bound session as working, as a roster would say.
  w.tick = () =>
    ops.execute("workspace.tick", {
      sessions: store
        .list("session_bindings")
        .map((b) => ({ target: b.slot, status: "working" })),
    });
  w.dispatch = async (role = "worker") =>
    (await w.tick()).dispatch.find((d) => d.task === "a" && d.role === role);
  if (!onProcess) return w;
  const stateDirectory = path.join(root, "state"),
    configDirectory = path.join(root, "config"),
    // The script and its log live in the task worktree's .avoozl folder,
    // which a sandboxed child may use and Avoozl never commits.
    script = "{worktree}/.avoozl/agent.mjs";
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const bytes = JSON.stringify({
    name: "fake-cli",
    start: ["node", script, "start", "{session_uuid}"],
    resume: ["node", script, "resume", "{session_uuid}"],
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
  t.after(() => supervisor.close());
  Object.assign(w, {
    supervisor,
    stateDirectory,
    log: () => {
      const file = path.join(
        store.get("task_worktrees", "a").path,
        ".avoozl",
        "agent.log",
      );
      return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    },
    // One pass of the supervisor and of the drain, until `check` holds.
    settle: async (check) => {
      const end = Date.now() + 30_000;
      for (;;) {
        supervisor.pass();
        await drainProcessRequests(store, {
          stateDirectory,
          ops,
          prepareWorktree: async (_, { taskId }) => {
            const tree = await ops.execute("worktree.prepare", { taskId });
            fs.mkdirSync(path.join(tree.path, ".avoozl"), { recursive: true });
            fs.writeFileSync(
              path.join(tree.path, ".avoozl", "agent.mjs"),
              agent(),
            );
            return tree;
          },
        });
        if (check()) return;
        if (Date.now() > end) throw Error("Timed out waiting.");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
  });
  return w;
}

// The investigation row without the slots and times that differ by run.
const gate = (store) => {
  const row = store.get("task_investigations", "a");
  return { state: row.state, findings: row.rounds.map((r) => r.findings) };
};

// A chat: it writes its findings to a file and runs the command in its brief.
async function chatFindings(t, { size = null } = {}) {
  const w = await workspace(t),
    request = await w.dispatch();
  assert.equal(request.investigate, true);
  const token = issueReportToken(w.store, { taskId: "a", attempt: 1 });
  assert.match(request.brief, /findings --file <that file>/);
  assert.ok(request.brief.includes(`--token ${token}`));
  assert.doesNotMatch(request.brief, /plans_session/);
  await w.ops.execute("session.bind", {
    taskId: "a",
    slot: "chat",
    attempt: 1,
    source: "tick",
    investigate: true,
    title: "avoozl:a Task a",
  });
  const tree = (await w.ops.execute("worktree.prepare", { taskId: "a" })).path,
    file = path.join(w.root, "findings.json");
  fs.writeFileSync(file, size ? "x".repeat(size) : JSON.stringify(FINDINGS));
  const run = (state, args) =>
    spawnSync(
      process.execPath,
      [cli, "runner", "report", "a", state, ...args, "--workspace", w.root],
      {
        cwd: tree,
        encoding: "utf8",
        env: { ...process.env, AVOOZL_WORKSPACE: "" },
      },
    );
  return { w, tree, run: (args) => run("findings", args), token, file };
}

test("a chat's findings by the command line and a child's by the result file reach one falsifier and one gate", async (t) => {
  const chat = await chatFindings(t);
  const out = chat.run(["--file", chat.file, "--token", chat.token]);
  assert.equal(out.status, 0, out.stderr);
  const asked = await chat.w.dispatch("falsifier");

  const child = await workspace(t, { process: true }),
    request = await child.dispatch();
  assert.equal(request.executor, "process");
  assert.equal(request.investigate, true);
  assert.match(request.brief, /"state": "findings"/);
  assert.doesNotMatch(request.brief, /plans_|runner report/);
  enqueueSessionRequests(child.store, { starts: [request] });
  await child.settle(
    () => child.store.list("session_bindings")[0]?.report?.kind === "findings",
  );
  const [binding] = child.store.list("session_bindings");
  // Waiting for Go ahead, as a chat does: not closed.
  assert.equal(binding.status, "idle");
  const falsifier = await child.dispatch("falsifier");

  assert.deepEqual(gate(child.store), gate(chat.w.store));
  assert.equal(gate(child.store).state, "falsifying");
  const same = (brief, root) => brief.replaceAll(root, "<root>");
  assert.equal(
    same(falsifier.brief, child.root),
    same(asked.brief, chat.w.root),
  );
  assert.equal(falsifier.agent, asked.agent);
});

test("Go ahead resumes the same child session, and its done result lands", async (t) => {
  const w = await workspace(t, { process: true }),
    request = await w.dispatch();
  enqueueSessionRequests(w.store, { starts: [request] });
  const worker = () =>
    w.store.list("session_bindings").find((b) => b.role === "worker");
  await w.settle(() => worker()?.report?.kind === "findings");
  const slot = worker().slot,
    tree = (await w.ops.execute("worktree.prepare", { taskId: "a" })).path,
    base = git(tree, "rev-parse", "HEAD");
  // Done before Go ahead is still refused.
  await assert.rejects(
    w.ops.execute(
      "session.report",
      { taskId: "a", kind: "done", commit: base },
      undefined,
      as(slot),
    ),
    (e) => e.status === 409 && /Go ahead/.test(e.message),
  );
  // The falsifier's reply opens the gate; the tick owes the child its message.
  await w.tick();
  await w.ops.execute("session.bind", {
    taskId: "a",
    slot: "falsifier",
    attempt: 1,
    source: "tick",
    role: "falsifier",
    title: "avoozl:a falsifier",
  });
  await w.ops.execute(
    "session.report",
    { taskId: "a", kind: "done", falsifier: STANDS },
    undefined,
    as("falsifier"),
  );
  const { messages } = await w.tick();
  const go = messages.filter((m) => m.slot === slot);
  assert.equal(go.length, 1);
  assert.match(go[0].text, /^Go ahead on Avoozl task a/);
  assert.doesNotMatch(go[0].text, /plans_/);
  enqueueSessionRequests(w.store, {
    sends: [{ ...go[0], executor: "process" }],
  });
  await w.settle(() => worker()?.report?.kind === "done");
  assert.equal(w.store.list("session_bindings").length, 2, "no new child");
  assert.equal(worker().slot, slot);
  assert.equal(worker().status, "closed");
  assert.match(w.log(), new RegExp(`^start ${slot.slice(8)}\\|`));
  assert.match(w.log(), new RegExp(`\\nresume ${slot.slice(8)}\\|Go ahead`));
  assert.equal(worker().report.commit, git(tree, "rev-parse", "HEAD"));
  assert.notEqual(worker().report.commit, base);
});

test("a findings file over the size limit, or not a regular file, is refused", async (t) => {
  const { w, run, token } = await chatFindings(t, { size: 9000 });
  const file = path.join(w.root, "findings.json");
  let out = run(["--file", file, "--token", token]);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /over 8192 bytes/);
  out = run(["--file", w.root, "--token", token]);
  assert.match(out.stderr, /not a regular file/);
  out = run(["--token", token]);
  assert.match(out.stderr, /--file/);
  assert.equal(w.store.get("session_bindings", "chat").report, undefined);
});

test("a definition with no resume codes the task without the step and says why", async (t) => {
  const w = await workspace(t, { process: true }),
    plan = (options) => {
      const policy = deliveryPolicy({
        delivery: { concurrency: 2, investigate: { mode: "all" } },
      });
      return planReadyDispatches(w.store, policy, options).find(
        (d) => d.task === "a",
      );
    };
  assert.equal(plan({}).investigate, true);
  const skipped = plan({ resumable: () => false });
  assert.equal(skipped.investigate, undefined);
  assert.doesNotMatch(skipped.brief, /Investigate first/);
  assert.match(skipped.brief, /"state": "done"/);
  assert.match(skipped.investigateSkipped, /no resume command/);
  // The reason lands on the task when the child opens.
  enqueueSessionRequests(w.store, { starts: [skipped] });
  await w.settle(() => w.store.list("session_bindings").length > 0);
  const evidence = path.join(w.root, ".avoozl", "local", "evidence", "a");
  assert.match(
    fs.readFileSync(path.join(evidence, "bundle.json"), "utf8"),
    /Investigate first was skipped/,
  );
});
