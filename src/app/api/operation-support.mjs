// Checks and views the operation handlers share.
import { statusComplete } from "../../model.mjs";
import { resolveTaskId } from "../../task-identity.mjs";
import { taskAuthority, taskKind, taskRepository } from "../../work-model.mjs";
import { busyTaskIds, declaredChecks } from "../delivery/delivery.mjs";
import { sessionUrl } from "../tick/notifications.mjs";
import { checkCommand } from "../workspace/repository-checks.mjs";
import { promptVersions, roleTarget } from "../flow/retro-memory.mjs";
import { listSessionBindings } from "../sessions/session-bindings.mjs";
import { fail } from "../store/store.mjs";
import path from "node:path";
import { specFolderPath } from "../specs/specs-path.mjs";

// Claimed leaves for a readiness query. A read-only database from before the
// session tables reads as having no claims.
export function claimedOrNone(store) {
  try {
    return busyTaskIds(store);
  } catch {
    return new Set();
  }
}

// Avoozl-recorded validation at a task's current commit (§5.2, R38.5): its
// integrated commit, else its delivery's, else the newest validated commit.
// Results come from validation records and checks-role verdicts at that
// commit; the newest result per check counts. Returns null unless every
// declared check passed there. With no declared checks, every check that ran
// at the commit must have passed.
export function validationAt(store, data, task) {
  const own = (table) => {
      try {
        return store.list(table);
      } catch {
        return [];
      }
    },
    records = own("evidence").filter(
      (e) =>
        e.kind === "command" &&
        typeof e.commit === "string" &&
        resolveTaskId(data, e.taskId) === task.id,
    ),
    delivery = own("task_deliveries").find((d) => d.taskId === task.id),
    commit =
      task.integration?.commit || delivery?.commit || records.at(-1)?.commit;
  if (!commit) return null;
  const results = [];
  records.forEach((e, index) => {
    if (e.commit === commit && Array.isArray(e.argv))
      results.push({
        command: e.argv.join(" "),
        exitCode: e.exitCode,
        at: e.endedAt || e.startedAt || "",
        index,
        id: e.id,
      });
  });
  for (const v of delivery?.verifications || [])
    if (
      (v.commit ?? delivery.commit) === commit &&
      (!v.role || v.role === "checks")
    )
      for (const entry of Array.isArray(v.checks) ? v.checks : [])
        if (typeof entry?.command === "string")
          results.push({
            command: entry.command,
            exitCode: entry.notRun ? null : entry.exitCode,
            at: v.at || "",
            index: records.length,
          });
  results.sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index);
  const latest = new Map();
  for (const result of results) latest.set(result.command, result);
  const declared = declaredChecks(
      task,
      store.get("repositories", taskRepository(task) || ""),
    ).map(checkCommand),
    checks = declared.length ? declared : [...latest.keys()];
  if (!checks.length || checks.some((c) => latest.get(c)?.exitCode !== 0))
    return null;
  return {
    commit,
    checks,
    evidenceIds: checks.map((c) => latest.get(c).id).filter(Boolean),
    summary: (
      `${checks.length} configured check${checks.length === 1 ? "" : "s"} passed at commit ${commit.slice(0, 12)}: ` +
      checks.join("; ")
    ).slice(0, 2000),
  };
}

// Operations that write a task row directly. A row whose authority is GitHub
// is a cache (design §3.2): its change goes to the issue through projection,
// and the next sync overwrites the row.
export const DIRECT_TASK_EDITS = new Set([
  "task.update",
  "task.archive",
  "task.unarchive",
  "task.accept",
  "task.merge",
  "task.supersede",
]);

export function refuseGitHubAuthority(data, name, input) {
  const ids =
    name === "task.merge"
      ? [input.targetId, ...(input.duplicateIds || [])]
      : [input.id];
  for (const id of ids) {
    const task = data.tasks.find((t) => t.id === resolveTaskId(data, id));
    if (!task || taskAuthority(task) !== "github") continue;
    const issue = task.github?.number
      ? ` issue ${task.github.repository}#${task.github.number}`
      : " its GitHub issue";
    const error = Error(
      `Task ${task.id} is owned by${issue}. Change the issue through projection: ` +
        (task.github?.origin === "design"
          ? "amend and approve its plan, then project it."
          : "edit the issue on GitHub, then sync."),
    );
    error.status = 409;
    error.code = "authority-github";
    error.route = "projection";
    throw error;
  }
}

// Refuse prerequisites that make `id` wait on itself through other tasks,
// naming the path, so a page or agent sees which link to drop. The store's
// validator still refuses a self edge and any cycle; this adds the path.
// Only blocking kinds count.
export function refuseCycle(data, id) {
  const next = new Map();
  for (const edge of data.edges) {
    if (edge.kind !== "requires" && edge.kind !== "sequence") continue;
    if (edge.from === edge.to) continue;
    if (!next.has(edge.from)) next.set(edge.from, []);
    next.get(edge.from).push(edge.to);
  }
  // Breadth-first from id along "runs before"; reaching id again is a cycle.
  const back = new Map(),
    queue = [id];
  while (queue.length) {
    const at = queue.shift();
    for (const to of next.get(at) || []) {
      if (to === id) {
        const path = [id];
        for (let step = at; step !== id; step = back.get(step)) path.push(step);
        path.push(id);
        path.reverse();
        const error = Error(
          `That prerequisite makes a cycle: ${path.join(" → ")}. Drop one of these links.`,
        );
        error.status = 409;
        error.code = "cycle";
        error.path = path;
        throw error;
      }
      if (!back.has(to)) {
        back.set(to, at);
        queue.push(to);
      }
    }
  }
}

// Which repositories have review roles (§5.2 Policy, task 9.1): a repository's
// own `reviewers` list replaces the workspace's. Takes readDeliveryPolicy's
// {status, delivery} wrapper and returns a predicate over repository names.
// Not delivery.mjs's reviewRoles(delivery, repository), which returns the list.
export function reviewRoles(policy) {
  const delivery = policy?.delivery;
  return (repository) => {
    const own = repository
        ? delivery?.repositories?.[repository]?.reviewers
        : undefined,
      list = own ?? delivery?.reviewers;
    return Array.isArray(list) && list.length > 0;
  };
}

// task.update must not skip the gates of §5.2 (R36.11, R38.4): a typed
// integration receipt or a complete status would meet completion with no
// verifier, review, or merge (F60).
export function refuseGateBypass(data, task, input, hasReviewers) {
  if (Object.hasOwn(input, "acceptFrom"))
    fail("acceptFrom changes only through plan approval.", 409);
  const typedIntegration = Object.hasOwn(input, "integration"),
    completes =
      Object.hasOwn(input, "status") &&
      input.status !== task.status &&
      statusComplete(data, input.status);
  if (task.acceptFrom === "validation") {
    if (typedIntegration || completes)
      fail(
        `Task ${task.id} completes only through Avoozl's validation and integration; a typed integration or complete status is refused.`,
        409,
      );
  }
  const leaf =
      taskKind(Object.hasOwn(input, "kind") ? { kind: input.kind } : task) ===
      "leaf",
    repository = Object.hasOwn(input, "repository")
      ? input.repository
      : taskRepository(task);
  if (leaf && (typedIntegration || completes) && hasReviewers(repository))
    fail(
      `Repository ${repository} has review roles; task ${task.id} completes only after its reviews and integration, not by a typed integration or complete status.`,
      409,
    );
}

// The fields a plan's Markdown writes on each task it makes: its title,
// description, acceptance and prerequisites. SQLite owns execution state;
// Markdown owns design prose, so task.update changes them only on a task
// no plan stands for. Status, notes and the rest stay editable.
const SPEC_TEXT = ["title", "summary", "acceptance", "requires", "sequence"];
const EDGE_FIELDS = new Set(["requires", "sequence"]);
export function refuseSpecText(store, task, input) {
  const plan = task.planId ? store.get("plans", task.planId) : null;
  if (!plan || plan.deletedAt) return;
  const changed = SPEC_TEXT.filter(
    (key) =>
      Object.hasOwn(input, key) &&
      (EDGE_FIELDS.has(key) ||
        JSON.stringify(input[key]) !== JSON.stringify(task[key])),
  );
  if (!changed.length) return;
  const name = plan.title ?? plan.id,
    error = Error(
      plan.spec
        ? `Task ${task.id} comes from spec ${plan.spec}, whose Markdown owns its ${changed.join(", ")}. Edit ${specFolderPath(store.getMeta?.("workspaceRepository")?.root ?? null, plan.spec)}tasks.md and approve the spec.`
        : `Task ${task.id} comes from plan ${name}, whose text owns its ${changed.join(", ")}. Edit the plan and approve it.`,
    );
  error.status = 409;
  error.code = "authority-spec";
  throw error;
}

export function repositoryBase(store, task, repositoryId) {
  if (typeof task.github?.url === "string") {
    try {
      const url = new URL(task.github.url);
      const marker = url.pathname.match(/\/(?:issues|pull)\/\d+(?:\/|$)/);
      if (marker) {
        url.pathname = url.pathname.slice(0, marker.index);
        url.search = "";
        url.hash = "";
        return url.href.replace(/\/$/, "");
      }
    } catch {}
  }
  const repository =
    task.github?.repository ||
    store
      .list("github_repositories")
      .find((entry) => entry.repositoryId === repositoryId)?.id ||
    store.get("repositories", repositoryId)?.github ||
    "";
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? `https://github.com/${repository}`
    : "";
}

export function taskLocalChanges(store, task, repositoryId, repositoryUrl) {
  const repository = store.get("repositories", repositoryId);
  if (!repository) return null;
  return {
    repositoryId,
    root: repository.root || "",
    branch: task.integration?.branch || "",
    repositoryUrl,
  };
}

export function taskCodeChanges(store, data, task, evidenceRecords) {
  const repositoryId = task.repositoryId || "",
    base = repositoryBase(store, task, repositoryId),
    commits = new Map(),
    pulls = new Map();
  const addCommit = (sha, source) => {
    if (typeof sha !== "string" || !/^[a-f0-9]{7,64}$/i.test(sha)) return;
    const existing = commits.get(sha);
    commits.set(sha, {
      sha,
      source: existing?.source || source,
      url: existing?.url || (base ? `${base}/commit/${sha}` : ""),
    });
  };
  const addPull = (value) => {
    if (typeof value === "string") value = { url: value };
    if (!value || typeof value.url !== "string" || !value.url) return;
    pulls.set(value.nodeId || value.url, {
      nodeId: value.nodeId || null,
      number: Number(value.number) || null,
      url: value.url,
      title: typeof value.title === "string" ? value.title : "",
      state: typeof value.state === "string" ? value.state : "",
      repository:
        typeof value.repository === "string"
          ? value.repository
          : task.github?.repository || "",
    });
  };
  addCommit(task.integration?.commit, "Integrated");
  for (const evidence of evidenceRecords)
    addCommit(
      evidence.commit,
      evidence.kind === "command" ? "Validated" : "Evidence",
    );
  for (const pull of task.github?.pullRequests || []) addPull(pull);
  for (const pull of task.pullRequests || []) addPull(pull);
  for (const receipt of store.list("receipts")) {
    if (
      typeof receipt.taskId === "string" &&
      resolveTaskId(data, receipt.taskId) === task.id &&
      typeof receipt.url === "string" &&
      /\/pull\/\d+(?:\/|$)/.test(receipt.url)
    )
      addPull(receipt);
  }
  const issueNumber = Number(task.github?.number) || null,
    issue = issueNumber
      ? {
          number: issueNumber,
          repository: task.github?.repository || "",
          url:
            task.github?.url || (base ? `${base}/issues/${issueNumber}` : ""),
        }
      : null;
  return {
    issue,
    commits: [...commits.values()],
    pullRequests: [...pulls.values()],
    local: taskLocalChanges(store, task, repositoryId, base),
  };
}

// The IDs an approval accepts new item text for (task.changed-text).
export function retitledInput(value) {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some((id) => typeof id !== "string" || id.length > 200)
  )
    fail("retitled is a list of task IDs.");
  return value;
}

// Review roles for the Settings page: the writer's model and each role, for
// the workspace and per repository. An invalid `delivery` block reads as its
// error, since Settings shows it rather than failing the page.
export function reviewSettings({ delivery, error = null } = {}) {
  const role = ({ id, focus, agent, model, distinctFrom }) => ({
    id,
    focus,
    agent,
    model: model ?? null,
    distinctFrom,
  });
  return {
    error,
    writerModel: delivery?.model ?? null,
    reviewers: (delivery?.reviewers || []).map(role),
    repositories: Object.fromEntries(
      Object.entries(delivery?.repositories || {})
        .filter(([, entry]) => entry.reviewers)
        .map(([id, entry]) => [id, entry.reviewers.map(role)]),
    ),
  };
}

// The built-in prompt version a newly bound session runs on (R68.12), kept
// on its binding so its attempt records it.
export function stampPrompts(store, result) {
  const binding = result?.binding,
    target = binding && roleTarget(binding.role);
  if (!target || !result.changed || binding.prompts) return result;
  const version = promptVersions(store)[target],
    next = { ...binding, prompts: { [target]: version } };
  store.put("session_bindings", next);
  return { ...result, binding: next };
}

// The Kiro Crew sessions bound to one task, with a link to each.
export function kiroCrewSessions(store, taskId) {
  return listSessionBindings(store)
    .filter((binding) => binding.taskId === taskId)
    .map((binding) => ({
      slot: binding.slot,
      role: binding.role,
      attempt: binding.attempt,
      status: binding.status || null,
      url: sessionUrl(binding.slot),
    }));
}
