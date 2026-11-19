// Shared steps for the live proofs that run Avoozl as a machine of its own
// under a temporary HOME. Avoozl's modules are imported only when called, so
// a script sets XDG_CONFIG_HOME and XDG_STATE_HOME first.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { claudeBinaries } from "./real-claude.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The machine's Avoozl folders, refused unless both are under `home`.
export async function isolatedMachine(home) {
  const { machineAvoozlPaths } = await import(
    "../../src/app/settings/host-config.mjs"
  );
  const machine = machineAvoozlPaths();
  for (const dir of [machine.configDirectory, machine.stateDirectory])
    if (!dir.startsWith(home + path.sep)) throw Error(`Not isolated: ${dir}`);
  return machine;
}

// Write and approve a harness definition. With `unconfined`, a host with no
// sandbox runs it anyway (the fake agent only). Returns its hash.
export async function installHarness(
  configDirectory,
  name,
  bytes,
  { unconfined = false } = {},
) {
  const { approveHarnessDefinition, harnessDefinitionHash } = await import(
    "../../src/app/executors/harness-definitions.mjs"
  );
  const dir = path.join(configDirectory, "harnesses");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), bytes);
  const hash = harnessDefinitionHash(Buffer.from(bytes));
  approveHarnessDefinition({ configDirectory, name, hash });
  const { sandboxKind } = await import("../../src/app/executors/sandbox.mjs");
  if (unconfined && !sandboxKind())
    fs.writeFileSync(
      path.join(configDirectory, "harness-unconfined.json"),
      JSON.stringify({ [name]: hash }),
    );
  return hash;
}

// Stop the proof's backend, its model proxy and the machine's supervisor.
export async function stopMachine({ root, backend, proxy, stateDirectory }) {
  fs.writeFileSync(path.join(root, "stop-backend"), "");
  await sleep(5000);
  backend.kill("SIGTERM");
  if (proxy) proxy.kill("SIGTERM");
  try {
    const { runningSupervisor } = await import(
      "../../src/app/executors/supervisor.mjs"
    );
    const sup = runningSupervisor(stateDirectory, {});
    if (sup?.pid) process.kill(sup.pid, "SIGTERM");
  } catch {}
}

// ---- A headless proof run (nk-p1, ta-p1) ----------------------------------------

// The command line every headless proof takes, and the paths under --root.
// `prefix` names its environment overrides (NKP1_CLAUDE, NKP1_MODEL, ...).
export function proofRun({ tag, prefix, script, proxyPort }) {
  const repo = path.resolve(path.dirname(script), "..", "..");
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      root: { type: "string" },
      agent: { type: "string", default: "claude" },
      "backend-for": { type: "string" },
    },
  });
  if (!values.root) {
    console.error(
      `Usage: node scripts/proofs/${path.basename(script)} --root DIR [--agent claude|fake]`,
    );
    process.exit(64);
  }
  const agent = values.agent;
  if (!["claude", "fake"].includes(agent))
    throw Error("--agent is claude or fake");
  const root = path.resolve(values.root);
  const cli = path.join(repo, "cli.mjs");
  const paths = {
    origin: path.join(root, "origin.git"),
    checkout: path.join(root, "app"),
    ws: path.join(root, "ws"),
    wt: path.join(root, "wt"),
    claudeConfig: path.join(root, "claude-config"),
    report: path.join(root, "report.json"),
    events: path.join(root, "events.jsonl"),
    proxyLog: path.join(root, "proxy.log"),
    backendLog: path.join(root, "backend.log"),
  };
  const event = (kind, data = {}) => {
    const line = { at: new Date().toISOString(), kind, ...data };
    fs.mkdirSync(root, { recursive: true });
    fs.appendFileSync(paths.events, JSON.stringify(line) + "\n");
    console.log(`[${tag}] ${kind} ${JSON.stringify(data)}`);
  };
  return {
    repo,
    root,
    agent,
    command: positionals[0] ?? "prove",
    backendFor: Number(values["backend-for"] || 600),
    harness: agent === "claude" ? "claude-code" : "fake-cli",
    // The shim on PATH exports the Bedrock credentials under the real HOME;
    // the sandboxed child runs the real binary (real-claude.mjs).
    ...((binaries) => ({
      claude: binaries.exportWith || "claude",
      claudeChild: binaries.child,
    }))(
      claudeBinaries({
        named: process.env[`${prefix}_CLAUDE`] || null,
        onPath:
          spawnSync("command -v claude", {
            shell: true,
            encoding: "utf8",
          }).stdout.trim() || null,
        home: os.homedir(),
      }),
    ),
    model: process.env[`${prefix}_MODEL`] || "global.anthropic.claude-sonnet-5",
    proxyPort: Number(process.env[`${prefix}_PROXY_PORT`] || proxyPort),
    paths,
    db: path.join(paths.ws, ".avoozl", "local", "workspace.sqlite"),
    event,
    git: (cwd, ...args) =>
      execFileSync("git", args, { cwd, encoding: "utf8" }).trim(),
    cli: (...args) =>
      execFileSync(process.execPath, [cli, ...args], {
        encoding: "utf8",
        env: process.env,
      }),
    sleep,
  };
}

// The isolated home under --root, set before any Avoozl module loads.
export function isolateHome(root) {
  const home = path.join(root, "home");
  process.env.XDG_CONFIG_HOME = path.join(home, "config");
  process.env.XDG_STATE_HOME = path.join(home, "state");
  delete process.env.KIROCREW_HOME;
  for (const key of Object.keys(process.env))
    if (/^KIROCREW_/.test(key)) delete process.env[key];
  return home;
}

// A bare remote and its checkout holding `files`, pushed to main.
export function scratchRepository(run, { name, email, files, message }) {
  const { git, paths } = run;
  git(run.root, "init", "-q", "--bare", "-b", "main", paths.origin);
  git(run.root, "clone", "-q", paths.origin, paths.checkout);
  git(paths.checkout, "config", "user.name", name);
  git(paths.checkout, "config", "user.email", email);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(paths.checkout, file)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(paths.checkout, file), text);
  }
  git(paths.checkout, "add", ".");
  git(paths.checkout, "commit", "-q", "-m", message);
  git(paths.checkout, "push", "-q", "origin", "main");
}

// The harness definition: Claude Code on Bedrock, or the fake agent the
// script wrote. Installed and approved; the fake runs unconfined on a host
// with no sandbox.
export async function proofHarness(run, machine, fakeAgent) {
  let bytes;
  if (run.agent === "claude") {
    const definition = JSON.parse(
      fs.readFileSync(
        path.join(run.repo, "examples", "harnesses", "claude-code.json"),
        "utf8",
      ),
    );
    // Bedrock sign-in: only short-lived credentials pass.
    definition.keepEnv = [
      ...definition.keepEnv,
      "AWS_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
    ];
    if (!run.claudeChild)
      throw Error(
        "No real Claude Code binary found (a launcher fails in the sandbox). Name it with the proof's _CLAUDE variable.",
      );
    definition.start[0] = run.claudeChild;
    definition.resume[0] = run.claudeChild;
    bytes = JSON.stringify(definition, null, 2) + "\n";
  } else {
    const file = path.join(run.root, "fake-agent.mjs");
    fs.writeFileSync(file, fakeAgent);
    const argv = [process.execPath, file];
    bytes = JSON.stringify({
      name: run.harness,
      start: argv,
      resume: argv,
      promptFrom: "stdin",
      model: ["--model", "{model}"],
      permission: { write: "workspace-write", read: "read-only" },
      writeRoots: ["{worktree}", "{tmp}", "{repository_cache_dirs}"],
      resultAllow: ["--result-file"],
    });
  }
  const hash = await installHarness(
    machine.configDirectory,
    run.harness,
    bytes,
    {
      unconfined: run.agent === "fake",
    },
  );
  run.event("setup.harness", { name: run.harness, hash });
  return hash;
}

// The scratch repository's row: direct landing on the `process` executor,
// its one check allowed in the sandbox, and only the model proxy reachable.
export function processRepository(run, check, extra = {}) {
  return {
    id: "app",
    root: fs.realpathSync.native(run.paths.checkout),
    baseBranch: "main",
    landing: "direct",
    checks: [check],
    worktreeRoot: run.paths.wt,
    executor: "process",
    harness: run.harness,
    sandbox: {
      writeRoots: [run.paths.claudeConfig],
      allowCommands: [
        check,
        ["git", "rev-parse"],
        ["git", "diff"],
        ["git", "status"],
        ["git", "log"],
      ],
      modelProxy: [`localhost:${run.proxyPort}`],
    },
    ...extra,
  };
}

// The children's environment: Claude Code on Bedrock with credentials from
// `claude default-credential-export`, through the loopback model proxy.
export function agentEnv(run, { noProxy = "" } = {}) {
  const env = { ...process.env };
  if (run.agent !== "claude") return env;
  const settings = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), ".claude", "settings.json"),
      "utf8",
    ),
  );
  const creds = JSON.parse(
    execFileSync(run.claude, ["default-credential-export"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ).Credentials;
  return {
    ...env,
    PATH: `${path.dirname(run.claudeChild)}:${env.PATH}`,
    CLAUDE_CONFIG_DIR: run.paths.claudeConfig,
    CLAUDE_CODE_USE_BEDROCK: "1",
    AWS_REGION: settings.env?.AWS_REGION || "us-west-2",
    AWS_ACCESS_KEY_ID: creds.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.SecretAccessKey,
    AWS_SESSION_TOKEN: creds.SessionToken,
    HTTPS_PROXY: `http://localhost:${run.proxyPort}`,
    https_proxy: `http://localhost:${run.proxyPort}`,
    NO_PROXY: noProxy,
  };
}

// The headless tick of a machine with no Kiro Crew: the tick, the drain of
// `process` requests and the checks, every 3 s until `seconds` pass or the
// prover writes stop-backend. `between(store, log)` runs after each drain.
export async function runBackend(
  run,
  machine,
  { seconds, env, between = () => {} },
) {
  const { Store } = await import("../../src/app/store/store.mjs");
  const { Operations } = await import("../../src/app/api/operations.mjs");
  const { prepareWorktree } = await import(
    "../../src/app/delivery/delivery.mjs"
  );
  const { drainProcessRequests } = await import(
    "../../src/app/executors/process.mjs"
  );
  const { drainCheckRuns } = await import(
    "../../src/app/delivery/check-runs.mjs"
  );
  const { launchSupervisor } = await import(
    "../../src/app/executors/supervisor.mjs"
  );
  const store = new Store(run.db);
  const ops = new Operations(store, {
    workspaceRoot: run.paths.ws,
    configDirectory: machine.configDirectory,
  });
  const end = Date.now() + seconds * 1000;
  const log = (line) =>
    fs.appendFileSync(
      run.paths.backendLog,
      `${new Date().toISOString()} [${process.pid}] ${line}\n`,
    );
  log("backend start");
  while (Date.now() < end) {
    const sup = launchSupervisor({
      stateDirectory: machine.stateDirectory,
      configDirectory: machine.configDirectory,
      env,
    });
    if (sup.started) log(`supervisor started pid ${sup.pid}`);
    try {
      const tick = await ops.execute("workspace.tick", { cron: true });
      if (tick.dispatch?.length)
        log(
          `tick dispatch ${JSON.stringify(tick.dispatch.map((d) => [d.task, d.role, d.executor]))}`,
        );
      for (const notice of tick.notify ?? [])
        if (notice.channel === "failure")
          log(`tick failure ${notice.title}: ${notice.text}`);
    } catch (error) {
      log(`tick error ${error.message}`);
    }
    try {
      const { errors } = await drainProcessRequests(store, {
        stateDirectory: machine.stateDirectory,
        prepareWorktree,
        ops,
      });
      for (const e of errors) log(`drain error ${e.id}: ${e.error}`);
      await drainCheckRuns(store);
    } catch (error) {
      log(`drain failure ${error.message}`);
    }
    try {
      between(store, log);
    } catch (error) {
      log(`between failure ${error.message}`);
    }
    if (fs.existsSync(path.join(run.root, "stop-backend"))) break;
    await sleep(3000);
  }
  log("backend stop");
  store.close();
}

// The backend as a child of the prover (this same script, `backend`), and
// the model proxy when the agent is Claude Code.
export async function startMachine(run, script, seconds, preflight = null) {
  let proxy = null;
  if (run.agent === "claude") {
    proxy = spawn(
      process.execPath,
      [
        path.join(run.repo, "scripts", "proofs", "p57-model-proxy.mjs"),
        String(run.proxyPort),
        run.paths.proxyLog,
      ],
      { stdio: "ignore" },
    );
    await sleep(1000);
    run.event("proxy.start", { pid: proxy.pid, port: run.proxyPort });
    try {
      await preflight?.();
    } catch (error) {
      proxy.kill("SIGTERM");
      throw error;
    }
  }
  const out = fs.openSync(run.paths.backendLog, "a");
  const backend = spawn(
    process.execPath,
    [
      script,
      "--root",
      run.root,
      "--agent",
      run.agent,
      "--backend-for",
      String(seconds),
      "backend",
    ],
    { stdio: ["ignore", out, out], env: process.env },
  );
  fs.closeSync(out);
  run.event("backend.start", { pid: backend.pid });
  return { backend, proxy };
}

// One real model turn before the tick, started the way the tick starts a
// session: a start request queued in the workspace, naming its repository,
// and drained by drainProcessRequests to the supervisor. So the child gets
// what that role's children get: the repository found from the request,
// its sandbox, and the role's network (the model proxy for an offline one).
// A session binds to its role's record (session-bindings.mjs), so a triage
// preflight has a run row of its own, removed with the rest.
// It must exit 0 with a call through the proxy; else the proof stops in
// seconds with the child's log. Its binding and request are removed after.
export async function preflightModel(
  run,
  machine,
  { role, repository, record = null, env },
) {
  const { Store } = await import("../../src/app/store/store.mjs");
  const { kirocrewRequest } = await import(
    "../../src/app/executors/kirocrew.mjs"
  );
  const { enqueueSessionRequests } = await import(
    "../../src/app/sessions/session-requests.mjs"
  );
  const { drainProcessRequests, processExecutor } = await import(
    "../../src/app/executors/process.mjs"
  );
  const {
    childRecord,
    launchSupervisor,
    openSupervisorDatabase,
    runningSupervisor,
  } = await import("../../src/app/executors/supervisor.mjs");
  const folder = path.join(run.root, "preflight");
  fs.mkdirSync(folder, { recursive: true });
  const task = record?.id ?? "preflight";
  const store = new Store(run.db);
  let slot = null,
    request = null;
  try {
    if (record) store.put(record.table, record.row);
    request = kirocrewRequest(store, {
      task,
      role,
      executor: "process",
      harness: run.harness,
      repository,
      attempt: 1,
      title: `avoozl:preflight ${role}`,
      worktree: folder,
      permissionClass: "read",
      model: run.model,
      brief: "Preflight: reply with the single word ok and do nothing else.",
    });
    enqueueSessionRequests(store, { starts: [request] });
    const { errors } = await drainProcessRequests(store, {
      stateDirectory: machine.stateDirectory,
    });
    if (errors.length)
      throw Error(`Preflight: the drain refused the start: ${errors[0].error}`);
    slot =
      store.list("session_bindings").find((entry) => entry.taskId === task)
        ?.slot ?? null;
  } finally {
    store.close();
  }
  if (!slot) throw Error("Preflight: the drain started no session.");
  launchSupervisor({
    stateDirectory: machine.stateDirectory,
    configDirectory: machine.configDirectory,
    env,
  });
  const executor = processExecutor({ stateDirectory: machine.stateDirectory });
  const end = Date.now() + 240_000;
  let status = await executor.status(slot);
  while (!status.startsWith("exited") && Date.now() < end) {
    await sleep(2000);
    status = await executor.status(slot);
  }
  const db = openSupervisorDatabase(machine.stateDirectory);
  const row = childRecord(db, slot);
  db.close();
  // The tick must not finish a session for a task that does not exist.
  const cleanup = new Store(run.db);
  try {
    cleanup.remove("session_bindings", slot);
    cleanup.remove("session_requests", request.id);
    if (record) cleanup.remove(record.table, record.id);
  } finally {
    cleanup.close();
  }
  const tail = (file, lines) =>
    fs.existsSync(file ?? "")
      ? fs.readFileSync(file, "utf8").trim().split("\n").slice(-lines)
      : [];
  const network = JSON.parse(row?.settings || "{}").network ?? null;
  const proxied = tail(run.paths.proxyLog, 1000).some((line) =>
    / allow connect /.test(line),
  );
  run.event("preflight", { role, status, network, proxied });
  if (status === "exited 0" && proxied) return;
  // The proof stops here: the supervisor it started goes too.
  const sup = runningSupervisor(machine.stateDirectory, {});
  if (sup?.pid) process.kill(sup.pid, "SIGTERM");
  throw Error(
    [
      `Preflight: one ${role} turn ${status}, network ${JSON.stringify(network)}, ${proxied ? "with" : "with no"} call through the model proxy.`,
      ...tail(row?.log_file, 12),
    ].join("\n"),
  );
}

// A file's text on origin's main, or null when it is not there: landed
// means on the remote, not only a delivery state.
export function originFile(run, file) {
  try {
    return execFileSync("git", ["show", `main:${file}`], {
      cwd: run.paths.origin,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

// Claude Code needs sandbox-exec, which refuses to nest (inside Kiro Crew).
export async function needSandbox(run, tag) {
  const { sandboxKind } = await import("../../src/app/executors/sandbox.mjs");
  if (run.agent === "claude" && !sandboxKind())
    throw Error(
      `sandbox-exec cannot run here (inside another sandbox?). Run ${tag} from a terminal outside Kiro Crew.`,
    );
}

// The one line a proof prints last.
export function printResult(run, tag, pass) {
  console.log(
    `${tag} ${pass ? "PASS" : "FAIL"}${run.agent === "fake" ? " (fake agent: plumbing only, not the proof)" : ""}`,
  );
}
