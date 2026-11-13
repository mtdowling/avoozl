// The Kiro Crew app's stdio MCP server is safe to share between sessions: each
// request picks its workspace from the gateway's caller block, never from the
// process, and it advertises kirocrew.caller-identity so the gateway sends one.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { workspaceConfig } from "../config.mjs";
import { WorkspaceRegistry } from "../host-config.mjs";
import { Operations } from "../operations.mjs";
import { Store } from "../store.mjs";
import { initializeWorkspace } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  launcher = path.join(root, "kirocrew-app", "bin", "avoozl_mcp.py");

function isolatedEnv(dir) {
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(dir, "config") };
  for (const name of Object.keys(env))
    if (
      /^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_|^NUPP_WORKSPACE$|^PORT$/.test(name)
    )
      delete env[name];
  return env;
}

// An initialized workspace with one task per slot, each slot bound to its own.
async function workspace(dir, name, task, slots) {
  const workspaceRoot = path.join(dir, name);
  initializeWorkspace(workspaceRoot, { name });
  const store = new Store(workspaceConfig({ workspace: workspaceRoot }).dbPath);
  try {
    const ops = new Operations(store, { workspaceRoot });
    await ops.execute("task.update", { id: task, create: true, title: task });
    for (const [i, slot] of slots.entries()) {
      const taskId = i ? `${task}-${i}` : task;
      if (i)
        await ops.execute("task.update", {
          id: taskId,
          create: true,
          title: taskId,
        });
      await ops.execute("session.bind", { taskId, slot });
    }
  } finally {
    store.close();
  }
  return workspaceRoot;
}

const call = (id, name, input, sessionKey) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: {
    name,
    arguments: { input },
    ...(sessionKey
      ? {
          _meta: {
            "kirocrew.caller": { schemaVersion: 1, sessionKey },
          },
        }
      : {}),
  },
});

function serve(dir, cwd, messages) {
  const output = execFileSync("python3", [launcher], {
    cwd,
    encoding: "utf8",
    env: isolatedEnv(dir),
    input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
  });
  return new Map(
    output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .map((reply) => [reply.id, reply]),
  );
}

const text = (reply) => reply.result.content[0].text;

test("one pooled MCP process serves two workspaces without mixing them", async () => {
  // Nearby inputs: interleaved callers from two workspaces, a bound caller
  // naming the other workspace's task, a caller with no block, an unbound
  // caller (launch workspace), a non-dashboard caller, a slot bound in both
  // workspaces, and a working directory that is itself a workspace.
  const dir = temporaryDirectory("avoozl-pooled-"),
    env = isolatedEnv(dir);
  const alpha = await workspace(dir, "alpha", "task-a", ["slot-a", "slot-x"]),
    beta = await workspace(dir, "beta", "task-b", ["slot-b", "slot-x"]),
    cwd = await workspace(dir, "cwd", "task-c", ["slot-c"]);
  const registry = new WorkspaceRegistry({ env });
  registry.add("alpha", { id: "alpha", root: alpha, enabled: true });
  registry.add("beta", { id: "beta", root: beta, enabled: true });
  registry.close();
  const progress = (taskId, words) => ({
    taskId,
    kind: "progress",
    text: words,
  });

  const replies = serve(dir, cwd, [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    },
    call(2, "plans_report", progress("task-a", "A one."), "dashboard:slot-a"),
    call(3, "plans_report", progress("task-b", "B one."), "dashboard:slot-b"),
    call(4, "plans_report", progress("task-a", "A two."), "dashboard:slot-a"),
    call(5, "plans_report", progress("task-b", "Cross."), "dashboard:slot-a"),
    call(6, "plans_report", progress("task-a", "Anon.")),
    call(7, "plans_report", progress("task-c", "Cwd."), "dashboard:slot-c"),
    call(8, "plans_report", progress("task-a-1", "Both."), "dashboard:slot-x"),
    call(9, "plans_task_sessions", { id: "task-b" }, "dashboard:slot-b"),
    call(10, "plans_task_sessions", { id: "task-b" }, "dashboard:slot-a"),
    call(11, "plans_task_sessions", { id: "task-a" }, "cron:job-1"),
  ]);

  assert.deepEqual(
    replies.get(1).result.capabilities.experimental,
    { "kirocrew.caller-identity": { schemaVersion: 1 } },
    "advertised in initialize",
  );
  for (const id of [2, 3, 4])
    assert.notEqual(
      replies.get(id).result.isError,
      true,
      text(replies.get(id)),
    );
  assert.match(text(replies.get(5)), /Task not found/, "binding wins");
  assert.match(text(replies.get(6)), /identity/, "no caller fails closed");
  assert.match(
    text(replies.get(7)),
    /Task not found/,
    "the working directory's workspace is never used",
  );
  assert.match(text(replies.get(8)), /more than one Avoozl workspace/);
  const found = (id) => replies.get(id).result.isError !== true;
  assert.equal(found(9), true, "slot-b reads beta");
  assert.equal(found(10), false, "slot-a never reads beta");
  assert.equal(found(11), true, "a caller with no binding uses the default");

  const reports = (workspaceRoot) => {
    const store = new Store(
      workspaceConfig({ workspace: workspaceRoot }).dbPath,
    );
    try {
      return store
        .list("session_bindings")
        .filter((binding) => binding.report)
        .map((binding) => [binding.slot, binding.report.text]);
    } finally {
      store.close();
    }
  };
  assert.deepEqual(reports(alpha), [["slot-a", "A two."]]);
  assert.deepEqual(reports(beta), [["slot-b", "B one."]]);
  assert.deepEqual(reports(cwd), []);
});

test("without a launch workspace, an unbound caller is refused, not served from the cwd", async () => {
  // Nearby inputs: no catalog, a working directory that is a workspace.
  const dir = temporaryDirectory("avoozl-pooled-"),
    cwd = await workspace(dir, "cwd", "task-c", []);
  const replies = serve(dir, cwd, [
    call(1, "plans_task_sessions", { id: "task-c" }, "dashboard:slot-z"),
  ]);
  assert.equal(replies.get(1).result.isError, true);
  assert.match(text(replies.get(1)), /no workspace for this session/);
});
