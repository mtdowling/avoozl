import {
  enqueueSessionRequests,
  pendingSessionRequests,
} from "../sessions/session-requests.mjs";
import { persistKirocrewConfiguration } from "../executors/kirocrew.mjs";
import { kirocrewRequest } from "../executors/kirocrew.mjs";
import { kirocrewDetachedSession } from "../executors/kirocrew.mjs";
// Runner mode over SSH (Requirement 84, design §6.13). Off unless
// `.avoozl.json` has `runner`. A runner holds no plans: it runs the tasks a
// driver hands it. A driver pushes a task envelope over SSH, pulls the
// runner's status, and shows each remote worker in In flight.
//
// The envelope carries IDs and fixed fields only. The runner resolves a repo
// ID and a check ID against its own `.avoozl.json`, so nothing the driver
// sends is ever run as a command. The brief is text for the worker agent.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { remoteGit, remoteGitSetup } from "../git/git.mjs";
import { personOf } from "../github/github.mjs";
import { enforce, pushLines } from "../content/content-rules.mjs";
import { taskGit } from "../git/task-git.mjs";
import { fail } from "../store/store.mjs";
import { briefCell } from "./worker-briefs.mjs";
import { queueNotifications } from "../tick/notifications.mjs";
import { loadLayeredConfig } from "../settings/layered-config.mjs";
import { checkpointBranch, sourceRegistry } from "./working-heads.mjs";
import { lanesOf, poolsOf, pullOffers } from "./worker-offers.mjs";
import {
  acknowledged,
  envelopeFor,
  forgetRequest,
  requestGrants,
} from "./worker-grants.mjs";

const run = promisify(execFile);
const TASKS = "runner.tasks";
const NAME = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const SHA = /^[0-9a-f]{40}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const MAX_ENVELOPE = 32 * 1024;
const ENVELOPE_KEYS = [
  "version",
  "taskId",
  "repo",
  "baseCommit",
  "brief",
  "checks",
  "agent",
  "model",
  "spec",
];
const SPEC = /^[a-z0-9][a-z0-9-]{0,79}$/;
// A worker (R90.1) holds no plans: it takes tasks only from its own pull and
// runs them on the task tick.
export const HOLDS_TASKS = (config) => config?.role === "worker";
const TERMINAL = new Set(["pushed", "failed"]);
const REMOTE_AGENTS = ["kirocrew-worker"];

const executorOf = (value) => {
  if (value === undefined || value === "kirocrew") return "kirocrew";
  if (value === "process") return "process";
  return fail('runner.executor is "kirocrew" or "process".');
};

const parse = (text, what) => {
  try {
    return JSON.parse(text);
  } catch {
    fail(`${what} is not JSON.`);
  }
};

// The `runner` block of `.avoozl.json`, or null when the workspace is not in
// runner mode. A malformed block is refused by name, never half-read.
export function readRunnerConfig(workspaceRoot, env = process.env) {
  if (!workspaceRoot) return null;
  let policy;
  try {
    // The merged layers: `.avoozl.json` holds the portable parts, and the
    // machine's own config holds `runner.repos` paths (never committed).
    policy = loadLayeredConfig({ workspaceRoot, env }).config;
  } catch {
    // An unreadable configuration is the main tick's to report; here it
    // only means this workspace is not in runner mode.
    return null;
  }
  const block = policy?.runner;
  // Machine config may hold `repos` and `hosts` before any role turns it on.
  if (block === undefined || block?.role === undefined) return null;
  if (!block || typeof block !== "object" || Array.isArray(block))
    fail(".avoozl.json runner must be an object.");
  if (block.role === "worker") {
    const repos = block.repos || {},
      checks = block.checks || {};
    for (const [id, repo] of Object.entries(repos))
      if (!NAME.test(id) || !path.isAbsolute(repo?.path || ""))
        fail(`runner.repos.${id} needs a name and an absolute path.`);
    for (const [id, check] of Object.entries(checks))
      if (
        !NAME.test(id) ||
        !Array.isArray(check?.argv) ||
        !check.argv.length ||
        check.argv.some((part) => typeof part !== "string")
      )
        fail(`runner.checks.${id} needs an argv list of strings.`);
    return {
      role: block.role,
      crewId: block.crewId || "local",
      repos,
      checks,
      agents: block.agents || REMOTE_AGENTS,
      // Which executor runs the worker's session (R90.8). Only `kirocrew`
      // needs Kiro Crew; `process` runs headless under the supervisor.
      executor: executorOf(block.executor),
      remote: block.remote || "origin",
      checkTimeoutSeconds: block.checkTimeoutSeconds || 600,
      // Off unless the owner names it: an unattended worker's tool calls
      // wait for approval nobody gives and are declined after 180 s.
      workerMode: ["trust", "trust_reads"].includes(block.workerMode)
        ? block.workerMode
        : null,
      // A worker's own pull: where the journals are, which source
      // repositories it may fetch, and how many tasks it runs at once.
      pools: poolsOf(block.pools),
      sources: (sourceRegistry(block.sources), block.sources ?? {}),
      lanes: lanesOf(block.lanes),
    };
  }
  fail('runner.role is "worker".');
}

const workerTaskBrief = ({ spec, taskId }) =>
  `Task ${taskId} of spec ${spec}. Read every Markdown file in the spec's folder in this worktree (tasks.md and any other spec text) and do only that task.`;

// Check an envelope field by field. Unknown keys are refused so a newer
// driver cannot slip a field an older runner would ignore.
export function validateEnvelope(value, config) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("An envelope is an object.");
  for (const key of Object.keys(value))
    if (!ENVELOPE_KEYS.includes(key)) fail(`Envelope field ${key} is unknown.`);
  if (value.version !== 1) fail("Envelope version must be 1.");
  if (typeof value.taskId !== "string" || !TASK_ID.test(value.taskId))
    fail("Envelope taskId is a task ID.");
  if (typeof value.repo !== "string" || !config.repos[value.repo])
    fail(
      `Envelope repo ${String(value.repo).slice(0, 40)} is not set up here.`,
    );
  if (typeof value.baseCommit !== "string" || !SHA.test(value.baseCommit))
    fail("Envelope baseCommit is a full lowercase SHA.");
  // IDs only (R90.1): a worker's brief is built here from the spec in its
  // own checkout, so nothing the offer says is read as an instruction.
  if (value.brief !== undefined)
    fail("A worker envelope carries IDs only, no brief.");
  if (typeof value.spec !== "string" || !SPEC.test(value.spec))
    fail("A worker envelope names its spec ID.");
  const checks = value.checks ?? [];
  if (
    !Array.isArray(checks) ||
    checks.length > 10 ||
    checks.some((id) => typeof id !== "string" || !config.checks[id])
  )
    fail("Envelope checks name at most 10 checks this runner has.");
  const agent = value.agent ?? config.agents[0];
  if (!config.agents.includes(agent))
    fail("Envelope agent is not allowed here.");
  if (value.model !== undefined && !MODEL.test(value.model))
    fail("Envelope model is a model name.");
  return {
    version: 1,
    taskId: value.taskId,
    repo: value.repo,
    baseCommit: value.baseCommit,
    brief: workerTaskBrief(value),
    spec: value.spec,
    checks,
    agent,
    ...(value.model ? { model: value.model } : {}),
  };
}

const tasksOf = (store) => store.getMeta(TASKS) || {};
export const hasRemoteTask = (store, id) => Boolean(tasksOf(store)[id]);
export function runnerSessionHold(store, id) {
  const record = tasksOf(store)[id];
  return record &&
    ["accepted", "starting"].includes(record.state) &&
    !record.worker
    ? null
    : "The runner task is no longer waiting for its first worker.";
}
const now = () => new Date().toISOString();

function update(store, id, patch) {
  store.transaction(() => {
    const all = tasksOf(store);
    if (!all[id]) return;
    all[id] = { ...all[id], ...patch, updatedAt: now() };
    store.setMeta(TASKS, all);
  });
}

// `avoozl runner accept`: record the task once. The same envelope again is
// a no-op; a different one under the same task ID is refused, so a task is
// never claimed twice and never changed after it started.
export function acceptEnvelope(store, workspaceRoot, text, { pulled } = {}) {
  const config = readRunnerConfig(workspaceRoot);
  if (!HOLDS_TASKS(config))
    fail('This workspace is not a runner (.avoozl.json runner.role "runner").');
  // An envelope is taken only from an acknowledged claim (worker pull).
  if (!pulled)
    fail("A worker takes only a task whose claim the driver acknowledged.");
  if (typeof text !== "string" || text.length > MAX_ENVELOPE)
    fail("An envelope is at most 32 KiB.");
  const envelope = validateEnvelope(parse(text, "The envelope"), config),
    digest = crypto
      .createHash("sha256")
      .update(JSON.stringify(envelope))
      .digest("hex");
  return store.transaction(() => {
    const all = tasksOf(store),
      seen = all[envelope.taskId];
    if (seen) {
      if (seen.digest !== digest)
        fail(
          `Task ${envelope.taskId} was already accepted with other content.`,
          409,
        );
      return { taskId: envelope.taskId, state: seen.state, duplicate: true };
    }
    all[envelope.taskId] = {
      envelope,
      digest,
      state: "accepted",
      acceptedAt: now(),
      updatedAt: now(),
      checks: [],
    };
    store.setMeta(TASKS, all);
    return { taskId: envelope.taskId, state: "accepted", duplicate: false };
  });
}

// `avoozl worker pull`: read this worker's offers from the spec journals,
// at most one per free lane. It starts nothing; the offers wait for the
// driver's acknowledgment (R90.4). The last pull is kept for the next steps.
export async function pullWork(store, workspaceRoot, github) {
  const config = readRunnerConfig(workspaceRoot);
  if (config?.role !== "worker")
    fail('This workspace is not a worker (.avoozl.json runner.role "worker").');
  if (!github?.available?.())
    fail("A worker needs GitHub to pull offers.", 409);
  const login = await personOf(github);
  if (!login) fail("GitHub did not name this worker's login.", 409);
  const running = Object.values(tasksOf(store)).filter(
      (record) => !TERMINAL.has(record.state),
    ).length,
    result = await pullOffers({
      github,
      pools: config.pools,
      sources: config.sources,
      login,
      free: config.lanes - running,
    });
  store.setMeta("worker.offers", { at: now(), ...result });
  return result;
}

// `avoozl worker accept`: ask for each pulled offer, and start only those the
// driver acknowledged for this worker, within the free lanes (R90.4). A task
// no acknowledgment names starts nothing.
export async function acceptWork(store, workspaceRoot, github) {
  const config = readRunnerConfig(workspaceRoot);
  if (config?.role !== "worker")
    fail('This workspace is not a worker (.avoozl.json runner.role "worker").');
  if (!github?.available?.()) fail("A worker needs GitHub to claim.", 409);
  const login = await personOf(github);
  if (!login) fail("GitHub did not name this worker's login.", 409);
  const requested = await requestGrants(store, {
      pools: config.pools,
      github,
    }),
    { ready, waiting } = await acknowledged(store, {
      pools: config.pools,
      github,
      login,
    }),
    result = {
      requested,
      started: [],
      held: [],
      waiting: waiting.map(({ spec, task }) => ({ spec, task })),
    };
  let free =
    config.lanes -
    Object.values(tasksOf(store)).filter((r) => !TERMINAL.has(r.state)).length;
  for (const offer of ready) {
    if (hasRemoteTask(store, offer.task)) {
      forgetRequest(store, offer);
      continue;
    }
    if (free < 1) break;
    const { envelope, held } = await envelopeFor(offer, { config });
    if (held) {
      result.held.push({ spec: offer.spec, task: offer.task, reason: held });
      continue;
    }
    acceptEnvelope(store, workspaceRoot, JSON.stringify(envelope), {
      pulled: true,
    });
    forgetRequest(store, offer);
    free -= 1;
    result.started.push({ spec: offer.spec, task: offer.task });
  }
  return result;
}

// A worker machine's own tick (worker-paths WP5.2): pull offers within the
// free lanes, ask for them, and start the ones the driver acknowledged, with
// the same functions `avoozl worker pull` and `avoozl worker accept` run once
// by hand. With no GitHub, or a GitHub that fails, the tick records one line
// and starts nothing; the next tick tries again. Returns what it did, or null
// on a workspace that is not a worker.
export async function workerTick(store, workspaceRoot, github) {
  const config = readRunnerConfig(workspaceRoot);
  if (config?.role !== "worker") return null;
  const skipped = (reason) => {
    store.event(null, "worker.tick", { skipped: reason });
    return { pulled: null, claimed: null, skipped: reason };
  };
  if (!github?.available?.()) return skipped("no GitHub access");
  try {
    const pulled = await pullWork(store, workspaceRoot, github);
    return {
      pulled: pulled.offers.length,
      claimed: await acceptWork(store, workspaceRoot, github),
    };
  } catch (error) {
    return skipped(error.message);
  }
}

const chatKey = (slot) =>
  slot.startsWith("dashboard:") ? slot.slice("dashboard:".length) : slot;

// `avoozl runner status --json`: ids, states and exit codes. No token and no
// absolute URL: the driver builds the link from its own settings.
export function runnerStatus(store, workspaceRoot) {
  const config = readRunnerConfig(workspaceRoot);
  if (!HOLDS_TASKS(config)) fail("This workspace is not a runner.");
  return {
    version: 1,
    role: config.role,
    crewId: config.crewId,
    at: now(),
    tasks: Object.entries(tasksOf(store)).map(([taskId, record]) => ({
      taskId,
      state: record.state,
      branch: record.branch ?? null,
      commit: record.commit ?? null,
      checks: record.checks,
      ok: record.state === "pushed" && record.checks.every((c) => c.exit === 0),
      error: record.error ?? null,
      acceptedAt: record.acceptedAt,
      updatedAt: record.updatedAt,
      worker: record.worker
        ? {
            chatKey: chatKey(record.worker.slot),
            crewId: config.crewId,
            path: `/chat?sid=${encodeURIComponent(chatKey(record.worker.slot))}`,
            status: record.worker.status ?? null,
          }
        : null,
    })),
  };
}

// The URL a remote name stands for, read in the checkout itself (never the
// worker-writable task folder).
const remoteUrl = async (checkout, name) =>
  /[:/]/.test(name) ? name : git(checkout, "remote", "get-url", name);

const git = (cwd, ...args) =>
  run("git", args, { cwd, maxBuffer: 4 << 20 }).then((r) => r.stdout.trim());

async function startWorktree(store, config, id, record) {
  const repo = config.repos[record.envelope.repo].path,
    // A worker pushes to the task's checkpoint ref (R90.2, §4.32.8).
    branch = record.envelope.spec
      ? checkpointBranch(record.envelope.spec, id)
      : `avoozl/remote/${id}`.replace(/[^A-Za-z0-9._/-]/g, "-"),
    worktree = path.join(
      path.dirname(repo),
      `${path.basename(repo)}-remote-worktrees`,
      id.replace(/[^A-Za-z0-9._-]/g, "-"),
    );
  if (!fs.existsSync(worktree)) {
    try {
      await git(
        repo,
        "cat-file",
        "-e",
        `${record.envelope.baseCommit}^{commit}`,
      );
    } catch {
      await remoteGit(repo, ["fetch", config.remote], {
        job: "worker-grants",
      });
    }
    await git(
      repo,
      "worktree",
      "add",
      "-b",
      branch,
      worktree,
      record.envelope.baseCommit,
    );
  }
  update(store, id, { state: "starting", branch, worktree });
  return { branch, worktree };
}

// `avoozl runner report`: the worker says it finished. The runner reads the
// commit from the worktree itself and does not trust the worker for it.
export async function reportDone(store, workspaceRoot, { taskId, state }) {
  const config = readRunnerConfig(workspaceRoot),
    record = tasksOf(store)[taskId];
  if (!HOLDS_TASKS(config)) fail("This workspace is not a runner.");
  if (!record) fail("Task not found.", 404);
  if (!["done", "blocked"].includes(state)) fail("State is done or blocked.");
  if (!["starting", "working"].includes(record.state))
    fail(`Task ${taskId} is ${record.state}; it takes no report now.`, 409);
  if (state === "blocked") {
    update(store, taskId, {
      state: "failed",
      error: "The worker reported blocked.",
    });
    return { taskId, state: "failed" };
  }
  // The worker can write the folder's .git file; read it as D6 says.
  const commit = await taskGit(record.worktree, ["rev-parse", "HEAD"], {
    checkout: config.repos[record.envelope.repo]?.path,
  });
  if (commit === record.envelope.baseCommit)
    fail("The worktree has no new commit. Commit the work, then report.", 409);
  update(store, taskId, { state: "reported", commit });
  return { taskId, state: "reported", commit };
}

async function runChecks(config, record) {
  const results = [];
  for (const id of record.envelope.checks) {
    const [file, ...args] = config.checks[id].argv;
    let exit = 0;
    try {
      await run(file, args, {
        cwd: record.worktree,
        timeout: config.checkTimeoutSeconds * 1000,
        maxBuffer: 8 << 20,
      });
    } catch (error) {
      exit = typeof error.code === "number" ? error.code : 124;
    }
    results.push({ id, exit });
  }
  return results;
}

// One runner tick: record statuses, open one worker per accepted task, and
// finish reported ones. It returns dispatch intents for the tick script; no
// model turn is spent unless a task is waiting. A worker whose lease lapsed
// is never replaced: the task keeps its worker or waits for a person.
export async function runnerTick(
  store,
  workspaceRoot,
  { roster = null, bindings = [], command } = {},
) {
  const config = readRunnerConfig(workspaceRoot);
  if (!HOLDS_TASKS(config)) return null;
  const dispatch = [],
    notify = [];
  for (const id of Object.keys(tasksOf(store))) {
    let record = tasksOf(store)[id];
    if (TERMINAL.has(record.state)) continue;
    try {
      const bound = bindings.find(
        (b) => b.taskId === id && b.role === "worker",
      );
      if (bound && !record.worker)
        update(store, id, {
          state: record.state === "starting" ? "working" : record.state,
          worker: { slot: bound.slot, boundAt: bound.boundAt },
        });
      record = tasksOf(store)[id];
      // The roster when the cron has one, else the status the app backend
      // read from Kiro Crew and stored on the binding.
      const row = bound && roster?.find((r) => r.target === bound.slot),
        status = row?.status ?? bound?.status;
      if (status && record.worker?.status !== status)
        update(store, id, {
          worker: { ...record.worker, slot: bound.slot, status },
        });
      record = tasksOf(store)[id];
      if (
        record.state === "accepted" ||
        (record.state === "starting" && !bound)
      ) {
        const started =
          record.state === "accepted"
            ? await startWorktree(store, config, id, record)
            : record;
        dispatch.push(
          kirocrewRequest(store, {
            task: id,
            role: "worker",
            title: `avoozl:${id} remote task`,
            executor: config.executor === "process" ? "process" : "kirocrew",
            ...kirocrewDetachedSession("remote"),
            agent: record.envelope.agent,
            ...(record.envelope.model ? { model: record.envelope.model } : {}),
            remote: true,
            worktree: started.worktree,
            ...(config.workerMode ? { mode: config.workerMode } : {}),
            brief: briefCell(
              config.executor === "process" ? "process" : "kirocrew",
              "machine",
            ).cell.brief(record, started, command),
          }),
        );
      } else if (record.state === "reported") {
        update(store, id, { state: "checking" });
        const checks = await runChecks(config, record);
        // The outgoing range passes content rules and the privacy scan
        // before the push; a refusal fails the task with nothing pushed.
        enforce(
          store,
          {
            boundary: "diff",
            target: `diff:${id}`,
            added: pushLines(
              record.worktree,
              record.envelope.baseCommit,
              "HEAD",
              [record.branch],
            ),
          },
          { mode: "refuse", taskId: id },
        );
        // Signed in through Avoozl's helper for the push (§D9), run as
        // taskGit on the worker's folder.
        const push = remoteGitSetup(
          record.worktree,
          ["push", config.remote, `HEAD:refs/heads/${record.branch}`],
          {
            job: "worker-grants",
            remote: await remoteUrl(
              config.repos[record.envelope.repo]?.path,
              config.remote,
            ),
          },
        );
        await taskGit(record.worktree, push.args, {
          checkout: config.repos[record.envelope.repo]?.path,
          env: push.env,
        });
        update(store, id, { state: "pushed", checks, pushedAt: now() });
      } else if (
        record.worker &&
        ["closed", "lost"].includes(record.worker.status) &&
        ["working", "starting"].includes(record.state)
      ) {
        notify.push({
          channel: "decision",
          task: id,
          slot: record.worker.slot,
          title: `Remote task ${id} needs you`,
          text: `Remote task ${id}: the worker chat ended without a report. It was not replaced.`,
        });
      }
    } catch (error) {
      update(store, id, {
        state: "failed",
        error: String(error.message).slice(0, 300),
      });
    }
  }
  // The same notice again is one row, so a repeated tick cannot repeat it.
  queueNotifications(store, notify);
  const transport = store.transaction(() => {
    const requests = enqueueSessionRequests(
      store,
      { starts: dispatch },
      { source: "runner" },
    );
    for (const request of requests.starts)
      persistKirocrewConfiguration(store, request);
    const pending = pendingSessionRequests(store, undefined, [
      ...requests.starts,
      ...requests.sends,
    ]);
    return {
      starts: pending.filter((request) => request.operation === "start"),
      sends: pending.filter((request) => request.operation === "send"),
    };
  });
  return {
    dispatch: transport.starts,
    messages: transport.sends,
    notify,
    observe: [],
  };
}
