// Shared helpers for the single-write-path tests. Each caller runs as a real
// `cli.mjs` process with write-trace.mjs preloaded, so the trace records every
// SQLite row change and whether an Operations call was on the stack.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../store.mjs";
import { emptySnapshot } from "../workspace.mjs";
import { temporaryDirectory } from "./temporary.mjs";

const cli = fileURLToPath(new URL("../../../cli.mjs", import.meta.url));
// --import takes a URL; a bare D:\ path reads as the scheme "d:".
const hook = new URL("./write-trace.mjs", import.meta.url).href;
const SECRET = "test-proxy-secret";

function isolatedEnv(root, extra = {}) {
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config") };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|AICOMMANDER|NUPP_WORKSPACE)_/.test(name)) delete env[name];
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
  const avoozl = (args, input) =>
    spawnSync(process.execPath, ["--import", hook, cli, ...args], {
      encoding: "utf8",
      env,
      input,
    });
  const writes = () =>
    fs.existsSync(trace)
      ? fs
          .readFileSync(trace, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  return { root, workspace, trace, env, avoozl, writes };
}

// Every row of every table, to prove a refused call wrote nothing.
export function dump(dbPath) {
  const store = new Store(dbPath);
  try {
    return Object.fromEntries(
      store.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map(({ name }) => [
          name,
          store.db.prepare(`SELECT * FROM "${name}"`).all(),
        ]),
    );
  } finally {
    store.close();
  }
}

export const dbPath = (workspace) =>
  path.join(workspace, ".avoozl/local/workspace.sqlite");

export function assertInsideOperations(writes, label) {
  assert.ok(writes.length > 0, `${label} wrote through the traced path`);
  const outside = writes.filter((write) => !write.operations);
  assert.deepEqual(outside, [], `${label} wrote SQLite outside Operations`);
}

// The initialized workspace's own metadata plus one task, so importing it into
// that workspace has nothing to reconcile.
const snapshot = () => ({
  ...emptySnapshot(),
  tasks: [
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
  ],
});

// Starts a fresh workspace with one task through the CLI itself.
export function seed(context) {
  const { root, workspace, avoozl } = context,
    file = path.join(root, "snapshot.json");
  fs.writeFileSync(file, JSON.stringify(snapshot()));
  for (const args of [
    ["init", workspace],
    ["import", file, "--workspace", workspace],
  ]) {
    const result = avoozl(args);
    assert.equal(result.status, 0, result.stderr);
  }
  return file;
}

// Each CLI process is slow to start, so tests that do not check init and
// import copy one seeded workspace instead of running them again.
let template;
export function seeded(context) {
  template ??= (() => {
    const base = setup();
    return { workspace: base.workspace, file: seed(base) };
  })();
  fs.cpSync(template.workspace, context.workspace, { recursive: true });
  return template.file;
}

export const mcpLine = (id, name, input) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: { input } },
  });

function sign(body) {
  const claim = {
      issuedAt: Math.floor(Date.now() / 1000),
      kind: "owner-session",
      ownerId: "owner",
      requestId: randomBytes(16).toString("hex"),
      version: 1,
    },
    encoded = Buffer.from(JSON.stringify(claim)).toString("base64url"),
    signature = createHmac("sha256", SECRET)
      .update(
        [
          "kirocrew-proxy-principal-v1",
          String(claim.issuedAt),
          "POST",
          "/api/command",
          createHash("sha256").update(body).digest("hex"),
          encoded,
        ].join("\n"),
      )
      .digest("hex");
  return `${encoded}.${signature}`;
}

// Starts `cli.mjs app-backend` on 127.0.0.1 and returns a signed
// owner-session command sender.
export async function startBackend(t, context) {
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
  const port = await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once("exit", () => reject(Error("app backend exited: " + output)));
  });
  return async (value) => {
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
