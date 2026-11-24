// Checks and views the operation handlers share.
import { statusComplete } from "../../model.ts";
import { resolveTaskId } from "../../task-identity.ts";
import { taskAuthority, taskKind, taskRepository } from "../../work-model.ts";
import { busyTaskIds, declaredChecks } from "../delivery/delivery.ts";
import { sessionUrl } from "../tick/notifications.ts";
import { checkCommand } from "../workspace/repository-checks.ts";
import { promptVersions, roleTarget } from "../agents/prompts.ts";
import {
  listSessionBindings,
  type SessionBinding,
} from "../sessions/session-bindings.ts";
import type { Snapshot, Task } from "../../types.ts";
import { fail } from "../store/store.ts";
import type { Store } from "../store/store.ts";
import path from "node:path";
import { specFolderPath } from "../specs/specs-path.ts";
import { taskFile } from "../specs/spec-tasks.ts";

// Claimed leaves for a readiness query. A read-only database from before the
// session tables reads as having no claims.
export function claimedOrNone(store: Store): Set<string> {
  try {
    return busyTaskIds(store);
  } catch {
    return new Set<string>();
  }
}

// Avoozl-recorded validation at a task's current commit (§5.2, R38.5): its
// integrated commit, else its delivery's, else the newest validated commit.
// Results come from validation records and checks-role verdicts at that
// commit; the newest result per check counts. Returns null unless every
// declared check passed there. With no declared checks, every check that ran
// at the commit must have passed.
// An evidence row and a delivery row, as far as validation reads them.
type EvidenceRow = {
  id: string;
  kind?: string;
  commit?: string;
  taskId?: string;
  argv?: unknown;
  exitCode?: number | null;
  startedAt?: string;
  endedAt?: string;
};
type DeliveryRow = {
  id: string;
  taskId?: string;
  commit?: string;
  verifications?: {
    commit?: string;
    role?: string;
    at?: string;
    checks?: unknown;
  }[];
};
// One check result at a commit, in the order it was recorded.
type Ran = {
  command: string;
  exitCode: number | null | undefined;
  at: string;
  index: number;
  id?: string;
};

export function validationAt(store: Store, data: Snapshot, task: Task) {
  const own = <T extends { id: string }>(table: string): T[] => {
      try {
        return store.list<T>(table);
      } catch {
        return [];
      }
    },
    records = own<EvidenceRow>("evidence").filter(
      (e) =>
        e.kind === "command" &&
        typeof e.commit === "string" &&
        resolveTaskId(data, String(e.taskId)) === task.id,
    ),
    delivery = own<DeliveryRow>("task_deliveries").find(
      (d) => d.taskId === task.id,
    ),
    commit =
      task.integration?.commit || delivery?.commit || records.at(-1)?.commit;
  if (!commit) return null;
  const results: Ran[] = [];
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
      (v.commit ?? delivery?.commit) === commit &&
      (!v.role || v.role === "checks")
    )
      // The stored delivery row: its checks as the verifier wrote them.
      for (const entry of (Array.isArray(v.checks) ? v.checks : []) as {
        command?: unknown;
        notRun?: unknown;
        exitCode?: number | null;
      }[])
        if (typeof entry?.command === "string")
          results.push({
            command: entry.command,
            exitCode: entry.notRun ? null : entry.exitCode,
            at: v.at || "",
            index: records.length,
          });
  results.sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index);
  const latest = new Map<string, Ran>();
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
    evidenceIds: checks.flatMap((c) => latest.get(c)?.id ?? []),
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
]);

export function refuseGitHubAuthority(
  data: Snapshot,
  _name: string,
  input: Record<string, unknown>,
) {
  for (const id of [input.id]) {
    const task = data.tasks.find(
      (t) => t.id === resolveTaskId(data, String(id)),
    );
    if (!task || taskAuthority(task) !== "github") continue;
    const issue = task.github?.number
      ? ` issue ${task.github.repository}#${task.github.number}`
      : " its GitHub issue";
    throw Object.assign(
      Error(
        `Task ${task.id} is owned by${issue}. Change the issue through projection: ` +
          (task.github?.origin === "design"
            ? "amend and approve its plan, then project it."
            : "edit the issue on GitHub, then sync."),
      ),
      { status: 409, code: "authority-github", route: "projection" },
    );
  }
}

// Refuse prerequisites that make `id` wait on itself through other tasks,
// naming the path, so a page or agent sees which link to drop. The store's
// validator still refuses a self edge and any cycle; this adds the path.
// Only blocking kinds count.
export function refuseCycle(data: Snapshot, id: string) {
  const next = new Map<string, string[]>();
  for (const edge of data.edges) {
    if (edge.kind !== "requires" && edge.kind !== "sequence") continue;
    if (edge.from === edge.to) continue;
    if (!next.has(edge.from)) next.set(edge.from, []);
    next.get(edge.from)?.push(edge.to);
  }
  // Breadth-first from id along "runs before"; reaching id again is a cycle.
  const back = new Map<string, string>(),
    queue = [id];
  while (queue.length) {
    const at = queue.shift() ?? id;
    for (const to of next.get(at) || []) {
      if (to === id) {
        const path = [id];
        for (let step = at; step !== id; step = back.get(step) ?? id)
          path.push(step);
        path.push(id);
        path.reverse();
        throw Object.assign(
          Error(
            `That prerequisite makes a cycle: ${path.join(" → ")}. Drop one of these links.`,
          ),
          { status: 409, code: "cycle", path },
        );
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
// The delivery block fields review roles read.
type ReviewPolicy = {
  delivery?: {
    reviewers?: unknown;
    repositories?: Record<string, { reviewers?: unknown }>;
  } | null;
} | null;

export function reviewRoles(policy: ReviewPolicy) {
  const delivery = policy?.delivery;
  return (repository: unknown) => {
    const own =
        typeof repository === "string" && repository
          ? delivery?.repositories?.[repository]?.reviewers
          : undefined,
      list = own ?? delivery?.reviewers;
    return Array.isArray(list) && list.length > 0;
  };
}

// task.update must not skip the gates of §5.2 (R36.11, R38.4): a typed
// integration receipt or a complete status would meet completion with no
// verifier, review, or merge (F60).
export function refuseGateBypass(
  data: Snapshot,
  task: Task,
  input: Record<string, unknown>,
  hasReviewers: (repository: unknown) => boolean,
) {
  const typedIntegration = Object.hasOwn(input, "integration"),
    completes =
      Object.hasOwn(input, "status") &&
      input.status !== task.status &&
      statusComplete(data, String(input.status));
  const leaf =
      taskKind(
        Object.hasOwn(input, "kind") ? { kind: String(input.kind) } : task,
      ) === "leaf",
    repository = Object.hasOwn(input, "repository")
      ? input.repository
      : taskRepository(task);
  if (leaf && (typedIntegration || completes) && hasReviewers(repository))
    fail(
      `Repository ${String(repository)} has review roles; task ${task.id} completes only after its reviews and integration, not by a typed integration or complete status.`,
      409,
    );
}

// The fields a plan's Markdown writes on each task it makes: its title,
// description, acceptance and prerequisites. SQLite owns execution state;
// Markdown owns design prose, so task.update changes them only on a task
// no plan stands for. Status, notes and the rest stay editable.
const SPEC_TEXT = ["title", "summary", "acceptance", "requires", "sequence"];
const EDGE_FIELDS = new Set(["requires", "sequence"]);
export function refuseSpecText(
  store: Store,
  task: Task,
  input: Record<string, unknown>,
) {
  const plan = task.planId
    ? store.get<{
        id: string;
        title?: string;
        spec?: string;
        specFolder?: string;
        deletedAt?: string;
        files?: Record<string, string>;
      }>("plans", task.planId)
    : null;
  if (!plan || plan.deletedAt) return;
  const changed = SPEC_TEXT.filter(
    (key) =>
      Object.hasOwn(input, key) &&
      (EDGE_FIELDS.has(key) ||
        JSON.stringify(input[key]) !== JSON.stringify(task[key])),
  );
  if (!changed.length) return;
  const name = plan.title ?? plan.id;
  throw Object.assign(
    Error(
      plan.spec
        ? `Task ${task.id} comes from spec ${plan.spec}, whose Markdown owns its ${changed.join(", ")}. Edit ${plan.specFolder ?? specFolderPath(store.getMeta<{ root?: string }>("workspaceRepository")?.root ?? null, plan.spec)}${taskFile(plan.files ?? {})} and approve the spec.`
        : `Task ${task.id} comes from plan ${name}, whose text owns its ${changed.join(", ")}. Edit the plan and approve it.`,
    ),
    { status: 409, code: "authority-spec" },
  );
}

function repositoryBase(store: Store, task: Task, repositoryId: string) {
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
      .list<{ id: string; repositoryId?: string }>("github_repositories")
      .find((entry) => entry.repositoryId === repositoryId)?.id ||
    store.get<{ id: string; github?: string }>("repositories", repositoryId)
      ?.github ||
    "";
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? `https://github.com/${repository}`
    : "";
}

function taskLocalChanges(
  store: Store,
  task: Task,
  repositoryId: string,
  repositoryUrl: string,
) {
  const repository = store.get<{ id: string; root?: string }>(
    "repositories",
    repositoryId,
  );
  if (!repository) return null;
  return {
    repositoryId,
    root: repository.root || "",
    branch: String(task.integration?.branch || ""),
    repositoryUrl,
  };
}

// A pull request link as a task, receipt or evidence names it.
type PullLike = {
  url?: unknown;
  nodeId?: unknown;
  number?: unknown;
  title?: unknown;
  state?: unknown;
  repository?: unknown;
};
// Each item of a list field, or none when it is not a list.
const items = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export function taskCodeChanges(
  store: Store,
  data: Snapshot,
  task: Task,
  evidenceRecords: {
    commit?: unknown;
    kind?: string;
    [key: string]: unknown;
  }[],
) {
  const repositoryId = task.repositoryId || "",
    base = repositoryBase(store, task, repositoryId),
    commits = new Map<string, { sha: string; source: string; url: string }>(),
    pulls = new Map<
      string,
      {
        nodeId: string | null;
        number: number | null;
        url: string;
        title: string;
        state: string;
        repository: string;
      }
    >();
  const addCommit = (sha: unknown, source: string) => {
    if (typeof sha !== "string" || !/^[a-f0-9]{7,64}$/i.test(sha)) return;
    const existing = commits.get(sha);
    commits.set(sha, {
      sha,
      source: existing?.source || source,
      url: existing?.url || (base ? `${base}/commit/${sha}` : ""),
    });
  };
  const addPull = (given: unknown) => {
    const value: PullLike | null =
      typeof given === "string"
        ? { url: given }
        : given && typeof given === "object"
          ? Object.fromEntries(Object.entries(given))
          : null;
    if (!value || typeof value.url !== "string" || !value.url) return;
    const nodeId = typeof value.nodeId === "string" ? value.nodeId : null;
    pulls.set(nodeId || value.url, {
      nodeId,
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
  for (const pull of items(task.github?.pullRequests)) addPull(pull);
  for (const pull of items(task.pullRequests)) addPull(pull);
  for (const receipt of store.list<{
    id: string;
    taskId?: unknown;
    url?: unknown;
  }>("receipts")) {
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
export function retitledInput(value: unknown): string[] {
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
// One review role as the delivery block names it.
type Reviewer = {
  id: string;
  focus?: unknown;
  agent?: unknown;
  model?: string | null;
  distinctFrom?: unknown;
};

export function reviewSettings({
  delivery,
  error = null,
}: {
  delivery?: {
    model?: string | null;
    reviewers?: Reviewer[];
    repositories?: Record<string, { reviewers?: Reviewer[] }>;
  } | null;
  error?: string | null;
} = {}) {
  const role = ({ id, focus, agent, model, distinctFrom }: Reviewer) => ({
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
        .map(([id, entry]) => [id, (entry.reviewers ?? []).map(role)]),
    ),
  };
}

// The built-in prompt version a newly bound session runs on (R68.12), kept
// on its binding so its attempt records it.
export function stampPrompts<
  R extends {
    binding?: SessionBinding | null;
    changed?: boolean;
    [key: string]: unknown;
  },
>(store: Store, result: R | null) {
  const binding = result?.binding,
    target = binding && roleTarget(binding.role);
  if (!target || !result?.changed || binding.prompts) return result;
  const version = promptVersions()[target],
    next = { ...binding, prompts: { [target]: version } };
  store.put("session_bindings", next);
  return { ...result, binding: next };
}

// The Kiro Crew sessions bound to one task, with a link to each.
export function kiroCrewSessions(store: Store, taskId: string) {
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
