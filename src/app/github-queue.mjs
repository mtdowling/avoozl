import { digest, queryTasks } from "../model.mjs";
import { queueItemProcessed } from "../queue-triage.mjs";
import { requireDistinctTask } from "../task-identity.mjs";
import { parseIssueTask } from "./github-sync.mjs";
import { parseRepository } from "./github.mjs";
import {
  normalizeGitHubLabelBehaviors,
  normalizedGitHubLabelStates,
  primaryGitHubLabelState,
} from "./github-label-behaviors.mjs";
import { decorateQueueItemsWithOverlaps } from "./github-overlap.mjs";
import { fail } from "./store.mjs";

const now = () => new Date().toISOString();
const MAX_PULL_REQUEST_FILES = 300;
const MAX_PATCH_CHARACTERS = 400_000;
const MAX_FILE_PATCH_CHARACTERS = 100_000;

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
  const originalLabels = labels(issue),
    normalizedStates = normalizedGitHubLabelStates(
      originalLabels,
      config.labelBehaviors,
    );
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
    labels: originalLabels,
    normalizedStates,
    normalizedState: primaryGitHubLabelState(
      originalLabels,
      config.labelBehaviors,
    ),
    state: issue.state || "open",
    createdAt: issue.created_at || null,
    updatedAt: issue.updated_at || observedAt,
    observedAt,
  };
}

function queuePullRequest(repository, config, pull, observedAt) {
  const originalLabels = labels(pull),
    normalizedStates = normalizedGitHubLabelStates(
      originalLabels,
      config.labelBehaviors,
    );
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
    labels: originalLabels,
    normalizedStates,
    normalizedState: primaryGitHubLabelState(
      originalLabels,
      config.labelBehaviors,
    ),
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
    labelBehaviors: normalizeGitHubLabelBehaviors(
      input.labelBehaviors,
      existing?.labelBehaviors,
    ),
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
    labelBehaviors: record.labelBehaviors,
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
      for (const item of items) {
        const previous = store.get("github_queue_items", item.id),
          claim =
            previous?.claim?.login &&
            item.assignees.includes(previous.claim.login)
              ? previous.claim
              : undefined;
        store.put("github_queue_items", {
          ...item,
          ...(claim ? { claim } : {}),
        });
      }
      for (const previous of store
        .list("github_queue_items")
        .filter((item) => item.repository === config.id))
        if (!seen.has(previous.id))
          store.put("github_queue_items", {
            ...previous,
            state: "closed",
            processed: true,
            processedAt: previous.processedAt || observedAt,
            disposition: previous.disposition || "no-longer-open",
          });
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
    repositories = store.list("github_queue_repositories"),
    ready = queryTasks(data, {
      scope: "all",
      q: "ready:true",
    }),
    approvals = [
      ...queryTasks(data, { scope: "all", status: "needs-review" }),
      ...queryTasks(data, { scope: "all", status: "implemented" }),
    ],
    tasks = new Map([...ready, ...approvals].map((task) => [task.id, task]));
  return [...tasks.values()].map((task) => ({
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
    attention:
      task.needsReview ||
      task.status === "review" ||
      task.status === "implemented"
        ? "approval"
        : "ready",
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || data.updatedAt,
    task,
  }));
}

function commentId(kind, comment) {
  return `github-${kind}-comment:${comment.node_id || comment.id}`;
}

function normalizedReactions(comment) {
  const reactions = comment.reactions;
  if (!reactions || typeof reactions !== "object") return null;
  return {
    total: Number(reactions.total_count) || 0,
    plusOne: Number(reactions["+1"]) || 0,
    minusOne: Number(reactions["-1"]) || 0,
    laugh: Number(reactions.laugh) || 0,
    hooray: Number(reactions.hooray) || 0,
    confused: Number(reactions.confused) || 0,
    heart: Number(reactions.heart) || 0,
    rocket: Number(reactions.rocket) || 0,
    eyes: Number(reactions.eyes) || 0,
  };
}

function normalizedComment(kind, comment) {
  const id = commentId(kind, comment);
  return {
    id,
    kind: kind === "review" ? "review-comment" : "issue-comment",
    nodeId: comment.node_id || null,
    databaseId: comment.id ?? null,
    author: comment.user?.login || null,
    authorUrl: comment.user?.html_url || null,
    authorAssociation: comment.author_association || null,
    body: String(comment.body || "").slice(0, 100_000),
    url: comment.html_url || null,
    createdAt: comment.created_at || null,
    updatedAt: comment.updated_at || comment.created_at || null,
    reactions: normalizedReactions(comment),
    threadId: id,
    replyToId: null,
    ...(kind === "review"
      ? {
          path: comment.path || null,
          line: comment.line ?? null,
          originalLine: comment.original_line ?? null,
          side: comment.side || null,
          startLine: comment.start_line ?? null,
          startSide: comment.start_side || null,
          commitId: comment.commit_id || null,
          originalCommitId: comment.original_commit_id || null,
          pullRequestReviewId: comment.pull_request_review_id ?? null,
          inReplyToId: comment.in_reply_to_id ?? null,
          diffHunk: String(comment.diff_hunk || "").slice(0, 20_000),
        }
      : {}),
  };
}

function normalizeReviewComments(comments) {
  const byDatabaseId = new Map(
      comments
        .filter((comment) => comment?.id != null)
        .map((comment) => [comment.id, comment]),
    ),
    rootFor = (comment) => {
      const seen = new Set();
      let current = comment;
      while (
        current?.in_reply_to_id != null &&
        !seen.has(current.in_reply_to_id)
      ) {
        seen.add(current.in_reply_to_id);
        const parent = byDatabaseId.get(current.in_reply_to_id);
        if (!parent) break;
        current = parent;
      }
      return current;
    };
  return comments.map((comment) => {
    const normalized = normalizedComment("review", comment),
      parent = byDatabaseId.get(comment.in_reply_to_id),
      root = rootFor(comment);
    return {
      ...normalized,
      replyToId: parent ? commentId("review", parent) : null,
      threadId: commentId("review", root),
    };
  });
}

export async function githubQueueComments(store, github, input = {}) {
  const item = store.get("github_queue_items", input.itemId);
  if (!item) fail("Queue item not found.", 404);
  if (!["issue", "pull-request"].includes(item.kind))
    fail("Only GitHub issues and pull requests have comment threads.", 400);
  const repository = store.get("github_queue_repositories", item.repository);
  if (!repository?.enabled)
    fail("Enable this monitored repository before loading comments.", 409);
  const parsed = parseRepository(repository.id);
  await requireQueueRepository(
    github,
    parsed,
    repository.visibility ||
      (repository.private === true ? "private" : "public"),
  );
  const [issueComments, reviewComments] = await Promise.all([
      github.listIssueComments(parsed, item.number),
      item.kind === "pull-request"
        ? github.listPullRequestReviewComments(parsed, item.number)
        : Promise.resolve([]),
    ]),
    normalizedIssues = issueComments.map((comment) =>
      normalizedComment("issue", comment),
    ),
    normalizedReviews = normalizeReviewComments(reviewComments),
    comments = [...normalizedIssues, ...normalizedReviews].sort((a, b) => {
      const created = String(a.createdAt || "").localeCompare(
        String(b.createdAt || ""),
      );
      return created || a.id.localeCompare(b.id);
    });
  return {
    item: {
      id: item.id,
      kind: item.kind,
      repository: item.repository,
      number: item.number,
      title: item.title,
      url: item.url,
    },
    comments,
    counts: {
      issue: normalizedIssues.length,
      review: normalizedReviews.length,
      total: comments.length,
    },
    fetchedAt: now(),
  };
}

function normalizedPullRequestFile(file, remainingPatchCharacters) {
  const patch = typeof file.patch === "string" ? file.patch : null,
    patchLimit = Math.min(
      MAX_FILE_PATCH_CHARACTERS,
      Math.max(0, remainingPatchCharacters),
    ),
    patchTruncated = Boolean(patch && patch.length > patchLimit),
    visiblePatch =
      patch && patchLimit
        ? patch.slice(0, patchLimit)
        : patch === ""
          ? ""
          : null;
  return {
    sha: file.sha || null,
    filename: String(file.filename || ""),
    previousFilename: file.previous_filename || null,
    status: file.status || "modified",
    additions: Number(file.additions) || 0,
    deletions: Number(file.deletions) || 0,
    changes: Number(file.changes) || 0,
    blobUrl: file.blob_url || null,
    rawUrl: file.raw_url || null,
    patch: visiblePatch,
    patchUnavailable: patch == null,
    patchTruncated,
  };
}

export async function githubQueuePullRequestDiff(store, github, input = {}) {
  const item = store.get("github_queue_items", input.itemId);
  if (!item) fail("Queue item not found.", 404);
  if (item.kind !== "pull-request")
    fail("Only pull requests have changed-file diffs.", 400);
  const repository = store.get("github_queue_repositories", item.repository);
  if (!repository?.enabled)
    fail("Enable this monitored repository before loading its diff.", 409);
  const parsed = parseRepository(repository.id);
  await requireQueueRepository(
    github,
    parsed,
    repository.visibility ||
      (repository.private === true ? "private" : "public"),
  );
  const loaded = await github.listPullRequestFiles(parsed, item.number, {
      maxFiles: MAX_PULL_REQUEST_FILES,
    }),
    files = [];
  let remainingPatchCharacters = MAX_PATCH_CHARACTERS;
  for (const file of loaded.files) {
    const normalized = normalizedPullRequestFile(
      file,
      remainingPatchCharacters,
    );
    files.push(normalized);
    remainingPatchCharacters -= normalized.patch?.length || 0;
  }
  return {
    item: {
      id: item.id,
      repository: item.repository,
      number: item.number,
      title: item.title,
      url: item.url,
    },
    files,
    counts: {
      files: files.length,
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    },
    truncated:
      Boolean(loaded.truncated) ||
      files.some((file) => file.patchTruncated) ||
      remainingPatchCharacters <= 0,
    limits: {
      files: MAX_PULL_REQUEST_FILES,
      patchCharacters: MAX_PATCH_CHARACTERS,
      filePatchCharacters: MAX_FILE_PATCH_CHARACTERS,
    },
    fetchedAt: now(),
  };
}

export function githubQueueItems(store, github, input = {}) {
  const showAssigned = Boolean(input.showAssigned),
    showProcessed = Boolean(input.showProcessed),
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
    )
      .map((item) => ({
        ...item,
        processed: queueItemProcessed(item),
      }))
      .filter((item) => showProcessed || !item.processed),
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

function claimReceiptId(item, login) {
  return `github-queue-claim:${digest(`${item.id}\0${login}`).slice(0, 32)}`;
}

function matchingTask(store, item) {
  return store
    .read()
    .tasks.find(
      (task) =>
        task.github?.nodeId === item.nodeId &&
        task.github?.repository === item.repository,
    );
}

function verifyClaimableIssue(item, issue) {
  if (issue?.pull_request)
    fail("Pull requests use review workflows and cannot be claimed.", 400);
  if (issue?.node_id !== item.nodeId || issue?.number !== item.number)
    fail("The GitHub issue identity changed. Sync Queue before claiming.", 409);
  if (issue?.state !== "open")
    fail(
      "The GitHub issue is no longer open. Sync Queue before claiming.",
      409,
    );
  if (digest(String(issue.body || "")) !== item.bodyHash)
    fail(
      "The GitHub issue changed. Sync Queue and review it before claiming.",
      409,
    );
}

export async function claimGitHubQueueIssue(store, github, input = {}) {
  const item = store.get("github_queue_items", input.itemId);
  if (!item) fail("Queue item not found.", 404);
  if (item.kind !== "issue") fail("Only GitHub issues can be claimed.", 400);
  const configured = store.get("github_queue_repositories", item.repository);
  if (!configured?.enabled)
    fail("Enable this monitored repository before claiming its issue.", 409);
  const repository = parseRepository(configured.id);
  await requireQueueRepository(
    github,
    repository,
    configured.visibility ||
      (configured.private === true ? "private" : "public"),
  );
  const user = await github.currentUser(),
    login = String(user?.login || "").trim();
  if (!login) fail("GitHub did not return the authenticated username.", 502);
  const existingTask = matchingTask(store, item);
  if (existingTask?.owner && existingTask.owner !== login)
    fail(
      `The linked Avoozl task is already owned by ${existingTask.owner}.`,
      409,
    );

  let issue = await github.issue(repository, item.number);
  verifyClaimableIssue(item, issue);
  const existingAssignees = assignees(issue);
  if (existingAssignees.some((assignee) => assignee !== login))
    fail(
      `This issue is already assigned to ${existingAssignees.join(", ")}. Unassign it or use an explicit takeover workflow.`,
      409,
    );

  const receiptId = claimReceiptId(item, login),
    previous = store.get("receipts", receiptId);
  if (
    previous?.state === "claimed" &&
    previous.itemId === item.id &&
    previous.login === login
  ) {
    const task = matchingTask(store, item);
    if (task) return { claim: previous, task, existing: true };
  }
  const startedAt = previous?.startedAt || now();
  store.put("receipts", {
    id: receiptId,
    kind: "github-queue-claim",
    state: "claiming",
    itemId: item.id,
    repository: item.repository,
    nodeId: item.nodeId,
    number: item.number,
    bodyHash: item.bodyHash,
    login,
    startedAt,
    updatedAt: now(),
  });

  try {
    if (!existingAssignees.includes(login))
      await github.addAssignees(repository, item.number, [login]);
    issue = await github.issue(repository, item.number);
    verifyClaimableIssue(item, issue);
    const verifiedAssignees = assignees(issue);
    if (!verifiedAssignees.includes(login))
      fail("GitHub did not record the authenticated user as assignee.", 502);
    if (verifiedAssignees.some((assignee) => assignee !== login))
      fail(
        `The issue became assigned to another user while it was being claimed: ${verifiedAssignees.join(", ")}.`,
        409,
      );

    const claimedAt = now(),
      claimedItem = {
        ...item,
        assignees: verifiedAssignees,
        assigned: true,
        observedAt: claimedAt,
        claim: { login, claimedAt },
      };
    store.put("github_queue_items", claimedItem);
    const created = await createTaskFromQueueItem(store, github, {
        itemId: item.id,
      }),
      task = store.mutate(`Route ${created.task.id} to ${login}`, (data) => {
        const current = data.tasks.find(
          (candidate) => candidate.id === created.task.id,
        );
        if (!current) fail("Claimed task disappeared before routing.", 409);
        if (current.owner && current.owner !== login)
          fail(
            `The linked Avoozl task is already owned by ${current.owner}.`,
            409,
          );
        current.owner = login;
        current.githubClaim = {
          receiptId,
          login,
          claimedAt,
          repository: item.repository,
          nodeId: item.nodeId,
          number: item.number,
        };
        current.updatedAt = claimedAt;
        return current;
      }),
      claim = {
        id: receiptId,
        kind: "github-queue-claim",
        state: "claimed",
        itemId: item.id,
        taskId: task.id,
        repository: item.repository,
        nodeId: item.nodeId,
        number: item.number,
        bodyHash: item.bodyHash,
        login,
        startedAt,
        claimedAt,
        updatedAt: claimedAt,
        authorization: false,
        activationLease: false,
      };
    store.put("receipts", claim);
    store.event(null, "github.queue.issue.claimed", {
      itemId: item.id,
      taskId: task.id,
      repository: item.repository,
      number: item.number,
      login,
      receiptId,
    });
    return { claim, task, existing: false };
  } catch (error) {
    store.put("receipts", {
      ...(store.get("receipts", receiptId) || {}),
      id: receiptId,
      kind: "github-queue-claim",
      state: "pending",
      itemId: item.id,
      repository: item.repository,
      nodeId: item.nodeId,
      number: item.number,
      bodyHash: item.bodyHash,
      login,
      startedAt,
      updatedAt: now(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
