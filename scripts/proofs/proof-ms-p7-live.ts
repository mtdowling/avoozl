#!/usr/bin/env node
// @ts-nocheck: typing debt, see the commit message
// Proof ms-p7 (machine-server MS12, design D5): the Kiro Crew cron is the
// machine's timer. On a throwaway test Kiro Crew with its own home and port,
// the cron runs the tick pass, opens the task's lane chats, sends the
// message the pass released, and sets trust mode again after the gateway
// restarts. Nothing else is in the cron's runs.
//
//   node scripts/proofs/proof-ms-p7-live.ts --root DIR --harness-dir DIR --port PORT --github OWNER/NAME setup
//   node scripts/proofs/proof-ms-p7-live.ts --root DIR --harness-dir DIR --port PORT watch
//   node scripts/proofs/proof-ms-p7-live.ts --root DIR --harness-dir DIR --port PORT cleanup
//
// `setup` makes a private scratch repository on GitHub with gh, a checkout
// of it, a test-crew worker agent with shell tools, and a workspace in the
// test crew's own Avoozl home with one task. Restart the test crew after it
// (POST /api/restart), so its app backend reads the workspace. `watch` acts
// as the person at the test crew's dashboard: it approves the spec, answers
// the chats' tool approval cards, restarts the gateway while the worker's
// chat has a turn running (so the chat goes quiet and the pass releases a
// nudge, the message the cron must send), and writes the receipt data when
// the task lands. `cleanup` checks the scratch repository holds only this
// proof's commits, then deletes it. The real Kiro Crew is never read or
// written.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { crewApi, proofCommands } from "./machine.ts";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CLI = path.join(REPO, "cli.ts");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    "harness-dir": { type: "string" },
    port: { type: "string", default: "5713" },
    github: { type: "string" },
    minutes: { type: "string", default: "90" },
  },
});
if (!values.root || !values["harness-dir"]) {
  console.error(
    "Usage: node scripts/proofs/proof-ms-p7-live.ts --root DIR --harness-dir DIR [--port PORT] [--github OWNER/NAME] setup|watch|cleanup",
  );
  process.exit(64);
}
const ROOT = path.resolve(values.root);
const HARNESS_DIR = path.resolve(values["harness-dir"]);
const CREW = path.join(HARNESS_DIR, "home");
const real = path.join(os.homedir(), ".kiro");
if (CREW === real || CREW.startsWith(real + path.sep))
  throw Error("--harness-dir must be a throwaway test crew.");
if (!fs.existsSync(path.join(CREW, "gateway.lock")))
  throw Error(`${CREW} is not a Kiro Crew home.`);
process.env.KIROCREW_HOME = CREW;
const TAG = "msp7";
const SPEC = `${TAG}-notes`;
const TASK = `${TAG}-1`;
const AGENT = "wp-worker";
const P = {
  checkout: path.join(ROOT, "app"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  events: path.join(ROOT, "events.jsonl"),
  report: path.join(ROOT, "report.json"),
  repo: path.join(ROOT, "github-repo.txt"),
};
const DB = path.join(P.ws, ".avoozl", "local", "workspace.sqlite");
const { machineAvoozlPaths } = await import(
  "../../src/app/settings/host-config.ts"
);
const MACHINE = machineAvoozlPaths();
if (!MACHINE.configDirectory.startsWith(CREW + path.sep))
  throw Error(`Not the test crew's Avoozl: ${MACHINE.configDirectory}`);

const event = (kind, data = {}) => {
  fs.mkdirSync(ROOT, { recursive: true });
  const line = { at: new Date().toISOString(), kind, ...data };
  fs.appendFileSync(P.events, JSON.stringify(line) + "\n");
  console.log(`[ms-p7] ${kind} ${JSON.stringify(data)}`);
};
const { git, gh, cli, sleep } = proofCommands(CLI);

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

// A copy of the stock worker with shell and file tools, in the test crew
// only (wp-p1): the stock agent cannot run the brief's commands.
function writeWorkerAgent() {
  const agents = path.join(CREW, "kiro", "agents"),
    stock = JSON.parse(
      fs.readFileSync(path.join(agents, "kirocrew-worker.json"), "utf8"),
    ),
    tools = ["fs_read", "fs_write", "execute_bash", "grep", "glob"];
  const agent = {
    ...stock,
    name: AGENT,
    description: "ms-p7 test-crew worker with shell and file tools.",
    tools: [...new Set([...(stock.tools ?? []), ...tools])],
  };
  fs.writeFileSync(
    path.join(agents, `${AGENT}.json`),
    JSON.stringify(agent, null, 2) + "\n",
  );
}

async function setup() {
  const repo = values.github;
  if (
    !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]*(scratch|proof|throwaway)[A-Za-z0-9._-]*$/.test(
      repo ?? "",
    )
  )
    throw Error(
      "--github must name a new OWNER/NAME with scratch or proof in its name.",
    );
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; run once on a fresh root.`);
  for (const dir of [ROOT, P.wt]) fs.mkdirSync(dir, { recursive: true });
  event("setup.start", {
    root: ROOT,
    avoozl: git(REPO, "rev-parse", "HEAD"),
    avoozlHome: MACHINE.configDirectory,
  });
  gh("repo", "create", repo, "--private", "--description", "ms-p7 scratch");
  fs.writeFileSync(P.repo, repo + "\n");
  event("github.created", { repo });
  fs.mkdirSync(P.checkout);
  git(P.checkout, "init", "-q", "-b", "main");
  git(P.checkout, "remote", "add", "origin", `https://github.com/${repo}.git`);
  git(P.checkout, "config", "user.name", "ms-p7 Scratch");
  git(P.checkout, "config", "user.email", "ms-p7@example.invalid");
  fs.writeFileSync(path.join(P.checkout, "README.md"), "ms-p7 scratch.\n");
  fs.writeFileSync(path.join(P.checkout, "check.mjs"), CHECK);
  // One spec with one task: only a spec's task lands.
  const spec = path.join(P.checkout, ".kiro", "specs", SPEC);
  fs.mkdirSync(spec, { recursive: true });
  fs.writeFileSync(
    path.join(spec, "requirements.md"),
    "# Requirements: a note\n\nThe repository holds notes/beta.txt with the word beta.\n",
  );
  fs.writeFileSync(
    path.join(spec, "design.md"),
    "# Design: a note\n\nOne file under notes/, checked by node check.mjs.\n",
  );
  fs.writeFileSync(
    path.join(spec, "tasks.md"),
    `---\nrepo: app\n---\n# Tasks: a note\n\n- [ ] ${TASK} Write notes/beta.txt\n  - notes/beta.txt holds the word beta and a newline, and nothing else\n  - node check.mjs prints ok\n`,
  );
  git(P.checkout, "add", ".");
  git(P.checkout, "commit", "-q", "-m", "Start the scratch repository");
  git(P.checkout, "push", "-q", "origin", "main");
  writeWorkerAgent();
  cli("init", P.ws, "--name", "ms-p7");
  cli("workspace", "add", TAG, "--root", P.ws);
  cli("workspace", "set-default", TAG);
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  config.delivery = {
    ...(config.delivery || {}),
    retries: 1,
    // A quiet chat is nudged a minute after its turn ends without a report:
    // the gateway restart cuts the worker's turn, and the nudge is the
    // message the cron must send. The default reviewer stays on.
    quietMinutes: 1,
    nudges: 3,
  };
  config.lanes = { local: 1, reviewers: 1 };
  config.roles = { worker: { harness: "kirocrew", agent: AGENT } };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
  // The tick starts and lands work only with this machine's loop on.
  const machineFile = path.join(CREW, "avoozl", "config.json");
  const machine = fs.existsSync(machineFile)
    ? JSON.parse(fs.readFileSync(machineFile, "utf8"))
    : { version: 1 };
  machine.loop = { run: ["specs"] };
  fs.writeFileSync(machineFile, JSON.stringify(machine, null, 2) + "\n");
  const { Store } = await import("../../src/app/store/store.ts");
  const store = new Store(DB);
  try {
    store.put("repositories", {
      id: "app",
      root: fs.realpathSync.native(P.checkout),
      baseBranch: "main",
      landing: "direct",
      checks: [["node", "check.mjs"]],
      worktreeRoot: P.wt,
    });
    // One repository holds the code and its specs.
    store.setMeta("workspaceRepository", {
      root: fs.realpathSync.native(P.checkout),
    });
  } finally {
    store.close();
  }
  event("setup.done", { task: TASK, repo });
}

// The test crew's dashboard API through the harness's saved cookie.
const api = (method, route, body) =>
  crewApi({ harnessDir: HARNESS_DIR, port: values.port }, method, route, body);
const listSlots = () => {
  const listed = api("GET", "/api/chat/slots");
  return Array.isArray(listed) ? listed : (listed?.slots ?? []);
};

async function state() {
  const { Store } = await import("../../src/app/store/store.ts");
  const store = new Store(DB);
  try {
    const delivery = store.get("task_deliveries", TASK);
    return {
      delivery: delivery?.state ?? null,
      verifications: (delivery?.verifications ?? []).map((v) => ({
        role: v.role ?? "checks",
        attempt: v.attempt,
        outcome: v.outcome,
        verdict: v.verdict,
        cause: v.cause,
      })),
      bindings: store.list("session_bindings").map((b) => ({
        id: b.id,
        slot: b.slot,
        role: b.role,
        lane: b.lane ?? null,
        status: b.status,
        report: b.report?.kind ?? null,
        executor: b.executor ?? "kirocrew",
      })),
      sends: store
        .list("session_requests")
        .filter((r) => r.kind === "send")
        .map((r) => ({
          id: r.id,
          state: r.state,
          slot: r.request?.slot,
          text: String(r.request?.text ?? "").slice(0, 120),
        })),
    };
  } finally {
    store.close();
  }
}

// The tick cron's own job, and what its runs did.
function cronRuns() {
  const jobs = api("GET", "/api/crons");
  const list = Array.isArray(jobs) ? jobs : (jobs.jobs ?? jobs.items ?? []);
  const job = list.find(
    (j) => /avoozl/i.test(JSON.stringify(j)) && /tick/i.test(JSON.stringify(j)),
  );
  if (!job) return { job: null, runs: [] };
  const history = api(
    "GET",
    `/api/crons/${encodeURIComponent(job.id)}/history`,
  );
  const runs = Array.isArray(history)
    ? history
    : (history.runs ?? history.items ?? []);
  return { job: job.id, runs: runs.slice(0, 200) };
}

// `avoozl plan approve` as the person at this machine: preview, then commit
// the approval to main with the hash the preview printed.
function approve() {
  try {
    cli(
      "plan.create",
      "--json",
      JSON.stringify({ spec: SPEC }),
      "--workspace",
      P.ws,
    );
    event("draft", { spec: SPEC });
  } catch (error) {
    if (!/already/i.test(String(error.stderr))) {
      event("draft.error", { error: String(error.stderr).slice(0, 300) });
      return false;
    }
  }
  let preview;
  try {
    preview = cli("plan", "approve", SPEC, "--workspace", P.ws);
  } catch (error) {
    event("approve.error", { error: String(error.stderr).slice(0, 300) });
    return false;
  }
  const hash = /[0-9a-f]{16,64}/.exec(preview)?.[0];
  if (!hash) return false;
  cli("plan", "approve", SPEC, "--workspace", P.ws, "--yes", "--expect", hash);
  event("approved", { spec: SPEC });
  return true;
}

// The test crew's Restart, as the person presses it: the gateway restarts
// itself, so no process here starts one.
async function restartGateway() {
  api("POST", "/api/restart");
  await sleep(10_000);
  for (let i = 0; i < 30; i++) {
    try {
      const slots = api("GET", "/api/chat/slots");
      if (Array.isArray(slots) || Array.isArray(slots?.slots)) return true;
    } catch {}
    await sleep(5_000);
  }
  return false;
}

async function watch() {
  const end = Date.now() + Number(values.minutes) * 60_000,
    seen = new Set();
  let approved = false,
    restarted = false,
    afterRestart = null,
    lastLog = "";
  while (Date.now() < end) {
    try {
      const s = await state();
      const ours = new Set(s.bindings.map((b) => b.slot));
      // The chats' approval cards, answered as the person would.
      for (const slot of listSlots()) {
        const pending = slot.pending_approval_info;
        if (!pending || !(ours.has(slot.key) || slot.key.includes(TAG)))
          continue;
        const id = `${slot.key}#${pending.request_mid}`;
        if (seen.has(id)) continue;
        seen.add(id);
        api("POST", `/api/chat/slots/${encodeURIComponent(slot.key)}/approve`, {
          action: "approved",
          origin: pending.origin ?? "native",
          request_id: pending.request_id,
          request_mid: pending.request_mid,
        });
        event("approve", {
          slot: slot.key,
          tool: String(pending.tool).slice(0, 80),
        });
      }
      // The person approves the spec once the tick has read it as a draft.
      if (!approved) approved = approve();
      const log = JSON.stringify(s);
      if (log !== lastLog) {
        event("state", s);
        lastLog = log;
      }
      const worker = s.bindings.find((b) => b.role === "worker");
      // While the worker's chat has a turn running, restart the gateway:
      // the turn is cut, trust must come back, and the pass nudges the chat.
      if (!restarted && worker) {
        const slot = listSlots().find((row) => row.key === worker.slot);
        if (
          worker.status === "working" ||
          (slot && (slot.status === "working" || slot.busy || slot.running))
        ) {
          event("restart.start", {
            slot: worker.slot,
            status: slot?.status ?? worker.status,
          });
          const back = await restartGateway();
          restarted = true;
          afterRestart = Date.now();
          event("restart.done", { back });
        }
      }
      if (
        restarted &&
        worker &&
        afterRestart &&
        Date.now() - afterRestart > 180_000
      ) {
        const slot = listSlots().find((row) => row.key === worker.slot);
        event("trust", {
          slot: worker.slot,
          trust: slot?.trust ?? null,
          mode: slot?.mode ?? null,
        });
        afterRestart = null;
      }
      if (s.delivery === "integrated") {
        const report = {
          state: s,
          cron: cronRuns(),
          trust: listSlots()
            .filter((row) => ours.has(row.key))
            .map((row) => ({ slot: row.key, trust: row.trust ?? null })),
          main: git(P.checkout, "ls-remote", "origin", "main"),
        };
        fs.writeFileSync(P.report, JSON.stringify(report, null, 2));
        event("landed", { report: P.report });
        return;
      }
    } catch (error) {
      event("watch.error", { error: String(error.message).slice(0, 200) });
    }
    await sleep(15_000);
  }
  event("timeout", await state());
}

// Delete the scratch repository after checking it holds only this proof's
// commits: the start commit and what Avoozl landed for the task.
function cleanup() {
  const repo = fs.readFileSync(P.repo, "utf8").trim();
  git(P.checkout, "fetch", "-q", "origin");
  const log = git(
    P.checkout,
    "log",
    "--format=%H %an <%ae> %s",
    "origin/main",
  ).split("\n");
  const branches = git(P.checkout, "ls-remote", "--heads", "origin")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("refs/heads/")[1]);
  event("cleanup.check", { repo, log, branches });
  const theirs = log.filter(
    (line) =>
      !/ Start the scratch repository$/.test(line) &&
      !line.includes(TASK) &&
      !/ms-p7|Avoozl|avoozl/i.test(line),
  );
  if (theirs.length)
    throw Error(`${repo} holds commits this proof did not make: ${theirs}`);
  gh("repo", "delete", repo, "--yes");
  event("github.deleted", { repo });
}

const command = positionals[0];
if (command === "setup") await setup();
else if (command === "watch") await watch();
else if (command === "cleanup") cleanup();
else throw Error("Name setup, watch or cleanup.");
