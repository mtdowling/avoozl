// The remote coder (RC15, design D20): a managed remote harness that takes one
// task per ready task (or batch) and opens its pull request through a person.
// Avoozl talks to it through the harness's own MCP server, started as a local
// child process for one tick and stopped after it. It calls two tools only,
// `create-code-task` and `get-task-statuses`, opens no socket, stores no
// credentials, and files each task under the approving person's own sign-in.
//
// States per task: filed, working, finished-unpublished, pr-open, merged,
// failed. The harness's own words map onto them here and nowhere else. A
// task counts as done only when its public pull request has merged.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { check, screenReply } from "./content-rules.mjs";
import { fail } from "./store.mjs";

export const TOOLS = Object.freeze(["create-code-task", "get-task-statuses"]);
export const STATES = Object.freeze([
  "filed",
  "working",
  "finished-unpublished",
  "pr-open",
  "merged",
  "failed",
]);
const KIND = "remote-task";
const HOLD = "remoteSignIn";
const SIGN_IN =
  /sign.?in|signed.?in|unauthori[sz]ed|expired|authenticat|\b401\b/i;
const TIMEOUT_MS = 30_000;

// ---- the harness's MCP server, as a child process -------------------------

// A minimal MCP client over the child's stdin and stdout (one JSON message per
// line). `command` is `[program, ...arguments]` from the person's local
// config. Nothing is listened on and the child's environment is the person's
// own, so the harness finds its own sign-in.
export async function openHarness(
  command,
  { timeoutMs = TIMEOUT_MS, env = process.env } = {},
) {
  if (
    !Array.isArray(command) ||
    !command.length ||
    command.some((p) => typeof p !== "string")
  )
    fail(
      "Name the harness command as a list in .avoozl.json remote.command.",
      422,
    );
  const child = spawn(command[0], command.slice(1), {
    stdio: ["pipe", "pipe", "ignore"],
    env,
    windowsHide: true,
  });
  const pending = new Map();
  let id = 0,
    buffer = "",
    ended = null;
  const settle = (message) => {
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.error) {
      const error = new Error(
        String(message.error.message ?? "the harness refused the call"),
      );
      error.signIn = SIGN_IN.test(error.message);
      waiting.reject(error);
    } else waiting.resolve(message.result);
  };
  const end = (reason) => {
    ended ??= reason;
    for (const [key, waiting] of pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error(ended));
      pending.delete(key);
    }
  };
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (let at; (at = buffer.indexOf("\n")) >= 0; ) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      try {
        settle(JSON.parse(line));
      } catch {
        // A line that is not JSON is not ours.
      }
    }
  });
  child.on("error", (error) =>
    end(`the harness did not start: ${error.message}`),
  );
  child.on("exit", () => end("the harness stopped"));
  child.stdout.setEncoding("utf8");
  const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      if (ended) return reject(new Error(ended));
      const key = ++id,
        timer = setTimeout(() => {
          pending.delete(key);
          reject(new Error("the harness did not answer in time"));
        }, timeoutMs);
      pending.set(key, { resolve, reject, timer });
      send({ jsonrpc: "2.0", id: key, method, params });
    });
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "avoozl", version: "1" },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return {
    // Only the two documented tools are ever called.
    async call(name, args) {
      if (!TOOLS.includes(name))
        fail(`The remote coder does not call ${name}.`, 403);
      const result = await request("tools/call", { name, arguments: args });
      const text = result?.content?.find((part) => part.type === "text")?.text;
      if (result?.isError) {
        const error = new Error(
          String(text ?? "the harness reported an error"),
        );
        error.signIn = SIGN_IN.test(error.message);
        throw error;
      }
      try {
        return text === undefined ? (result ?? {}) : JSON.parse(text);
      } catch {
        return { text };
      }
    },
    close() {
      end("the harness was closed");
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 2000);
      child.once("exit", () => clearTimeout(timer));
    },
  };
}

// The harness command is the person's own local setting, never committed:
// $AVOOZL_REMOTE_COMMAND (a JSON list) or .avoozl/local/remote.json
// ({"command": [program, ...arguments]}). Null when neither is set.
export function remoteCommand(workspaceRoot, env = process.env) {
  try {
    const raw = env.AVOOZL_REMOTE_COMMAND
      ? JSON.parse(env.AVOOZL_REMOTE_COMMAND)
      : JSON.parse(
          fs.readFileSync(
            path.join(workspaceRoot, ".avoozl", "local", "remote.json"),
            "utf8",
          ),
        ).command;
    return Array.isArray(raw) &&
      raw.length &&
      raw.every((p) => typeof p === "string")
      ? raw
      : null;
  } catch {
    return null;
  }
}

// ---- one session per tick -------------------------------------------------

// The tick opens one session lazily and closes it when the tick ends. Filing
// outside a tick finds none and waits for the next one.
// shortcut: one module-level session; make it an argument when two ticks can
// overlap in one process.
let active = null;
export function beginRemoteTick(command, open = openHarness) {
  active = { command, open, session: null };
}
export async function remoteSession() {
  if (!active?.command) return null;
  active.session ??= await active.open(active.command);
  return active.session;
}
export function endRemoteTick() {
  const finished = active?.session;
  active = null;
  finished?.close();
}

// ---- state mapping ------------------------------------------------------

// The harness's words onto ours. A harness "complete" is not done: with no
// pull request it is finished-unpublished.
// shortcut: the words below are the common ones; an unknown word keeps the
// last state. Extend when a harness release names others.
export function mapState(raw) {
  const word = String(raw?.state ?? raw?.status ?? "").toLowerCase();
  if (raw?.pullRequestUrl || raw?.pull_request_url) return "pr-open";
  if (["queued", "pending", "created", "submitted"].includes(word))
    return "filed";
  if (
    ["running", "in_progress", "in-progress", "working", "active"].includes(
      word,
    )
  )
    return "working";
  if (
    [
      "complete",
      "completed",
      "done",
      "finished",
      "succeeded",
      "success",
    ].includes(word)
  )
    return "finished-unpublished";
  if (["failed", "error", "cancelled", "canceled"].includes(word))
    return "failed";
  return null;
}

// Done is merged and nothing else (RC15.4).
export const remoteCountsAsDone = (state) => state?.state === "merged";

// ---- receipts -------------------------------------------------------------

const receiptId = (repository, number) => `${KIND}:${repository}#${number}`;
export const remoteTasks = (store) =>
  store.list("receipts").filter((receipt) => receipt.kind === KIND);
const heldFor = (store, approver) => Boolean(store.getMeta(HOLD)?.[approver]);

// Files one task, once. Returns "filed" when it called the harness, "exists"
// when a receipt already covers it, "held" when that person's sign-in is
// expired, "waiting" outside a tick, "blocked" when content rules refuse the
// text. `issue.body` is the approved task text with its markers.
export async function fileRemoteTask({
  store,
  config,
  issue,
  taskIds,
  spec,
  approver,
  now = new Date().toISOString(),
}) {
  const id = receiptId(config.id, issue.number);
  if (store.get("receipts", id)) return "exists";
  if (heldFor(store, approver)) return "held";
  const text = `Task ${taskIds.join(", ")} of spec ${spec} (${config.id}#${issue.number})\n\n${issue.body ?? ""}`,
    screened = check(store, {
      boundary: "github",
      target: "remote-coder",
      text,
    });
  if (
    screened.unavailable.length ||
    screened.findings.length ||
    screenReply(text).length
  )
    return "blocked";
  const session = await remoteSession();
  if (!session) return "waiting";
  try {
    const reply = await session.call("create-code-task", {
      title: String(issue.title ?? taskIds.join(", ")).slice(0, 200),
      prompt: text,
    });
    const harnessId = reply?.id ?? reply?.taskId ?? reply?.task_id;
    if (harnessId === undefined || harnessId === null || harnessId === "")
      throw new Error("the harness returned no task reference");
    store.put("receipts", {
      id,
      kind: KIND,
      repository: config.id,
      number: issue.number,
      taskIds,
      spec,
      approver,
      harnessId: String(harnessId),
      link: typeof reply?.url === "string" ? reply.url : null,
      state: "filed",
      filedAt: now,
      readAt: now,
      finishedAt: null,
      error: null,
    });
    return "filed";
  } catch (error) {
    if (error.signIn) {
      store.setMeta(HOLD, {
        ...(store.getMeta(HOLD) ?? {}),
        [approver]: { at: now },
      });
      return "held";
    }
    throw error;
  }
}

// The tick's watch. `pullsOf(receipt)` returns the pull requests that close
// the task's issue. One cheap check per tick while a sign-in is held; filing
// resumes and the item clears when it passes. A read failure keeps each
// task's last state and says how old it is.
export async function remoteStep(
  store,
  { pullsOf, candidates = async () => [], now = new Date().toISOString() },
) {
  const session = await remoteSession().catch((error) => {
    markFailure(store, error.message);
    return null;
  });
  if (!session) return { read: false };
  const hold = store.getMeta(HOLD) ?? {};
  if (Object.keys(hold).length) {
    try {
      await session.call("get-task-statuses", { ids: [] });
      store.setMeta(HOLD, {});
    } catch (error) {
      if (!error.signIn) markFailure(store, error.message);
    }
  }
  // File what is ready and not yet filed (RC15.2), once each. A failure other
  // than a sign-in is tried again next tick and filed nothing.
  const problems = [];
  for (const entry of await candidates().catch(() => []))
    try {
      await fileRemoteTask({ store, now, ...entry });
    } catch (error) {
      problems.push(`${entry.taskIds.join(", ")}: ${error.message}`);
    }
  const open = remoteTasks(store).filter(
    (receipt) => !["merged", "failed"].includes(receipt.state),
  );
  if (!open.length) return { read: true, problems };
  let statuses;
  try {
    const reply = await session.call("get-task-statuses", {
      ids: open.map((receipt) => receipt.harnessId),
    });
    statuses = new Map(
      (Array.isArray(reply) ? reply : (reply?.tasks ?? [])).map((entry) => [
        String(entry.id ?? entry.taskId ?? entry.task_id),
        entry,
      ]),
    );
  } catch (error) {
    if (error.signIn)
      for (const receipt of open)
        store.setMeta(HOLD, {
          ...(store.getMeta(HOLD) ?? {}),
          [receipt.approver]: { at: now },
        });
    markFailure(store, error.message, open);
    return { read: false, problems };
  }
  for (const receipt of open) {
    let state = receipt.state;
    const mapped = mapState(statuses.get(receipt.harnessId));
    if (mapped) state = mapped;
    // The public pull request decides: opened, merged. A harness word never does.
    if (["finished-unpublished", "pr-open"].includes(state)) {
      const pulls = await pullsOf(receipt).catch(() => null);
      if (pulls?.some((pull) => pull.merged === true || pull.merged_at))
        state = "merged";
      else if (pulls?.some((pull) => pull.state === "open")) state = "pr-open";
    }
    store.put("receipts", {
      ...receipt,
      state,
      readAt: now,
      error: null,
      finishedAt:
        state === "finished-unpublished"
          ? (receipt.finishedAt ?? now)
          : receipt.finishedAt,
      link: statuses.get(receipt.harnessId)?.url ?? receipt.link,
    });
  }
  return { read: true, problems };
}

function markFailure(store, message, tasks = remoteTasks(store)) {
  for (const receipt of tasks)
    store.put("receipts", { ...receipt, error: String(message).slice(0, 200) });
}

// ---- Needs you ------------------------------------------------------------

// One row per task that finished with no public pull request, cleared when
// the pull request appears; one "Sign in again" per person held.
export function remoteNeedsYou(store) {
  const rows = [];
  for (const receipt of remoteTasks(store))
    if (receipt.state === "finished-unpublished")
      rows.push({
        kind: "needs-human",
        reason: "approval",
        id: `remote-publish:${receipt.repository}#${receipt.number}`,
        taskId: null,
        authority: "github",
        issue: { number: receipt.number, repository: receipt.repository },
        link: receipt.link,
        title: `Waiting for a person to publish the pull request for ${receipt.taskIds.join(", ")}`,
        detail: `The remote coder finished ${receipt.taskIds.join(", ")} but no pull request exists yet. Publish it from the harness. It is not done until that pull request merges.${receipt.error ? ` The last read failed: ${receipt.error}` : ""}`,
        openedAt: receipt.finishedAt,
      });
  for (const [approver, entry] of Object.entries(store.getMeta(HOLD) ?? {}))
    rows.push({
      kind: "needs-human",
      reason: "approval",
      id: `remote-sign-in:${approver}`,
      taskId: null,
      authority: "github",
      title: "Sign in again",
      detail: `${approver}'s sign-in to the remote coder has expired. New tasks are held for ${approver} until it works again; sign in in the harness's own app. Avoozl checks once per tick.`,
      openedAt: entry.at,
    });
  return rows;
}
