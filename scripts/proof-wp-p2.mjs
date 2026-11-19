#!/usr/bin/env node
// Proof wp-p2 (worker-paths WP1, WP2; design D6, D7): a person finishes a task
// by hand while the tick runs the rest.
//
//   node scripts/proof-wp-p2.mjs --root DIR
//
// Everything lives under --root: a bare remote, its checkout, an Avoozl
// workspace made with `avoozl init`, and its own config and state folders. No
// real workspace, Avoozl home, Kiro Crew home or GitHub is read or written.
// The person's steps are the plain CLI. What Kiro Crew runs each minute is
// called here, as P62 did: one `workspace.tick` with `cron: true` and one pass
// of `drainCheckRuns`. The `kirocrew` executor is a fake: a chat the tick asks
// for is bound as opened and reads as working, and never codes.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO, "cli.mjs");
const { values } = parseArgs({ options: { root: { type: "string" } } });
if (!values.root) {
  console.error("Usage: node scripts/proof-wp-p2.mjs --root DIR");
  process.exit(64);
}
const ROOT = path.resolve(values.root);
if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
  throw Error(`${ROOT} is not empty; run once on a fresh root.`);
fs.mkdirSync(ROOT, { recursive: true });

// The person's environment: no agent session, no supervisor child, no other
// workspace, and this run's own config and state folders.
const HOME = path.join(ROOT, "home");
const ENV = { ...process.env };
for (const name of Object.keys(ENV))
  if (/^(AVOOZL|KIROCREW|KIRO_SESSION)/.test(name)) delete ENV[name];
Object.assign(ENV, {
  XDG_CONFIG_HOME: path.join(HOME, "config"),
  XDG_STATE_HOME: path.join(HOME, "state"),
});
Object.assign(process.env, ENV);
for (const name of Object.keys(process.env))
  if (!(name in ENV)) delete process.env[name];

const P = {
  origin: path.join(ROOT, "origin.git"),
  checkout: path.join(ROOT, "app"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  events: path.join(ROOT, "events.jsonl"),
  report: path.join(ROOT, "report.json"),
};
const event = (kind, data = {}) => {
  fs.appendFileSync(
    P.events,
    JSON.stringify({ at: new Date().toISOString(), kind, ...data }) + "\n",
  );
  console.log(`[wp-p2] ${kind} ${JSON.stringify(data)}`);
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
// One person command; returns {status, stdout, stderr}.
const person = (cwd, ...args) => {
  const out = spawnSync(process.execPath, [CLI, ...args, "--workspace", P.ws], {
    cwd,
    encoding: "utf8",
    env: ENV,
  });
  event("cli", {
    args,
    status: out.status,
    stdout: out.stdout.slice(0, 1500),
    stderr: out.stderr.slice(0, 500),
  });
  return out;
};

const CHECK = `// Scratch check: each notes/*.txt holds one lowercase word and a newline.
import fs from "node:fs";
const notes = fs.existsSync("notes") ? fs.readdirSync("notes") : [];
for (const name of notes)
  if (!/^[a-z]+\\n$/.test(fs.readFileSync("notes/" + name, "utf8"))) {
    console.error("notes/" + name + " must be one lowercase word and a newline");
    process.exit(1);
  }
console.log("ok");
`;
const PLAN = "wpp2-plan";
const leaf = (id, word) => ({
  id,
  title: `Write notes/${id}.txt`,
  kind: "leaf",
  scope: "wpp2",
  status: "planned",
  epic: "wpp2",
  track: "wpp2",
  tags: [],
  acceptance: [`Create notes/${id}.txt containing ${word} and a newline.`],
  checks: ["node check.mjs"],
  repository: "app",
  planId: PLAN,
  planHash: `h-${PLAN}`,
  paths: [`notes/${id}.txt`],
});

// 1. Setup: scratch repository, bare remote, isolated workspace, no
// `delivery.runner`, three ready tasks.
git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
git(ROOT, "clone", "-q", P.origin, P.checkout);
git(P.checkout, "config", "user.name", "wp-p2 Scratch");
git(P.checkout, "config", "user.email", "wp-p2@example.invalid");
fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
git(P.checkout, "add", ".");
git(P.checkout, "commit", "-qm", "Start the scratch repository");
git(P.checkout, "push", "-q", "origin", "main");
fs.mkdirSync(P.wt);
const init = person(ROOT, "init", P.ws, "--name", "wp-p2");
if (init.status !== 0) throw Error(init.stderr);
const configFile = path.join(P.ws, ".avoozl.json"),
  config = JSON.parse(fs.readFileSync(configFile, "utf8"));
config.delivery = { ...(config.delivery || {}), retries: 1 };
config.lanes = { local: 3 };
if ("runner" in config.delivery) throw Error("init set delivery.runner");
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

const { workspaceConfig } = await import("../src/app/config.mjs");
const { Store } = await import("../src/app/store.mjs");
const { Operations } = await import("../src/app/operations.mjs");
const { drainCheckRuns } = await import("../src/app/check-runs.mjs");
const { takeOverSpec } = await import("../src/app/spec-takeover.mjs");
const { dbPath } = workspaceConfig({ workspace: P.ws, env: ENV });
const store = new Store(dbPath);
const ops = new Operations(store, { workspaceRoot: P.ws });
const opened = new Set();
const tick = async () => {
  const out = await ops.execute("workspace.tick", {
    cron: true,
    sessions: [...opened].map((target) => ({ target, status: "working" })),
  });
  // The fake executor: each chat the tick asks for is opened and bound.
  for (const d of out.dispatch || []) {
    const slot = d.slot || d.session?.slot || `fake-${d.task}-${opened.size}`;
    await ops.execute("session.bind", {
      taskId: d.task,
      slot,
      attempt: d.attempt ?? 1,
      source: "tick",
      title: `avoozl:${d.task} ${d.title ?? ""}`.trim(),
    });
    opened.add(slot);
  }
  await drainCheckRuns(store);
  return (out.dispatch || []).map((d) => d.task);
};
const task = (id) => store.read().tasks.find((t) => t.id === id);
const result = {};
try {
  store.initialize({
    ...store.read(),
    // "back" waits on "hand", so two tasks are ready at first.
    tasks: [
      leaf("hand", "alpha"),
      leaf("tick", "bravo"),
      leaf("back", "charlie"),
    ],
    edges: [],
  });
  store.put("repositories", {
    id: "app",
    root: fs.realpathSync.native(P.checkout),
    baseBranch: "main",
    checks: [["node", "check.mjs"]],
    worktreeRoot: P.wt,
  });
  store.put("plans", {
    id: PLAN,
    kind: "plan",
    spec: PLAN,
    title: "wp-p2",
    hash: `h-${PLAN}`,
    revision: 1,
    state: "approved",
  });
  store.put("approvals", {
    id: `approval-${PLAN}`,
    planId: PLAN,
    hash: `h-${PLAN}`,
  });
  store.put("receipts", {
    id: `spec-journal:${PLAN}`,
    kind: "spec-journal",
    planId: PLAN,
    home: "local",
  });
  await takeOverSpec(store, { workspaceRoot: P.ws, actor: "Operator" }, PLAN);
  event("setup.done", { root: ROOT, repo: git(REPO, "rev-parse", "HEAD") });

  // 2. Action 1: take one task from the command line.
  const take = person(P.checkout, "take", "hand");
  const taken = take.status === 0 ? JSON.parse(take.stdout) : null;
  result.take = {
    status: take.status,
    worktree: taken?.worktree?.path ?? null,
    report: taken?.report ?? null,
  };

  // Action 4, run here: take a third task and release it before any tick,
  // so the first tick shows whether a released task is ready again. Run
  // after the landing, the tick has already started it.
  const second = person(P.checkout, "take", "back");
  const release = person(P.checkout, "take", "back", "--release");

  // 3. Action 2: three ticks.
  const perTick = [];
  for (let i = 0; i < 3; i++) perTick.push(await tick());
  result.ticks = perTick;
  result.release = {
    take: second.status,
    release: release.status,
    firstTick: perTick[0],
  };

  // 4. Action 3: commit in the taken worktree and report done.
  const wt = taken.worktree.path;
  fs.mkdirSync(path.join(wt, "notes"), { recursive: true });
  fs.writeFileSync(path.join(wt, "notes", "hand.txt"), "alpha\n");
  git(wt, "add", ".");
  git(
    wt,
    "-c",
    "user.name=Person",
    "-c",
    "user.email=person@example.invalid",
    "commit",
    "-qm",
    "Add notes/hand.txt",
  );
  const head = git(wt, "rev-parse", "HEAD");
  const done = person(wt, "runner", "report", "hand", "done");
  result.done = { status: done.status, head };
  const landing = [];
  for (let i = 0; i < 12 && !task("hand").integration?.commit; i++)
    landing.push(...(await tick()));
  result.startedWhileLanding = landing;
  const { taskCheckRuns } = await import("../src/app/check-runs.mjs");
  const runs = taskCheckRuns(store, "hand").map((r) => ({
    commit: r.commit,
    state: r.state,
    passed: (r.checks || []).every((c) => c.exitCode === 0),
  }));
  result.landed = {
    integration: task("hand").integration?.commit ?? null,
    checkRuns: runs,
    onMain: git(P.checkout, "log", "--format=%s", "main").split("\n"),
  };
} finally {
  store.close();
}

const verdict = {
  takePrintsWorktreeAndReport: Boolean(
    result.take.worktree &&
      /runner report hand done/.test(result.take.report ?? ""),
  ),
  tickStartsOtherOnly:
    !result.ticks.flat().includes("hand") &&
    !result.startedWhileLanding.includes("hand") &&
    result.ticks.flat().includes("tick"),
  checksRanAndLanded:
    result.done.status === 0 &&
    Boolean(result.landed.integration) &&
    result.landed.checkRuns.some((r) => r.commit === result.done.head),
  releasedReadyAndStarted:
    result.release.take === 0 &&
    result.release.release === 0 &&
    result.release.firstTick.includes("back"),
};
fs.writeFileSync(P.report, JSON.stringify({ verdict, result }, null, 2));
event("verdict", verdict);
console.log(JSON.stringify({ verdict, result }, null, 2));
process.exit(Object.values(verdict).every(Boolean) ? 0 : 1);
