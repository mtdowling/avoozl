import { fail, type Store } from "../store/store.ts";

// One repository as the workspace shows it: a registered checkout, a GitHub
// repository, or both.
export type WorkspaceRepository = {
  id: string;
  name: string;
  github: string | null;
  localCheckout: string | null;
  worktreeRoot: string | null;
  planning: boolean;
  editable: boolean;
  baseBranch: string;
  landing?: string | null;
  harness?: string | null;
  checks: unknown;
  isolation?: unknown;
  labels?: unknown;
  claims?: unknown;
  queue: {
    enabled: boolean;
    issues: boolean;
    pullRequests: boolean;
    visibility: string | null;
  };
  issueAuthorization: {
    enabled: boolean;
    assignee?: string;
    autoStart?: boolean;
    provider?: string | null;
    model?: string | null;
  };
};
type RepositoryRow = {
  id: string;
  name?: string;
  github?: string;
  root: string;
  worktreeRoot?: string;
  planning?: boolean;
  editable?: boolean;
  baseBranch?: string;
  landing?: string;
  harness?: string;
  checks?: unknown[];
  isolation?: unknown;
  labels?: unknown;
  claims?: unknown;
};
type AuthorizationRow = {
  id: string;
  workspaceRepositoryId?: string;
  repositoryId?: string;
  assignee?: string;
  autoStart?: boolean;
  provider?: string;
  model?: string;
};

export function workspaceRepositories(store: Store): WorkspaceRepository[] {
  const repositories = store.list<RepositoryRow>("repositories");
  const authorization = store.list<AuthorizationRow>("github_repositories");
  const byId = new Map<string, WorkspaceRepository>();

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
      labels: repository.labels ? structuredClone(repository.labels) : null,
      claims: repository.claims ? structuredClone(repository.claims) : null,
      queue: {
        enabled: false,
        issues: false,
        pullRequests: false,
        visibility: null,
      },
      issueAuthorization: { enabled: false },
    });

  const ensure = (repository: string, repositoryId: string | undefined) => {
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
    return byId.get(id)!;
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

type Removable = Pick<WorkspaceRepository, "id" | "github" | "localCheckout">;

export function assertRepositoryRemovable(store: Store, repository: Removable) {
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

export function removeWorkspaceRepositoryRecords(
  store: Store,
  repository: Removable,
) {
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
