import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TestContext } from "node:test";
import type { Edge, Task } from "../../types.ts";
import type { Repository } from "../git/git.ts";
import type { Epic } from "../epics/epics.ts";
import {
  Store,
  type StoredRecord,
  type StoredSnapshot,
} from "../store/store.ts";
import { recordSpan } from "../flow/flow.ts";
import { temporaryDirectory } from "./temporary.ts";
import { createWorktree, validateUnlocked, withWorkLock } from "../git/git.ts";
export function snapshot() {
  const edges: Edge[] = [],
    epics: Epic[] = [];
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
    epics,
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
    edges,
    documents: {},
    changelog: [],
    unknownExtension: { preserve: true },
  };
}
export function fixture(t: TestContext) {
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
function fixtureTask(id: string): Task {
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
function fixtureIssue(task: Task, number: number) {
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
export function workspaceFixture(t: TestContext, shape = "local") {
  if (!workspaceShapes.includes(shape))
    throw Error("Unknown workspace fixture shape: " + shape);
  const root = temporaryDirectory(`avoozl-${shape}-`),
    store = new Store(path.join(root, "workspace.sqlite")),
    data: StoredSnapshot = snapshot(),
    localIds = shape === "github" ? [] : ["local-a", "local-b"],
    githubIds = shape === "local" ? [] : ["github-a", "github-b"],
    issues: StoredRecord[] = [];
  data.tasks = localIds.map(fixtureTask);
  for (const [index, id] of githubIds.entries()) {
    const task = fixtureTask(id),
      issue = fixtureIssue(task, 101 + index);
    task.github = issue.link;
    task.dispatch = {
      ready: true,
      state: "authorized",
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
  store: Store,
  {
    id,
    taskId = "sample-task",
    repositoryId,
  }: { id: string; taskId?: string; repositoryId: string },
) {
  const repository = store.get<Repository>("repositories", repositoryId);
  if (!repository) throw Error(`No repository ${repositoryId}.`);
  const worktree = await createWorktree(store, repository, id);
  return { id, taskId, repositoryId, ...worktree };
}
// Record acceptance checks for a worktree from recordedRun and a ready
// integration entry, under the repository work lock.
export function validateRun(
  store: Store,
  run: Awaited<ReturnType<typeof recordedRun>>,
) {
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
export async function waitFor<T>(
  predicate: () => T | Promise<T>,
  { timeoutMs = 20000, label = "" } = {},
): Promise<T> {
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
export function verifiedTask(
  w: { root: string; checkout: string; store: Store },
  taskId: string,
  file = `${taskId}.txt`,
  extra: {
    delivery?: (commit: string) => Record<string, unknown>;
    binding?: (commit: string) => Record<string, unknown>;
  } = {},
) {
  const git = (cwd: string, ...args: string[]) =>
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

// Claim branches in acme/app's cache (simplify §D3): `own` lists the tasks
// this runner claimed, `other` the ones another runner holds.
export async function seedClaims(
  store: Store,
  { own = [], other = [] }: { own?: string[]; other?: string[] } = {},
) {
  const { cacheClaim } = await import("../workers/claims.ts");
  for (const [task, mine] of [
    ...own.map((id): [string, boolean] => [id, true]),
    ...other.map((id): [string, boolean] => [id, false]),
  ])
    cacheClaim(store, "acme/app", {
      spec: "s",
      task,
      branch: `avoozl/s/${task}`,
      sha: "a".repeat(40),
      ...(mine ? { own: true } : {}),
    });
}

// One Flow stage span, seeded through the recording API, in the column order
// the old span table had: id, task, attempt, role, stage, start, end, source,
// detail.
export function seedSpan(
  store: Store,
  id: string,
  taskId: string,
  attempt: number | null,
  role: string | null,
  stage: string,
  startedAt: string,
  endedAt: string | null,
  source: string,
  detail?: unknown,
) {
  return recordSpan(store, {
    id,
    taskId,
    attempt,
    role,
    stage,
    startedAt,
    endedAt,
    source,
    detail,
  });
}

// Turn on the server loop (simplify §D6) for this test process: a machine
// config of its own, in a fresh temporary XDG folder, whose `loop` runs
// specs and issues, so the tick starts and lands work as it does with the
// loop on.
export function loopOn(run = ["specs", "issues"]) {
  process.env.XDG_CONFIG_HOME = temporaryDirectory("avoozl-loop-xdg-");
  const dir = path.join(process.env.XDG_CONFIG_HOME, "avoozl");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "config.json"),
    JSON.stringify({ version: 1, loop: { run } }),
  );
}
