#!/usr/bin/env node
// Proof P61 (R95, R98.5, design §4.28): a headless machine runs tasks with
// the CLI only. `avoozl supervisor --tick-seconds N` runs under launchd from
// the unit `avoozl supervisor unit launchd --write` writes. It runs the tick
// and owns the agent children. No Kiro Crew app backend or tick cron is
// involved: the workspace lives in an isolated Avoozl config and state home
// (XDG_CONFIG_HOME, XDG_STATE_HOME) that no Kiro Crew catalog lists.
//
// Two tasks run on Claude Code, confined by sandbox-exec, signed in to
// Bedrock with short-lived credentials, reaching only the Bedrock runtime
// through the loopback proxy P57 uses. While task one's child works, the
// supervisor is killed and launchd's KeepAlive starts it again. While task
// two's child works, the job is booted out and bootstrapped again, as a
// reboot or a new login does. At the end `avoozl status` and
// `avoozl runner status --json` are read.
//
//   node scripts/proof-p61-live.mjs --root DIR [--agent claude|fake]
//
// Run it from a terminal outside Kiro Crew: the job is loaded into this
// user's launchd (gui/UID) from a plist under DIR, and booted out at the end.
// `--agent fake` runs a scripted agent and starts the supervisor directly,
// never through launchd. It checks this script's plumbing only and never
// counts as the proof.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO, "cli.mjs");
const CLAUDE =
  process.env.P61_CLAUDE ||
  spawnSync("command -v claude", {
    shell: true,
    encoding: "utf8",
  }).stdout.trim() ||
  "claude";
const MODEL = process.env.P61_MODEL || "global.anthropic.claude-sonnet-5";
const PROXY_PORT = Number(process.env.P61_PROXY_PORT || 18461);
const TICK_SECONDS = 10;
const LABEL = "dev.avoozl.supervisor";
const TASKS = [
  ["p61-one", "notes/one.txt", "alpha"],
  ["p61-two", "notes/two.txt", "beta"],
];

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    agent: { type: "string", default: "claude" },
  },
});
if (!values.root) {
  console.error(
    "Usage: node scripts/proof-p61-live.mjs --root DIR [--agent claude|fake]",
  );
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const AGENT = values.agent;
if (!["claude", "fake"].includes(AGENT))
  throw Error("--agent is claude or fake");
const LAUNCHD = AGENT === "claude";
if (LAUNCHD && process.platform !== "darwin")
  throw Error("P61 runs the supervisor under launchd: macOS only.");

// The isolated Avoozl home, set before any Avoozl module loads. HOME stays
// the person's, so the sandbox still denies the real ~/.aws, ~/.ssh and the
// Kiro Crew home to each child.
const AHOME = path.join(ROOT, "home");
process.env.XDG_CONFIG_HOME = path.join(AHOME, "config");
process.env.XDG_STATE_HOME = path.join(AHOME, "state");
delete process.env.KIROCREW_HOME;
const P = {
  origin: path.join(ROOT, "origin.git"),
  checkout: path.join(ROOT, "app"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  claudeConfig: path.join(ROOT, "claude-config"),
  unitHome: path.join(ROOT, "unit-home"),
  report: path.join(ROOT, "report.json"),
  events: path.join(ROOT, "events.jsonl"),
  proxyLog: path.join(ROOT, "proxy.log"),
  status: path.join(ROOT, "status"),
};
const DB = path.join(P.ws, ".avoozl", "local", "workspace.sqlite");

const { machineAvoozlPaths } = await import("../src/app/host-config.mjs");
const MACHINE = machineAvoozlPaths();
for (const dir of [MACHINE.configDirectory, MACHINE.stateDirectory])
  if (!dir.startsWith(AHOME + path.sep)) throw Error(`Not isolated: ${dir}`);
const UID = process.getuid();
const DOMAIN = `gui/${UID}`;

const event = (kind, data = {}) => {
  const line = { at: new Date().toISOString(), kind, ...data };
  fs.appendFileSync(P.events, JSON.stringify(line) + "\n");
  console.log(`[p61] ${kind} ${JSON.stringify(data)}`);
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const cli = (args, env = process.env) =>
  execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", env });
const launchctl = (...args) =>
  spawnSync("launchctl", args, { encoding: "utf8" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHECK = `// P61 scratch check: each notes/*.txt holds one lowercase word and a newline.
import fs from "node:fs";
import path from "node:path";
const notes = fs.existsSync("notes") ? fs.readdirSync("notes").filter((n) => n.endsWith(".txt")) : [];
for (const name of notes)
  if (!/^[a-z]+\\n$/.test(fs.readFileSync(path.join("notes", name), "utf8"))) {
    console.error(\`notes/\${name} must be one lowercase word and a newline\`);
    process.exit(1);
  }
console.log("ok");
`;

// Plumbing only: writes the file its task names, a little slowly so the
// restarts land while it works, and finishes with the result file.
const FAKE_AGENT = `import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
const want = /Create (notes\\/[a-z]+\\.txt) containing the word ([a-z]+)/.exec(text);
const end = Date.now() + 25000; while (Date.now() < end);
fs.mkdirSync("notes", { recursive: true });
if (want) fs.writeFileSync(want[1], want[2] + "\\n");
fs.mkdirSync(".avoozl", { recursive: true });
fs.writeFileSync(".avoozl/result.json", JSON.stringify({ state: "done", text: "Wrote the file." }));
`;

const taskText = (file, word) =>
  [
    `Create ${file} containing the word ${word} and a newline, and nothing else.`,
    "Run `node check.mjs` before you finish; it must print ok.",
  ].join("\n");

const BEDROCK_KEEP = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
];

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; P61 runs once on a fresh root.`);
  for (const dir of [ROOT, P.claudeConfig, P.wt, P.status, P.unitHome])
    fs.mkdirSync(dir, { recursive: true });
  event("setup.start", {
    root: ROOT,
    agent: AGENT,
    repo: git(REPO, "rev-parse", "HEAD"),
  });

  git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
  git(ROOT, "clone", "-q", P.origin, P.checkout);
  git(P.checkout, "config", "user.name", "P61 Scratch");
  git(P.checkout, "config", "user.email", "p61@example.invalid");
  fs.writeFileSync(path.join(P.checkout, "README.md"), "P61 scratch.\n");
  fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
  git(P.checkout, "add", ".");
  git(P.checkout, "commit", "-q", "-m", "Start the P61 scratch repository");
  git(P.checkout, "push", "-q", "origin", "main");

  // The workspace, in the isolated catalog only. The Avoozl host port is
  // off, so `avoozl status` reads this catalog and never a running host.
  cli(["init", P.ws, "--name", "P61 scratch"]);
  cli(["workspace", "add", "p61", "--root", P.ws]);
  const machineConfig = JSON.parse(fs.readFileSync(MACHINE.configPath, "utf8"));
  fs.writeFileSync(
    MACHINE.configPath,
    JSON.stringify({ ...machineConfig, port: 0 }, null, 2) + "\n",
  );
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  config.delivery = {
    ...(config.delivery || {}),
    concurrency: 1,
    retries: 2,
    model: MODEL,
    investigate: { mode: "off" },
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

  const { approveHarnessDefinition, harnessDefinitionHash } = await import(
    "../src/app/harness-definitions.mjs"
  );
  const harnesses = path.join(MACHINE.configDirectory, "harnesses");
  fs.mkdirSync(harnesses, { recursive: true });
  let name, bytes;
  if (AGENT === "claude") {
    name = "claude-code";
    const definition = JSON.parse(
      fs.readFileSync(
        path.join(REPO, "examples", "harnesses", "claude-code.json"),
        "utf8",
      ),
    );
    definition.keepEnv = [...definition.keepEnv, ...BEDROCK_KEEP];
    definition.start[0] = CLAUDE;
    definition.resume[0] = CLAUDE;
    bytes = JSON.stringify(definition, null, 2) + "\n";
  } else {
    name = "fake-cli";
    fs.writeFileSync(path.join(ROOT, "fake-agent.mjs"), FAKE_AGENT);
    const run = [process.execPath, path.join(ROOT, "fake-agent.mjs")];
    bytes = JSON.stringify({
      name,
      start: run,
      resume: run,
      promptFrom: "stdin",
      model: ["--model", "{model}"],
      permission: { write: "workspace-write", read: "read-only" },
      writeRoots: ["{worktree}", "{tmp}", "{project_cache_dirs}"],
    });
  }
  fs.writeFileSync(path.join(harnesses, `${name}.json`), bytes);
  const hash = harnessDefinitionHash(Buffer.from(bytes));
  approveHarnessDefinition({
    configDirectory: MACHINE.configDirectory,
    name,
    hash,
  });
  if (AGENT === "fake")
    fs.writeFileSync(
      path.join(MACHINE.configDirectory, "harness-unconfined.json"),
      JSON.stringify({ [name]: hash }),
    );
  event("setup.harness", { name, hash });

  const { Store } = await import("../src/app/store.mjs");
  const { digest } = await import("../src/model.mjs");
  const { takeOverSpec } = await import("../src/app/spec-takeover.mjs");
  const store = new Store(DB);
  try {
    const data = store.read();
    store.importSnapshot({
      ...data,
      tasks: TASKS.map(([id, file, word]) => ({
        id,
        title: `Write ${file}`,
        kind: "leaf",
        scope: "p61",
        status: "planned",
        epic: "p61",
        track: "p61",
        tags: [],
        acceptance: [taskText(file, word)],
        repository: "app",
        planId: "p61",
      })),
      edges: [{ from: "p61-one", to: "p61-two", kind: "requires" }],
    });
    store.put("projects", {
      id: "app",
      root: fs.realpathSync.native(P.checkout),
      baseBranch: "main",
      landing: "direct",
      checks: [[process.execPath, "check.mjs"]],
      worktreeRoot: P.wt,
      executor: "process",
      harness: name,
      sandbox: {
        writeRoots: [P.claudeConfig],
        allowCommands: [["node", "check.mjs"]],
        network: [`localhost:${PROXY_PORT}`],
      },
    });
    // Installed approved, as a rebuild installs an approved plan: the
    // person's approval in this isolated workspace is the operator's run.
    store.put("plans", {
      id: "p61",
      kind: "plan",
      spec: "p61",
      title: "P61 headless",
      hash: digest("plan p61"),
      revision: 1,
      state: "approved",
    });
    store.put("receipts", {
      id: "spec-journal:p61",
      kind: "spec-journal",
      planId: "p61",
      home: "local",
    });
    await takeOverSpec(
      store,
      { workspaceRoot: P.ws, actor: "Operator" },
      "p61",
    );
  } finally {
    store.close();
  }
  event("setup.done");
}

// The supervisor's environment beyond what the unit holds: the isolated
// Avoozl home, and for Claude Code its config folder, Bedrock sign-in and
// the proxy. The unit `avoozl supervisor unit` writes holds only PATH.
function harnessEnv() {
  const env = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
  };
  if (AGENT !== "claude") return env;
  const settings = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), ".claude", "settings.json"),
      "utf8",
    ),
  );
  const creds = JSON.parse(
    execFileSync(CLAUDE, ["default-credential-export"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ).Credentials;
  return {
    ...env,
    CLAUDE_CONFIG_DIR: P.claudeConfig,
    CLAUDE_CODE_USE_BEDROCK: "1",
    AWS_REGION: settings.env?.AWS_REGION || "us-west-2",
    AWS_ACCESS_KEY_ID: creds.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.SecretAccessKey,
    AWS_SESSION_TOKEN: creds.SessionToken,
    HTTPS_PROXY: `http://localhost:${PROXY_PORT}`,
    https_proxy: `http://localhost:${PROXY_PORT}`,
    NO_PROXY: "",
  };
}

const xml = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const SECRET_KEYS = new Set([
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_ACCESS_KEY_ID",
]);

// The unit as Avoozl writes it, with HOME pointed at a scratch folder so the
// plist lands under ROOT (never ~/Library/LaunchAgents, so it never loads
// at a login), then the harness's environment added to its
// EnvironmentVariables. Returns the file and the unit text as written.
function writeUnit(extraEnv) {
  const pathEnv = [
    path.dirname(CLAUDE),
    path.dirname(process.execPath),
    process.env.PATH,
  ]
    .filter(Boolean)
    .join(":");
  const out = cli(
    [
      "supervisor",
      "unit",
      "launchd",
      "--tick-seconds",
      String(TICK_SECONDS),
      "--write",
    ],
    { ...process.env, HOME: P.unitHome, PATH: pathEnv },
  );
  const file = path.join(
    P.unitHome,
    "Library",
    "LaunchAgents",
    `${LABEL}.plist`,
  );
  const asWritten = fs.readFileSync(file, "utf8");
  fs.writeFileSync(path.join(ROOT, "unit-as-written.plist"), asWritten);
  event("unit.written", { file, said: out.trim() });
  const added = Object.entries(extraEnv)
    .map(([k, v]) => `    <key>${xml(k)}</key>\n    <string>${xml(v)}</string>`)
    .join("\n");
  const anchor = "  <key>EnvironmentVariables</key>\n  <dict>\n";
  if (!asWritten.includes(anchor))
    throw Error("The unit has no EnvironmentVariables dict.");
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(file, asWritten.replace(anchor, anchor + added + "\n"));
  const lint = spawnSync("plutil", ["-lint", file], { encoding: "utf8" });
  if (lint.status !== 0) throw Error(`plutil: ${lint.stdout}${lint.stderr}`);
  return file;
}

// Strip the credentials from the plist once the job is out of launchd.
function redactUnit(file) {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, "utf8");
  for (const key of SECRET_KEYS)
    text = text.replace(
      new RegExp(`(<key>${key}</key>\\n\\s*<string>)[^<]*(</string>)`),
      "$1REDACTED$2",
    );
  fs.writeFileSync(file, text);
}

// The supervisor job: launchd for the proof, a plain detached process for
// the plumbing check.
let direct = null;
function loadJob(file, env) {
  if (LAUNCHD) {
    const r = launchctl("bootstrap", DOMAIN, file);
    event("launchd.bootstrap", {
      status: r.status,
      said: (r.stdout + r.stderr).trim(),
    });
    if (r.status !== 0) throw Error(`launchctl bootstrap failed: ${r.stderr}`);
    return;
  }
  const out = fs.openSync(path.join(ROOT, "direct-supervisor.log"), "a");
  direct = spawn(
    process.execPath,
    [
      CLI,
      "supervisor",
      "--state-directory",
      MACHINE.stateDirectory,
      "--config-directory",
      MACHINE.configDirectory,
      "--tick-seconds",
      String(TICK_SECONDS),
    ],
    {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, ...env },
    },
  );
  direct.unref();
  fs.closeSync(out);
  event("direct.start", { pid: direct.pid });
}
function unloadJob() {
  if (LAUNCHD) {
    const r = launchctl("bootout", `${DOMAIN}/${LABEL}`);
    event("launchd.bootout", {
      status: r.status,
      said: (r.stdout + r.stderr).trim(),
    });
    return;
  }
  if (direct)
    try {
      process.kill(direct.pid, "SIGTERM");
    } catch {}
  event("direct.stop", { pid: direct?.pid });
}
function jobPid() {
  if (!LAUNCHD) return direct?.pid ?? null;
  const r = launchctl("print", `${DOMAIN}/${LABEL}`);
  const m = /\bpid = (\d+)/.exec(r.stdout);
  return m ? Number(m[1]) : null;
}
const parentOf = (pid) =>
  Number(
    spawnSync("ps", ["-o", "ppid=", "-p", String(pid)], {
      encoding: "utf8",
    }).stdout?.trim(),
  ) || null;

async function snapshotState() {
  const { Store } = await import("../src/app/store.mjs");
  const { openSupervisorDatabase, runningSupervisor } = await import(
    "../src/app/supervisor.mjs"
  );
  const store = new Store(DB);
  const db = openSupervisorDatabase(MACHINE.stateDirectory);
  try {
    return {
      supervisor: runningSupervisor(MACHINE.stateDirectory, {}),
      deliveries: Object.fromEntries(
        store.list("task_deliveries").map((d) => [
          d.taskId,
          {
            state: d.state,
            integratedCommit: d.integratedCommit,
            attempts: d.attempts.map((a) => ({
              attempt: a.attempt,
              outcome: a.outcome,
              cause: a.cause,
            })),
          },
        ]),
      ),
      bindings: store.list("session_bindings").map((b) => ({
        task: b.taskId,
        role: b.role,
        attempt: b.attempt,
        status: b.status,
        executor: b.executor,
        slot: b.slot,
      })),
      children: db
        .prepare(
          "SELECT session_id, task, role, state, pid, exit_code, runs, result, error FROM children ORDER BY requested_at",
        )
        .all(),
      originLog: git(P.origin, "log", "--format=%h %s", "main"),
    };
  } finally {
    db.close();
    store.close();
  }
}

async function until(
  what,
  check,
  { timeoutMs = 30 * 60_000, everyMs = 2000 } = {},
) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const state = await snapshotState();
    const value = check(state);
    if (value) return { state, value };
    if (Date.now() > end) {
      event("timeout", { what, state });
      throw Error(`Timed out waiting for ${what}.`);
    }
    await sleep(everyMs);
  }
}
const runningChild = (s, task) =>
  s.children.find(
    (c) => c.task === task && c.role === "worker" && c.state === "running",
  );
const supervisorBack = (old) => (s) =>
  s.supervisor && s.supervisor.pid !== old ? s.supervisor : null;

// The CLI a person on this machine has: run with the isolated home only.
function readStatus(tag) {
  const env = { ...process.env, AVOOZL_WORKSPACE: P.ws };
  const out = {};
  for (const [name, args] of [
    ["status", ["status"]],
    ["runner-status", ["runner", "status", "--json"]],
  ]) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env,
    });
    fs.writeFileSync(path.join(P.status, `${tag}-${name}.json`), r.stdout);
    if (r.stderr)
      fs.writeFileSync(path.join(P.status, `${tag}-${name}.stderr`), r.stderr);
    let json = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {}
    out[name] = { exit: r.status, json };
  }
  return out;
}

function evaluate(state, status) {
  const events = fs
    .readFileSync(P.events, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const kind = (k) => events.find((e) => e.kind === k);
  const workers = state.children.filter((c) => c.role === "worker");
  const out = {};
  out.tasks = TASKS.map(([id]) => ({
    task: id,
    landed: state.deliveries[id]?.state === "integrated",
    attempts: state.deliveries[id]?.attempts.length ?? 0,
    exitedWithResult: workers.some(
      (c) =>
        c.task === id && c.state === "exited" && c.exit_code === 0 && c.result,
    ),
    avoozlCommitOnRemote: state.originLog.includes(
      `Avoozl task ${id}, attempt`,
    ),
  }));
  const k1 = kind("restart1.kill-supervisor"),
    b1 = kind("restart1.back");
  const k2 = kind("restart2.bootout"),
    b2 = kind("restart2.back");
  const across = (e) =>
    e && state.children.find((c) => c.session_id === e.child);
  out.keepAliveRestart = k1
    ? {
        killedPid: k1.pid,
        newPid: b1?.pid ?? null,
        newParent: b1?.parent ?? null,
        childAcross: across(k1)?.session_id ?? null,
        childAfter: across(k1) && {
          state: across(k1).state,
          exit: across(k1).exit_code,
          runs: across(k1).runs,
        },
      }
    : { reached: false };
  out.reloadRestart = k2
    ? {
        oldPid: k2.pid,
        childAliveAfterBootout:
          kind("restart2.child-after-bootout")?.alive ?? null,
        newPid: b2?.pid ?? null,
        newParent: b2?.parent ?? null,
        childAcross: across(k2)?.session_id ?? null,
        childAfter: across(k2) && {
          state: across(k2).state,
          exit: across(k2).exit_code,
          runs: across(k2).runs,
        },
      }
    : { reached: false };
  const perAttempt = {};
  for (const b of state.bindings.filter((b) => b.role === "worker"))
    perAttempt[`${b.task}#${b.attempt}`] =
      (perAttempt[`${b.task}#${b.attempt}`] || 0) + 1;
  out.nothingTwice = {
    duplicateAttempts: Object.entries(perAttempt)
      .filter(([, n]) => n > 1)
      .map(([k]) => k),
    childrenRunMoreThanOnce: workers
      .filter((c) => c.runs > 1)
      .map((c) => c.session_id),
  };
  out.noKiroCrew = {
    executors: [...new Set(state.bindings.map((b) => b.executor ?? null))],
  };
  const children = status["runner-status"].json?.children ?? [];
  out.runnerStatus = {
    exit: status["runner-status"].exit,
    supervisorRunning:
      status["runner-status"].json?.supervisor?.running ?? null,
    reportsBoth: TASKS.every(([id]) =>
      children.some(
        (c) => c.task === id && c.role === "worker" && c.status === "exited 0",
      ),
    ),
    children: children.map((c) => [c.task, c.role, c.status]),
  };
  out.status = {
    exit: status.status.exit,
    workspaces: (status.status.json?.workspaces ?? []).map(
      (w) => w.root ?? w.id,
    ),
    machineChildren: status.status.json?.machine?.children?.length ?? null,
  };
  return out;
}

async function prove() {
  if (LAUNCHD) {
    const { sandboxKind } = await import("../src/app/sandbox.mjs");
    if (!sandboxKind())
      throw Error(
        "sandbox-exec cannot run here (inside another sandbox?). Run P61 from a terminal outside Kiro Crew.",
      );
    const existing = launchctl("print", `${DOMAIN}/${LABEL}`);
    if (existing.status === 0)
      throw Error(
        `${DOMAIN}/${LABEL} is already loaded; P61 will not replace it.`,
      );
  }
  await setup();
  let proxy = null;
  if (AGENT === "claude") {
    proxy = spawn(
      process.execPath,
      [
        path.join(REPO, "scripts", "live-proofs", "p57-model-proxy.mjs"),
        String(PROXY_PORT),
        P.proxyLog,
      ],
      { stdio: "ignore" },
    );
    await sleep(1000);
    event("proxy.start", { pid: proxy.pid, port: PROXY_PORT });
  }
  const env = harnessEnv();
  const unit = LAUNCHD ? writeUnit(env) : null;
  let finalState = null;
  let status = null;
  try {
    loadJob(unit, env);
    const first = await until("the supervisor to run", (s) => s.supervisor, {
      everyMs: 1000,
      timeoutMs: 120_000,
    });
    event("supervisor.up", {
      pid: first.value.pid,
      parent: parentOf(first.value.pid),
      launchdPid: jobPid(),
    });

    // Restart 1: kill the supervisor while task one's child works; launchd's
    // KeepAlive starts it again.
    const one = await until(
      "task one's child to run",
      (s) => runningChild(s, "p61-one"),
      { everyMs: 1000 },
    );
    const sup1 = one.state.supervisor.pid;
    process.kill(sup1, "SIGKILL");
    event("restart1.kill-supervisor", {
      pid: sup1,
      child: one.value.session_id,
      childPid: one.value.pid,
    });
    if (!LAUNCHD) {
      await sleep(3000);
      loadJob(null, env);
    }
    const back1 = await until(
      "the supervisor to come back",
      supervisorBack(sup1),
      { everyMs: 1000, timeoutMs: 180_000 },
    );
    event("restart1.back", {
      pid: back1.value.pid,
      parent: parentOf(back1.value.pid),
      launchdPid: jobPid(),
    });

    // Restart 2: boot the job out while task two's child works, then load it
    // again, as a reboot or a new login does.
    const two = await until(
      "task two's child to run",
      (s) => runningChild(s, "p61-two"),
      { everyMs: 1000 },
    );
    const sup2 = two.state.supervisor.pid;
    unloadJob();
    await sleep(5000);
    let alive = false;
    try {
      process.kill(two.value.pid, 0);
      alive = true;
    } catch {}
    event("restart2.bootout", {
      pid: sup2,
      child: two.value.session_id,
      childPid: two.value.pid,
    });
    event("restart2.child-after-bootout", { alive, supervisorPid: jobPid() });
    loadJob(unit, env);
    const back2 = await until(
      "the supervisor to load again",
      supervisorBack(sup2),
      { everyMs: 1000, timeoutMs: 180_000 },
    );
    event("restart2.back", {
      pid: back2.value.pid,
      parent: parentOf(back2.value.pid),
      launchdPid: jobPid(),
    });

    const fin = await until(
      "both tasks to land",
      (s) => TASKS.every(([id]) => s.deliveries[id]?.state === "integrated"),
      { timeoutMs: 45 * 60_000, everyMs: 5000 },
    );
    finalState = fin.state;
    event("tasks.done");
    status = readStatus("final");
    event("status.read", { files: P.status });
  } finally {
    unloadJob();
    await sleep(3000);
    if (proxy) proxy.kill("SIGTERM");
    if (unit) redactUnit(unit);
    try {
      const { openSupervisorDatabase, runningSupervisor } = await import(
        "../src/app/supervisor.mjs"
      );
      const db = openSupervisorDatabase(MACHINE.stateDirectory);
      const live = db
        .prepare(
          "SELECT pid FROM children WHERE state = 'running' AND pid IS NOT NULL",
        )
        .all();
      db.close();
      for (const { pid } of live)
        try {
          process.kill(pid, "SIGTERM");
        } catch {}
      const sup = runningSupervisor(MACHINE.stateDirectory, {});
      if (sup?.pid) process.kill(sup.pid, "SIGTERM");
      event("cleanup", { children: live.length, supervisor: sup?.pid ?? null });
    } catch (error) {
      event("cleanup.error", { error: error.message });
    }
    const state =
      finalState ??
      (await snapshotState().catch((e) => ({ error: e.message })));
    const verdicts =
      state.error || !status
        ? { error: state.error ?? "not finished" }
        : evaluate(state, status);
    fs.writeFileSync(
      P.report,
      JSON.stringify(
        { agent: AGENT, launchd: LAUNCHD, verdicts, state },
        null,
        2,
      ),
    );
    event("report", { file: P.report, verdicts });
  }
}

// Ctrl-C still takes the job out of launchd: KeepAlive would restart it.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(signal, () => {
    unloadJob();
    process.exit(130);
  });
await prove();
