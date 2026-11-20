#!/usr/bin/env node
// Proof ms-p2 and ms-p3 (machine-server D6, D7), and ms-roles (without-kirocrew
// D8): every role of Avoozl on one harness, with no front end open. The
// machine server (`avoozl start`) runs the tick, the drain and every `process`
// child, and a `command` sink is the only notification channel. One line per
// row of ms-roles-rows.mjs says whether it reached its result.
//
//   1 start a spec from a goal; 2 the plan review runs on a second model and
//   one finding is answered; 3 approve from the command line; 4 the tasks
//   land with investigate first on; 5 label a pull request for a review draft
//   and ask for a reply on an issue; 6 ask the assistant a question; 7 push a
//   failing commit to main and see the line stop; 8 read the sink's file and
//   `avoozl status`.
//
// Everything Avoozl keeps lives under --root, with its own Avoozl config and
// state home (XDG_CONFIG_HOME, XDG_STATE_HOME). The only thing outside it is
// --github: a scratch GitHub repository the owner made for this, empty, which
// the run pushes to and opens one pull request and one issue in. Run it from
// a terminal outside Kiro Crew, on a machine user with no Kiro Crew:
//
//   node scripts/proofs/proof-ms-roles-live.mjs --root DIR --github OWNER/SCRATCH --harness claude-code|codex [--probes]
//   node scripts/proofs/proof-ms-roles-live.mjs --root DIR --harness fake-cli --offline
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
import { installHarness, isolatedMachine } from "./machine.mjs";
import { ROWS } from "./ms-roles-rows.mjs";
import { realClaude, realCodex } from "./real-claude.mjs";

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
    "Usage: node scripts/proofs/proof-ms-roles-live.mjs --root DIR --github OWNER/SCRATCH --harness claude-code|codex [--probes] | --root DIR --harness fake-cli --offline",
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
const LABELS = {
  review: "msr:review",
  drafted: "msr:drafted",
  ask: "msr-ask",
  answering: "msr:answering",
};
// Two different models: the plan review counts only on a second one.
const MODELS = {
  claude: [
    process.env.MSR_MODEL || "global.anthropic.claude-sonnet-5",
    process.env.MSR_REVIEW_MODEL || "global.anthropic.claude-opus-5",
  ],
  codex: [
    process.env.MSR_MODEL || "openai.gpt-5.6-luna",
    process.env.MSR_REVIEW_MODEL || "openai.gpt-5.6",
  ],
  fake: ["fake-writer", "fake-reviewer"],
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
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim();
const cli = (...args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: process.env,
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withStore = async (use) => {
  const { Store } = await import("../../src/app/store/store.mjs");
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
else if (/You are an Avoozl Falsifier/.test(text)) write({ state: "done", report: { verdict: "stands", evidence: "check.mjs reads notes/.", confidence: "medium" } });
else if (/^You are the Avoozl Verifier/.test(text)) write({ state: "done", report: { checks: [{ command: "node check.mjs", exitCode: 0 }] } });
else if (/review\\.json/.test(text) && /plans_submit_review/.test(text)) {
  out("review.json", JSON.stringify({ findings: [], summary: "The plan adds one note." }));
} else if (/Answer this round's findings/.test(text)) write({ state: "done", report: { answers: [] } });
else if (/skip plans_create_plan/.test(text)) {
  fs.writeFileSync("requirements.md", "# Notes\\n\\nThe repository holds a note.\\n");
  fs.writeFileSync("design.md", "# Design\\n\\nOne file under notes/.\\n");
  fs.writeFileSync("tasks.md", "# Tasks\\n\\n- [ ] 1.1 Write notes/beta.txt\\n  - $repo: app\\n  - $done: notes/beta.txt holds beta and a newline, and node check.mjs prints ok.\\n");
} else if (/"state": "findings"/.test(text)) write({ state: "findings", report: { read: "notes/", cause: "no note yet", plan: "add it", check: "node check.mjs", confidence: "high" } });
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
  const { ROLES } = await import("../../src/app/settings/chat-models.mjs");
  config.delivery = {
    ...(config.delivery || {}),
    retries: 1,
    investigate: { mode: "all", minConfidence: "high" },
  };
  config.lanes = { local: 2 };
  config.planReview = { mode: "auto", rounds: 1 };
  // A retro after every landed task.
  config.flow = { ...(config.flow || {}), retro: { everyTasks: 1 } };
  config.roles = Object.fromEntries(
    ROLES.map((role) => [role, { harness: HARNESS }]),
  );
  config.roles.worker.model = MODELS[0];
  config.roles.planner.model = MODELS[0];
  config.roles.planReviewer.model = MODELS[1];
  if (GITHUB)
    config.github = {
      mode: "single-repo",
      repositories: {
        [GITHUB]: {
          baseBranch: "main",
          allowedActors: [login],
          managedLabels: { responding: LABELS.answering },
          rules: [{ id: "ask", action: "respond", labelsAll: [LABELS.ask] }],
          radar: { reviewLabel: LABELS.review, draftedLabel: LABELS.drafted },
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
  // A short pass, so the run takes minutes, not hours.
  machine.machine = { ...(machine.machine || {}), tickSeconds: 10 };
  machine.notifications = {
    sinks: [
      {
        id: "file",
        kind: "command",
        argv: [process.execPath, path.join(ROOT, "sink.mjs")],
      },
    ],
  };
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
    // (1) A spec from a goal, as a person asks for one.
    const planned = await ops.execute("plan.new", {
      name: SPEC,
      goal: "Add notes/beta.txt containing the word beta and a newline. One task; its check is node check.mjs.",
      repositories: ["app"],
    });
    event("step1.plan-new", { name: planned.name });
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
    const rounds = store.list("review_rounds").filter((r) => r.planId === SPEC);
    const threads = store
      .list("review_threads")
      .filter((t) => t.planId === SPEC);
    const tasks = store.read().tasks.filter((t) => t.planId === SPEC);
    return {
      plan: plan ? { state: plan.state, hash: plan.hash } : null,
      rounds: rounds.map((r) => ({
        state: r.state,
        reviewerModel: r.reviewerModel ?? null,
        writerModel: r.writerModel ?? null,
        note: r.note ?? r.reason ?? null,
      })),
      findings: threads.length,
      answered: threads.filter((t) => t.answer).length,
      tasks: tasks.map((t) => ({
        id: t.id,
        delivery: store.get("task_deliveries", t.id)?.state ?? null,
        investigation: store.get("task_investigations", t.id)?.state ?? null,
      })),
      drafts: store
        .list("receipts")
        .filter((r) => r.kind === "review-draft")
        .map((r) => ({ state: r.state, reviewId: r.reviewId ?? null })),
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
    // A person's Go ahead on a task waiting for one (step 4).
    for (const task of now.tasks)
      if (task.investigation === "needs-you")
        await withStore(async (store) => {
          await (await operations(store)).execute(
            "investigation.decide",
            { taskId: task.id, action: "go" },
            undefined,
            { local: true },
          );
          event("step4.go-ahead", { task: task.id });
        });
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
async function rowResults(roles, now, { lineStopped }) {
  const { rowFor } = await import("../../src/app/agents/role-table.mjs");
  const ran = new Set(
    Object.entries(roles)
      .filter(([, entry]) => entry.ran > 0)
      .map(([role]) => rowFor(role)?.setting)
      .filter(Boolean),
  );
  const needsGithub = new Set(["responder", "pull-request-review"]);
  return ROWS.map((row) => {
    const base = { id: row.id, scenario: row.scenario, result: row.result };
    if (row.driven === false)
      return { ...base, state: "skipped", note: row.why };
    if (row.id === "line-watch")
      return { ...base, state: lineStopped ? "ok" : "FAIL", note: "step 7" };
    const missing = row.drives.filter(
      // A spec review with no findings has nothing to answer.
      (role) =>
        !ran.has(role) && !(role === "planAnswer" && now.findings === 0),
    );
    if (!missing.length) return { ...base, state: "ok" };
    if (OFFLINE && needsGithub.has(row.id))
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
  const { startMachineServer, stopMachineServer } = await import(
    "../../src/app/executors/machine-server.mjs"
  );
  if (AGENT !== "fake" && !sandboxKind())
    throw Error(
      "No sandbox here (inside another sandbox?). Run ms-roles from a terminal outside Kiro Crew.",
    );
  if (
    AGENT !== "fake" &&
    fs.existsSync(path.join(os.homedir(), ".kiro", "crew"))
  )
    event("warning", {
      text: "~/.kiro/crew exists: run ms-roles as a machine user with no Kiro Crew for the proof to count.",
    });
  await setup();
  let proxy = null;
  if (AGENT !== "fake") {
    proxy = spawn(
      process.execPath,
      [
        path.join(REPO_ROOT, "scripts", "proofs", "p57-model-proxy.mjs"),
        String(PROXY_PORT),
        P.proxyLog,
      ],
      { stdio: "ignore" },
    );
    await sleep(1000);
  }
  // The machine server, started as a person starts it: `avoozl start`. It
  // gets the agent's credentials in its own environment and no front end runs.
  const started = await startMachineServer({
    stateDirectory: MACHINE.stateDirectory,
    configDirectory: MACHINE.configDirectory,
    starter: "terminal",
    env: agentEnv(),
  });
  event("server.start", { message: started.message });
  const minutes = AGENT === "fake" ? 8 : 60;
  const expected = {};
  try {
    // (2) The plan is drafted, reviewed on the second model, and answered.
    let now = await until(
      "step2.review",
      (s) =>
        s.plan &&
        s.rounds.some((r) => r.state === "done" || r.state === "skipped") &&
        (s.findings === 0 || s.answered > 0),
      minutes,
    );
    expected[
      "2 the plan review ran on a second model and a finding was answered"
    ] =
      now.rounds.some(
        (r) =>
          r.state === "done" &&
          r.reviewerModel &&
          r.reviewerModel !== r.writerModel,
      ) && (now.findings === 0 ? AGENT === "fake" : now.answered > 0);
    // (3) Approve from the command line, the way a person does.
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
      // With GitHub, the spec's issues are made here, a person's act.
      if (GITHUB) cli("spec", "publish", SPEC, "--workspace", P.ws);
      event("step3.approved");
    }
    // (4) The tasks land, with investigate first on.
    now = await until(
      "step4.land",
      (s) =>
        s.tasks.length > 0 && s.tasks.every((t) => t.delivery === "integrated"),
      minutes,
    );
    expected["4 every task landed after investigate first"] =
      now.tasks.length > 0 &&
      now.tasks.every((t) => t.delivery === "integrated");
    // A person asks for the landed task's summary; the retro is due too.
    for (const task of now.tasks)
      await withStore(async (store) => {
        await (await operations(store)).execute(
          "task.summary.request",
          { id: task.id },
          undefined,
          { local: true },
        );
      });
    await untilTrue(
      "step4.summary-retro",
      async () =>
        (await childExited("task-summary")) && (await childExited("retro")),
      minutes,
    );
    // (5) A review draft on a labeled pull request, and a reply to an issue.
    if (GITHUB) {
      git(P.checkout, "fetch", "-q", "origin");
      git(P.checkout, "checkout", "-q", "-B", "msr-change", "origin/main");
      fs.mkdirSync(path.join(P.checkout, "notes"), { recursive: true });
      fs.writeFileSync(path.join(P.checkout, "notes", "gamma.txt"), "gamma\n");
      git(P.checkout, "add", ".");
      git(P.checkout, "commit", "-q", "-m", "Add notes/gamma.txt");
      git(P.checkout, "push", "-q", "-u", "origin", "msr-change");
      git(P.checkout, "checkout", "-q", "main");
      for (const label of Object.values(LABELS))
        spawnSync("gh", [
          "label",
          "create",
          label,
          "--repo",
          GITHUB,
          "--force",
        ]);
      const url = gh(
        "pr",
        "create",
        "--repo",
        GITHUB,
        "--head",
        "msr-change",
        "--base",
        "main",
        "--title",
        "Add notes/gamma.txt",
        "--body",
        "One more note.",
      );
      gh("pr", "edit", url, "--add-label", LABELS.review);
      const issue = gh(
        "issue",
        "create",
        "--repo",
        GITHUB,
        "--title",
        "How do I run the check?",
        "--body",
        "Which command checks the notes?",
        "--label",
        LABELS.ask,
      );
      event("step5.asked", { pr: url, issue });
      now = await until(
        "step5.github",
        (s) =>
          s.drafts.some((d) => d.state === "waiting") &&
          s.responses.some((r) => r.state === "replied"),
        minutes,
      );
      const pending = JSON.parse(
        gh("api", `repos/${GITHUB}/pulls/${url.split("/").pop()}/reviews`),
      );
      expected[
        "5 the review draft is pending on GitHub, not submitted, and the issue got its reply"
      ] =
        now.drafts.some((d) => d.state === "waiting") &&
        pending.some((r) => r.state === "PENDING") &&
        !pending.some((r) =>
          ["APPROVED", "CHANGES_REQUESTED", "COMMENTED"].includes(r.state),
        ) &&
        now.responses.some((r) => r.state === "replied");
    }
    // (6) The assistant answers a question from the page's Open chat.
    await withStore(async (store) => {
      await (await operations(store)).execute(
        "session.open",
        { message: "What does check.mjs check?" },
        undefined,
        { local: true },
      );
    });
    event("step6.asked");
    await untilTrue("step6.assist", () => childExited("assist"), minutes);
    // The containment probes (ms-2.2, MS8.2) in a live child: the harness
    // itself runs them by the one command its brief names.
    if (values.probes)
      expected["probes every probe was refused"] = await liveProbes(minutes);
    // (7) A red head on main: the line stops, and no session is requested.
    // On the landed main, pushed as a person would.
    git(P.checkout, "checkout", "-q", "main");
    git(P.checkout, "pull", "-q", "--ff-only", "origin", "main");
    fs.mkdirSync(path.join(P.checkout, "notes"), { recursive: true });
    fs.writeFileSync(path.join(P.checkout, "notes", "beta.txt"), "BAD\n");
    git(P.checkout, "add", ".");
    git(P.checkout, "commit", "-q", "-m", "Break the notes check");
    git(P.checkout, "push", "-q", "origin", "HEAD");
    event("step7.red-head");
    const { openStops } = await import("../../src/app/flow/flow.mjs");
    await untilTrue(
      "step7.line",
      () => withStore(async (store) => openStops(store).length > 0),
      minutes,
    );
    now = await state();
    const stopped = await withStore(async (store) => openStops(store).length);
    expected[
      "7 the line stopped on the red head and no watch session was requested"
    ] =
      stopped > 0 &&
      !now.requests.some((r) => /watch|line/i.test(r.role ?? ""));
    expected[
      "1-5 every session ran on process, and no kirocrew request was written"
    ] =
      now.bindings.length > 0 &&
      now.bindings.every((b) => b.executor === "process") &&
      now.requests.every((r) => r.executor !== "kirocrew");
    // (6) The sink's file and avoozl status.
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
      "6 the sink got one line per decision and failure, each with only channel, title, ID, time and link, and status shows nothing waiting on Kiro Crew"
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
    const rows = await rowResults(roles, now, {
      lineStopped:
        expected[
          "7 the line stopped on the red head and no watch session was requested"
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
    // Children are detached and outlive the server; the run is over.
    await stopMachineServer({
      stateDirectory: MACHINE.stateDirectory,
      waitMs: 30_000,
    }).catch((error) => event("server.stop-failed", { error: error.message }));
  }
}

await prove();
