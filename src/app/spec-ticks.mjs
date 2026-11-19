// A tick on the base branch completes the task (Requirement 113, design
// §4.41). Avoozl reads each approved spec's tasks.md as the base branch holds
// it, never a working branch or an unsaved edit, and compares its `[x]` items
// with the database. A task ticked there that is not done becomes done at
// once, with no approval and no new revision: marks stay outside the revision
// hash (`withoutMarks`). `[~]` and `[-]` are Kiro's queued and running marks
// and mean nothing here.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { git } from "./git.mjs";
import { recordActivity } from "./activity-log.mjs";
import { FINAL_STATUSES } from "./session-bindings.mjs";
import { specItems } from "./spec-plans.mjs";
import { statusComplete } from "../query.mjs";
import { readGitHubPolicyOrNull } from "./github-policy.mjs";
import { mirrorOf } from "./spec-homes.mjs";

const exec = promisify(execFile);
export const tasksPath = (name) => `.kiro/specs/${name}/tasks.md`;
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

// The text with each named task's box ticked, nothing else changed: only the
// mark character of those lines, so Facts bullets, summaries and indentation
// stay byte-identical. A parent is ticked when every child is (Requirement
// 113.9). `ids` are task IDs as tasks.md names them; returns the text and the
// IDs it ticked.
export function tickedText(name, text, ids) {
  const items = specItems(name, text),
    lines = text.split("\n"),
    ticked = [],
    mark = (item) => {
      if (item.mark === "x" || !item.key) return;
      lines[item.line - 1] = lines[item.line - 1].replace(
        /^(\s*[-*+] \[)[ xX~-](\])/,
        "$1x$2",
      );
      item.mark = "x";
      ticked.push(item.id);
    },
    keyed = items.filter((item) => item.key);
  for (const item of keyed) if (ids.includes(item.id)) mark(item);
  // Parents of what ticked, until nothing more ticks.
  const above = new Set();
  for (const item of keyed)
    if (ticked.includes(item.id))
      for (
        let up = item.parent;
        up;
        up = keyed.find((k) => k.key === up.key)?.parent
      )
        above.add(up.key);
  for (let moved = true; moved; ) {
    moved = false;
    for (const parent of keyed) {
      const children = keyed.filter((c) => c.parent?.key === parent.key);
      if (
        above.has(parent.key) &&
        parent.mark !== "x" &&
        children.every((c) => c.mark === "x")
      ) {
        mark(parent);
        moved = true;
      }
    }
  }
  return { text: lines.join("\n"), ticked };
}

// The IDs tasks.md names for these task IDs: the plan's mapping, backwards.
export const itemIdsOf = (plan, taskIds) =>
  Object.entries(plan?.mapping ?? {})
    .filter(([, taskId]) => taskIds.includes(taskId))
    .map(([id]) => id);

// Tick a landing entry's tasks in the landing candidate's worktree, before
// its merge commit (merge-batch.mjs stackMembers). A spec whose tasks.md is
// not in this repository is left to `tickPlansRepo`.
export async function tickEntry(store, dir, entry) {
  const plan = store.get("plans", entry.spec),
    file = plan?.spec && path.join(dir, tasksPath(plan.spec));
  if (!file || !fs.existsSync(file)) return;
  const { text, ticked } = tickedText(
    plan.spec,
    fs.readFileSync(file, "utf8"),
    itemIdsOf(
      plan,
      entry.tasks.map((t) => t.task),
    ),
  );
  if (!ticked.length) return;
  fs.writeFileSync(file, text);
  await git(dir, ["add", tasksPath(plan.spec)]);
}

// A spec that lives in a plans repository other than the code repository:
// its tick is its own commit there, after the code landed. Does nothing for
// a spec the code repository holds, whose landing commit carried the tick.
// shortcut: a plans branch with no local checkout (private specs read over
// the API) is not written; add a contents write when such a spec needs it.
export async function tickPlansRepo(
  store,
  { entry, candidate, project, workspaceRoot, env },
) {
  const plan = store.get("plans", entry.spec);
  if (!plan?.spec) return null;
  const inCode = await git(project.root, [
    "cat-file",
    "-e",
    `${candidate}:${tasksPath(plan.spec)}`,
  ]).then(
    () => true,
    () => false,
  );
  if (inCode) return null;
  const policy = readGitHubPolicyOrNull(workspaceRoot),
    roots = [
      store.getMeta("workspaceRepository")?.root,
      ...store
        .list("projects")
        .filter((p) => p.planning && p.root)
        .map((p) => p.root),
      workspaceRoot,
    ].filter(
      (root, i, all) =>
        root && root !== project.root && all.indexOf(root) === i,
    );
  for (const root of roots) {
    const branch =
      mirrorOf(policy)?.plansBranch ??
      store.list("projects").find((p) => p.root === root)?.baseBranch ??
      "main";
    const out = await tickBranch(root, {
      branch,
      spec: plan.spec,
      ids: itemIdsOf(
        plan,
        entry.tasks.map((t) => t.task),
      ),
      env,
    }).catch(() => null);
    if (out?.ticked.length) return { root, branch, ...out };
  }
  return null;
}

// Tick tasks in the plans repository's own checkout, as one commit on its
// base branch: fetch, build on the fetched head, push without force, and
// start again from a fresh fetch when the branch moved (Requirement 113.10).
export async function tickBranch(
  root,
  { branch, spec, ids, remote = "origin", tries = 5, env },
) {
  const file = tasksPath(spec);
  for (let attempt = 1; ; attempt++) {
    await git(root, ["fetch", "--quiet", remote, branch], { env });
    const base = await git(root, ["rev-parse", "FETCH_HEAD"]),
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-tick-"));
    try {
      await git(root, ["worktree", "add", "--detach", "--quiet", dir, base]);
      let before;
      try {
        before = fs.readFileSync(path.join(dir, file), "utf8");
      } catch {
        return { ticked: [], reason: "no tasks.md" };
      }
      const { text, ticked } = tickedText(spec, before, ids);
      if (!ticked.length) return { ticked };
      fs.writeFileSync(path.join(dir, file), text);
      await git(dir, ["add", file]);
      await git(dir, ["commit", "--quiet", "-m", `Tick ${ticked.join(", ")}`]);
      const commit = await git(dir, ["rev-parse", "HEAD"]);
      try {
        await git(
          dir,
          ["push", "--quiet", remote, `HEAD:refs/heads/${branch}`],
          {
            env,
          },
        );
        return { ticked, commit };
      } catch (error) {
        if (attempt >= tries) throw error;
      }
    } finally {
      await git(root, ["worktree", "remove", "--force", dir]).catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

// tasks.md of `branch` in the checkout at `root`, as git holds it, with the
// branch's head; null when the branch or the file is not there.
export async function baseTasks(root, branch, name, { fetched } = {}) {
  try {
    // What the remote holds is the shared state: fetch it (once per
    // checkout and tick), then read it. A checkout with no remote reads its
    // own branch.
    const remote = `refs/remotes/origin/${branch}`;
    if (!fetched?.has(root)) {
      fetched?.add(root);
      await git(root, ["fetch", "--quiet", "origin", branch]).catch(() => {});
    }
    const ref = await git(root, ["rev-parse", "--verify", `${remote}^{commit}`])
      .then(() => remote)
      .catch(() => branch);
    const head = await git(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
    // Not `git()`: its trim would shift the line numbers.
    const { stdout } = await exec(
      "git",
      ["show", `${head}:${tasksPath(name)}`],
      { cwd: root, maxBuffer: 8 * 1024 * 1024 },
    );
    return { head, ref, text: stdout };
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
      // Avoozl's own landing carried this tick: already known, so no second
      // Activity line and no worker released (Requirement 113.11).
      !task.integration?.commit &&
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
