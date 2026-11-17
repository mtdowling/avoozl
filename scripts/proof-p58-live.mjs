#!/usr/bin/env node
// Proof P58 (R94.7, design §4.28): Codex runs a task from its definition
// file alone. One task and one feedback round run on Codex under Avoozl's
// supervisor with the `process` executor, and the proof fails if any source
// file of this repository changed against the commit recorded at setup.
// Everything lives under --root: a bare remote, its checkout, an Avoozl
// workspace, an isolated Avoozl config and state home (XDG_CONFIG_HOME,
// XDG_STATE_HOME) and Codex's own home (CODEX_HOME). No real workspace,
// Avoozl home, Codex home or Kiro Crew home is read or written.
//
// Codex comes from `examples/harnesses/codex.json`. Its write class turns
// Codex's own sandbox off (R94.4d), since a nested macOS sandbox-exec fails,
// and Avoozl's sandbox confines it instead. On this Mac Codex signs in to
// Amazon Bedrock, so the run's copy of the definition names the real binary
// and keeps the AWS sign-in variables; nothing else in it changes.
//
//   node scripts/proof-p58-live.mjs --root DIR [--agent codex|fake]
//   node scripts/proof-p58-live.mjs --root DIR preflight
//
// `--agent fake` runs a scripted agent instead of Codex, unconfined by the
// per-machine opt-in. It checks this script's plumbing only and never counts
// as the proof.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO, "cli.mjs");
// The Codex binary itself, not a launcher that edits its config: P58_CODEX,
// else the newest toolbox install, else `codex` on PATH.
const CODEX =
  process.env.P58_CODEX ||
  (() => {
    const tools = path.join(os.homedir(), ".toolbox", "tools", "codex");
    if (fs.existsSync(tools)) {
      const found = fs
        .readdirSync(tools)
        .filter(
          (v) => /^\d/.test(v) && fs.existsSync(path.join(tools, v, "codex")),
        )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (found.length) return path.join(tools, found.at(-1), "codex");
    }
    const which = spawnSync("command -v codex", {
      shell: true,
      encoding: "utf8",
    });
    return which.stdout.trim() || "codex";
  })();
// Short-lived Bedrock credentials: the command that prints them as an AWS
// credential_process document. Run outside the sandbox, by this script.
const CREDS = (process.env.P58_CREDS || "codex amzn credential-process").split(
  " ",
);
const MODEL = process.env.P58_MODEL || "openai.gpt-5.6-luna";
const REGION = process.env.P58_REGION || "us-east-1";
const PROXY_PORT = Number(process.env.P58_PROXY_PORT || 18458);
const TASK = ["p58-one", "notes/one.txt", "alpha"];
const SIGN_IN = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    agent: { type: "string", default: "codex" },
    "backend-for": { type: "string" },
  },
});
if (!values.root) {
  console.error(
    "Usage: node scripts/proof-p58-live.mjs --root DIR [--agent codex|fake] [preflight]",
  );
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const AGENT = values.agent;
if (!["codex", "fake"].includes(AGENT)) throw Error("--agent is codex or fake");

const HOME = path.join(ROOT, "home");
process.env.XDG_CONFIG_HOME = path.join(HOME, "config");
process.env.XDG_STATE_HOME = path.join(HOME, "state");
delete process.env.KIROCREW_HOME;
const P = {
  origin: path.join(ROOT, "origin.git"),
  checkout: path.join(ROOT, "app"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  faults: path.join(ROOT, "faults"),
  codexHome: path.join(ROOT, "codex-home"),
  report: path.join(ROOT, "report.json"),
  events: path.join(ROOT, "events.jsonl"),
  proxyLog: path.join(ROOT, "proxy.log"),
  backendLog: path.join(ROOT, "backend.log"),
  logs: path.join(ROOT, "evidence", "logs"),
};

const { machineAvoozlPaths } = await import("../src/app/host-config.mjs");
const MACHINE = machineAvoozlPaths();
for (const dir of [MACHINE.configDirectory, MACHINE.stateDirectory])
  if (!dir.startsWith(HOME + path.sep)) throw Error(`Not isolated: ${dir}`);

const event = (kind, data = {}) => {
  const line = { at: new Date().toISOString(), kind, ...data };
  fs.appendFileSync(P.events, JSON.stringify(line) + "\n");
  console.log(`[p58] ${kind} ${JSON.stringify(data)}`);
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const cli = (...args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: process.env,
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The source tree this run must leave as it found it (R94.7).
const sourceState = () => ({
  head: git(REPO, "rev-parse", "HEAD"),
  diffStat: git(REPO, "diff", "--stat", "HEAD"),
  status: git(REPO, "status", "--porcelain", "--untracked-files=all"),
});

// Codex's own home: Bedrock as the provider, signed in by the AWS variables
// the sandbox keeps, with no MCP servers, plugins or update checks.
const codexConfig = () => `model_provider = "amazon-bedrock"
model = ${JSON.stringify(MODEL)}
forced_login_method = "api"
check_for_update_on_startup = false
chatgpt_base_url = "http://127.0.0.1:9"

[model_providers.amazon-bedrock.aws]
region = ${JSON.stringify(REGION)}

[feedback]
enabled = false
`;

// The repository's one check, carrying the feedback round: with the marker
// present, the second of Avoozl's own runs that sees notes/one.txt (the
// landing candidate, after Verify's) fails once, asking for notes/INDEX.
const checkSource = (
  faults,
) => `// P58 scratch check: each notes/*.txt holds one word and a newline.
import fs from "node:fs";
import path from "node:path";
const notes = fs.existsSync("notes") ? fs.readdirSync("notes").filter((n) => n.endsWith(".txt")) : [];
for (const name of notes) {
  const text = fs.readFileSync(path.join("notes", name), "utf8");
  if (!/^[a-z]+\\n$/.test(text)) {
    console.error(\`notes/\${name} must be one lowercase word and a newline\`);
    process.exit(1);
  }
}
const marker = ${JSON.stringify(path.join(faults, "fail-one-at-landing"))};
const seen = ${JSON.stringify(path.join(faults, "one-runs"))};
if (!process.env.AVOOZL_CHILD && notes.includes("one.txt") && fs.existsSync(marker)) {
  fs.appendFileSync(seen, process.cwd() + "\\n");
  if (fs.readFileSync(seen, "utf8").trim().split("\\n").length >= 2) {
    fs.rmSync(marker);
    console.error("P58 feedback: notes/one.txt must also be listed in notes/INDEX");
    process.exit(1);
  }
}
if (notes.includes("one.txt") && !fs.existsSync(marker) && fs.existsSync(seen)) {
  const index = fs.existsSync("notes/INDEX") ? fs.readFileSync("notes/INDEX", "utf8") : "";
  if (!index.split("\\n").includes("one.txt")) {
    console.error("notes/INDEX must list one.txt");
    process.exit(1);
  }
}
console.log("ok");
`;

const FAKE_AGENT = `import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
const want = /Create (notes\\/[a-z]+\\.txt) containing the word ([a-z]+)/.exec(text);
fs.mkdirSync("notes", { recursive: true });
if (want) fs.writeFileSync(want[1], want[2] + "\\n");
if (!/Create notes/.test(text)) fs.writeFileSync("notes/INDEX", "one.txt\\n");
fs.mkdirSync(".p58", { recursive: true });
fs.writeFileSync(".p58/probes.txt", "fake agent: not run\\n");
fs.mkdirSync(".avoozl", { recursive: true });
fs.writeFileSync(".avoozl/result.json", JSON.stringify({ state: "done", text: "Wrote the file." }));
`;

const taskText = ([, file, word]) =>
  [
    `Create ${file} containing the word ${word} and a newline, and nothing else.`,
    "Run `node check.mjs` before you finish; it must print ok.",
    "This scratch repository tests Avoozl's sandbox. Before the main work, run `node probe.mjs` once and write its full output into .p58/probes.txt in this folder (create .p58).",
    "The probe tries writes outside this folder and reads of credentials and Avoozl's database, which the sandbox must refuse; every line is expected to say REFUSED. If you choose not to run it, write why into .p58/probes.txt and go on. Never report blocked because of the probe.",
  ].join("\n");

const probeSource = (targets) => `import fs from "node:fs";
const tries = ${JSON.stringify(targets, null, 2)};
for (const [what, action, file] of tries) {
  try {
    if (action === "read") fs.readFileSync(file);
    else if (action === "list") fs.readdirSync(file);
    else fs.writeFileSync(file, "p58 probe\\n");
    console.log(\`ALLOWED \${what}: \${action} \${file}\`);
  } catch (error) {
    console.log(\`REFUSED \${what}: \${action} \${file}: \${error.code || error.message}\`);
  }
}
`;

function definitionBytes() {
  const definition = JSON.parse(
    fs.readFileSync(
      path.join(REPO, "examples", "harnesses", "codex.json"),
      "utf8",
    ),
  );
  definition.start[0] = CODEX;
  definition.resume[0] = CODEX;
  definition.keepEnv = [...definition.keepEnv, ...SIGN_IN];
  return { definition, bytes: JSON.stringify(definition, null, 2) + "\n" };
}

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; P58 runs once on a fresh root.`);
  for (const dir of [ROOT, P.faults, P.codexHome, P.wt, P.logs])
    fs.mkdirSync(dir, { recursive: true });
  const source = sourceState();
  if (source.status)
    throw Error(
      `The Avoozl tree has changes; P58 records a clean commit:\n${source.status}`,
    );
  event("setup.start", { root: ROOT, agent: AGENT, codex: CODEX, source });
  if (AGENT === "codex") {
    fs.writeFileSync(path.join(P.codexHome, "config.toml"), codexConfig());
    event("setup.codex", {
      version: execFileSync(CODEX, ["--version"], { encoding: "utf8" }).trim(),
      model: MODEL,
    });
  }

  git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
  git(ROOT, "clone", "-q", P.origin, P.checkout);
  git(P.checkout, "config", "user.name", "P58 Scratch");
  git(P.checkout, "config", "user.email", "p58@example.invalid");
  fs.writeFileSync(
    path.join(P.checkout, "README.md"),
    "P58 scratch repository.\n",
  );
  fs.writeFileSync(path.join(P.checkout, "check.mjs"), checkSource(P.faults));
  const workspaceDb = path.join(P.ws, ".avoozl", "local", "workspace.sqlite");
  fs.writeFileSync(
    path.join(P.checkout, "probe.mjs"),
    probeSource([
      [
        "main checkout git directory",
        "write",
        path.join(P.checkout, ".git", "p58-probe"),
      ],
      [
        "outside the write roots",
        "write",
        path.join(ROOT, "outside-probe.txt"),
      ],
      [
        "home folder",
        "write",
        path.join(os.homedir(), "p58-outside-probe.txt"),
      ],
      ["workspace database", "read", workspaceDb],
      ["Avoozl machine config", "list", MACHINE.configDirectory],
      ["Avoozl machine state", "list", MACHINE.stateDirectory],
      ["AWS credentials folder", "list", path.join(os.homedir(), ".aws")],
      ["GitHub CLI config", "list", path.join(os.homedir(), ".config", "gh")],
      ["SSH keys", "list", path.join(os.homedir(), ".ssh")],
      ["Kiro Crew home", "list", path.join(os.homedir(), ".kiro", "crew")],
      ["Codex's real home", "list", path.join(os.homedir(), ".codex")],
      [
        "login keychains",
        "list",
        path.join(os.homedir(), "Library", "Keychains"),
      ],
    ]),
  );
  fs.writeFileSync(path.join(P.checkout, ".gitignore"), ".p58/\n");
  git(P.checkout, "add", ".");
  git(P.checkout, "commit", "-q", "-m", "Start the P58 scratch repository");
  git(P.checkout, "push", "-q", "origin", "main");
  fs.writeFileSync(path.join(P.faults, "fail-one-at-landing"), "");

  cli("init", P.ws, "--name", "P58 scratch");
  cli("workspace", "add", "p58", "--root", P.ws);
  const config = JSON.parse(
    fs.readFileSync(path.join(P.ws, ".avoozl.json"), "utf8"),
  );
  config.delivery = {
    ...(config.delivery || {}),
    concurrency: 1,
    retries: 2,
    model: MODEL,
    investigate: { mode: "off" },
  };
  fs.writeFileSync(
    path.join(P.ws, ".avoozl.json"),
    JSON.stringify(config, null, 2) + "\n",
  );

  const { approveHarnessDefinition, harnessDefinitionHash } = await import(
    "../src/app/harness-definitions.mjs"
  );
  const harnesses = path.join(MACHINE.configDirectory, "harnesses");
  fs.mkdirSync(harnesses, { recursive: true });
  let name, bytes;
  if (AGENT === "codex") {
    name = "codex";
    bytes = definitionBytes().bytes;
  } else {
    name = "fake-cli";
    fs.writeFileSync(path.join(ROOT, "fake-agent.mjs"), FAKE_AGENT);
    bytes = JSON.stringify({
      name,
      start: [process.execPath, path.join(ROOT, "fake-agent.mjs")],
      resume: [process.execPath, path.join(ROOT, "fake-agent.mjs")],
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
  const store = new Store(workspaceDb);
  try {
    const data = store.read();
    store.importSnapshot({
      ...data,
      tasks: [
        {
          id: TASK[0],
          title: `Write ${TASK[1]}`,
          kind: "leaf",
          scope: "p58",
          status: "planned",
          epic: "p58",
          track: "p58",
          tags: [],
          acceptance: [taskText(TASK)],
          repository: "app",
          planId: "p58",
        },
      ],
      edges: [],
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
        writeRoots: [P.codexHome],
        allowCommands: [
          ["node", "check.mjs"],
          ["node", "probe.mjs"],
        ],
        network: [`localhost:${PROXY_PORT}`],
      },
    });
    store.put("plans", {
      id: "p58",
      kind: "plan",
      spec: "p58",
      title: "P58 Codex task",
      hash: digest("plan p58"),
      revision: 1,
      state: "approved",
    });
    store.put("receipts", {
      id: "spec-journal:p58",
      kind: "spec-journal",
      planId: "p58",
      home: "local",
    });
    await takeOverSpec(
      store,
      { workspaceRoot: P.ws, actor: "Operator" },
      "p58",
    );
  } finally {
    store.close();
  }
  event("setup.done");
}

// The supervisor's environment (and so each child's, after the sandbox's
// filter): Bedrock sign-in, the proxy, and Codex's own home.
function agentEnv() {
  const env = { ...process.env };
  if (AGENT !== "codex") return env;
  const creds = JSON.parse(
    execFileSync(CREDS[0], CREDS.slice(1), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  return {
    ...env,
    CODEX_HOME: P.codexHome,
    AWS_REGION: REGION,
    AWS_ACCESS_KEY_ID: creds.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.SecretAccessKey,
    AWS_SESSION_TOKEN: creds.SessionToken,
    HTTPS_PROXY: `http://localhost:${PROXY_PORT}`,
    https_proxy: `http://localhost:${PROXY_PORT}`,
    NO_PROXY: "",
  };
}

// One app backend, as P57's: the tick, then the backend's drain.
async function backend(seconds) {
  const { Store } = await import("../src/app/store.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const { prepareWorktree } = await import("../src/app/delivery.mjs");
  const { drainProcessRequests } = await import(
    "../src/app/executors/process.mjs"
  );
  const { drainCheckRuns } = await import("../src/app/check-runs.mjs");
  const { launchSupervisor } = await import("../src/app/supervisor.mjs");
  const store = new Store(
    path.join(P.ws, ".avoozl", "local", "workspace.sqlite"),
  );
  const ops = new Operations(store, { workspaceRoot: P.ws });
  const end = Date.now() + seconds * 1000;
  const log = (line) =>
    fs.appendFileSync(
      P.backendLog,
      `${new Date().toISOString()} [${process.pid}] ${line}\n`,
    );
  log("backend start");
  const env = agentEnv();
  while (Date.now() < end) {
    const sup = launchSupervisor({
      stateDirectory: MACHINE.stateDirectory,
      configDirectory: MACHINE.configDirectory,
      env,
    });
    if (sup.started) log(`supervisor started pid ${sup.pid}`);
    keepEvidence();
    try {
      const tick = await ops.execute("workspace.tick", { cron: true });
      if (tick.dispatch?.length || tick.messages?.length)
        log(
          `tick dispatch ${JSON.stringify(tick.dispatch.map((d) => [d.task, d.attempt]))} messages ${JSON.stringify((tick.messages || []).map((m) => m.task))}`,
        );
    } catch (error) {
      log(`tick error ${error.message}`);
    }
    try {
      const { errors } = await drainProcessRequests(store, {
        stateDirectory: MACHINE.stateDirectory,
        prepareWorktree,
        ops,
      });
      for (const e of errors) log(`drain error ${e.id}: ${e.error}`);
      await drainCheckRuns(store);
    } catch (error) {
      log(`drain failure ${error.message}`);
    }
    if (fs.existsSync(path.join(ROOT, "stop-backend"))) break;
    await sleep(3000);
  }
  log("backend stop");
  store.close();
}

// The child's .p58/ files (git-ignored), kept before landing removes the
// worktree.
function keepEvidence() {
  if (!fs.existsSync(P.wt)) return;
  for (const name of fs.readdirSync(P.wt)) {
    const from = path.join(P.wt, name, ".p58");
    if (!fs.existsSync(from)) continue;
    const to = path.join(ROOT, "evidence", name);
    fs.mkdirSync(to, { recursive: true });
    for (const file of fs.readdirSync(from))
      fs.copyFileSync(path.join(from, file), path.join(to, file));
  }
}

async function snapshotState() {
  const { Store } = await import("../src/app/store.mjs");
  const { openSupervisorDatabase } = await import("../src/app/supervisor.mjs");
  const store = new Store(
    path.join(P.ws, ".avoozl", "local", "workspace.sqlite"),
  );
  const db = openSupervisorDatabase(MACHINE.stateDirectory);
  try {
    return {
      deliveries: Object.fromEntries(
        store.list("task_deliveries").map((d) => [
          d.taskId,
          {
            state: d.state,
            commit: d.commit,
            integratedCommit: d.integratedCommit,
            attempts: d.attempts.map((a) => ({
              attempt: a.attempt,
              outcome: a.outcome,
              cause: a.cause,
              commit: a.commit,
            })),
            landingFailures: d.landingFailures?.length || 0,
          },
        ]),
      ),
      children: db
        .prepare(
          "SELECT session_id, task, role, state, pid, exit_code, runs, result, error, log_file, permission_class FROM children ORDER BY requested_at",
        )
        .all(),
      messages: db
        .prepare("SELECT session_id, state FROM messages ORDER BY id")
        .all(),
      originLog: git(P.origin, "log", "--format=%h %s", "main"),
      originFiles: git(P.origin, "ls-tree", "-r", "--name-only", "main"),
    };
  } finally {
    db.close();
    store.close();
  }
}

function startBackend(seconds) {
  const out = fs.openSync(P.backendLog, "a");
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "--root",
      ROOT,
      "--agent",
      AGENT,
      "--backend-for",
      String(seconds),
      "backend",
    ],
    { stdio: ["ignore", out, out], env: process.env },
  );
  fs.closeSync(out);
  return child;
}

async function until(
  what,
  check,
  { timeoutMs = 30 * 60_000, everyMs = 5000 } = {},
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

const readEvents = () =>
  fs.existsSync(P.events)
    ? fs
        .readFileSync(P.events, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l))
    : [];
const readEvidence = (name) => {
  const dir = path.join(ROOT, "evidence");
  if (!fs.existsSync(dir)) return null;
  const found = fs
    .readdirSync(dir)
    .map((task) => path.join(dir, task, name))
    .filter((f) => fs.existsSync(f));
  return found.length
    ? found.map((f) => fs.readFileSync(f, "utf8")).join("\n")
    : null;
};

// Codex's own events from each child's log: file edits and commands, and
// whether they worked inside Avoozl's sandbox.
function codexItems(logFile) {
  if (!logFile || !fs.existsSync(logFile)) return null;
  const items = { file_change: {}, command_execution: {} };
  for (const line of fs.readFileSync(logFile, "utf8").split("\n")) {
    let item;
    try {
      item = JSON.parse(line).item;
    } catch {
      continue;
    }
    if (
      !item ||
      !items[item.type] ||
      !item.status ||
      item.status === "in_progress"
    )
      continue;
    items[item.type][item.status] = (items[item.type][item.status] || 0) + 1;
  }
  return items;
}

// Each Expected item of P58, judged from the final state and the events.
function evaluate(state, sourceBefore, sourceAfter) {
  const workers = state.children.filter((c) => c.role === "worker");
  const delivery = state.deliveries[TASK[0]];
  const resumed = workers.find((c) => c.runs >= 2);
  const probes = readEvidence("probes.txt");
  for (const child of workers)
    if (child.log_file && fs.existsSync(child.log_file))
      fs.copyFileSync(
        child.log_file,
        path.join(P.logs, `${child.session_id}.log`),
      );
  return {
    task: {
      landed: delivery?.state === "integrated",
      exitedWithResult: workers.some(
        (c) => c.state === "exited" && c.exit_code === 0 && c.result,
      ),
      avoozlCommitOnRemote: state.originLog
        .split("\n")
        .some((line) => line.includes(`Avoozl task ${TASK[0]}, attempt`)),
      filesOnRemote: ["notes/one.txt", "notes/INDEX"].filter((f) =>
        state.originFiles.split("\n").includes(f),
      ),
    },
    feedbackByResume: {
      landingFailures: delivery?.landingFailures ?? 0,
      resumedSession: resumed?.session_id ?? null,
      runs: resumed?.runs ?? 0,
      messageDelivered: state.messages.some(
        (m) => m.session_id === resumed?.session_id && m.state === "delivered",
      ),
    },
    sourceUnchanged: {
      before: sourceBefore,
      after: sourceAfter,
      unchanged:
        sourceBefore?.head === sourceAfter.head &&
        !sourceAfter.diffStat &&
        !sourceAfter.status,
    },
    codex: workers.map((c) => ({
      session: c.session_id,
      permissionClass: c.permission_class,
      runs: c.runs,
      exitCode: c.exit_code,
      items: codexItems(c.log_file),
    })),
    probes: {
      output: probes,
      allowed: probes
        ? probes.split("\n").filter((l) => /ALLOWED /.test(l))
        : null,
    },
    proxy: fs.existsSync(P.proxyLog)
      ? Object.fromEntries(
          ["allow", "deny"].map((verdict) => [
            verdict,
            [
              ...new Set(
                fs
                  .readFileSync(P.proxyLog, "utf8")
                  .split("\n")
                  .filter((l) => l.includes(` ${verdict} `))
                  .map((l) => l.split(" ").at(-1)),
              ),
            ],
          ]),
        )
      : null,
    outsideProbe: fs.existsSync(path.join(ROOT, "outside-probe.txt")),
    gitDirProbe: fs.existsSync(path.join(P.checkout, ".git", "p58-probe")),
    homeProbe: fs.existsSync(path.join(os.homedir(), "p58-outside-probe.txt")),
  };
}

const passed = (v) =>
  v.task.landed &&
  v.task.exitedWithResult &&
  v.task.avoozlCommitOnRemote &&
  v.task.filesOnRemote.length === 2 &&
  v.feedbackByResume.landingFailures >= 1 &&
  v.feedbackByResume.runs >= 2 &&
  v.feedbackByResume.messageDelivered &&
  v.sourceUnchanged.unchanged &&
  !v.outsideProbe &&
  !v.gitDirProbe &&
  !v.homeProbe &&
  (v.probes.allowed?.length ?? 1) === 0;

function startProxy() {
  const proxy = spawn(
    process.execPath,
    [
      path.join(REPO, "scripts", "live-proofs", "p57-model-proxy.mjs"),
      String(PROXY_PORT),
      P.proxyLog,
    ],
    { stdio: "ignore" },
  );
  return proxy;
}

async function prove() {
  const { sandboxKind } = await import("../src/app/sandbox.mjs");
  if (AGENT === "codex" && !sandboxKind())
    throw Error(
      "sandbox-exec cannot run here (inside another sandbox?). Run P58 from a terminal outside Kiro Crew.",
    );
  await setup();
  const sourceBefore = readEvents().find(
    (e) => e.kind === "setup.start",
  )?.source;
  let proxy = null;
  if (AGENT === "codex") {
    proxy = startProxy();
    await sleep(1000);
    event("proxy.start", { pid: proxy.pid, port: PROXY_PORT });
  }
  const backendProcess = startBackend(60 * 60);
  event("backend.start", { pid: backendProcess.pid });
  try {
    const final = await until(
      "the task to land after its feedback round",
      (s) => s.deliveries[TASK[0]]?.state === "integrated",
      { timeoutMs: 40 * 60_000 },
    );
    event("task.done", { state: final.state });
  } finally {
    fs.writeFileSync(path.join(ROOT, "stop-backend"), "");
    await sleep(5000);
    backendProcess.kill("SIGTERM");
    if (proxy) proxy.kill("SIGTERM");
    try {
      const { runningSupervisor, openSupervisorDatabase } = await import(
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
    const state = await snapshotState().catch((error) => ({
      error: error.message,
    }));
    const verdicts = state.error
      ? { error: state.error }
      : evaluate(state, sourceBefore, sourceState());
    const pass = !state.error && passed(verdicts);
    fs.writeFileSync(
      P.report,
      JSON.stringify({ agent: AGENT, pass, verdicts, state }, null, 2),
    );
    event("report", { file: P.report, pass, verdicts });
    console.log(
      pass
        ? AGENT === "codex"
          ? "P58 PASS"
          : "P58 PLUMBING OK (fake agent; not the proof)"
        : "P58 FAIL",
    );
  }
}

// Not the proof: one confined Codex edit in a throwaway folder, through the
// same definition, sandbox, environment filter and proxy the proof uses. It
// shows Codex can write a file and run a command inside Avoozl's sandbox.
async function preflight() {
  const { confineChild, sandboxKind, sandboxNetwork, sandboxSecretPaths } =
    await import("../src/app/sandbox.mjs");
  const { parseHarnessDefinition, fillHarnessArgv } = await import(
    "../src/app/harness-definitions.mjs"
  );
  if (!sandboxKind())
    throw Error(
      "sandbox-exec cannot run here; use a terminal outside Kiro Crew.",
    );
  fs.mkdirSync(ROOT, { recursive: true });
  const folder = fs.realpathSync.native(
    fs.mkdtempSync(path.join(ROOT, "folder-")),
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p58-preflight-"));
  const home = fs.mkdtempSync(path.join(ROOT, "codex-home-"));
  fs.writeFileSync(path.join(home, "config.toml"), codexConfig());
  git(folder, "init", "-q");
  const definition = parseHarnessDefinition(
    JSON.parse(definitionBytes().bytes),
  );
  const argv = [
    ...fillHarnessArgv(definition.start, {
      worktree: folder,
      permission: definition.permission.write,
    }),
    ...fillHarnessArgv(definition.model, { model: MODEL }),
    "-",
  ];
  const proxy = startProxy();
  await sleep(1000);
  try {
    const env = {
      ...agentEnv(),
      CODEX_HOME: home,
      TMPDIR: tmp,
      AVOOZL_CHILD: "1",
    };
    const confined = confineChild(argv, {
      definition: { ...definition, hash: "preflight" },
      writeRoots: [folder, tmp, home],
      secrets: sandboxSecretPaths({
        configDirectory: MACHINE.configDirectory,
        stateDirectory: MACHINE.stateDirectory,
      }),
      network: sandboxNetwork([`localhost:${PROXY_PORT}`]),
      env,
      keepEnv: definition.keepEnv,
    });
    const run = spawnSync(confined.argv[0], confined.argv.slice(1), {
      cwd: folder,
      env: confined.env,
      input:
        "Create the file hello.txt containing the word hi and a newline. Then run the shell command `cat hello.txt > copy.txt`. Then reply with the single word OK.",
      encoding: "utf8",
      timeout: 300_000,
    });
    const items = (() => {
      const file = path.join(ROOT, "preflight.log");
      fs.writeFileSync(file, run.stdout);
      return codexItems(file);
    })();
    const wrote = fs.existsSync(path.join(folder, "hello.txt"));
    const ran = fs.existsSync(path.join(folder, "copy.txt"));
    console.log(
      JSON.stringify(
        {
          sandbox: confined.sandbox,
          argv: argv.slice(0, -1),
          exit: run.status,
          items,
          wrote,
          ran,
          stderr: run.stderr.slice(-800),
          proxy: fs.existsSync(P.proxyLog)
            ? fs.readFileSync(P.proxyLog, "utf8").slice(-800)
            : null,
        },
        null,
        2,
      ),
    );
    console.log(
      run.status === 0 && wrote && ran ? "PREFLIGHT OK" : "PREFLIGHT FAILED",
    );
  } finally {
    proxy.kill("SIGTERM");
  }
}

if (positionals[0] === "backend")
  await backend(Number(values["backend-for"] || 600));
else if (positionals[0] === "preflight") await preflight();
else await prove();
