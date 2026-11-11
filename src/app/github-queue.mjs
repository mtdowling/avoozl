import { digest, queryTasks } from "../model.mjs";
import { requireDistinctTask } from "../task-identity.mjs";
import { parseIssueTask } from "./github-sync.mjs";
import { parseRepository } from "./github.mjs";
import { decorateQueueItemsWithOverlaps } from "./github-overlap.mjs";
import { fail } from "./store.mjs";

const now = () => new Date().toISOString();

function queueItemId(repository, kind, item) {
  return `github-queue:${repository.id}:${kind}:${item.node_id || item.id || item.number}`;
}

function assignees(item) {
  return (item.assignees || []).map((entry) => entry?.login).filter(Boolean);
}

function labels(item) {
  return (item.labels || [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.name))
    .filter(Boolean);
}

function queueIssue(repository, config, issue, observedAt) {
  return {
    id: queueItemId(repository, "issue", issue),
    kind: "issue",
    repository: repository.id,
    projectId: config.projectId || null,
    nodeId: issue.node_id || null,
    number: issue.number,
    title: issue.title || `Issue #${issue.number}`,
    summary: String(issue.body || "").slice(0, 4000),
    body: String(issue.body || ""),
    bodyHash: digest(String(issue.body || "")),
    url: issue.html_url || null,
    author: issue.user?.login || null,
    assignees: assignees(issue),
    assigned: assignees(issue).length > 0,
    labels: labels(issue),
    state: issue.state || "open",
    createdAt: issue.created_at || null,
    updatedAt: issue.updated_at || observedAt,
    observedAt,
  };
}

function queuePullRequest(repository, config, pull, observedAt) {
  return {
    id: queueItemId(repository, "pull-request", pull),
    kind: "pull-request",
    repository: repository.id,
    projectId: config.projectId || null,
    nodeId: pull.node_id || null,
    number: pull.number,
    title: pull.title || `Pull request #${pull.number}`,
    summary: String(pull.body || "").slice(0, 4000),
    body: String(pull.body || ""),
    bodyHash: digest(String(pull.body || "")),
    url: pull.html_url || null,
    author: pull.user?.login || null,
    assignees: assignees(pull),
    assigned: assignees(pull).length > 0,
    labels: labels(pull),
    state: pull.state || "open",
    draft: Boolean(pull.draft),
    headBranch: pull.head?.ref || null,
    headSha: pull.head?.sha || null,
    baseBranch: pull.base?.ref || null,
    createdAt: pull.created_at || null,
    updatedAt: pull.updated_at || observedAt,
    observedAt,
  };
}

function validateProject(store, projectId) {
  if (projectId && !store.get("projects", projectId))
    fail("Configure the execution project before monitoring its repository.");
}

function requestedVisibility(input, existing) {
  const visibility =
    input.visibility ||
    (input.allowPublicReadOnly === true ? "public" : null) ||
    existing?.visibility ||
    (existing?.private === true ? "private" : null) ||
    "private";
  if (!["private", "public"].includes(visibility))
    fail("Repository visibility must be private or public.");
  return visibility;
}

async function requireQueueRepository(github, repository, visibility) {
  const remote = await github.repository(repository),
    actual = remote.private === true ? "private" : "public";
  if (actual !== visibility)
    fail(
      `${repository.id} is ${actual}, but this Queue source is configured as ${visibility}. Reconfigure it explicitly before continuing.`,
      409,
    );
  return remote;
}

export async function configureGitHubQueueRepository(store, github, input) {
  const repository = parseRepository(input.repository || input.id),
    existing = store.get("github_queue_repositories", repository.id),
    projectId = input.projectId ?? existing?.projectId ?? null,
    enabled = input.enabled ?? existing?.enabled ?? true,
    visibility = requestedVisibility(input, existing);
  if (enabled && !projectId)
    fail("Choose an execution project for this monitored repository.");
  validateProject(store, projectId);
  const disabling = existing && input.enabled === false,
    remote = disabling
      ? { node_id: existing.nodeId, private: existing.visibility !== "public" }
      : await requireQueueRepository(github, repository, visibility);
  let configuredBy = existing?.configuredBy || null;
  if (!configuredBy && github.currentUser)
    configuredBy = (await github.currentUser()).login || null;
  const record = {
    ...repository,
    id: repository.id,
    nodeId: remote.node_id || existing?.nodeId || null,
    private: visibility === "private",
    visibility,
    accessMode:
      visibility === "public" ? "public-read-only" : "private-read-only",
    canAuthorizeExecution: false,
    enabled,
    includeIssues: input.includeIssues ?? existing?.includeIssues ?? true,
    includePullRequests:
      input.includePullRequests ?? existing?.includePullRequests ?? true,
    projectId,
    configuredBy,
    configuredAt: existing?.configuredAt || now(),
    updatedAt: now(),
  };
  store.put("github_queue_repositories", record);
  store.event(null, "github.queue.repository.configured", {
    repository: record.id,
    enabled: record.enabled,
    includeIssues: record.includeIssues,
    includePullRequests: record.includePullRequests,
    projectId: record.projectId,
    visibility: record.visibility,
    accessMode: record.accessMode,
  });
  return record;
}

export function removeGitHubQueueRepository(store, input) {
  const repository = parseRepository(input.repository || input.id),
    record = store.get("github_queue_repositories", repository.id);
  if (!record) fail("Monitored GitHub repository not found.", 404);
  store.transaction(() => {
    store.db
      .prepare(
        "DELETE FROM github_queue_items WHERE json_extract(body,'$.repository')=?",
      )
      .run(repository.id);
    store.db
      .prepare("DELETE FROM github_queue_repositories WHERE id=?")
      .run(repository.id);
    store.event(null, "github.queue.repository.removed", {
      repository: repository.id,
    });
  });
  return { id: repository.id, removed: true };
}

export async function syncGitHubQueue(store, github, { repository } = {}) {
  const configs = repository
      ? [
          store.get(
            "github_queue_repositories",
            parseRepository(repository).id,
          ),
        ].filter(Boolean)
      : store
          .list("github_queue_repositories")
          .filter((entry) => entry.enabled),
    result = { repositories: [], items: 0, syncedAt: now() };
  if (repository && !configs.length)
    fail("Monitored GitHub repository not found.", 404);
  for (const config of configs) {
    if (!config.enabled) continue;
    const parsed = parseRepository(config.id);
    await requireQueueRepository(
      github,
      parsed,
      config.visibility || (config.private === true ? "private" : "public"),
    );
    const [issues, pulls] = await Promise.all([
      config.includeIssues
        ? github.listOpenIssues(parsed)
        : Promise.resolve([]),
      config.includePullRequests
        ? github.listPullRequests(parsed, { state: "open" })
        : Promise.resolve([]),
    ]);
    const observedAt = now(),
      items = [
        ...issues.map((issue) => queueIssue(parsed, config, issue, observedAt)),
        ...pulls.map((pull) =>
          queuePullRequest(parsed, config, pull, observedAt),
        ),
      ],
      seen = new Set(items.map((item) => item.id));
    store.transaction(() => {
      for (const item of items) store.put("github_queue_items", item);
      for (const previous of store
        .list("github_queue_items")
        .filter((item) => item.repository === config.id))
        if (!seen.has(previous.id))
          store.db
            .prepare("DELETE FROM github_queue_items WHERE id=?")
            .run(previous.id);
    });
    result.repositories.push({
      id: config.id,
      visibility:
        config.visibility || (config.private === true ? "private" : "public"),
      accessMode:
        config.accessMode ||
        (config.private === true ? "private-read-only" : "public-read-only"),
      issues: issues.length,
      pullRequests: pulls.length,
      syncedAt: observedAt,
    });
    result.items += items.length;
  }
  store.setMeta("githubQueueSync", result);
  store.event(null, "github.queue.sync.completed", result);
  return result;
}

function taskQueueItems(store) {
  const data = store.read(),
    repositories = store.list("github_queue_repositories");
  return queryTasks(data, {
    scope: "all",
    q: "ready:true",
  }).map((task) => ({
    id: `task:${task.id}`,
    kind: "task",
    taskId: task.id,
    title: task.title,
    summary: task.summary || task.nextAction || "",
    projectId: task.projectId || null,
    repository:
      repositories.find(
        (repository) =>
          task.projectId && repository.projectId === task.projectId,
      )?.id || null,
    assignees: task.owner ? [task.owner] : [],
    assigned: Boolean(task.owner),
    labels: task.tags || [],
    updatedAt: task.updatedAt || data.updatedAt,
    task,
  }));
}

export function githubQueueItems(store, github, input = {}) {
  const showAssigned = Boolean(input.showAssigned),
    available = github.available(),
    repositories = store.list("github_queue_repositories"),
    enabledRepositories = new Set(
      repositories.filter((entry) => entry.enabled).map((entry) => entry.id),
    ),
    repository = input.repository ? parseRepository(input.repository).id : null,
    requestedKinds = input.kinds
      ? new Set(
          (Array.isArray(input.kinds) ? input.kinds : [input.kinds]).map(
            String,
          ),
        )
      : null,
    githubItems = decorateQueueItemsWithOverlaps(
      store,
      store
        .list("github_queue_items")
        .filter((item) => enabledRepositories.has(item.repository))
        .filter((item) => !repository || item.repository === repository)
        .filter(
          (item) =>
            !requestedKinds ||
            requestedKinds.has(item.kind) ||
            (item.kind === "pull-request" && requestedKinds.has("pr")),
        )
        .filter(
          (item) =>
            item.kind !== "issue" ||
            showAssigned ||
            item.assignees.length === 0,
        ),
      { limit: input.overlapLimit },
    ),
    taskItems =
      !requestedKinds || requestedKinds.has("task")
        ? taskQueueItems(store).filter(
            (item) => !repository || item.repository === repository,
          )
        : [],
    items = [...githubItems, ...taskItems].sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    ),
    limit = Math.max(1, Math.min(500, Number(input.limit) || 200));
  return {
    available,
    ...(available
      ? {}
      : {
          reason:
            "GitHub credentials are not available. Local ready tasks remain usable.",
        }),
    lastSync: store.getMeta("githubQueueSync")?.syncedAt || null,
    repositories,
    items: items.slice(0, limit),
    total: items.length,
  };
}

function ensureInbox(data) {
  if (!data.epics.some((epic) => epic.id === "inbox"))
    data.epics.push({
      id: "inbox",
      title: "Inbox",
      scope: "catalog",
      color: "#96abc1",
    });
  if (!data.tracks.some((track) => track.id === "catalog"))
    data.tracks.push({ id: "catalog", label: "General" });
}

export async function createTaskFromQueueItem(
  store,
  github,
  input,
  expectedRevision,
) {
  const item = store.get("github_queue_items", input.itemId);
  if (!item) fail("Queue item not found.", 404);
  const repository = store.get("github_queue_repositories", item.repository);
  if (!repository?.enabled)
    fail("Enable this monitored repository before creating its task.", 409);
  await requireQueueRepository(
    github,
    parseRepository(repository.id),
    repository.visibility ||
      (repository.private === true ? "private" : "public"),
  );
  const existing = store
    .read()
    .tasks.find(
      (task) =>
        task.github?.nodeId === item.nodeId &&
        task.github?.repository === item.repository,
    );
  if (existing) return { task: existing, existing: true };
  const task = store.mutate(
    `Create task from ${item.repository}#${item.number}`,
    (data) => {
      ensureInbox(data);
      const parsed =
          item.kind === "issue"
            ? parseIssueTask({
                title: item.title,
                body: item.body,
              })
            : {
                title: `Review ${item.title}`,
                summary: item.body || item.summary,
                acceptance: [
                  "Review the pull request changes and required checks.",
                  "Record findings or explicitly accept the result.",
                ],
                tags: [],
                resources: [],
              },
        id = `github-${digest(item.nodeId || item.id).slice(0, 20)}`,
        task = {
          id,
          title: parsed.title,
          summary: parsed.summary,
          scope: "catalog",
          kind: "task",
          status: "planned",
          epic: "inbox",
          track: "catalog",
          tags: [
            ...new Set([
              "github",
              item.kind === "pull-request" ? "pull-request" : "issue",
              ...(parsed.tags || []),
            ]),
          ],
          resources: parsed.resources || [],
          acceptance: parsed.acceptance,
          projectId: item.projectId || undefined,
          github: {
            repository: item.repository,
            nodeId: item.nodeId,
            number: item.number,
            url: item.url,
            origin:
              item.kind === "pull-request"
                ? "pull-request-request"
                : "issue-request",
            bodyHash: item.bodyHash,
          },
          provenance: {
            kind:
              item.kind === "pull-request"
                ? "github-pull-request"
                : "github-issue",
            repository: item.repository,
            nodeId: item.nodeId,
            number: item.number,
            bodyHash: item.bodyHash,
            capturedAt: now(),
          },
          dispatch: {
            ready: false,
            state: "captured",
            reason:
              "Captured from the Queue. Explicit authorization is required before execution.",
          },
          needsReview: true,
          createdAt: now(),
          updatedAt: now(),
        };
      requireDistinctTask(data, task);
      data.tasks.push(task);
      return task;
    },
    expectedRevision,
  );
  return { task, existing: false };
}
