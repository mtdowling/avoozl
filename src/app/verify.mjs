// Verify (design §4.26, R86.6, R86.7): what Avoozl checks on a worker's
// commit before it lands. The diff against the task's base must stay inside
// the task's declared `paths`; a diff that touches a protected path waits for
// a person; each declared check runs with its own timeout, warm in the task
// worktree when that worktree is at the commit. check-runs.mjs runs these
// off the tick; delivery judges the record they leave.
import { PUBLISH_RULES, secretReason } from "./content-rules.mjs";
import { commandEvidence, git } from "./git.mjs";
import { fail } from "./store.mjs";

// Protected by default in every repository (R86.6): CI workflows and the
// worktree helper a person approved by hash (R83.4).
const DEFAULT_PROTECTED_PATHS = Object.freeze([
  ".github/workflows/**",
  "scripts/worktree",
]);
const LISTED = 50;
const TAIL_LINES = 20;
const TAIL_CHARS = 2000;
const ALLOW = "protected-allow";

const normal = (file) =>
  String(file).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");

function globSource(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      i++;
      if (pattern[i + 1] === "/") {
        i++;
        out += "(?:.*/)?";
      } else out += ".*";
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return out;
}

// Whether a repository-relative file matches one path pattern: `*` and `?`
// within one segment, `**` across segments, and a plain path names that file
// or everything under that folder.
export function matchesPath(pattern, file) {
  const p = normal(pattern),
    f = normal(file);
  if (!p) return false;
  if (!/[*?]/.test(p)) return f === p || f.startsWith(p + "/");
  return new RegExp(`^${globSource(p)}(?:/.*)?$`).test(f);
}

const anyMatch = (patterns, file) => patterns.some((p) => matchesPath(p, file));

// Every path the commit adds, changes or removes since it left `baseBranch`,
// renames as both sides.
export async function changedPaths(root, baseBranch, head) {
  const base = await git(root, ["merge-base", baseBranch, head]),
    out = await git(root, [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      base,
      head,
    ]);
  return { base, paths: out.split("\0").filter(Boolean) };
}

// The two path rules over a changed list. A task with no declared paths has
// no outside rule; protected paths always apply.
export function pathVerdict(changed, { declared = [], protectedPaths = [] }) {
  const guarded = [...DEFAULT_PROTECTED_PATHS, ...protectedPaths];
  return {
    changed: changed.length,
    outside: declared.length
      ? changed.filter((f) => !anyMatch(declared, f)).slice(0, LISTED)
      : [],
    protected: changed.filter((f) => anyMatch(guarded, f)).slice(0, LISTED),
  };
}

// The path verdict for one run, with a person's allowance for this exact
// commit applied: an allowed commit's protected paths no longer hold it.
export async function verifyPaths(store, { task, project, commit, flow }) {
  const { base, paths } = await changedPaths(
      project.root,
      project.baseBranch || "main",
      commit,
    ),
    verdict = pathVerdict(paths, {
      declared: task.paths || [],
      protectedPaths: flow?.verify?.protectedPaths || [],
    }),
    allowed = protectedAllowance(store, task.id, commit);
  return {
    base,
    ...verdict,
    ...(allowed && verdict.protected.length
      ? { protected: [], allowed: verdict.protected }
      : {}),
  };
}

// What a finished run's paths mean before its checks count, or null:
// outside declared paths fails the writer's attempt; a protected path holds
// the delivery for a person without spending an attempt.
export function pathOutcome(run) {
  const paths = run?.paths;
  if (paths?.outside?.length)
    return {
      outcome: "rejected",
      cause: `outside declared paths: ${paths.outside.join(", ")}`,
    };
  if (paths?.protected?.length)
    return {
      outcome: "protected",
      cause: `touches protected paths: ${paths.protected.join(", ")}`,
    };
  return null;
}

// A check's own timeout in ms: `verify.checkTimeouts[command]`, else the
// caller's, else `verify.checkTimeoutSeconds`.
export function checkTimeout(command, flow, fallbackMs) {
  const own = flow?.verify?.checkTimeouts?.[command];
  if (Number.isInteger(own)) return own * 1000;
  if (Number.isInteger(fallbackMs)) return fallbackMs;
  return (flow?.verify?.checkTimeoutSeconds ?? 1200) * 1000;
}

// One output line as it may be stored: a secret or a home path never is.
function redactLine(line, dir) {
  if (secretReason(line)) return "[redacted]";
  if (
    PUBLISH_RULES.some((r) => r.category === "secret" && r.pattern.test(line))
  )
    return "[redacted]";
  return line
    .split(dir)
    .join(".")
    .replace(/\/(?:Users|home)\/[^/\s]+\//g, "~/")
    .replace(/\b[A-Za-z]:\\+Users\\+[^\\\s]+\\+/g, "~\\");
}

export function outputTail(text, dir = "\u0000") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(-TAIL_LINES)
    .map((line) => redactLine(line, dir));
  const tail = lines.join("\n");
  return tail.length > TAIL_CHARS ? tail.slice(-TAIL_CHARS) : tail;
}

// The first line of a failed check's own text that names an error or a
// failure, else its first line, redacted and cut to 200 characters; null
// when the check carries no text. Reads only what the check already holds
// (a GitHub check run's output, a status description, a local run's tail).
export function firstErrorLine(...texts) {
  const lines = texts
    .flatMap((text) => String(text ?? "").split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  const line =
    lines.find((l) => /\b(error|fail(ed|ure|ing)?|exception)\b|✖/i.test(l)) ??
    lines[0];
  return line ? redactLine(line, "\u0000").slice(0, 200) : null;
}

// The last `lines` lines of output, redacted like a check's tail, for a log
// excerpt sent back to a worker (landing-trains LT10.5).
export function outputExcerpt(text, dir = "\u0000", lines = 200) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(-lines)
    .map((line) => redactLine(line, dir))
    .join("\n");
}

// Why a check that ended without an exit code did not run (R38.1).
export function notRunCause(result, elapsed, timeoutMs) {
  if (result.signal && elapsed >= timeoutMs)
    return `timed out after ${Math.round(timeoutMs / 1000)} s`;
  if (result.signal) return `stopped by ${result.signal}`;
  return (
    String(result.stderr || "could not start")
      .split("\n")[0]
      .slice(0, 200) || "could not start"
  );
}

// Run each check in `dir`, one at a time, each with its own timeout.
export async function runEach(
  dir,
  argvs,
  { timeoutFor, run = commandEvidence, env } = {},
) {
  const checks = [];
  for (const argv of argvs) {
    const command = argv.join(" "),
      timeoutMs = timeoutFor(command),
      started = Date.now(),
      result = await run(dir, argv, { timeoutMs, env }),
      elapsed = Date.now() - started,
      tail = outputTail(
        (result.stdout || "") + "\n" + (result.stderr || ""),
        dir,
      );
    checks.push({
      command,
      exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null,
      ...(Number.isInteger(result.exitCode)
        ? {}
        : { notRun: notRunCause(result, elapsed, timeoutMs) }),
      durationMs: elapsed,
      ...(tail ? { tail } : {}),
    });
  }
  return checks;
}

// The task worktree, when checks may run warm in it: it is at `commit` and
// has no tracked change a check could mix into the result. Null otherwise.
export async function warmWorktree(store, taskId, commit) {
  const worktree = store.get("task_worktrees", taskId);
  if (!worktree?.path) return null;
  try {
    const head = await git(worktree.path, ["rev-parse", "HEAD"]),
      dirty = await git(worktree.path, [
        "status",
        "--porcelain",
        "--untracked-files=no",
      ]);
    return head === commit && !dirty ? worktree.path : null;
  } catch {
    return null;
  }
}

function protectedAllowance(store, taskId, commit) {
  try {
    return store.get("flow_records", `${ALLOW}:${taskId}:${commit}`) || null;
  } catch {
    return null;
  }
}

// A person lets one exact commit's protected paths land (R86.6): the
// delivery leaves its decision and the next tick checks that commit again.
// Never a session's.
export function allowProtectedPaths(
  store,
  input = {},
  { caller = null, mcp = false, local = false } = {},
) {
  if (mcp || caller?.sessionKey)
    fail("Only a person lets a protected path land.", 403);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 300)
    fail("Say why in at most 300 characters.");
  return store.transaction(() => {
    const delivery = store.get("task_deliveries", String(input.taskId || ""));
    if (!delivery) fail(`${input.taskId} has no delivery.`, 404);
    const held = (delivery.verifications || []).findLast(
      (v) => v.outcome === "protected",
    );
    if (delivery.state !== "decision" || held?.commit !== delivery.commit)
      fail(`${delivery.taskId} is not held for a protected path.`, 409);
    const at = new Date().toISOString(),
      record = {
        id: `${ALLOW}:${delivery.taskId}:${delivery.commit}`,
        kind: ALLOW,
        taskId: delivery.taskId,
        commit: delivery.commit,
        paths: held.cause,
        reason,
        by: local ? "cli" : "dashboard",
        at,
      };
    store.put("flow_records", record);
    const { cause: _cause, decisionNotifiedAt: _n, ...rest } = delivery;
    store.put("task_deliveries", { ...rest, state: "done", updatedAt: at });
    return record;
  });
}
