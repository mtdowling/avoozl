// Read models for the app page's Graph, Delivery and Conflicts views (§8).
// Each one reads the store and writes nothing, so all three classify as
// `observe`. Old or read-only workspaces may lack newer tables; those read as
// empty rather than failing the view.
import { queryTasks, reviewSettled, statusComplete } from "../model.mjs";
import {
  completionReached,
  pluginId,
  supersedingTask,
  taskAuthority,
  taskCompletion,
  taskKind,
  taskRepository,
  taskRoute,
} from "../work-model.mjs";
import { workspaceRepositories } from "./workspace-repositories.mjs";
import { FINAL_STATUSES } from "./session-bindings.mjs";
import {
  claimedTaskIds,
  deliveryFindings,
  dispatchOrder,
  startNowIds,
} from "./delivery.mjs";
import { sessionUrl } from "./notifications.mjs";
import { projectItemRecords } from "./github-project.mjs";
import { FEEDBACK, feedbackSummary } from "./github-feedback.mjs";
import { remoteLeaf, routeNeedsYou } from "./routes.mjs";
import { pluginHealth } from "./plugin-session.mjs";
import { taskSourceRefs } from "../task-identity.mjs";
import { taskFlow } from "./flow.mjs";
import { avoozlState } from "../delivery-lanes.mjs";
import { attachLink } from "./routing.mjs";

const BLOCKING = new Set(["requires", "sequence"]);
const ACTIVE_RUNS = new Set([
  "starting",
  "running",
  "waiting-input",
  "waiting-approval",
]);
const DELIVERY_STATUSES = new Set(["running", "review", "failed"]);
// Managed fields a person's choice can settle (github.conflict.resolve).
const RESOLVABLE_FIELDS = new Set(["title", "body", "labels", "blockers"]);

// Rows of a table this workspace may not have yet: a database that predates
// it, or a table another task adds later.
function optionalList(store, table) {
  try {
    return store.list(table);
  } catch {
    return [];
  }
}

function optionalGet(store, table, id) {
  try {
    return store.get(table, id);
  } catch {
    return null;
  }
}

function claimedLeaves(store) {
  try {
    return claimedTaskIds(store);
  } catch {
    return new Set();
  }
}

function projectBoard(store) {
  try {
    return projectItemRecords(store);
  } catch {
    return new Map();
  }
}

function list(value) {
  if (value === undefined || value === null || value === "") return null;
  const items = (Array.isArray(value) ? value : [value]).map(String);
  return items.length ? new Set(items) : null;
}

function issueLink(task) {
  const github = task.github;
  if (!github || !(github.number || github.nodeId)) return null;
  return {
    number: github.number ?? null,
    url: typeof github.url === "string" ? github.url : null,
    repository: github.repository ?? null,
  };
}

// Who owns a task, for every view (R28.5): a github task carries its issue
// link; a local task has none and shows "local".
export function ownership(task) {
  if (!task) return {};
  return {
    authority: taskAuthority(task),
    issue: issueLink(task),
    ...(task.tracker?.link ? { record: task.tracker.link } : {}),
  };
}

// What a person must do for a task before it moves, with a link: a remote
// leaf waiting on its route, or a task whose plugin is parked (R22.7, R34.7).
function needsYou(task, submissions, health) {
  const tracker = pluginId(taskAuthority(task)),
    trackerHealth = tracker ? health.get(tracker) : null;
  if (trackerHealth?.state === "unavailable")
    return {
      reason: `Plugin unavailable: ${trackerHealth.reason}`,
      link: task.tracker?.link ?? null,
    };
  if (!remoteLeaf(task)) return null;
  return routeNeedsYou(
    submissions.get(task.id),
    health.get(pluginId(task.route)),
  );
}

// A task waits for review: flagged, and not done, recorded or archived.
function needsTextReview(data, task) {
  return Boolean(task.needsReview) && !reviewSettled(data, task);
}

// Tasks with a live Avoozl session (worker, checks, reviewer, planner):
// bound, not closed, lost, gone or dismissed. The Graph's Running state and
// the Dashboard's In flight list both read this, so they always agree.
function liveSessions(store) {
  const ids = new Set();
  for (const row of optionalList(store, "session_bindings"))
    if (
      typeof row?.taskId === "string" &&
      !FINAL_STATUSES.has(row.status) &&
      row.status !== "gone" &&
      !row.dismissedAt
    )
      ids.add(row.taskId);
  return ids;
}

// Status `review` or `running` with no live session and no delivery under
// way: set by hand (an old import, an edit) or left behind by a session
// that ended, so nothing runs and there is nothing to attach to. The
// runner already counts status review as needing a person; the views say
// so plainly instead of drawing it as in progress. Returns the status, or
// null.
function statusWithoutSession(task, live, claimed) {
  return ["review", "running"].includes(task.status) &&
    !live.has(task.id) &&
    !claimed.has(task.id) &&
    !task.githubVerdict?.reviews
    ? task.status
    : null;
}

// The plain reason for a status with no session behind it.
export const noSessionLine = (status) =>
  status === "running"
    ? "Marked running, but no session is running"
    : "Marked in review, but no review is running";

// The archived plans, and the one a task belongs to (or null). Views mark
// archived work with it; the page hides it unless Show archived is on.
export function archivedPlanOf(store) {
  const archived = optionalList(store, "plans").filter(
    (plan) => plan.archivedAt && !plan.deletedAt,
  );
  if (!archived.length) return () => null;
  return (task) =>
    task.planArchived ||
    archived.find((plan) =>
      inPlan(task, { plan: plan.id, spec: plan.spec || null }),
    )?.id ||
    null;
}

// Tasks waiting for review, one item per plan, spec folder or document, so
// a plan move that touches 70 tasks is one thing to look at, not 70.
export function reviewGroups(store, data) {
  const plans = new Map(
      optionalList(store, "plans").map((plan) => [plan.id, plan]),
    ),
    groups = new Map();
  for (const task of data.tasks) {
    if (!needsTextReview(data, task)) continue;
    const spec = specOf(task),
      document = taskSourceRefs(task)[0]?.document ?? null,
      [key, name] = task.planId
        ? [`plan:${task.planId}`, plans.get(task.planId)?.title || task.planId]
        : spec
          ? [`spec:${spec}`, spec]
          : document
            ? [`doc:${document}`, document]
            : ["none", "no plan"];
    if (!groups.has(key)) groups.set(key, { key, name, tasks: [] });
    groups.get(key).tasks.push({
      id: task.id,
      title: task.title ?? task.id,
      status: task.status ?? null,
      ...ownership(task),
    });
  }
  return [...groups.values()]
    .sort((a, b) => b.tasks.length - a.tasks.length || a.name.localeCompare(b.name))
    .map((group) => ({
      kind: "review",
      id: `review:${group.key}`,
      taskId: null,
      plan: group.name,
      title: `Review ${group.tasks.length} ${group.tasks.length === 1 ? "task" : "tasks"} in ${group.name}: their design text changed`,
      detail:
        "Each is new, or its own text in the plan changed since it was last reviewed. None starts until you mark it reviewed.",
      tasks: group.tasks,
    }));
}

// Tasks and blocking edges, filtered by epic, repository and status. Edges are
// kept only when both ends are shown. `ready` uses the same rule as `queue`.
export function graphView(store, data, input = {}) {
  const epics = list(input.epic),
    repositories = list(input.repository),
    statuses = list(input.status),
    registered = workspaceRepositories(store).map((entry) => entry.id),
    ready = new Set(
      queryTasks(data, {
        scope: "all",
        repositories: registered,
        claimed: claimedLeaves(store),
        q: "ready:true",
      }).map((task) => task.id),
    ),
    complete = (status) => statusComplete(data, status),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    claimed = claimedLeaves(store),
    board = projectBoard(store),
    submissions = new Map(
      optionalList(store, "route_submissions").map((row) => [row.taskId, row]),
    ),
    health = pluginHealth(store),
    live = liveSessions(store),
    archivedOf = archivedPlanOf(store),
    counts = new Map();
  // One state per node for the Graph drawing. Needs-you comes first among
  // open tasks so a person sees it even on a running or deferred task.
  const state = (task) => {
    if (complete(task.status)) return "done";
    if (
      task.decision ||
      task.status === "blocked" ||
      statusWithoutSession(task, live, claimed) ||
      needsYou(task, submissions, health)
    )
      return "needs-you";
    if (
      task.status === "deferred" ||
      task.planArchived ||
      board.get(task.id)?.paused
    )
      return "deferred";
    // Running only while a session is live; a delivery between sessions
    // (the tick opens the next one) waits.
    if (live.has(task.id)) return "running";
    return ready.has(task.id) ? "ready" : "waiting";
  };
  for (const task of data.tasks)
    counts.set(task.epic ?? null, (counts.get(task.epic ?? null) || 0) + 1);
  const scope =
    input.plan || input.spec
      ? { plan: input.plan || null, spec: input.spec || null }
      : null;
  const shown = data.tasks.filter(
    (task) =>
      (!scope || inPlan(task, scope)) &&
      (!epics || epics.has(String(task.epic))) &&
      (!repositories || repositories.has(String(taskRepository(task)))) &&
      (!statuses || statuses.has(String(task.status))),
  );
  const ids = new Set(shown.map((task) => task.id)),
    // Each task's place in the tick's dispatch order (rank, then graph).
    order = new Map(
      [...data.tasks]
        .sort(dispatchOrder(data, startNowIds(store)))
        .map((task, i) => [task.id, i]),
    );
  return {
    revision: data.revision,
    epics: (data.epics || []).map((epic) => ({
      id: epic.id,
      title: epic.title ?? epic.id,
      count: counts.get(epic.id) || 0,
    })),
    statuses: (data.statuses || []).map((status) => ({
      id: status.id,
      label: status.label ?? status.id,
      complete: Boolean(status.complete),
    })),
    repositories: registered,
    total: data.tasks.length,
    tasks: shown.map((task) => ({
      id: task.id,
      title: task.title ?? task.id,
      epic: task.epic ?? null,
      planId: task.planId ?? null,
      spec: specOf(task),
      order: order.get(task.id),
      kind: taskKind(task),
      route: taskRoute(task),
      completion: taskCompletion(task),
      repository: taskRepository(task),
      status: task.status ?? null,
      complete: complete(task.status),
      ready: ready.has(task.id),
      state: state(task),
      // Waits for review because its own plan text changed; shown as a
      // badge, and once per plan in Conflicts, not as needs-you.
      review: needsTextReview(data, task),
      decision: task.decision ?? null,
      needsYou: needsYou(task, submissions, health),
      // Status review with no session, run or delivery behind it.
      noSession: statusWithoutSession(task, live, claimed),
      handSetReview: statusWithoutSession(task, live, claimed) !== null,
      nextAction: task.nextAction ?? null,
      // The archived plan this task belongs to; the page hides it by default.
      planArchived: archivedOf(task),
      ...ownership(task),
    })),
    edges: data.edges
      .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
      .map((edge) => ({
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        condition: edge.condition ?? null,
        blocking: BLOCKING.has(edge.kind),
        satisfied: completionReached(
          supersedingTask(byId, edge.from),
          edge.condition,
          complete,
        ),
      })),
  };
}

// Leaves that are running or have delivery records: their session bindings,
// runs, evidence, integration and pull requests. Records from tables added by
// later tasks (`task_deliveries`, `task_worktrees`) are passed through as-is.
// What the GitHub Project board says about a task that Avoozl does not act
// on, as short lines for the Delivery view (§6.7).
function projectNotes(record) {
  if (!record) return null;
  const notes = [];
  if (record.paused)
    notes.push(
      `Paused: ${record.paused.actor} moved the card to Deferred. No new session starts.`,
    );
  if (record.ignored?.direction === "into")
    notes.push(
      `Deferred by a person the policy does not allow (${record.ignored.actor || "unknown"}): ${record.ignored.reason} Not paused.`,
    );
  if (record.ignored?.direction === "out")
    notes.push(
      `Moved out of Deferred by a person the policy does not allow (${record.ignored.actor || "unknown"}): ${record.ignored.reason} Still paused.`,
    );
  if (record.mismatch)
    notes.push(
      `Board Status is ${record.mismatch.board}; Avoozl's state is ${record.mismatch.avoozl}.`,
    );
  if (record.releaseDraft)
    notes.push(
      `Release was changed to ${record.releaseDraft.to}; a plan change moving ${record.releaseDraft.specKey || "this task"} from ${record.releaseDraft.from || "no milestone"} to ${record.releaseDraft.to} is drafted for review.`,
    );
  return {
    status: record.status ?? null,
    state: record.state ?? null,
    release: record.applied?.Release ?? null,
    wave: record.applied?.Wave ?? null,
    notes,
  };
}

// One delivery's review rounds (§5.2, R36.12): per subject commit, each
// role's verdict, model, stale mark, findings with closure state, and a link
// to its session. A verdict on any commit but the delivery's current one is
// stale and counts for nothing.
export function reviewRounds(delivery) {
  const findings = new Map(
      deliveryFindings(delivery).map((finding) => [finding.ref, finding]),
    ),
    rounds = new Map();
  for (const entry of delivery?.verifications || []) {
    const commit = entry.commit ?? null;
    if (!rounds.has(commit))
      rounds.set(commit, {
        commit,
        current: commit === delivery.commit,
        verdicts: [],
      });
    const role = entry.role || "checks";
    rounds.get(commit).verdicts.push({
      role,
      attempt: entry.attempt,
      outcome: entry.outcome,
      verdict:
        entry.verdict ??
        (entry.outcome === "accepted"
          ? "approved"
          : entry.outcome === "rejected"
            ? "changes-requested"
            : null),
      model: entry.model ?? null,
      served: entry.served?.model ?? null,
      commit,
      stale: commit !== delivery.commit,
      cause: entry.cause ?? null,
      at: entry.at ?? null,
      slot: entry.slot ?? null,
      link: entry.slot ? sessionUrl(entry.slot) : null,
      checks: entry.checks ?? [],
      findings: (entry.findings || []).map((finding) => {
        const ref = `${entry.attempt}:${role}:${finding.id}`,
          known = findings.get(ref);
        return {
          ref,
          kind: finding.kind,
          paths: finding.paths,
          text: finding.text,
          state: known?.state ?? "open",
        };
      }),
      closures: entry.closures ?? [],
    });
  }
  return [...rounds.values()];
}

// A GitHub leaf's pull-request reviews as the tick last read them (task
// 9.10): the verdict on the head commit and each reviewer's review, with a
// link to the pull request. GitHub owns the review; this only shows it.
function githubReviews(verdict) {
  const reviews = verdict?.reviews;
  if (!reviews) return null;
  return {
    state: reviews.state,
    approvals: reviews.approvals,
    needed: reviews.needed,
    headSha: reviews.headSha ?? null,
    pullRequest: reviews.pullRequest ?? null,
    pullRequestNumber: reviews.pullRequestNumber ?? null,
    held: verdict.state === "held",
    reviews: (reviews.reviews || []).map((review) => ({
      reviewer: review.reviewer,
      state: review.state,
      commit: review.commit ?? null,
      stale: review.stale === true,
      allowed: review.allowed === true,
      reason: review.reason ?? null,
    })),
  };
}

// A remote leaf's submission as the tick last read it. The plugin's link,
// reason and result are its own text: the page escapes them.
function routeDelivery(row) {
  if (!row) return null;
  return {
    route: row.route,
    remoteId: row.remoteId,
    state: row.state,
    link: row.link ?? null,
    reason: row.reason ?? null,
    result: row.result ?? null,
    submittedAt: row.submittedAt ?? null,
    doneAt: row.doneAt ?? null,
  };
}

export function deliveryView(store, data) {
  const byTask = (rows) => {
    const map = new Map();
    for (const row of rows) {
      if (!row || typeof row.taskId !== "string") continue;
      if (!map.has(row.taskId)) map.set(row.taskId, []);
      map.get(row.taskId).push(row);
    }
    return map;
  };
  const submissions = new Map(
      optionalList(store, "route_submissions").map((row) => [row.taskId, row]),
    ),
    health = pluginHealth(store);
  const bindings = byTask(optionalList(store, "session_bindings")),
    runs = byTask(optionalList(store, "runs")),
    evidence = byTask(optionalList(store, "evidence")),
    deliveries = byTask(optionalList(store, "task_deliveries")),
    worktrees = byTask(optionalList(store, "task_worktrees")),
    board = projectItemRecords(store),
    live = liveSessions(store),
    claimed = claimedLeaves(store),
    archivedOf = archivedPlanOf(store),
    // Pull request feedback rows, read once rather than once per leaf.
    feedback = new Map(
      optionalList(store, FEEDBACK).map((row) => [row.id, row]),
    ),
    unreachableCrews = new Set(
      (store.getMeta("crews.snapshot")?.instances || [])
        .filter((i) => i.reachable === false)
        .map((i) => i.id),
    );
  const items = [];
  for (const task of data.tasks) {
    if (taskKind(task) !== "leaf") continue;
    const id = task.id,
      pullRequests = task.github?.pullRequests || [],
      links = Array.isArray(task.evidence) ? task.evidence : [],
      prFeedback = feedbackSummary(feedback.get(id));
    if (
      !DELIVERY_STATUSES.has(task.status) &&
      !bindings.has(id) &&
      !runs.has(id) &&
      !evidence.has(id) &&
      !deliveries.has(id) &&
      !worktrees.has(id) &&
      !board.has(id) &&
      !task.integration &&
      !pullRequests.length &&
      !links.length &&
      !task.githubVerdict?.reviews &&
      !prFeedback &&
      !submissions.has(id)
    )
      continue;
    items.push({
      id,
      title: task.title ?? id,
      status: task.status ?? null,
      complete: statusComplete(data, task.status),
      repository: taskRepository(task),
      supersedes: task.supersedes ?? null,
      supersededBy: task.supersededBy ?? null,
      // The batch it ran in (§4.11), if any.
      batch: (deliveries.get(id) || [])[0]?.batch ?? null,
      ...ownership(task),
      sessions: (bindings.get(id) || [])
        .map((binding) => ({
          slot: binding.slot,
          role: binding.role,
          attempt: binding.attempt,
          title: binding.title ?? null,
          status: binding.status ?? null,
          statusAt: binding.statusAt ?? null,
          boundAt: binding.boundAt ?? null,
          model: binding.model ?? null,
          // Placement (§4.10, R41.9, R53.10): the crew, agent, and why.
          agent: binding.agent ?? null,
          crew: binding.crew ?? "local",
          crewUnreachable: unreachableCrews.has(binding.crew),
          placementReason: binding.placement?.reason ?? null,
          sessionReason: binding.sessionReason ?? null,
          // What Kiro Crew said the session ran on; null from a Kiro Crew
          // that does not report it, whose requested model is trusted.
          served: binding.served
            ? {
                model: binding.served.model ?? null,
                withheld: binding.served.withheld === true,
                changed: binding.served.changed === true,
              }
            : null,
          commit: binding.commit ?? null,
          link: attachLink(store, binding, sessionUrl(binding.slot)),
        }))
        .sort((a, b) => a.attempt - b.attempt || a.role.localeCompare(b.role)),
      runs: (runs.get(id) || [])
        .filter((run) => !run.deletedAt)
        .map((run) => ({
          id: run.id,
          state: run.state,
          provider: run.provider ?? null,
          createdAt: run.createdAt ?? null,
        })),
      evidence: [
        ...links.map((text) => ({ text: String(text) })),
        ...(evidence.get(id) || []).map((record) => ({
          id: record.id,
          kind: record.kind ?? null,
          commit: record.commit ?? null,
          text: Array.isArray(record.argv) ? record.argv.join(" ") : null,
          exitCode: Number.isInteger(record.exitCode) ? record.exitCode : null,
          at: record.startedAt ?? null,
        })),
      ],
      integration: task.integration
        ? {
            commit: task.integration.commit ?? null,
            branch: task.integration.branch ?? null,
            at: task.integration.at ?? task.integration.landedAt ?? null,
          }
        : null,
      pullRequests: pullRequests.map((pull) => ({
        number: pull.number ?? null,
        url: typeof pull.url === "string" ? pull.url : null,
        merged: pull.merged === true || Boolean(pull.mergedAt),
      })),
      githubReviews: githubReviews(task.githubVerdict),
      // Pull request feedback (§4.13, R54.13): latest event, rounds, and
      // comments not relayed.
      prFeedback,
      deliveries: deliveries.get(id) || [],
      rounds: (deliveries.get(id) || []).flatMap(reviewRounds),
      worktrees: worktrees.get(id) || [],
      project: projectNotes(board.get(id)),
      route: routeDelivery(submissions.get(id)),
      needsYou: needsYou(task, submissions, health),
      noSession: statusWithoutSession(task, live, claimed),
      handSetReview: statusWithoutSession(task, live, claimed) !== null,
      nextAction: task.nextAction ?? null,
      planArchived: archivedOf(task),
    });
  }
  // `report` rule sets (§4.9): content that was written and matched.
  const contentReports = optionalList(store, "content_reports").map((row) => ({
    id: row.id,
    set: row.set,
    rule: row.rule,
    boundary: row.boundary,
    target: row.target,
    line: row.line ?? null,
    taskId: row.taskId ?? null,
    version: row.version ?? null,
    at: row.at ?? null,
  }));
  return { revision: data.revision, items, contentReports };
}

// Each task's Avoozl state (ready, running, reviewing, needs-you, waiting,
// done, deferred) by the Delivery tab's own lane rule, for the Project field
// the tick fills (github-project.mjs).
export function avoozlStates(store, data) {
  const items = new Map(
    deliveryView(store, data).items.map((item) => [item.id, item]),
  );
  return new Map(
    graphView(store, data, {}).tasks.map((task) => [
      task.id,
      avoozlState(task, items.get(task.id) ?? null),
    ]),
  );
}

// Open conflicts and decisions: open decisions on tasks, GitHub projection
// conflicts (managed fields, duplicate task IDs, closed issues), tasks
// that need a person, sessions that ended under unfinished tasks, and active
// runs that share a resource.
// Issue Radar's hold on a GitHub leaf (github-crew.mjs), in plain words for
// Needs you (R52.10); null for any other decision.
function crewHoldText(task) {
  const hold = task.crewHold;
  if (!hold || !String(task.decision || "").startsWith("crew-")) return null;
  return hold.kind === "needs-human"
    ? `An Issue Radar crew added "${hold.label}" to issue #${hold.number}: it needs a person. Answer it on GitHub; dependents wait until the label comes off.`
    : `Issue #${hold.number} has Issue Radar's claim "${hold.label}" but is no longer ready. Avoozl does not stop the crew; dependents wait until the claim comes off or the task is ready again.`;
}

export function conflictsView(store, data) {
  const live = liveSessions(store),
    claimed = claimedLeaves(store),
    archivedOf = archivedPlanOf(store),
    board = projectItemRecords(store);
  const complete = (status) => statusComplete(data, status),
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    // A person's chosen resolution per task and field (github.conflict.resolve),
    // applied by the next projection.
    resolutions = new Map(
      optionalList(store, "github_issues")
        .filter((record) => record.taskId && record.projectedPlanId)
        .map((record) => [record.taskId, record.resolutions || {}]),
    ),
    items = [];
  for (const task of data.tasks) {
    if (task.decision)
      items.push({
        kind: "decision",
        taskId: task.id,
        ...ownership(task),
        title: task.title ?? task.id,
        detail: crewHoldText(task) ?? String(task.decision),
      });
    // A tracker record's managed field a person changed (R35.6): Avoozl
    // leaves it alone until the plan or the record agree again.
    for (const conflict of task.tracker?.conflicts || [])
      items.push({
        kind: "tracker-conflict",
        taskId: task.id,
        ...ownership(task),
        title: task.title ?? task.id,
        detail: `${conflict.field} was changed in ${taskAuthority(task)}; Avoozl left it alone.`,
        link: task.tracker.link ?? null,
        field: conflict.field,
      });
    for (const conflict of task.projectionConflicts || []) {
      const resolvable = RESOLVABLE_FIELDS.has(conflict.field),
        chosen = resolutions.get(task.id)?.[conflict.field];
      items.push({
        kind: "github-conflict",
        taskId: task.id,
        ...ownership(task),
        title: task.title ?? task.id,
        field: conflict.field,
        detail: conflict.reason,
        expected: conflict.expected ?? null,
        actual: conflict.actual ?? null,
        changedBy: conflict.changedBy ?? null,
        changedAt: conflict.changedAt ?? null,
        // `desired` reapplies Avoozl's value; `github` keeps the person's
        // until the plan changes that field again. State and identity
        // conflicts are settled on GitHub.
        choices: resolvable ? ["desired", "github"] : [],
        resolution:
          resolvable && chosen && chosen.desired === conflict.desired
            ? chosen.choice
            : null,
      });
    }
    // An Avoozl state a person changed on the board (§6.7): written back
    // once; kept here until the state next moves.
    const reverted = board.get(task.id)?.stateConflict;
    if (reverted)
      items.push({
        kind: "github-conflict",
        taskId: task.id,
        ...ownership(task),
        title: task.title ?? task.id,
        field: "Avoozl state",
        detail: `It was set to ${reverted.board ?? "empty"} on the Project; Avoozl wrote ${reverted.avoozl} back.`,
        expected: reverted.avoozl,
        actual: reverted.board ?? null,
        changedBy: null,
        changedAt: reverted.at ?? null,
        choices: [],
        resolution: null,
      });
    if (!complete(task.status) && task.status === "blocked")
      items.push({
        kind: "needs-human",
        taskId: task.id,
        ...ownership(task),
        title: task.title ?? task.id,
        reason: "blocked",
        detail: "Task is blocked.",
      });
    // A decision on the task already asks the owner; one item is enough.
    const orphan = task.decision ? null : statusWithoutSession(task, live, claimed);
    if (orphan)
      items.push({
        kind: "needs-human",
        taskId: task.id,
        ...ownership(task),
        title: task.title ?? task.id,
        reason: "hand-set-review",
        status: orphan,
        detail: `${noSessionLine(orphan)}.${task.nextAction ? ` Next: ${task.nextAction}` : ""}`,
      });
  }
  items.push(...reviewGroups(store, data));
  for (const binding of optionalList(store, "session_bindings")) {
    const task = byId.get(binding.taskId);
    if (
      !task ||
      complete(task.status) ||
      !(FINAL_STATUSES.has(binding.status) || binding.status === "gone") ||
      binding.dismissedAt
    )
      continue;
    items.push({
      kind: "stale-session",
      taskId: task.id,
      ...ownership(task),
      title: task.title ?? task.id,
      detail: `${binding.role} session ${binding.slot} is ${binding.status}.`,
      slot: binding.slot,
      link: sessionUrl(binding.slot),
      // Retry applies only to a delivery stopped for a decision; any other
      // ended attempt is retried by the tick on its own.
      deliveryState: optionalGet(store, "task_deliveries", task.id)?.state ?? null,
      batch: optionalGet(store, "task_deliveries", task.id)?.batch ?? null,
    });
  }
  // Content rules (§4.9): a blocked write or an unavailable rule set. The
  // item names set, rule, boundary, target and line, never the matched text;
  // the page reads the line again on demand (content.show).
  for (const decision of optionalList(store, "content_decisions")) {
    if (decision.state !== "open") continue;
    const task = decision.taskId ? byId.get(decision.taskId) : null;
    items.push({
      kind: decision.kind === "unavailable" ? "content-unavailable" : "content-match",
      id: decision.id,
      taskId: decision.taskId ?? null,
      ...(task ? ownership(task) : {}),
      title:
        decision.kind === "unavailable"
          ? `Rule set ${decision.set} is unavailable`
          : `Content rule ${decision.set} blocked ${decision.target}`,
      detail:
        decision.kind === "unavailable"
          ? `Nothing it covers is written: ${decision.reason}.`
          : `Rule ${decision.rules.join(", ")} at ${decision.file || decision.target}${decision.line ? ` line ${decision.line}` : ""} (${decision.boundary}).`,
      set: decision.set,
      rules: decision.rules ?? [],
      boundary: decision.boundary,
      target: decision.target ?? null,
      line: decision.line ?? null,
      readable: Boolean(decision.source),
      openedAt: decision.openedAt ?? null,
    });
  }
  // No crew fits (§4.10, R41.8): yellow, one per task.
  for (const decision of optionalList(store, "placement_decisions")) {
    if (decision.state !== "open") continue;
    const task = byId.get(decision.taskId);
    items.push({
      kind: "no-fit",
      id: decision.id,
      taskId: decision.taskId,
      ...ownership(task),
      title: `No crew fits ${decision.taskId}`,
      detail: `${decision.why}. ${decision.text}.`,
      removed: decision.removed ?? [],
      openedAt: decision.openedAt ?? null,
    });
  }
  const holders = new Map();
  for (const run of optionalList(store, "runs"))
    if (ACTIVE_RUNS.has(run.state) && !run.deletedAt)
      for (const resource of run.resources || []) {
        if (!holders.has(resource)) holders.set(resource, []);
        holders.get(resource).push(run);
      }
  for (const [resource, runs] of holders)
    if (runs.length > 1)
      items.push({
        kind: "resource",
        taskId: runs[0].taskId,
        ...ownership(byId.get(runs[0].taskId)),
        title: `Shared resource ${resource}`,
        detail: `Active runs ${runs.map((run) => run.id).join(", ")} share ${resource}.`,
        runs: runs.map((run) => run.id),
      });
  for (const item of items) {
    const task = item.taskId ? byId.get(item.taskId) : null;
    item.planArchived = task ? archivedOf(task) : null;
  }
  return { revision: data.revision, items };
}

// Everything the page's task drawer shows for one task, from the reads the
// other views already make: the task row (`detail`, from task.get), its node
// in graph.view, its delivery.view item, its conflicts.view items, and its
// plan. Writes nothing. `locked` says why the page must not write the row
// and drafts a plan change instead: GitHub or a tracker plugin owns it, or it
// came from a plan whose current text is approved.
export function taskDetailView(store, data, detail, { plan = null, approved = false } = {}) {
  const id = detail.id,
    graph = graphView(store, data, {}),
    node = graph.tasks.find((task) => task.id === id) || null,
    titles = new Map(data.tasks.map((task) => [task.id, task.title ?? task.id])),
    blocking = data.edges.filter((edge) => BLOCKING.has(edge.kind)),
    satisfied = new Map(
      graph.edges.map((edge) => [`${edge.from}\u0000${edge.to}\u0000${edge.kind}`, edge.satisfied]),
    ),
    edge = (e, other) => ({
      id: other,
      title: titles.get(other) ?? other,
      kind: e.kind,
      condition: e.condition ?? null,
      satisfied: satisfied.get(`${e.from}\u0000${e.to}\u0000${e.kind}`) ?? false,
    }),
    delivery =
      deliveryView(store, { ...data, tasks: data.tasks.filter((task) => task.id === id) }).items[0] || null,
    conflicts = conflictsView(store, data).items.filter((item) => item.taskId === id),
    authority = taskAuthority(detail);
  // Wave: one more than the highest wave this task waits on.
  const before = new Map();
  for (const e of blocking) {
    if (!before.has(e.to)) before.set(e.to, []);
    before.get(e.to).push(e.from);
  }
  const waves = new Map(),
    visiting = new Set();
  const wave = (task) => {
    if (waves.has(task)) return waves.get(task);
    if (visiting.has(task)) return 0;
    visiting.add(task);
    const value = 1 + Math.max(0, ...(before.get(task) || []).map(wave));
    visiting.delete(task);
    waves.set(task, value);
    return value;
  };
  const locked =
    authority === "github"
      ? {
          reason: "github",
          message:
            detail.github?.origin === "design"
              ? "GitHub owns this task. Change its plan and approve it; the tick updates the issue."
              : "GitHub owns this task. Edit the issue on GitHub; the next sync reads it.",
        }
      : authority.startsWith("plugin:")
        ? {
            reason: "plugin",
            message: `${authority} owns this task. Change its plan and approve it; the tick updates the record.`,
          }
        : plan && approved
          ? {
              reason: "approved-spec",
              message: `This task comes from the approved plan ${plan.title || plan.id}. Changes become a draft plan change for you to approve.`,
            }
          : null;
  const timeline = taskTimeline(detail, delivery);
  return {
    revision: data.revision,
    task: {
      id,
      title: detail.title ?? id,
      summary: detail.summary ?? "",
      acceptance: detail.acceptance || [],
      checks: detail.checks || [],
      epic: detail.epic ?? null,
      epicTitle: data.epics.find((e) => e.id === detail.epic)?.title ?? detail.epic ?? null,
      kind: taskKind(detail),
      authority,
      route: taskRoute(detail),
      completion: taskCompletion(detail),
      repository: taskRepository(detail),
      status: detail.status ?? null,
      state: node?.state ?? null,
      ready: node?.ready ?? false,
      needsReview: Boolean(detail.needsReview),
      decision: detail.decision ?? null,
      handSetReview: node?.handSetReview ?? false,
      noSession: node?.noSession ?? null,
      nextAction: detail.nextAction ?? null,
      planArchived: node?.planArchived ?? null,
      owner: detail.owner ?? null,
      issue: issueLink(detail),
      wave: wave(id),
      context: detail.context || "",
    },
    origin: taskOrigin(detail, data, plan),
    plan: plan && {
      id: plan.id,
      title: plan.title ?? plan.id,
      spec: plan.spec ?? null,
      state: plan.state ?? null,
      approved,
    },
    locked,
    waitsOn: blocking.filter((e) => e.to === id).map((e) => edge(e, e.from)),
    blocks: blocking.filter((e) => e.from === id).map((e) => edge(e, e.to)),
    delivery,
    conflicts,
    timeline,
    // The drawer's Timing fold (§8.4): stages, spans and their sources.
    timing: taskFlow(store, detail),
  };
}

// Where a task came from, from the links its row records: a GitHub issue,
// a spec folder, a stored plan, a checkbox in an imported Markdown file, or
// a captured prompt. `sources` are the file lines it was made from, each
// readable with document.get when the workspace still has that file.
export function taskOrigin(task, data, plan = null) {
  const sources = taskSourceRefs(task)
    .filter((ref) => typeof ref.document === "string")
    .map((ref) => {
      const doc = data.documents?.[ref.document];
      return {
        document: ref.document,
        title: doc?.title ?? null,
        lineStart: Number.isInteger(ref.lineStart) ? ref.lineStart : null,
        lineEnd: Number.isInteger(ref.lineEnd) ? ref.lineEnd : null,
        checked: typeof ref.checked === "boolean" ? ref.checked : null,
        readable: Boolean(doc),
      };
    });
  const spec = specOf(task),
    origin = task.github?.origin ?? null,
    lines = (s) =>
      s.lineStart
        ? s.lineEnd && s.lineEnd !== s.lineStart
          ? `, lines ${s.lineStart}–${s.lineEnd}`
          : `, line ${s.lineStart}`
        : "";
  const base = { sources, spec, plan: plan ? { id: plan.id, title: plan.title ?? plan.id } : null };
  if (origin === "issue")
    return {
      ...base,
      kind: "github-issue",
      label: "A GitHub issue",
      text: "Avoozl read this task from an issue someone opened on GitHub. The issue is the record.",
    };
  if (spec)
    return {
      ...base,
      kind: "spec",
      label: `Spec ${spec}`,
      text: `Approving the spec folder .kiro/specs/${spec}/ made this task${sources[0] ? `, from ${sources[0].document}${lines(sources[0])}` : ""}.`,
    };
  if (plan)
    return {
      ...base,
      kind: "plan",
      label: `Plan ${plan.title ?? plan.id}`,
      text: `Approving the stored plan ${plan.title ?? plan.id} made this task.`,
    };
  if (sources.length) {
    const first = sources[0],
      ticked =
        first.checked === null
          ? ""
          : first.checked
            ? " The box was ticked then, so it was recorded as done."
            : " The box was not ticked then.";
    return {
      ...base,
      kind: "imported",
      label: `Imported from ${first.document}`,
      text: `Avoozl made this task from a checklist item in ${first.document}${lines(first)} when it imported the workspace's Markdown plans.${ticked} Edits in Avoozl are what count now; the file is history.${
        /^plan-[0-9a-f]{18}$/.test(task.id)
          ? " Its ID is a hash of the file and the item, so a new import gives it the same ID."
          : ""
      }`,
    };
  }
  if (task.capture || task.prompt)
    return {
      ...base,
      kind: "captured",
      label: "A captured prompt",
      text: "Someone described this task in a prompt, and Avoozl captured it as a draft.",
      prompt: typeof task.prompt === "string" ? task.prompt.slice(0, 2000) : null,
    };
  return {
    ...base,
    kind: "unknown",
    label: "Not recorded",
    text: "The task row records no plan, file, issue or prompt it came from. It was likely added by hand.",
  };
}

// One task's events, newest first, from the rows' own times: the task row,
// its sessions, evidence, deliveries, integration and runs. Avoozl keeps no
// separate task event log, so this is what "history" means on the page.
export function taskTimeline(task, delivery) {
  return [
    task.updatedAt && { at: task.updatedAt, text: "Task row changed" },
    ...(delivery?.sessions || []).flatMap((s) => [
      s.boundAt && { at: s.boundAt, text: `${s.role} attempt ${s.attempt} started` },
      s.statusAt && { at: s.statusAt, text: `${s.role} attempt ${s.attempt} is ${s.status}` },
    ]),
    ...(delivery?.evidence || []).map((e) => e.at && { at: e.at, text: `Evidence: ${e.kind || "record"}` }),
    ...(delivery?.deliveries || []).map(
      (d) => typeof d.updatedAt === "string" && { at: d.updatedAt, text: `Delivery is ${d.state}` },
    ),
    delivery?.integration?.at && {
      at: delivery.integration.at,
      text: `Integrated ${String(delivery.integration.commit || "").slice(0, 12)}`,
    },
    ...(task.runs || delivery?.runs || []).map(
      (run) => run.createdAt && { at: run.createdAt, text: `Run ${run.id} (${run.state})` },
    ),
  ]
    .filter((entry) => entry && typeof entry.at === "string")
    .sort((a, b) => b.at.localeCompare(a.at));
}

// The Dashboard's Recent activity (activity.recent): the newest task events
// across the workspace, newest first. Writes nothing.
export function activityView(store, data, { limit = 50 } = {}) {
  const max = Math.max(1, Math.min(Number(limit) || 50, 200)),
    delivery = new Map(deliveryView(store, data).items.map((item) => [item.id, item])),
    items = [];
  for (const task of data.tasks)
    for (const entry of taskTimeline(task, delivery.get(task.id)))
      items.push({ ...entry, taskId: task.id, title: task.title ?? task.id });
  items.sort((a, b) => b.at.localeCompare(a.at) || a.taskId.localeCompare(b.taskId));
  return { revision: data.revision, items: items.slice(0, max) };
}

// Whether a task belongs to a plan: its stored plan ID, or, for a spec
// folder, a source reference (or document epic) inside that folder. Both are
// links a person or an approval recorded; nothing is matched by title.
export function inPlan(task, { plan = null, spec = null } = {}) {
  if (plan && task.planId === plan) return true;
  if (!spec) return false;
  const folder = `.kiro/specs/${spec}/`;
  return (
    (typeof task.epic === "string" && task.epic.startsWith(`doc:${folder}`)) ||
    taskSourceRefs(task).some(
      (ref) => typeof ref.document === "string" && ref.document.startsWith(folder),
    )
  );
}

// The spec folder a task came from, by the same links inPlan reads: a
// document epic or a source reference under .kiro/specs/<name>/. Null when
// it has neither.
export function specOf(task) {
  const folder = (document) =>
    typeof document === "string"
      ? document.match(/^\.kiro\/specs\/([^/]+)\//)?.[1] ?? null
      : null;
  if (typeof task.epic === "string" && task.epic.startsWith("doc:")) {
    const name = folder(task.epic.slice(4));
    if (name) return name;
  }
  for (const ref of taskSourceRefs(task)) {
    const name = folder(ref.document);
    if (name) return name;
  }
  return null;
}

const newest = (...values) =>
  values.filter((value) => typeof value === "string" && value).sort().at(-1) ?? null;

// A Plans row's archive state (plan.archive) and its archive events (`events`, apart from the revision `history`):
// who archived or unarchived it, and when, newest first.
const archiveFields = (plan) => ({
  archived: plan?.archivedAt
    ? { at: plan.archivedAt, by: plan.archivedBy ?? null }
    : null,
  timeline: [...(plan?.events || [])]
    .filter((entry) => typeof entry?.at === "string")
    .sort((a, b) => b.at.localeCompare(a.at)),
});

// The Plans table (§8): one row per plan, a spec folder on disk or a stored
// plan with no folder, with its category from front-matter only, task
// counts, what is ready, running or needs a person, and its last change.
// `specs` is plan.specs's items, each with `modifiedAt` and `category`;
// `stored` is every live stored plan. Writes nothing.
export function plansTableView(store, data, { specs = [], stored = [], categoryOf }) {
  const graph = graphView(store, data, {}),
    state = new Map(graph.tasks.map((task) => [task.id, task.state])),
    claimed = new Set(specs.flatMap((spec) => (spec.plan ? [spec.plan.id] : [])));
  const counts = (scope) => {
    const tasks = data.tasks.filter((task) => inPlan(task, scope) && task.status !== "superseded"),
      leaves = tasks.filter((task) => !["epic", "package"].includes(taskKind(task))),
      epicTasks = tasks.filter((task) => taskKind(task) === "epic"),
      of = (name) => leaves.filter((task) => state.get(task.id) === name).length;
    return {
      tasks: {
        total: leaves.length,
        done: of("done"),
      },
      now: { ready: of("ready"), running: of("running"), needsYou: of("needs-you") },
      epics: epicTasks.length || new Set(leaves.map((task) => task.epic).filter(Boolean)).size,
      changedAt: newest(...tasks.map((task) => task.updatedAt)),
    };
  };
  const status = ({ plan, approved, changed }, done) =>
    !plan
      ? "not imported"
      : changed
        ? "changed"
        : approved && done
          ? "done"
          : approved
            ? "approved"
            : plan.state || "draft";
  const rows = [];
  for (const spec of specs) {
    const plan = spec.plan
        ? stored.find((entry) => entry.id === spec.plan.id) || null
        : null,
      summary = counts({ plan: spec.plan?.id ?? null, spec: spec.name });
    rows.push({
      key: `spec:${spec.root ?? ""}:${spec.name}`,
      kind: "spec",
      name: spec.title || spec.name,
      spec: spec.name,
      folder: spec.folder,
      planId: spec.plan?.id ?? null,
      type: spec.type,
      category: spec.category ?? null,
      categoryProblem: spec.categoryProblem ?? null,
      errors: spec.counts?.error ?? 0,
      status: status(
        {
          plan: spec.plan,
          approved: spec.plan?.approved,
          changed: spec.plan?.changed,
        },
        summary.tasks.total > 0 && summary.tasks.done === summary.tasks.total,
      ),
      ...summary,
      lastChange: newest(spec.modifiedAt, plan?.updatedAt, summary.changedAt),
      ...archiveFields(plan),
    });
  }
  for (const plan of stored) {
    if (claimed.has(plan.id)) continue;
    const summary = counts({ plan: plan.id });
    rows.push({
      key: `plan:${plan.id}`,
      kind: plan.spec ? "spec" : "old-style",
      name: plan.title || plan.id,
      spec: null,
      folder: null,
      planId: plan.id,
      type: null,
      category: categoryOf(plan),
      categoryProblem: null,
      errors: 0,
      status: status(
        { plan, approved: plan.state === "approved", changed: false },
        summary.tasks.total > 0 && summary.tasks.done === summary.tasks.total,
      ),
      ...summary,
      lastChange: newest(plan.updatedAt, summary.changedAt),
      ...archiveFields(plan),
    });
  }
  for (const row of rows) delete row.changedAt;
  return { revision: data.revision, items: rows };
}

// The page's "Ask in a chat" and "Discuss plan" seed (chat.context): one
// Markdown message with everything the page knows about the named conflict
// items, tasks or plan, so a new Kiro Crew chat starts with the whole story.
// Writes nothing. The message asks the chat to explain and recommend and to
// change nothing until the person says so.
// shortcut: documents and lists are cut at fixed sizes so the seed stays a
// reasonable first message; raise them if chats ask for the missing part.
const CONTEXT_DOC_CHARS = 20000,
  CONTEXT_TASKS = 300,
  CONTEXT_ITEMS = 100,
  CONTEXT_HISTORY = 12;

const clipText = (text, max) =>
  text.length > max ? `${text.slice(0, max)}\n\n[cut at ${max} characters]` : text;

const shown = (value) =>
  Array.isArray(value) ? value.join(", ") || "none" : value ? String(value) : "empty";

export function sameItem(item, key) {
  return (
    item.kind === key.kind &&
    (item.taskId ?? null) === (key.taskId ?? null) &&
    (item.field ?? null) === (key.field ?? null) &&
    (item.slot ?? null) === (key.slot ?? null) &&
    (item.id ?? null) === (key.id ?? null)
  );
}

export function chatContext(store, data, input = {}, { documents = null, planRow = null } = {}) {
  const keys = Array.isArray(input.items) ? input.items.slice(0, CONTEXT_ITEMS) : [],
    taskIds = Array.isArray(input.tasks) ? input.tasks.filter((id) => typeof id === "string").slice(0, CONTEXT_ITEMS) : [],
    byId = new Map(data.tasks.map((task) => [task.id, task])),
    plans = new Map(store.list("plans").map((plan) => [plan.id, plan])),
    conflicts = keys.length ? conflictsView(store, data).items : [],
    delivery = new Map(deliveryView(store, data).items.map((item) => [item.id, item])),
    graph = graphView(store, data, {}),
    state = new Map(graph.tasks.map((task) => [task.id, task.state])),
    lines = [];
  const taskLines = (id) => {
    const task = byId.get(id);
    if (!task) return [`- Task ${id}: not found in this workspace.`];
    const plan = task.planId ? plans.get(task.planId) : null,
      spec = specOf(task),
      waits = data.edges.filter((e) => e.to === id && BLOCKING.has(e.kind)).map((e) => e.from),
      history = taskTimeline(task, delivery.get(id)).slice(0, CONTEXT_HISTORY);
    return [
      `- Task: ${task.title ?? id} (${id})`,
      `- State: ${state.get(id) ?? "unknown"}; status ${task.status ?? "none"}; owner ${taskAuthority(task)}`,
      `- Plan: ${plan ? `${plan.title || plan.id} (${plan.id}, ${plan.state || "draft"})` : spec ? `spec .kiro/specs/${spec}/` : "none"}`,
      ...(task.epic ? [`- Epic: ${task.epic}`] : []),
      ...(waits.length ? [`- Waits on: ${waits.join(", ")}`] : []),
      ...(task.decision ? [`- Open decision: ${task.decision}`] : []),
      ...(issueLink(task)?.url ? [`- Issue: ${issueLink(task).url}`] : []),
      ...(history.length
        ? ["- History, newest first:", ...history.map((entry) => `  - ${entry.at} ${entry.text}`)]
        : ["- History: nothing recorded."]),
    ];
  };
  if (keys.length) {
    lines.push(`## ${keys.length === 1 ? "The item" : `${keys.length} items`} that need me`, "");
    keys.forEach((key, n) => {
      const item = conflicts.find((candidate) => sameItem(candidate, key));
      lines.push(`### ${n + 1}. ${item ? item.title : `${key.kind} on ${key.taskId ?? "the workspace"}`}`);
      if (!item) {
        lines.push("- This item is no longer open.", "");
        return;
      }
      lines.push(
        `- Kind: ${item.kind}${item.field ? ` (field ${item.field})` : ""}${item.reason ? ` (${item.reason})` : ""}`,
        `- Why: ${item.detail}`,
      );
      if (item.expected !== undefined || item.actual !== undefined)
        lines.push(`- Avoozl expected: ${shown(item.expected)}`, `- GitHub has: ${shown(item.actual)}`);
      if (item.changedBy || item.changedAt)
        lines.push(`- Changed by ${item.changedBy ?? "unknown"} at ${item.changedAt ?? "unknown time"}`);
      if (item.openedAt) lines.push(`- Opened: ${item.openedAt}`);
      if (item.choices?.length) lines.push(`- Choices: ${item.choices.join(", ")}`);
      if (item.taskId) lines.push(...taskLines(item.taskId));
      if (item.tasks?.length)
        lines.push(
          "- Tasks:",
          ...item.tasks
            .slice(0, CONTEXT_TASKS)
            .map((task) => `  - ${task.id} ${task.title} (${task.status ?? "no status"})`),
        );
      lines.push("");
    });
  }
  for (const id of taskIds) lines.push(`## Task ${id}`, "", ...taskLines(id), "");
  if (planRow) {
    const members = graph.tasks.filter((task) => inPlan(byId.get(task.id), { plan: planRow.planId, spec: planRow.spec }));
    lines.push(
      `## Plan ${planRow.name}`,
      "",
      `- Status: ${planRow.status}${planRow.planId ? `; stored as ${planRow.planId}` : ""}`,
      ...(planRow.folder ? [`- Folder: ${planRow.folder}`] : []),
      `- Tasks: ${planRow.tasks.done} of ${planRow.tasks.total} done; ${planRow.now.ready} ready, ${planRow.now.running} running, ${planRow.now.needsYou} need me`,
      "",
      "### Tasks",
      ...members.slice(0, CONTEXT_TASKS).map((task) => `- ${task.id} ${task.title} (${task.state}${task.decision ? `; decision: ${task.decision}` : ""})`),
      ...(members.length > CONTEXT_TASKS ? [`- and ${members.length - CONTEXT_TASKS} more`] : []),
      "",
    );
    for (const [file, text] of Object.entries(documents?.documents ?? {}))
      lines.push(`### ${file}`, "", "```markdown", clipText(text, CONTEXT_DOC_CHARS), "```", "");
  }
  const ask =
    input.purpose === "discuss-plan"
      ? "Discuss this plan with me. Answer from the documents, tasks and state below. Make no edits to any file, task or plan, and start no sessions."
      : "Explain why each item below needs me and what each choice would do, then recommend one. Do not change anything, settle anything or start any session until I say which.";
  return { message: [`Context from the Avoozl page.`, ask, "", ...lines].join("\n").trim() };
}
