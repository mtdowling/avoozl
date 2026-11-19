#!/usr/bin/env node
// Proof wp-p3 (worker-paths WP5, design D8): two workspaces, one driver and
// one worker, with only ticks.
//
//   node scripts/proof-wp-p3.mjs --root DIR
//
// Everything lives under --root: a bare remote, the driver's checkout and
// the worker's, two workspaces with their own config and state homes, and
// one fake GitHub (a JSON file both read and write) between them. No real
// workspace, Avoozl home, Kiro Crew home or GitHub is read or written.
//
// Each tick runs in its own process with that machine's environment, the
// way each machine's cron would run it. The worker runs `process`; its
// harness is a fake: for each child the tick starts, it writes the task's
// note in the child's worktree and finishes the session as done, through
// the same function the supervisor calls (finishProcessSession). Nothing
// else is run by hand: no `worker`, `spec offer` or `spec claims` command.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SCRIPT), "..");
const CLI = path.join(REPO, "cli.mjs");
const { values } = parseArgs({
  options: {
    root: { type: "string" },
    machine: { type: "string" },
  },
});
if (!values.root) {
  console.error("Usage: node scripts/proof-wp-p3.mjs --root DIR");
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const SPEC = "wpp3";
const TASKS = {
  t1: { file: "notes/t1.txt", word: "alpha" },
  t2: { file: "notes/t2.txt", word: "bravo" },
  // The fake harness writes this one under a protected path.
  t3: { file: "protected/t3.txt", word: "charlie" },
};
const P = {
  origin: path.join(ROOT, "origin.git"),
  seed: path.join(ROOT, "seed"),
  github: path.join(ROOT, "github.json"),
  events: path.join(ROOT, "events.jsonl"),
  report: path.join(ROOT, "report.json"),
  driver: {
    login: "owner",
    home: path.join(ROOT, "driver", "home"),
    ws: path.join(ROOT, "driver", "ws"),
    checkout: path.join(ROOT, "driver", "app"),
  },
  worker: {
    login: "worker-a",
    home: path.join(ROOT, "worker", "home"),
    ws: path.join(ROOT, "worker", "ws"),
    checkout: path.join(ROOT, "worker", "app"),
  },
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const event = (kind, data = {}) => {
  fs.appendFileSync(
    P.events,
    JSON.stringify({ at: new Date().toISOString(), kind, ...data }) + "\n",
  );
  console.log(`[wp-p3] ${kind} ${JSON.stringify(data)}`);
};
// One machine's environment: its own config and state homes, nothing of
// this shell's Avoozl or Kiro Crew.
function machineEnv(machine) {
  const env = { ...process.env };
  for (const name of Object.keys(env))
    if (/^(AVOOZL|KIROCREW|KIRO_SESSION)/.test(name)) delete env[name];
  return {
    ...env,
    XDG_CONFIG_HOME: path.join(machine.home, "config"),
    XDG_STATE_HOME: path.join(machine.home, "state"),
  };
}

// --- The fake GitHub: one file, read and written by each tick in turn. ---
const repoName = (r) => (typeof r === "string" ? r : `${r.owner}/${r.repo}`);
function fakeGitHub(login) {
  const read = () => JSON.parse(fs.readFileSync(P.github, "utf8")),
    write = (state) =>
      fs.writeFileSync(P.github, JSON.stringify(state, null, 2) + "\n"),
    head = () => git(P.origin, "rev-parse", "refs/heads/main");
  return {
    available: () => true,
    currentUser: async () => ({ login }),
    permission: async (_repo, who) => ({
      permission: who === "owner" ? "admin" : "read",
    }),
    repository: async (r) => ({ full_name: repoName(r), private: true }),
    issue: async (r, number) => ({
      number,
      title: "wp-p3 spec",
      state: "open",
      assignees: [{ login: "owner" }],
      repository: repoName(r),
    }),
    listIssueComments: async (r, number) =>
      (read().comments[`${repoName(r)}#${number}`] ?? []).map((c) => ({
        id: c.id,
        body: c.body,
        user: { login: c.author },
        created_at: c.at,
        updated_at: c.at,
      })),
    createIssueComment: async (r, number, body) => {
      const state = read(),
        key = `${repoName(r)}#${number}`;
      state.next += 1;
      (state.comments[key] ??= []).push({
        id: state.next,
        body,
        author: login,
        at: new Date().toISOString(),
      });
      write(state);
      return { id: state.next };
    },
    branch: async () => ({ commit: { sha: head() } }),
    createBranch: async (r, name) => {
      const state = read(),
        key = `${repoName(r)}:${name}`;
      if (state.branches[key])
        throw Object.assign(Error("Reference already exists"), {
          status: 422,
        });
      state.branches[key] = login;
      write(state);
      return {};
    },
  };
}

// --- One tick of one machine, in this process. ---
async function tickOnce(name) {
  const machine = P[name];
  const { workspaceConfig } = await import("../src/app/config.mjs");
  const { Store } = await import("../src/app/store.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const { dbPath } = workspaceConfig({
    workspace: machine.ws,
    env: process.env,
  });
  const store = new Store(dbPath);
  try {
    const ops = new Operations(store, {
      workspaceRoot: machine.ws,
      github: fakeGitHub(machine.login),
      operator: machine.login,
    });
    const out = await ops.execute(
      "workspace.tick",
      { cron: true, sessions: [] },
      { local: true },
    );
    const started = [];
    if (name === "worker") {
      // The fake harness: each child the tick starts writes its task's note
      // and finishes as done.
      const { finishProcessSession } = await import(
        "../src/app/executors/process.mjs"
      );
      const tasks = store.getMeta("runner.tasks") ?? {};
      for (const d of out.dispatch ?? []) {
        const id = d.task ?? d.taskId,
          record = tasks[id],
          worktree = record?.worktree,
          spec = TASKS[id];
        // One child per task: the fake runs each task once.
        if (!worktree || !spec || fs.existsSync(path.join(worktree, spec.file)))
          continue;
        fs.mkdirSync(path.dirname(path.join(worktree, spec.file)), {
          recursive: true,
        });
        fs.writeFileSync(path.join(worktree, spec.file), `${spec.word}\n`);
        git(worktree, "add", ".");
        git(
          worktree,
          "-c",
          "user.name=Fake harness",
          "-c",
          "user.email=fake@example.invalid",
          "commit",
          "-qm",
          `Write ${spec.file}`,
        );
        await finishProcessSession(
          ops,
          { taskId: id, role: "worker" },
          { state: "done" },
          store,
        );
        started.push(id);
      }
    }
    const data = store.read();
    return {
      dispatch: (out.dispatch ?? []).map((d) => d.task ?? d.taskId),
      started,
      runner: Object.fromEntries(
        Object.entries(store.getMeta("runner.tasks") ?? {}).map(([k, r]) => [
          k,
          r.state,
        ]),
      ),
      tasks: Object.fromEntries(
        data.tasks.map((t) => [
          t.id,
          {
            integration: t.integration?.commit ?? null,
            delivery: store.get("task_deliveries", t.id)?.state ?? null,
            cause: store.get("task_deliveries", t.id)?.cause ?? null,
          },
        ]),
      ),
      offered: Object.keys(store.getMeta("worker.offered") ?? {}),
    };
  } finally {
    store.close();
  }
}

if (values.machine) {
  const summary = await tickOnce(values.machine);
  console.log(JSON.stringify(summary));
  process.exit(0);
}

// --- Setup. ---
if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
  throw Error(`${ROOT} is not empty; run once on a fresh root.`);
fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(
  P.github,
  JSON.stringify({ next: 100, comments: {}, branches: {} }) + "\n",
);
git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
git(ROOT, "clone", "-q", P.origin, P.seed);
fs.writeFileSync(
  path.join(P.seed, "check.mjs"),
  `// Scratch check: each note holds one lowercase word and a newline.
import fs from "node:fs";
for (const dir of ["notes", "protected"])
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    if (!/^[a-z]+\\n$/.test(fs.readFileSync(dir + "/" + name, "utf8"))) {
      console.error(dir + "/" + name + " must be one lowercase word");
      process.exit(1);
    }
console.log("ok");
`,
);
git(P.seed, "add", ".");
git(
  P.seed,
  "-c",
  "user.name=Scratch",
  "-c",
  "user.email=scratch@example.invalid",
  "commit",
  "-qm",
  "Start the scratch repository",
);
git(P.seed, "push", "-q", "origin", "main");
for (const name of ["driver", "worker"]) {
  const m = P[name];
  fs.mkdirSync(path.join(m.home, "config"), { recursive: true });
  git(ROOT, "clone", "-q", P.origin, m.checkout);
  git(m.checkout, "config", "user.name", `${name} machine`);
  git(m.checkout, "config", "user.email", `${name}@example.invalid`);
  const init = spawnSync(
    process.execPath,
    [CLI, "init", m.ws, "--name", `wp-p3 ${name}`],
    { encoding: "utf8", env: machineEnv(m) },
  );
  if (init.status !== 0) throw Error(init.stderr);
}
const sources = { "example/code": { url: P.origin } };
// The driver: offers to worker-a, and protects `protected/**`.
{
  const file = path.join(P.driver.ws, ".avoozl.json"),
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  Object.assign(config, {
    delivery: { ...(config.delivery || {}), concurrency: 3, retries: 1 },
    workers: { offerTo: [P.worker.login] },
    flow: { verify: { protectedPaths: ["protected/**"] } },
  });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  fs.mkdirSync(path.join(P.driver.home, "config", "avoozl"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(P.driver.home, "config", "avoozl", "config.json"),
    JSON.stringify({ version: 1, runner: { sources } }, null, 2),
  );
}
// The worker: runner.role worker on the spec's pool, `process` executor.
{
  const file = path.join(P.worker.ws, ".avoozl.json"),
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.runner = {
    role: "worker",
    executor: "process",
    lanes: 3,
    checks: { check: { argv: ["node", "check.mjs"] } },
    pools: [
      {
        spec: SPEC,
        repository: "example/plans",
        issue: 1,
        target: "example/code",
        base: "main",
        visibility: "private",
      },
    ],
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  fs.mkdirSync(path.join(P.worker.home, "config", "avoozl"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(P.worker.home, "config", "avoozl", "config.json"),
    JSON.stringify(
      {
        version: 1,
        runner: { repos: { app: { path: P.worker.checkout } }, sources },
      },
      null,
      2,
    ),
  );
}

// Action 1: approve a three-task spec on the driver (t3 is the one whose
// result touches a protected path), with its journal on the spec issue.
{
  const env = machineEnv(P.driver);
  Object.assign(process.env, env);
  const { workspaceConfig } = await import("../src/app/config.mjs");
  const { Store } = await import("../src/app/store.mjs");
  const { takeOverSpec } = await import("../src/app/spec-takeover.mjs");
  const { dbPath } = workspaceConfig({ workspace: P.driver.ws, env });
  const store = new Store(dbPath);
  try {
    store.importSnapshot({
      ...store.read(),
      tasks: Object.entries(TASKS).map(([id, t]) => ({
        id,
        title: `Write ${t.file}`,
        kind: "leaf",
        scope: SPEC,
        status: "planned",
        epic: SPEC,
        track: SPEC,
        tags: [],
        acceptance: [`Create ${t.file} containing ${t.word} and a newline.`],
        checks: ["node check.mjs"],
        repository: "example/code",
        planId: SPEC,
        planHash: `h-${SPEC}`,
        paths: [t.file],
      })),
      edges: [],
    });
    store.put("repositories", {
      id: "example/code",
      github: "example/code",
      root: fs.realpathSync.native(P.driver.checkout),
      baseBranch: "main",
      checks: [["node", "check.mjs"]],
    });
    store.put("plans", {
      id: SPEC,
      kind: "plan",
      spec: SPEC,
      title: "wp-p3",
      hash: `h-${SPEC}`,
      revision: 1,
      state: "approved",
    });
    store.put("approvals", {
      id: `approval-${SPEC}`,
      planId: SPEC,
      hash: `h-${SPEC}`,
    });
    store.put("receipts", {
      id: `github-parent:plan:${SPEC}`,
      kind: "github-parent",
      planId: SPEC,
      repository: "example/plans",
      number: 1,
    });
    await takeOverSpec(
      store,
      {
        github: fakeGitHub(P.driver.login),
        workspaceRoot: P.driver.ws,
        actor: P.driver.login,
      },
      SPEC,
    );
  } finally {
    store.close();
  }
  event("setup.done", { root: ROOT, repo: git(REPO, "rev-parse", "HEAD") });
}

// Action 2: ticks on both machines, in turn, until nothing changes.
const tick = (name) => {
  const out = spawnSync(
    process.execPath,
    [SCRIPT, "--root", ROOT, "--machine", name],
    { encoding: "utf8", env: machineEnv(P[name]), cwd: ROOT },
  );
  if (out.status !== 0) throw Error(`${name} tick: ${out.stderr.slice(-2000)}`);
  return JSON.parse(out.stdout.trim().split("\n").at(-1));
};
const rounds = [];
let last = null,
  quiet = 0;
for (let i = 0; i < 30 && quiet < 3; i++) {
  const driver = tick("driver"),
    worker = tick("worker"),
    state = JSON.stringify([driver.tasks, worker.runner, driver.offered]);
  rounds.push({ round: i + 1, driver, worker });
  event("round", {
    round: i + 1,
    driverDispatch: driver.dispatch,
    offered: driver.offered,
    worker: worker.runner,
    started: worker.started,
    tasks: driver.tasks,
  });
  quiet = state === last ? quiet + 1 : 0;
  last = state;
}

const final = rounds.at(-1).driver.tasks,
  mainLog = git(P.driver.checkout, "log", "--format=%s", "main").split("\n"),
  files = git(P.driver.checkout, "ls-tree", "-r", "--name-only", "main").split(
    "\n",
  );
const verdict = {
  bothLanded:
    Boolean(final.t1.integration) &&
    Boolean(final.t2.integration) &&
    files.includes("notes/t1.txt") &&
    files.includes("notes/t2.txt"),
  driverStartedNothing: rounds.every((r) => r.driver.dispatch.length === 0),
  protectedRefused:
    !final.t3.integration &&
    ["decision", "failed"].includes(final.t3.delivery) &&
    /protected/.test(final.t3.cause ?? "") &&
    !files.includes("protected/t3.txt"),
};
const report = { verdict, final, mainLog, files, rounds: rounds.length };
fs.writeFileSync(
  P.report,
  JSON.stringify({ ...report, detail: rounds }, null, 2),
);
event("verdict", verdict);
console.log(JSON.stringify(report, null, 2));
process.exit(Object.values(verdict).every(Boolean) ? 0 : 1);
