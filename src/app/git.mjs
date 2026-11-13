import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { fail } from "./store.mjs";
const exec = promisify(execFile);
const DIFF_TEXT_LIMIT = 2 * 1024 * 1024;
export const WORKING_STATES = [
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
];
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
    ) {
      // Contention is transient: the work is valid, the lock is simply held.
      // Callers that run unattended may retry instead of reporting failure.
      const error = Error(
        "Validation or integration already owns this work. Retry after it finishes.",
      );
      error.status = 409;
      error.contention = true;
      throw error;
    }
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
export async function git(cwd, args, { env } = {}) {
  return (
    await exec("git", args, { cwd, maxBuffer: 8 * 1024 * 1024, ...(env ? { env } : {}) })
  ).stdout.trim();
}
async function gitFile(cwd, args) {
  return (
    await exec("git", args, {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
      encoding: "buffer",
    })
  ).stdout;
}
export function githubRepositoryFromRemote(value) {
  const match = String(value || "")
    .trim()
    .match(
      /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?$/,
    );
  return match ? `${match[1]}/${match[2]}` : null;
}
// The GitHub repository a checkout's origin names, or null. Synchronous for
// callers that resolve paths without awaiting.
export function originRepositorySync(root) {
  try {
    return githubRepositoryFromRemote(
      execFileSync("git", ["remote", "get-url", "origin"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return null;
  }
}
export async function projectGitHubRepository(store, input = {}) {
  const project = store.get("projects", input.projectId);
  if (!project) fail("Choose a configured execution project.");
  const remote = input.remote || "origin";
  let remoteUrl;
  try {
    remoteUrl = await git(project.root, ["remote", "get-url", remote]);
  } catch {
    fail(`Project ${project.id} has no ${remote} Git remote.`);
  }
  const repository = githubRepositoryFromRemote(remoteUrl);
  if (!repository)
    fail(
      `Project ${project.id}'s ${remote} remote is not a GitHub repository.`,
    );
  return {
    projectId: project.id,
    projectRoot: project.root,
    remote,
    remoteUrl,
    repository,
  };
}
async function remoteRepository(root, remote = "origin") {
  try {
    return githubRepositoryFromRemote(
      await git(root, ["remote", "get-url", remote]),
    );
  } catch {
    return null;
  }
}
async function effectiveGitIdentity(root) {
  try {
    const [name, email] = await Promise.all([
      git(root, ["config", "--get", "user.name"]),
      git(root, ["config", "--get", "user.email"]),
    ]);
    return name && email ? { name, email } : null;
  } catch {
    return null;
  }
}
async function configureWorktreeIdentity(root, worktree) {
  const identity = await effectiveGitIdentity(root);
  if (!identity) return;
  // OpenHands may isolate its process-level Git configuration. Preserve the
  // repository's effective identity in this run only instead of copying it
  // into Avoozl state or changing the user's other checkouts.
  await git(root, ["config", "extensions.worktreeConfig", "true"]);
  await git(worktree, ["config", "--worktree", "user.name", identity.name]);
  await git(worktree, ["config", "--worktree", "user.email", identity.email]);
}
export async function projectConfig({
  id,
  root,
  baseBranch = "main",
  integrationBranch,
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
  if (integrationBranch !== undefined) {
    if (
      typeof integrationBranch !== "string" ||
      integrationBranch === baseBranch
    )
      fail("Name an integration branch other than the base branch.");
    try {
      await git(root, ["check-ref-format", "--branch", integrationBranch]);
    } catch {
      fail("Name a valid integration branch.");
    }
  }
  return {
    id,
    root,
    baseBranch,
    ...(integrationBranch === undefined ? {} : { integrationBranch }),
    worktreeRoot,
    checks,
    repository: await remoteRepository(root),
    createdAt: new Date().toISOString(),
  };
}
// `git worktree add` writes refs and administrative files in project.root, the
// same checkout integration fast-forwards. Hold a lock that excludes
// integration, and that integration excludes, for the duration of the add.
// Worktree adds for different runs still proceed concurrently.
export async function createWorktree(store, project, runId) {
  return withWorkLock(
    store,
    { id: "worktree:" + runId, projectId: project.id, kind: "worktree" },
    async () => {
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
      await configureWorktreeIdentity(project.root, worktree);
      return {
        branch,
        worktree,
        baseCommit: await git(worktree, ["rev-parse", "HEAD"]),
      };
    },
  );
}
// The worktrees git knows for `root`: path -> branch ref (or null if detached).
async function listWorktrees(root) {
  const entries = new Map();
  let current = null;
  for (const line of (
    await git(root, ["worktree", "list", "--porcelain"])
  ).split("\n")) {
    if (line.startsWith("worktree ")) {
      current = path.resolve(line.slice(9));
      entries.set(current, null);
    } else if (line.startsWith("branch ") && current)
      entries.set(current, line.slice(7));
  }
  return entries;
}

// One task's worktree on its own branch. A retry finds the same worktree, or
// re-adds it on the existing branch so earlier commits are kept. Nothing is
// ever removed or reset here.
export async function prepareTaskWorktree(store, project, { branch, name }) {
  return withWorkLock(
    store,
    { id: "worktree:" + name, projectId: project.id, kind: "worktree" },
    async () => {
      const base = path.resolve(
        project.worktreeRoot ||
          path.join(path.dirname(project.root), ".avoozl-worktrees"),
      );
      fs.mkdirSync(base, { recursive: true });
      // git prints real paths, so a linked temporary directory must compare equal.
      const worktree = path.join(fs.realpathSync(base), name),
        ref = "refs/heads/" + branch;
      const listed = await listWorktrees(project.root),
        holder = [...listed].find(([, value]) => value === ref)?.[0];
      let created = false;
      if (listed.has(worktree)) {
        if (listed.get(worktree) !== ref)
          fail(`Worktree ${worktree} is not on branch ${branch}.`, 409);
        if (!fs.existsSync(worktree))
          fail(
            `Worktree ${worktree} is registered but missing. Run git worktree prune in ${project.root}.`,
            409,
          );
      } else if (holder)
        fail(`Branch ${branch} is checked out at ${holder}.`, 409);
      else if (fs.existsSync(worktree))
        fail(`${worktree} exists and is not this task's worktree.`, 409);
      else {
        let exists = true;
        try {
          await git(project.root, ["rev-parse", "--verify", "--quiet", ref]);
        } catch {
          exists = false;
        }
        // A dependent starts from the work already integrated: the integration
        // branch when the project has one and it exists, else the base branch.
        let start = project.baseBranch || "main";
        if (project.integrationBranch)
          try {
            await git(project.root, [
              "rev-parse",
              "--verify",
              "--quiet",
              "refs/heads/" + project.integrationBranch,
            ]);
            start = project.integrationBranch;
          } catch {
            // Not created yet: the first integration creates it from the base.
          }
        await git(
          project.root,
          exists
            ? ["worktree", "add", worktree, branch]
            : ["worktree", "add", "-b", branch, worktree, start],
        );
        await configureWorktreeIdentity(project.root, worktree);
        created = true;
      }
      return {
        branch,
        worktree,
        created,
        head: await git(worktree, ["rev-parse", "HEAD"]),
      };
    },
  );
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
function diffText(contents) {
  if (contents.length > DIFF_TEXT_LIMIT)
    return { text: "", truncated: true, binary: false };
  if (contents.includes(0)) return { text: "", truncated: false, binary: true };
  return { text: contents.toString("utf8"), truncated: false, binary: false };
}
function worktreeFile(worktree, file) {
  const root = fs.realpathSync(worktree),
    candidate = path.resolve(root, file);
  if (candidate !== root && !candidate.startsWith(root + path.sep))
    fail("Use a repository-relative path.");
  if (!fs.existsSync(candidate)) return Buffer.alloc(0);
  const full = fs.realpathSync(candidate);
  if (!full.startsWith(root + path.sep) || !fs.statSync(full).isFile())
    fail("Use a repository-relative path.");
  return fs.readFileSync(full);
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
    let previous = Buffer.alloc(0);
    try {
      previous = await gitFile(run.worktree, ["show", base + ":" + file]);
    } catch {
      previous = Buffer.alloc(0);
    }
    const before = diffText(previous),
      after = diffText(worktreeFile(run.worktree, file));
    return {
      id,
      path: file,
      base,
      head,
      before: before.text,
      after: after.text,
      binary: before.binary || after.binary,
      truncated: before.truncated || after.truncated,
    };
  }
  const committed = await git(run.worktree, [
    "diff",
    "--numstat",
    "--find-renames",
    base,
    "HEAD",
  ]);
  const uncommitted = (
    await gitFile(run.worktree, ["status", "--porcelain"])
  ).toString("utf8");
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
// `source` stands in for the run when the work is not a run: a Kiro Crew
// delivery's integration entry (delivery.mjs).
async function validateUnlocked(
  store,
  runId,
  { phase = "validation", source } = {},
) {
  const run = source || store.get("runs", runId);
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
    store.event(runId, "validation.started", { argv, phase });
    const record = await commandEvidence(run.worktree, argv);
    // Each record names the commit and the phase it ran in, so the checks that
    // ran on the rebased base are distinguishable from the earlier ones rather
    // than reading as duplicates of the same work.
    const evidence = {
      ...record,
      id: crypto.randomUUID(),
      taskId: run.taskId,
      runId,
      kind: "command",
      phase,
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
// Refuse when the worktree holding the integration branch has changes a
// fast-forward could touch: any staged or unstaged change, or an untracked
// file at a path the incoming commits write. The message names the worktree
// and the files, and becomes the delivery's decision (delivery.mjs).
async function refuseBusyHolder(holder, target, { from, to } = {}) {
  const names = async (args) =>
      (await git(holder, args)).split("\n").filter(Boolean),
    changed = [
      ...new Set([
        ...(await names(["diff", "--name-only"])),
        ...(await names(["diff", "--cached", "--name-only"])),
      ]),
    ],
    written = to
      ? new Set(await names(["diff", "--name-only", from, to]))
      : null,
    untracked = (
      await names(["ls-files", "--others", "--exclude-standard"])
    ).filter((file) => !written || written.has(file)),
    shown = (files) =>
      files.slice(0, 5).join(", ") +
      (files.length > 5 ? ` and ${files.length - 5} more` : "");
  if (changed.length)
    fail(
      `Integration branch ${target} is checked out at ${holder}, which has uncommitted changes (${shown(changed)}); integration is left queued. Commit or clear them there, then retry.`,
      409,
    );
  if (written && untracked.length)
    fail(
      `Integration branch ${target} is checked out at ${holder}, which has untracked files the fast-forward would overwrite (${shown(untracked)}); integration is left queued. Move them there, then retry.`,
      409,
    );
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
  // An integration branch keeps the user's checkout untouched: the work lands
  // by moving that branch's ref. When a worktree has the branch checked out,
  // the work lands there with merge --ff-only, and only while that worktree
  // has nothing the fast-forward could touch; it is never stashed or reset.
  const target = project.integrationBranch || project.baseBranch,
    separate = Boolean(project.integrationBranch);
  let holder = null;
  if (separate) {
    const ref = "refs/heads/" + target;
    holder =
      [...(await listWorktrees(project.root))].find(
        ([, branch]) => branch === ref,
      )?.[0] || null;
    if (holder) await refuseBusyHolder(holder, target);
    try {
      await git(project.root, ["rev-parse", "--verify", "--quiet", ref]);
    } catch {
      await git(project.root, ["branch", target, project.baseBranch]);
    }
  } else {
    if (
      (await git(project.root, ["branch", "--show-current"])) !==
      project.baseBranch
    )
      fail(
        "The originating checkout is not on its configured base branch.",
        409,
      );
    // Untracked files do not block: Kiro Crew writes `.kiro/settings` into a
    // session's project directory, and `merge --ff-only` still refuses to
    // overwrite an untracked file.
    if (
      await git(project.root, ["status", "--porcelain", "--untracked-files=no"])
    )
      fail(
        "The originating checkout has changes; integration is left queued.",
        409,
      );
  }
  if (await git(entry.worktree, ["status", "--porcelain"]))
    fail("Run worktree has uncommitted changes.", 409);
  if ((await git(entry.worktree, ["rev-parse", "HEAD"])) !== expectedCommit)
    fail("Run branch changed after validation.", 409);
  store.event(id, "integration.started", { commit: entry.commit });
  // Other runs on this project may be working while this merge proceeds. What
  // makes that safe is here: the work is rebased onto the branch it is about to
  // land on and revalidated at that exact base, and a failure refuses the
  // merge. `entry.state === "ready"` records an older validation against an
  // older base; never skip this step by trusting it.
  const before = await git(project.root, ["rev-parse", target]);
  await git(entry.worktree, ["rebase", target]);
  const revalidated = await validateUnlocked(store, id, {
    phase: "integration",
    source: entry.runId ? undefined : { ...entry, state: "integrating" },
  });
  if (!revalidated.passed)
    fail("Rebased work did not pass acceptance checks.", 409);
  const head = await git(entry.worktree, ["rev-parse", "HEAD"]);
  if (holder) {
    // Checks ran meanwhile: look again, then fast-forward only from the
    // value read before the rebase.
    if ((await git(holder, ["rev-parse", "HEAD"])) !== before)
      fail(
        `Integration branch ${target} moved in ${holder} during integration; integration is left queued.`,
        409,
      );
    await refuseBusyHolder(holder, target, { from: before, to: head });
    await git(holder, ["merge", "--ff-only", head]);
  } else if (separate)
    // Fast-forward only, and only from the value read before the rebase.
    await git(project.root, [
      "update-ref",
      "refs/heads/" + target,
      head,
      before,
    ]);
  else await git(project.root, ["merge", "--ff-only", entry.branch]);
  entry.state = "integrated";
  entry.integratedCommit = head;
  entry.into = target;
  entry.integratedAt = new Date().toISOString();
  entry.revalidatedEvidenceIds = revalidated.results.map((r) => r.id);
  store.put("integration", entry);
  store.mutate("Integrate " + entry.taskId, (data) => {
    const task = data.tasks.find((t) => t.id === entry.taskId);
    if (task)
      task.integration = {
        commit: head,
        branch: entry.branch,
        into: target,
        at: entry.integratedAt,
      };
  });
  store.event(id, "integration.completed", { entry });
  // The base moved: worktrees of runs still working are now behind it. A
  // steering signal for those runs and the UI, not a correctness step.
  store.event(null, "project.base.moved", {
    projectId: project.id,
    baseBranch: target,
    commit: head,
    behind: store
      .list("runs")
      .filter(
        (r) =>
          r.projectId === project.id &&
          r.id !== entry.runId &&
          !r.readOnly &&
          ["running", "starting", "waiting-approval", "waiting-input"].includes(
            r.state,
          ),
      )
      .map((r) => r.id),
  });
  // Remove only the exact worktree created for this run, after its branch landed.
  if (
    path.dirname(entry.worktree) === project.worktreeRoot &&
    path.basename(entry.worktree) === id
  )
    await git(project.root, ["worktree", "remove", entry.worktree]);
  return entry;
}

// What adding a checkout would register, read from the folder alone (read
// only): its root, the branch tasks land on (origin's default, else the
// current branch), its GitHub remote, and a suggested ID.
export async function detectCheckout(folder) {
  if (typeof folder !== "string" || !path.isAbsolute(folder.trim()))
    fail("Give the folder as an absolute path.");
  let root;
  try {
    root = fs.realpathSync(folder.trim());
  } catch {
    fail("That folder does not exist.");
  }
  let top;
  try {
    top = await git(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    fail("That folder is not a Git checkout.");
  }
  const quiet = (args) => git(top, args).catch(() => "");
  const originHead = (await quiet(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).replace(/^origin\//, "");
  const current = await quiet(["branch", "--show-current"]);
  const remoteUrl = await quiet(["remote", "get-url", "origin"]);
  const github = remoteUrl ? githubRepositoryFromRemote(remoteUrl) : null;
  const id =
    path
      .basename(top)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^[^a-z]+|-+$/g, "")
      .slice(0, 61) || null;
  return {
    root: top,
    baseBranch: originHead || current || "main",
    currentBranch: current || null,
    remote: remoteUrl ? "origin" : null,
    github,
    id: id && /^[a-z][a-z0-9-]{1,60}$/.test(id) ? id : null,
  };
}
