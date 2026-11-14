// Crew Mode runner support (design §5.1, task 2.14). A Crew Mode conductor
// drives rounds from `next` and reports through `claim` and plans_report; the
// tick still verifies and integrates. Every write goes through
// Operations.execute, so the conductor's CLI, the MCP server and the app
// backend share one writer.
import fs from "node:fs";
import path from "node:path";
import { fail } from "./store.mjs";
import {
  callerSlot,
  claimedTaskIds,
  DELIVERY_DEFAULTS,
  leafBrief,
  liveAttempt,
  prepareWorktree,
  readyLeaves,
  briefAllowed,
  shipMode,
} from "./delivery.mjs";
import {
  isLinkedBranchLeaf,
  LINKED_BRANCHES,
  linkedBranch,
} from "./github-plans-repo.mjs";
import { sessionUrl } from "./notifications.mjs";
import { conductorFeedback } from "./github-feedback.mjs";
import { bindSession, listSessionBindings } from "./session-bindings.mjs";
import { readDeliveryPolicy } from "./tick.mjs";
import { readGitHubPolicyOrNull } from "./github-policy.mjs";
import { workspaceRepositories } from "./workspace-repositories.mjs";
import { isArchivedTask } from "../browse-model.mjs";
import { statusComplete } from "../query.mjs";
import {
  completionReached,
  isGate,
  isManual,
  supersedingTask,
  taskKind,
  taskRepository,
  taskRoute,
} from "../work-model.mjs";

const BLOCKING = new Set(["requires", "sequence"]);
const NEEDS_YOU_STATUSES = new Set(["blocked", "review"]);

// What a conductor does with the buckets, returned with every answer.
export const RUNNER_RULE =
  "Start every task in ready. Wait while running is not empty. Send a running item's feedback to its worker once per round. Ask the user about needsYou. Stop only when every leaf is done.";

const effective = (policy) =>
  policy?.delivery || { ...DELIVERY_DEFAULTS, repositories: {} };

const title = (task) => task.title || task.id;

// The newest worker binding per task, any source.
function newestWorkers(bindings) {
  const newest = new Map();
  for (const binding of bindings)
    if (binding.role === "worker") {
      const seen = newest.get(binding.taskId);
      if (!seen || seen.attempt < binding.attempt)
        newest.set(binding.taskId, binding);
    }
  return newest;
}

const phase = (binding, delivery) =>
  delivery?.state === "done"
    ? "verifying"
    : delivery?.state === "verified"
      ? "integrating"
      : binding && liveAttempt(binding)
        ? "working"
        : "recording";

// plans_next / `avoozl next`: every local leaf, and with a plans-repo
// `github` policy every plans-repo leaf, in exactly one bucket. A plans-repo
// leaf is ready only once the tick has created its linked branch.
export function nextView(store, { policy, github = null }) {
  const data = store.read(),
    delivery = effective(policy),
    bindings = listSessionBindings(store),
    newest = newestWorkers(bindings),
    claimed = claimedTaskIds(store, bindings),
    deliveries = new Map(
      store.list("task_deliveries").map((d) => [d.taskId, d]),
    ),
    startable = new Map(
      readyLeaves(store, delivery, { github }).map((leaf) => [
        leaf.task.id,
        leaf,
      ]),
    ),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    complete = (status) => statusComplete(data, status);
  const result = {
    runner: delivery.runner,
    policy: policy?.status || "absent",
    rule: RUNNER_RULE,
    ready: [],
    running: [],
    waiting: [],
    needsYou: [],
    done: [],
  };
  if (policy?.status === "invalid")
    result.needsYou.push({
      reason: "policy",
      detail: `.avoozl.json is invalid: ${policy.error}`,
      link: sessionUrl(null),
    });
  const blockersOf = (task) =>
    data.edges
      .filter(
        (edge) =>
          edge.to === task.id &&
          BLOCKING.has(edge.kind) &&
          !completionReached(
            supersedingTask(byId, edge.from),
            edge.condition,
            complete,
          ),
      )
      .map((edge) => {
        const from = supersedingTask(byId, edge.from);
        return {
          id: from?.id ?? edge.from,
          title: from ? title(from) : edge.from,
          ...(edge.condition ? { condition: edge.condition } : {}),
        };
      });
  const leaves = data.tasks.filter(
    (task) =>
      taskKind(task) === "leaf" &&
      (taskRoute(task) === "local" || isLinkedBranchLeaf(task, github)) &&
      !isArchivedTask(data, task) &&
      !task.source?.removed,
  );
  for (const task of leaves) {
    const binding = newest.get(task.id),
      record = deliveries.get(task.id),
      item = { id: task.id, title: title(task) },
      session = binding
        ? {
            slot: binding.slot,
            attempt: binding.attempt,
            link: sessionUrl(binding.slot),
          }
        : {};
    if (complete(task.status) || completionReached(task, undefined, complete)) {
      result.done.push(item);
      continue;
    }
    const question =
      binding &&
      liveAttempt(binding) &&
      binding.report?.kind === "question" &&
      binding.report.text;
    const linked = isLinkedBranchLeaf(task, github),
      branchError = linked && store.get(LINKED_BRANCHES, task.id)?.error;
    const reason = task.decision
      ? ["decision", String(task.decision)]
      : branchError
        ? ["linked-branch", branchError]
        : record?.state === "decision"
          ? [
              "failed",
              record.cause || record.attempts.at(-1)?.cause || "stopped",
            ]
          : question
            ? ["question", question]
            : NEEDS_YOU_STATUSES.has(task.status) || task.needsReview
              ? [task.status === "blocked" ? "blocked" : "review", task.status]
              : null;
    if (reason) {
      result.needsYou.push({
        ...item,
        reason: reason[0],
        detail: reason[1],
        ...session,
      });
      continue;
    }
    // A manual leaf is never started (R61.10): once its blockers hold it
    // waits for a person, never in ready.
    if (isManual(task) && !blockersOf(task).length) {
      result.needsYou.push({
        ...item,
        reason: "manual",
        detail: `Waiting for a person: ${title(task)}`,
      });
      continue;
    }
    // A gate is read by its plugin, never started (RC23.3): it waits.
    if (isGate(task)) {
      const blockedBy = blockersOf(task);
      result.waiting.push({
        ...item,
        blockedBy,
        ...(blockedBy.length ? {} : { reason: "tracker gate" }),
      });
      continue;
    }
    if (claimed.has(task.id)) {
      // Pull request feedback for the conductor to relay (§4.13, R54.7).
      const feedback =
        binding && conductorFeedback(store, task.id, binding.slot);
      result.running.push({
        ...item,
        phase: phase(binding, record),
        ...session,
        ...(feedback ? { feedback } : {}),
      });
      continue;
    }
    const leaf = startable.get(task.id),
      brief = leaf
        ? leafBrief(store, data, leaf, {
            relay: true,
            ship: shipMode(delivery, task),
          })
        : null;
    // A brief a content rule blocks is not offered (§4.9); its decision
    // shows the task under needsYou in the Conflicts view.
    if (
      leaf &&
      briefAllowed(store, {
        taskId: task.id,
        role: "worker",
        brief,
        repository: leaf.project.repository || leaf.project.id,
      })
    ) {
      result.ready.push({
        ...item,
        attempt: leaf.attempt,
        repository: leaf.project.id,
        checkout: leaf.project.root,
        sessionTitle: `avoozl:${task.id} ${task.title || ""}`
          .trim()
          .slice(0, 200),
        brief,
      });
      continue;
    }
    const blockedBy = blockersOf(task);
    result.waiting.push({
      ...item,
      blockedBy,
      ...(blockedBy.length
        ? {}
        : {
            reason: ["draft", "deferred"].includes(task.status)
              ? task.status
              : task.planArchived
                ? "plan archived"
                : !taskRepository(task)
                  ? "no repository"
                  : linked && !linkedBranch(store, task.id)
                    ? "linked branch"
                    : "capacity",
          }),
    });
  }
  result.finished = leaves.length > 0 && result.done.length === leaves.length;
  return result;
}

// runner.claim / `avoozl claim`: record that a Crew Mode conductor started a
// worker session on a ready leaf, then prepare the leaf's worktree. The
// readiness check and the binding are one transaction, so a claimed task never
// appears ready twice and cannot be claimed twice.
export async function claimTask(
  store,
  input = {},
  { caller, local, policy, github = null },
) {
  const conductor = callerSlot(caller) || (local ? "cli" : null);
  if (!conductor)
    fail(
      "A claim needs the conductor's session identity from the Kiro Crew gateway, or the local command line.",
      403,
    );
  if (policy?.status !== "loaded" || policy.delivery?.runner !== "crew-mode")
    fail(
      'Set "delivery": {"runner": "crew-mode"} in .avoozl.json before a Crew Mode conductor claims tasks.',
      409,
    );
  const task = store.read().tasks.find((t) => t.id === input.taskId),
    { binding, changed } = bindSession(
      store,
      {
        taskId: input.taskId,
        slot: input.slot,
        role: "worker",
        // The model the conductor opened the worker on; a review role with
        // distinctFrom model waits for a person when it is missing (§5.2).
        ...(input.model !== undefined ? { model: input.model } : {}),
        title:
          input.title ??
          (task
            ? `avoozl:${task.id} ${task.title || ""}`.trim().slice(0, 200)
            : undefined),
      },
      {
        conductor,
        guard: (taskId) => {
          if (
            !readyLeaves(store, policy.delivery, { github }).some(
              (leaf) => leaf.task.id === taskId,
            )
          )
            fail(
              `${taskId} is not ready to start: it is claimed, blocked, or over capacity. Run next again.`,
              409,
            );
        },
      },
    );
  // A linked-branch worker fetches the branch the tick created; a local
  // worktree on the same branch name would only get in its way.
  const branch = linkedBranch(store, binding.taskId);
  if (branch && isLinkedBranchLeaf(task, github))
    return {
      binding,
      changed,
      link: sessionUrl(binding.slot),
      linkedBranch: { name: branch.name, baseBranch: branch.baseBranch },
    };
  let worktree = null,
    worktreeError = null;
  try {
    worktree = await prepareWorktree(store, { taskId: binding.taskId });
  } catch (error) {
    worktreeError = error.message;
  }
  return {
    binding,
    changed,
    link: sessionUrl(binding.slot),
    worktree: worktree && { path: worktree.path, branch: worktree.branch },
    ...(worktreeError ? { worktreeError } : {}),
  };
}

// The hook event a Kiro Crew AgentSpawn hook writes to stdin, or {} when it
// writes none. Waits at most `ms` for stdin to end, so a hook never hangs.
export async function hookEvent(stream, { ms = 1000, max = 1_000_000 } = {}) {
  if (stream.isTTY) return {};
  const text = await new Promise((resolve) => {
    let value = "";
    const done = () => {
      clearTimeout(timer);
      stream.off("data", data);
      stream.off("end", done);
      stream.off("error", done);
      stream.pause?.();
      resolve(value);
    };
    const data = (chunk) => {
      value += chunk;
      if (value.length > max) done();
    };
    const timer = setTimeout(done, ms);
    stream.on("data", data);
    stream.once("end", done);
    stream.once("error", done);
  });
  try {
    const event = JSON.parse(text || "{}");
    return event && typeof event === "object" ? event : {};
  } catch {
    return {};
  }
}

const STEERING = new URL("./runner/avoozl-runner.md", import.meta.url);

function within(directory, root) {
  try {
    const a = fs.realpathSync.native(directory),
      b = fs.realpathSync.native(root);
    return a === b || a.startsWith(b + path.sep);
  } catch {
    return false;
  }
}

// What the AgentSpawn hook prints: the runner steering file and the current
// bucket counts, or "" unless delivery.runner is crew-mode and the session
// starts in the workspace or one of its registered checkouts. Reads only.
export function runnerHookBrief(store, { workspaceRoot, cwd, command }) {
  const policy = readDeliveryPolicy(workspaceRoot);
  if (policy.status !== "loaded" || policy.delivery?.runner !== "crew-mode")
    return "";
  const roots = [
    workspaceRoot,
    ...workspaceRepositories(store).map((entry) => entry.localCheckout),
  ].filter(Boolean);
  if (!roots.some((root) => within(cwd, root))) return "";
  const view = nextView(store, {
      policy,
      github: readGitHubPolicyOrNull(workspaceRoot),
    }),
    counts = ["ready", "running", "waiting", "needsYou", "done"]
      .map((bucket) => `${view[bucket].length} ${bucket}`)
      .join(", ");
  return [
    fs.readFileSync(STEERING, "utf8").trimEnd(),
    "",
    `AVOOZL is \`${command}\` in this workspace.`,
    `Right now: ${counts}. Run \`${command} next\` for the details.`,
    "",
  ].join("\n");
}
