// `avoozl mcp` is a plain stdio MCP server per chat (MS10): it serves the
// named workspace in process, starts nothing and never loops, lists the same
// tools as the MCP path itself, and its tick tool runs one pass and returns.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { handleMcp } from "../mcp.ts";
import { initializeWorkspace } from "../../workspace/workspace.ts";
import { Store } from "../../store/store.ts";
import { Operations } from "../../api/operations.ts";
import { workspaceConfig } from "../../settings/config.ts";
import { ownMachineEnv } from "../../test/own-machine.ts";
import { waitFor } from "../../test/fixtures.ts";
import { loopLockPaths, readRecord } from "../../executors/pass-lock.ts";
import { found } from "../../test/view-shapes.ts";

// One JSON-RPC reply of `avoozl mcp`, for the fields these tests read.
interface Reply {
  id: number;
  result: {
    isError?: boolean;
    tools: { name: string }[];
    content: { text: string }[];
  };
}
// The tool names a tools/list answer body holds.
function toolNames(body: unknown): string[] {
  assert.ok(body && typeof body === "object" && "result" in body);
  const { result } = body;
  assert.ok(result && typeof result === "object" && "tools" in result);
  assert.ok(Array.isArray(result.tools));
  return result.tools.map((tool: { name: string }) => tool.name);
}

const CLI = fileURLToPath(new URL("../../../../cli.ts", import.meta.url));

function machine(t: TestContext) {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-mcp-")),
  );
  const env = ownMachineEnv(root);
  const run = (args: string[], extra: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [CLI, ...args], {
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 90_000,
    });
  t.after(() =>
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 200,
    }),
  );
  const workspace = path.join(root, "ws");
  initializeWorkspace(workspace, { name: "ws" });
  return {
    root,
    env,
    run,
    workspace,
    stateDirectory: path.join(found(env.XDG_STATE_HOME), "avoozl"),
  };
}

// Send these messages through `avoozl mcp ARGS` and return the replies by id.
function mcp(
  m: ReturnType<typeof machine>,
  args: string[],
  messages: unknown[],
  extra: NodeJS.ProcessEnv = {},
) {
  return new Promise<{ get: (id: number) => Reply }>((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, "mcp", ...args], {
      env: { ...m.env, ...extra },
    });
    let out = "",
      err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", reject);
    child.on("exit", () => {
      try {
        const replies = new Map(
          out
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line): Reply => JSON.parse(line))
            .map((reply) => [reply.id, reply]),
        );
        resolve({ get: (id) => found(replies.get(id), `reply ${id}`) });
      } catch (error) {
        reject(
          Error(
            `${error instanceof Error ? error.message : String(error)}\n${out}\n${err}`,
          ),
        );
      }
    });
    child.stdin.end(
      messages.map((message) => JSON.stringify(message)).join("\n") + "\n",
    );
  });
}

const list = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
const call = (
  id: number,
  name: string,
  args: Record<string, unknown>,
  meta?: Record<string, unknown>,
) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
});

test("avoozl mcp serves the workspace, lists the same tools, and starts no process", async (t) => {
  const m = machine(t);
  const replies = await mcp(
    m,
    ["--workspace", m.workspace],
    [list, call(2, "plans_task", { action: "get", input: { id: "none" } })],
  );
  const expected = toolNames((await handleMcp(list, null)).body);
  assert.deepEqual(
    replies.get(1).result.tools.map((t) => t.name),
    expected,
  );
  assert.equal(replies.get(2).result.isError, true);
  assert.match(replies.get(2).result.content[0].text, /not found|No task/i);
  // Nothing of a tick or a server was made.
  assert.equal(fs.existsSync(path.join(m.stateDirectory, "supervisor")), false);
});

test("a call reaches the named workspace, and a caller block grants nothing", async (t) => {
  const m = machine(t);
  const store = new Store(workspaceConfig({ workspace: m.workspace }).dbPath);
  try {
    await new Operations(store, { workspaceRoot: m.workspace }).execute(
      "task.update",
      { id: "mcp-task", create: true, title: "mcp-task" },
    );
  } finally {
    store.close();
  }
  const replies = await mcp(
    m,
    ["--workspace", m.workspace],
    [
      call(1, "plans_task", { action: "get", input: { id: "mcp-task" } }),
      // A forged caller block on a plain server is not read, so a
      // session-only tool has no caller.
      call(
        2,
        "plans_session",
        { action: "bind", input: { taskId: "mcp-task" } },
        {
          "kirocrew.caller": {
            schemaVersion: 1,
            sessionKey: "dashboard:forged",
          },
        },
      ),
    ],
  );
  assert.equal(
    replies.get(1).result.isError,
    undefined,
    JSON.stringify(replies.get(1)),
  );
  assert.match(JSON.stringify(replies.get(1).result), /mcp-task/);
  assert.equal(replies.get(2).result.isError, true);
});

test("the tick tool runs one pass for the workspace and returns", async (t) => {
  const m = machine(t);
  const replies = await mcp(
    m,
    ["--workspace", m.workspace],
    [call(1, "plans_maintain", { action: "tick", input: {} })],
  );
  const reply = replies.get(1).result;
  assert.equal(reply.isError, undefined, JSON.stringify(reply));
  const results: { root?: string; tick?: string }[] = JSON.parse(
    reply.content[0].text,
  );
  assert.deepEqual(
    results.filter((r) => r.root).map((r) => [r.root, r.tick]),
    [[m.workspace, "ran"]],
  );
});

test("--url and AVOOZL_URL are refused naming avoozl mcp", (t) => {
  const m = machine(t);
  const refused: [string[], NodeJS.ProcessEnv][] = [
    [["mcp", "--url", "http://127.0.0.1:9"], {}],
    [["status", "--url", "http://127.0.0.1:9"], {}],
    [["status"], { AVOOZL_URL: "http://127.0.0.1:9" }],
  ];
  for (const [args, extra] of refused) {
    const ran = m.run(args, extra);
    assert.notEqual(ran.status, 0, args.join(" "));
    assert.match(ran.stderr, /takes no .*avoozl mcp/, args.join(" "));
  }
});

test("the Kiro Crew cron's tick call runs the pass and returns the chat intents", async (t) => {
  const m = machine(t);
  const added = m.run(["workspace", "add", "mcp-stdio", "--root", m.workspace]);
  assert.equal(added.status, 0, added.stderr);
  const replies = await mcp(
    m,
    ["--kirocrew", "--workspace", m.workspace],
    [call(1, "plans_maintain", { action: "tick", input: { cron: true } })],
    { KIROCREW_SESSION_KEY: "cron:job1" },
  );
  const reply = replies.get(1).result;
  assert.equal(reply.isError, undefined, JSON.stringify(reply));
  const intents = JSON.parse(reply.content[0].text);
  assert.deepEqual(Object.keys(intents).sort(), [
    "dispatch",
    "messages",
    "notify",
    "observe",
  ]);
  await waitFor(
    () => fs.existsSync(path.join(m.stateDirectory, "supervisor")),
    { label: "the detached machine pass to start" },
  );
  const holder = await waitFor(
    () =>
      readRecord(
        loopLockPaths(workspaceConfig({ workspace: m.workspace }).dbPath)
          .record,
      ),
    { label: "the detached machine pass to take the workspace lock" },
  );
  await waitFor(
    () => {
      try {
        process.kill(found(holder?.pid), 0);
        return false;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ESRCH")
          return true;
        throw error;
      }
    },
    { timeoutMs: 50_000, label: "the detached machine pass to exit" },
  );
});
