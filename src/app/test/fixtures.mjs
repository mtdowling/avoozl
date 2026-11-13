import path from "node:path";
import { Store } from "../store.mjs";
import { temporaryDirectory } from "./temporary.mjs";
import { createWorktree } from "../git.mjs";
export function snapshot() {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: new Date(0).toISOString(),
    project: {
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
  store.importSnapshot(snapshot());
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
  store.importSnapshot(data);
  if (issues.length) {
    store.put("github_repositories", {
      ...fixtureRepository,
      nodeId: "fixture-repository",
      private: true,
      projectId: "fixture",
      label: "avoozl:ready",
      managedLabel: "avoozl:managed",
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
    for (const issue of issues) store.put("github_issues", issue);
  }
  t.after(() => {
    try {
      store.close();
    } catch {}
  });
  return { root, store, shape, localIds, githubIds };
}
// A run row as the removed agent host left it: an isolated worktree on branch
// plans/<id> and the run's state. Old workspaces hold these as read-only
// history, and validation and integration still read them.
export async function recordedRun(
  store,
  { id, taskId = "sample-task", projectId, provider = "codex", state },
) {
  const project = store.get("projects", projectId),
    worktree = await createWorktree(store, project, id);
  return store.put("runs", {
    id,
    taskId,
    projectId,
    provider,
    mode: "implement",
    state,
    ...worktree,
    createdAt: new Date().toISOString(),
  });
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
