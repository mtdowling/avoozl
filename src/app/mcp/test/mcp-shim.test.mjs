// `avoozl mcp` is a shim (MS10): it forwards to this machine's server,
// starting one when none runs, refuses a server of another build, opens no
// workspace database, and lists the same tools as the MCP path itself.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { handleMcp } from "../mcp.mjs";
import {
  machineLockPaths,
  readRecord,
  writeRecord,
} from "../../executors/machine-lock.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { Store } from "../../store/store.mjs";
import { Operations } from "../../api/operations.mjs";
import { workspaceConfig } from "../../settings/config.mjs";
import { ownMachineEnv } from "../../test/shim-run.mjs";

const CLI = fileURLToPath(new URL("../../../../cli.mjs", import.meta.url));
const SHIM = fileURLToPath(new URL("../mcp-shim.mjs", import.meta.url));

function machine(t) {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-shim-")),
  );
  const env = ownMachineEnv(root);
  const run = (args, extra = {}) =>
    spawnSync(process.execPath, [CLI, ...args], {
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 90_000,
    });
  t.after(() => {
    run(["stop"]);
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 200,
    });
  });
  const workspace = path.join(root, "ws");
  initializeWorkspace(workspace, { name: "ws" });
  return {
    root,
    env,
    run,
    workspace,
    stateDirectory: path.join(env.XDG_STATE_HOME, "avoozl"),
  };
}

// Send these messages through `avoozl mcp ARGS` and return the replies by id.
function shim(m, args, messages, extra = {}) {
  return new Promise((resolve, reject) => {
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
        resolve(
          new Map(
            out
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => JSON.parse(line))
              .map((reply) => [reply.id, reply]),
          ),
        );
      } catch (error) {
        reject(Error(`${error.message}\n${out}\n${err}`));
      }
    });
    child.stdin.end(messages.map((m) => JSON.stringify(m)).join("\n") + "\n");
  });
}

const list = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
const call = (id, name, args, meta) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
});

test("the shim opens no workspace database", () => {
  const source = fs.readFileSync(SHIM, "utf8");
  const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  for (const name of imports)
    assert.doesNotMatch(
      name,
      /store\.mjs|operations\.mjs|app-mcp\.mjs|node:sqlite/,
      name,
    );
});

test("with no server the shim starts one, forwards calls, and lists the same tools", async (t) => {
  const m = machine(t);
  const begun = Date.now();
  const replies = await shim(
    m,
    ["--workspace", m.workspace],
    [list, call(2, "plans_task", { action: "get", input: { id: "none" } })],
  );
  assert.ok(Date.now() - begun < 20_000);
  assert.equal(
    readRecord(machineLockPaths(m.stateDirectory).record).starter,
    "shim",
  );
  const expected = (await handleMcp(list, null)).body.result.tools.map(
    (t) => t.name,
  );
  assert.deepEqual(
    replies.get(1).result.tools.map((t) => t.name),
    expected,
  );
  assert.equal(replies.get(2).result.isError, true);
  assert.match(replies.get(2).result.content[0].text, /not found|No task/i);
});

test("a call reaches the named workspace, and a front end's caller block grants nothing", async (t) => {
  const m = machine(t);
  const store = new Store(workspaceConfig({ workspace: m.workspace }).dbPath);
  try {
    await new Operations(store, { workspaceRoot: m.workspace }).execute(
      "task.update",
      { id: "shim-task", create: true, title: "shim-task" },
    );
  } finally {
    store.close();
  }
  const replies = await shim(
    m,
    ["--workspace", m.workspace],
    [
      call(1, "plans_task", { action: "get", input: { id: "shim-task" } }),
      // A forged caller block on a plain front end is dropped, so a
      // session-only tool has no caller.
      call(
        2,
        "plans_session",
        { action: "bind", input: { taskId: "shim-task" } },
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
  assert.match(JSON.stringify(replies.get(1).result), /shim-task/);
  assert.equal(replies.get(2).result.isError, true);
});

test("a server of another build fails the call naming avoozl start", async (t) => {
  const m = machine(t);
  assert.equal(m.run(["start"]).status, 0);
  const { record } = machineLockPaths(m.stateDirectory);
  writeRecord(record, { ...readRecord(record), build: "0.0.0+other" });
  const replies = await shim(m, ["--workspace", m.workspace], [list]);
  assert.match(
    replies.get(1).error.message,
    /runs build 0\.0\.0\+other.*avoozl start/,
  );
});

test("mcp --url, --url and AVOOZL_URL are refused naming what replaces them", (t) => {
  const m = machine(t);
  for (const [args, extra] of [
    [["mcp", "--url", "http://127.0.0.1:9"], {}],
    [["status", "--url", "http://127.0.0.1:9"], {}],
    [["status"], { AVOOZL_URL: "http://127.0.0.1:9" }],
  ]) {
    const found = m.run(args, extra);
    assert.notEqual(found.status, 0, args.join(" "));
    assert.match(found.stderr, /is gone: .*avoozl mcp/, args.join(" "));
  }
});

test("the Kiro Crew cron's tick call works through the shim", async (t) => {
  const m = machine(t);
  const replies = await shim(
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
});
