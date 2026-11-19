#!/usr/bin/env node
// Proof nk-p1 (without-kirocrew NK1, NK2, design D2): investigate first with
// no Kiro Crew chat. Two tasks, investigate first on, every role on the
// `process` executor. The tick runs; each worker reports findings and each
// falsifier gives a verdict. A person presses Go ahead on one task and
// Investigate again on the other, which investigates again and then goes
// ahead. Both land. Every session must have executor `process`, and no
// request for `kirocrew` may be written.
//
// The gate lets a sure worker and a sure falsifier go ahead with no person
// (R75.3), and Avoozl has no setting that always asks. So this script's
// backend holds every gate pass for a person, before the tick can send it:
// each round waits for the decision the proof presses. The held rounds are
// listed in the report. Avoozl's own gate is unchanged.
//
// Everything lives under --root: a bare remote, its checkout, an Avoozl
// workspace and an isolated Avoozl config and state home (XDG_CONFIG_HOME,
// XDG_STATE_HOME). As in P59, Claude Code is confined by sandbox-exec and
// reaches only Bedrock through a loopback proxy, so it runs from a terminal
// outside Kiro Crew.
//
//   node scripts/proof-nk-p1-live.mjs --root DIR [--agent claude|fake]
//
// `--agent fake` checks this script's plumbing only and never counts as the
// proof. No real workspace, Avoozl home, Claude Code home or Kiro Crew home
// is read or written.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO, "cli.mjs");
const CLAUDE =
  process.env.NKP1_CLAUDE ||
  spawnSync("command -v claude", {
    shell: true,
    encoding: "utf8",
  }).stdout.trim() ||
  "claude";
const MODEL = process.env.NKP1_MODEL || "global.anthropic.claude-sonnet-5";
const PROXY_PORT = Number(process.env.NKP1_PROXY_PORT || 18461);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    agent: { type: "string", default: "claude" },
    "backend-for": { type: "string" },
  },
});
if (!values.root) {
  console.error(
    "Usage: node scripts/proof-nk-p1-live.mjs --root DIR [--agent claude|fake]",
  );
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const AGENT = values.agent;
if (!["claude", "fake"].includes(AGENT))
  throw Error("--agent is claude or fake");
const HARNESS = AGENT === "claude" ? "claude-code" : "fake-cli";
const TAG = "nkp1";
const PLAN = `${TAG}-plan`;
// The task a person sends ahead, and the one they send back once.
const GO = `${TAG}-go`;
const AGAIN = `${TAG}-again`;

// The isolated Avoozl home, set before any Avoozl module loads.
const HOME = path.join(ROOT, "home");
process.env.XDG_CONFIG_HOME = path.join(HOME, "config");
process.env.XDG_STATE_HOME = path.join(HOME, "state");
delete process.env.KIROCREW_HOME;
for (const key of Object.keys(process.env))
  if (/^KIROCREW_/.test(key)) delete process.env[key];

const P = {
  origin: path.join(ROOT, "origin.git"),
  checkout: path.join(ROOT, "app"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  claudeConfig: path.join(ROOT, "claude-config"),
  report: path.join(ROOT, "report.json"),
  events: path.join(ROOT, "events.jsonl"),
  proxyLog: path.join(ROOT, "proxy.log"),
  backendLog: path.join(ROOT, "backend.log"),
};
const DB = path.join(P.ws, ".avoozl", "local", "workspace.sqlite");

const { machineAvoozlPaths } = await import("../src/app/host-config.mjs");
const MACHINE = machineAvoozlPaths();
for (const dir of [MACHINE.configDirectory, MACHINE.stateDirectory])
  if (!dir.startsWith(HOME + path.sep)) throw Error(`Not isolated: ${dir}`);

const event = (kind, data = {}) => {
  const line = { at: new Date().toISOString(), kind, ...data };
  fs.mkdirSync(ROOT, { recursive: true });
  fs.appendFileSync(P.events, JSON.stringify(line) + "\n");
  console.log(`[nk-p1] ${kind} ${JSON.stringify(data)}`);
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const cli = (...args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: process.env,
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHECK = `// nk-p1 scratch check: each notes/*.txt holds one lowercase word and a newline.
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
console.log("ok");
`;

// The fake agent (plumbing only). A worker writes findings first and code
// on Go ahead; a falsifier gives a verdict. Both are sure, so the gate
// would pass on its own, as it did for Claude Code: the hold must catch it.
const FAKE_AGENT = `import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
const write = (value) => { fs.mkdirSync(".avoozl", { recursive: true }); fs.writeFileSync(".avoozl/result.json", JSON.stringify(value)); };
const findings = { read: "check.mjs and notes/", cause: "notes/ has no file yet", plan: "add the one note file", check: "node check.mjs prints ok", confidence: "high" };
if (/You are an Avoozl Falsifier/.test(text)) write({ state: "done", report: { verdict: "stands", evidence: "check.mjs reads every notes/*.txt.", confidence: "high" } });
else if (/^Go ahead/.test(text)) {
  const word = /notes\\/(\\w+)\\.txt/.exec(text)?.[1] ?? "one";
  fs.mkdirSync("notes", { recursive: true });
  fs.writeFileSync("notes/" + word + ".txt", word.replace(/[^a-z]/g, "") + "\\n");
  write({ state: "done", text: "Wrote the note." });
} else if (/"state": "findings"/.test(text) || /^Investigate again/.test(text)) write({ state: "findings", report: findings });
`;

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; nk-p1 runs once on a fresh root.`);
  for (const dir of [ROOT, P.wt, P.claudeConfig])
    fs.mkdirSync(dir, { recursive: true });
  event("setup.start", {
    root: ROOT,
    agent: AGENT,
    repo: git(REPO, "rev-parse", "HEAD"),
    avoozlHome: MACHINE.configDirectory,
  });
  git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
  git(ROOT, "clone", "-q", P.origin, P.checkout);
  git(P.checkout, "config", "user.name", "nk-p1 Scratch");
  git(P.checkout, "config", "user.email", "nkp1@example.invalid");
  fs.writeFileSync(
    path.join(P.checkout, "README.md"),
    "nk-p1 scratch repository.\n",
  );
  fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
  git(P.checkout, "add", ".");
  git(P.checkout, "commit", "-q", "-m", "Start the nk-p1 scratch repository");
  git(P.checkout, "push", "-q", "origin", "main");

  cli("init", P.ws, "--name", "nk-p1");
  cli("workspace", "add", TAG, "--root", P.ws);
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  config.delivery = {
    ...(config.delivery || {}),
    concurrency: 2,
    retries: 1,
    model: MODEL,
    // Investigate first on every task (R75), with the falsifier's verdict
    // needing a person unless both are sure.
    // A person decides every round, so steps 2a and 2b test Go ahead and
    // Investigate again however sure the agents are.
    investigate: { mode: "all", minConfidence: "ask" },
  };
  // Every role on this machine's harness (Settings › Models, R98.6).
  const { ROLES } = await import("../src/app/chat-models.mjs");
  config.roles = Object.fromEntries(
    ROLES.map((role) => [role, { harness: HARNESS }]),
  );
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

  const { approveHarnessDefinition, harnessDefinitionHash } = await import(
    "../src/app/harness-definitions.mjs"
  );
  const harnesses = path.join(MACHINE.configDirectory, "harnesses");
  fs.mkdirSync(harnesses, { recursive: true });
  let bytes;
  if (AGENT === "claude") {
    const definition = JSON.parse(
      fs.readFileSync(
        path.join(REPO, "examples", "harnesses", "claude-code.json"),
        "utf8",
      ),
    );
    // Bedrock sign-in, as in P57 and P59.
    definition.keepEnv = [
      ...definition.keepEnv,
      "AWS_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
    ];
    definition.start[0] = CLAUDE;
    definition.resume[0] = CLAUDE;
    bytes = JSON.stringify(definition, null, 2) + "\n";
  } else {
    fs.writeFileSync(path.join(ROOT, "fake-agent.mjs"), FAKE_AGENT);
    const argv = [process.execPath, path.join(ROOT, "fake-agent.mjs")];
    bytes = JSON.stringify({
      name: HARNESS,
      start: argv,
      resume: argv,
      promptFrom: "stdin",
      model: ["--model", "{model}"],
      permission: { write: "workspace-write", read: "read-only" },
      writeRoots: ["{worktree}", "{tmp}", "{project_cache_dirs}"],
      resultAllow: ["--result-file"],
    });
  }
  fs.writeFileSync(path.join(harnesses, `${HARNESS}.json`), bytes);
  const hash = harnessDefinitionHash(Buffer.from(bytes));
  approveHarnessDefinition({
    configDirectory: MACHINE.configDirectory,
    name: HARNESS,
    hash,
  });
  const { sandboxKind } = await import("../src/app/sandbox.mjs");
  if (AGENT === "fake" && !sandboxKind())
    fs.writeFileSync(
      path.join(MACHINE.configDirectory, "harness-unconfined.json"),
      JSON.stringify({ [HARNESS]: hash }),
    );
  event("setup.harness", { name: HARNESS, hash });

  const { Store } = await import("../src/app/store.mjs");
  const { digest } = await import("../src/model.mjs");
  const { takeOverSpec } = await import("../src/app/spec-takeover.mjs");
  const store = new Store(DB);
  try {
    const task = (id, word) => ({
      id,
      title: `Write notes/${word}.txt`,
      kind: "leaf",
      scope: TAG,
      status: "planned",
      epic: TAG,
      track: TAG,
      tags: [],
      acceptance: [
        `Create notes/${word}.txt containing the word ${word} and a newline, and nothing else.`,
        "Run `node check.mjs` before you finish; it must print ok.",
      ],
      checks: ["node check.mjs"],
      repository: "app",
      planId: PLAN,
    });
    store.importSnapshot({
      ...store.read(),
      tasks: [task(GO, "alpha"), task(AGAIN, "beta")],
      edges: [],
    });
    store.put("projects", {
      id: "app",
      root: fs.realpathSync.native(P.checkout),
      baseBranch: "main",
      landing: "direct",
      checks: [["node", "check.mjs"]],
      worktreeRoot: P.wt,
      executor: "process",
      harness: HARNESS,
      sandbox: {
        writeRoots: [P.claudeConfig],
        allowCommands: [
          ["node", "check.mjs"],
          ["git", "rev-parse"],
          ["git", "diff"],
          ["git", "status"],
          ["git", "log"],
        ],
        network: [`localhost:${PROXY_PORT}`],
      },
    });
    // Installed approved, as P59's: this isolated workspace's approval is
    // the operator's run.
    store.put("plans", {
      id: PLAN,
      kind: "plan",
      spec: PLAN,
      title: "nk-p1 investigate first",
      hash: digest(`plan ${PLAN}`),
      revision: 1,
      state: "approved",
    });
    store.put("receipts", {
      id: `spec-journal:${PLAN}`,
      kind: "spec-journal",
      planId: PLAN,
      home: "local",
    });
    await takeOverSpec(store, { workspaceRoot: P.ws, actor: "Operator" }, PLAN);
  } finally {
    store.close();
  }
  event("setup.done");
}

function agentEnv() {
  const env = { ...process.env };
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
    PATH: `${path.dirname(CLAUDE)}:${env.PATH}`,
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

// The headless tick a machine with no Kiro Crew runs: the tick, the drain
// of `process` requests, the checks, and the messages the tick owes its
// children (Go ahead, Investigate again).
async function backend(seconds) {
  const { Store } = await import("../src/app/store.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const { prepareWorktree } = await import("../src/app/delivery.mjs");
  const { drainProcessRequests } = await import(
    "../src/app/executors/process.mjs"
  );
  const { drainCheckRuns } = await import("../src/app/check-runs.mjs");
  const { launchSupervisor } = await import("../src/app/supervisor.mjs");
  const store = new Store(DB);
  const ops = new Operations(store, {
    workspaceRoot: P.ws,
    configDirectory: MACHINE.configDirectory,
  });
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
    try {
      const tick = await ops.execute("workspace.tick", { cron: true });
      if (tick.dispatch?.length)
        log(
          `tick dispatch ${JSON.stringify(tick.dispatch.map((d) => [d.task, d.role, d.executor]))}`,
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
    try {
      for (const held of holdForPerson(store))
        log(`held gate pass for ${held.task} round ${held.round}`);
    } catch (error) {
      log(`hold failure ${error.message}`);
    }
    if (fs.existsSync(path.join(ROOT, "stop-backend"))) break;
    await sleep(3000);
  }
  log("backend stop");
  store.close();
}

// A gate pass (both sure, the findings stand) turns back into a decision a
// person makes. Only the drain records a falsifier's reply and only the
// tick sends Go ahead, and this runs between them, so no pass is sent.
function holdForPerson(store) {
  return store.transaction(() => {
    const held = [];
    for (const row of store.list("task_investigations")) {
      if (row.state !== "go" || row.decidedBy !== "gate" || row.message?.sentAt)
        continue;
      const { message, decidedBy, gateAt, ...rest } = row;
      store.put("task_investigations", { ...rest, state: "needs-you" });
      held.push({ task: row.taskId, round: row.rounds.at(-1).n, gateAt });
    }
    if (held.length)
      store.setMeta("nkp1.held", [
        ...(store.getMeta("nkp1.held") ?? []),
        ...held,
      ]);
    return held;
  });
}

async function snapshotState() {
  const { Store } = await import("../src/app/store.mjs");
  const store = new Store(DB);
  try {
    const of = (id) => {
      const row = store.get("task_investigations", id);
      return {
        state: row?.state ?? null,
        rounds: (row?.rounds ?? []).map((round) => ({
          n: round.n,
          findings: Boolean(round.findings),
          verdict: round.reply?.verdict ?? null,
          decision: round.decision ?? null,
        })),
        delivery: store.get("task_deliveries", id)?.state ?? null,
      };
    };
    return {
      tasks: { [GO]: of(GO), [AGAIN]: of(AGAIN) },
      bindings: store.list("session_bindings").map((b) => ({
        slot: b.slot,
        task: b.taskId,
        role: b.role,
        executor: b.executor ?? "kirocrew",
        status: b.status,
      })),
      requests: store.list("session_requests").map((r) => ({
        kind: r.kind,
        role: r.request?.role ?? null,
        executor: r.executor,
        state: r.state,
      })),
      decided: store.getMeta("nkp1.decided") ?? {},
      held: store.getMeta("nkp1.held") ?? [],
    };
  } finally {
    store.close();
  }
}

// What a person presses in Needs you: Go ahead on one task; Investigate
// again once on the other, then Go ahead.
async function decide(state) {
  const { Store } = await import("../src/app/store.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const store = new Store(DB);
  try {
    const ops = new Operations(store, { workspaceRoot: P.ws });
    const decided = store.getMeta("nkp1.decided") ?? {};
    for (const id of [GO, AGAIN]) {
      if (state.tasks[id].state !== "needs-you") continue;
      const action = id === AGAIN && !decided[id] ? "again" : "go";
      await ops.execute(
        "investigation.decide",
        { taskId: id, action },
        undefined,
        { local: true },
      );
      decided[id] = [...(decided[id] ?? []), action];
      store.setMeta("nkp1.decided", decided);
      event("decide", { task: id, action });
    }
  } finally {
    store.close();
  }
}

function verdict(state) {
  const go = state.tasks[GO],
    again = state.tasks[AGAIN];
  const expected = {
    "1 each worker reported findings and each falsifier a verdict": [
      go,
      again,
    ].every(
      (t) => t.rounds.length && t.rounds.every((r) => r.findings && r.verdict),
    ),
    "2a the Go ahead task landed after one Go ahead":
      go.delivery === "integrated" &&
      (state.decided[GO] ?? []).join() === "go" &&
      go.rounds.map((r) => r.decision).join() === "go",
    "2b the other investigated again, then landed":
      again.delivery === "integrated" &&
      again.rounds.length >= 2 &&
      (state.decided[AGAIN] ?? []).join() === "again,go" &&
      again.rounds.map((r) => r.decision).join() === "again,go",
    "3a every session ran on process":
      state.bindings.length > 0 &&
      state.bindings.every((b) => b.executor === "process"),
    "3b no kirocrew request was written": state.requests.every(
      (r) => r.executor !== "kirocrew",
    ),
  };
  return { pass: Object.values(expected).every(Boolean), expected };
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

async function prove() {
  const { sandboxKind } = await import("../src/app/sandbox.mjs");
  if (AGENT === "claude" && !sandboxKind())
    throw Error(
      "sandbox-exec cannot run here (inside another sandbox?). Run nk-p1 from a terminal outside Kiro Crew.",
    );
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
  const backendProcess = startBackend(90 * 60);
  event("backend.start", { pid: backendProcess.pid });
  let state;
  try {
    const end = Date.now() + (AGENT === "fake" ? 5 : 80) * 60_000;
    for (;;) {
      state = await snapshotState();
      await decide(state);
      if (verdict(state).pass || Date.now() > end) break;
      if (Object.values(state.tasks).every((t) => t.delivery === "integrated"))
        break;
      await sleep(5000);
    }
  } finally {
    fs.writeFileSync(path.join(ROOT, "stop-backend"), "");
    await sleep(5000);
    backendProcess.kill("SIGTERM");
    if (proxy) proxy.kill("SIGTERM");
    try {
      const { runningSupervisor } = await import("../src/app/supervisor.mjs");
      const sup = runningSupervisor(MACHINE.stateDirectory, {});
      if (sup?.pid) process.kill(sup.pid, "SIGTERM");
    } catch {}
    state = await snapshotState();
    const result = {
      agent: AGENT,
      repo: git(REPO, "rev-parse", "HEAD"),
      ...verdict(state),
      state,
    };
    fs.writeFileSync(P.report, JSON.stringify(result, null, 2));
    event("report", {
      file: P.report,
      pass: result.pass,
      expected: result.expected,
    });
    console.log(
      `nk-p1 ${result.pass ? "PASS" : "FAIL"}${AGENT === "fake" ? " (fake agent: plumbing only, not the proof)" : ""}`,
    );
  }
}

const command = positionals[0] ?? "prove";
if (command === "backend") await backend(Number(values["backend-for"] || 600));
else if (command === "prove") await prove();
else throw Error("Run with no command, or `backend`.");
