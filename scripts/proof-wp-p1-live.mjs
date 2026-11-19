#!/usr/bin/env node
// Proof wp-p1 (worker-paths WP3, WP4; design D3-D5): every pair of executor
// and task kind reaches a result. One scenario, run once with every role on
// `kirocrew` (a throwaway test Kiro Crew's own tick opens the chats) and once
// on `process` (Claude Code under this machine's supervisor, from the owner's
// terminal, as P57). The scenario has a single task, a task that investigates
// first, a three-task planner batch, and a task whose first landing conflicts
// because this script lands another change on the base under it.
//
//   kirocrew: node scripts/proof-wp-p1-live.mjs --executor kirocrew --root DIR --crew-home HOME --crew-port PORT setup|watch|evaluate
//     `watch` answers the test crew's approval cards for this run's chats
//     (as the person at its dashboard would, through the harness's saved
//     sign-in cookie), presses Go ahead on findings that wait for a person,
//     and lands the conflicting change once the land task reports done.
//   process:  node scripts/proof-wp-p1-live.mjs --executor process --root DIR [--agent claude|fake]
//     Sets up, then runs the tick, the drain and the supervisor here until
//     every task lands or waits. `--agent fake` checks the plumbing only and
//     never counts as the proof.
//
// Everything lives under --root: a bare remote, its checkout and an Avoozl
// workspace. No real workspace, Avoozl home, Claude Code home or Kiro Crew
// home is read or written.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(REPO, "cli.mjs");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    executor: { type: "string" },
    agent: { type: "string", default: "claude" },
    "crew-home": { type: "string" },
    "crew-port": { type: "string", default: "5711" },
    tag: { type: "string" },
    minutes: { type: "string", default: "240" },
  },
});
const EXECUTOR = values.executor;
if (!values.root || !["process", "kirocrew"].includes(EXECUTOR)) {
  console.error(
    "Usage: node scripts/proof-wp-p1-live.mjs --executor kirocrew|process --root DIR [--crew-home HOME --crew-port PORT] [setup|watch|evaluate]",
  );
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const AGENT = EXECUTOR === "process" ? values.agent : "kirocrew";
// Names differ per run: Kiro Crew keys a chat by its title.
const TAG = values.tag ?? (EXECUTOR === "process" ? "wpp" : "wpk");
if (!/^wp[a-z0-9]{1,6}$/.test(TAG))
  throw Error("--tag is wp and 1-6 letters or digits.");
const PLAN = `${TAG}-plan`;
const ID = {
  single: `${TAG}-single`,
  inv: `${TAG}-inv`,
  b1: `${TAG}-b1`,
  b2: `${TAG}-b2`,
  b3: `${TAG}-b3`,
  land: `${TAG}-land`,
};
const HARNESS =
  EXECUTOR === "kirocrew"
    ? "kirocrew"
    : AGENT === "claude"
      ? "claude-code"
      : "fake-cli";

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
  events: path.join(ROOT, "events.jsonl"),
  report: path.join(ROOT, "report.json"),
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
  console.log(`[wp-p1] ${kind} ${JSON.stringify(data)}`);
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const cli = (...args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: process.env,
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHECK = `// Scratch check: each notes/*.txt holds one lowercase word and a newline.
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
const leaf = (id, title, file, word, extra = {}) => ({
  id,
  title,
  kind: "leaf",
  scope: TAG,
  status: "planned",
  epic: TAG,
  track: TAG,
  tags: [],
  acceptance: [
    `Create ${file} containing the word ${word} and a newline, and nothing else.`,
    "Run `node check.mjs` before you finish; it must print ok.",
  ],
  checks: ["node check.mjs"],
  repository: "app",
  planId: PLAN,
  planHash: `h-${PLAN}`,
  paths: [file],
  investigate: false,
  ...extra,
});

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; run once on a fresh root.`);
  for (const dir of [ROOT, P.wt]) fs.mkdirSync(dir, { recursive: true });
  event("setup.start", {
    root: ROOT,
    executor: EXECUTOR,
    agent: AGENT,
    repo: git(REPO, "rev-parse", "HEAD"),
    avoozlHome: MACHINE.configDirectory,
  });
  git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
  git(ROOT, "clone", "-q", P.origin, P.checkout);
  git(P.checkout, "config", "user.name", "wp-p1 Scratch");
  git(P.checkout, "config", "user.email", "wp-p1@example.invalid");
  fs.writeFileSync(
    path.join(P.checkout, "README.md"),
    "wp-p1 scratch repository.\n",
  );
  fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
  git(P.checkout, "add", ".");
  git(P.checkout, "commit", "-q", "-m", "Start the scratch repository");
  git(P.checkout, "push", "-q", "origin", "main");

  cli("init", P.ws, "--name", `wp-p1 ${EXECUTOR}`);
  cli("workspace", "add", TAG, "--root", P.ws);
  if (EXECUTOR === "kirocrew") cli("workspace", "set-default", TAG);
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  config.delivery = {
    ...(config.delivery || {}),
    concurrency: 4,
    retries: 1,
    // An unattended falsifier cannot run the checks, so it is at most
    // medium sure (P50).
    investigate: { mode: "off", minConfidence: "medium" },
  };
  config.roles = {
    worker: { harness: HARNESS },
    planner: { harness: HARNESS },
    retro: { harness: HARNESS },
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");

  if (EXECUTOR === "process") {
    const { approveHarnessDefinition, harnessDefinitionHash } = await import(
      "../src/app/harness-definitions.mjs"
    );
    const harnesses = path.join(MACHINE.configDirectory, "harnesses");
    fs.mkdirSync(harnesses, { recursive: true });
    const bytes = fs.readFileSync(
      path.join(REPO, "examples", "harnesses", "claude-code.json"),
    );
    fs.writeFileSync(path.join(harnesses, `${HARNESS}.json`), bytes);
    approveHarnessDefinition({
      configDirectory: MACHINE.configDirectory,
      name: HARNESS,
      hash: harnessDefinitionHash(bytes),
    });
  }

  const { Store } = await import("../src/app/store.mjs");
  const { digest } = await import("../src/model.mjs");
  const { takeOverSpec } = await import("../src/app/spec-takeover.mjs");
  const store = new Store(DB);
  try {
    const group = {
      id: `${TAG}-batch`,
      tasks: [ID.b1, ID.b2, ID.b3],
      reason: "Three one-line notes",
    };
    store.importSnapshot({
      ...store.read(),
      tasks: [
        leaf(ID.single, "Write notes/single.txt", "notes/single.txt", "alpha"),
        leaf(ID.inv, "Write notes/inv.txt", "notes/inv.txt", "bravo", {
          investigate: true,
        }),
        leaf(ID.b1, "Write notes/b1.txt", "notes/b1.txt", "charlie", {
          batch: group,
        }),
        leaf(ID.b2, "Write notes/b2.txt", "notes/b2.txt", "delta", {
          batch: group,
        }),
        leaf(ID.b3, "Write notes/b3.txt", "notes/b3.txt", "echo", {
          batch: group,
        }),
        leaf(ID.land, "Write notes/land.txt", "notes/land.txt", "foxtrot"),
      ],
      edges: [],
    });
    store.put("projects", {
      id: "app",
      root: fs.realpathSync.native(P.checkout),
      baseBranch: "main",
      // Local integration into the checkout's main: a batch does not land
      // directly yet.
      checks: [["node", "check.mjs"]],
      worktreeRoot: P.wt,
      ...(EXECUTOR === "process"
        ? { executor: "process", harness: HARNESS }
        : {}),
    });
    // Approved, as P57's chain: this isolated workspace's approval is the
    // operator's run.
    store.put("plans", {
      id: PLAN,
      kind: "plan",
      spec: PLAN,
      title: "wp-p1",
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
    void digest;
    await takeOverSpec(store, { workspaceRoot: P.ws, actor: "Operator" }, PLAN);
  } finally {
    store.close();
  }
  event("setup.done", { tasks: Object.values(ID) });
}

async function snapshot() {
  const { Store } = await import("../src/app/store.mjs");
  const store = new Store(DB);
  try {
    const deliveries = Object.fromEntries(
      Object.values(ID).map((id) => {
        const d = store.get("task_deliveries", id);
        return [
          id,
          d && {
            state: d.state,
            commit: d.commit ?? null,
            attempts: d.attempts.length,
            returned: (d.returnedAttempts ?? []).length,
            conflicts: (d.landingConflicts ?? []).length,
          },
        ];
      }),
    );
    const bindings = store.list("session_bindings").map((b) => ({
      slot: b.slot,
      task: b.taskId,
      role: b.role,
      attempt: b.attempt,
      executor: b.executor ?? "kirocrew",
      batch: b.batch?.tasks ?? null,
      status: b.status,
      report: b.report?.kind ?? null,
      returned: (b.returned ?? []).length,
    }));
    const briefs = store
      .list("session_requests")
      .filter((r) => r.request?.brief)
      .map((r) => ({
        task: r.request.task,
        role: r.request.role,
        executor: r.request.executor,
        brief: r.request.brief,
      }));
    const investigation = (() => {
      try {
        return store.get("task_investigations", ID.inv);
      } catch {
        return null;
      }
    })();
    return {
      deliveries,
      bindings,
      briefs,
      investigation,
      base: git(P.checkout, "log", "--format=%h %s", "main"),
    };
  } finally {
    store.close();
  }
}

const landed = (s, id) => s.deliveries[id]?.state === "integrated";

// The proof's three expectations, as data.
function judge(s) {
  const workers = s.bindings.filter((b) => b.role === "worker");
  const of = (id) =>
    workers.filter((b) => b.task === id || b.batch?.includes(id));
  const briefs = s.briefs.filter((b) =>
    ["worker", "falsifier"].includes(b.role),
  );
  const bare = /(^|[\s`])avoozl (runner|worktree)\b/m;
  return {
    landed: Object.fromEntries(
      Object.values(ID).map((id) => [id, landed(s, id)]),
    ),
    batch: {
      sessions: new Set(
        [ID.b1, ID.b2, ID.b3].flatMap((id) => of(id).map((b) => b.slot)),
      ).size,
      expected: EXECUTOR === "kirocrew" ? 1 : 3,
    },
    investigate: {
      state: s.investigation?.state ?? null,
      sessions: of(ID.inv).map((b) => b.slot),
      returned: of(ID.inv).map((b) => b.returned),
    },
    land: s.deliveries[ID.land],
    briefs: {
      count: briefs.length,
      namingMcp: briefs
        .filter((b) => /plans_[a-z_]+/.test(b.brief))
        .map((b) => `${b.task} ${b.role}`),
      bareAvoozl: briefs
        .filter((b) => bare.test(b.brief))
        .map((b) => `${b.task} ${b.role}`),
      processAsksCommit: briefs
        .filter((b) => b.executor === "process" && b.role === "worker")
        .filter((b) =>
          /\bcommit (every|your|the|it|and)\b|runner report|git push/i.test(
            b.brief.replace(/Do not [^.]*\./g, ""),
          ),
        )
        .map((b) => b.task),
    },
  };
}

// Another change to notes/land.txt lands on the base under the land task:
// a person's commit on the checkout's main, which the task merges forward.
function landOther() {
  // Once per run, even across a restarted watch.
  const subject = "Land another notes/land.txt";
  if (git(P.checkout, "log", "--format=%s").split("\n").includes(subject))
    return;
  fs.mkdirSync(path.join(P.checkout, "notes"), { recursive: true });
  fs.writeFileSync(path.join(P.checkout, "notes", "land.txt"), "golf\n");
  git(P.checkout, "add", "notes/land.txt");
  git(
    P.checkout,
    "-c",
    "user.name=Other",
    "-c",
    "user.email=other@example.invalid",
    "commit",
    "-qm",
    "Land another notes/land.txt",
  );
  event("conflict.landed", { head: git(P.checkout, "rev-parse", "HEAD") });
}

// The test crew's dashboard API through the harness's saved cookie.
function crewApi() {
  const port = Number(values["crew-port"]);
  const cookies = path.join(
    path.dirname(process.env.KIROCREW_HOME),
    "cookies.txt",
  );
  if (!fs.existsSync(cookies)) throw Error(`No sign-in cookie at ${cookies}.`);
  return (method, route, body) => {
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
}

async function watch() {
  const api = crewApi(),
    seen = new Set(),
    end = Date.now() + Number(values.minutes) * 60_000;
  let conflicted = false,
    decided = false;
  while (Date.now() < end && !fs.existsSync(path.join(ROOT, "stop-watch"))) {
    try {
      if (await watchOnce()) break;
    } catch (error) {
      // A slow or restarting gateway: try again on the next pass.
      event("watch.error", { error: String(error.message).slice(0, 200) });
    }
    await sleep(15_000);
  }
  async function watchOnce() {
    // 1. Approval cards of this run's chats, answered as the person would.
    const slots = api("GET", "/api/chat/slots");
    for (const slot of Array.isArray(slots) ? slots : []) {
      const pending = slot.pending_approval_info;
      if (!pending || pending.origin !== "native" || !slot.key.includes(TAG))
        continue;
      const id = `${slot.key}#${pending.request_mid}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const reply = api(
        "POST",
        `/api/chat/slots/${encodeURIComponent(slot.key)}/approve`,
        {
          action: "approved",
          origin: "native",
          request_id: pending.request_id,
          request_mid: pending.request_mid,
        },
      );
      event("approve", {
        slot: slot.key,
        tool: String(pending.tool).slice(0, 120),
        input: String(pending.tool_input).slice(0, 200),
        reply: JSON.stringify(reply).slice(0, 120),
      });
    }
    const s = await snapshot();
    // 2. Findings that wait for a person: Go ahead, as Needs you would.
    if (!decided && s.investigation?.state === "needs-you") {
      const { Store } = await import("../src/app/store.mjs");
      const { Operations } = await import("../src/app/operations.mjs");
      const store = new Store(DB);
      try {
        await new Operations(store, { workspaceRoot: P.ws }).execute(
          "investigation.decide",
          { taskId: ID.inv, action: "go" },
        );
      } finally {
        store.close();
      }
      decided = true;
      event("go-ahead", { by: "person (needs you)" });
    }
    // 3. Land another change on the base under the land task, once.
    const land = s.bindings.find(
      (b) => b.task === ID.land && b.role === "worker" && b.report === "done",
    );
    if (!conflicted && land) {
      landOther();
      conflicted = true;
    }
    const verdict = judge(s);
    if (Object.values(verdict.landed).every(Boolean)) {
      event("all-landed", verdict);
      return true;
    }
    return false;
  }
}

async function evaluate() {
  const s = await snapshot(),
    verdict = judge(s);
  fs.writeFileSync(
    P.report,
    JSON.stringify(
      {
        executor: EXECUTOR,
        tag: TAG,
        verdict,
        snapshot: {
          ...s,
          briefs: s.briefs.map((b) => ({
            ...b,
            brief: b.brief.slice(0, 4000),
          })),
        },
      },
      null,
      2,
    ),
  );
  event("report", { file: P.report, verdict });
  return verdict;
}

// `process`: the tick, the app backend's drain and the supervisor, here.
async function proveProcess() {
  if (
    AGENT === "claude" &&
    !spawnSync("command -v claude", { shell: true }).stdout.toString().trim()
  )
    throw Error(
      "Claude Code is not on this machine's PATH. Run the process half from the owner's terminal.",
    );
  await setup();
  const { Store } = await import("../src/app/store.mjs");
  const { Operations } = await import("../src/app/operations.mjs");
  const { prepareWorktree } = await import("../src/app/delivery.mjs");
  const { drainProcessRequests } = await import(
    "../src/app/executors/process.mjs"
  );
  const { drainCheckRuns } = await import("../src/app/check-runs.mjs");
  const { launchSupervisor } = await import("../src/app/supervisor.mjs");
  const store = new Store(DB),
    ops = new Operations(store, { workspaceRoot: P.ws }),
    end = Date.now() + Number(values.minutes) * 60_000;
  let conflicted = false,
    decided = false;
  try {
    while (Date.now() < end) {
      launchSupervisor({
        stateDirectory: MACHINE.stateDirectory,
        configDirectory: MACHINE.configDirectory,
        env: process.env,
      });
      await ops
        .execute("workspace.tick", { cron: true })
        .catch((e) => event("tick.error", { error: e.message }));
      await drainProcessRequests(store, {
        stateDirectory: MACHINE.stateDirectory,
        prepareWorktree,
        ops,
      }).catch((e) => event("drain.error", { error: e.message }));
      await drainCheckRuns(store);
      const s = await snapshot();
      if (!decided && s.investigation?.state === "needs-you") {
        await ops.execute("investigation.decide", {
          taskId: ID.inv,
          action: "go",
        });
        decided = true;
      }
      if (
        !conflicted &&
        s.bindings.some(
          (b) =>
            b.task === ID.land && b.role === "worker" && b.report === "done",
        )
      ) {
        landOther();
        conflicted = true;
      }
      if (Object.values(judge(s).landed).every(Boolean)) break;
      await sleep(5000);
    }
  } finally {
    store.close();
    console.log(JSON.stringify(await evaluate(), null, 2));
  }
}

const command = positionals[0] ?? (EXECUTOR === "process" ? "prove" : null);
if (command === "setup") await setup();
else if (command === "watch" && EXECUTOR === "kirocrew") await watch();
else if (command === "evaluate")
  console.log(JSON.stringify(await evaluate(), null, 2));
else if (command === "prove" && EXECUTOR === "process") await proveProcess();
else
  throw Error(
    "Name setup, watch or evaluate for kirocrew; process runs with no command.",
  );
