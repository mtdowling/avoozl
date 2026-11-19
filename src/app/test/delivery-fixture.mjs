// Test helper: a workspace with one git checkout registered as repository
// `app`, its tasks, and a worker attempt that commits and reports done.
// Shared by the check-run and verify/integrate tests.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Operations } from "../api/operations.mjs";
import { Store } from "../store/store.mjs";
import { snapshot } from "./fixtures.mjs";
import { temporaryDirectory } from "./temporary.mjs";

export function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export const leaf = (id, extra = {}) => ({
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

// A git checkout at `dir` on main with one commit: README.md and any
// `files` (path -> text). Returns its real path.
export function gitCheckout(dir, files = {}) {
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

// `repository` is merged over a repository whose one check is `git status`;
// `files` (or a function of the workspace root giving them) go in the
// first commit; `config` is the workspace's .avoozl.json.
export function deliveryWorkspace(
  t,
  {
    prefix = "avoozl-delivery-",
    tasks = [leaf("a")],
    edges = [],
    repository = {},
    files = {},
    config = { version: 1, lanes: { local: 4 }, delivery: { retries: 1 } },
  },
) {
  const root = temporaryDirectory(prefix),
    checkout = gitCheckout(
      path.join(root, "app"),
      typeof files === "function" ? files(root) : files,
    );
  const store = new Store(path.join(root, "workspace.sqlite"));
  t.after(() => store.close());
  store.importSnapshot({ ...snapshot(), tasks, edges });
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
    ops: new Operations(store, { workspaceRoot: root }),
  };
}

export const as = (slot) => ({ caller: { sessionKey: "dashboard:" + slot } });

export async function bind(ops, taskId, slot, role, attempt) {
  await ops.execute("session.bind", {
    taskId,
    slot,
    role,
    attempt,
    source: "tick",
    title: `avoozl:${taskId} ${role}`,
  });
}

// A worker attempt that commits in the task's worktree and reports done.
export async function workerDone(ops, taskId, slot, attempt = 1) {
  await bind(ops, taskId, slot, "worker", attempt);
  const { path: worktree } = await ops.execute("worktree.prepare", { taskId });
  fs.writeFileSync(path.join(worktree, `${taskId}-${attempt}.txt`), "work\n");
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
