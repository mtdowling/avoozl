// @ts-nocheck: typing debt
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
import { git, remoteGit } from "../git/git.ts";
import { commitSubject } from "../landing/landing-config.ts";
import { recordActivity } from "../store/activity-log.ts";
import { FINAL_STATUSES } from "../sessions/session-bindings.ts";
import { checkedItems, specItems } from "./spec-plans.ts";
import { linkDefinitions, specGroupOf } from "./order.ts";
import { statusComplete } from "../../query.ts";
import { specsPath } from "./specs-path.ts";
import { specsBranch } from "./specs-branch.ts";
import {
  SPEC_TEXT,
  TASKS_FILE,
  specTasks,
  taskFile,
  taskText,
} from "./spec-tasks.ts";

const exec = promisify(execFile);
// The file that holds a spec's tasks, as a path in the checkout at `root`.
// `files` is the spec's stored files, which name it (spec-tasks.mjs).
const tasksPath = (root, name, files) =>
  `${specsPath(root)}/${name}/${taskFile(files)}`;
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
// IDs it ticked. `file` is the file's name, so a `## Tasks` section is read
// as the task list. With `groups`, every open group whose children are all
// ticked is ticked too, as landings on bases that lacked each other's tick
// can leave one (workflow rule 3.2).
export function tickedText(
  name,
  text,
  ids,
  file = TASKS_FILE,
  { groups = false } = {},
) {
  const items = specItems(name, taskText(file, text)),
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
        (above.has(parent.key) || groups) &&
        children.length &&
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

// Linked specs (simplify §D19.2): once every task of `spec` is ticked in the
// checkout at `dir`, tick each spec group that links it, in the same commit,
// and so on up. Returns the IDs it ticked.
// shortcut: only a parent on the same specs branch is ticked; a parent
// elsewhere waits for its own tick commit.
async function tickParents(dir, spec, seen = new Set([spec])) {
  const folder = path.join(dir, specsPath(dir)),
    // A folder's task file, its whole text and its task text, or null.
    read = (name) => {
      const files = {};
      try {
        for (const file of fs.readdirSync(path.join(folder, name)))
          if (SPEC_TEXT.test(file))
            files[file] = fs.readFileSync(
              path.join(folder, name, file),
              "utf8",
            );
      } catch {
        return null;
      }
      const found = specTasks(files);
      return found && { ...found, raw: files[found.file] };
    },
    own = read(spec),
    items = own ? specItems(spec, own.text).filter((item) => item.key) : [];
  if (!items.length || items.some((item) => item.mark !== "x")) return [];
  const ticked = [];
  let names = [];
  try {
    names = fs.readdirSync(folder);
  } catch {}
  for (const name of names) {
    const found = !seen.has(name) && read(name);
    if (!found) continue;
    const { file, text, raw } = found,
      definitions = linkDefinitions(text),
      lines = text.split("\n"),
      groups = specItems(name, text)
        .filter(
          (item) =>
            item.key &&
            item.mark !== "x" &&
            specGroupOf(name, item, definitions, lines) === spec,
        )
        .map((item) => item.id);
    if (!groups.length) continue;
    const tick = tickedText(name, raw, groups, file);
    if (!tick.ticked.length) continue;
    fs.writeFileSync(path.join(folder, name, file), tick.text);
    await git(dir, ["add", `${specsPath(dir)}/${name}/${file}`]);
    ticked.push(
      ...tick.ticked,
      ...(await tickParents(dir, name, new Set([...seen, name]))),
    );
  }
  return ticked;
}

// The IDs tasks.md names for these task IDs: the plan's mapping, backwards.
const itemIdsOf = (plan, taskIds) =>
  Object.entries(plan?.mapping ?? {})
    .filter(([, taskId]) => taskIds.includes(taskId))
    .map(([id]) => id);

const idsOf = (plan, entry) =>
  itemIdsOf(
    plan,
    entry.tasks.map((t) => t.task),
  );

const inCandidate = (repository, candidate, plan) =>
  git(repository.root, [
    "cat-file",
    "-e",
    `${candidate}:${tasksPath(repository.root, plan.spec, plan.files)}`,
  ]).then(
    () => true,
    () => false,
  );

// Tick a landing entry's tasks in the landing candidate's worktree, before
// its merge commit (merge-batch.mjs stackMembers). A spec whose tasks.md is
// not in this repository is left to `tickPlansRepo`.
export async function tickEntry(store, dir, entry) {
  const plan = store.get("plans", entry.spec),
    relative = plan?.spec && tasksPath(dir, plan.spec, plan.files),
    file = relative && path.join(dir, relative);
  if (!file || !fs.existsSync(file)) return;
  const { text, ticked } = tickedText(
    plan.spec,
    fs.readFileSync(file, "utf8"),
    idsOf(plan, entry),
    taskFile(plan.files),
  );
  if (!ticked.length) return;
  fs.writeFileSync(file, text);
  await git(dir, ["add", relative]);
  await tickParents(dir, plan.spec);
}

// A spec that lives in a plans repository other than the code repository:
// its tick is its own commit there, after the code landed. Does nothing for a spec the code
// repository holds, whose landing commit carried the tick. The tick goes on
// the workspace's specs branch (specs-branch.mjs). Returns `{done: true}`
// once the tick is known to be on its done branch (in the candidate, newly
// committed, or already there), else null: a read or push failed.
export async function tickPlansRepo(
  store,
  { entry, candidate, repository, workspaceRoot, env },
) {
  const plan = store.get("plans", entry.spec);
  if (!plan?.spec) return null;
  if (await inCandidate(repository, candidate, plan)) return { done: true };
  const roots = [
    store.getMeta("workspaceRepository")?.root,
    ...store
      .list("repositories")
      .filter((p) => p.planning && p.root)
      .map((p) => p.root),
    workspaceRoot,
  ].filter(
    (root, i, all) =>
      root && root !== repository.root && all.indexOf(root) === i,
  );
  for (const root of roots) {
    const branch = specsBranch(store, workspaceRoot, root);
    const out = await tickBranch(root, {
      branch,
      files: [
        {
          spec: plan.spec,
          ids: idsOf(plan, entry),
          file: taskFile(plan.files),
        },
      ],
      env,
      // shortcut: the code repository's prefix, since the plans repository
      // has no setting of its own; add one when the two differ.
      commitPrefix: repository.commitPrefix,
    }).catch(() => null);
    if (out?.commit || out?.found) return { root, branch, ...out, done: true };
  }
  return null;
}

// Tick tasks in a checkout's base branch as one commit: fetch, build on the
// fetched head, push without force, and start again from a fresh fetch when
// the branch moved (Requirement 113.10). `files` is [{spec, ids, file}],
// where `file` names the spec's task file (tasks.md when absent). Returns
// {ticked, commit}; no commit when nothing ticked.
// Run `fn(dir)` in a temporary detached worktree of `root` at `commit`,
// removed afterwards.
async function inDetached(root, commit, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-tick-"));
  try {
    await git(root, ["worktree", "add", "--detach", "--quiet", dir, commit]);
    return await fn(dir);
  } finally {
    await git(root, ["worktree", "remove", "--force", dir]).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The head a `pr` landing pushes (simplify SM4.1): `commit` with the entry's
// tasks ticked in a commit of its own on top, so the pull request's checks
// run on the tick. `commit` itself when its tasks.md is not in this
// repository or the boxes are already ticked.
export function tickedHead(
  store,
  root,
  entry,
  commit,
  {
    env,
    commitPrefix = "",
  }: { env?: NodeJS.ProcessEnv; commitPrefix?: string } = {},
) {
  return inDetached(root, commit, async (dir) => {
    await tickEntry(store, dir, entry);
    if (!(await git(dir, ["diff", "--cached", "--name-only"]))) return commit;
    await git(
      dir,
      [
        "commit",
        "--quiet",
        "-m",
        commitSubject(
          commitPrefix,
          `Tick ${entry.tasks.map((t) => t.task).join(", ")}`,
        ),
      ],
      { env },
    );
    return git(dir, ["rev-parse", "HEAD"]);
  });
}

// Workflow rule 3.2: a group left open on `branch` with every child ticked,
// as two children landing on bases that lacked each other's tick leave one,
// is ticked in a commit of its own that changes only its box. `text` is the
// task list as read on the branch. Pushed once, never forced; a refused push
// waits for the next read. Returns the IDs it ticked.
export async function tickOpenGroups(
  root,
  {
    branch,
    spec,
    files,
    text,
    env,
    commitPrefix = "",
  }: {
    branch: string;
    spec: string;
    files?: Record<string, string>;
    text: string;
    env?: NodeJS.ProcessEnv;
    commitPrefix?: string;
  },
) {
  if (!tickedText(spec, text, [], TASKS_FILE, { groups: true }).ticked.length)
    return [];
  const out = await tickBranch(root, {
    branch,
    files: [{ spec, ids: [], file: taskFile(files), groups: true }],
    tries: 1,
    env,
    commitPrefix,
  });
  return out?.ticked ?? [];
}

export async function tickBranch(
  root,
  {
    branch,
    files,
    remote = "origin",
    tries = 5,
    env,
    commitPrefix = "",
  }: {
    branch: string;
    files: { spec: string; ids: string[]; file?: string; groups?: unknown }[];
    remote?: string;
    tries?: number;
    env?: NodeJS.ProcessEnv;
    commitPrefix?: string;
  },
) {
  for (let attempt = 1; ; attempt++) {
    await remoteGit(root, ["fetch", "--quiet", remote, branch], { env });
    const base = await git(root, ["rev-parse", "FETCH_HEAD"]);
    const out = await inDetached(root, base, async (dir) => {
      const ticked = [];
      let found = 0;
      for (const { spec, ids, file: name = TASKS_FILE, groups } of files) {
        const relative = `${specsPath(dir)}/${spec}/${name}`,
          file = path.join(dir, relative);
        if (!fs.existsSync(file)) continue;
        found += 1;
        const tick = tickedText(
          spec,
          fs.readFileSync(file, "utf8"),
          ids,
          name,
          { groups },
        );
        if (!tick.ticked.length) continue;
        fs.writeFileSync(file, tick.text);
        await git(dir, ["add", relative]);
        ticked.push(...tick.ticked, ...(await tickParents(dir, spec)));
      }
      // `found`: a tasks file was there, so nothing left to tick is done.
      if (!ticked.length) return { ticked, found };
      await git(
        dir,
        [
          "commit",
          "--quiet",
          "-m",
          commitSubject(commitPrefix, `Tick ${ticked.join(", ")}`),
        ],
        { env },
      );
      const commit = await git(dir, ["rev-parse", "HEAD"]);
      try {
        await remoteGit(
          dir,
          ["push", "--quiet", remote, `HEAD:refs/heads/${branch}`],
          { env, job: "spec-branch" },
        );
        return { ticked, commit };
      } catch (error) {
        if (attempt >= tries) throw error;
        return null;
      }
    });
    if (out) return out;
  }
}

// `branch` of the checkout at `root` as git holds it: {head, ref}. What the
// remote holds is the shared state: fetch it (once per checkout in
// `fetched`, one tick's set), then read it. A checkout with no remote reads
// its own branch. Throws when the branch is not there.
export async function baseHead(root, branch, { fetched } = {}) {
  const remote = `refs/remotes/origin/${branch}`;
  if (!fetched?.has(root)) {
    fetched?.add(root);
    await remoteGit(root, ["fetch", "--quiet", "origin", branch]).catch(
      () => {},
    );
  }
  const ref = await git(root, ["rev-parse", "--verify", `${remote}^{commit}`])
    .then(() => remote)
    .catch(() => branch);
  return {
    head: await git(root, ["rev-parse", "--verify", `${ref}^{commit}`]),
    ref,
  };
}

// The task text of `branch` in the checkout at `root`, as git holds it, with
// the branch's head; null when the branch or the file is not there. `files`
// is the spec's stored files, which name its task file (spec-tasks.mjs).
export async function baseTasks(root, branch, name, { fetched, files } = {}) {
  try {
    const { head, ref } = await baseHead(root, branch, { fetched });
    // Not `git()`: its trim would shift the line numbers.
    const { stdout } = await exec(
      "git",
      ["show", `${head}:${tasksPath(root, name, files)}`],
      { cwd: root, maxBuffer: 8 * 1024 * 1024 },
    );
    return { head, ref, text: taskText(taskFile(files), stdout) };
  } catch {
    return null;
  }
}

// The commit that last changed each line of the task file on `ref`, by line
// number: for a ticked item, the commit on the base branch that ticked it.
// First parent only, so a merge (Avoozl's landing, a merged pull request)
// owns what it brought, as a squash or a direct push does. One `git blame`.
export async function tickCommits(root, ref, name, files) {
  try {
    const { stdout } = await exec(
        "git",
        [
          "blame",
          "--first-parent",
          "--porcelain",
          ref,
          "--",
          tasksPath(root, name, files),
        ],
        { cwd: root, maxBuffer: 32 * 1024 * 1024 },
      ),
      times = new Map(),
      lines = new Map();
    let current = null;
    for (const row of stdout.split("\n")) {
      const head = /^([0-9a-f]{40}) \d+ (\d+)/.exec(row);
      if (head) {
        current = head[1];
        lines.set(Number(head[2]), current);
      } else if (row.startsWith("committer-time ") && current)
        times.set(current, Number(row.slice(15)));
    }
    return new Map(
      [...lines].map(([line, commit]) => [
        line,
        {
          commit,
          at: times.has(commit)
            ? new Date(times.get(commit) * 1000).toISOString()
            : null,
        },
      ]),
    );
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
// `read` is {branch, text, head, commits() -> line -> {commit, at}}.
// Each ticked task keeps `tickCommit`, the base-branch commit that ticked
// it: receipts and Flow look its CI up by it (R101.14, R113.14). It is read
// once and kept. With `read.land`, a done task with no landing lands at it.
// Returns the activity lines it wrote.
export async function applyTicks(store, plan, read) {
  const { ticked, present } = ticksOf(plan.spec, read.text),
    seenKey = `spec-ticks:${plan.id}`,
    before = store.getMeta(seenKey),
    data = store.read(),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    // A person's `Built:` line, read when there is one; Avoozl writes none.
    built = checkedItems(plan.spec, read.text),
    now = [];
  // The commit for each tick that will complete a task, and each ticked
  // task's tick commit, read before the write so git stays outside the
  // transaction.
  const found = new Map(),
    ticks = new Map(),
    open = (task) =>
      !statusComplete(data, task.status) &&
      // Avoozl's own landing carried this tick: already known, so no second
      // Activity line and no worker released (Requirement 113.11).
      !task.integration?.commit;
  let commits;
  for (const [id, tick] of ticked) {
    const task = byId.get(plan.mapping?.[id]);
    if (!task || (task.tickCommit && !open(task))) continue;
    commits ??= (await read.commits?.()) ?? new Map();
    const at = commits.get(tick.line);
    if (at) ticks.set(id, at.commit);
    if (open(task)) found.set(id, at ?? { commit: read.head });
  }
  store.mutate(`Ticks on ${read.branch} for ${plan.spec}`, (next) => {
    const tasks = new Map(next.tasks.map((task) => [task.id, task]));
    for (const [id, tick] of ticked) {
      const task = tasks.get(plan.mapping?.[id]);
      if (!task) continue;
      delete task.untick;
      const commit = /^`?([0-9a-f]{7,40})\b/.exec(
        built.get(id)?.built ?? "",
      )?.[1];
      if (commit) task.built = commit;
      if (ticks.has(id)) task.tickCommit = ticks.get(id);
      if (
        read.land &&
        ticks.has(id) &&
        statusComplete(next, task.status) &&
        !task.integration?.commit
      )
        task.integration = {
          commit: ticks.get(id),
          branch: read.branch,
          into: read.branch,
          at: task.acceptanceEvidence?.at ?? new Date().toISOString(),
        };
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
