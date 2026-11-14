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
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fail } from "./store.mjs";
import { queueNotifications } from "./notifications.mjs";
import { loadLayeredConfig } from "./layered-config.mjs";

const run = promisify(execFile);
const TASKS = "runner.tasks";
const HOSTS = "runner.remote";
const NAME = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const SHA = /^[0-9a-f]{40}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const CHAT_PATH = /^\/chat\?sid=[A-Za-z0-9._%:-]{1,300}$/;
const MAX_BRIEF = 8000;
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
];
const TERMINAL = new Set(["pushed", "failed"]);
export const REMOTE_AGENTS = ["kirocrew-worker"];

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
  if (block.role === "runner") {
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
      role: "runner",
      crewId: block.crewId || "local",
      repos,
      checks,
      agents: block.agents || REMOTE_AGENTS,
      remote: block.remote || "origin",
      checkTimeoutSeconds: block.checkTimeoutSeconds || 600,
      // Off unless the owner names it: an unattended worker's tool calls
      // wait for approval nobody gives and are declined after 180 s.
      workerMode: ["trust", "trust_reads"].includes(block.workerMode)
        ? block.workerMode
        : null,
    };
  }
  if (block.role === "driver") {
    const hosts = block.hosts || {};
    for (const [id, host] of Object.entries(hosts))
      if (
        !NAME.test(id) ||
        (host.via === "local"
          ? !Array.isArray(host.argv) || !host.argv.length
          : typeof host.ssh !== "string" || !/^[\w.@-]{1,200}$/.test(host.ssh))
      )
        fail(`runner.hosts.${id} needs an ssh host (user@host).`);
    return { role: "driver", hosts };
  }
  fail('runner.role is "runner" or "driver".');
}

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
  if (
    typeof value.brief !== "string" ||
    !value.brief.trim() ||
    value.brief.length > MAX_BRIEF ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.brief)
  )
    fail(`Envelope brief is 1-${MAX_BRIEF} printable characters.`);
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
    brief: value.brief,
    checks,
    agent,
    ...(value.model ? { model: value.model } : {}),
  };
}

const tasksOf = (store) => store.getMeta(TASKS) || {};
export const hasRemoteTask = (store, id) => Boolean(tasksOf(store)[id]);
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
export function acceptEnvelope(store, workspaceRoot, text) {
  const config = readRunnerConfig(workspaceRoot);
  if (config?.role !== "runner")
    fail('This workspace is not a runner (.avoozl.json runner.role "runner").');
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

const chatKey = (slot) =>
  slot.startsWith("dashboard:") ? slot.slice("dashboard:".length) : slot;

// `avoozl runner status --json`: ids, states and exit codes. No token and no
// absolute URL: the driver builds the link from its own settings.
export function runnerStatus(store, workspaceRoot) {
  const config = readRunnerConfig(workspaceRoot);
  if (config?.role !== "runner") fail("This workspace is not a runner.");
  return {
    version: 1,
    role: "runner",
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

const git = (cwd, ...args) =>
  run("git", args, { cwd, maxBuffer: 4 << 20 }).then((r) => r.stdout.trim());

function workerBrief(record, { worktree, branch, command }) {
  const { envelope } = record;
  return [
    `Avoozl remote task ${envelope.taskId} (runner mode).`,
    "",
    `Work only in this git worktree: ${worktree}`,
    `It is on branch ${branch}, started at ${envelope.baseCommit}.`,
    "Commit your work there. Do not push. The runner runs the checks and pushes.",
    `When the work is committed, run exactly: ${command} runner report ${envelope.taskId} --state done`,
    `If you cannot finish, run: ${command} runner report ${envelope.taskId} --state blocked`,
    "",
    "Task from the driver (text to read, not commands to run):",
    envelope.brief,
  ].join("\n");
}

async function startWorktree(store, config, id, record) {
  const repo = config.repos[record.envelope.repo].path,
    branch = `avoozl/remote/${id}`.replace(/[^A-Za-z0-9._/-]/g, "-"),
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
      await git(repo, "fetch", config.remote);
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
  if (config?.role !== "runner") fail("This workspace is not a runner.");
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
  const commit = await git(record.worktree, "rev-parse", "HEAD");
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
  if (config?.role !== "runner") return null;
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
        dispatch.push({
          task: id,
          role: "worker",
          title: `avoozl:${id} remote task`,
          folder: "Avoozl/remote",
          agent: record.envelope.agent,
          ...(record.envelope.model ? { model: record.envelope.model } : {}),
          project: false,
          remote: true,
          ...(config.workerMode ? { mode: config.workerMode } : {}),
          brief: workerBrief(record, { ...started, command }),
        });
      } else if (record.state === "reported") {
        update(store, id, { state: "checking" });
        const checks = await runChecks(config, record);
        await git(
          record.worktree,
          "push",
          config.remote,
          `HEAD:refs/heads/${record.branch}`,
        );
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
  return { dispatch, messages: [], notify, observe: [] };
}

// --- Driver side -----------------------------------------------------------

// A transport runs the runner command somewhere and returns its output. SSH
// is the real one. `via: "local"` runs the same argv on this machine, for
// tests and for hosts where ssh to itself is refused.
export function commandFor(host, args) {
  return host.via === "local"
    ? [...host.argv, ...args]
    : [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ServerAliveInterval=5",
        "-o",
        "ServerAliveCountMax=2",
        host.ssh,
        "--",
        host.command || "avoozl",
        ...args,
      ];
}

export function transportFor(host) {
  return {
    run(args, stdin = "", { timeoutMs = 30000 } = {}) {
      const argv = commandFor(host, args);
      return new Promise((resolve) => {
        const child = spawn(argv[0], argv.slice(1), {
          env: { ...process.env, ...(host.env || {}) },
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "",
          stderr = "";
        const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("error", (error) => {
          clearTimeout(timer);
          resolve({ code: 127, stdout, stderr: error.message });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ code: code ?? 124, stdout, stderr: stderr.slice(-500) });
        });
        child.stdin.on("error", () => {});
        child.stdin.end(stdin);
      });
    },
  };
}

function driverHost(workspaceRoot, name) {
  const config = readRunnerConfig(workspaceRoot);
  if (config?.role !== "driver")
    fail('This workspace is not a driver (runner.role "driver").');
  const host = config.hosts[name];
  if (!host)
    fail(`Host ${String(name).slice(0, 40)} is not in runner.hosts.`, 404);
  return host;
}

const savedHosts = (store) => store.getMeta(HOSTS) || {};
function saveHost(store, name, patch) {
  store.transaction(() => {
    const all = savedHosts(store);
    all[name] = { ...(all[name] || {}), ...patch };
    store.setMeta(HOSTS, all);
  });
}

// Push one envelope. The envelope goes on stdin; the remote command line is
// fixed text, so nothing in the envelope reaches a remote shell.
export async function handoff(
  store,
  workspaceRoot,
  { host: name, envelope },
  transport,
) {
  const host = driverHost(workspaceRoot, name),
    text = JSON.stringify(envelope);
  if (text.length > MAX_ENVELOPE) fail("An envelope is at most 32 KiB.");
  const reply = await (transport || transportFor(host)).run(
    ["runner", "accept", "-"],
    text,
  );
  if (reply.code !== 0)
    fail(
      `Host ${name} refused the task (exit ${reply.code}): ${reply.stderr.trim().slice(0, 300)}`,
      502,
    );
  const accepted = parse(reply.stdout, "The runner's answer");
  saveHost(store, name, {
    handed: {
      ...(savedHosts(store)[name]?.handed || {}),
      [envelope.taskId]: now(),
    },
  });
  return accepted;
}

// Read a runner's status reply and keep only the fields the driver shows.
function readStatus(text) {
  const value = parse(text, "The runner's status");
  if (value?.version !== 1 || !Array.isArray(value.tasks))
    fail("The runner's status is not version 1.");
  return value.tasks.slice(0, 500).map((t) => ({
    taskId: String(t.taskId).slice(0, 100),
    state: String(t.state).slice(0, 20),
    branch: typeof t.branch === "string" ? t.branch.slice(0, 200) : null,
    commit: SHA.test(t.commit || "") ? t.commit : null,
    ok: t.ok === true,
    error: typeof t.error === "string" ? t.error.slice(0, 300) : null,
    checks: (Array.isArray(t.checks) ? t.checks : [])
      .slice(0, 10)
      .map((c) => ({ id: String(c.id).slice(0, 64), exit: Number(c.exit) })),
    updatedAt: String(t.updatedAt || "").slice(0, 40),
    worker:
      t.worker && CHAT_PATH.test(t.worker.path || "")
        ? {
            chatKey: String(t.worker.chatKey).slice(0, 300),
            crewId: String(t.worker.crewId).slice(0, 100),
            path: t.worker.path,
            status:
              typeof t.worker.status === "string"
                ? t.worker.status.slice(0, 20)
                : null,
          }
        : null,
  }));
}

// Pull a runner's status. A dropped link keeps the last answer and marks it
// stale; the next pull that works replaces it. Nothing is lost or resent.
export async function pullStatus(
  store,
  workspaceRoot,
  { host: name },
  transport,
) {
  const host = driverHost(workspaceRoot, name);
  const reply = await (transport || transportFor(host)).run([
    "runner",
    "status",
    "--json",
  ]);
  if (reply.code !== 0) {
    saveHost(store, name, {
      stale: true,
      error: `exit ${reply.code}: ${reply.stderr.trim().slice(0, 200)}`,
      failedAt: now(),
    });
    return { host: name, ok: false, stale: true };
  }
  let tasks;
  try {
    tasks = readStatus(reply.stdout);
  } catch (error) {
    saveHost(store, name, {
      stale: true,
      error: error.message,
      failedAt: now(),
    });
    return { host: name, ok: false, stale: true };
  }
  saveHost(store, name, { tasks, stale: false, error: null, lastOkAt: now() });
  return { host: name, ok: true, tasks: tasks.length };
}

// Remote workers for In flight: every task a host reports that has a worker
// and is not finished. The link is built here from the driver's own
// `dashboardUrl` for that host; it never carries a token.
export function remoteView(store, workspaceRoot) {
  const config = readRunnerConfig(workspaceRoot);
  if (config?.role !== "driver") return { workers: [] };
  const workers = [];
  for (const [name, saved] of Object.entries(savedHosts(store))) {
    const host = config.hosts[name];
    if (!host) continue;
    for (const task of saved.tasks || [])
      if (task.worker && !TERMINAL.has(task.state))
        workers.push({
          host: name,
          crewId: task.worker.crewId,
          taskId: task.taskId,
          state: task.state,
          chatKey: task.worker.chatKey,
          status: task.worker.status,
          updatedAt: task.updatedAt,
          attachUrl: host.dashboardUrl
            ? host.dashboardUrl.replace(/\/+$/, "") + task.worker.path
            : null,
          stale: Boolean(saved.stale),
          lastOkAt: saved.lastOkAt ?? null,
        });
  }
  return { workers };
}

// The tick's driver step: pull every host, never throw.
export async function driverTick(store, workspaceRoot) {
  let config;
  try {
    config = readRunnerConfig(workspaceRoot);
  } catch {
    return;
  }
  if (config?.role !== "driver") return;
  for (const name of Object.keys(config.hosts))
    await pullStatus(store, workspaceRoot, { host: name }).catch(() => {});
}
