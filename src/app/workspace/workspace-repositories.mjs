import { fail } from "../store/store.mjs";

export function workspaceRepositories(store) {
  const repositories = store.list("repositories");
  const authorization = store.list("github_repositories");
  const byId = new Map();

  for (const repository of repositories)
    byId.set(repository.id, {
      id: repository.id,
      name: repository.name || repository.id,
      github: repository.github || null,
      localCheckout: repository.root,
      worktreeRoot: repository.worktreeRoot || null,
      planning: Boolean(repository.planning),
      editable: repository.editable !== false,
      baseBranch: repository.baseBranch || "main",
      landing: repository.landing || null,
      harness: repository.harness || null,
      checks: structuredClone(repository.checks || []),
      isolation: repository.isolation
        ? structuredClone(repository.isolation)
        : null,
      queue: {
        enabled: false,
        issues: false,
        pullRequests: false,
        visibility: null,
      },
      issueAuthorization: { enabled: false },
    });

  const ensure = (repository, repositoryId) => {
    const matched = repositoryId
      ? byId.get(repositoryId)
      : [...byId.values()].find((item) => item.github === repository);
    const id = matched?.id || repositoryId || repository;
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
      });
    return byId.get(id);
  };

  for (const entry of authorization) {
    const item = ensure(
      entry.id,
      entry.workspaceRepositoryId || entry.repositoryId,
    );
    item.github = entry.id;
    item.issueAuthorization = {
      enabled: true,
      assignee: entry.assignee || "",
      autoStart: Boolean(entry.autoStart),
      provider: entry.provider || null,
      model: entry.model || null,
    };
  }
  return [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function assertRepositoryRemovable(store, repository) {
  if (repository.localCheckout) {
    const locked = store.db
      .prepare("SELECT id FROM work_locks WHERE repository_id=? LIMIT 1")
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
        .prepare("DELETE FROM github_repositories WHERE id=?")
        .run(repository.github);
    }
    if (repository.localCheckout)
      store.db
        .prepare("DELETE FROM repositories WHERE id=?")
        .run(repository.id);
    store.event(null, "workspace.repository.removed", {
      repositoryId: repository.id,
      github: repository.github,
    });
  });
  return { ...repository, removed: true };
}
