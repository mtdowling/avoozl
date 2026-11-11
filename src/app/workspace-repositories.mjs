import { normalizeGitHubLabelBehaviors } from "./github-label-behaviors.mjs";
import { fail } from "./store.mjs";

const activeStates = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);

export function workspaceRepositories(store) {
  const projects = store.list("projects");
  const queue = store.list("github_queue_repositories");
  const authorization = store.list("github_repositories");
  const byId = new Map();

  for (const project of projects)
    byId.set(project.id, {
      id: project.id,
      name: project.name || project.id,
      github: project.repository || null,
      localCheckout: project.root,
      worktreeRoot: project.worktreeRoot || null,
      planning: Boolean(project.planning),
      editable: project.editable !== false,
      baseBranch: project.baseBranch || "main",
      checks: structuredClone(project.checks || []),
      queue: {
        enabled: false,
        issues: false,
        pullRequests: false,
        visibility: null,
      },
      issueAuthorization: { enabled: false },
      labels: normalizeGitHubLabelBehaviors(),
    });

  const ensure = (repository, projectId) => {
    const matched = projectId
      ? byId.get(projectId)
      : [...byId.values()].find((item) => item.github === repository);
    const id = matched?.id || projectId || repository;
    if (!byId.has(id))
      byId.set(id, {
        id,
        name: repository,
        github: repository,
        localCheckout: null,
        worktreeRoot: null,
        planning: false,
        editable: false,
        baseBranch: "main",
        checks: [],
        queue: {
          enabled: false,
          issues: false,
          pullRequests: false,
          visibility: null,
        },
        issueAuthorization: { enabled: false },
        labels: normalizeGitHubLabelBehaviors(),
      });
    return byId.get(id);
  };

  for (const entry of queue) {
    const item = ensure(
      entry.id,
      entry.workspaceRepositoryId || entry.projectId,
    );
    item.github = entry.id;
    item.queue = {
      enabled: entry.enabled !== false,
      issues: entry.includeIssues !== false,
      pullRequests: entry.includePullRequests !== false,
      visibility:
        entry.visibility || (entry.private === false ? "public" : "private"),
    };
    item.labels = normalizeGitHubLabelBehaviors(entry.labelBehaviors);
  }
  for (const entry of authorization) {
    const item = ensure(
      entry.id,
      entry.workspaceRepositoryId || entry.projectId,
    );
    item.github = entry.id;
    item.issueAuthorization = {
      enabled: true,
      assignee: entry.assignee || "",
      readyLabel: entry.label || "avoozl:ready",
      allowedActors: structuredClone(entry.allowedActors || []),
      minimumPermission: entry.minimumPermission || "write",
      autoStart: Boolean(entry.autoStart),
      provider: entry.provider || null,
      model: entry.model || null,
    };
    item.labels = normalizeGitHubLabelBehaviors(
      { ...item.labels, ready: [entry.label || "avoozl:ready"] },
      item.labels,
    );
  }
  return [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function assertRepositoryRemovable(store, repository) {
  if (repository.localCheckout) {
    const active = store
      .list("runs")
      .find(
        (run) => run.projectId === repository.id && activeStates.has(run.state),
      );
    if (active)
      fail(
        `Repository ${repository.id} still has an active conversation. Stop it before removing the repository.`,
        409,
      );
    const locked = store.db
      .prepare("SELECT id FROM work_locks WHERE project_id=? LIMIT 1")
      .get(repository.id);
    if (locked)
      fail(
        `Repository ${repository.id} is locked by active work. Wait for it to finish before removing it.`,
        409,
      );
  }
}

export function removeWorkspaceRepositoryRecords(store, repository) {
  assertRepositoryRemovable(store, repository);
  store.transaction(() => {
    if (repository.github) {
      store.db
        .prepare(
          "DELETE FROM github_queue_items WHERE json_extract(body,'$.repository')=?",
        )
        .run(repository.github);
      store.db
        .prepare("DELETE FROM github_queue_repositories WHERE id=?")
        .run(repository.github);
      store.db
        .prepare("DELETE FROM github_repositories WHERE id=?")
        .run(repository.github);
    }
    if (repository.localCheckout)
      store.db.prepare("DELETE FROM projects WHERE id=?").run(repository.id);
    store.event(null, "workspace.repository.removed", {
      repositoryId: repository.id,
      github: repository.github,
    });
  });
  return { ...repository, removed: true };
}
