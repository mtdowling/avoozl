// Report by command line (R88.2, R88.3, design §4.26): a chat or a person runs
// `avoozl runner report TASK done|blocked` from the task's worktree. Avoozl
// matches the report to the task by the worktree path and by the report token
// in the brief, so a report needs neither MCP sharing nor the gateway's
// session identity.
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";
import { listSessionBindings } from "./session-bindings.mjs";

const slotKey = (slot) =>
  slot.startsWith("dashboard:") ? slot.slice("dashboard:".length) : slot;
const SECRET = "report.secret";

// The token is an HMAC of the task and attempt under a secret kept in the
// store, so a brief built twice carries the same token, and a new attempt
// gets a new one. The store keeps the secret, never a token. It reads only:
// null means no secret exists yet, and the brief keeps the MCP report.
export function issueReportToken(store, { taskId, attempt = 1 }) {
  const secret = store.getMeta(SECRET);
  if (!secret) return null;
  return crypto
    .createHmac("sha256", secret)
    .update(`${taskId}\n${attempt}`)
    .digest("hex")
    .slice(0, 48);
}

const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
};

// True when `cwd` is the worktree or inside it, after symlinks resolve.
function inside(worktree, cwd) {
  const root = real(worktree),
    here = real(cwd);
  if (!root || !here) return false;
  const rel = path.relative(root, here);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// The session binding a command-line report speaks for. Every refusal is a 403
// with one fixed message per cause, and none echoes the token.
export function matchCliReport(store, { taskId, token, cwd }) {
  if (typeof taskId !== "string" || !taskId) fail("Name the task.");
  if (typeof token !== "string" || !/^[0-9a-f]{48}$/.test(token))
    fail("The report token is missing or malformed.", 403);
  const binding = listSessionBindings(store)
    .filter((b) => b.taskId === taskId && b.role === "worker")
    .sort((x, y) => (y.attempt || 0) - (x.attempt || 0))[0];
  if (!binding || !store.getMeta(SECRET))
    fail("The report token does not match this task.", 403);
  const want = Buffer.from(
      issueReportToken(store, { taskId, attempt: binding.attempt }),
    ),
    got = Buffer.from(token);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got))
    fail("The report token does not match this task.", 403);
  const worktree = store.get("task_worktrees", taskId)?.path;
  if (!worktree || !inside(worktree, cwd))
    fail("Run the report from this task's worktree.", 403);
  return binding;
}

// R96.5: a person who ran `avoozl claim` holds no token; the local command
// line already acts on the database. Matched by the worktree alone, and only
// for a claim this machine's command line made, so a tick-opened chat still
// needs its token.
export function matchClaimReport(store, { taskId, cwd }) {
  if (typeof taskId !== "string" || !taskId) fail("Name the task.");
  const binding = listSessionBindings(store)
    .filter((b) => b.taskId === taskId && b.role === "worker")
    .sort((x, y) => (y.attempt || 0) - (x.attempt || 0))[0];
  if (!binding) fail(`No one has claimed ${taskId}. Run avoozl claim.`, 409);
  if (binding.conductor !== "cli")
    fail("This task's worker reports with the --token in its brief.", 403);
  const worktree = store.get("task_worktrees", taskId)?.path;
  if (!worktree || !inside(worktree, cwd))
    fail("Run the report from this task's worktree.", 403);
  return binding;
}

// The caller identity reportSession reads, built from the matched binding.
export const cliReportCaller = (binding) => ({
  sessionKey: `dashboard:${slotKey(binding.slot)}`,
});

// `avoozl runner report TASK done|blocked [--token T]`, run from the
// worktree; with no token it speaks for a command-line claim. `ops` is an
// Operations on this workspace's store. The commit of a done report is read
// from the worktree's HEAD, never taken from the caller.
export async function reportByToken(
  store,
  ops,
  { taskId, state, token, cwd, text },
) {
  if (!["done", "blocked"].includes(state)) fail("State is done or blocked.");
  const binding =
      token === undefined
        ? matchClaimReport(store, { taskId, cwd })
        : matchCliReport(store, { taskId, token, cwd }),
    input =
      state === "done"
        ? {
            taskId,
            kind: "done",
            commit: await new Promise((resolve, reject) =>
              execFile("git", ["rev-parse", "HEAD"], { cwd }, (error, out) =>
                error ? reject(error) : resolve(out.trim()),
              ),
            ),
          }
        : {
            taskId,
            kind: "blocked",
            text: text || "The worker reported blocked.",
          };
  return ops.execute("session.report", input, undefined, {
    caller: cliReportCaller(binding),
  });
}
