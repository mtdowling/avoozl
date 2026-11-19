#!/usr/bin/env node
// Proof SW-P1 (spec standalone-web): Avoozl runs a task end to end with no
// Kiro Crew, from its own page. A scratch machine runs the supervisor with
// `serve.enabled` on a fixed port; a real Claude Code (the `process`
// executor) does the task's work; a headless Chrome signs in with the owner
// link and checks the page; a second 127.0.0.1 page and curl try to drive the
// server without the owner's CSRF token; the supervisor is restarted.
//
// Everything lives under --root, which must be under the temporary folder: a
// bare remote and its checkout, an Avoozl workspace, an isolated Avoozl config
// and state home (HOME, XDG_*). No real workspace, Avoozl home, Kiro Crew home
// or Claude Code home is read or written, and every KIROCREW_* and AVOOZL_*
// variable is removed from the environment.
//
//   node scripts/proof-sw-p1-live.mjs --root DIR preflight
//   node scripts/proof-sw-p1-live.mjs --root DIR [--agent claude|fake] [--port N] [--receipt FILE]
//
// Claude Code runs on Bedrock, as in P59 and nk-p1: it is the binary SWP1_CLAUDE
// names, else `claude` on PATH, confined by sandbox-exec, and it reaches only
// Bedrock through a loopback proxy (scripts/live-proofs/p57-model-proxy.mjs).
// The short-lived keys come from `claude default-credential-export` and the
// region from ~/.claude/settings.json, both read once before the isolated home
// is set; they live in the supervisor's environment only, never in an argument
// or a file. It runs from a terminal outside Kiro Crew, since sandbox-exec
// cannot nest. `--agent fake` runs a scripted agent instead, to check this
// script's plumbing only; it never counts as the proof.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { claudeBinaries } from "./real-claude.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO, "cli.mjs");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    agent: { type: "string", default: "claude" },
    port: { type: "string" },
    receipt: { type: "string" },
  },
});
if (!values.root) {
  console.error(
    "Usage: node scripts/proof-sw-p1-live.mjs --root DIR [--agent claude|fake] [--port N] [--receipt FILE] [preflight]",
  );
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const AGENT = values.agent;
if (!["claude", "fake"].includes(AGENT))
  throw Error("--agent is claude or fake");
const tmp = os.tmpdir();
if (![tmp, fs.realpathSync(tmp)].some((dir) => ROOT.startsWith(dir + path.sep)))
  throw Error(`--root must be under ${tmp}; this proof writes a lot.`);

// The real environment, for the browser; the isolated one is set after it
// starts, since Chrome keeps its profile under the real HOME it started in.
const realEnv = { ...process.env };
const HOME = path.join(ROOT, "home");
const P = {
  origin: path.join(ROOT, "origin.git"),
  checkout: path.join(ROOT, "app"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  events: path.join(ROOT, "events.jsonl"),
  supervisorLog: path.join(ROOT, "supervisor.log"),
  shots: path.join(ROOT, "shots"),
};
const TASK = ["swp1-one", "notes/one.txt", "alpha"];
const MODEL = process.env.SWP1_MODEL || "global.anthropic.claude-sonnet-5";
const PROXY_PORT = Number(process.env.SWP1_PROXY_PORT || 18462);
P.claudeConfig = path.join(ROOT, "claude-config");
P.proxyLog = path.join(ROOT, "proxy.log");
// The supervisor's environment for Claude Code (Bedrock sign-in, the proxy and
// the run's own Claude config folder); set once, before the isolated home.
let AGENT_ENV = null;
function bedrockEnvironment() {
  const { exportWith, child: claude } = binaries();
  if (!exportWith || !claude) throw Error("Claude Code was not found.");
  const settings = JSON.parse(
    fs.readFileSync(
      path.join(realEnv.HOME ?? os.homedir(), ".claude", "settings.json"),
      "utf8",
    ),
  );
  const creds = JSON.parse(
    // The person's own command, in the person's own environment: the login
    // that issues the keys is theirs, as in nk-p1.
    execFileSync(exportWith, ["default-credential-export"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: realEnv,
    }),
  ).Credentials;
  return {
    PATH: `${path.dirname(claude)}:${realEnv.PATH}`,
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
// A step that cannot go on ends the run, with its failure recorded.
class ProofAbort extends Error {}

function isolate() {
  for (const name of Object.keys(process.env))
    if (/^(KIROCREW|AVOOZL|AICOMMANDER|NUPP_WORKSPACE)/.test(name))
      delete process.env[name];
  process.env.HOME = process.env.USERPROFILE = HOME;
  process.env.XDG_CONFIG_HOME = path.join(HOME, "config");
  process.env.XDG_STATE_HOME = path.join(HOME, "state");
  process.env.LOCALAPPDATA = path.join(HOME, "local");
  process.env.APPDATA = path.join(HOME, "roaming");
}

const event = (kind, data = {}) => {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.appendFileSync(
    P.events,
    JSON.stringify({ at: new Date().toISOString(), kind, ...data }) + "\n",
  );
  console.log(`[sw-p1] ${kind} ${JSON.stringify(data)}`);
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const cli = (...args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: process.env,
  });
const imp = (file) => import(pathToFileURL(path.join(REPO, file)).href);

// Which binary exports the credentials and which one the child runs.
function binaries() {
  const onPath =
    spawnSync("command -v claude", {
      shell: true,
      encoding: "utf8",
      env: realEnv,
    }).stdout.trim() || null;
  return claudeBinaries({
    named: realEnv.SWP1_CLAUDE || null,
    onPath,
    home: realEnv.HOME ?? os.homedir(),
  });
}
// The real binary, for the sandboxed child.
const claudeBinary = () => binaries().child;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// ── Setup ────────────────────────────────────────────────────────────────

const CHECK = `import fs from "node:fs";
const notes = fs.existsSync("notes") ? fs.readdirSync("notes").filter((n) => n.endsWith(".txt")) : [];
for (const name of notes)
  if (!/^[a-z]+\\n$/.test(fs.readFileSync("notes/" + name, "utf8"))) {
    console.error("notes/" + name + " must be one lowercase word and a newline");
    process.exit(1);
  }
console.log("ok");
`;
const FAKE_AGENT = `import fs from "node:fs";
fs.readFileSync(0, "utf8");
fs.mkdirSync("notes", { recursive: true });
fs.writeFileSync("notes/one.txt", "alpha\\n");
// A run long enough for the proof to send one message before it ends.
await new Promise((resolve) => setTimeout(resolve, 20000));
fs.mkdirSync(".avoozl", { recursive: true });
fs.writeFileSync(".avoozl/result.json", JSON.stringify({ state: "done", text: "Wrote the file." }));
`;

async function setup(port) {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; the proof runs once on a fresh root.`);
  for (const dir of [ROOT, P.wt, P.shots, HOME, P.claudeConfig])
    fs.mkdirSync(dir, { recursive: true });
  event("setup.start", { root: ROOT, agent: AGENT, port });
  git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
  git(ROOT, "clone", "-q", P.origin, P.checkout);
  git(P.checkout, "config", "user.name", "SW-P1 Scratch");
  git(P.checkout, "config", "user.email", "swp1@example.invalid");
  fs.writeFileSync(path.join(P.checkout, "README.md"), "SW-P1 scratch.\n");
  fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
  git(P.checkout, "add", ".");
  git(P.checkout, "commit", "-q", "-m", "Start the SW-P1 scratch repository");
  git(P.checkout, "push", "-q", "origin", "main");

  cli("init", P.ws, "--name", "SW-P1 scratch");
  cli("workspace", "add", "swp1", "--root", P.ws);
  const config = JSON.parse(
    fs.readFileSync(path.join(P.ws, ".avoozl.json"), "utf8"),
  );
  config.delivery = {
    ...(config.delivery || {}),
    concurrency: 1,
    retries: 1,
    investigate: { mode: "off" },
    model: MODEL,
  };
  fs.writeFileSync(
    path.join(P.ws, ".avoozl.json"),
    JSON.stringify(config, null, 2) + "\n",
  );

  const { approveHarnessDefinition, harnessDefinitionHash } = await imp(
    "src/app/harness-definitions.mjs",
  );
  const { machineAvoozlPaths } = await imp("src/app/host-config.mjs");
  const machine = machineAvoozlPaths();
  for (const dir of [machine.configDirectory, machine.stateDirectory])
    if (!dir.startsWith(HOME + path.sep)) throw Error(`Not isolated: ${dir}`);
  const harnesses = path.join(machine.configDirectory, "harnesses");
  fs.mkdirSync(harnesses, { recursive: true });
  let name, bytes;
  if (AGENT === "claude") {
    const definition = JSON.parse(
      fs.readFileSync(
        path.join(REPO, "examples", "harnesses", "claude-code.json"),
        "utf8",
      ),
    );
    // Bedrock sign-in, as in P57, P59 and nk-p1.
    definition.keepEnv = [
      ...definition.keepEnv.filter((name) => name !== "ANTHROPIC_API_KEY"),
      "AWS_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
    ];
    definition.start[0] =
      definition.resume[0] =
      definition.attach[0] =
        claudeBinary();
    name = definition.name;
    bytes = JSON.stringify(definition, null, 2) + "\n";
  } else {
    name = "fake-cli";
    // SWP1_FAKE_FAIL=1 makes the scripted agent exit 3 with no report, to check
    // that the proof fails fast on a worker that ends that way.
    fs.writeFileSync(
      path.join(ROOT, "fake-agent.mjs"),
      process.env.SWP1_FAKE_FAIL
        ? 'console.error("scripted failure"); process.exit(3);\n'
        : FAKE_AGENT,
    );
    bytes = JSON.stringify({
      name,
      start: [process.execPath, path.join(ROOT, "fake-agent.mjs")],
      resume: [process.execPath, path.join(ROOT, "fake-agent.mjs")],
      promptFrom: "stdin",
      permission: { write: "workspace-write", read: "read-only" },
      writeRoots: ["{worktree}", "{tmp}", "{project_cache_dirs}"],
    });
  }
  fs.writeFileSync(path.join(harnesses, `${name}.json`), bytes);
  const hash = harnessDefinitionHash(Buffer.from(bytes));
  approveHarnessDefinition({
    configDirectory: machine.configDirectory,
    name,
    hash,
  });
  if (AGENT === "fake")
    fs.writeFileSync(
      path.join(machine.configDirectory, "harness-unconfined.json"),
      JSON.stringify({ [name]: hash }),
    );
  event("setup.harness", { name, hash });

  // The machine file: the supervisor hosts the page on a fixed port (SW9).
  const hostFile = path.join(machine.configDirectory, "config.json");
  const host = JSON.parse(fs.readFileSync(hostFile, "utf8"));
  host.serve = { enabled: true, port };
  fs.writeFileSync(hostFile, JSON.stringify(host, null, 2) + "\n");

  // One approved one-task plan, seeded as the other live proofs do.
  const { Store } = await imp("src/app/store.mjs");
  const { digest } = await imp("src/model.mjs");
  const { takeOverSpec } = await imp("src/app/spec-takeover.mjs");
  const store = new Store(
    path.join(P.ws, ".avoozl", "local", "workspace.sqlite"),
  );
  try {
    store.importSnapshot({
      ...store.read(),
      tasks: [
        {
          id: TASK[0],
          title: `Write ${TASK[1]}`,
          kind: "leaf",
          scope: "swp1",
          status: "planned",
          epic: "swp1",
          track: "swp1",
          tags: [],
          acceptance: [
            `Create ${TASK[1]} containing the word ${TASK[2]} and a newline, and nothing else. Run \`node check.mjs\` before you finish; it must print ok.`,
          ],
          repository: "app",
          planId: "swp1",
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
        writeRoots: [P.claudeConfig],
        allowCommands: [["node", "check.mjs"]],
        network: [`localhost:${PROXY_PORT}`],
      },
    });
    store.put("plans", {
      id: "swp1",
      kind: "plan",
      spec: "swp1",
      title: "SW-P1 task",
      hash: digest("plan swp1"),
      revision: 1,
      state: "approved",
    });
    store.put("receipts", {
      id: "spec-journal:swp1",
      kind: "spec-journal",
      planId: "swp1",
      home: "local",
    });
    await takeOverSpec(
      store,
      { workspaceRoot: P.ws, actor: "Operator" },
      "swp1",
    );
  } finally {
    store.close();
  }
  event("setup.done");
  return machine;
}

// ── The supervisor, with the tick, hosting the page ──────────────────────

function startSupervisor() {
  const out = fs.openSync(P.supervisorLog, "a");
  const child = spawn(
    process.execPath,
    [CLI, "supervisor", "--tick-seconds", "3"],
    {
      stdio: ["ignore", out, out],
      // Claude Code's Bedrock sign-in reaches only this process, by environment.
      env: AGENT_ENV ? { ...process.env, ...AGENT_ENV } : process.env,
      detached: true,
    },
  );
  fs.closeSync(out);
  child.unref();
  event("supervisor.start", { pid: child.pid });
  return child;
}

async function stopSupervisor(child) {
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    return;
  }
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(child.pid, 0);
    } catch {
      return;
    }
    await sleep(100);
  }
  process.kill(child.pid, "SIGKILL");
}

const until = async (
  what,
  check,
  { timeoutMs = 60_000, everyMs = 500 } = {},
) => {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw Error(`Timed out waiting for ${what}.`);
    await sleep(everyMs);
  }
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

// ── What the proof checks ────────────────────────────────────────────────

const record = (step, pass, detail) => {
  results.push({ step, pass, detail });
  event("result", { step, pass, detail });
};

// Kiro Crew's default palette's accent, read from the built stylesheet.
function paletteAccent(mode) {
  const dir = path.join(
    REPO,
    "kirocrew-app",
    "ui",
    "dist",
    "standalone",
    "assets",
  );
  const css = fs.readFileSync(
    path.join(
      dir,
      fs.readdirSync(dir).find((n) => n.endsWith(".css")),
    ),
    "utf8",
  );
  const block = new RegExp(`\\[data-theme=kiro-${mode}\\]\\{([^}]*)\\}`).exec(
    css,
  );
  return /--accent:([^;]+);/.exec(block?.[1] ?? "")?.[1] ?? null;
}

async function checkPage(page, { mode, port }) {
  const text = await page.evaluate("document.body.innerText");
  const font = await page.evaluate(
    "[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('\"', ''))",
  );
  const accent = (
    await page.evaluate(
      "getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()",
    )
  ).toLowerCase();
  const wanted = (paletteAccent(mode) ?? "").trim().toLowerCase();
  const violations = await page.evaluate("window.__csp");
  const loaded = /dashboards/i.test(text);
  const problems = [
    ...(loaded ? [] : ["the page did not load"]),
    ...(page.errors.length ? [`script errors: ${page.errors.join("; ")}`] : []),
    ...(page.consoleErrors.length
      ? [`console: ${page.consoleErrors.join("; ")}`]
      : []),
    ...(violations.length ? [`CSP reports: ${violations.join("; ")}`] : []),
    ...(accent && accent === wanted
      ? []
      : [`--accent is ${accent}, Kiro Crew's ${mode} is ${wanted}`]),
    ...(font.some((f) => /Space Grotesk|JetBrains Mono/.test(f))
      ? []
      : [`Kiro Crew's fonts are not loaded (${font.join(", ") || "none"})`]),
  ];
  return { mode, port, problems };
}

async function step1(page, port) {
  const link = cli("serve", "link").trim();
  if (!link.startsWith(`http://127.0.0.1:${port}/login?token=`))
    throw Error(`serve link printed ${link.replace(/token=.*/, "token=…")}`);
  await page.onNewDocument(
    "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI))",
  );
  const found = [];
  for (const mode of ["light", "dark"]) {
    await page.open(link, { width: 1280, height: 900, dark: mode === "dark" });
    await page.evaluate(`localStorage.setItem('avoozl-theme', '${mode}')`);
    await page.open(`http://127.0.0.1:${port}/apps/avoozl`, {
      width: 1280,
      height: 900,
      dark: mode === "dark",
    });
    await until(
      "the page",
      () => page.evaluate("/dashboards/i.test(document.body.innerText)"),
      { timeoutMs: 30_000 },
    );
    await sleep(1500);
    await page.screenshot(path.join(P.shots, `page-${mode}.png`));
    found.push(await checkPage(page, { mode, port }));
  }
  const problems = found.flatMap((f) =>
    f.problems.map((p) => `${f.mode}: ${p}`),
  );
  record(
    "1 page loads, no console error or CSP report, Kiro Crew's colors and fonts, light and dark",
    problems.length === 0,
    problems.length ? problems : "ok",
  );
}

async function step2(page, port, machine) {
  // Home's In flight row shows the worker; its log tail is on the page.
  await page.open(`http://127.0.0.1:${port}/apps/avoozl`, {
    width: 1280,
    height: 900,
    dark: false,
  });
  // The task lands on the bare remote, unless its worker ends first: a worker
  // that exits non-zero, or exits and no done report lands the task within two
  // minutes, fails the proof now instead of after the long wait.
  const { machineStatus } = await imp("src/app/machine-status.mjs");
  let failure = null,
    exitedAt = null;
  const workerFailed = () => {
    const workers = machineStatus({
      stateDirectory: machine.stateDirectory,
    }).children.filter((child) => child.role === "worker");
    const ended = workers.find((child) => child.state === "exited");
    if (!ended || workers.some((child) => child.state !== "exited")) {
      exitedAt = null;
      return null;
    }
    exitedAt ??= Date.now();
    if (ended.exitCode !== 0 || Date.now() - exitedAt > 120_000) {
      const log = path.join(
        machine.stateDirectory,
        "supervisor",
        "children",
        ended.sessionId,
        "log",
      );
      let tail = "";
      try {
        tail = fs.readFileSync(log, "utf8").slice(-800);
      } catch {
        // No log to show.
      }
      return {
        exitCode: ended.exitCode,
        reason:
          ended.exitCode !== 0
            ? `the worker exited with code ${ended.exitCode}`
            : "the worker exited without a done report that landed the task",
        logTail: tail,
      };
    }
    return null;
  };
  const row = await until(
    "the worker's In flight row",
    async () => {
      // A worker that has already failed ends the wait.
      failure = workerFailed();
      if (failure) return "failed";
      return page.evaluate(
        "document.querySelector('[data-in-flight-row]') ? document.querySelector('[data-process-log]')?.textContent ?? 'row' : null",
      );
    },
    { timeoutMs: 10 * 60_000, everyMs: 3000 },
  ).catch(() => null);
  event("step2.row", { seen: row !== null });
  let queued = false;
  if (row !== null && !failure) {
    await page.evaluate(
      "document.querySelector('[data-in-flight-row] button[aria-label^=\"Send message\"]')?.click(); true",
    );
    await sleep(500);
    await page.evaluate(
      `(() => { const e = document.querySelector('[data-send-message] textarea'); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(e, 'SW-P1 message: also keep notes/one.txt to one word.'); e.dispatchEvent(new Event('input', { bubbles: true })); return true })()`,
    );
    await page.evaluate(
      "document.querySelector('[data-send-message] [data-send-submit]')?.click(); true",
    );
    queued = await until(
      "the message queued",
      () =>
        page.evaluate(
          "document.querySelector('[data-send-state]')?.getAttribute('data-send-state') === 'queued'",
        ),
      { timeoutMs: 10_000 },
    ).catch(() => false);
    await page.screenshot(path.join(P.shots, "in-flight.png"));
  }
  const landed = await until(
    "the task to land",
    () => {
      try {
        git(P.checkout, "fetch", "-q", "origin");
        if (git(P.checkout, "show", `origin/main:${TASK[1]}`) === TASK[2])
          return true;
      } catch {
        // Not landed yet.
      }
      failure = workerFailed();
      return Boolean(failure);
    },
    { timeoutMs: 30 * 60_000, everyMs: 5000 },
  ).then(
    () => !failure,
    () => false,
  );
  if (failure) {
    record("2 the task lands and the message reaches the child", false, {
      sawRow: row !== null,
      queued,
      ...failure,
    });
    throw new ProofAbort(failure.reason);
  }
  // The message reached the child: a message file in its folder.
  const children = path.join(machine.stateDirectory, "supervisor", "children");
  const delivered = await until(
    "the message at the child",
    () =>
      fs.existsSync(children) &&
      fs
        .readdirSync(children)
        .some((id) =>
          fs
            .readdirSync(path.join(children, id))
            .some(
              (f) =>
                /^message-/.test(f) &&
                fs
                  .readFileSync(path.join(children, id, f), "utf8")
                  .includes("SW-P1 message"),
            ),
        ),
    { timeoutMs: 120_000 },
  ).catch(() => false);
  record(
    "2 the task lands and the message reaches the child",
    Boolean(row !== null && queued && landed && delivered),
    { sawRow: row !== null, queued, landed, delivered },
  );
}

async function step3(page, port, machine) {
  await page.open(`http://127.0.0.1:${port}/apps/avoozl`, {
    width: 1280,
    height: 900,
    dark: false,
  });
  const click = (find) =>
    page.evaluate(
      `(() => { const e = ${find}; if (!e) return false; e.click(); return true })()`,
    );
  const button = (t) =>
    `[...document.querySelectorAll('button,[role=tab],a')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(t)}))`;
  await until("the nav", () =>
    page.evaluate("/settings/i.test(document.body.innerText)"),
  );
  await click(button("Settings"));
  await until("Content rules", () =>
    page.evaluate(`!!(${button("Content rules")})`),
  );
  await click(button("Content rules"));
  await until("the help button", () =>
    page.evaluate(`!!(${button("Design a rule set")})`),
  );
  await click(button("Design a rule set"));
  await until("the dialog", () =>
    page.evaluate(
      "document.querySelector('dialog[data-start-session]')?.open === true",
    ),
  );
  await until("the plan line", () =>
    page.evaluate(
      "document.querySelector('[data-session-plan]')?.textContent.includes('assist')",
    ),
  );
  await click(
    "[...document.querySelectorAll('dialog[data-start-session] footer button')].find((b) => b.textContent.trim() === 'Start')",
  );
  const shown = await until(
    "its process view",
    () =>
      page.evaluate(
        "document.querySelector('[data-session-log]') && /Working|Ended/.test(document.querySelector('[data-session-state]')?.textContent ?? '')",
      ),
    { timeoutMs: 120_000 },
  ).catch(() => false);
  await sleep(2500);
  await page.screenshot(path.join(P.shots, "assist.png"));
  const { Store } = await imp("src/app/store.mjs");
  const store = new Store(
    path.join(P.ws, ".avoozl", "local", "workspace.sqlite"),
  );
  let request;
  try {
    request = store
      .list("session_requests")
      .find((r) => r.request?.role === "assist");
  } finally {
    store.close();
  }
  const ok =
    shown &&
    request?.request.permissionClass === "read" &&
    fs.realpathSync(request.request.worktree) === fs.realpathSync(P.ws);
  record(
    "3 Ask for help starts a read-only assist session and shows its log",
    Boolean(ok),
    {
      shown: Boolean(shown),
      permissionClass: request?.request.permissionClass ?? null,
      folder: request ? path.basename(request.request.worktree) : null,
    },
  );
}

// A second page on another 127.0.0.1 port tries to drive the server.
async function step4(page, port) {
  const other = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    const target = `http://127.0.0.1:${port}/apps/avoozl/api/command`;
    res.end(`<!doctype html><body><script>
      const target = ${JSON.stringify(target)};
      const body = JSON.stringify({ operation: "workspaces.stop", input: { id: "swp1" } });
      window.__done = (async () => {
        const out = {};
        try { const r = await fetch(target, { method: "POST", credentials: "include", headers: { "Content-Type": "text/plain" }, body }); out.fetch = r.status } catch (e) { out.fetch = "blocked: " + e.name }
        try { const r = await fetch(target, { method: "POST", credentials: "include", mode: "no-cors", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "operation=workspaces.stop" }); out.noCors = r.type } catch (e) { out.noCors = "blocked: " + e.name }
        return out;
      })();
    </script></body>`);
  });
  await new Promise((resolve) => other.listen(0, "127.0.0.1", resolve));
  const otherPort = other.address().port;
  const before = enabledState();
  await page.open(`http://127.0.0.1:${otherPort}/`, {
    width: 800,
    height: 600,
    dark: false,
  });
  const outcome = await page.evaluate("window.__done");
  // A form POST from that page.
  await page.evaluate(
    `(() => { const f = document.createElement('form'); f.method = 'POST'; f.action = 'http://127.0.0.1:${port}/apps/avoozl/api/command'; f.enctype = 'text/plain'; const i = document.createElement('input'); i.name = '{"operation":"workspaces.stop","input":{"id":"swp1"}}'; i.value = ''; f.append(i); document.body.append(f); f.submit(); return true })()`,
  );
  await sleep(1500);
  const formText = await page.evaluate("document.body.innerText");
  other.close();
  // Replaying the signed-in cookie with curl and no CSRF header.
  const jar = path.join(ROOT, "cookies.txt");
  const link = cli("serve", "link").trim();
  spawnSync("curl", ["-s", "-o", "/dev/null", "-c", jar, link]);
  const curl = (...extra) =>
    spawnSync(
      "curl",
      [
        "-s",
        "-o",
        "/dev/null",
        "-w",
        "%{http_code}",
        "-b",
        jar,
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "-d",
        '{"operation":"workspaces.stop","input":{"id":"swp1"}}',
        ...extra,
        `http://127.0.0.1:${port}/apps/avoozl/api/command`,
      ],
      { encoding: "utf8" },
    ).stdout;
  const noHeader = curl("-H", `Origin: http://127.0.0.1:${port}`);
  const noOrigin = curl();
  const after = enabledState();
  const blocked =
    (typeof outcome.fetch === "string" &&
      outcome.fetch.startsWith("blocked")) ||
    outcome.fetch === 403;
  const formRefused = formText.trim() === "" || /Not allowed/.test(formText);
  const ok = blocked && formRefused;
  const refused = noHeader === "403" && noOrigin === "403";
  record(
    "4 cross-origin fetch, form POST and a cookie replay without the CSRF header are refused and change nothing",
    Boolean(ok && refused && before === after),
    {
      fetch: outcome.fetch,
      noCors: outcome.noCors,
      form: formText.trim().slice(0, 60),
      curlNoCsrf: noHeader,
      curlNoOrigin: noOrigin,
      workspaceEnabledBefore: before,
      after,
    },
  );
}

function enabledState() {
  const hostFile = path.join(
    process.env.XDG_CONFIG_HOME,
    "avoozl",
    "config.json",
  );
  return String(readJson(hostFile)?.workspaces?.swp1?.enabled);
}

function listeners(pid) {
  const out =
    process.platform === "linux"
      ? spawnSync("ss", ["-ltnpH"], { encoding: "utf8" }).stdout
      : spawnSync(
          "lsof",
          ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-p", String(pid)],
          { encoding: "utf8" },
        ).stdout;
  return out
    .split("\n")
    .filter((line) =>
      process.platform === "linux" ? line.includes(`pid=${pid},`) : line.trim(),
    )
    .map(
      (line) =>
        line.match(/(\d+\.\d+\.\d+\.\d+|\[?[0-9a-f:]+\]?|\*):(\d+)/i)?.[0],
    )
    .filter(Boolean);
}

async function step5(page, port, supervisor, machine, restart) {
  const oldServer = readJson(path.join(machine.stateDirectory, "serve.json"));
  await stopSupervisor(supervisor);
  const next = restart();
  const server = await until(
    "the server back",
    () => {
      const now = readJson(path.join(machine.stateDirectory, "serve.json"));
      return now && now.pid !== oldServer.pid ? now : null;
    },
    { timeoutMs: 60_000 },
  );
  await page.open(`http://127.0.0.1:${port}/apps/avoozl`, {
    width: 1280,
    height: 900,
    dark: false,
  });
  const oldText = await page.evaluate("document.body.innerText");
  const link = cli("serve", "link").trim();
  await page.open(link, { width: 1280, height: 900, dark: false });
  await until(
    "the new session",
    () => page.evaluate("/dashboards/i.test(document.body.innerText)"),
    { timeoutMs: 30_000 },
  );
  const sockets = listeners(server.pid);
  record(
    "5 the server returns on the same port, the old session is gone, a new link signs in, and only 127.0.0.1 listens",
    server.port === port &&
      /Sign in needed/.test(oldText) &&
      sockets.length > 0 &&
      sockets.every((s) => s === `127.0.0.1:${port}`),
    { port: server.port, oldPage: oldText.trim().slice(0, 40), sockets },
  );
  return next;
}

// ── Main ─────────────────────────────────────────────────────────────────

// One real model turn, the way the proof's child runs: the real binary, an
// isolated HOME and Claude config folder, the Bedrock keys from the person's
// export, and only the loopback proxy for the network. Prints what failed.
async function claudeAnswers() {
  let env;
  try {
    env = bedrockEnvironment();
  } catch (error) {
    console.log(
      `  the credential export failed: ${error.message.split("\n")[0]}`,
    );
    return false;
  }
  const claude = binaries().child;
  const home = fs.mkdtempSync(path.join(tmp, "swp1-claude-"));
  const proxyLog = path.join(home, "proxy.log");
  const proxy = spawn(
    process.execPath,
    [
      path.join(REPO, "scripts", "live-proofs", "p57-model-proxy.mjs"),
      String(PROXY_PORT),
      proxyLog,
    ],
    { stdio: "ignore" },
  );
  try {
    await sleep(1000);
    const isolated = {
      ...Object.fromEntries(
        Object.entries(realEnv).filter(
          ([name]) =>
            !/^(KIROCREW|AVOOZL|AICOMMANDER|NUPP_WORKSPACE|AWS_|ANTHROPIC)/.test(
              name,
            ),
        ),
      ),
      ...env,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(home, "config"),
      XDG_STATE_HOME: path.join(home, "state"),
      CLAUDE_CONFIG_DIR: path.join(home, "claude-config"),
    };
    fs.mkdirSync(isolated.CLAUDE_CONFIG_DIR, { recursive: true });
    const ran = await new Promise((resolve) => {
      const child = spawn(
        claude,
        ["-p", "--model", MODEL, "Reply with the single word ok."],
        { cwd: home, env: isolated, stdio: ["ignore", "pipe", "pipe"] },
      );
      let out = "",
        err = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (err += chunk));
      const timer = setTimeout(() => child.kill("SIGKILL"), 180_000);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, out, err });
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ code: -1, out, err: error.message });
      });
    });
    if (ran.code === 0 && /\bok\b/i.test(ran.out)) return true;
    console.log(`  claude -p exited ${ran.code}:`);
    for (const line of `${ran.err}\n${ran.out}`.trim().split("\n").slice(-8))
      console.log(`    ${line}`);
    if (fs.existsSync(proxyLog))
      for (const line of fs
        .readFileSync(proxyLog, "utf8")
        .trim()
        .split("\n")
        .slice(-4))
        console.log(`    proxy: ${line}`);
    return false;
  } finally {
    proxy.kill("SIGTERM");
    fs.rmSync(home, { recursive: true, force: true });
  }
}

async function preflight() {
  const checks = [
    [
      "scratch root is under the temporary folder",
      ROOT.startsWith(tmp + path.sep),
    ],
    [
      "built standalone page",
      fs.existsSync(
        path.join(
          REPO,
          "kirocrew-app",
          "ui",
          "dist",
          "standalone",
          "index.html",
        ),
      ),
    ],
    ["git", spawnSync("git", ["--version"]).status === 0],
    ["curl", spawnSync("curl", ["--version"]).status === 0],
    [
      "a Chrome (AVOOZL_CHROME or an install)",
      Boolean(
        (await imp("kirocrew-app/ui/test/browser/chrome.mjs")).findChrome(),
      ),
    ],
    ...(AGENT === "claude"
      ? [
          [
            "the real Claude Code binary (SWP1_CLAUDE, PATH or ~/.toolbox/tools/claude-code)",
            Boolean(claudeBinary()),
          ],
          [
            "~/.claude/settings.json is readable",
            fs.existsSync(
              path.join(
                realEnv.HOME ?? os.homedir(),
                ".claude",
                "settings.json",
              ),
            ),
          ],
          [
            "sandbox-exec works here (a terminal outside Kiro Crew)",
            Boolean((await imp("src/app/sandbox.mjs")).sandboxKind()),
          ],
          [
            "the model proxy script",
            fs.existsSync(
              path.join(REPO, "scripts", "live-proofs", "p57-model-proxy.mjs"),
            ),
          ],
        ]
      : []),
  ];
  for (const [what, ok] of checks)
    console.log(`${ok ? "ok     " : "MISSING"} ${what}`);
  if (AGENT !== "claude") return checks.every(([, ok]) => ok);
  const { exportWith, child } = binaries();
  console.log(`        credential export with ${exportWith ?? "(none)"}`);
  console.log(`        the child runs ${child ?? "(none)"}`);
  // Last, since it spends one small model turn.
  const answered = await claudeAnswers();
  console.log(
    `${answered ? "ok     " : "FAILED "} one \`claude -p\` turn under the isolated environment, through the proxy`,
  );
  return answered && checks.every(([, ok]) => ok);
}

async function prove() {
  if (AGENT === "claude") {
    if (!(await imp("src/app/sandbox.mjs")).sandboxKind())
      throw Error(
        "sandbox-exec cannot run here (inside another sandbox?). Run sw-p1 from a terminal outside Kiro Crew; `preflight` lists what is missing.",
      );
    // Read once, before the isolated home is set: short-lived keys, in memory.
    AGENT_ENV = bedrockEnvironment();
  }
  const { findChrome, launch } = await imp(
    "kirocrew-app/ui/test/browser/chrome.mjs",
  );
  const browser = await launch(findChrome());
  const page = await browser.page();
  isolate();
  const port = values.port ? Number(values.port) : await freePort();
  const machine = await setup(port);
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
  let supervisor = startSupervisor();
  try {
    await until(
      "serve.json",
      () => readJson(path.join(machine.stateDirectory, "serve.json")),
      { timeoutMs: 60_000 },
    );
    await step1(page, port);
    await step2(page, port, machine);
    await step3(page, port, machine);
    await step4(page, port);
    supervisor = await step5(page, port, supervisor, machine, startSupervisor);
  } catch (error) {
    if (!(error instanceof ProofAbort)) throw error;
    event("abort", { reason: error.message });
  } finally {
    await browser.close();
    await stopSupervisor(supervisor);
    if (proxy) proxy.kill("SIGTERM");
  }
  const pass = results.length === 5 && results.every((r) => r.pass);
  const report = {
    proof: "SW-P1",
    agent: AGENT,
    pass,
    at: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(
    path.join(ROOT, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (values.receipt) {
    fs.mkdirSync(path.dirname(path.resolve(values.receipt)), {
      recursive: true,
    });
    fs.writeFileSync(
      values.receipt,
      [
        `# Receipt: standalone-web proof sw-p1 (${AGENT === "claude" ? "Claude Code" : "scripted agent: not the proof"})`,
        "",
        `Result: ${pass ? "PASS" : "FAIL"} at ${report.at}`,
        "",
        ...results.map(
          (r) =>
            `- ${r.pass ? "PASS" : "FAIL"} ${r.step}\n  - ${JSON.stringify(r.detail)}`,
        ),
        "",
        "Screenshots stay outside git (AGENTS.md).",
        "",
      ].join("\n"),
    );
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = pass ? 0 : 1;
}

if (positionals[0] === "preflight") {
  process.exitCode = (await preflight()) ? 0 : 1;
} else await prove();
