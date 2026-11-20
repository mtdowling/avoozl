#!/usr/bin/env node
// Proof ms-p7 (machine-server MS12, design D5): the Kiro Crew cron keeps only
// chat intents. On a throwaway test Kiro Crew with its own home and port, the
// machine server runs the tick; the cron opens the task's chat, sends it the
// message the tick released, and sets its trust mode again after the gateway
// restarts. Nothing else is in the cron's runs.
//
//   node scripts/proofs/proof-ms-p7-live.mjs --root DIR --harness-dir DIR --port PORT setup
//   node scripts/proofs/proof-ms-p7-live.mjs --root DIR --harness-dir DIR --port PORT watch
//
// `setup` makes a scratch repository with a bare remote, and a workspace in
// the test crew's own Avoozl home with one task that investigates first.
// Restart the test crew after it, so its app backend reads the workspace.
// `watch` acts as the person at the test crew's dashboard: it answers the
// chat's tool approval cards, chooses Go ahead on the findings (the message
// the cron must send), restarts the gateway once the chat is open, and
// writes the receipt data when the task lands. The real Kiro Crew is never
// read or written.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const CLI = path.join(REPO, "cli.mjs");
const HARNESS = path.join(REPO, "scripts", "dev", "live-harness.sh");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    "harness-dir": { type: "string" },
    port: { type: "string", default: "5711" },
    minutes: { type: "string", default: "120" },
  },
});
if (!values.root || !values["harness-dir"]) {
  console.error(
    "Usage: node scripts/proofs/proof-ms-p7-live.mjs --root DIR --harness-dir DIR [--port PORT] setup|watch",
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
const P = {
  origin: path.join(ROOT, "origin.git"),
  checkout: path.join(ROOT, "app"),
  ws: path.join(ROOT, "ws"),
  wt: path.join(ROOT, "wt"),
  events: path.join(ROOT, "events.jsonl"),
  report: path.join(ROOT, "report.json"),
};
const DB = path.join(P.ws, ".avoozl", "local", "workspace.sqlite");
const { machineAvoozlPaths } = await import(
  "../../src/app/settings/host-config.mjs"
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
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const cli = (...args) =>
  execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: process.env,
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const harness = (...args) =>
  execFileSync("bash", [HARNESS, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      AVOOZL_HARNESS_DIR: HARNESS_DIR,
      AVOOZL_HARNESS_PORT: values.port,
    },
    timeout: 300_000,
  });

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

async function setup() {
  if (fs.existsSync(ROOT) && fs.readdirSync(ROOT).length)
    throw Error(`${ROOT} is not empty; run once on a fresh root.`);
  for (const dir of [ROOT, P.wt]) fs.mkdirSync(dir, { recursive: true });
  event("setup.start", {
    root: ROOT,
    avoozl: git(REPO, "rev-parse", "HEAD"),
    avoozlHome: MACHINE.configDirectory,
  });
  git(ROOT, "init", "-q", "--bare", "-b", "main", P.origin);
  git(ROOT, "clone", "-q", P.origin, P.checkout);
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
  cli("init", P.ws, "--name", "ms-p7");
  cli("workspace", "add", TAG, "--root", P.ws);
  cli("workspace", "set-default", TAG);
  const configFile = path.join(P.ws, ".avoozl.json");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  config.delivery = {
    ...(config.delivery || {}),
    retries: 1,
    investigate: { mode: "all", minConfidence: "high" },
  };
  config.lanes = { local: 2 };
  // A copy of the stock worker with shell and file tools, in the test crew
  // only (wp-p1): the stock agent cannot run the brief's commands.
  config.roles = { worker: { harness: "kirocrew", agent: "wp-worker" } };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
  const { Store } = await import("../../src/app/store/store.mjs");
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
  event("setup.done", { task: TASK });
}

// The test crew's dashboard API through the harness's saved cookie. A
// session that has lapsed is refreshed once with the cookie's refresh part,
// as the dashboard itself does.
function api(method, route, body) {
  const reply = call(method, route, body);
  if (reply?.code !== "forbidden") return reply;
  call("POST", "/api/auth/refresh");
  return call(method, route, body);
}

function call(method, route, body) {
  const cookies = path.join(HARNESS_DIR, "cookies.txt");
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
      `Origin: http://localhost:${values.port}`,
      "-H",
      "Content-Type: application/json",
      `http://localhost:${values.port}${route}`,
      ...(body ? ["-d", JSON.stringify(body)] : []),
    ],
    { encoding: "utf8" },
  );
  try {
    return JSON.parse(out);
  } catch {
    return { raw: out.slice(0, 300) };
  }
}

async function state() {
  const { Store } = await import("../../src/app/store/store.mjs");
  const store = new Store(DB);
  try {
    return {
      delivery: store.get("task_deliveries", TASK)?.state ?? null,
      investigation: store.get("task_investigations", TASK)?.state ?? null,
      bindings: store.list("session_bindings").map((b) => ({
        slot: b.slot,
        role: b.role,
        status: b.status,
        executor: b.executor ?? "kirocrew",
      })),
      sends: store
        .list("session_requests")
        .filter((r) => r.kind === "send")
        .map((r) => ({ id: r.id, state: r.state, slot: r.request?.slot })),
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
  return {
    job: job.id,
    runs: runs.slice(0, 50).map((run) => {
      const detail = api(
        "GET",
        `/api/crons/${encodeURIComponent(job.id)}/history/${encodeURIComponent(run.id ?? run.run_id)}`,
      );
      return { id: run.id ?? run.run_id, detail };
    }),
  };
}

// `avoozl plan approve` as the person at this machine: preview, then commit
// the approval to main with the hash the preview printed.
function approve() {
  // The folder in the repository becomes a draft, as Avoozl's page adds it.
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

async function watch() {
  const end = Date.now() + Number(values.minutes) * 60_000,
    seen = new Set();
  let decided = false,
    approved = false,
    restarted = false,
    folderSet = false,
    afterRestart = null;
  while (Date.now() < end) {
    try {
      // The chat's approval cards, answered as the person would.
      const slots = api("GET", "/api/chat/slots");
      for (const slot of Array.isArray(slots) ? slots : []) {
        const pending = slot.pending_approval_info;
        if (!pending || !slot.key.includes(TAG)) continue;
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
      // The folder the tick made gets the checkout as its project folder.
      if (!folderSet) {
        const folders = JSON.parse(
          fs.readFileSync(path.join(CREW, "folders.json"), "utf8"),
        );
        const list = Array.isArray(folders) ? folders : (folders.folders ?? []);
        const folder = list.find((f) => f.name === "app" && !f.project_dir);
        if (folder) {
          api("PATCH", `/api/chat/folders/${folder.id}`, {
            project_dir: fs.realpathSync.native(P.checkout),
          });
          folderSet = true;
          event("folder", { id: folder.id });
        }
      }
      // The person approves the spec once the tick has read it as a draft.
      if (!approved) approved = approve();
      const s = await state();
      const worker = s.bindings.find((b) => b.role === "worker");
      // The page's Go ahead on the findings: the tick releases a message.
      if (!decided && s.investigation === "needs-you") {
        const { Store } = await import("../../src/app/store/store.mjs");
        const { Operations } = await import("../../src/app/api/operations.mjs");
        const store = new Store(DB);
        try {
          await new Operations(store, { workspaceRoot: P.ws }).execute(
            "investigation.decide",
            { taskId: TASK, action: "go" },
            undefined,
            { local: true, person: true },
          );
        } finally {
          store.close();
        }
        decided = true;
        event("go-ahead", {});
      }
      // Once the chat is open, restart the gateway: trust must come back.
      if (!restarted && worker) {
        event("restart.start", { slot: worker.slot });
        harness("restart");
        restarted = true;
        afterRestart = Date.now();
        event("restart.done", {});
      }
      if (
        restarted &&
        worker &&
        afterRestart &&
        Date.now() - afterRestart > 180_000
      ) {
        const listed = api("GET", "/api/chat/slots");
        const slots = Array.isArray(listed) ? listed : (listed?.slots ?? []);
        const slot = slots.find((row) => row.key === worker.slot);
        event("trust", { slot: worker.slot, trust: slot?.trust ?? null });
        afterRestart = null;
      }
      if (s.delivery === "integrated") {
        const report = {
          state: s,
          cron: cronRuns(),
          base: git(P.origin, "log", "--format=%h %s", "main"),
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

const command = positionals[0];
if (command === "setup") await setup();
else if (command === "watch") await watch();
else throw Error("Name setup or watch.");
