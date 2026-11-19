// A tick on the base branch completes the task (Requirement 113, design
// §4.41). Avoozl reads each approved spec's tasks.md as the base branch holds
// it, never a working branch or an unsaved edit, and compares its `[x]` items
// with the database. A task ticked there that is not done becomes done at
// once, with no approval and no new revision: marks stay outside the revision
// hash (`withoutMarks`). `[~]` and `[-]` are Kiro's queued and running marks
// and mean nothing here.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { git } from "./git.mjs";
import { recordActivity } from "./activity-log.mjs";
import { FINAL_STATUSES } from "./session-bindings.mjs";
import { specItems } from "./spec-plans.mjs";
import { statusComplete } from "../query.mjs";

const exec = promisify(execFile);
const tasksPath = (name) => `.kiro/specs/${name}/tasks.md`;
const short = (commit) => String(commit ?? "").slice(0, 12);

// Task ID -> {key, line} for every item ticked [x], plus each of its
// sub-items: a ticked parent is done and so are its open children
// (Requirement 113.6). `present` holds every ID the file names, so an
// unticked item can be told from a removed one.
export function ticksOf(name, text) {
  const items = specItems(name, text),
    byKey = new Map(items.filter((item) => item.key).map((i) => [i.key, i])),
    ticked = new Map(),
    present = new Set(items.filter((item) => item.id).map((item) => item.id));
  for (const item of items) {
    if (!item.key) continue;
    for (let up = item; up; up = up.parent && byKey.get(up.parent.key)) {
      if (up.mark !== "x") continue;
      ticked.set(item.id, { key: item.key, line: item.line });
      break;
    }
  }
  return { ticked, present };
}

// tasks.md of `branch` in the checkout at `root`, as git holds it, with the
// branch's head; null when the branch or the file is not there.
export async function baseTasks(root, branch, name) {
  try {
    const head = await git(root, [
      "rev-parse",
      "--verify",
      `${branch}^{commit}`,
    ]);
    // Not `git()`: its trim would shift the line numbers.
    const { stdout } = await exec(
      "git",
      ["show", `${head}:${tasksPath(name)}`],
      { cwd: root, maxBuffer: 8 * 1024 * 1024 },
    );
    return { head, text: stdout };
  } catch {
    return null;
  }
}

// The newest commit on `branch` that changed a line ticking `key`, which for
// an item ticked at the head is the commit that ticked it.
export async function tickCommit(root, branch, name, key) {
  const pattern = `^\\s*[-*+] \\[[xX]\\] ${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ .]`;
  try {
    const [commit, at] = (
      await git(root, [
        "log",
        "-1",
        "--format=%H %cI",
        `-G${pattern}`,
        branch,
        "--",
        tasksPath(name),
      ])
    ).split(" ");
    return commit ? { commit, at } : null;
  } catch {
    return null;
  }
}

// A task the tick marks done. A validation-gated task is left alone: only
// checks Avoozl recorded accept it (Requirement 38.4), and no mark can.
function complete(task, { key, line, branch, found }) {
  const at = found.at ?? new Date().toISOString(),
    commit = found.commit;
  task.status = "accepted";
  task.acceptanceEvidence = {
    at,
    evidence: `tasks.md line ${line} marks ${key} [x] on ${branch}${commit ? ` at commit ${short(commit)}` : ""}`,
    baseline: { file: "tasks.md", line, mark: "[x]", branch, commit },
    componentOnly: false,
  };
  task.integration = task.integration ?? {
    commit,
    branch,
    into: branch,
    at,
  };
  task.updatedAt = at;
  delete task.untick;
}

// Compare one spec's ticks with the database. `plan` is the stored plan,
// `read` is {branch, text, head, find(key) -> {commit, at}}.
// Returns the activity lines it wrote.
export async function applyTicks(store, plan, read) {
  const { ticked, present } = ticksOf(plan.spec, read.text),
    seenKey = `spec-ticks:${plan.id}`,
    before = store.getMeta(seenKey),
    data = store.read(),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    now = [];
  // The commit for each tick that will complete a task, read before the
  // write so the git calls stay outside the transaction.
  const found = new Map();
  for (const [id, tick] of ticked) {
    const task = byId.get(plan.mapping?.[id]);
    if (
      task &&
      !statusComplete(data, task.status) &&
      task.acceptFrom !== "validation"
    )
      found.set(id, (await read.find(tick.key)) ?? { commit: read.head });
  }
  store.mutate(`Ticks on ${read.branch} for ${plan.spec}`, (next) => {
    const tasks = new Map(next.tasks.map((task) => [task.id, task]));
    for (const [id, tick] of ticked) {
      const task = tasks.get(plan.mapping?.[id]);
      if (!task) continue;
      delete task.untick;
      if (!found.has(id)) continue;
      complete(task, {
        key: tick.key,
        line: tick.line,
        branch: read.branch,
        found: found.get(id),
      });
      now.push({ task, commit: found.get(id).commit });
    }
    // An item that was ticked and is now open, in a task that is done: not
    // reopened silently; it waits in Needs you (Requirement 113.4).
    for (const id of before ?? []) {
      const task = tasks.get(plan.mapping?.[id]);
      if (
        !ticked.has(id) &&
        present.has(id) &&
        task &&
        statusComplete(next, task.status)
      )
        task.untick = { at: new Date().toISOString(), branch: read.branch };
    }
  });
  store.setMeta(seenKey, [...ticked.keys()]);
  const released = [];
  for (const { task, commit } of now) {
    recordActivity(store, {
      source: "tick",
      kind: "task.ticked",
      summary: `${task.id} is done: ticked in tasks.md on ${read.branch}${commit ? ` at ${short(commit)}` : ""}`,
      targetId: task.id,
      key: `ticked:${task.id}:${commit ?? read.head}`,
    });
    for (const binding of store.list("session_bindings"))
      if (
        binding.taskId === task.id &&
        binding.role === "worker" &&
        !FINAL_STATUSES.has(binding.status)
      ) {
        store.put("session_bindings", {
          ...binding,
          status: "closed",
          statusAt: new Date().toISOString(),
          releasedFor: "ticked",
        });
        recordActivity(store, {
          source: "tick",
          kind: "worker.released",
          summary: `Released the worker session for ${task.id}: its tick on ${read.branch} won`,
          targetId: task.id,
          key: `released:${binding.slot}:${task.id}`,
        });
        released.push(binding.slot);
      }
  }
  return { done: now.map(({ task }) => task.id), released };
}
