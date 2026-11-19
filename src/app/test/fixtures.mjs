import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { createWorktree, validateUnlocked, withWorkLock } from "../git.mjs";
export function snapshot() {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    repository: {
      name: "Nupp",
      title: "Fixture",
      integration: {
        revision: "abc",
        mainRevision: "abc",
        acceptedRevision: "abc",
      },
      pollIntervalMs: 10000,
    },
    statuses: [
      { id: "planned", label: "Planned", complete: false },
      { id: "partial", label: "Partly implemented", complete: false },
      { id: "implemented", label: "Implemented", complete: false },
      { id: "accepted", label: "Accepted", complete: true },
      { id: "review", label: "Review", complete: false },
      { id: "blocked", label: "Blocked", complete: false },
      { id: "deferred", label: "Deferred", complete: false },
    ],
    epics: [],
    tracks: [{ id: "catalog", label: "Plans" }],
    tasks: [
      {
        id: "sample-task",
        title: "Implement fixture",
        scope: "catalog",
        status: "planned",
        track: "catalog",
        tags: [],
        acceptance: ["Pass fixture test."],
      },
    ],
    edges: [],
    documents: {},
    changelog: [],
    unknownExtension: { preserve: true },
  };
}
export function fixture(t) {
  const root = temporaryDirectory(),
    store = new Store(path.join(root, "workspace.sqlite"));
  store.initialize(snapshot());
  t.after(() => {
    try {
      store.close();
    } catch {}
  });
  return { root, store };
}
// Workspace shapes for tests that must behave the same whether tasks live only
// in SQLite, mirror cached GitHub issues, or mix both. Every value is fake: the
// repository is example/fixture and no network client is involved.
export const workspaceShapes = ["local", "github", "mixed"];
const fixtureRepository = {
  id: "example/fixture",
  owner: "example",
  repo: "fixture",
};
function fixtureTask(id) {
  return {
    id,
    title: "Fixture " + id,
    scope: "catalog",
    status: "planned",
    track: "catalog",
    tags: [],
    acceptance: [`${id} passes.`],
  };
}
function fixtureIssue(task, number) {
  const nodeId = "fixture-issue-" + number;
  return {
    record: {
      id: `github:${fixtureRepository.id}:${nodeId}`,
      repository: fixtureRepository.id,
      taskId: task.id,
      issueId: number,
      databaseId: number,
      nodeId,
      number,
      url: `https://example.test/${fixtureRepository.id}/issues/${number}`,
      body: task.title,
      bodyHash: "fixture-hash-" + number,
      assignees: ["fixture-worker"],
      state: "authorized",
      managedBlockerIssueIds: [],
      observedAt: new Date(0).toISOString(),
    },
    link: {
      repository: fixtureRepository.id,
      issueId: number,
      nodeId,
      number,
      url: `https://example.test/${fixtureRepository.id}/issues/${number}`,
      origin: "design",
      bodyHash: "fixture-hash-" + number,
    },
  };
}
export function workspaceFixture(t, shape = "local") {
  if (!workspaceShapes.includes(shape))
    throw Error("Unknown workspace fixture shape: " + shape);
  const root = temporaryDirectory(`avoozl-${shape}-`),
    store = new Store(path.join(root, "workspace.sqlite")),
    data = snapshot(),
    localIds = shape === "github" ? [] : ["local-a", "local-b"],
    githubIds = shape === "local" ? [] : ["github-a", "github-b"],
    issues = [];
  data.tasks = localIds.map(fixtureTask);
  for (const [index, id] of githubIds.entries()) {
    const task = fixtureTask(id),
      issue = fixtureIssue(task, 101 + index);
    task.github = issue.link;
    task.dispatch = {
      ready: true,
      state: "authorized",
      assignee: issue.record.assignees,
      machineId: null,
    };
    issues.push(issue.record);
    data.tasks.push(task);
  }
  // Each list is a chain; a mixed workspace also makes the first GitHub task
  // depend on the last local one so edges cross the two kinds of task.
  const chain = shape === "mixed" ? [...localIds, ...githubIds] : localIds;
  data.edges = [chain, shape === "mixed" ? [] : githubIds].flatMap((ids) =>
    ids.slice(1).map((to, index) => ({
      id: `${ids[index]}:requires:${to}`,
      from: ids[index],
      to,
      kind: "requires",
      reason: "Fixture dependency.",
    })),
  );
  store.initialize(data);
  if (issues.length) {
    store.put("github_repositories", {
      ...fixtureRepository,
      nodeId: "fixture-repository",
      private: true,
      repositoryId: "fixture",
      assignee: "fixture-worker",
      allowedActors: [],
      minimumPermission: "write",
      provider: null,
      model: null,
      autoStart: false,
      activeMachine: null,
      configuredBy: "fixture-worker",
      configuredAt: new Date(0).toISOString(),
    });
  }
  t.after(() => {
    try {
      store.close();
    } catch {}
  });
  return { root, store, shape, localIds, githubIds };
}
// An isolated worktree on branch plans/<id> for a task, as validation and
// integration read it.
export async function recordedRun(
  store,
  { id, taskId = "sample-task", repositoryId },
) {
  const repository = store.get("repositories", repositoryId),
    worktree = await createWorktree(store, repository, id);
  return { id, taskId, repositoryId, ...worktree };
}
// Record acceptance checks for a worktree from recordedRun and a ready
// integration entry, under the repository work lock.
export function validateRun(store, run) {
  return withWorkLock(
    store,
    {
      id: "validation:" + run.id,
      repositoryId: run.repositoryId,
      kind: "validation",
    },
    () => validateUnlocked(store, run.id, { source: run }),
  );
}
// Wait for a condition rather than for a duration. A fixed sleep turns a
// slower machine, or a busier test run, into a failure that says nothing
// about the behavior under test.
export async function waitFor(predicate, { timeoutMs = 20000, label } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline)
      throw Error("Timed out waiting for " + (label || "a condition"));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
export const markdown = `# A small plan\n\n## Design\n\nKeep the design in one document.\n\n\`\`\`task\n{"id":"foundation","title":"Build foundation","acceptance":["Foundation passes"],"checks":["npm test"],"track":"catalog"}\n\`\`\`\n\n\`\`\`task\n{"id":"delivery","title":"Deliver feature","acceptance":["Feature passes"],"checks":["npm test"],"requires":["foundation"],"track":"catalog"}\n\`\`\`\n`;

// A task worktree under `root`/wt with one commit, a verified delivery and
// a worker chat, in workspace {root, checkout, store}. Returns its commit,
// folder and branch. `extra` adds fields to the delivery and the binding,
// each a function of the commit.
export function verifiedTask(w, taskId, file = `${taskId}.txt`, extra = {}) {
  const git = (cwd, ...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const branch = `avoozl/${taskId}`,
    wt = path.join(w.root, "wt", taskId);
  git(w.checkout, "worktree", "add", "-q", "-b", branch, wt, "main");
  fs.writeFileSync(path.join(wt, file), taskId + "\n");
  git(wt, "add", ".");
  git(wt, "commit", "-qm", "Do " + taskId);
  const commit = git(wt, "rev-parse", "HEAD");
  w.store.put("task_worktrees", {
    id: taskId,
    taskId,
    path: wt,
    branch,
    repository: "app",
  });
  w.store.put("task_deliveries", {
    id: taskId,
    taskId,
    state: "verified",
    commit,
    attempts: [],
    verifications: [],
    ...extra.delivery?.(commit),
  });
  w.store.put("session_bindings", {
    id: "slot-" + taskId,
    slot: "slot-" + taskId,
    taskId,
    role: "worker",
    attempt: 1,
    status: "working",
    ...extra.binding?.(commit),
  });
  return { commit, wt, branch };
}
