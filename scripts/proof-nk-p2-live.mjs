#!/usr/bin/env node
// Proof nk-p2 (without-kirocrew NK1 to NK9, design D8): all of Avoozl on a
// machine with no Kiro Crew. Every role runs as a `process` child under this
// machine's supervisor and its headless tick, and a `command` sink is the
// only notification channel.
//
//   (1) start a spec from a goal; (2) the plan review runs on a second model
//   and one finding is answered; (3) approve from the command line; (4) tick
//   until the tasks land, with investigate first on; (5) label a pull request
//   for a review draft and ask for a reply on an issue; (6) read the sink's
//   file and `avoozl status`. Run once with --agent claude, then again on a
//   fresh root with --agent codex, which records each role Codex ran and each
//   it could not, with the reason.
//
// Everything Avoozl keeps lives under --root, with its own Avoozl config and
// state home (XDG_CONFIG_HOME, XDG_STATE_HOME). The only thing outside it is
// --repo: a scratch GitHub repository the owner made for this, empty, which
// the run pushes to and opens one pull request and one issue in. Run it from
// a terminal outside Kiro Crew, on a machine user with no Kiro Crew, as P59:
//
//   node scripts/proof-nk-p2-live.mjs --root DIR --repo OWNER/SCRATCH [--agent claude|codex]
//   node scripts/proof-nk-p2-live.mjs --root DIR --agent fake --offline
//
// `--agent fake --offline` checks this script's plumbing for steps 1 to 4
// and 6 with no GitHub, and never counts as the proof.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  installHarness,
  isolatedMachine,
  stopMachine,
} from "./live-proofs/machine.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CLI = path.join(REPO_ROOT, "cli.mjs");
const PROXY_PORT = Number(process.env.NKP2_PROXY_PORT || 18462);
const which = (name) =>
  spawnSync(`command -v ${name}`, {
    shell: true,
    encoding: "utf8",
  }).stdout.trim() || name;

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    repo: { type: "string" },
    agent: { type: "string", default: "claude" },
    offline: { type: "boolean", default: false },
    backend: { type: "boolean", default: false },
  },
});
const AGENT = values.agent;
if (!values.root || !["claude", "codex", "fake"].includes(AGENT)) {
  console.error(
    "Usage: node scripts/proof-nk-p2-live.mjs --root DIR --repo OWNER/SCRATCH [--agent claude|codex] | --root DIR --agent fake --offline",
  );
  process.exit(64);
}
const OFFLINE = values.offline;
if (OFFLINE && AGENT !== "fake")
  throw Error("--offline is for --agent fake only.");
if (!OFFLINE && !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(values.repo ?? ""))
  throw Error("--repo names the scratch repository as OWNER/NAME.");
const GITHUB = values.repo ?? null;
const ROOT = path.resolve(values.root);
const HARNESS = { claude: "claude-code", codex: "codex", fake: "fake-cli" }[
  AGENT
];
const TAG = "nkp2";
const SPEC = `${TAG}-notes`;
const LABELS = {
  review: "nkp2:review",
  drafted: "nkp2:drafted",
  ask: "nkp2-ask",
  answering: "nkp2:answering",
};
// Two different models: the plan review counts only on a second one.
const MODELS = {
  claude: [
    process.env.NKP2_MODEL || "global.anthropic.claude-sonnet-5",
    process.env.NKP2_REVIEW_MODEL || "global.anthropic.claude-opus-5",
  ],
  codex: [
    process.env.NKP2_MODEL || "openai.gpt-5.6-luna",
    process.env.NKP2_REVIEW_MODEL || "openai.gpt-5.6",
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
  console.log(`[nk-p2] ${kind} ${JSON.stringify(data)}`);
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
  const { Store } = await import("../src/app/store.mjs");
  const store = new Store(DB);
  try {
    return await use(store);
  } finally {
    store.close();
  }
};
const operations = async (store) => {
  const { Operations } = await import("../src/app/operations.mjs");
  return new Operations(store, {
    workspaceRoot: P.ws,
    configDirectory: MACHINE.configDirectory,
  });
};

const CHECK = `// nk-p2 scratch check: each notes/*.txt holds one lowercase word and a newline.
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
const text = fs.readFileSync(0, "utf8");
// Name the model that served this run, as Claude Code's modelUsage does.
const model = process.argv[process.argv.indexOf("--model") + 1];
if (process.argv.includes("--model")) console.log(JSON.stringify({ modelUsage: { [model]: {} } }));
const write = (value) => { fs.mkdirSync(".avoozl", { recursive: true }); fs.writeFileSync(".avoozl/result.json", JSON.stringify(value)); };
const out = (name, body) => { fs.mkdirSync(".avoozl/output", { recursive: true }); fs.writeFileSync(".avoozl/output/" + name, body); write({ state: "done", output: name }); };
if (/You are an Avoozl Falsifier/.test(text)) write({ state: "done", report: { verdict: "stands", evidence: "check.mjs reads notes/.", confidence: "medium" } });
else if (/^You are the Avoozl Verifier/.test(text)) write({ state: "done", report: { checks: [{ command: "node check.mjs", exitCode: 0 }] } });
else if (/review\\.json/.test(text) && /plans_submit_review/.test(text)) {
  out("review.json", JSON.stringify({ findings: [], summary: "The plan adds one note." }));
} else if (/Answer this round's findings/.test(text)) write({ state: "done", report: { answers: [] } });
else if (/skip plans_create_plan/.test(text)) {
  fs.writeFileSync("requirements.md", "# Notes\\n\\nThe repository holds a note.\\n");
  fs.writeFileSync("design.md", "# Design\\n\\nOne file under notes/.\\n");
  fs.writeFileSync("tasks.md", "# Tasks\\n\\n- [ ] 1.1 Write notes/beta.txt\\n  - Facts:\\n    - repo: app\\n    - done:\\n      - notes/beta.txt holds beta and a newline, and node check.mjs prints ok.\\n    - checks: node check.mjs\\n");
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
  const binary =
    AGENT === "claude"
      ? process.env.NKP2_CLAUDE || which("claude")
      : process.env.NKP2_CODEX || which("codex");
  definition.start[0] = binary;
  definition.resume[0] = binary;
  return JSON.stringify(definition, null, 2) + "\n";
}

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; nk-p2 runs once on a fresh root.`);
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
  git(P.checkout, "config", "user.name", "nk-p2 Scratch");
  git(P.checkout, "config", "user.email", "nkp2@example.invalid");
  if (!fs.existsSync(path.join(P.checkout, "check.mjs"))) {
    git(P.checkout, "checkout", "-q", "-B", "main");
    fs.writeFileSync(
      path.join(P.checkout, "README.md"),
      "nk-p2 scratch repository.\n",
    );
    fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
    git(P.checkout, "add", ".");
    git(P.checkout, "commit", "-q", "-m", "Start the nk-p2 scratch repository");
    git(P.checkout, "push", "-q", "origin", "main");
  }
  cli("init", P.ws, "--name", "nk-p2");
  cli("workspace", "add", TAG, "--root", P.ws);
  const login = GITHUB ? JSON.parse(gh("api", "user")).login : null;
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const { ROLES } = await import("../src/app/chat-models.mjs");
  config.delivery = {
    ...(config.delivery || {}),
    concurrency: 2,
    retries: 1,
    investigate: { mode: "all", minConfidence: "high" },
  };
  config.planReview = { mode: "auto", rounds: 1 };
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
  const claude = process.env.NKP2_CLAUDE || which("claude");
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

// This machine's headless tick (R95.3): the supervisor, then one pass of
// avoozl's own `tickCatalog` (tick, drain, checks, notifications to the
// machine's sinks, and the Needs you items for anything that waits on Kiro
// Crew), every few seconds.
async function backend() {
  const { tickCatalog } = await import("../src/app/headless-tick.mjs");
  const { launchSupervisor } = await import("../src/app/supervisor.mjs");
  const env = agentEnv();
  const log = (line) =>
    fs.appendFileSync(P.backendLog, `${new Date().toISOString()} ${line}\n`);
  while (!fs.existsSync(path.join(ROOT, "stop-backend"))) {
    const sup = launchSupervisor({
      stateDirectory: MACHINE.stateDirectory,
      configDirectory: MACHINE.configDirectory,
      env,
    });
    if (sup.started) log(`supervisor started pid ${sup.pid}`);
    try {
      for (const result of await tickCatalog({
        stateDirectory: MACHINE.stateDirectory,
        configDirectory: MACHINE.configDirectory,
      }))
        if (
          result.errors?.length ||
          result.error ||
          result.notifications?.sinks?.some((s) => s.error)
        )
          log(JSON.stringify(result));
    } catch (error) {
      log(`tick failure ${error.message}`);
    }
    await sleep(3000);
  }
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

// What each role did on this harness, for the receipt (step 7): ran, or
// could not, with the supervisor's reason.
async function rolesOnHarness() {
  const { openSupervisorDatabase } = await import("../src/app/supervisor.mjs");
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

async function prove() {
  const { sandboxKind } = await import("../src/app/sandbox.mjs");
  if (AGENT !== "fake" && !sandboxKind())
    throw Error(
      "No sandbox here (inside another sandbox?). Run nk-p2 from a terminal outside Kiro Crew.",
    );
  if (
    AGENT !== "fake" &&
    fs.existsSync(path.join(os.homedir(), ".kiro", "crew"))
  )
    event("warning", {
      text: "~/.kiro/crew exists: run nk-p2 as a machine user with no Kiro Crew for the proof to count.",
    });
  await setup();
  let proxy = null;
  if (AGENT !== "fake") {
    proxy = spawn(
      process.execPath,
      [
        path.join(REPO_ROOT, "scripts", "live-proofs", "p57-model-proxy.mjs"),
        String(PROXY_PORT),
        P.proxyLog,
      ],
      { stdio: "ignore" },
    );
    await sleep(1000);
  }
  const out = fs.openSync(P.backendLog, "a");
  const backendProcess = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "--root",
      ROOT,
      "--agent",
      AGENT,
      ...(GITHUB ? ["--repo", GITHUB] : ["--offline"]),
      "--backend",
    ],
    { stdio: ["ignore", out, out], env: process.env },
  );
  fs.closeSync(out);
  const minutes = AGENT === "fake" ? 4 : 60;
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
      // This machine drives the spec: publish its journal here, then take it
      // over, each a person's act on the command line (R102.2, R102.13).
      cli("spec", "publish", SPEC, "--workspace", P.ws);
      cli("spec", "takeover", SPEC, "--workspace", P.ws);
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
    // (5) A review draft on a labeled pull request, and a reply to an issue.
    if (GITHUB) {
      git(P.checkout, "fetch", "-q", "origin");
      git(P.checkout, "checkout", "-q", "-B", "nkp2-change", "origin/main");
      fs.mkdirSync(path.join(P.checkout, "notes"), { recursive: true });
      fs.writeFileSync(path.join(P.checkout, "notes", "gamma.txt"), "gamma\n");
      git(P.checkout, "add", ".");
      git(P.checkout, "commit", "-q", "-m", "Add notes/gamma.txt");
      git(P.checkout, "push", "-q", "-u", "origin", "nkp2-change");
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
        "nkp2-change",
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
    const report = {
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
      `nk-p2 ${report.pass ? "PASS" : "FAIL"} on ${AGENT}${AGENT === "fake" ? " (fake agent: plumbing only, not the proof)" : ""}`,
    );
  } finally {
    await stopMachine({
      root: ROOT,
      backend: backendProcess,
      proxy,
      stateDirectory: MACHINE.stateDirectory,
    });
  }
}

if (values.backend) await backend();
else await prove();
