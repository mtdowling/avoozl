// Test helper: a workspace with one git checkout registered as repository
// `app`, its tasks, and a worker attempt that commits and reports done.
// Shared by the check-run and verify/integrate tests.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import type { Edge, Task } from "../../types.ts";
import { Operations } from "../api/operations.ts";
import { Store } from "../store/store.ts";
import { snapshot } from "./fixtures.ts";
import { temporaryDirectory } from "./temporary.ts";
import { storedRow } from "./view-shapes.ts";

export function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export const leaf = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: "Task " + id,
  kind: "leaf",
  scope: "catalog",
  status: "planned",
  epic: "sample",
  track: "catalog",
  tags: [],
  acceptance: ["Works."],
  repository: "app",
  ...extra,
});

// A clone of `origin` at `dir` that can commit.
export function cloneOf(origin: string, dir: string) {
  git(path.dirname(dir), "clone", "-q", origin, dir);
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  return dir;
}

// A bare `origin.git` under `root` whose main has one commit (README.md),
// and its clone `app`. Returns their paths, the checkout's real path.
export function originCheckout(root: string) {
  const origin = path.join(root, "origin.git");
  git(root, "init", "--bare", "-b", "main", origin);
  const checkout = cloneOf(origin, path.join(root, "app"));
  fs.writeFileSync(path.join(checkout, "README.md"), "app\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-qm", "Start");
  git(checkout, "push", "-q", "origin", "main");
  return { origin, checkout: fs.realpathSync.native(checkout) };
}

// A git checkout at `dir` on main with one commit: README.md and any
// `files` (path -> text). Returns its real path.
export function gitCheckout(dir: string, files: Files = {}) {
  for (const [file, text] of Object.entries({
    "README.md": "app\n",
    ...files,
  })) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "Start");
  return fs.realpathSync.native(dir);
}

// Files by path, and their text.
type Files = Record<string, string>;
// What deliveryWorkspace is given.
interface DeliveryOptions {
  prefix?: string;
  tasks?: Task[];
  edges?: Edge[];
  repository?: Record<string, unknown>;
  files?: Files | ((root: string) => Files);
  config?: Record<string, unknown>;
  operations?: OperationOptions | ((root: string) => OperationOptions);
}
type OperationOptions = Partial<ConstructorParameters<typeof Operations>[1]>;

// `repository` is merged over a repository whose one check is `git status`;
// `files` (or a function of the workspace root giving them) go in the
// first commit; `config` is the workspace's .avoozl.json.
export function deliveryWorkspace(
  t: TestContext,
  {
    prefix = "avoozl-delivery-",
    tasks = [leaf("a")],
    edges = [],
    repository = {},
    files = {},
    // No review role: these tests judge the checks; review has its own tests.
    config = {
      version: 1,
      lanes: { local: 4 },
      delivery: { retries: 1, reviewers: [] },
    },
    // More Operations options (a plugin settings file, for one), or a
    // function of the workspace root giving them.
    operations = {},
  }: DeliveryOptions,
) {
  const root = temporaryDirectory(prefix),
    checkout = gitCheckout(
      path.join(root, "app"),
      typeof files === "function" ? files(root) : files,
    );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.initialize({ ...snapshot(), tasks, edges });
  store.put("repositories", {
    id: "app",
    root: checkout,
    baseBranch: "main",
    checks: [["git", "status"]],
    ...repository,
  });
  fs.writeFileSync(path.join(root, ".avoozl.json"), JSON.stringify(config));
  return {
    root,
    checkout,
    store,
    ops: new Operations(store, {
      workspaceRoot: root,
      ...(typeof operations === "function" ? operations(root) : operations),
    }),
  };
}

export const as = (slot: string) => ({
  caller: { sessionKey: "dashboard:" + slot },
});

export async function bind(
  ops: Operations,
  taskId: string,
  slot: string,
  role: string,
  attempt: number,
) {
  await ops.execute("session.bind", {
    taskId,
    slot,
    role,
    attempt,
    source: "tick",
    title: `avoozl:${taskId} ${role}`,
  });
}

// Each task's worktree, prepared, with a session `slot-<id>` bound to it
// for attempt 1, as the tick binds one. Answers each worktree path by task.
export async function boundWorktrees(ops: Operations, ids: string[]) {
  const paths: Record<string, string> = {};
  for (const id of ids) {
    paths[id] = (
      await ops.execute<{ path: string }>("worktree.prepare", { taskId: id })
    ).path;
    await ops.execute("session.bind", {
      taskId: id,
      slot: `slot-${id}`,
      attempt: 1,
      source: "tick",
      title: `avoozl:${id} Task ${id}`,
    });
  }
  return paths;
}

// A worker attempt that commits `files` (path -> text) in the task's
// worktree and reports done. Returns the commit.
export async function workerDone(
  ops: Operations,
  taskId: string,
  slot: string,
  attempt = 1,
  files: Files = { [`${taskId}-${attempt}.txt`]: "work\n" },
) {
  await bind(ops, taskId, slot, "worker", attempt);
  const { path: worktree } = await ops.execute<{ path: string }>(
    "worktree.prepare",
    {
      taskId,
    },
  );
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true });
    fs.writeFileSync(path.join(worktree, file), text);
  }
  git(worktree, "add", ".");
  git(worktree, "commit", "-m", `Work ${taskId} ${attempt}`);
  const commit = git(worktree, "rev-parse", "HEAD");
  await ops.execute(
    "session.report",
    { taskId, kind: "done", commit },
    undefined,
    as(slot),
  );
  return commit;
}

// Back-date a binding so it reads as quiet; only the test changes the clock.
export function age(store: Store, slot: string, minutes: number) {
  const binding = storedRow(store, "session_bindings", slot),
    at = new Date(Date.now() - minutes * 60_000).toISOString();
  store.put("session_bindings", { ...binding, boundAt: at, statusAt: at });
}
