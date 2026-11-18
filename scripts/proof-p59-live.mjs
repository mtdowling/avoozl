#!/usr/bin/env node
// Proof P59 (R97, design §4.28): each role runs on either executor. One
// scenario runs once with every role pinned to `kirocrew` and once with
// every role pinned to `process`: a worker, its verifier, one review role,
// a New plan planner and a retro. The line watch has no session; it runs in
// the tick on both. The proof compares the result kinds the two runs record,
// and asks the read-only review role to try two writes.
//
// Everything lives under --root: a bare remote, its checkout and an Avoozl
// workspace.
//
//   process:  node scripts/proof-p59-live.mjs --executor process --root DIR [--agent claude|fake]
//     Runs the real tick, the app backend's drain and the machine supervisor
//     here, as P57 does, with an isolated Avoozl config and state home under
//     DIR (XDG_CONFIG_HOME, XDG_STATE_HOME). Claude Code is confined by
//     sandbox-exec and reaches only Bedrock through a loopback proxy, so it
//     runs from a terminal outside Kiro Crew. `--agent fake` checks this
//     script's plumbing only and never counts as the proof.
//   kirocrew: node scripts/proof-p59-live.mjs --executor kirocrew --root DIR --crew-home HOME setup|evaluate
//     Sets the scenario up in a throwaway test Kiro Crew's Avoozl (its home
//     is HOME, never the real one); that crew's own tick cron opens the chats.
//     `evaluate` reads what they recorded.
//
// No real workspace, Avoozl home, Claude Code home or Kiro Crew home is read
// or written.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO, "cli.mjs");
const CLAUDE =
  process.env.P59_CLAUDE ||
  spawnSync("command -v claude", {
    shell: true,
    encoding: "utf8",
  }).stdout.trim() ||
  "claude";
const MODEL = process.env.P59_MODEL || "global.anthropic.claude-sonnet-5";
const PROXY_PORT = Number(process.env.P59_PROXY_PORT || 18459);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    executor: { type: "string" },
    agent: { type: "string", default: "claude" },
    "crew-home": { type: "string" },
    tag: { type: "string" },
    "backend-for": { type: "string" },
  },
});
const EXECUTOR = values.executor;
if (!values.root || !["process", "kirocrew"].includes(EXECUTOR)) {
  console.error(
    "Usage: node scripts/proof-p59-live.mjs --executor process|kirocrew --root DIR [--agent claude|fake] [--crew-home HOME] [setup|evaluate]",
  );
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const AGENT = EXECUTOR === "process" ? values.agent : "kirocrew";
if (EXECUTOR === "process" && !["claude", "fake"].includes(AGENT))
  throw Error("--agent is claude or fake");
// Names differ per run: Kiro Crew keys a chat by its title.
const TAG = values.tag ?? (EXECUTOR === "process" ? "p59p" : "p59k");
if (!/^p59[a-z0-9]{1,6}$/.test(TAG))
  throw Error("--tag is p59 and 1-6 letters or digits.");
const TASK = `${TAG}-one`;
const PLAN = `${TAG}-plan`;
const NEW_PLAN = `${TAG}-notes-two`;
// The harness every pinnable role names (Settings › Models, R98.3).
const HARNESS =
  EXECUTOR === "kirocrew"
    ? "kirocrew"
    : AGENT === "claude"
      ? "claude-code"
      : "fake-cli";

// The isolated Avoozl home, set before any Avoozl module loads.
const HOME = path.join(ROOT, "home");
if (EXECUTOR === "process") {
  process.env.XDG_CONFIG_HOME = path.join(HOME, "config");
  process.env.XDG_STATE_HOME = path.join(HOME, "state");
  delete process.env.KIROCREW_HOME;
} else {
  const crew = values["crew-home"] && path.resolve(values["crew-home"]);
  const real = path.join(os.homedir(), ".kiro");
  if (!crew || crew === real || crew.startsWith(real + path.sep))
    throw Error("--crew-home must name a throwaway test crew's home.");
  if (!fs.existsSync(path.join(crew, "gateway.lock")))
    throw Error(`${crew} is not a Kiro Crew home.`);
  process.env.KIROCREW_HOME = crew;
}
const P = {
  origin: path.join(ROOT, "origin.git"),
  checkout: path.join(ROOT, "app"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  claudeConfig: path.join(ROOT, "claude-config"),
  outside: path.join(ROOT, "ro-outside.txt"),
  report: path.join(ROOT, "report.json"),
  events: path.join(ROOT, "events.jsonl"),
  proxyLog: path.join(ROOT, "proxy.log"),
  backendLog: path.join(ROOT, "backend.log"),
};
const DB = path.join(P.ws, ".avoozl", "local", "workspace.sqlite");

const { machineAvoozlPaths } = await import("../src/app/host-config.mjs");
const MACHINE = machineAvoozlPaths();
if (EXECUTOR === "process")
  for (const dir of [MACHINE.configDirectory, MACHINE.stateDirectory])
    if (!dir.startsWith(HOME + path.sep)) throw Error(`Not isolated: ${dir}`);
if (
  EXECUTOR === "kirocrew" &&
  !MACHINE.configDirectory.startsWith(process.env.KIROCREW_HOME + path.sep)
)
  throw Error(`Not the test crew's Avoozl: ${MACHINE.configDirectory}`);

const event = (kind, data = {}) => {
  const line = { at: new Date().toISOString(), kind, ...data };
  fs.mkdirSync(ROOT, { recursive: true });
  fs.appendFileSync(P.events, JSON.stringify(line) + "\n");
  console.log(`[p59] ${kind} ${JSON.stringify(data)}`);
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const cli = (...args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: process.env,
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHECK = `// P59 scratch check: each notes/*.txt holds one lowercase word and a newline.
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

// The review role's focus: its bar, then the read-only test (R94.4).
const FOCUS = `notes/one.txt is one lowercase word. Sandbox test: try once with your own tools to create P59-RO-PROBE here and at ${P.outside}; never retry or work around a refusal. Add an observation on notes/one.txt saying if each write worked.`;
if (FOCUS.length > 300) throw Error("The review focus is over 300 characters.");

// The fake agent (plumbing only): each role's result file, by its brief.
const FAKE_AGENT = `import fs from "node:fs";
const text = fs.readFileSync(0, "utf8");
const done = (report) => { fs.mkdirSync(".avoozl", { recursive: true }); fs.writeFileSync(".avoozl/result.json", JSON.stringify({ state: "done", ...(report ? { report } : { text: "Done." }) })); };
const checks = (/Declared checks: (.+)/.exec(text)?.[1] ?? "none").split("; ").filter((c) => c !== "none").map((command) => ({ command, exitCode: 0 }));
if (/^You are the Avoozl Verifier/.test(text)) done({ verdict: "approved", text: "fake verifier", ...(checks.length ? { checks } : {}) });
else if (/^You are an Avoozl Reviewer/.test(text)) {
  const tries = [["P59-RO-PROBE", "here"], [${JSON.stringify(P.outside)}, "outside"]].map(([f, w]) => { try { fs.writeFileSync(f, "x"); return w + " ALLOWED"; } catch (e) { return w + " REFUSED " + e.code; } });
  done({ verdict: "approved", findings: [{ id: "F1", kind: "observation", paths: ["notes/one.txt"], text: tries.join("; ") }], closures: [] });
} else if (/"report": <the reply object>/.test(text)) done({ bottleneck: { stage: "code", evidence: "fake retro" }, proposals: [] });
else if (/skip plans_create_plan/.test(text)) { /* the planner writes no spec in plumbing runs */ }
else { fs.mkdirSync("notes", { recursive: true }); fs.writeFileSync("notes/one.txt", "alpha\\n"); done(); }
`;

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; P59 runs once on a fresh root.`);
  for (const dir of [ROOT, P.wt, P.claudeConfig])
    fs.mkdirSync(dir, { recursive: true });
  event("setup.start", {
    root: ROOT,
    executor: EXECUTOR,
    agent: AGENT,
    repo: git(REPO, "rev-parse", "HEAD"),
    avoozlHome: MACHINE.configDirectory,
  });

  git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
  git(ROOT, "clone", "-q", P.origin, P.checkout);
  git(P.checkout, "config", "user.name", "P59 Scratch");
  git(P.checkout, "config", "user.email", "p59@example.invalid");
  fs.writeFileSync(
    path.join(P.checkout, "README.md"),
    "P59 scratch repository.\n",
  );
  fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
  git(P.checkout, "add", ".");
  git(P.checkout, "commit", "-q", "-m", "Start the P59 scratch repository");
  git(P.checkout, "push", "-q", "origin", "main");

  cli("init", P.ws, "--name", `P59 ${EXECUTOR}`);
  cli("workspace", "add", TAG, "--root", P.ws);
  // The test crew's app backend serves the catalog's default workspace.
  if (EXECUTOR === "kirocrew") cli("workspace", "set-default", TAG);
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  config.delivery = {
    ...(config.delivery || {}),
    concurrency: 2,
    retries: 1,
    ...(EXECUTOR === "process" ? { model: MODEL } : {}),
    // The falsifier has no `process` path yet; P59 records it separately.
    investigate: { mode: "off" },
    reviewers: [
      {
        id: "docs",
        focus: FOCUS,
        agent: "avoozl-reviewer",
        distinctFrom: "session",
      },
    ],
  };
  // Every role Settings › Models can pin, pinned to this run's executor.
  config.harnesses = { worker: HARNESS, planner: HARNESS, retro: HARNESS };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

  let name = HARNESS;
  if (EXECUTOR === "process") {
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
      // Bedrock sign-in, as in P57: only the short-lived credentials pass
      // the sandbox's environment filter.
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
        name,
        start: argv,
        resume: argv,
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
    const { sandboxKind } = await import("../src/app/sandbox.mjs");
    if (AGENT === "fake" && !sandboxKind())
      fs.writeFileSync(
        path.join(MACHINE.configDirectory, "harness-unconfined.json"),
        JSON.stringify({ [name]: hash }),
      );
    event("setup.harness", { name, hash });
  }

  const { Store } = await import("../src/app/store.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const { digest } = await import("../src/model.mjs");
  const { takeOverSpec } = await import("../src/app/spec-takeover.mjs");
  const store = new Store(DB);
  try {
    const data = store.read();
    store.importSnapshot({
      ...data,
      tasks: [
        {
          id: TASK,
          title: "Write notes/one.txt",
          kind: "leaf",
          scope: TAG,
          status: "planned",
          epic: TAG,
          track: TAG,
          tags: [],
          // A bar in prose: Avoozl opens a verifier session (needsJudgment).
          verify: "agent",
          acceptance: [
            "Create notes/one.txt containing the word alpha and a newline, and nothing else.",
            "Run `node check.mjs` before you finish; it must print ok.",
          ],
          repository: "app",
          planId: PLAN,
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
      ...(EXECUTOR === "process"
        ? {
            executor: "process",
            harness: name,
            sandbox: {
              writeRoots: [P.claudeConfig],
              allowCommands: [["node", "check.mjs"]],
              network: [`localhost:${PROXY_PORT}`],
            },
          }
        : {}),
    });
    // Installed approved, as P57's chain: this isolated workspace's
    // approval is the operator's run.
    store.put("plans", {
      id: PLAN,
      kind: "plan",
      spec: PLAN,
      title: "P59 roles",
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
    // The planner and the retro, each asked for as a person asks.
    const ops = new Operations(store, { workspaceRoot: P.ws });
    const planned = await ops.execute("plan.new", {
      name: NEW_PLAN,
      goal: "Add notes/two.txt containing the word beta and a newline. One task; its check is node check.mjs.",
      repositories: ["app"],
    });
    event("setup.plan-new", { name: planned.name, folder: planned.folder });
    await ops.execute("flow.retro.start", {});
    event("setup.retro-start");
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

// One app backend, as P57's: the tick the cron runs, then the drain.
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
    if (fs.existsSync(path.join(ROOT, "stop-backend"))) break;
    await sleep(3000);
  }
  log("backend stop");
  store.close();
}

// What the workspace (and, for `process`, the supervisor) says now.
async function snapshotState() {
  const { Store } = await import("../src/app/store.mjs");
  const store = new Store(DB);
  let children = [];
  if (EXECUTOR === "process") {
    const { openSupervisorDatabase } = await import(
      "../src/app/supervisor.mjs"
    );
    const db = openSupervisorDatabase(MACHINE.stateDirectory);
    try {
      children = db
        .prepare(
          "SELECT session_id, task, role, state, exit_code, runs, result, error, worktree FROM children ORDER BY requested_at",
        )
        .all();
    } finally {
      db.close();
    }
  }
  try {
    const delivery = store.get("task_deliveries", TASK);
    return {
      delivery: delivery && {
        state: delivery.state,
        commit: delivery.commit,
        integratedCommit: delivery.integratedCommit,
        attempts: delivery.attempts.map((a) => ({
          attempt: a.attempt,
          outcome: a.outcome,
          cause: a.cause,
          commit: a.commit,
        })),
        verifications: (delivery.verifications || []).map((v) => ({
          role: v.role,
          attempt: v.attempt,
          outcome: v.outcome,
          verdict: v.verdict,
          commit: v.commit,
          text: v.text,
          findings: v.findings,
        })),
      },
      bindings: store.list("session_bindings").map((b) => ({
        slot: b.slot,
        task: b.taskId,
        role: b.role,
        attempt: b.attempt,
        executor: b.executor ?? "kirocrew",
        permissionClass: b.permissionClass ?? null,
        status: b.status,
        report: b.report
          ? {
              kind: b.report.kind,
              commit: b.report.commit,
              verdict: b.report.verdict,
              text: b.report.text,
              findings: b.report.findings,
            }
          : null,
      })),
      requests: store.list("session_requests").map((r) => ({
        task: r.task,
        role: r.role,
        executor: r.executor,
        state: r.state,
      })),
      retros: store.list("flow_retros").map((r) => ({
        id: r.id,
        state: r.state,
        bottleneck: r.bottleneck,
        proposals: (r.proposals || []).length,
        error: r.error,
      })),
      plans: store.list("plans").map((p) => ({
        id: p.id,
        state: p.state,
        spec: p.spec,
        revision: p.revision,
      })),
      newPlans: store.getMeta("newPlans"),
      children,
      originLog: git(P.origin, "log", "--format=%h %s", "main"),
      outsideProbe: fs.existsSync(P.outside),
      checkoutProbe: fs.existsSync(path.join(P.checkout, "P59-RO-PROBE")),
      worktreeProbes: fs.existsSync(P.wt)
        ? fs
            .readdirSync(P.wt)
            .filter((n) => fs.existsSync(path.join(P.wt, n, "P59-RO-PROBE")))
        : [],
      specFolder: fs.existsSync(
        path.join(P.checkout, ".kiro", "specs", NEW_PLAN),
      )
        ? fs.readdirSync(path.join(P.checkout, ".kiro", "specs", NEW_PLAN))
        : fs.existsSync(path.join(P.ws, ".kiro", "specs", NEW_PLAN))
          ? fs
              .readdirSync(path.join(P.ws, ".kiro", "specs", NEW_PLAN))
              .map((f) => `ws:${f}`)
          : null,
    };
  } finally {
    store.close();
  }
}

// The result kind each role recorded, as the comparison reads it.
function resultKinds(state) {
  const of = (role) => state.bindings.filter((b) => b.role === role);
  const worker = of("worker").find((b) => b.report);
  const verifications = state.delivery?.verifications || [];
  const verifier = verifications.find((v) => !v.role || v.role === "checks");
  const verifierBinding = of("verifier").find((b) => b.report);
  const review = of("review:docs").find((b) => b.report);
  const reviewed = verifications.find((v) => v.role === "docs");
  const retro = state.retros[0];
  const draft = state.plans.find((p) => p.id === NEW_PLAN);
  return {
    worker: {
      executor: of("worker")[0]?.executor ?? null,
      kind: worker?.report.kind ?? null,
      commit: Boolean(worker?.report.commit),
      landed: state.delivery?.state === "integrated",
    },
    verifier: {
      executor: of("verifier")[0]?.executor ?? null,
      permissionClass: of("verifier")[0]?.permissionClass ?? null,
      kind: verifierBinding?.report.kind ?? null,
      verdict: verifier?.verdict ?? verifierBinding?.report.verdict ?? null,
      outcome: verifier?.outcome ?? null,
    },
    reviewer: {
      executor: of("review:docs")[0]?.executor ?? null,
      permissionClass: of("review:docs")[0]?.permissionClass ?? null,
      kind: review?.report.kind ?? null,
      verdict: reviewed?.verdict ?? null,
      outcome: reviewed?.outcome ?? null,
      findings: (reviewed?.findings || []).map((f) => `${f.kind}: ${f.text}`),
    },
    planner: {
      executor: of("planner")[0]?.executor ?? null,
      kind: draft ? `plan ${draft.state}` : null,
      specFolder: state.specFolder,
    },
    retro: {
      executor: of("retro")[0]?.executor ?? null,
      permissionClass: of("retro")[0]?.permissionClass ?? null,
      kind: retro ? `retro ${retro.state}` : null,
      bottleneck: retro?.bottleneck?.stage ?? null,
    },
    readOnly: {
      outsideWritten: state.outsideProbe,
      checkoutWritten: state.checkoutProbe,
      worktreeWritten: state.worktreeProbes,
    },
  };
}

const finished = (state) => {
  const k = resultKinds(state);
  const closed = (role) =>
    state.bindings.some((b) => b.role === role && b.status === "closed");
  return (
    k.worker.landed &&
    k.verifier.kind &&
    k.reviewer.kind &&
    (k.planner.kind || closed("planner")) &&
    k.retro.kind &&
    k.retro.kind !== "retro running"
  );
};

async function until(
  what,
  check,
  { timeoutMs = 60 * 60_000, everyMs = 5000 } = {},
) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const state = await snapshotState();
    if (check(state)) return state;
    if (Date.now() > end) {
      event("timeout", { what, kinds: resultKinds(state) });
      return state;
    }
    await sleep(everyMs);
  }
}

function startBackend(seconds) {
  const out = fs.openSync(P.backendLog, "a");
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "--executor",
      EXECUTOR,
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

async function evaluate() {
  const state = await snapshotState();
  const kinds = resultKinds(state);
  fs.writeFileSync(
    P.report,
    JSON.stringify({ executor: EXECUTOR, agent: AGENT, kinds, state }, null, 2),
  );
  event("report", { file: P.report, kinds });
  return kinds;
}

async function proveProcess() {
  const { sandboxKind } = await import("../src/app/sandbox.mjs");
  if (AGENT === "claude" && !sandboxKind())
    throw Error(
      "sandbox-exec cannot run here (inside another sandbox?). Run P59 from a terminal outside Kiro Crew.",
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
  try {
    await until("every role to finish", finished);
    // A closed planner's folder is imported by a later tick.
    await sleep(30_000);
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
    const kinds = await evaluate();
    console.log(JSON.stringify(kinds, null, 2));
  }
}

// The test crew's approval cards for this run's chats, answered as the
// person at the dashboard would (kirocrew only): every tool call is
// approved except a write the read-only test asked for, which is refused.
// Reads the harness's saved sign-in cookie; mints no token.
async function approver() {
  const port = Number(process.env.P59_CREW_PORT || 5698);
  const cookies = path.join(
    path.dirname(process.env.KIROCREW_HOME),
    "cookies.txt",
  );
  if (!fs.existsSync(cookies)) throw Error(`No sign-in cookie at ${cookies}.`);
  const api = (method, route, body) => {
    const out = execFileSync(
      "curl",
      [
        "-sS",
        "-X",
        method,
        "-b",
        cookies,
        "-c",
        cookies,
        "-H",
        `Origin: http://localhost:${port}`,
        "-H",
        "Content-Type: application/json",
        `http://localhost:${port}${route}`,
        ...(body ? ["-d", JSON.stringify(body)] : []),
      ],
      { encoding: "utf8" },
    );
    try {
      return JSON.parse(out);
    } catch {
      return { raw: out.slice(0, 300) };
    }
  };
  const ours = (key) =>
    key.includes(TAG) || /^avoozl_retro-\d+_retro/.test(key);
  const seen = new Set();
  while (!fs.existsSync(path.join(ROOT, "stop-approver"))) {
    for (const slot of api("GET", "/api/chat/slots")) {
      const pending = slot.pending_approval_info;
      if (!pending || pending.origin !== "native" || !ours(slot.key)) continue;
      const id = `${slot.key}#${pending.request_mid}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const asked = `${pending.tool} ${pending.tool_input}`;
      const write = /P59-RO-PROBE|ro-outside/.test(asked);
      const action = write ? "rejected" : "approved";
      const reply = api(
        "POST",
        `/api/chat/slots/${encodeURIComponent(slot.key)}/approve`,
        {
          action,
          origin: "native",
          request_id: pending.request_id,
          request_mid: pending.request_mid,
        },
      );
      event("approver", {
        slot: slot.key,
        action,
        tool: pending.tool.slice(0, 200),
        input: String(pending.tool_input).slice(0, 300),
        reply: JSON.stringify(reply).slice(0, 200),
      });
    }
    await sleep(3000);
  }
}

const command = positionals[0] ?? (EXECUTOR === "process" ? "prove" : null);
if (command === "backend") await backend(Number(values["backend-for"] || 600));
else if (command === "approver" && EXECUTOR === "kirocrew") await approver();
else if (command === "setup") await setup();
else if (command === "evaluate")
  console.log(JSON.stringify(await evaluate(), null, 2));
else if (command === "prove" && EXECUTOR === "process") await proveProcess();
else
  throw Error(
    "Name setup or evaluate for kirocrew; process runs with no command.",
  );
