// Shared helpers for the single-write-path tests. Each caller runs as a real
// `cli.ts` process with write-trace.mjs preloaded, so the trace records every
// SQLite row change and whether an Operations call was on the stack.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { Store } from "../store/store.ts";
import { SECRET, sign } from "./signed-principal.ts";
import { temporaryDirectory } from "./temporary.ts";

const cli = fileURLToPath(new URL("../../../cli.ts", import.meta.url));
// --import takes a URL; a bare D:\ path reads as the scheme "d:".
const hook = new URL("./write-trace.ts", import.meta.url).href;
// One row change the trace recorded.
interface TraceWrite {
  sql: string;
  operations: boolean;
  stack: string[];
}
// What setup gives a test.
type WriteContext = ReturnType<typeof setup>;

function isolatedEnv(root: string, extra: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(root, "config"),
    // A tick through `avoozl mcp` or the CLI keeps its machine state here.
    XDG_STATE_HOME: path.join(root, "state"),
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${hook}`]
      .filter(Boolean)
      .join(" "),
  };
  for (const name of Object.keys(env))
    if (/^AVOOZL_/.test(name)) delete env[name];
  delete env.KIROCREW_PROXY_SECRET;
  return { ...env, ...extra };
}

export function setup({ deny = false } = {}) {
  const root = temporaryDirectory(),
    workspace = path.join(root, "workspace"),
    trace = path.join(root, "trace.jsonl"),
    env = isolatedEnv(root, {
      AVOOZL_WRITE_TRACE: trace,
      ...(deny ? { AVOOZL_DENY_OPERATIONS: "1" } : {}),
    });
  const avoozl = (args: string[], input?: string) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      env,
      input,
    });
    return result;
  };
  const writes = (): TraceWrite[] =>
    fs.existsSync(trace)
      ? fs
          .readFileSync(trace, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as TraceWrite)
      : [];
  return { root, workspace, trace, env, avoozl, writes };
}

// Every row of every table, to prove a refused call wrote nothing.
export function dump(dbPath: string) {
  const store = new Store(dbPath);
  try {
    return Object.fromEntries(
      store.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map(({ name }) => [
          String(name),
          store.db.prepare(`SELECT * FROM "${name}"`).all(),
        ]),
    );
  } finally {
    store.close();
  }
}

export const dbPath = (workspace: string) =>
  path.join(workspace, ".avoozl/local/workspace.sqlite");

export function assertInsideOperations(writes: TraceWrite[], label: string) {
  assert.ok(writes.length > 0, `${label} wrote through the traced path`);
  const outside = writes.filter((write) => !write.operations);
  assert.deepEqual(outside, [], `${label} wrote SQLite outside Operations`);
}

// One task, added to the workspace `avoozl init` made.
const tasks = () => [
  {
    id: "sample-task",
    title: "Implement fixture",
    scope: "catalog",
    status: "planned",
    epic: "inbox",
    track: "catalog",
    tags: [],
    acceptance: ["Pass fixture test."],
  },
];

// Starts a fresh workspace through the CLI itself, then adds one task here,
// outside the traced process.
export function seed(context: WriteContext) {
  const { workspace, avoozl } = context,
    result = avoozl(["init", workspace]);
  assert.equal(result.status, 0, result.stderr);
  const store = new Store(dbPath(workspace));
  try {
    store.initialize({ ...store.read(), tasks: tasks() });
  } finally {
    store.close();
  }
}

// Each CLI process is slow to start, so tests that do not check init copy
// one seeded workspace instead of running it again.
let template: string | undefined;
export function seeded(context: WriteContext) {
  template ??= (() => {
    const base = setup();
    seed(base);
    return base.workspace;
  })();
  fs.cpSync(template, context.workspace, { recursive: true });
}

// name is "tool.action" for a grouped tool.
export const mcpLine = (id: number, name: string, input: unknown) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: name.split(".")[0],
      arguments: name.includes(".")
        ? { action: name.split(".")[1], input }
        : { input },
    },
  });

// Starts `cli.ts app-backend` on 127.0.0.1 and returns a signed
// owner-session command sender.
export async function startBackend(t: TestContext, context: WriteContext) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      hook,
      cli,
      "app-backend",
      "--workspace",
      context.workspace,
      "--port",
      "0",
    ],
    {
      env: { ...context.env, KIROCREW_PROXY_SECRET: SECRET },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = new Promise((resolve) => child.once("exit", resolve));
  t.after(async () => {
    child.kill();
    await exited;
  });
  let output = "";
  const port = await new Promise<number>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once("exit", () => reject(Error("app backend exited: " + output)));
  });
  return async (value: unknown) => {
    const body = JSON.stringify(value);
    return fetch(`http://127.0.0.1:${port}/api/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KiroCrew-Principal": sign(body),
      },
      body,
    });
  };
}
