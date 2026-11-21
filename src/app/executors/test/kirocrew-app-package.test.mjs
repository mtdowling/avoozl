import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkspaceRegistry } from "../../settings/host-config.mjs";
import { initializeWorkspace } from "../../workspace/workspace.mjs";
import { temporaryDirectory } from "../../test/temporary.mjs";
import { runOwnMachine } from "../../test/own-machine.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url)),
  app = path.join(root, "hosts", "kirocrew"),
  manifest = JSON.parse(fs.readFileSync(path.join(app, "app.json"), "utf8")),
  launcher = path.join(app, "bin", "avoozl.mjs"),
  CLI = path.join(root, "cli.mjs");

function isolatedEnv(dir) {
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(dir, "config") };
  for (const name of Object.keys(env))
    if (/^AVOOZL_|^PORT$/.test(name)) delete env[name];
  return env;
}

test("manifest declares the §4.2 app and every target ships in the package", () => {
  assert.equal(manifest.name, "avoozl");
  assert.deepEqual(manifest.backend, {
    type: "node",
    entryPoint: "bin/avoozl.mjs",
    healthCheck: "/health",
    signedPrincipal: true,
  });
  assert.deepEqual(manifest.crons, [
    {
      name: "avoozl-tick",
      every: 60,
      script: "crons/tick.py:run",
      silent: true,
      persistent_session: false,
      timeout: 120,
    },
  ]);
  assert.equal(manifest.permissions.cron, true);
  // The second grant reads only the sessions the tick opened (session-observer.mjs);
  // the third lets Settings > Repositories reveal a checkout in Finder; the
  // fourth reads tokens and credits of the app's own sessions (rows Kiro
  // Crew stamps with the app), and the fifth lists models for Settings > Flow.
  assert.deepEqual(manifest.permissions.api, [
    "/apps/avoozl/api/*",
    "/api/chat/slots/avoozl_*",
    "/api/reveal",
    "/api/usage/turns",
    "/api/models",
  ]);
  assert.deepEqual(
    manifest.notifications.channels.map((c) => c.id),
    ["decision", "failure", "untriaged"],
  );
  assert.deepEqual(manifest.dependencies, {
    commands: ["node", "git"],
    optionalCommands: ["gh"],
  });
  // Kiro Crew anchors only a relative .py MCP launcher to the install root.
  assert.deepEqual(manifest.mcpServers.avoozl, {
    command: "python3",
    args: ["bin/avoozl_mcp.py"],
  });
  const targets = [
    ...manifest.skills.map((p) => path.join(p, "SKILL.md")),
    ...manifest.agents,
    manifest.backend.entryPoint,
    manifest.crons[0].script.split(":")[0],
    ...manifest.mcpServers.avoozl.args,
    path.join("ui", manifest.ui.entry),
    path.join("bin", "lib", "cli.mjs"),
  ];
  for (const target of targets) {
    const real = fs.realpathSync.native(path.join(app, target));
    assert.ok(real.startsWith(fs.realpathSync.native(app) + path.sep), target);
  }
  for (const agent of manifest.agents) {
    const spec = JSON.parse(fs.readFileSync(path.join(app, agent), "utf8"));
    assert.equal(spec.name, path.basename(agent, ".json"));
  }
  const responder = JSON.parse(
    fs.readFileSync(path.join(app, "agents", "avoozl-responder.json"), "utf8"),
  );
  assert.ok(!responder.tools.includes("execute_bash"), "responder reads only");
});

test("the built package carries no path of the machine that built it", () => {
  const lib = path.join(app, "bin", "lib"),
    needle = fs.realpathSync.native(root).replace(/\/$/, "");
  for (const file of fs.readdirSync(lib, { recursive: true })) {
    const full = path.join(lib, file);
    if (fs.statSync(full).isFile())
      assert.ok(!fs.readFileSync(full, "utf8").includes(needle), file);
  }
});

test("packaged launcher serves only the backend and MCP", () => {
  const dir = temporaryDirectory();
  for (const command of ["serve", "next", "take", "report", "retry"])
    assert.throws(
      () =>
        execFileSync(process.execPath, [launcher, command], {
          cwd: dir,
          env: isolatedEnv(dir),
          stdio: "pipe",
        }),
      (error) =>
        error.status === 2 && /use app-backend, mcp\./.test(error.stderr),
      command,
    );
});

test("the packaged MCP server lists the plans tools and ships no runner hook", () => {
  const dir = temporaryDirectory(),
    workspace = path.join(dir, "workspace");
  initializeWorkspace(workspace);
  const listed = runOwnMachine(
    "python3",
    [path.join(app, "bin", "avoozl_mcp.py"), "--workspace", workspace],
    {
      cwd: dir,
      dir,
      env: isolatedEnv(dir),
      input:
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n",
    },
  );
  const names = JSON.parse(listed.trim().split("\n")[0]).result.tools.map(
    (tool) => tool.name,
  );
  for (const name of ["plans_view", "plans_session", "plans_task"])
    assert.ok(names.includes(name), name);
  assert.equal(
    fs.existsSync(path.join(app, "hooks", "avoozl-runner.json")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(app, "bin", "lib", "src", "app", "runner")),
    false,
  );
});

test("the MCP launcher names its crew home when the launch env has none", () => {
  // A chat's launch env holds no KIROCREW_HOME; the install path does.
  const home = temporaryDirectory(),
    bin = path.join(home, "apps", "avoozl", "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.copyFileSync(
    path.join(app, "bin", "avoozl_mcp.py"),
    path.join(bin, "avoozl_mcp.py"),
  );
  fs.writeFileSync(
    path.join(bin, "avoozl.mjs"),
    "console.log(process.env.KIROCREW_HOME ?? '');\n",
  );
  const run = (env) =>
    execFileSync("python3", [path.join(bin, "avoozl_mcp.py")], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
    }).trim();
  assert.equal(run({}), fs.realpathSync.native(home));
  assert.equal(run({ KIROCREW_HOME: "/elsewhere" }), "/elsewhere");
});

test("every plans_* tool a brief, prompt, agent, cron or skill names is listed", () => {
  const dir = temporaryDirectory();
  const listed = runOwnMachine(
    "python3",
    [path.join(app, "bin", "avoozl_mcp.py")],
    {
      cwd: dir,
      dir,
      env: isolatedEnv(dir),
      input:
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n",
    },
  );
  const names = new Set(
    JSON.parse(listed.trim().split("\n")[0]).result.tools.map((t) => t.name),
  );
  // Briefs, nudges, skills and agent metadata are in src/app, role prompts in
  // prompts/; agents mount tools by name.
  const files = (dir, test) =>
    fs
      .readdirSync(dir, { recursive: true })
      .map((name) => path.join(dir, name))
      .filter((file) => test(file) && fs.statSync(file).isFile());
  const sources = [
    ...files(
      path.join(root, "src", "app"),
      (f) => /\.(mjs|ts)$/.test(f) && !f.includes(`${path.sep}test${path.sep}`),
    ),
    ...files(
      path.join(root, "src", "app"),
      (f) =>
        /\.(md|json)$/.test(f) && !f.includes(`${path.sep}test${path.sep}`),
    ),
    ...files(path.join(root, "prompts"), (f) => f.endsWith(".md")),
    ...files(path.join(app, "agents"), (f) => f.endsWith(".json")),
    ...files(path.join(app, "crons"), (f) => f.endsWith(".py")),
    ...files(path.join(app, "skills"), (f) => f.endsWith(".md")),
  ];
  const missing = new Set();
  for (const file of sources)
    for (const [name] of fs
      .readFileSync(file, "utf8")
      .matchAll(/\bplans_[a-z]+(?:_[a-z]+)*\b/g))
      if (!names.has(name))
        missing.add(`${path.relative(root, file)}: ${name}`);
  assert.deepEqual([...missing], []);
});

test("packaged MCP server answers the tick from any working directory", () => {
  const dir = temporaryDirectory(),
    workspace = path.join(dir, "workspace");
  initializeWorkspace(workspace);
  const messages = [
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
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "plans_maintain",
        arguments: { action: "tick", input: {} },
      },
    },
  ];
  const output = runOwnMachine(
    "python3",
    [path.join(app, "bin", "avoozl_mcp.py"), "--workspace", workspace],
    {
      cwd: dir,
      dir,
      env: isolatedEnv(dir),
      input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
    },
  );
  const [, tick] = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.notEqual(tick.result.isError, true, JSON.stringify(tick));
  // The tick tool ran one pass for the named workspace.
  const results = JSON.parse(tick.result.content[0].text);
  assert.deepEqual(
    results.filter((r) => r.root).map((r) => [r.root, r.tick]),
    [[workspace, "ran"]],
  );
});

test("packaged MCP server serves the catalog's default workspace when none is named", () => {
  const dir = temporaryDirectory(),
    workspace = path.join(dir, "workspace"),
    env = isolatedEnv(dir);
  initializeWorkspace(workspace);
  const registry = new WorkspaceRegistry({ env });
  registry.add("sample", { id: "sample", root: workspace, enabled: true });
  registry.close();
  const output = runOwnMachine(
    "python3",
    [path.join(app, "bin", "avoozl_mcp.py")],
    {
      cwd: dir,
      dir,
      env,
      input:
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "plans_maintain",
            arguments: { action: "tick", input: {} },
          },
        }) + "\n",
    },
  );
  const reply = JSON.parse(output.trim());
  assert.notEqual(reply.result.isError, true, output);
  // The pass ran for the catalog's default workspace.
  const results = JSON.parse(reply.result.content[0].text);
  assert.deepEqual(
    results
      .filter((r) => r.root)
      .map((r) => [fs.realpathSync.native(r.root), r.tick]),
    [[fs.realpathSync.native(workspace), "ran"]],
  );
});

test("packaged launcher defaults to a loopback, signed-principal backend", async (t) => {
  const dir = temporaryDirectory(),
    workspace = path.join(dir, "workspace");
  initializeWorkspace(workspace);
  // A state folder of its own, so nothing touches this machine's.
  const env = {
    ...isolatedEnv(dir),
    XDG_STATE_HOME: path.join(dir, "state"),
    PORT: "0",
    KIROCREW_PROXY_SECRET: "s",
  };
  const child = spawn(process.execPath, [launcher, "--workspace", workspace], {
    cwd: dir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    let text = "";
    child.stdout.on("data", (chunk) => {
      text += chunk;
      const match = /listening on (\S+):(\d+)/.exec(text);
      if (match) {
        assert.equal(match[1], "127.0.0.1");
        resolve(match[2]);
      }
    });
    child.once("exit", (code) => reject(Error("backend exited " + code)));
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(base + "/health")).status, 200);
  const unsigned = await fetch(base + "/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "state" }),
  });
  assert.equal(unsigned.status, 401);
});

// Runs crons/tick.py:run against a fake ScriptContext that records each call.
function tick(intents, { results = {} } = {}) {
  const harness = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("tick", sys.argv[1])
tick = importlib.util.module_from_spec(spec); spec.loader.exec_module(tick)
intents, results = json.loads(sys.argv[2]), json.loads(sys.argv[3])
calls, folders = [], list(results.pop("folders", []))
class Ctx:
    def call_tool(self, server, tool, args):
        calls.append(["call_tool", server, tool, args])
        if tool == "plans_maintain": return json.dumps(intents)
        return json.dumps(results.get(tool, {"ok": True}))
    def list_session_folders(self):
        calls.append(["list_session_folders"]); return list(folders)
    def create_session_folder(self, name, parent_id=""):
        folder = {"id": "f%d" % len(folders), "name": name, "parent_id": parent_id}
        folders.append(folder); calls.append(["create_session_folder", name, parent_id])
        return folder
    def open_session(self, name="", folder_id="", agent="", model=""):
        calls.append(["open_session", name, folder_id, agent] + ([model] if model else [])); return "slot-new"
    def send_to_session(self, slot, message):
        calls.append(["send_to_session", slot, message])
        if slot in results.get("refuse", []): raise RuntimeError("HTTP 403: not_creator")
        return {"ok": True}
    def notify(self, text, **kwargs):
        calls.append(["notify", text]); return {}
    def set_session_mode(self, slot, mode):
        calls.append(["set_session_mode", slot, mode]); return {}
    def session_status(self):
        calls.append(["session_status"])
        if results.get("sessions") == "raise": raise RuntimeError("no roster")
        return {"ok": True, "sessions": results.get("sessions", [])}
if results.pop("stock", False):  # a stock Kiro Crew: no ScriptContext.session_status
    del Ctx.session_status
returned = None
try:
    returned = tick.run(Ctx()); outcome = "ok"
except tick.Skip:
    outcome = "skip"
out = {"outcome": outcome, "calls": calls}
if returned is not None: out["returned"] = returned
print(json.dumps(out))
`;
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        harness,
        path.join(app, "crons", "tick.py"),
        JSON.stringify(intents),
        JSON.stringify(results),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    ),
  );
}

// The script reads the roster and its folders first and hands both to the
// tick (observe first).
const tickCalls = (folders = {}) => [
  ["session_status"],
  ["list_session_folders"],
  [
    "call_tool",
    "avoozl:avoozl",
    "plans_maintain",
    { action: "tick", input: { cron: true, sessions: [], folders } },
  ],
];
const TICK = tickCalls();

test("tick cron raises Skip when the tick is idle or locked", () => {
  const idle = { observe: [], dispatch: [], messages: [], notify: [] };
  assert.deepEqual(tick(idle), { outcome: "skip", calls: TICK });
  assert.deepEqual(tick({ skipped: "locked" }), {
    outcome: "skip",
    calls: TICK,
  });
});

test("tick cron hands every session status to the tick before it plans", () => {
  const sessions = [
    { target: "slot-1", status: "closed" },
    { target: "slot-other", status: "idle" },
  ];
  const result = tick(
    { observe: [], dispatch: [], messages: [], notify: [] },
    { results: { sessions: [...sessions, { target: 7 }] } },
  );
  assert.equal(result.outcome, "skip");
  assert.deepEqual(result.calls, [
    ["session_status"],
    ["list_session_folders"],
    [
      "call_tool",
      "avoozl:avoozl",
      "plans_maintain",
      { action: "tick", input: { cron: true, sessions, folders: {} } },
    ],
  ]);
  // An unreadable roster is not an empty one: the tick is told it saw nothing.
  assert.deepEqual(
    tick(
      { observe: [], dispatch: [], messages: [], notify: [] },
      { results: { sessions: "raise" } },
    ).calls,
    [
      ["session_status"],
      ["list_session_folders"],
      [
        "call_tool",
        "avoozl:avoozl",
        "plans_maintain",
        { action: "tick", input: { cron: true, folders: {} } },
      ],
    ],
  );
  // A stock Kiro Crew has no session_status: the cron says it is the cron and
  // sends no roster, and the app backend reads the sessions instead.
  assert.deepEqual(
    tick(
      { observe: [], dispatch: [], messages: [], notify: [] },
      { results: { stock: true } },
    ).calls,
    [
      ["list_session_folders"],
      [
        "call_tool",
        "avoozl:avoozl",
        "plans_maintain",
        { action: "tick", input: { cron: true, folders: {} } },
      ],
    ],
  );
});

test("tick cron passes Kiro Crew's model fields through only when the row has them", () => {
  const model = {
    model_requested: "m-b",
    served_model: "auto",
    model_withheld: true,
    model_changed: false,
  };
  const result = tick(
    { observe: [], dispatch: [], messages: [], notify: [] },
    {
      results: {
        sessions: [
          { target: "new", status: "idle", ...model, extra: 1 },
          { target: "old", status: "idle", model_requested: "m-b" },
        ],
      },
    },
  );
  assert.deepEqual(result.calls[2][3].input.sessions, [
    { target: "new", status: "idle", ...model },
    { target: "old", status: "idle" },
  ]);
});

const DISPATCH = {
  task: "w1.loader",
  title: "avoozl:w1.loader Add loader",
  folder: "Avoozl/example-app",
  agent: "kirocrew-worker",
  brief: "Do the work.",
};

test("tick cron creates a missing folder and opens nothing until it has a project directory", () => {
  const result = tick({
    observe: [],
    dispatch: [DISPATCH],
    messages: [],
    notify: [],
  });
  assert.equal(result.outcome, "skip");
  assert.deepEqual(result.calls, [
    ...TICK,
    ["list_session_folders"],
    ["create_session_folder", "Avoozl", ""],
    ["create_session_folder", "example-app", "f0"],
  ]);
});

test("tick cron sends every other message when the gateway refuses one", () => {
  const result = tick(
    {
      observe: [],
      dispatch: [],
      messages: [
        { slot: "slot-old", text: "Stand by." },
        { slot: "slot-2", text: "Resume." },
      ],
      notify: [],
    },
    { results: { refuse: ["slot-old"] } },
  );
  assert.equal(result.outcome, "ok");
  assert.deepEqual(
    result.calls.filter((c) => c[0] === "send_to_session").map((c) => c[1]),
    ["slot-old", "slot-2"],
  );
  assert.match(
    result.returned,
    /^1 message\(s\) refused: slot-old: .*not_creator/,
  );
});

test("tick cron sets trust mode again on each live worker chat it owns, once, and on no other", () => {
  const result = tick({
    observe: [
      { slot: "slot-w", taskId: "t1", role: "worker" },
      { slot: "slot-w", taskId: "t1", role: "worker" },
      { slot: "slot-v", taskId: "t1", role: "verifier" },
    ],
    dispatch: [],
    messages: [],
    notify: [],
  });
  // Nothing opened or sent, so the run is silent, but trust was set first.
  assert.equal(result.outcome, "skip");
  assert.deepEqual(
    result.calls.filter((call) => call[0] === "set_session_mode"),
    [["set_session_mode", "slot-w", "trust"]],
  );
});

test("tick cron binds each session before its brief, then messages; it sends no notices", () => {
  const folders = [
    { id: "f0", name: "Avoozl", parent_id: "" },
    { id: "f1", name: "example-app", parent_id: "f0", project_dir: "/repo" },
  ];
  const result = tick(
    {
      observe: [],
      dispatch: [{ ...DISPATCH, role: "worker", attempt: 2 }],
      messages: [{ slot: "slot-2", text: "Resume." }],
      notify: [{ channel: "decision", text: "Decide." }],
    },
    { results: { folders } },
  );
  assert.equal(result.outcome, "ok");
  assert.deepEqual(result.calls, [
    ...tickCalls({ Avoozl: false, "Avoozl/example-app": true }),
    ["list_session_folders"],
    ["open_session", "avoozl:w1.loader Add loader", "f1", "kirocrew-worker"],
    [
      "call_tool",
      "avoozl:avoozl",
      "plans_session",
      {
        action: "bind",
        input: {
          taskId: "w1.loader",
          slot: "slot-new",
          title: "avoozl:w1.loader Add loader",
          source: "tick",
          role: "worker",
          attempt: 2,
        },
      },
    ],
    ["set_session_mode", "slot-new", "trust"],
    ["send_to_session", "slot-new", "Do the work."],
    ["send_to_session", "slot-2", "Resume."],
  ]);
  // Notices go out from the tick pass and the app backend; the cron
  // only opens, sends and re-trusts (MS12.2).
  assert.equal(
    result.calls.some((call) => call[0] === "notify"),
    false,
  );
});

test("tick cron opens a review session on its named model and binds the model and commit", () => {
  // Nearby input: a dispatch without a model (no model argument, above).
  const folders = [
      { id: "f0", name: "Avoozl", parent_id: "" },
      { id: "f1", name: "example-app", parent_id: "f0", project_dir: "/repo" },
    ],
    commit = "a".repeat(40);
  const result = tick(
    {
      observe: [],
      dispatch: [
        {
          ...DISPATCH,
          title: "avoozl:w1.loader review conventions aaaaaaaaaaaa",
          agent: "avoozl-reviewer",
          role: "review:conventions",
          attempt: 1,
          model: "model-b",
          commit,
        },
      ],
      messages: [],
      notify: [],
    },
    { results: { folders } },
  );
  assert.deepEqual(result.calls.slice(TICK.length + 1, TICK.length + 3), [
    [
      "open_session",
      "avoozl:w1.loader review conventions aaaaaaaaaaaa",
      "f1",
      "avoozl-reviewer",
      "model-b",
    ],
    [
      "call_tool",
      "avoozl:avoozl",
      "plans_session",
      {
        action: "bind",
        input: {
          taskId: "w1.loader",
          slot: "slot-new",
          title: "avoozl:w1.loader review conventions aaaaaaaaaaaa",
          source: "tick",
          role: "review:conventions",
          attempt: 1,
          model: "model-b",
          commit,
        },
      },
    ],
  ]);
});
