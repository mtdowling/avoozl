#!/usr/bin/env node
// @ts-nocheck: typing debt, see the commit message
// Proof ms-p2 and ms-p3 (machine-server D6, D7), and ms-roles (without-kirocrew
// D8): every role of Avoozl on one harness, with no front end open. A timer
// runs `avoozl tick` every 10 seconds, each a process of its own that runs one
// pass (the tick, the drain and every `process` child) and exits, and a
// `command` sink is the only notification channel. One line per row of
// ms-roles-rows.mjs says whether it reached its result.
//
//   1 write a one-task spec folder; 2 approve it from the command line; 3 the
//   tasks land; 4 start a discussion and see it answered; 5 ask the
//   assistant a question; 6 push a failing commit to main and see the line
//   stop; 7 read the sink's file and `avoozl status`.
//
// Everything Avoozl keeps lives under --root, with its own Avoozl config and
// state home (XDG_CONFIG_HOME, XDG_STATE_HOME). The only thing outside it is
// --github: a scratch GitHub repository the owner made for this, empty, which
// the run pushes to and starts one discussion in. Run it from
// a terminal outside Kiro Crew; a Kiro Crew kept for other work may stay
// open, since the run's own home has none. --root must not exist yet or be
// empty: nothing writes there before setup checks it.
//
//   node scripts/proofs/proof-ms-roles-live.ts --root DIR --github OWNER/SCRATCH --harness claude-code|codex [--probes]
//   node scripts/proofs/proof-ms-roles-live.ts --root DIR --harness fake-cli --offline
//
// `--harness fake-cli --offline` checks this script's plumbing with no GitHub
// and a fake agent, and never counts as the proof. `--probes` also runs the
// containment probes (ms-2.2) in a live child.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { installHarness, isolatedMachine, proofCommands } from "./machine.ts";
import { ROWS } from "./ms-roles-rows.ts";
import { realClaude, realCodex } from "./real-claude.ts";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CLI = path.join(REPO_ROOT, "cli.mjs");
const PROXY_PORT = Number(process.env.MSR_PROXY_PORT || 18462);
const which = (name) =>
  spawnSync(`command -v ${name}`, {
    shell: true,
    encoding: "utf8",
  }).stdout.trim() || name;

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    github: { type: "string" },
    harness: { type: "string", default: "claude-code" },
    offline: { type: "boolean", default: false },
    probes: { type: "boolean", default: false },
  },
});
const AGENT = { "claude-code": "claude", codex: "codex", "fake-cli": "fake" }[
  values.harness
];
if (!values.root || !AGENT) {
  console.error(
    "Usage: node scripts/proofs/proof-ms-roles-live.ts --root DIR --github OWNER/SCRATCH --harness claude-code|codex [--probes] | --root DIR --harness fake-cli --offline",
  );
  process.exit(64);
}
const OFFLINE = values.offline;
if (OFFLINE && AGENT !== "fake")
  throw Error("--offline is for --harness fake-cli only.");
if (!OFFLINE && !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(values.github ?? ""))
  throw Error("--github names the scratch repository as OWNER/NAME.");
const GITHUB = values.github ?? null;
const ROOT = path.resolve(values.root);
const HARNESS = values.harness;
const TAG = "msr";
const SPEC = `${TAG}-notes`;
// The discussion category the responder answers in: one GitHub makes when
// discussions are turned on.
const CATEGORY = "Q&A";
const MODEL = {
  claude: process.env.MSR_MODEL || "global.anthropic.claude-sonnet-5",
  codex: process.env.MSR_MODEL || "openai.gpt-5.6-luna",
  fake: "fake-writer",
}[AGENT];

// The isolated Avoozl home, set before any Avoozl module loads; no Kiro Crew.
const HOME = path.join(ROOT, "home");
process.env.XDG_CONFIG_HOME = path.join(HOME, "config");
process.env.XDG_STATE_HOME = path.join(HOME, "state");
for (const key of Object.keys(process.env))
  if (/^KIROCREW_/.test(key)) delete process.env[key];

const P = {
  checkout: path.join(ROOT, "app"),
  origin: path.join(ROOT, "origin.git"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  agentHome: path.join(ROOT, "agent-home"),
  sink: path.join(ROOT, "notifications.log"),
  report: path.join(ROOT, "report.json"),
  events: path.join(ROOT, "events.jsonl"),
  backendLog: path.join(ROOT, "backend.log"),
  tickLog: path.join(ROOT, "tick.log"),
  proxyLog: path.join(ROOT, "proxy.log"),
};
const DB = path.join(P.ws, ".avoozl", "local", "workspace.sqlite");
const MACHINE = await isolatedMachine(HOME);

const event = (kind, data = {}) => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.appendFileSync(
    P.events,
    JSON.stringify({ at: new Date().toISOString(), kind, ...data }) + "\n",
  );
  console.log(`[ms-roles] ${kind} ${JSON.stringify(data)}`);
};
const { git, gh, cli, sleep } = proofCommands(CLI);
const withStore = async (use) => {
  const { Store } = await import("../../src/app/store/store.ts");
  const store = new Store(DB);
  try {
    return await use(store);
  } finally {
    store.close();
  }
};
const operations = async (store) => {
  const { Operations } = await import("../../src/app/api/operations.mjs");
  return new Operations(store, {
    workspaceRoot: P.ws,
    configDirectory: MACHINE.configDirectory,
  });
};

const CHECK = `// ms-roles scratch check: each notes/*.txt holds one lowercase word and a newline.
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

// The command sink: appends the payload argument, one JSON line per notice.
const SINK = `import fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(P.sink)}, process.argv[3] + "\\n");\n`;

// The fake agent (plumbing only): each role's result, by its brief.
const FAKE_AGENT = `import fs from "node:fs";
import { execFileSync } from "node:child_process";
const text = fs.readFileSync(0, "utf8");
// Name the model that served this run, as Claude Code's modelUsage does.
const model = process.argv[process.argv.indexOf("--model") + 1];
if (process.argv.includes("--model")) console.log(JSON.stringify({ modelUsage: { [model]: {} } }));
const write = (value) => { fs.mkdirSync(".avoozl", { recursive: true }); fs.writeFileSync(".avoozl/result.json", JSON.stringify(value)); };
const out = (name, body) => { fs.mkdirSync(".avoozl/output", { recursive: true }); fs.writeFileSync(".avoozl/output/" + name, body); write({ state: "done", output: name }); };
if (text.includes("probes/run.cjs")) { const m = /(\\S+) probes\\/run\\.cjs (\\S+)/.exec(text); console.log(execFileSync(m[1], ["probes/run.cjs", m[2]], { encoding: "utf8" })); }
else if (/You are an Avoozl Reviewer/.test(text)) write({ state: "done", report: { verdict: "approved", findings: [], closures: [] } });
else if (/^Go ahead/.test(text) || /Avoozl task/.test(text)) { fs.mkdirSync("notes", { recursive: true }); fs.writeFileSync("notes/beta.txt", "beta\\n"); write({ state: "done", text: "Wrote it." }); }
`;

function definitionBytes() {
  if (AGENT === "fake") {
    fs.writeFileSync(path.join(ROOT, "fake-agent.mjs"), FAKE_AGENT);
    const argv = [process.execPath, path.join(ROOT, "fake-agent.mjs")];
    return JSON.stringify({
      name: HARNESS,
      start: argv,
      resume: argv,
      promptFrom: "stdin",
      model: ["--model", "{model}"],
      permission: { write: "workspace-write", read: "read-only" },
      writeRoots: ["{worktree}", "{tmp}", "{repository_cache_dirs}"],
      resultAllow: ["--result-file"],
      servedModel: { from: "output", field: "modelUsage" },
    });
  }
  const definition = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "examples", "harnesses", `${HARNESS}.json`),
      "utf8",
    ),
  );
  // Bedrock sign-in, as P57, P58 and P59: only short-lived credentials pass.
  definition.keepEnv = [
    ...(definition.keepEnv ?? []),
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
  ];
  // The sandboxed child runs the real binary: the toolbox shim and wrapper
  // fail inside the sandbox (real-claude.mjs).
  const binary = harnessBinary();
  definition.start[0] = binary;
  definition.resume[0] = binary;
  return JSON.stringify(definition, null, 2) + "\n";
}

function harnessBinary() {
  if (AGENT === "claude")
    return (
      process.env.MSR_CLAUDE ||
      realClaude(which("claude"), os.homedir()) ||
      which("claude")
    );
  return (
    process.env.MSR_CODEX ||
    realCodex(which("codex"), os.homedir()) ||
    which("codex")
  );
}

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; ms-roles runs once on a fresh root.`);
  for (const dir of [ROOT, P.wt, P.agentHome])
    fs.mkdirSync(dir, { recursive: true });
  event("setup.start", {
    root: ROOT,
    agent: AGENT,
    repo: GITHUB,
    avoozl: git(REPO_ROOT, "rev-parse", "HEAD"),
  });
  // The scratch repository: GitHub's, or a bare remote offline.
  if (GITHUB) {
    gh("repo", "clone", GITHUB, P.checkout);
  } else {
    git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
    git(ROOT, "clone", "-q", P.origin, P.checkout);
  }
  git(P.checkout, "config", "user.name", "ms-roles Scratch");
  git(P.checkout, "config", "user.email", "nkp2@example.invalid");
  if (!fs.existsSync(path.join(P.checkout, "check.mjs"))) {
    git(P.checkout, "checkout", "-q", "-B", "main");
    fs.writeFileSync(
      path.join(P.checkout, "README.md"),
      "ms-roles scratch repository.\n",
    );
    fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
    git(P.checkout, "add", ".");
    git(
      P.checkout,
      "commit",
      "-q",
      "-m",
      "Start the ms-roles scratch repository",
    );
    git(P.checkout, "push", "-q", "origin", "main");
  }
  cli("init", P.ws, "--name", "ms-roles");
  cli("workspace", "add", TAG, "--root", P.ws);
  const login = GITHUB ? JSON.parse(gh("api", "user")).login : null;
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const { ROLES } = await import("../../src/app/agents/role-table.mjs");
  config.delivery = { ...(config.delivery || {}), retries: 1 };
  config.lanes = { local: 2 };
  // Every role the role table runs as a child, on this harness.
  config.roles = Object.fromEntries(
    ROLES.map((role) => [role, { harness: HARNESS }]),
  );
  config.roles.worker.model = MODEL;
  if (GITHUB)
    config.github = {
      mode: "single-repo",
      repositories: {
        [GITHUB]: {
          baseBranch: "main",
          allowedActors: [login],
          discussions: { categories: [CATEGORY] },
        },
      },
    };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

  // This machine's harness and its one sink, in the machine file.
  const hash = await installHarness(
    MACHINE.configDirectory,
    HARNESS,
    definitionBytes(),
    { unconfined: AGENT === "fake" },
  );
  fs.writeFileSync(path.join(ROOT, "sink.mjs"), SINK);
  const machineFile = path.join(MACHINE.configDirectory, "config.json");
  const machine = fs.existsSync(machineFile)
    ? JSON.parse(fs.readFileSync(machineFile, "utf8"))
    : { version: 1 };
  machine.notifications = {
    sinks: [
      {
        id: "file",
        kind: "command",
        argv: [process.execPath, path.join(ROOT, "sink.mjs")],
      },
    ],
  };
  // This machine's loop: the tick starts and lands work only with it.
  machine.loop = { run: ["specs"], every: "10s" };
  fs.writeFileSync(machineFile, JSON.stringify(machine, null, 2) + "\n");
  event("setup.harness", { name: HARNESS, hash });

  await withStore(async (store) => {
    store.put("repositories", {
      id: "app",
      root: fs.realpathSync.native(P.checkout),
      baseBranch: "main",
      landing: "direct",
      checks: [["node", "check.mjs"]],
      worktreeRoot: P.wt,
      executor: "process",
      harness: HARNESS,
      ...(GITHUB ? { repository: GITHUB } : {}),
      sandbox: {
        writeRoots: [P.agentHome],
        allowCommands: [
          ["node", "check.mjs"],
          ["git", "rev-parse"],
          ["git", "diff"],
          ["git", "status"],
          ["git", "log"],
        ],
        ...(AGENT === "fake" ? {} : { network: [`localhost:${PROXY_PORT}`] }),
      },
    });
    const ops = await operations(store);
    if (GITHUB)
      await ops.execute("github.configure", {
        repository: GITHUB,
        repositoryId: "app",
        allowedActors: [login],
      });
    // (1) A one-task spec folder, as a person writes one with the
    // avoozl-spec skill, stored as a draft.
    const folder = path.join(P.ws, ".kiro", "specs", SPEC);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, "requirements.md"),
      "---\nrepo: app\n---\n# Notes\n\nThe repository holds a note.\n",
    );
    fs.writeFileSync(
      path.join(folder, "design.md"),
      "# Design\n\nOne file under notes/.\n",
    );
    fs.writeFileSync(
      path.join(folder, "tasks.md"),
      "# Tasks\n\n- [ ] `notes-1` Write notes/beta.txt\n  - notes/beta.txt holds beta and a newline, and node check.mjs prints ok\n",
    );
    const planned = await ops.execute("plan.create", { spec: SPEC });
    event("step1.spec", { name: planned.id });
  });
  event("setup.done");
}

function agentEnv() {
  const env = { ...process.env };
  if (AGENT === "fake") return env;
  // The credential export runs the command on PATH, under the real HOME.
  const claude = which("claude");
  const settings = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), ".claude", "settings.json"),
      "utf8",
    ),
  );
  const creds = JSON.parse(
    execFileSync(claude, ["default-credential-export"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ).Credentials;
  return {
    ...env,
    ...(AGENT === "claude"
      ? { CLAUDE_CONFIG_DIR: P.agentHome, CLAUDE_CODE_USE_BEDROCK: "1" }
      : { CODEX_HOME: P.agentHome, SSL_CERT_FILE: "/etc/ssl/cert.pem" }),
    AWS_REGION: settings.env?.AWS_REGION || "us-west-2",
    AWS_ACCESS_KEY_ID: creds.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.SecretAccessKey,
    AWS_SESSION_TOKEN: creds.SessionToken,
    HTTPS_PROXY: `http://localhost:${PROXY_PORT}`,
    https_proxy: `http://localhost:${PROXY_PORT}`,
    NO_PROXY: "",
  };
}

async function state() {
  return withStore(async (store) => {
    const plan = store.get("plans", SPEC);
    const tasks = store.read().tasks.filter((t) => t.planId === SPEC);
    return {
      plan: plan ? { state: plan.state, hash: plan.hash } : null,
      tasks: tasks.map((t) => ({
        id: t.id,
        delivery: store.get("task_deliveries", t.id)?.state ?? null,
      })),
      responses: store
        .list("github_responses")
        .map((r) => ({ state: r.state, commentUrl: r.commentUrl ?? null })),
      bindings: store.list("session_bindings").map((b) => ({
        role: b.role,
        executor: b.executor ?? "kirocrew",
        status: b.status,
      })),
      requests: store.list("session_requests").map((r) => ({
        role: r.request?.role ?? null,
        executor: r.executor,
        state: r.state,
        reason: r.reason ?? null,
      })),
    };
  });
}

async function until(what, check, minutes) {
  const end = Date.now() + minutes * 60_000;
  for (;;) {
    const now = await state();
    if (check(now)) {
      event(`${what}.done`);
      return now;
    }
    if (Date.now() > end) {
      event(`${what}.timeout`, { state: now });
      return now;
    }
    await sleep(5000);
  }
}

async function liveProbes(minutes) {
  const { probeArgv, RUN_PROBES } = await import(
    "../../src/app/sandbox-probes.mjs"
  );
  const listener = net.createServer((socket) => socket.end());
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const folder = path.join(P.ws, "probes");
  fs.mkdirSync(folder, { recursive: true });
  const probes = probeArgv({
    node: process.execPath,
    home: os.homedir(),
    git_common_dir: path.join(P.checkout, ".git"),
    other_worktree: P.wt,
    config_directory: MACHINE.configDirectory,
    state_directory: MACHINE.stateDirectory,
    other_temp: path.join(os.tmpdir(), "avoozl-probe-other"),
    public_host: "example.com",
    closed_port: listener.address().port,
    workspace_database: DB,
    keychain_service: "Claude Code-credentials",
    keep_env: "",
  });
  fs.writeFileSync(
    path.join(folder, "probes.json"),
    JSON.stringify(probes, null, 2),
  );
  fs.writeFileSync(path.join(folder, "run.cjs"), RUN_PROBES);
  await withStore(async (store) => {
    await (await operations(store)).execute(
      "session.open",
      {
        message: `Run this one command in a shell, exactly, and reply with its output: ${process.execPath} probes/run.cjs probes/probes.json`,
      },
      undefined,
      { local: true },
    );
  });
  const before = Date.now();
  let results = null;
  while (!results && Date.now() - before < minutes * 60_000) {
    for (const log of childLogs("assist"))
      for (const line of log.split("\n"))
        if (line.includes('"write-home"'))
          try {
            results = JSON.parse(
              line.slice(line.indexOf("{"), line.lastIndexOf("}") + 1),
            );
          } catch {}
    if (!results) await sleep(3000);
  }
  listener.close();
  // A probe that got through leaves its file; take it away again.
  for (const probe of probes)
    if (probe.class === "write") fs.rmSync(probe.argv.at(-1), { force: true });
  event("probes", { results });
  return Boolean(results) && Object.values(results).every((code) => code !== 0);
}

// The logs of every child of this role.
function childLogs(role) {
  const children = path.join(MACHINE.stateDirectory, "supervisor", "children");
  if (!fs.existsSync(children)) return [];
  return fs
    .readdirSync(children)
    .map((id) => path.join(children, id, "log"))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .filter((text) => role === "assist" || text.includes(role));
}

async function untilTrue(what, check, minutes) {
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    if (await check()) return event(`${what}.done`);
    await sleep(3000);
  }
  event(`${what}.timeout`);
}

// Whether a child of this role has exited, on the machine's supervisor.
async function childExited(role) {
  const { openSupervisorDatabase } = await import(
    "../../src/app/executors/supervisor.mjs"
  );
  const db = openSupervisorDatabase(MACHINE.stateDirectory);
  try {
    return Boolean(
      db
        .prepare(
          "SELECT 1 FROM children WHERE role = ? AND state = 'exited' LIMIT 1",
        )
        .get(role),
    );
  } finally {
    db.close();
  }
}

// What each role did on this harness, for the receipt (step 7): ran, or
// could not, with the supervisor's reason.
async function rolesOnHarness() {
  const { openSupervisorDatabase } = await import(
    "../../src/app/executors/supervisor.mjs"
  );
  const db = openSupervisorDatabase(MACHINE.stateDirectory);
  try {
    const rows = db
      .prepare("SELECT role, state, exit_code, error FROM children")
      .all();
    const byRole = {};
    for (const row of rows) {
      const entry = (byRole[row.role] ??= { ran: 0, refused: [] });
      if (row.exit_code === -1 && row.error) entry.refused.push(row.error);
      else entry.ran += 1;
    }
    return byRole;
  } finally {
    db.close();
  }
}

// The harness's own version line, for the receipt (ms-p2 item 4).
function harnessVersion() {
  if (AGENT === "fake") return "fake";
  try {
    return execFileSync(harnessBinary(), ["--version"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

// One result per row: ok when every role it drives ran on `process`, FAIL when
// one did not, skipped when the row cannot run offline or is not driven.
async function rowResults(roles, { lineStopped }) {
  const { rowFor } = await import("../../src/app/agents/role-table.mjs");
  const ran = new Set(
    Object.entries(roles)
      .filter(([, entry]) => entry.ran > 0)
      .map(([role]) => rowFor(role)?.setting)
      .filter(Boolean),
  );
  return ROWS.map((row) => {
    const base = { id: row.id, scenario: row.scenario, result: row.result };
    if (row.driven === false)
      return { ...base, state: "skipped", note: row.why };
    if (row.id === "line-watch")
      return { ...base, state: lineStopped ? "ok" : "FAIL", note: "step 6" };
    const missing = row.drives.filter((role) => !ran.has(role));
    if (!missing.length) return { ...base, state: "ok" };
    if (OFFLINE && row.id === "responder")
      return { ...base, state: "skipped", note: "needs GitHub" };
    return {
      ...base,
      state: "FAIL",
      note: `${missing.join(", ")} did not run`,
    };
  });
}

async function prove() {
  const { sandboxKind } = await import("../../src/app/executors/sandbox.mjs");
  if (AGENT !== "fake" && !sandboxKind())
    throw Error(
      "No sandbox here (inside another sandbox?). Run ms-roles from a terminal outside Kiro Crew.",
    );
  await setup();
  let proxy = null;
  if (AGENT !== "fake") {
    proxy = spawn(
      process.execPath,
      [
        path.join(REPO_ROOT, "scripts", "proofs", "p57-model-proxy.ts"),
        String(PROXY_PORT),
        P.proxyLog,
      ],
      { stdio: "ignore" },
    );
    await sleep(1000);
  }
  // The timer, as launchd, systemd or cron runs it: `avoozl tick` every 10
  // seconds, one after another, each with the agent's credentials in its
  // own environment. No front end runs.
  const timer = tickTimer(agentEnv(), 10_000);
  event("timer.start", { everySeconds: 10 });
  const minutes = AGENT === "fake" ? 8 : 60;
  const expected = {};
  try {
    // (1) The spec folder is a draft.
    let now = await until("step1.spec", (s) => Boolean(s.plan?.hash), minutes);
    expected["1 the spec is a draft that lints clean"] = Boolean(
      now.plan?.hash,
    );
    // (2) Approve from the command line, the way a person does.
    if (now.plan) {
      cli(
        "plan",
        "approve",
        SPEC,
        "--workspace",
        P.ws,
        "--yes",
        "--expect",
        now.plan.hash.slice(0, 16),
      );
      // With GitHub, the spec's issue is made here, a person's act.
      if (GITHUB) cli("spec", "publish", SPEC, "--workspace", P.ws);
      event("step2.approved");
    }
    // (3) The tasks land.
    now = await until(
      "step3.land",
      (s) =>
        s.tasks.length > 0 && s.tasks.every((t) => t.delivery === "integrated"),
      minutes,
    );
    expected["3 every task landed"] =
      now.tasks.length > 0 &&
      now.tasks.every((t) => t.delivery === "integrated");
    // (4) A discussion in the category the policy names gets one reply.
    if (GITHUB) {
      const [owner, name] = GITHUB.split("/");
      gh("repo", "edit", GITHUB, "--enable-discussions");
      const repo = JSON.parse(
        gh(
          "api",
          "graphql",
          "-f",
          `query=query { repository(owner: "${owner}", name: "${name}") { id discussionCategories(first: 20) { nodes { id name } } } }`,
        ),
      ).data.repository;
      const category = repo.discussionCategories.nodes.find(
        (node) => node.name === CATEGORY,
      );
      if (!category) throw Error(`${GITHUB} has no ${CATEGORY} category.`);
      const discussion = JSON.parse(
        gh(
          "api",
          "graphql",
          "-f",
          'query=mutation($repo: ID!, $category: ID!) { createDiscussion(input: {repositoryId: $repo, categoryId: $category, title: "How do I run the check?", body: "Which command checks the notes?"}) { discussion { url } } }',
          "-f",
          `repo=${repo.id}`,
          "-f",
          `category=${category.id}`,
        ),
      ).data.createDiscussion.discussion.url;
      event("step4.asked", { discussion });
      now = await until(
        "step4.reply",
        (s) => s.responses.some((r) => r.state === "replied"),
        minutes,
      );
      expected["4 the discussion got its reply"] = now.responses.some(
        (r) => r.state === "replied",
      );
    }
    // (5) The assistant answers a question from the page's Open chat.
    await withStore(async (store) => {
      await (await operations(store)).execute(
        "session.open",
        { message: "What does check.mjs check?" },
        undefined,
        { local: true },
      );
    });
    event("step5.asked");
    await untilTrue("step5.assist", () => childExited("assist"), minutes);
    // The containment probes (ms-2.2, MS8.2) in a live child: the harness
    // itself runs them by the one command its brief names.
    if (values.probes)
      expected["probes every probe was refused"] = await liveProbes(minutes);
    // (6) A red head on main: the line stops, and no session is requested.
    // On the landed main, pushed as a person would.
    git(P.checkout, "checkout", "-q", "main");
    git(P.checkout, "pull", "-q", "--ff-only", "origin", "main");
    fs.mkdirSync(path.join(P.checkout, "notes"), { recursive: true });
    fs.writeFileSync(path.join(P.checkout, "notes", "beta.txt"), "BAD\n");
    git(P.checkout, "add", ".");
    git(P.checkout, "commit", "-q", "-m", "Break the notes check");
    git(P.checkout, "push", "-q", "origin", "HEAD");
    event("step6.red-head");
    const { openStops } = await import("../../src/app/flow/flow.mjs");
    await untilTrue(
      "step6.line",
      () => withStore(async (store) => openStops(store).length > 0),
      minutes,
    );
    now = await state();
    const stopped = await withStore(async (store) => openStops(store).length);
    expected[
      "6 the line stopped on the red head and no watch session was requested"
    ] =
      stopped > 0 &&
      !now.requests.some((r) => /watch|line/i.test(r.role ?? ""));
    expected[
      "1-6 every session ran on process, and no kirocrew request was written"
    ] =
      now.bindings.length > 0 &&
      now.bindings.every((b) => b.executor === "process") &&
      now.requests.every((r) => r.executor !== "kirocrew");
    // (7) The sink's file and avoozl status.
    await sleep(15_000);
    const lines = fs.existsSync(P.sink)
      ? fs
          .readFileSync(P.sink, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
    const status = JSON.parse(cli("status", "--workspace", P.ws)).workspace;
    const queued = await withStore(
      (store) => store.list("app_notifications").length,
    );
    expected[
      "7 the sink got one line per decision and failure, each with only channel, title, ID, time and link, and status shows nothing waiting on Kiro Crew"
    ] =
      lines.length === queued &&
      (AGENT === "fake" || lines.length > 0) &&
      lines.every(
        (line) =>
          Object.keys(line).sort().join() === "at,channel,id,link,title",
      ) &&
      status.kirocrew.waiting.length === 0 &&
      status.notifications.waiting === 0;
    const roles = await rolesOnHarness();
    const rows = await rowResults(roles, {
      lineStopped:
        expected[
          "6 the line stopped on the red head and no watch session was requested"
        ],
    });
    for (const row of rows)
      console.log(
        `${row.state.padEnd(7)} ${row.id}: ${row.scenario} -> ${row.result}${row.note ? ` (${row.note})` : ""}`,
      );
    for (const row of rows) expected[`row ${row.id}`] = row.state !== "FAIL";
    const report = {
      rows,
      harness: HARNESS,
      version: harnessVersion(),
      agent: AGENT,
      repo: GITHUB,
      avoozl: git(REPO_ROOT, "rev-parse", "HEAD"),
      pass: Object.values(expected).every(Boolean),
      expected,
      roles,
      sink: lines,
      status: {
        kirocrew: status.kirocrew,
        notifications: status.notifications,
      },
      state: now,
    };
    fs.writeFileSync(P.report, JSON.stringify(report, null, 2));
    event("report", { file: P.report, pass: report.pass, expected, roles });
    console.log(
      `ms-roles ${report.pass ? "PASS" : "FAIL"} on ${AGENT}${AGENT === "fake" ? " (fake agent: plumbing only, not the proof)" : ""}`,
    );
  } finally {
    if (proxy) proxy.kill("SIGTERM");
    await timer.stop();
  }
}

// Run `avoozl tick` every `everyMs` until stop(), each as its own process that
// exits after its pass, the way an operating-system timer runs it.
function tickTimer(env, everyMs) {
  let stopped = false;
  const runs = (async () => {
    while (!stopped) {
      const out = fs.openSync(P.tickLog, "a");
      await new Promise((resolve) => {
        const tick = spawn(process.execPath, [CLI, "tick"], {
          env,
          stdio: ["ignore", out, out],
        });
        tick.once("exit", resolve);
        tick.once("error", resolve);
      });
      fs.closeSync(out);
      if (!stopped) await sleep(everyMs);
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      await runs;
    },
  };
}

await prove();
