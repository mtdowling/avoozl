// Report by command line (R88.2, R88.3, design §4.26): a chat or a person runs
// `avoozl runner report TASK done|blocked` from the task's worktree. Avoozl
// matches the report to the task by the worktree path and by the report token
// in the brief, so a report needs neither MCP sharing nor the gateway's
// session identity. The store keeps only the token's SHA-256.
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";
import { listSessionBindings } from "./session-bindings.mjs";

const TOKENS = "report.tokens";
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const slotKey = (slot) =>
  slot.startsWith("dashboard:") ? slot.slice("dashboard:".length) : slot;

// A new token for one session on one task. Asking again replaces the old one,
// so a rebuilt brief carries the only token that works.
export function issueReportToken(store, { taskId, slot }) {
  const token = crypto.randomBytes(24).toString("hex");
  store.setMeta(TOKENS, {
    ...(store.getMeta(TOKENS) || {}),
    [`${taskId}\n${slotKey(slot)}`]: hash(token),
  });
  return token;
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
  const tokens = store.getMeta(TOKENS) || {},
    given = Buffer.from(hash(token)),
    binding = listSessionBindings(store).find((b) => {
      const stored = tokens[`${taskId}\n${slotKey(b.slot)}`];
      return (
        b.taskId === taskId &&
        stored &&
        stored.length === given.length &&
        crypto.timingSafeEqual(Buffer.from(stored), given)
      );
    });
  if (!binding) fail("The report token does not match this task.", 403);
  const worktree = store.get("task_worktrees", taskId)?.path;
  if (!worktree || !inside(worktree, cwd))
    fail("Run the report from this task's worktree.", 403);
  return binding;
}

// The caller identity reportSession reads, built from the matched binding.
export const cliReportCaller = (binding) => ({
  sessionKey: `dashboard:${slotKey(binding.slot)}`,
});

// `avoozl runner report TASK done|blocked --token T`, run from the worktree.
// `ops` is an Operations on this workspace's store. The commit of a done
// report is read from the worktree's HEAD, never taken from the caller.
export async function reportByToken(
  store,
  ops,
  { taskId, state, token, cwd, text },
) {
  if (!["done", "blocked"].includes(state)) fail("State is done or blocked.");
  const binding = matchCliReport(store, { taskId, token, cwd }),
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
