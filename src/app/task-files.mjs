// What a task's branch changed (task.files) and one file's diff (task.diff),
// for the task drawer's Files fold (design §8.10). Read-only: Git is run with
// fixed arguments, `--` before every path, no shell, literal pathspecs, the
// gateway secrets stripped from its environment, and fsmonitor off. A path
// must be one Git lists for this task, so `..`, absolute paths and links out
// of the worktree never reach a read.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fail } from "./store.mjs";
import { repositoryEnvironment } from "./git.mjs";
import { resolveTaskId } from "../task-identity.mjs";
import { taskRepository } from "../work-model.mjs";

// Output caps. A larger file list is cut and marked; a larger diff is
// summarized by its line counts instead of returned.
export const FILES_LIMIT = 3000;
export const DIFF_BYTES = 256 * 1024;
const LIST_BYTES = 8 * 1024 * 1024;

const STATUS = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "modified",
};

function run(cwd, args, maxBuffer = LIST_BYTES) {
  return new Promise((resolve, reject) =>
    execFile(
      "git",
      [
        "--literal-pathspecs",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.quotePath=false",
        ...args,
      ],
      {
        cwd,
        maxBuffer,
        encoding: "buffer",
        env: repositoryEnvironment(),
        windowsHide: true,
      },
      (error, stdout) => {
        if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
          const over = Error("too large");
          over.tooLarge = true;
          return reject(over);
        }
        if (error) return reject(error);
        resolve(stdout);
      },
    ),
  );
}
const text = async (cwd, args, max) =>
  (await run(cwd, args, max)).toString("utf8");
const fields = (out) =>
  out.split("\0").filter((part, i, all) => part || i < all.length - 1);

// A ref from configuration, resolved to a commit, or null. A name that
// could read as an option is never passed.
async function commit(cwd, ref) {
  if (typeof ref !== "string" || !ref || ref.startsWith("-")) return null;
  try {
    return (
      (
        await text(cwd, [
          "rev-parse",
          "--verify",
          "--quiet",
          "--end-of-options",
          ref + "^{commit}",
        ])
      ).trim() || null
    );
  } catch {
    return null;
  }
}

// A path as Git lists it: relative, forward slashes, no `.` or `..` part, no
// drive letter, NUL, or backslash. Refused before Git is called.
export function checkPath(value) {
  if (typeof value !== "string" || !value || value.length > 4096)
    fail("Name a file: path.");
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    path.isAbsolute(value) ||
    value
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  )
    fail("Use a path inside the task's worktree, relative to its root.", 400);
  return value;
}

// Where the task's changes are: its own worktree when it is still on disk,
// else its branch in the repository's checkout (local or fetched), else
// nowhere locally. `github` links the branch when the repository names one.
async function locate(store, data, taskId) {
  const id = resolveTaskId(data, String(taskId || "").trim());
  const task = data.tasks.find((candidate) => candidate.id === id);
  if (!task) fail("Task not found.", 404);
  const record = store.get("task_worktrees", task.id);
  const project = store.get(
    "projects",
    record?.repository || taskRepository(task) || "",
  );
  const branch = record?.branch || "avoozl/" + task.id;
  const bindings = store
    .list("session_bindings")
    .filter((row) => row.taskId === task.id);
  const crew =
    bindings.sort((a, b) => (a.attempt ?? 0) - (b.attempt ?? 0)).at(-1)?.crew ??
    "local";
  const github = project?.repository
    ? `https://github.com/${project.repository}/tree/${branch.split("/").map(encodeURIComponent).join("/")}`
    : null;
  const where = { task, project, branch, remote: crew !== "local", github };
  let worktree = null;
  if (record?.path && fs.existsSync(record.path))
    try {
      worktree = fs.realpathSync.native(record.path);
    } catch {}
  const cwd =
    worktree ||
    (project?.root && fs.existsSync(project.root) ? project.root : null);
  if (!cwd) return { ...where, mode: "none" };
  const head = worktree
    ? await commit(cwd, "HEAD")
    : (await commit(cwd, "refs/heads/" + branch)) ||
      (await commit(cwd, "refs/remotes/origin/" + branch));
  if (!head) return { ...where, mode: "none" };
  // The base is where the branch left the line it lands on.
  let landing = null;
  for (const ref of [
    project?.integrationBranch,
    project?.baseBranch || "main",
  ]) {
    landing = ref ? await commit(cwd, ref) : null;
    if (landing) break;
  }
  let base = null;
  if (landing)
    try {
      base =
        (
          await text(cwd, ["merge-base", "--end-of-options", landing, head])
        ).trim() || null;
    } catch {}
  return {
    ...where,
    mode: worktree ? "worktree" : "branch",
    cwd,
    worktree,
    head,
    base: base || head,
  };
}

// The changed files, joined from name-status and numstat (both -z, so no
// quoting). In worktree mode the working tree counts, untracked files too.
async function changes(where) {
  const range =
    where.mode === "worktree" ? [where.base] : [where.base, where.head];
  const opts = ["--no-color", "--no-ext-diff", "--no-textconv", "-M", "-z"];
  const names = fields(
    await text(where.cwd, ["diff", "--name-status", ...opts, ...range, "--"]),
  );
  const numbers = fields(
    await text(where.cwd, ["diff", "--numstat", ...opts, ...range, "--"]),
  );
  const counts = new Map();
  for (let i = 0; i < numbers.length; ) {
    const [add, del, name] = numbers[i].split("\t");
    let key = name;
    i += 1;
    // A rename's numstat is "add\tdel\t" then old and new paths.
    if (name === "") {
      key = numbers[i + 1];
      i += 2;
    }
    counts.set(key, {
      additions: add === "-" ? null : Number(add),
      deletions: del === "-" ? null : Number(del),
      binary: add === "-",
    });
  }
  const files = [];
  for (let i = 0; i < names.length; ) {
    const code = names[i][0];
    if (code === "R" || code === "C") {
      files.push({
        path: names[i + 2],
        from: names[i + 1],
        status: STATUS[code],
      });
      i += 3;
    } else {
      files.push({
        path: names[i + 1],
        from: null,
        status: STATUS[code] || "modified",
      });
      i += 2;
    }
  }
  for (const file of files)
    Object.assign(
      file,
      counts.get(file.path) || {
        additions: null,
        deletions: null,
        binary: false,
      },
    );
  if (where.mode === "worktree")
    for (const name of fields(
      await text(where.cwd, [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
      ]),
    ))
      files.push({
        path: name,
        from: null,
        status: "added",
        untracked: true,
        additions: null,
        deletions: null,
        binary: false,
      });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// Every file in the worktree (or branch), for Show all files.
async function tree(where) {
  const out = await text(
    where.cwd,
    where.mode === "worktree"
      ? ["ls-files", "-z", "--"]
      : [
          "ls-tree",
          "-r",
          "-z",
          "--name-only",
          "--end-of-options",
          where.head,
          "--",
        ],
  );
  return fields(out);
}

function summary(where) {
  return {
    taskId: where.task.id,
    mode: where.mode,
    branch: where.branch,
    remote: where.remote,
    github: where.github,
    worktree: where.mode === "worktree" ? where.worktree : null,
    base: where.base ?? null,
    head: where.head ?? null,
  };
}

// task.files: the changed files with counts, or with `all`, every file.
export async function taskFiles(store, data, input = {}) {
  const where = await locate(store, data, input.taskId);
  if (where.mode === "none")
    return {
      ...summary(where),
      files: [],
      totals: { files: 0, additions: 0, deletions: 0 },
      truncated: false,
      all: null,
    };
  let changed;
  try {
    changed = await changes(where);
  } catch (error) {
    if (!error.tooLarge) throw error;
    return {
      ...summary(where),
      files: [],
      totals: null,
      truncated: true,
      all: null,
    };
  }
  const totals = {
    files: changed.length,
    additions: changed.reduce((n, f) => n + (f.additions || 0), 0),
    deletions: changed.reduce((n, f) => n + (f.deletions || 0), 0),
  };
  let all = null;
  if (input.all === true) {
    let listed;
    try {
      listed = await tree(where);
    } catch (error) {
      if (!error.tooLarge) throw error;
      listed = null;
    }
    all = listed && {
      paths: listed.slice(0, FILES_LIMIT),
      truncated: listed.length > FILES_LIMIT,
    };
  }
  return {
    ...summary(where),
    files: changed.slice(0, FILES_LIMIT),
    totals,
    truncated: changed.length > FILES_LIMIT,
    all,
  };
}

// An untracked file's diff, built here: lstat first, so a link is reported,
// never followed, and the real path must stay inside the worktree.
function untrackedDiff(where, file) {
  const full = path.join(where.worktree, ...file.path.split("/"));
  const stat = fs.lstatSync(full, { throwIfNoEntry: false });
  if (!stat) return { kind: "missing" };
  if (stat.isSymbolicLink()) return { kind: "link" };
  const real = fs.realpathSync.native(full);
  if (!real.startsWith(where.worktree + path.sep) || !stat.isFile())
    fail("Use a path inside the task's worktree, relative to its root.", 400);
  if (stat.size > DIFF_BYTES) return { kind: "large", bytes: stat.size };
  const contents = fs.readFileSync(real);
  if (contents.includes(0)) return { kind: "binary" };
  const lines = contents.toString("utf8").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return {
    kind: "text",
    additions: lines.length,
    diff:
      [
        `--- /dev/null`,
        `+++ b/${file.path}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => "+" + line),
      ].join("\n") + "\n",
  };
}

// task.diff: one listed file's unified diff. A path Git does not list for
// this task is refused; a binary or oversized file is summarized.
export async function taskDiff(store, data, input = {}) {
  const wanted = checkPath(input.path);
  const where = await locate(store, data, input.taskId);
  if (where.mode === "none")
    fail("This task has no local worktree or branch to read.", 409);
  const files = await changes(where);
  const file = files.find((f) => f.path === wanted);
  const base = { ...summary(where), path: wanted };
  if (!file) {
    // In the tree but not changed: say so; anywhere else: refused.
    const listed = await tree(where);
    if (listed.includes(wanted))
      return {
        ...base,
        status: "unchanged",
        from: null,
        binary: false,
        tooLarge: false,
        additions: 0,
        deletions: 0,
        diff: "",
      };
    fail("This task did not change that file.", 404);
  }
  const shown = {
    ...base,
    status: file.status,
    from: file.from,
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
    tooLarge: false,
    diff: "",
  };
  if (file.untracked) {
    const made = untrackedDiff(where, file);
    if (made.kind === "text")
      return {
        ...shown,
        additions: made.additions,
        deletions: 0,
        diff: made.diff,
      };
    return {
      ...shown,
      binary: made.kind === "binary",
      tooLarge: made.kind === "large",
      link: made.kind === "link",
      bytes: made.bytes ?? null,
    };
  }
  if (file.binary) return shown;
  const range =
    where.mode === "worktree" ? [where.base] : [where.base, where.head];
  try {
    const diff = await text(
      where.cwd,
      [
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "-M",
        ...range,
        "--",
        ...(file.from ? [file.from] : []),
        file.path,
      ],
      DIFF_BYTES,
    );
    return { ...shown, diff };
  } catch (error) {
    if (!error.tooLarge) throw error;
    return { ...shown, tooLarge: true };
  }
}
