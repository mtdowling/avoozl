// The `process` executor and the Claude Code definition (R93.2, R93.5).
import assert from "node:assert/strict";
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
import { harnessAllow } from "../harness-allow.mjs";
import { startSupervisor } from "../supervisor.mjs";
import { sandboxKind } from "../sandbox.mjs";
import {
  bindingStatus,
  drainProcessRequests,
  processExecutor,
  projectExecutor,
} from "../executors/process.mjs";
import { enqueueSessionRequests } from "../session-requests.mjs";
import { snapshot } from "./fixtures.mjs";
import { Store } from "../store.mjs";

const CLAUDE = fileURLToPath(
  new URL("../../../examples/harnesses/claude-code.json", import.meta.url),
);

test("the Claude Code definition loads, never skips permissions, and fills", () => {
  const bytes = fs.readFileSync(CLAUDE, "utf8");
  assert.doesNotMatch(
    bytes,
    /bypassPermissions|danger-full-access|--dangerously-|skip-permissions/,
  );
  const definition = parseHarnessDefinition(JSON.parse(bytes));
  assert.equal(definition.promptFrom, "stdin");
  assert.deepEqual(definition.permission, {
    write: "acceptEdits",
    read: "plan",
  });
  const values = {
    session_uuid: "00000000-0000-4000-8000-000000000001",
    permission: definition.permission.write,
    model: "sonnet",
  };
  assert.deepEqual(fillHarnessArgv(definition.start, values), [
    "claude",
    "-p",
    "--output-format",
    "json",
    "--session-id",
    values.session_uuid,
    "--permission-mode",
    "acceptEdits",
  ]);
  assert.deepEqual(fillHarnessArgv(definition.resume, values).slice(4, 6), [
    "--resume",
    values.session_uuid,
  ]);
  assert.deepEqual(fillHarnessArgv(definition.model, values), [
    "--model",
    "sonnet",
  ]);
  assert.deepEqual(
    harnessAllow(definition, [
      ["npm", "test"],
      ["git", "diff", "--check"],
    ]),
    ["--allowedTools", "Bash(npm test)", "Bash(git diff --check)"],
  );
  assert.throws(() => harnessAllow(definition, [["git", "push"]]), /push/);
  const tmp = path.join(os.tmpdir(), "avoozl-claude-tmp");
  const access = harnessPermission(definition, {
    permissionClass: "write",
    worktree: path.join(os.tmpdir(), "avoozl-claude-worktree"),
    tmp,
  });
  assert.ok(access.writeRoots.includes(path.resolve(tmp)));
  assert.deepEqual(
    harnessPermission(definition, { permissionClass: "read" }).writeRoots,
    [],
  );
});

test("keepEnv refuses GitHub, git, SSH, Kiro Crew and Avoozl names", () => {
  const base = JSON.parse(fs.readFileSync(CLAUDE, "utf8"));
  for (const name of [
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "SSH_AUTH_SOCK",
    "KIROCREW_PROXY_SECRET",
    "AVOOZL_WORKSPACE",
    "lower",
  ])
    assert.throws(
      () => parseHarnessDefinition({ ...base, keepEnv: [name] }),
      /keepEnv holds/,
      name,
    );
});

test("a project opts into process; everything else stays on kirocrew", () => {
  assert.equal(projectExecutor({ executor: "process" }), "process");
  assert.equal(projectExecutor({}), "kirocrew");
  assert.equal(projectExecutor(null), "kirocrew");
  assert.equal(bindingStatus("exited 3"), "closed");
  assert.equal(bindingStatus("gone"), "gone");
  assert.equal(bindingStatus("working"), "working");
});

// A fake CLI that reads its prompt from stdin, the way Claude Code's `-p` does.
const AGENT = `
import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
fs.appendFileSync("seen.txt", process.argv.slice(2).join(" ") + "|" + text + "\\n");
const wait = /WAIT:(\\S+)/.exec(text);
if (wait) {
  const timer = setInterval(() => {
    if (fs.existsSync(wait[1])) { clearInterval(timer); process.exit(0); }
  }, 50);
} else process.exit(0);
`;

function machine(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-process-"));
  const cleanups = [];
  t.after(async () => {
    for (const fn of cleanups.reverse()) await fn();
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 100,
    });
  });
  const stateDirectory = path.join(root, "state");
  const configDirectory = path.join(root, "config");
  const worktree = path.join(root, "worktree");
  fs.mkdirSync(worktree, { recursive: true });
  fs.writeFileSync(path.join(worktree, "agent.mjs"), AGENT);
  fs.mkdirSync(path.join(configDirectory, "harnesses"), { recursive: true });
  const bytes = JSON.stringify({
    name: "fake-cli",
    start: ["node", "{worktree}/agent.mjs", "start", "{session_uuid}"],
    resume: ["node", "{worktree}/agent.mjs", "resume", "{session_uuid}"],
    promptFrom: "stdin",
    model: ["--model", "{model}"],
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
  cleanups.push(() => supervisor.close());
  return {
    root,
    stateDirectory,
    worktree,
    supervisor,
    defer: (fn) => cleanups.push(fn),
  };
}

async function until(check, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw Error("Timed out waiting.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test("start, status, send by resume, and stop through the executor", async (t) => {
  const { root, stateDirectory, worktree, supervisor } = machine(t);
  const executor = processExecutor({
    stateDirectory,
    projectFor: () => ({ harness: "fake-cli" }),
  });
  const seen = () =>
    fs.existsSync(path.join(worktree, "seen.txt"))
      ? fs.readFileSync(path.join(worktree, "seen.txt"), "utf8")
      : "";
  const settle = (id) =>
    until(async () => {
      supervisor.pass();
      const status = await executor.status(id);
      return status !== "working" && status;
    });

  const id = await executor.start(
    "worker",
    "1.1",
    worktree,
    "Do the work.",
    "sonnet",
    "write",
  );
  assert.match(id, /^process-/);
  assert.equal(await executor.status(id), "working");
  assert.equal(await settle(id), "exited 0", seen());
  const uuid = id.slice("process-".length);
  assert.equal(seen(), `start ${uuid} --model sonnet|Do the work.\n`);

  // One feedback round: the message arrives on stdin by the resume argv.
  assert.equal(await executor.send(id, "Fix the failing check."), "accepted");
  assert.equal(await executor.status(id), "working");
  assert.equal(await settle(id), "exited 0");
  assert.match(
    seen(),
    new RegExp(`resume ${uuid} --model sonnet\\|Fix the failing check\\.`),
  );

  // Stop a running child: it exits, and nothing queued runs after it.
  const release = path.join(root, "release");
  assert.equal(await executor.send(id, `WAIT:${release}`), "accepted");
  await until(() => {
    supervisor.pass();
    return /WAIT:/.test(seen());
  });
  assert.equal(await executor.send(id, "never delivered"), "accepted");
  assert.equal(await executor.stop(id), "stopped");
  if (process.platform === "win32") fs.writeFileSync(release, "");
  assert.match(await settle(id), /^exited /);
  assert.doesNotMatch(seen(), /never delivered/);
});

test("a session that never ran refuses messages", async (t) => {
  const { stateDirectory, worktree, supervisor } = machine(t);
  const executor = processExecutor({
    stateDirectory,
    projectFor: () => ({ harness: "missing-cli" }),
  });
  const id = await executor.start(
    "worker",
    "1.1",
    worktree,
    "x",
    null,
    "write",
  );
  supervisor.pass();
  assert.equal(await executor.status(id), "exited -1");
  assert.equal(await executor.send(id, "hello"), "refused");
});

test("the drain hands process requests to the supervisor and records status", async (t) => {
  const { root, stateDirectory, worktree, supervisor, defer } = machine(t);
  const store = new Store(path.join(root, "workspace.sqlite"));
  defer(() => store.close());
  const data = snapshot();
  data.tasks[0].repository = "app";
  store.importSnapshot(data);
  store.put("projects", {
    id: "app",
    root: worktree,
    executor: "process",
    harness: "fake-cli",
  });
  enqueueSessionRequests(store, {
    starts: [
      {
        executor: "process",
        role: "worker",
        task: "sample-task",
        title: "avoozl:sample-task work",
        brief: "Do the synthetic work.",
        worktree,
        permissionClass: "write",
      },
      {
        executor: "kirocrew",
        role: "verifier",
        task: "sample-task",
        brief: "Not mine.",
        permissionClass: "read",
      },
    ],
  });
  const { errors } = await drainProcessRequests(store, {
    stateDirectory,
    prepareWorktree: async () => ({ path: worktree }),
  });
  assert.deepEqual(errors, []);
  const bindings = store.list("session_bindings");
  assert.equal(bindings.length, 1);
  const [binding] = bindings;
  assert.equal(binding.executor, "process");
  assert.match(binding.slot, /^process-/);
  assert.equal(
    store.list("session_requests").find((r) => r.executor === "kirocrew").state,
    "pending",
  );
  await until(async () => {
    supervisor.pass();
    await drainProcessRequests(store, { stateDirectory });
    return store.get("session_bindings", binding.slot).status === "closed";
  });
  assert.match(
    fs.readFileSync(path.join(worktree, "seen.txt"), "utf8"),
    /Do the synthetic work\./,
  );
  // A request is consumed once.
  await drainProcessRequests(store, { stateDirectory });
  assert.equal(store.list("session_bindings").length, 1);
});
