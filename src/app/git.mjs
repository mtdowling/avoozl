import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fail } from "./store.mjs";
const exec = promisify(execFile);
function liveLocks(store, projectId) {
  const rows = store.db
    .prepare("SELECT * FROM work_locks WHERE project_id=?")
    .all(projectId);
  return rows.filter((row) => {
    try {
      process.kill(row.pid, 0);
      return true;
    } catch (error) {
      if (error.code !== "ESRCH") return true;
      store.db
        .prepare("DELETE FROM work_locks WHERE id=? AND token=?")
        .run(row.id, row.token);
      return false;
    }
  });
}
export function assertProjectAvailable(store, projectId) {
  if (liveLocks(store, projectId).some((row) => row.kind === "integration"))
    fail("This project is integrating. Retry after it finishes.", 409);
}
export async function withWorkLock(store, { id, projectId, kind }, fn) {
  const token = crypto.randomUUID();
  store.transaction(() => {
    if (
      liveLocks(store, projectId).some(
        (row) =>
          row.id === id || row.kind === "integration" || kind === "integration",
      )
    )
      fail(
        "Validation or integration already owns this work. Retry after it finishes.",
        409,
      );
    store.db
      .prepare("INSERT INTO work_locks VALUES (?,?,?,?,?)")
      .run(id, projectId, kind, process.pid, token);
  });
  try {
    return await fn();
  } finally {
    store.db
      .prepare("DELETE FROM work_locks WHERE id=? AND token=?")
      .run(id, token);
  }
}
export async function git(cwd, args) {
  return (
    await exec("git", args, { cwd, maxBuffer: 8 * 1024 * 1024 })
  ).stdout.trim();
}
export async function projectConfig({
  id,
  root,
  baseBranch = "main",
  worktreeRoot,
  checks = [],
}) {
  if (!/^[a-z][a-z0-9-]{1,60}$/.test(id || ""))
    fail("Choose a stable project ID.");
  root = fs.realpathSync(root);
  if (
    (await git(root, [
      "rev-parse",
      "--is-inside-work-tree",
      "--show-prefix",
    ])) !== "true"
  )
    fail("Project root must be the Git checkout root.");
  await git(root, ["rev-parse", "--verify", baseBranch + "^{commit}"]);
  if (
    !Array.isArray(checks) ||
    checks.some(
      (c) =>
        !Array.isArray(c) || !c.length || c.some((v) => typeof v !== "string"),
    )
  )
    fail("Checks must be arrays of command arguments.");
  worktreeRoot = path.resolve(
    worktreeRoot || path.join(path.dirname(root), ".avoozl-worktrees"),
  );
  if (worktreeRoot === root || worktreeRoot.startsWith(root + path.sep))
    fail("Place worktrees outside the project checkout.");
  return {
    id,
    root,
    baseBranch,
    worktreeRoot,
    checks,
    createdAt: new Date().toISOString(),
  };
}
export async function createWorktree(project, runId) {
  fs.mkdirSync(project.worktreeRoot, { recursive: true });
  const branch = "plans/" + runId,
    worktree = path.join(project.worktreeRoot, runId);
  if (fs.existsSync(worktree)) fail("Run worktree already exists.", 409);
  const helper = path.join(project.root, "scripts/worktree");
  if (fs.existsSync(helper))
    await exec(helper, [branch, worktree, project.baseBranch], {
      cwd: project.root,
      maxBuffer: 8 * 1024 * 1024,
    });
  else
    await git(project.root, [
      "worktree",
      "add",
      "-b",
      branch,
      worktree,
      project.baseBranch,
    ]);
  return {
    branch,
    worktree,
    baseCommit: await git(worktree, ["rev-parse", "HEAD"]),
  };
}
export async function commandEvidence(
  cwd,
  argv,
  { timeoutMs = 120000, onStart } = {},
) {
  if (
    !Array.isArray(argv) ||
    !argv.length ||
    argv.some((x) => typeof x !== "string")
  )
    fail("Use a command argument array.");
  const startedAt = new Date().toISOString();
  onStart?.();
  try {
    const { stdout, stderr } = await exec(argv[0], argv.slice(1), {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      argv,
      startedAt,
      endedAt: new Date().toISOString(),
      exitCode: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      argv,
      startedAt,
      endedAt: new Date().toISOString(),
      exitCode: Number.isInteger(error.code) ? error.code : null,
      signal: error.signal || null,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
    };
  }
}
// The changes a run has made in its own worktree, bounded so a large branch
// cannot produce an unbounded response. Read-only: it never checks out,
// rebases, or stages anything.
export async function runChanges(store, { id, path: file, limit = 400 }) {
  const run = store.get("runs", id);
  if (!run) fail("Run not found.", 404);
  if (!run.worktree || run.readOnly)
    fail("This conversation has no worktree of its own.", 409);
  if (!fs.existsSync(run.worktree))
    fail("This conversation's worktree has been removed.", 409);
  const base = run.baseCommit || run.branch + "^";
  const head = await git(run.worktree, ["rev-parse", "HEAD"]);
  if (file) {
    // One file's previous contents, so a client can show a real diff against
    // the revision the run started from.
    if (file.includes("..") || path.isAbsolute(file))
      fail("Use a repository-relative path.");
    let before = "";
    try {
      before = await git(run.worktree, ["show", base + ":" + file]);
    } catch {
      before = "";
    }
    return { id, path: file, base, head, before };
  }
  const committed = await git(run.worktree, [
    "diff",
    "--numstat",
    "--find-renames",
    base,
    "HEAD",
  ]);
  const uncommitted = await git(run.worktree, ["status", "--porcelain"]);
  const files = committed
    .split("\n")
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => {
      const [additions, deletions, name] = line.split("\t");
      return {
        path: name,
        additions: additions === "-" ? null : Number(additions),
        deletions: deletions === "-" ? null : Number(deletions),
        state: "committed",
      };
    });
  const pending = uncommitted
    .split("\n")
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => ({
      path: line.slice(3).trim(),
      status: line.slice(0, 2).trim(),
      state: "uncommitted",
    }));
  return {
    id,
    branch: run.branch,
    worktree: run.worktree,
    base,
    head,
    files,
    uncommitted: pending,
    truncated:
      committed.split("\n").filter(Boolean).length > limit ||
      uncommitted.split("\n").filter(Boolean).length > limit,
  };
}
export async function validateRun(store, runId) {
  const run = store.get("runs", runId);
  if (!run) fail("Run not found.", 404);
  return withWorkLock(
    store,
    { id: "validation:" + runId, projectId: run.projectId, kind: "validation" },
    () => validateUnlocked(store, runId),
  );
}
async function validateUnlocked(store, runId) {
  const run = store.get("runs", runId);
  if (!run?.worktree) fail("Run has no worktree.");
  if (
    ["running", "starting", "waiting-approval", "waiting-input"].includes(
      run.state,
    )
  )
    fail("Finish or interrupt the agent before validation.", 409);
  const project = store.get("projects", run.projectId);
  if (!project) fail("Project configuration is missing.");
  const head = await git(run.worktree, ["rev-parse", "HEAD"]),
    dirty = await git(run.worktree, ["status", "--porcelain"]);
  if (dirty)
    fail(
      "Commit the worktree changes before recording acceptance checks.",
      409,
    );
  if (!project.checks.length)
    fail("Configure the project acceptance commands before validation.");
  const results = [];
  for (const argv of project.checks) {
    store.event(runId, "validation.started", { argv });
    const record = await commandEvidence(run.worktree, argv);
    const evidence = {
      ...record,
      id: crypto.randomUUID(),
      taskId: run.taskId,
      runId,
      kind: "command",
      commit: head,
    };
    store.put("evidence", evidence);
    store.event(runId, "validation.result", { evidence });
    results.push(evidence);
    if (record.exitCode !== 0) break;
  }
  const unchanged =
    head === (await git(run.worktree, ["rev-parse", "HEAD"])) &&
    !(await git(run.worktree, ["status", "--porcelain"]));
  const passed =
    unchanged &&
    results.length === project.checks.length &&
    results.every((r) => r.exitCode === 0);
  store.mutate("Record validation for " + run.taskId, (data) => {
    const task = data.tasks.find((t) => t.id === run.taskId);
    if (task) {
      task.evidence = [
        ...new Set([
          ...(task.evidence || []),
          ...results.map((r) => "workspace:evidence/" + r.id),
        ]),
      ];
      if (passed) {
        task.status = "implemented";
        task.needsReview = false;
      }
      task.updatedAt = new Date().toISOString();
    }
  });
  if (passed) {
    const entry = {
      id: runId,
      runId,
      taskId: run.taskId,
      projectId: project.id,
      branch: run.branch,
      worktree: run.worktree,
      commit: head,
      baseCommit: run.baseCommit,
      state: "ready",
      evidenceIds: results.map((r) => r.id),
      createdAt: new Date().toISOString(),
    };
    store.put("integration", entry);
    store.event(runId, "integration.ready", { entry });
  }
  return { passed, unchanged, commit: head, results };
}
export async function integrateRun(store, { id, expectedCommit }) {
  const entry = store.get("integration", id);
  if (!entry) fail("Integration not found.", 404);
  return withWorkLock(
    store,
    {
      id: "integration:" + entry.projectId,
      projectId: entry.projectId,
      kind: "integration",
    },
    () => integrateUnlocked(store, { id, expectedCommit }),
  );
}
async function integrateUnlocked(store, { id, expectedCommit }) {
  const entry = store.get("integration", id);
  if (!entry || entry.state !== "ready") fail("Integration is not ready.", 409);
  const project = store.get("projects", entry.projectId);
  if (entry.commit !== expectedCommit)
    fail("Review the current integration head.", 409);
  if (
    (await git(project.root, ["branch", "--show-current"])) !==
    project.baseBranch
  )
    fail("The originating checkout is not on its configured base branch.", 409);
  if (await git(project.root, ["status", "--porcelain"]))
    fail(
      "The originating checkout has changes; integration is left queued.",
      409,
    );
  if (await git(entry.worktree, ["status", "--porcelain"]))
    fail("Run worktree has uncommitted changes.", 409);
  if ((await git(entry.worktree, ["rev-parse", "HEAD"])) !== expectedCommit)
    fail("Run branch changed after validation.", 409);
  if (
    store
      .list("runs")
      .some(
        (r) =>
          r.projectId === project.id &&
          ["running", "starting", "waiting-approval", "waiting-input"].includes(
            r.state,
          ),
      )
  )
    fail("Finish active project runs before integrating.", 409);
  store.event(id, "integration.started", { commit: entry.commit });
  await git(entry.worktree, ["rebase", project.baseBranch]);
  const revalidated = await validateUnlocked(store, id);
  if (!revalidated.passed)
    fail("Rebased work did not pass acceptance checks.", 409);
  const head = await git(entry.worktree, ["rev-parse", "HEAD"]);
  await git(project.root, ["merge", "--ff-only", entry.branch]);
  entry.state = "integrated";
  entry.integratedCommit = head;
  entry.integratedAt = new Date().toISOString();
  store.put("integration", entry);
  store.mutate("Integrate " + entry.taskId, (data) => {
    const task = data.tasks.find((t) => t.id === entry.taskId);
    if (task)
      task.integration = {
        commit: head,
        branch: entry.branch,
        at: entry.integratedAt,
      };
  });
  store.event(id, "integration.completed", { entry });
  // Remove only the exact worktree created for this run, after its branch landed.
  if (
    path.dirname(entry.worktree) === project.worktreeRoot &&
    path.basename(entry.worktree) === id
  )
    await git(project.root, ["worktree", "remove", entry.worktree]);
  return entry;
}
