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
import { type QueuedTask, taskIds } from "../landing/landing-queue.ts";
import { commitSubject } from "../landing/landing-config.ts";
import { recordActivity } from "../store/activity-log.ts";
import { FINAL_STATUSES } from "../sessions/session-bindings.ts";
import {
  checkedItems,
  listSpecFolders,
  readSpecFolder,
  type SpecItem,
  specItems,
} from "./spec-plans.ts";
import { linkDefinitions, specGroupOf } from "./order.ts";
import { statusComplete } from "../../query.ts";
import { flatSpecPath, specFilePaths } from "./specs-path.ts";
import { specsBranch } from "./specs-branch.ts";
import { TASKS_FILE, specTasks, taskFile, taskText } from "./spec-tasks.ts";
import type { Repository } from "../git/git.ts";
import type { SessionBinding } from "../sessions/session-bindings.ts";
import type { Store } from "../store/store.ts";
import type { Task } from "../../types.ts";

const exec = promisify(execFile);
// A stored plan, as far as ticks read it.
interface TickPlan {
  id: string;
  spec?: string;
  files?: Record<string, string>;
  mapping?: Record<string, unknown>;
}
// A landing entry: its spec and the tasks it lands.
interface TickEntry {
  spec?: unknown;
  tasks: QueuedTask[];
}
// Reads stored plans by spec name: a Store, or a test's fake.
interface PlanReader {
  get(table: string, id: unknown): Omit<TickPlan, "id"> | null | undefined;
}
// The commit that ticked a line, and when.
interface TickAt {
  commit: string | null;
  at?: string | null;
}
// A task list item with its key and ID.
type Keyed = SpecItem & { key: string; id: string };
const keyedOf = (items: SpecItem[]) =>
  items.filter((item): item is Keyed => Boolean(item.key && item.id));
// Resolve the task path from the Git tree being read, not the checkout.
async function tasksPathAt(
  root: string,
  ref: string,
  name: string,
  file: string,
) {
  const candidates = specFilePaths(root, name, file),
    tree = await git(root, ["ls-tree", "-r", ref, "--", ...candidates]),
    present = tree
      .split("\n")
      .filter((entry) => entry.startsWith("100"))
      .map((entry) => entry.split("\t")[1])
      .filter((entry) => candidates.includes(entry));
  return present.length === 1 ? present[0] : null;
}

function workingTasks(root: string, name: string) {
  const spec = readSpecFolder(root, name),
    tasks = specTasks(spec.files, spec.flat);
  return (
    tasks && {
      ...tasks,
      flat: spec.flat,
      raw: spec.files[tasks.file],
      relative: spec.folder + tasks.file,
    }
  );
}

async function writeTick(root: string, relative: string, text: string) {
  fs.writeFileSync(path.join(root, relative), text);
  await git(root, ["add", relative]);
}

const short = (commit: string | null | undefined) =>
  String(commit ?? "").slice(0, 12);

// Task ID -> {key, line} for every item ticked [x], plus each of its
// sub-items: a ticked parent is done and so are its open children
// (Requirement 113.6). `present` holds every ID the file names, so an
// unticked item can be told from a removed one.
export function ticksOf(name: string, text: string) {
  const items = specItems(name, text),
    keyed = keyedOf(items),
    byKey = new Map(keyed.map((i) => [i.key, i])),
    ticked = new Map<string, { key: string; line: number }>(),
    present = new Set(keyed.map((item) => item.id));
  for (const item of keyed) {
    for (
      let up: Keyed | undefined = item;
      up;
      up = up.parent?.key ? byKey.get(up.parent.key) : undefined
    ) {
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
  name: string,
  text: string,
  ids: string[],
  file = TASKS_FILE,
  { groups = false, flat = false }: { groups?: boolean; flat?: boolean } = {},
) {
  const items = specItems(name, taskText(file, text, flat)),
    lines = text.split("\n"),
    ticked: string[] = [],
    mark = (item: Keyed) => {
      if (item.mark === "x") return;
      lines[item.line - 1] = lines[item.line - 1].replace(
        /^(\s*[-*+] \[)[ xX~-](\])/,
        "$1x$2",
      );
      item.mark = "x";
      ticked.push(item.id);
    },
    keyed = keyedOf(items);
  for (const item of keyed) if (ids.includes(item.id)) mark(item);
  // Parents of what ticked, until nothing more ticks.
  const above = new Set<string | null>();
  for (const item of keyed)
    if (ticked.includes(item.id))
      for (
        let up: SpecItem["parent"] | undefined = item.parent;
        up;
        up = keyed.find((k) => k.key === up?.key)?.parent
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

// Linked specs: once every task of `spec` is ticked in the
// checkout at `dir`, tick each spec group that links it, in the same commit,
// and so on up. Returns the IDs it ticked.
// shortcut: only a parent on the same specs branch is ticked; a parent
// elsewhere waits for its own tick commit.
async function tickParents(
  dir: string,
  spec: string,
  seen = new Set([spec]),
): Promise<string[]> {
  const own = workingTasks(dir, spec),
    items = own ? keyedOf(specItems(spec, own.text)) : [];
  if (!items.length || items.some((item) => item.mark !== "x")) return [];
  const ticked: string[] = [];
  for (const name of listSpecFolders(dir)) {
    const found = !seen.has(name) && workingTasks(dir, name);
    if (!found) continue;
    const { file, text, raw, relative, flat } = found,
      definitions = linkDefinitions(text),
      lines = text.split("\n"),
      groups = keyedOf(specItems(name, text))
        .filter(
          (item) =>
            item.mark !== "x" &&
            specGroupOf(name, item, definitions, lines, flat) === spec,
        )
        .map((item) => item.id);
    if (!groups.length) continue;
    const tick = tickedText(name, raw, groups, file, { flat });
    if (!tick.ticked.length) continue;
    await writeTick(dir, relative, tick.text);
    ticked.push(
      ...tick.ticked,
      ...(await tickParents(dir, name, new Set([...seen, name]))),
    );
  }
  return ticked;
}

// The IDs tasks.md names for these task IDs: the plan's mapping, backwards.
const itemIdsOf = (
  plan: Pick<TickPlan, "mapping"> | null | undefined,
  ids: string[],
) =>
  Object.entries(plan?.mapping ?? {})
    .filter(([, taskId]) => typeof taskId === "string" && ids.includes(taskId))
    .map(([id]) => id);

const idsOf = (
  plan: Pick<TickPlan, "mapping"> | null | undefined,
  entry: TickEntry,
) => itemIdsOf(plan, taskIds(entry));

const inCandidate = (
  repository: Repository,
  candidate: string,
  spec: string,
  files?: Record<string, string>,
) =>
  tasksPathAt(repository.root, candidate, spec, taskFile(files)).then(
    Boolean,
    () => false,
  );

// Tick a landing entry's tasks in the landing candidate's worktree, before
// its merge commit (merge-batch.mjs stackMembers). A spec whose tasks.md is
// not in this repository is left to `tickPlansRepo`.
export async function tickEntry(
  store: PlanReader,
  dir: string,
  entry: TickEntry,
) {
  const plan = store.get("plans", entry.spec),
    spec = plan?.spec;
  if (!spec) return;
  const found = workingTasks(dir, spec);
  if (!found || found.file !== taskFile(plan?.files)) return;
  const { text, ticked } = tickedText(
    spec,
    found.raw,
    idsOf(plan, entry),
    found.file,
    { flat: found.flat },
  );
  if (!ticked.length) return;
  await writeTick(dir, found.relative, text);
  await tickParents(dir, spec);
}

// A spec that lives in a plans repository other than the code repository:
// its tick is its own commit there, after the code landed. Does nothing for a spec the code
// repository holds, whose landing commit carried the tick. The tick goes on
// the workspace's specs branch (specs-branch.mjs). Returns `{done: true}`
// once the tick is known to be on its done branch (in the candidate, newly
// committed, or already there), else null: a read or push failed.
export async function tickPlansRepo(
  store: Store,
  {
    entry,
    candidate,
    repository,
    workspaceRoot,
    env,
  }: {
    entry: TickEntry;
    candidate: string;
    repository: Repository;
    workspaceRoot?: string | null;
    env?: NodeJS.ProcessEnv;
  },
) {
  const plan = store.get<TickPlan>("plans", entry.spec),
    spec = plan?.spec;
  if (!plan || !spec) return null;
  if (await inCandidate(repository, candidate, spec, plan.files))
    return { done: true };
  const roots = [
    store.getMeta<{ root?: string }>("workspaceRepository")?.root,
    ...store
      .list<Repository>("repositories")
      .filter((p) => p.planning && p.root)
      .map((p) => p.root),
    workspaceRoot,
  ].filter(
    (root, i, all): root is string =>
      Boolean(root) && root !== repository.root && all.indexOf(root) === i,
  );
  for (const root of roots) {
    const branch = specsBranch(store, workspaceRoot, root);
    const out = await tickBranch(root, {
      branch,
      files: [
        {
          spec,
          ids: idsOf(plan, entry),
          file: taskFile(plan.files),
        },
      ],
      env,
      // shortcut: the code repository's prefix, since the plans repository
      // has no setting of its own; add one when the two differ.
      commitPrefix:
        typeof repository.commitPrefix === "string"
          ? repository.commitPrefix
          : undefined,
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
async function inDetached<T>(
  root: string,
  commit: string,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avoozl-tick-"));
  try {
    await git(root, ["worktree", "add", "--detach", "--quiet", dir, commit]);
    return await fn(dir);
  } finally {
    await git(root, ["worktree", "remove", "--force", dir]).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The head a `pr` landing pushes: `commit` with the entry's
// tasks ticked in a commit of its own on top, so the pull request's checks
// run on the tick. `commit` itself when its tasks.md is not in this
// repository or the boxes are already ticked.
export function tickedHead(
  store: Store,
  root: string,
  entry: TickEntry,
  commit: string,
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
        commitSubject(commitPrefix, `Tick ${taskIds(entry).join(", ")}`),
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
  root: string,
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
  root: string,
  {
    branch,
    files,
    remote = "origin",
    tries = 5,
    env,
    commitPrefix = "",
  }: {
    branch: string;
    files: { spec: string; ids: string[]; file?: string; groups?: boolean }[];
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
      const ticked: string[] = [];
      let found = 0;
      for (const { spec, ids, file: name = TASKS_FILE, groups } of files) {
        const current = workingTasks(dir, spec);
        if (!current || current.file !== name) continue;
        found += 1;
        const tick = tickedText(spec, current.raw, ids, name, {
          groups,
          flat: current.flat,
        });
        if (!tick.ticked.length) continue;
        await writeTick(dir, current.relative, tick.text);
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
export async function baseHead(
  root: string,
  branch: string,
  { fetched }: { fetched?: Set<string> } = {},
) {
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
export async function baseTasks(
  root: string,
  branch: string,
  name: string,
  {
    fetched,
    files,
  }: { fetched?: Set<string>; files?: Record<string, string> } = {},
) {
  try {
    const { head, ref } = await baseHead(root, branch, { fetched }),
      file = taskFile(files),
      relative = await tasksPathAt(root, head, name, file);
    if (!relative) return null;
    // Not `git()`: its trim would shift the line numbers.
    const { stdout } = await exec("git", ["show", `${head}:${relative}`], {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      head,
      ref,
      file,
      text: taskText(file, stdout, relative === flatSpecPath(root, name)),
    };
  } catch {
    return null;
  }
}

// The commit that last changed each line of the task file on `ref`, by line
// number: for a ticked item, the commit on the base branch that ticked it.
// First parent only, so a merge (Avoozl's landing, a merged pull request)
// owns what it brought, as a squash or a direct push does. One `git blame`.
export async function tickCommits(
  root: string,
  ref: string,
  name: string,
  files?: Record<string, string>,
) {
  try {
    const relative = await tasksPathAt(root, ref, name, taskFile(files));
    if (!relative) return null;
    const { stdout } = await exec(
        "git",
        ["blame", "--first-parent", "--porcelain", ref, "--", relative],
        { cwd: root, maxBuffer: 32 * 1024 * 1024 },
      ),
      times = new Map<string, number>(),
      lines = new Map<number, string>();
    let current: string | null = null;
    for (const row of stdout.split("\n")) {
      const head = /^([0-9a-f]{40}) \d+ (\d+)/.exec(row);
      if (head) {
        current = head[1];
        lines.set(Number(head[2]), current);
      } else if (row.startsWith("committer-time ") && current)
        times.set(current, Number(row.slice(15)));
    }
    return new Map(
      [...lines].map(([line, commit]) => {
        const time = times.get(commit);
        return [
          line,
          {
            commit,
            at: time === undefined ? null : new Date(time * 1000).toISOString(),
          },
        ];
      }),
    );
  } catch {
    return null;
  }
}

// A task the tick marks done. A validation-gated task is left alone: only
// checks Avoozl recorded accept it (Requirement 38.4), and no mark can.
function complete(
  task: Task,
  {
    key,
    line,
    branch,
    file,
    found,
  }: { key: string; line: number; branch: string; file: string; found: TickAt },
) {
  const at = found.at ?? new Date().toISOString(),
    commit = found.commit;
  task.status = "accepted";
  task.acceptanceEvidence = {
    at,
    evidence: `${file} line ${line} marks ${key} [x] on ${branch}${commit ? ` at commit ${short(commit)}` : ""}`,
    baseline: { file, line, mark: "[x]", branch, commit },
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
export async function applyTicks(
  store: Store,
  plan: TickPlan,
  read: {
    branch: string;
    text: string;
    head: string;
    file?: string;
    land?: boolean;
    commits?: () => Promise<Map<number, TickAt> | null>;
  },
) {
  if (!plan.spec) return { done: [], released: [] };
  const file = read.file ?? TASKS_FILE,
    { ticked, present } = ticksOf(plan.spec, read.text),
    seenKey = `spec-ticks:${plan.id}`,
    before = store.getMeta<string[]>(seenKey),
    data = store.read(),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    // The task a tasks.md ID maps to.
    taskOf = (tasks: Map<string, Task>, id: string) => {
      const taskId = plan.mapping?.[id];
      return typeof taskId === "string" ? tasks.get(taskId) : undefined;
    },
    // A person's `Built:` line, read when there is one; Avoozl writes none.
    built = checkedItems(plan.spec, read.text),
    now: { task: Task; commit: string | null }[] = [];
  // The commit for each tick that will complete a task, and each ticked
  // task's tick commit, read before the write so git stays outside the
  // transaction.
  const found = new Map<string, TickAt>(),
    ticks = new Map<string, string | null>(),
    open = (task: Task) =>
      !statusComplete(data, task.status) &&
      // Avoozl's own landing carried this tick: already known, so no second
      // Activity line and no worker released (Requirement 113.11).
      !task.integration?.commit;
  let commits: Map<number, TickAt> | undefined;
  for (const [id, tick] of ticked) {
    const task = taskOf(byId, id);
    if (!task || (task.tickCommit && !open(task))) continue;
    commits ??= (await read.commits?.()) ?? new Map();
    const at = commits.get(tick.line);
    if (at) ticks.set(id, at.commit);
    if (open(task)) found.set(id, at ?? { commit: read.head });
  }
  store.mutate(`Ticks on ${read.branch} for ${plan.spec}`, (next) => {
    const tasks = new Map(next.tasks.map((task) => [task.id, task]));
    for (const [id, tick] of ticked) {
      const task = taskOf(tasks, id);
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
          at:
            typeof task.acceptanceEvidence?.at === "string"
              ? task.acceptanceEvidence.at
              : new Date().toISOString(),
        };
      const at = found.get(id);
      if (!at) continue;
      complete(task, {
        key: tick.key,
        line: tick.line,
        branch: read.branch,
        file,
        found: at,
      });
      now.push({ task, commit: at.commit });
    }
    // An item that was ticked and is now open, in a task that is done: not
    // reopened silently; it waits in Needs you (Requirement 113.4).
    for (const id of before ?? []) {
      const task = taskOf(tasks, id);
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
  const released: string[] = [];
  for (const { task, commit } of now) {
    recordActivity(store, {
      source: "tick",
      kind: "task.ticked",
      summary: `${task.id} is done: ticked in ${file} on ${read.branch}${commit ? ` at ${short(commit)}` : ""}`,
      targetId: task.id,
      key: `ticked:${task.id}:${commit ?? read.head}`,
    });
    for (const binding of store.list<SessionBinding>("session_bindings"))
      if (
        binding.taskId === task.id &&
        binding.role === "worker" &&
        !FINAL_STATUSES.has(binding.status ?? "")
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
