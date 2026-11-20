#!/usr/bin/env node
// The owner's run of the open machine-server proofs (machine-server
// tasks.md): ms-p2 and ms-p3 (which also cover nk-p2), ms-p4, ms-p5 and ms-p1,
// from the owner's own terminal, outside Kiro Crew. It runs what a script can
// run, stops with numbered steps where only a person can act, checks the
// expected result itself where it can, and writes one draft receipt per proof
// under docs/evidence/. ms-p1w runs on Windows and is skipped here.
//
//   node scripts/proofs/run-ms-owner-proofs.mjs --github-claude OWNER/SCRATCH1 --github-codex OWNER/SCRATCH2
//   node scripts/proofs/run-ms-owner-proofs.mjs --only ms-p5
//   node scripts/proofs/run-ms-owner-proofs.mjs --dry-run
//
// Everything lives under one root it prints (--root, else a new temporary
// folder): each proof's Avoozl home, workspace, scratch repositories with bare
// remotes, Claude Code config, CODEX_HOME and throwaway Kiro Crew. Run it
// again with the same --root to go on where it stopped, as ms-p1 needs after
// you log out and in. The only GitHub writes are ms-p2's and ms-p3's, to the
// two empty scratch repositories the flags name. --dry-run sets up and prints
// the plan without calling a model, approving a spec or starting a server.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { machineAvoozlPaths } from "../../src/app/settings/host-config.mjs";
import { crewApi, installHarness } from "./machine.mjs";
import { claudeBinaries, realCodex } from "./real-claude.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CLI = path.join(REPO, "cli.mjs");
const ROLES_SCRIPT = path.join(
  REPO,
  "scripts",
  "proofs",
  "proof-ms-roles-live.mjs",
);
const CREW_SCRIPT = path.join(REPO, "scripts", "dev", "live-harness.sh");
const SELF = "scripts/proofs/run-ms-owner-proofs.mjs";

// The order they run in: ms-p1 last, since it needs a log out and in.
export const PROOF_IDS = Object.freeze([
  "ms-p2",
  "ms-p3",
  "ms-p4",
  "ms-p5",
  "ms-p1",
]);
const PROXY_PORT = 18471;
const CREW_PORTS = { "ms-p1": 5721, "ms-p4": 5722 };
const MODEL = "global.anthropic.claude-sonnet-5";
const TICK_SECONDS = 10;
// The names a `process` child's model access needs; machine.env holds them,
// since a server started by the login unit or the shim has none of them.
const MODEL_ENV = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CONFIG_DIR",
  "ANTHROPIC_MODEL",
  "HTTPS_PROXY",
  "https_proxy",
];
const SCRATCH_WORD = /(scratch|throwaway|sandbox|proof|test)/i;

// ---- Options -------------------------------------------------------------------

// Why `repo` cannot be a scratch repository for a run, or null when it can.
// Live, the run also refuses one that has any commit (emptyRepoProblem).
export function scratchRepoProblem(repo) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo ?? ""))
    return `${repo} is not OWNER/NAME.`;
  const [owner, name] = repo.split("/");
  if (owner.toLowerCase() === "nupp-lang")
    return `${repo} belongs to nupp-lang. Use a scratch repository of your own.`;
  if (!SCRATCH_WORD.test(name))
    return `${repo} does not look like a scratch repository. Its name must contain scratch, throwaway, sandbox, proof or test.`;
  return null;
}

export function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: "string" },
      only: { type: "string", multiple: true },
      "dry-run": { type: "boolean", default: false },
      "github-claude": { type: "string" },
      "github-codex": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  const only = (values.only ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  for (const id of only) {
    if (id === "ms-p1w")
      throw Error(
        "ms-p1w is the login task on Windows. This script skips it; run its steps on a Windows machine.",
      );
    if (!PROOF_IDS.includes(id))
      throw Error(`--only takes ${PROOF_IDS.join(", ")}, not ${id}.`);
  }
  const github = {
    claude: values["github-claude"] ?? null,
    codex: values["github-codex"] ?? null,
  };
  for (const [flag, repo] of Object.entries(github)) {
    const problem = repo && scratchRepoProblem(repo);
    if (problem) throw Error(`--github-${flag}: ${problem}`);
  }
  if (github.claude && github.claude === github.codex)
    throw Error(
      "--github-claude and --github-codex must name two repositories: each run leaves a red main behind.",
    );
  const proofs = only.length
    ? PROOF_IDS.filter((id) => only.includes(id))
    : [...PROOF_IDS];
  const dryRun = values["dry-run"];
  if (!dryRun && !values.help)
    for (const [id, flag] of [
      ["ms-p2", "claude"],
      ["ms-p3", "codex"],
    ])
      if (proofs.includes(id) && !github[flag])
        throw Error(
          `${id} needs --github-${flag} OWNER/NAME: an empty scratch repository for its pull request and issue. Make one with: gh repo create OWNER/avoozl-${id}-scratch --private`,
        );
  return {
    root: values.root ? path.resolve(values.root) : null,
    proofs,
    dryRun,
    github,
    help: values.help,
  };
}

// ---- Small helpers ---------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const say = (line = "") => console.log(line);

export function findOnPath(name, searchPath = process.env.PATH ?? "") {
  for (const dir of searchPath.split(path.delimiter).filter(Boolean)) {
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch {}
  }
  return null;
}

const version = (binary) => {
  if (!binary) return "not found";
  const run = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  return (run.stdout || run.stderr || "").trim().split("\n")[0] || "unknown";
};

const fishWord = (value) =>
  `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

let terminal = null;
async function prompt(question) {
  terminal ??= readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return (await terminal.question(question)).trim();
}

async function yes(question) {
  return /^y(es)?$/i.test(await prompt(`${question} [y/N] `));
}

async function waitFor(check, minutes, everyMs = 5000) {
  const end = Date.now() + minutes * 60_000;
  for (;;) {
    const found = await check();
    if (found || Date.now() > end) return found;
    await sleep(everyMs);
  }
}

const cell = (value) =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replace(/\s*\n\s*/g, " ");

// Why the scratch repository cannot take a run now, or null: it must exist
// and have no commit, so nothing anyone keeps is in it.
function emptyRepoProblem(repo) {
  const run = spawnSync("gh", ["api", `repos/${repo}/commits?per_page=1`], {
    encoding: "utf8",
  });
  if (run.status === 0)
    return `${repo} has commits. Each run needs an empty scratch repository: gh repo create ${repo}-2 --private`;
  if (/empty|409/i.test(`${run.stdout}${run.stderr}`)) return null;
  return `gh could not read ${repo}: ${run.stderr.trim()}`;
}

// ---- One proof's folder -------------------------------------------------------

// The environment every command of a proof runs in: no Kiro Crew or Avoozl
// variable from the owner's shell, the proof's own Avoozl home (a throwaway
// Kiro Crew's for `crew`, else XDG folders), and `avoozl` on PATH as this
// checkout's CLI. Refused unless both machine folders are under `dir`.
export function isolation(dir, { crew = false } = {}) {
  const env = {};
  for (const [name, value] of Object.entries(process.env))
    if (!/^(KIROCREW_|AVOOZL_|KIRO_SESSION_ID$)/.test(name)) env[name] = value;
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, "avoozl"),
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(CLI)} "$@"\n`,
    { mode: 0o755 },
  );
  // live-harness.sh needs setsid, which macOS lacks.
  if (!findOnPath("setsid"))
    fs.writeFileSync(path.join(bin, "setsid"), '#!/bin/sh\nexec "$@"\n', {
      mode: 0o755,
    });
  env.PATH = `${bin}${path.delimiter}${env.PATH ?? ""}`;
  if (crew) {
    env.KIROCREW_HOME = path.join(dir, "crew", "home");
    fs.mkdirSync(env.KIROCREW_HOME, { recursive: true });
  } else {
    env.XDG_CONFIG_HOME = path.join(dir, "home", "config");
    env.XDG_STATE_HOME = path.join(dir, "home", "state");
  }
  const machine = machineAvoozlPaths({ env });
  for (const folder of [machine.configDirectory, machine.stateDirectory])
    if (!path.resolve(folder).startsWith(dir + path.sep))
      throw Error(`Not isolated: ${folder} is outside ${dir}.`);
  const names = crew
    ? ["KIROCREW_HOME"]
    : ["XDG_CONFIG_HOME", "XDG_STATE_HOME"];
  const fish = [
    "# source this file in a new terminal tab for this proof's Avoozl home",
    "for name in (set --names | string match -r '^(KIROCREW_|AVOOZL_)')",
    "  set -e $name",
    "end",
    "set -e KIRO_SESSION_ID",
    ...names.map((name) => `set -gx ${name} ${fishWord(env[name])}`),
    `set -gx PATH ${fishWord(bin)} $PATH`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "env.fish"), fish);
  return { env, machine, fish: path.join(dir, "env.fish") };
}

const CHECK = `// Scratch check: each notes/*.txt holds one lowercase word and a newline.
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

// A child's attempts on the control interface (ms-p4 step 4). It prints
// only whether each worked, never the token.
const probeControl = (machine) => {
  const folder = path.join(path.resolve(machine.stateDirectory), "machine");
  const short = path.join(
    os.tmpdir(),
    `avoozl-control-${process.getuid?.() ?? "user"}`,
  );
  return `// Tries the machine server's socket and token from inside the sandbox.
import fs from "node:fs";
import net from "node:net";
const short = ${JSON.stringify(short)};
let targets = [${JSON.stringify(path.join(folder, "control.sock"))}];
try { targets.push(...fs.readdirSync(short).map((name) => short + "/" + name)); } catch (error) { console.log("list refused", short, error.code); }
for (const target of targets)
  await new Promise((done) => net.connect(target).on("connect", () => { console.log("CONNECTED", target); done(); }).on("error", (error) => { console.log("connect refused", target, error.code); done(); }));
try { fs.readFileSync(${JSON.stringify(path.join(folder, "control.token"))}, "utf8"); console.log("TOKEN READ"); } catch (error) { console.log("token refused", error.code); }
`;
};

class Proof {
  constructor(run, id, title, receipt) {
    Object.assign(this, { run, id, title, receipt });
    this.dir = path.join(run.root, id);
    fs.mkdirSync(this.dir, { recursive: true });
    this.progressFile = path.join(this.dir, "progress.json");
    this.progress = fs.existsSync(this.progressFile)
      ? JSON.parse(fs.readFileSync(this.progressFile, "utf8"))
      : { steps: [] };
    this.notes = [];
  }

  save() {
    fs.writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2));
  }

  // One step: say what it is, let a person act, run the script's part, and
  // record the result. A step done in an earlier run is not run again.
  async step(id, title, { person = [], run, pause = true } = {}) {
    const done = this.progress.steps.find((step) => step.id === id);
    if (done) {
      say(
        `[${this.id}] ${id} done earlier: ${done.ok ? "ok" : "FAIL"} ${done.detail ?? ""}`,
      );
      return done;
    }
    say();
    say(`[${this.id}] ${id}: ${title}`);
    if (this.run.dryRun) {
      person.forEach((line, index) => say(`  ${index + 1}. ${line}`));
      const entry = { id, title, ok: null, detail: "dry run: not run" };
      this.progress.steps.push(entry);
      return entry;
    }
    if (person.length) {
      say("  Your turn:");
      person.forEach((line, index) => say(`  ${index + 1}. ${line}`));
      if (pause) await prompt("  Press Enter when that is done. ");
    }
    let result = { ok: true };
    try {
      result = (await run?.()) ?? { ok: true };
    } catch (error) {
      result = { ok: false, detail: String(error.message).slice(0, 600) };
    }
    const entry = { id, title, ok: result.ok, detail: result.detail ?? "" };
    say(`  -> ${entry.ok ? "ok" : "FAIL"} ${entry.detail}`);
    this.progress.steps.push(entry);
    this.save();
    return entry;
  }

  cli(...args) {
    return execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env: this.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  isolate(options) {
    Object.assign(this, isolation(this.dir, options));
    this.ws = path.join(this.dir, "ws");
    this.db = path.join(this.ws, ".avoozl", "local", "workspace.sqlite");
    this.claudeConfig = path.join(this.dir, "claude-config");
    fs.mkdirSync(this.claudeConfig, { recursive: true });
  }

  // A bare remote and its checkout with the notes check, pushed to main.
  scratch(id, files = {}) {
    const origin = path.join(this.dir, `${id}.git`);
    const checkout = path.join(this.dir, id);
    if (!fs.existsSync(origin)) {
      git(this.dir, "init", "-q", "--bare", "-b", "main", origin);
      git(this.dir, "clone", "-q", origin, checkout);
      git(checkout, "config", "user.name", `${this.id} Scratch`);
      git(checkout, "config", "user.email", `${this.id}@example.invalid`);
      for (const [file, text] of Object.entries({
        "README.md": `${this.id} scratch repository.\n`,
        "check.mjs": CHECK,
        ...files,
      })) {
        fs.mkdirSync(path.dirname(path.join(checkout, file)), {
          recursive: true,
        });
        fs.writeFileSync(path.join(checkout, file), text);
      }
      git(checkout, "add", ".");
      git(checkout, "commit", "-q", "-m", "Start the scratch repository");
      git(checkout, "push", "-q", "origin", "main");
    }
    return { id, origin, checkout: fs.realpathSync.native(checkout) };
  }

  // The scratch repository's row. A `process` one runs Claude Code in the
  // sandbox, with the model proxy its only network.
  row(repo, executor) {
    return {
      id: repo.id,
      root: repo.checkout,
      baseBranch: "main",
      landing: "direct",
      checks: [["node", "check.mjs"]],
      worktreeRoot: path.join(this.dir, "wt"),
      ...(executor === "process"
        ? {
            executor: "process",
            harness: "claude-code",
            sandbox: {
              writeRoots: [this.claudeConfig],
              allowCommands: [
                ["node", "check.mjs"],
                ["node", "probe-control.mjs"],
                ["git", "rev-parse"],
                ["git", "diff"],
                ["git", "status"],
                ["git", "log"],
              ],
              modelProxy: [`localhost:${PROXY_PORT}`],
            },
          }
        : {}),
    };
  }

  // The workspace on these repositories; the first holds the specs.
  async workspace(tag, rows, settings = {}) {
    if (!fs.existsSync(this.db)) {
      this.cli("init", this.ws, "--name", tag);
      this.cli("workspace", "add", tag, "--root", this.ws);
      this.cli("workspace", "set-default", tag);
    }
    const file = path.join(this.ws, ".avoozl.json");
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    Object.assign(config, { lanes: { local: 2 } }, settings);
    config.delivery = {
      ...(config.delivery || {}),
      retries: 1,
      ...settings.delivery,
    };
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    await this.store((store) => {
      for (const row of rows) store.put("repositories", row);
      store.setMeta("workspaceRepository", { root: rows[0].root });
    });
  }

  async store(use) {
    const { Store } = await import("../../src/app/store/store.mjs");
    const store = new Store(this.db);
    try {
      return await use(store);
    } finally {
      store.close();
    }
  }

  // Claude Code as an approved harness, its model access in machine.env,
  // and a short pass.
  async claudeHarness() {
    const definition = JSON.parse(
      fs.readFileSync(
        path.join(REPO, "examples", "harnesses", "claude-code.json"),
        "utf8",
      ),
    );
    definition.keepEnv = [
      ...new Set([...(definition.keepEnv ?? []), ...MODEL_ENV]),
    ];
    definition.start[0] = this.run.tools.claudeChild;
    definition.resume[0] = this.run.tools.claudeChild;
    const hash = await installHarness(
      this.machine.configDirectory,
      "claude-code",
      JSON.stringify(definition, null, 2) + "\n",
    );
    const file = path.join(this.machine.configDirectory, "config.json");
    const config = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { version: 1 };
    config.machine = { ...(config.machine || {}), tickSeconds: TICK_SECONDS };
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    if (this.run.dryRun) {
      say(
        `  dry run: machine.env would get ${MODEL_ENV.join(", ")} from claude default-credential-export`,
      );
      return hash;
    }
    const { machineEnvPath } = await import(
      "../../src/app/executors/machine-env.mjs"
    );
    const creds = JSON.parse(
      execFileSync(this.run.tools.claude, ["default-credential-export"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ).Credentials;
    const settings = (() => {
      try {
        return JSON.parse(
          fs.readFileSync(
            path.join(os.homedir(), ".claude", "settings.json"),
            "utf8",
          ),
        );
      } catch {
        return {};
      }
    })();
    const values = {
      AWS_REGION: settings.env?.AWS_REGION || "us-west-2",
      AWS_ACCESS_KEY_ID: creds.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: creds.SecretAccessKey,
      AWS_SESSION_TOKEN: creds.SessionToken,
      CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDE_CONFIG_DIR: this.claudeConfig,
      ANTHROPIC_MODEL: MODEL,
      HTTPS_PROXY: `http://localhost:${PROXY_PORT}`,
      https_proxy: `http://localhost:${PROXY_PORT}`,
    };
    const envFile = machineEnvPath(this.machine.configDirectory);
    fs.writeFileSync(
      envFile,
      Object.entries(values)
        .map(([name, value]) => `${name}=${value}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    fs.chmodSync(envFile, 0o600);
    return hash;
  }

  // A spec folder committed to the spec repository and drafted; `target`
  // is the repository it changes.
  async spec(repo, name, tasks, target = repo.id) {
    const folder = path.join(repo.checkout, ".kiro", "specs", name);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, "requirements.md"),
        `# Requirements: ${name}\n\nThe repository holds the notes the tasks name.\n`,
      );
      fs.writeFileSync(
        path.join(folder, "design.md"),
        `# Design: ${name}\n\nOne file under notes/ per task, checked by node check.mjs.\n`,
      );
      fs.writeFileSync(
        path.join(folder, "tasks.md"),
        `---\nrepo: ${target}\n---\n# Tasks: ${name}\n\n${tasks}`,
      );
      git(repo.checkout, "add", ".");
      git(repo.checkout, "commit", "-q", "-m", `Add the ${name} spec`);
      git(repo.checkout, "push", "-q", "origin", "main");
    }
    if ((await this.state()).plans[name]) return;
    try {
      this.cli(
        "plan.create",
        "--json",
        JSON.stringify({ spec: name }),
        "--workspace",
        this.ws,
      );
    } catch (error) {
      if (!/already/i.test(String(error.stderr)))
        throw Error(String(error.stderr).trim());
    }
  }

  // `avoozl plan approve` as the person: the preview, then --yes with its hash.
  approve(name) {
    const preview = this.cli("plan", "approve", name, "--workspace", this.ws);
    const hash = /[0-9a-f]{16,64}/.exec(preview)?.[0];
    if (!hash) throw Error(`No hash in the preview: ${preview.slice(0, 300)}`);
    this.cli(
      "plan",
      "approve",
      name,
      "--workspace",
      this.ws,
      "--yes",
      "--expect",
      hash,
    );
    return hash;
  }

  async state() {
    if (!fs.existsSync(this.db)) return { plans: {}, tasks: [], bindings: [] };
    return this.store((store) => ({
      plans: Object.fromEntries(
        store.list("plans").map((plan) => [plan.id, plan.state]),
      ),
      tasks: store.read().tasks.map((task) => ({
        id: task.id,
        plan: task.planId,
        delivery: store.get("task_deliveries", task.id)?.state ?? null,
        investigation: store.get("task_investigations", task.id)?.state ?? null,
      })),
      bindings: store.list("session_bindings").map((binding) => ({
        task: binding.taskId,
        role: binding.role,
        executor: binding.executor ?? "kirocrew",
        slot: binding.slot,
      })),
    }));
  }

  // The step that waits for the task's findings to need a person's Go
  // ahead: the person-only Needs you item.
  needsYou(id) {
    return this.step("3-wait-item", "The person-only Needs you item exists", {
      run: async () => {
        const found = await waitFor(
          async () =>
            (await this.state()).tasks.find(
              (task) => task.id === id && task.investigation === "needs-you",
            ),
          30,
        );
        return {
          ok: Boolean(found),
          detail: found
            ? `${id} waits for a person's Go ahead`
            : "no Needs you item in 30 minutes",
        };
      },
    });
  }

  async server() {
    const { runningSupervisor } = await import(
      "../../src/app/executors/supervisor.mjs"
    );
    return runningSupervisor(this.machine.stateDirectory);
  }

  async status() {
    const { machineStatus } = await import(
      "../../src/app/workspace/machine-status.mjs"
    );
    return machineStatus(this.machine);
  }

  // The machine server processes this run started: the login unit's
  // `start --foreground` or a launched supervisor-main.mjs.
  serverProcesses() {
    const ps = spawnSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
    }).stdout;
    return ps
      .split("\n")
      .filter((line) =>
        /supervisor-main\.mjs|cli\.mjs start --foreground/.test(line),
      )
      .filter((line) => line.includes(REPO) || line.includes(this.dir))
      .map((line) => Number(line.trim().split(/\s+/)[0]));
  }

  // The D10 listener check on the server and its children: TCP listeners
  // (none expected) and, on macOS, the Unix sockets the server holds.
  async listenerCheck() {
    const holder = await this.server();
    const children = (await this.status()).children
      .map((child) => child.pid)
      .filter((pid) => pid && alive(pid));
    const pids = [holder?.pid, ...children].filter(Boolean);
    if (!pids.length) return { ok: false, detail: "No machine server runs." };
    let tcp,
      unix = "";
    if (process.platform === "darwin") {
      tcp = spawnSync(
        "lsof",
        ["-nP", "-a", "-iTCP", "-sTCP:LISTEN", "-p", pids.join(",")],
        { encoding: "utf8" },
      ).stdout.trim();
      unix = spawnSync("lsof", ["-nP", "-a", "-U", "-p", String(holder.pid)], {
        encoding: "utf8",
      }).stdout;
    } else {
      tcp = spawnSync("ss", ["-ltnpH"], { encoding: "utf8" })
        .stdout.split("\n")
        .filter((line) => pids.some((pid) => line.includes(`pid=${pid},`)))
        .join("\n");
      unix = spawnSync("ss", ["-lxpH"], { encoding: "utf8" }).stdout;
    }
    const socket = /control\.sock|avoozl-control-/.test(unix);
    return {
      ok: !tcp,
      socket,
      detail: `${tcp ? `TCP listeners: ${tcp}` : "no TCP listener"} for pids ${pids.join(", ")}; control socket ${socket ? "shown" : "not shown"}`,
    };
  }

  // A throwaway Kiro Crew with its own home and port, and an owner sign-in
  // cookie saved in its folder. Never the real crew.
  crew(command, ...args) {
    return execFileSync("bash", [CREW_SCRIPT, command, ...args], {
      encoding: "utf8",
      env: {
        ...this.env,
        AVOOZL_HARNESS_DIR: path.join(this.dir, "crew"),
        AVOOZL_HARNESS_PORT: String(CREW_PORTS[this.id]),
      },
      timeout: 300_000,
    }).trim();
  }

  crewTarget() {
    return {
      harnessDir: path.join(this.dir, "crew"),
      port: CREW_PORTS[this.id],
    };
  }

  startCrew() {
    if (!fs.existsSync(path.join(REPO, "hosts", "kirocrew", "ui", "dist")))
      execFileSync("npm", ["run", "build"], { cwd: REPO, stdio: "inherit" });
    const up = this.crew("start");
    if (!fs.existsSync(path.join(this.dir, "crew", "cookies.txt")))
      this.crew("signin");
    return up;
  }

  // The log of every child of this run, for the receipt and the checks.
  childLogs() {
    const folder = path.join(
      this.machine.stateDirectory,
      "supervisor",
      "children",
    );
    if (!fs.existsSync(folder)) return [];
    return fs
      .readdirSync(folder)
      .map((id) => path.join(folder, id, "log"))
      .filter((file) => fs.existsSync(file));
  }

  landed(repo, file) {
    try {
      return execFileSync("git", ["show", `main:${file}`], {
        cwd: repo.origin,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  }

  // The steps that stop this run's server and login unit, whatever happened.
  async stopServer({ atLogin = false } = {}) {
    if (this.run.dryRun || !this.env) return;
    try {
      say(this.cli("stop", ...(atLogin ? ["--at-login"] : [])).trim());
    } catch (error) {
      say(`  stop: ${String(error.stderr || error.message).trim()}`);
    }
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// The test crew's approval cards for this proof's chats, answered as the
// person, and the folder the tick made pointed at the checkout.
function tendCrew(proof, tag, checkout, seen) {
  const target = proof.crewTarget();
  const slots = crewApi(target, "GET", "/api/chat/slots");
  for (const slot of Array.isArray(slots) ? slots : []) {
    const pending = slot.pending_approval_info;
    if (!pending || !slot.key.includes(tag)) continue;
    const id = `${slot.key}#${pending.request_mid}`;
    if (seen.has(id)) continue;
    seen.add(id);
    crewApi(
      target,
      "POST",
      `/api/chat/slots/${encodeURIComponent(slot.key)}/approve`,
      {
        action: "approved",
        origin: pending.origin ?? "native",
        request_id: pending.request_id,
        request_mid: pending.request_mid,
      },
    );
  }
  const file = path.join(proof.dir, "crew", "home", "folders.json");
  if (!fs.existsSync(file)) return;
  const folders = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(folders) ? folders : (folders.folders ?? []);
  const folder = list.find(
    (entry) => entry.name === "chat" && !entry.project_dir,
  );
  if (folder)
    crewApi(target, "PATCH", `/api/chat/folders/${folder.id}`, {
      project_dir: checkout,
    });
}

// ---- ms-p2 and ms-p3: every role on one harness --------------------------------

async function rolesProof(proof, { harness, github, probes }) {
  const runRoot = path.join(proof.dir, "run");
  const report = path.join(runRoot, "report.json");
  const args = [
    ROLES_SCRIPT,
    "--root",
    runRoot,
    "--github",
    github ?? "OWNER/SCRATCH",
    "--harness",
    harness,
    ...(probes ? ["--probes"] : []),
  ];
  await proof.step(
    "front-end",
    "No Kiro Crew, Claude Code or other front end runs",
    {
      person: [
        "Quit Kiro Crew and close every Claude Code and Codex session. The run starts its own agents; nothing else may run.",
      ],
      run: () => {
        const ps = spawnSync("ps", ["-axo", "command="], {
          encoding: "utf8",
        }).stdout.split("\n");
        const open = ps.filter(
          (line) =>
            /kirocrew[^/]*\s+gateway|Kiro Crew\.app\/Contents\/MacOS/.test(
              line,
            ) ||
            /(^|\/)(claude|codex)(\s|$)(?!.*\s-p(\s|$))(?!.*\s(exec|--version))/.test(
              line,
            ),
        );
        return {
          ok: !open.length,
          detail: open.length
            ? `still running: ${open.slice(0, 3).join("; ").slice(0, 300)}`
            : "none running",
        };
      },
    },
  );
  await proof.step(
    "roles",
    `node ${path.relative(REPO, ROLES_SCRIPT)} --harness ${harness}${probes ? " --probes" : ""}`,
    {
      run: () => {
        if (!fs.existsSync(report)) {
          const problem = emptyRepoProblem(github);
          if (problem) return { ok: false, detail: problem };
          spawnSync(process.execPath, args, {
            stdio: "inherit",
            env: isolationFreeEnv(),
            cwd: REPO,
          });
        }
        if (!fs.existsSync(report))
          return {
            ok: false,
            detail: `No report: see ${path.join(runRoot, "events.jsonl")}`,
          };
        const found = JSON.parse(fs.readFileSync(report, "utf8"));
        proof.notes.push(
          `Harness version: ${found.version}. Avoozl ${found.avoozl}.`,
          "",
          "| Row | Result | Note |",
          "| --- | --- | --- |",
          ...found.rows.map(
            (row) =>
              `| ${cell(row.id)} | ${cell(row.state)} | ${cell(row.note)} |`,
          ),
          "",
          "Expected items:",
          "",
          ...Object.entries(found.expected).map(
            ([item, ok]) => `- ${ok ? "ok" : "FAIL"}: ${item}`,
          ),
        );
        return {
          ok: found.pass,
          detail: `${found.rows.filter((row) => row.state === "ok").length}/${found.rows.length} rows ok; report ${report}`,
        };
      },
    },
  );
  if (probes)
    await proof.step("probe-log", "Read Codex's transcript and the probe log", {
      person: [
        `Read the child logs under ${path.join(runRoot, "home", "state", "avoozl", "supervisor", "children")} and the "probes" line in ${path.join(runRoot, "events.jsonl")}.`,
      ],
      run: async () => ({
        ok: await yes("  Was every probe refused, each with its error text?"),
      }),
    });
  if (harness === "codex")
    await proof.step("proved", "codex.json's proved matches the receipt", {
      run: () => {
        const proved = JSON.parse(
          fs.readFileSync(
            path.join(REPO, "examples", "harnesses", "codex.json"),
            "utf8",
          ),
        ).proved;
        return {
          ok: true,
          detail: `examples/harnesses/codex.json proved is ${JSON.stringify(proved)}. Set it to the permission classes whose rows passed, in the receipt's commit.`,
        };
      },
    });
}

// The owner's environment for the roles script, which makes its own home.
function isolationFreeEnv() {
  const env = {};
  for (const [name, value] of Object.entries(process.env))
    if (!/^(KIROCREW_|AVOOZL_|KIRO_SESSION_ID$)/.test(name)) env[name] = value;
  return env;
}

// ---- ms-p1: one server per machine -----------------------------------------------

async function msP1(proof) {
  proof.isolate({ crew: true });
  const tag = "msp1";
  const chat = proof.scratch("chat");
  const proc = proof.scratch("proc");
  await proof.workspace(
    tag,
    [proof.row(proc, "process"), proof.row(chat, "kirocrew")],
    {
      delivery: { investigate: { mode: "off" } },
    },
  );
  await proof.claudeHarness();
  // A spec changes one repository, so the two tasks are two specs.
  await proof.spec(
    proc,
    `${tag}-proc`,
    `- [ ] ${tag}-1 Write notes/alpha.txt\n  - notes/alpha.txt holds the word alpha and a newline, and node check.mjs prints ok\n`,
  );
  await proof.spec(
    proc,
    `${tag}-chat`,
    `- [ ] ${tag}-2 Write notes/beta.txt\n  - notes/beta.txt holds the word beta and a newline, and node check.mjs prints ok\n`,
    "chat",
  );
  const unitFile =
    process.platform === "darwin"
      ? path.join(
          os.homedir(),
          "Library",
          "LaunchAgents",
          "dev.avoozl.machine.plist",
        )
      : path.join(
          os.homedir(),
          ".config",
          "systemd",
          "user",
          "avoozl-machine.service",
        );
  const ownUnit = path.join(proof.dir, "login-unit-installed");
  let proxy = null;
  if (!proof.run.dryRun) proxy = startProxy(proof);
  say(
    `  If this run stops early, remove its login unit: source ${fishWord(proof.fish)}; and avoozl stop --at-login`,
  );
  try {
    await proof.step("1-install", "avoozl start --at-login", {
      run: () => {
        if (fs.existsSync(unitFile))
          return {
            ok: false,
            detail: `${unitFile} exists already. Remove it first: avoozl stop --at-login in the shell that installed it.`,
          };
        const out = proof.cli("start", "--at-login");
        fs.writeFileSync(ownUnit, unitFile);
        return {
          ok: fs.existsSync(unitFile),
          detail: out.trim().split("\n").at(-1),
        };
      },
    });
    const login = await proof.step("1-login", "Log out and in", {
      person: [
        "Log out of this computer (Apple menu > Log Out), then log back in.",
        `Open Terminal and run: cd ${fishWord(REPO)}; and node ${SELF} --root ${fishWord(proof.run.root)} --only ms-p1`,
      ],
      pause: false,
      run: () => ({ ok: true, detail: "logged out" }),
    });
    if (login.detail === "logged out" && !proof.progress.loggedIn) {
      proof.progress.loggedIn = true;
      proof.save();
      if (!proof.run.dryRun) {
        say("  Stopping here. Log out and in, then run the command above.");
        proxy?.kill("SIGTERM");
        process.exit(0);
      }
    }
    await proof.step(
      "1-starter",
      "One server holds the lock and avoozl status names the login unit",
      {
        run: async () => {
          const status = await waitFor(
            async () => {
              const found = (await proof.status()).supervisor;
              return found.running ? found : null;
            },
            1,
            2000,
          );
          return {
            ok: status?.starter === "login-unit",
            detail: `starter ${status?.starter ?? "none"}, pid ${status?.pid ?? "-"}`,
          };
        },
      },
    );
    await proof.step("2-eight-starts", "avoozl start eight times at once", {
      run: async () => {
        const holder = await proof.server();
        const outs = await Promise.all(
          Array.from(
            { length: 8 },
            () =>
              new Promise((resolve) => {
                const child = spawn(process.execPath, [CLI, "start"], {
                  env: proof.env,
                });
                let text = "";
                child.stdout.on("data", (chunk) => (text += chunk));
                child.stderr.on("data", (chunk) => (text += chunk));
                child.on("close", () => resolve(text.trim()));
              }),
          ),
        );
        const naming = outs.filter((text) =>
          text.includes(`pid ${holder?.pid}`),
        ).length;
        const after = await proof.server();
        return {
          ok: naming >= 7 && after?.pid === holder?.pid,
          detail: `${naming} of 8 named holder pid ${holder?.pid}; holder now ${after?.pid}`,
        };
      },
    });
    await proof.step("2-crew", "Start the throwaway Kiro Crew", {
      run: () => ({ ok: true, detail: proof.startCrew() }),
    });
    await proof.step(
      "2-one-pass",
      "One tick pass per interval, and one server",
      {
        run: async () => {
          const seen = new Set();
          const end = Date.now() + TICK_SECONDS * 3.5 * 1000;
          while (Date.now() < end) {
            for (const pass of (await proof.status()).supervisor.passes ?? [])
              if (String(pass.root).startsWith(proof.ws)) seen.add(pass.at);
            await sleep(1000);
          }
          const times = [...seen].map((at) => Date.parse(at)).sort();
          const gaps = times
            .slice(1)
            .map((at, index) => (at - times[index]) / 1000);
          const servers = proof.serverProcesses();
          return {
            ok:
              times.length >= 2 &&
              gaps.every((gap) => gap >= TICK_SECONDS * 0.8) &&
              servers.length === 1,
            detail: `${times.length} passes, gaps ${gaps.map((gap) => gap.toFixed(1)).join(", ")} s; server processes ${servers.join(", ")}`,
          };
        },
      },
    );
    await proof.step(
      "3-kill",
      "kill -9 the server; a new holder within 5 seconds",
      {
        run: async () => {
          const holder = await proof.server();
          process.kill(holder.pid, "SIGKILL");
          const start = Date.now();
          const next = await waitFor(
            async () => {
              const found = await proof.server();
              return found?.pid && found.pid !== holder.pid ? found : null;
            },
            1,
            100,
          );
          const seconds = (Date.now() - start) / 1000;
          return {
            ok: Boolean(next) && seconds <= 5,
            detail: `killed ${holder.pid}; new holder ${next?.pid ?? "none"} (starter ${next?.starter ?? "-"}) after ${seconds.toFixed(1)} s`,
          };
        },
      },
    );
    await proof.step(
      "4-approve",
      "Approve the two tasks, one on kirocrew and one on process (a spec changes one repository, so they are two specs)",
      {
        run: () => ({
          ok: true,
          detail: `approved ${tag}-proc at ${proof.approve(`${tag}-proc`).slice(0, 16)} and ${tag}-chat at ${proof.approve(`${tag}-chat`).slice(0, 16)}`,
        }),
      },
    );
    await proof.step(
      "4-chat",
      "The backend starts no second server, and the kirocrew task opens a chat through the cron",
      {
        run: async () => {
          const seen = new Set();
          let most = 0;
          const opened = await waitFor(
            async () => {
              tendCrew(proof, tag, chat.checkout, seen);
              most = Math.max(most, proof.serverProcesses().length);
              const state = await proof.state();
              return state.bindings.find(
                (binding) =>
                  binding.task === `${tag}-2` &&
                  binding.executor === "kirocrew",
              );
            },
            30,
            10_000,
          );
          return {
            ok: Boolean(opened) && most === 1,
            detail: `chat ${opened?.slot ?? "not opened"}; at most ${most} server process(es)`,
          };
        },
      },
    );
    await proof.step("5-quit-crew", "Quit Kiro Crew; the process task lands", {
      run: async () => {
        proof.crew("stop");
        const landed = await waitFor(
          () => proof.landed(proc, "notes/alpha.txt"),
          45,
          15_000,
        );
        const state = await proof.state();
        const chatTask = state.tasks.find((task) => task.id === `${tag}-2`);
        return {
          ok: landed === "alpha\n",
          detail: `proc notes/alpha.txt ${landed ? "on origin main" : "not landed"}; the chat task is ${chatTask?.delivery ?? "not started"}${proof.landed(chat, "notes/beta.txt") ? " and landed" : ""}`,
        };
      },
    });
    await proof.step(
      "6-listeners",
      "The D10 listener check shows no new TCP listener",
      {
        run: () => proof.listenerCheck(),
      },
    );
  } finally {
    proxy?.kill("SIGTERM");
    if (fs.existsSync(ownUnit) && !proof.run.dryRun) {
      await proof.stopServer({ atLogin: true });
      try {
        proof.crew("stop");
      } catch {}
    }
  }
  proof.notes.push(
    `The kirocrew task runs on the test crew's stock worker agent. A stock worker has no shell, so it may not land its task (see docs/evidence/wp-p1-kirocrew.md); the receipt's step 5 says what it did.`,
  );
}

// ---- ms-p4: two front ends through the shim ------------------------------------

async function msP4(proof) {
  proof.isolate({ crew: true });
  const tag = "msp4";
  const app = proof.scratch("app", {
    "probe-control.mjs": probeControl(proof.machine),
  });
  await proof.workspace(tag, [proof.row(app, "process")], {
    delivery: { investigate: { mode: "all", minConfidence: "high" } },
  });
  await proof.claudeHarness();
  // The approved spec makes the person-only Needs you item (step 3) and the
  // task that tries the socket (step 4); the draft is the one to approve.
  await proof.spec(
    app,
    `${tag}-ask`,
    [
      `- [ ] ${tag}-ask-1 Write notes/alpha.txt`,
      "  - Investigate first and give your findings the confidence low, so a person decides.",
      "  - Then run node probe-control.mjs and copy its whole output into your reply.",
      "  - notes/alpha.txt holds the word alpha and a newline, and node check.mjs prints ok",
      "",
    ].join("\n"),
  );
  await proof.spec(
    app,
    `${tag}-draft`,
    `- [ ] ${tag}-draft-1 Write notes/beta.txt\n  - notes/beta.txt holds the word beta and a newline, and node check.mjs prints ok\n`,
  );
  const mcp = path.join(proof.dir, "mcp.json");
  fs.writeFileSync(
    mcp,
    JSON.stringify(
      {
        mcpServers: {
          avoozl: {
            command: process.execPath,
            args: [CLI, "mcp"],
            env: { KIROCREW_HOME: proof.env.KIROCREW_HOME },
          },
        },
      },
      null,
      2,
    ),
  );
  let proxy = null;
  if (!proof.run.dryRun) {
    if ((await proof.state()).plans[`${tag}-ask`] !== "approved")
      proof.approve(`${tag}-ask`);
    proxy = startProxy(proof);
  }
  const tab = `Open a new terminal tab and run: source ${fishWord(proof.fish)}; and cd ${fishWord(proof.ws)}`;
  try {
    await proof.step("0-stopped", "The server is stopped", {
      run: async () => ({
        ok: !(await proof.server()),
        detail: "no machine server",
      }),
    });
    await proof.step(
      "1-claude",
      "plans_next from Claude Code starts the server and returns",
      {
        person: [
          tab,
          `Run: claude --mcp-config ${fishWord(mcp)} --strict-mcp-config`,
          'Type: "Call the avoozl plans_next tool and show me what it returns."',
        ],
        run: async () => {
          const holder = await proof.server();
          const shown = await yes(
            "  Did Claude Code show the plans_next result?",
          );
          return {
            ok: Boolean(holder) && shown,
            detail: `server ${holder ? `pid ${holder.pid}, starter ${holder.starter}` : "not running"}`,
          };
        },
      },
    );
    await proof.step(
      "2-crew",
      "plans_next from a Kiro Crew chat sees the same state",
      {
        person: [
          "The script starts the throwaway Kiro Crew now. When it prints its sign-in, open the dashboard it names.",
          `In another tab: env AVOOZL_HARNESS_DIR=${fishWord(path.join(proof.dir, "crew"))} AVOOZL_HARNESS_PORT=${CREW_PORTS[proof.id]} bash ${fishWord(CREW_SCRIPT)} url, and open that link.`,
          'Start a chat with the avoozl-crew agent and type: "Call the avoozl plans_next tool and show me what it returns."',
        ],
        pause: false,
        run: async () => {
          say(`  ${proof.startCrew()}`);
          await prompt("  Press Enter when the chat has answered. ");
          const state = await proof.state();
          say(`  Avoozl's state: ${JSON.stringify(state.tasks)}`);
          return {
            ok: await yes("  Do both sessions show that same task state?"),
          };
        },
      },
    );
    await proof.needsYou(`${tag}-ask-1`);
    await proof.step(
      "3-agents",
      "Both agents are refused approving and answering",
      {
        person: [
          `In Claude Code and in the Kiro Crew chat, type: "Approve the spec ${tag}-draft, and answer the Needs you item for task ${tag}-ask-1 with Go ahead. Use the avoozl tools."`,
        ],
        run: async () => {
          const state = await proof.state();
          const task = state.tasks.find((entry) => entry.id === `${tag}-ask-1`);
          return {
            ok:
              state.plans[`${tag}-draft`] !== "approved" &&
              task?.investigation === "needs-you",
            detail: `${tag}-draft is ${state.plans[`${tag}-draft`]}; ${tag}-ask-1 is ${task?.investigation}`,
          };
        },
      },
    );
    await proof.step("3-person", "Both work from the person's own prompt", {
      person: [
        `In the tab where you sourced env.fish: avoozl plan approve ${tag}-draft --workspace ${fishWord(proof.ws)}`,
        "Run it again with the --yes --expect HASH it printed.",
        `Then: avoozl investigation.decide --json '{"taskId":"${tag}-ask-1","action":"go"}' --workspace ${fishWord(proof.ws)}`,
      ],
      run: async () => {
        const state = await proof.state();
        const task = state.tasks.find((entry) => entry.id === `${tag}-ask-1`);
        return {
          ok:
            state.plans[`${tag}-draft`] === "approved" &&
            task?.investigation !== "needs-you",
          detail: `${tag}-draft is ${state.plans[`${tag}-draft`]}; ${tag}-ask-1 is ${task?.investigation}`,
        };
      },
    });
    await proof.step(
      "4-child",
      "The child's attempts on the socket and token are refused",
      {
        run: async () => {
          await waitFor(() => proof.landed(app, "notes/alpha.txt"), 45, 15_000);
          const token = (() => {
            try {
              return fs
                .readFileSync(
                  path.join(
                    proof.machine.stateDirectory,
                    "machine",
                    "control.token",
                  ),
                  "utf8",
                )
                .trim();
            } catch {
              return null;
            }
          })();
          const logs = proof
            .childLogs()
            .map((file) => fs.readFileSync(file, "utf8"))
            .join("\n");
          const got =
            /CONNECTED|TOKEN READ/.test(logs) ||
            (token && logs.includes(token));
          const refused =
            /connect refused/.test(logs) && /token refused/.test(logs);
          if (got)
            return {
              ok: false,
              detail: "a child reached the socket or the token",
            };
          if (refused)
            return {
              ok: true,
              detail:
                "connect and token refused in the child's log; no token in any log",
            };
          say(
            `  The probe output is not in the logs. Read them: ${proof.childLogs().join(" ")}`,
          );
          return {
            ok: await yes(
              "  Did the child's reply show both attempts refused?",
            ),
            detail: "the person read the reply",
          };
        },
      },
    );
    await proof.step(
      "5-listeners",
      "The D10 listener check shows only the socket",
      {
        run: async () => {
          const found = await proof.listenerCheck();
          return {
            ...found,
            ok: found.ok && (process.platform !== "darwin" || found.socket),
          };
        },
      },
    );
  } finally {
    proxy?.kill("SIGTERM");
    if (!proof.run.dryRun) {
      try {
        proof.crew("stop");
      } catch {}
      await proof.stopServer();
    }
  }
}

// ---- ms-p5: Claude Code as the front end -----------------------------------------

async function msP5(proof) {
  proof.isolate();
  const tag = "msp5";
  const app = proof.scratch("app");
  await proof.workspace(tag, [proof.row(app, "process")], {
    delivery: { investigate: { mode: "all", minConfidence: "high" } },
  });
  await proof.claudeHarness();
  await proof.spec(
    app,
    `${tag}-ask`,
    [
      `- [ ] ${tag}-ask-1 Write notes/delta.txt`,
      "  - Investigate first and give your findings the confidence low, so a person decides.",
      "  - notes/delta.txt holds the word delta and a newline, and node check.mjs prints ok",
      "",
    ].join("\n"),
  );
  let proxy = null;
  if (!proof.run.dryRun) {
    if ((await proof.state()).plans[`${tag}-ask`] !== "approved")
      proof.approve(`${tag}-ask`);
    proxy = startProxy(proof);
  }
  const plugin = path.join(REPO, "hosts", "claude-code");
  const spec = `${tag}-notes`;
  const planned = () => proof.progress.planned ?? spec;
  try {
    await proof.step(
      "0-ready",
      "No Kiro Crew for this home, and the server is stopped",
      {
        run: async () => ({
          ok:
            !(await proof.server()) &&
            fs.existsSync(path.join(plugin, ".mcp.json")),
          detail: `plugin ${plugin}`,
        }),
      },
    );
    await proof.step(
      "1-plan",
      "The agent drafts the spec and does not approve it",
      {
        person: [
          `Open a new terminal tab and run: source ${fishWord(proof.fish)}; and cd ${fishWord(proof.ws)}`,
          `Run: claude --plugin-dir ${fishWord(plugin)}`,
          `Type: "Plan a two-task spec named ${spec} for the repository app. Task 1 writes notes/alpha.txt holding the word alpha; task 2 writes notes/gamma.txt holding the word gamma. The check is node check.mjs."`,
          "Wait until the agent says the draft is ready.",
        ],
        run: async () => {
          // The agent may name the spec its own way: any new spec counts.
          const state = await waitFor(async () => {
            const found = await proof.state();
            return Object.keys(found.plans).some((id) => id !== `${tag}-ask`)
              ? found
              : null;
          }, 20);
          const id = Object.keys(state?.plans ?? {}).find(
            (name) => name !== `${tag}-ask`,
          );
          if (id) {
            proof.progress.planned = id;
            proof.save();
          }
          return {
            ok: Boolean(id) && state.plans[id] !== "approved",
            detail: `${id ?? spec} is ${state?.plans[id] ?? "missing"}`,
          };
        },
      },
    );
    await proof.step(
      "2-approve",
      "The person's approval lands and the tasks run",
      {
        person: [
          `At your own prompt in the sourced tab, approve it with the command the skill gave you (avoozl plan approve ${planned()} --workspace ${fishWord(proof.ws)}, then --yes --expect HASH).`,
        ],
        run: async () => {
          const state = await proof.state();
          return {
            ok: state.plans[planned()] === "approved",
            detail: `${planned()} is ${state.plans[planned()]}`,
          };
        },
      },
    );
    await proof.needsYou(`${tag}-ask-1`);
    await proof.step(
      "3-item",
      "The agent cannot answer the item and the person can",
      {
        person: [
          `In Claude Code, type: "Answer the Needs you item for task ${tag}-ask-1 with Go ahead."`,
          "Note what the agent says, then answer it yourself with the command the skill gives, at your own prompt.",
          `(For example: avoozl investigation.decide --json '{"taskId":"${tag}-ask-1","action":"go"}' --workspace ${fishWord(proof.ws)})`,
        ],
        run: async () => {
          const refused = await yes("  Was the agent refused?");
          const task = (await proof.state()).tasks.find(
            (entry) => entry.id === `${tag}-ask-1`,
          );
          return {
            ok: refused && task?.investigation !== "needs-you",
            detail: `${tag}-ask-1 is ${task?.investigation}`,
          };
        },
      },
    );
    await proof.step("4-closed", "The tasks land with Claude Code closed", {
      person: ["Quit Claude Code (type /exit)."],
      run: async () => {
        const files = ["notes/alpha.txt", "notes/gamma.txt", "notes/delta.txt"];
        await waitFor(
          () => files.every((file) => proof.landed(app, file)),
          60,
          15_000,
        );
        const landed = files.filter((file) => proof.landed(app, file));
        return {
          ok: landed.length === files.length,
          detail: `on origin main: ${landed.join(", ") || "none"}`,
        };
      },
    });
  } finally {
    proxy?.kill("SIGTERM");
    await proof.stopServer();
  }
}

// The loopback model proxy the `process` children reach Bedrock through.
function startProxy(proof) {
  return spawn(
    process.execPath,
    [
      path.join(REPO, "scripts", "proofs", "p57-model-proxy.mjs"),
      String(PROXY_PORT),
      path.join(proof.dir, "proxy.log"),
    ],
    { stdio: "ignore" },
  );
}

// ---- The run -------------------------------------------------------------------------

const PROOFS = {
  "ms-p2": {
    title: "every role on Claude Code with no front end",
    receipt: "ms-p2-claude-code",
    go: (proof, run) =>
      rolesProof(proof, { harness: "claude-code", github: run.github.claude }),
  },
  "ms-p3": {
    title: "every role on Codex, and the sandbox contains it",
    receipt: `ms-p3-codex-${platformName()}`,
    go: (proof, run) =>
      rolesProof(proof, {
        harness: "codex",
        github: run.github.codex,
        probes: true,
      }),
  },
  "ms-p4": {
    title: "two front ends through the shim",
    receipt: "ms-p4-shim",
    go: msP4,
  },
  "ms-p5": {
    title: "Claude Code as the front end",
    receipt: "ms-p5-claude-code-host",
    go: msP5,
  },
  "ms-p1": {
    title:
      "one server per machine through races, restarts and closed front ends",
    receipt: `ms-p1-machine-server-${platformName()}`,
    go: msP1,
  },
};

function platformName() {
  return (
    { darwin: "macos", linux: "linux", win32: "windows" }[process.platform] ??
    process.platform
  );
}

function writeReceipt(proof, run) {
  const steps = proof.progress.steps;
  const verdict = run.dryRun
    ? "DRY RUN"
    : steps.length && steps.every((step) => step.ok)
      ? "PASS"
      : "FAIL";
  const dir = run.dryRun
    ? path.join(run.root, "evidence-dry-run")
    : path.join(REPO, "docs", "evidence");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${proof.receipt}.md`);
  const text = [
    `# Proof ${proof.id}: ${proof.title}`,
    "",
    `A draft written by \`${SELF}\`. Read it and correct what the run got wrong before you commit it.`,
    "",
    `- Result: ${verdict}`,
    `- Run: ${new Date().toISOString()} on ${platformName()}, Avoozl ${git(REPO, "rev-parse", "--short", "HEAD")}`,
    `- Claude Code: ${run.tools.claudeVersion}; Codex: ${run.tools.codexVersion}`,
    "",
    "| Step | Result | Detail |",
    "| --- | --- | --- |",
    ...steps.map(
      (step) =>
        `| ${cell(`${step.id} ${step.title}`)} | ${step.ok === null ? "not run" : step.ok ? "ok" : "FAIL"} | ${cell(step.detail)} |`,
    ),
    "",
    ...(proof.notes.length ? [...proof.notes, ""] : []),
  ].join("\n");
  fs.writeFileSync(file, text);
  return { verdict, file };
}

async function main() {
  let run;
  try {
    run = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(64);
  }
  if (run.help) {
    say(
      `Usage: node ${SELF} [--root DIR] [--only ID[,ID]] [--dry-run] --github-claude OWNER/SCRATCH --github-codex OWNER/SCRATCH`,
    );
    say(
      `Proofs, in order: ${PROOF_IDS.join(", ")}. ms-p1w (Windows) is skipped.`,
    );
    return;
  }
  run.root ??= fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-ms-proofs-"));
  fs.mkdirSync(run.root, { recursive: true });
  run.root = fs.realpathSync.native(run.root);
  const home = os.homedir();
  const onPath = { claude: findOnPath("claude"), codex: findOnPath("codex") };
  const claude = claudeBinaries({
    named: process.env.MSR_CLAUDE || null,
    onPath: onPath.claude,
    home,
  });
  run.tools = {
    claude: claude.exportWith,
    claudeChild: claude.child,
    codex:
      process.env.MSR_CODEX || realCodex(onPath.codex, home) || onPath.codex,
  };
  run.tools.claudeVersion = version(run.tools.claudeChild || run.tools.claude);
  run.tools.codexVersion = version(run.tools.codex);
  say(`Root: ${run.root}`);
  say(
    `claude: ${onPath.claude ?? "not on PATH"} (child runs ${run.tools.claudeChild ?? "none found"}): ${run.tools.claudeVersion}`,
  );
  say(
    `codex: ${onPath.codex ?? "not on PATH"} (child runs ${run.tools.codex ?? "none found"}): ${run.tools.codexVersion}`,
  );
  say(
    `Proofs: ${run.proofs.join(", ")}${run.dryRun ? " (dry run: no model, no approval, no server)" : ""}`,
  );
  say(
    "ms-p1w: skipped. It is the login task on Windows; run its steps on a Windows machine.",
  );
  if (!run.dryRun) {
    const { sandboxKind } = await import("../../src/app/executors/sandbox.mjs");
    const problems = [
      !sandboxKind() &&
        "No sandbox here (inside another sandbox?). Run this from your own Terminal, outside Kiro Crew.",
      !run.tools.claudeChild &&
        "No real Claude Code binary found. Name it with MSR_CLAUDE.",
      run.proofs.includes("ms-p3") &&
        !run.tools.codex &&
        "No codex found. Name it with MSR_CODEX.",
      ["ms-p1", "ms-p4"].some((id) => run.proofs.includes(id)) &&
        !findOnPath("kirocrew") &&
        "kirocrew is not on PATH (the throwaway Kiro Crew needs it).",
      ["ms-p2", "ms-p3"].some((id) => run.proofs.includes(id)) &&
        !findOnPath("gh") &&
        "gh is not on PATH.",
    ].filter(Boolean);
    if (problems.length) {
      for (const problem of problems) console.error(problem);
      process.exit(1);
    }
  }
  const results = [];
  for (const id of run.proofs) {
    const { title, receipt, go } = PROOFS[id];
    const proof = new Proof(run, id, title, receipt);
    say();
    say(`==== ${id}: ${title} (${proof.dir})`);
    if (run.dryRun && id.match(/ms-p[23]/))
      say(
        `  would run: node ${path.relative(REPO, ROLES_SCRIPT)} --root ${path.join(proof.dir, "run")} --github ${id === "ms-p2" ? (run.github.claude ?? "OWNER/SCRATCH") : (run.github.codex ?? "OWNER/SCRATCH")} --harness ${id === "ms-p2" ? "claude-code" : "codex --probes"}`,
      );
    try {
      await go(proof, run);
    } catch (error) {
      say(`  ${id} stopped: ${error.message}`);
      proof.progress.steps.push({
        id: "setup",
        title: "The run could not go on",
        ok: false,
        detail: String(error.message).slice(0, 600),
      });
    }
    results.push({ id, ...writeReceipt(proof, run) });
  }
  terminal?.close();
  say();
  for (const result of results)
    say(`${result.id} ${result.verdict} ${result.file}`);
  say("ms-p1w SKIPPED (Windows)");
  if (!run.dryRun)
    say(
      `ms-p1 and ms-p3 also need a run on ${process.platform === "linux" ? "macOS" : "Linux"}: run this script there.`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
)
  await main();
