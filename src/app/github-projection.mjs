// Projection of an approved plan into GitHub issues (design §6.3, §3.4, §6.4)
// with managed-field conflicts (Requirement 15). One writer per namespace:
// projection runs inside the workspace tick lock, writes only issues whose
// marker carries this workspace's namespace, and only on repositories this
// machine is the active writer for. Every other workspace previews.
import { digest, queryTasks, statusComplete } from "../model.mjs";
import { completionReached, taskKind } from "../work-model.mjs";
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";
import { withWorkLock } from "./git.mjs";
import { WORKSPACE_LOCK } from "./tick.mjs";
import { blockerNotes, closeWithoutCode } from "./github-close.mjs";
import { pausedTaskIds } from "./github-project.mjs";
import { graphOrder } from "./delivery.mjs";
import { priorityRank } from "./github-policy.mjs";
import {
  assertPlanningLink,
  renderMarker,
  requireNamespace,
} from "./github-marker.mjs";
import {
  issueRecordId,
  machineIdentity,
  projectedMarker,
} from "./github-sync.mjs";

const BLOCKING = new Set(["requires", "sequence"]);
const SECTION =
  /<!-- avoozl:managed:start -->[\s\S]*?<!-- avoozl:managed:end -->/;
const MARKER_BLOCK = /<!--\s*avoozl-task\s*\n[\s\S]*?\n-->/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const FIELDS = ["title", "body", "labels", "blockers"];

// The human-readable managed section. The marker above it is separate so
// `applied.body` can hash the section without hashing itself.
// `notes` tell an Issue Radar leaf, which gets no Avoozl brief, that a
// blocker closed without merged code (R33.9).
function managedSection(task, plan, requires, notes = []) {
  const list = requires.map((id) => `- ${id}`).join("\n");
  return `<!-- avoozl:managed:start -->
This issue is projected from approved design \`${plan.id}\` at \`${plan.hash.slice(0, 12)}\`.

${task.summary || task.nextAction || ""}

## Acceptance criteria

${(task.acceptance || []).map((item) => `- [ ] ${item}`).join("\n")}
${list ? `\n## Dependencies\n\n${list}\n` : ""}${notes.length ? `\n${notes.map((note) => `> ${note}`).join("\n")}\n` : ""}
<!-- avoozl:managed:end -->`;
}

// Marker version 2 (§3.4): IDs and hashes only. Requires levels and
// `supports` edges live here and nowhere on GitHub. `previous` carries the
// Project values and an order forward.
function taskMarker({ task, plan, data, namespace, applied, previous }) {
  const commit = plan.sourceCommit || plan.context?.github?.commit || null,
    conditions = {},
    supports = [];
  for (const edge of data.edges) {
    if (edge.to === task.id && edge.kind === "requires" && edge.condition)
      conditions[edge.from] = edge.condition;
    if (edge.from === task.id && edge.kind === "supports")
      supports.push(edge.to);
  }
  const edges = {
      ...(Object.keys(conditions).length ? { conditions } : {}),
      ...(supports.length ? { supports } : {}),
    },
    old = previous?.version === 2 ? previous : null;
  return {
    version: 2,
    taskId: task.id,
    namespace,
    kind: taskKind(task),
    ...(task.parent ? { parent: task.parent } : {}),
    source: {
      commit: COMMIT.test(commit || "") ? commit : null,
      manifest: SHA256.test(plan.hash) ? plan.hash : digest(String(plan.hash)),
    },
    ...(Object.keys(edges).length ? { edges } : {}),
    applied: {
      ...applied,
      ...(old?.applied.project ? { project: old.applied.project } : {}),
    },
    ...(old?.order ? { order: old.order } : {}),
  };
}

function sectionOf(body) {
  return String(body || "").match(SECTION)?.[0] ?? "";
}

const DETAIL_CHARACTERS = 2000;
const shown = (text) =>
  text.length > DETAIL_CHARACTERS
    ? text.slice(0, DETAIL_CHARACTERS - 1) + "…"
    : text;
const issueRef = (issue) =>
  issue?.number ? `#${issue.number}` : issue?.node_id || "an issue";

// What the Conflicts view shows for one managed-field conflict: Avoozl's
// value, GitHub's, and who changed it and when. GitHub records an actor for
// renames and label changes in the issue's events; it records none for a
// body edit, so that reads as the issue's last update with no actor. Events
// are read once per conflicted issue, and a failed read leaves no actor.
async function conflictDetail(github, item, field, blockerRef) {
  const { current, labels } = item;
  if (item.events === undefined)
    try {
      item.events =
        (await github.issueEvents?.(item.config, current.number)) || [];
    } catch {
      item.events = [];
    }
  const matching = {
      title: (event) => event.event === "renamed",
      labels: (event) =>
        ["labeled", "unlabeled"].includes(event.event) &&
        [labels.managed, labels.ready].includes(event.label?.name),
      blockers: (event) => /block/i.test(String(event.event || "")),
      body: () => false,
    }[field],
    last = item.events.filter(matching).at(-1),
    values = {
      title: [item.title, current.title || ""],
      body: [shown(item.section), shown(sectionOf(current.body))],
      labels: [[labels.managed], item.currentLabels],
      blockers: [
        item.blockerTasks.map((id) => {
          const issue = blockerRef(id);
          return issue ? `${id} (${issueRef(issue)})` : id;
        }),
        item.before.map(issueRef),
      ],
    }[field];
  return {
    expected: values[0],
    actual: values[1],
    changedBy: last?.actor?.login ?? null,
    changedAt: last?.created_at ?? current.updated_at ?? null,
  };
}

function withMarker(body, rendered) {
  const text = String(body || "");
  return MARKER_BLOCK.test(text)
    ? text.replace(MARKER_BLOCK, () => rendered)
    : rendered + "\n" + text;
}

function withSection(body, section) {
  const text = String(body || "");
  return SECTION.test(text)
    ? text.replace(SECTION, () => section)
    : text + "\n" + section;
}

function replaceExtractedDesignBody(current, managed) {
  const marker =
    /<!-- avoozl:extracted-design -->[\s\S]*?<!-- \/avoozl:extracted-design -->/;
  if (!marker.test(String(current || ""))) return managed;
  return String(current).replace(marker, () => managed);
}

function issueDatabaseId(issue) {
  const id = Number(issue?.id);
  if (!Number.isSafeInteger(id) || id <= 0)
    fail("GitHub did not return a stable issue database ID.", 502);
  return id;
}

function labelNames(issue) {
  return (issue?.labels || []).map((label) =>
    typeof label === "string" ? label : label?.name,
  );
}

const key = (values) => JSON.stringify([...values].sort());

// Label names come from policy (`managedLabels` in .avoozl.json), else from
// the registered repository; none is built in.
function managedLabels(config, identity) {
  const policy = identity.repositories?.[config.id]?.managedLabels || {},
    managed = policy.managed || config.managedLabel,
    ready = policy.ready || config.label;
  if (!managed || !ready)
    fail(
      `Name the managed and ready labels for ${config.id} before projecting.`,
      409,
    );
  return { managed, ready };
}

function concurrencyFor(config, identity) {
  const value = identity.repositories?.[config.id]?.concurrency;
  return Number.isInteger(value) && value >= 0 ? value : Infinity;
}

// Requirement 15 for one managed field, compared as keys: write the desired
// value only while GitHub still holds what Avoozl last applied (or already
// holds the desired value). A resolution from the Conflicts view either
// reapplies the desired value once or keeps GitHub's value until the design
// changes the field again.
function fieldPlan({ current, applied, desired, also = [], resolution }) {
  if (resolution?.choice === "desired")
    return { write: current !== desired, baseline: desired, desired };
  if (resolution?.choice === "github" && resolution.desired === desired)
    return { write: false, baseline: current, desired, kept: true };
  if (
    applied === null ||
    applied === undefined ||
    current === applied ||
    current === desired ||
    also.includes(current)
  )
    return { write: current !== desired, baseline: desired, desired };
  return { conflict: true, write: false, baseline: applied, desired };
}

export async function projectPlanIssues(store, github, options) {
  if (options.locked) return project(store, github, options);
  return withWorkLock(store, WORKSPACE_LOCK, () =>
    project(store, github, options),
  );
}

// Leaves the graph lets start now, among `tasks`. `dispatch.ready` on them
// is projection's own last verdict (no slot, or a conflict), so it is
// recomputed here, not read: otherwise a leaf left out once could never take
// a freed slot or follow its finished blocker. A task paused on the Project
// board gets no ready label (§6.7).
function graphReady(store, data, tasks) {
  const own = new Set(tasks.map((task) => task.id)),
    paused = pausedTaskIds(store),
    ownVerdict = (task) =>
      own.has(task.id) &&
      ["blocked", "conflict"].includes(task.dispatch?.state),
    view = {
      ...data,
      tasks: data.tasks.map((task) =>
        ownVerdict(task)
          ? { ...task, dispatch: { ...task.dispatch, ready: undefined } }
          : task,
      ),
    };
  return new Set(
    queryTasks(view, { scope: "all", q: "ready:true" })
      .map((task) => task.id)
      .filter((id) => own.has(id) && !paused.has(id)),
  );
}

// The tick's projection step (§4.5 step 10): project again each approved
// plan whose graph readiness changed since its last projection, so a leaf
// whose blocker completed gets the ready label (and a linked-branch leaf its
// dispatch) without a person running `github project`. Only plans whose
// repositories this machine writes. A quiet graph makes no GitHub call.
export async function refreshProjectedReadiness(store, github, { identity }) {
  const data = store.read(),
    result = { projected: [], errors: [] },
    designed = data.tasks.filter(
      (task) =>
        task.planId &&
        task.github?.origin === "design" &&
        task.github.number &&
        !task.projectionConflicts?.length,
    );
  // machineIdentity writes on first use; a workspace with no projected
  // task must stay untouched.
  if (!designed.length) return result;
  const machine = machineIdentity(store).id,
    writers = new Set(
      store
        .list("github_repositories")
        .filter((config) => config.activeMachine === machine)
        .map((config) => config.id),
    ),
    projected = designed.filter((task) => writers.has(task.github.repository)),
    ready = graphReady(store, data, projected),
    plans = new Set(
      projected
        .filter(
          (task) =>
            ready.has(task.id) !==
            Boolean(task.dispatch?.graphReady ?? task.dispatch?.ready),
        )
        .map((task) => task.planId),
    );
  for (const planId of plans) {
    if (store.get("plans", planId)?.state !== "approved") continue;
    try {
      await project(store, github, { planId, identity });
      result.projected.push(planId);
    } catch (error) {
      result.errors.push({ planId, error: error.message });
    }
  }
  return result;
}

// `dryRun` is set only by `previewProjection`, which passes a scratch store
// and a GitHub stand-in that records writes instead of making them.
async function project(
  store,
  github,
  { planId, repository, identity, dryRun = false },
) {
  const previewOnly = new Set(),
    namespace = requireNamespace(identity),
    markerOptions = { planningRepository: identity.planningRepository },
    plan = store.get("plans", planId);
  if (!plan || plan.state !== "approved")
    fail("Approve the design revision before projecting issues.", 409);
  const data = store.read(),
    complete = (status) => statusComplete(data, status),
    // An opt-in local task never syncs to GitHub (R28.3).
    tasks = data.tasks.filter(
      (task) => task.planId === plan.id && task.authority !== "local",
    ),
    queueReady = graphReady(store, data, tasks),
    machine = machineIdentity(store).id,
    verified = new Set(),
    managedByRepository = new Map(),
    issueTypes = new Map(),
    notes = new Set(),
    items = [];

  // 1. Desired graph, matched to the issues that already carry it.
  for (const task of tasks) {
    const config = repository
      ? store.get("github_repositories", parseRepository(repository).id)
      : store
          .list("github_repositories")
          .find(
            (entry) =>
              entry.projectId === (task.projectId || plan.context?.projectId),
          );
    if (!config)
      fail(`No GitHub repository is registered for task ${task.id}.`);
    assertPlanningLink(identity, config.id);
    // A preview still lists what the writer would do, and says so.
    if (config.activeMachine !== machine) {
      if (!dryRun)
        fail(
          `This workspace only previews ${config.id}: another machine is its writer.`,
          409,
        );
      previewOnly.add(config.id);
    }
    if (!verified.has(config.id)) {
      await github.repository(config);
      verified.add(config.id);
    }
    const labels = managedLabels(config, identity);
    if (!managedByRepository.has(config.id)) {
      const byTaskId = new Map(),
        issues = await github.listIssues(config, {
          state: "all",
          label: labels.managed,
        });
      for (const issue of issues) {
        const marker = projectedMarker(issue.body);
        // Version 2 belongs to a namespace; version 1 only to its plan. An
        // issue of another namespace is never matched, so never written.
        if (
          !marker?.taskId ||
          (marker.version === 2
            ? marker.namespace !== namespace
            : marker.planId !== plan.id)
        )
          continue;
        byTaskId.set(marker.taskId, [
          ...(byTaskId.get(marker.taskId) || []),
          issue,
        ]);
      }
      managedByRepository.set(config.id, { issues, byTaskId });
    }
    const matches =
        task.github?.origin === "design" && task.github.repository === config.id
          ? [await github.issue(config, task.github.number)]
          : managedByRepository.get(config.id).byTaskId.get(task.id) || [],
      item = { task, config, labels, conflicts: [] };
    items.push(item);
    if (matches.length > 1) {
      item.skip = true;
      item.conflicts.push({
        field: "identity",
        reason: `Issues ${matches.map((issue) => "#" + issue.number).join(", ")} all carry task ${task.id}.`,
      });
      continue;
    }
    item.current = matches[0] || null;
    if (!item.current) continue;
    item.marker = projectedMarker(item.current.body);
    item.record = store.get(
      "github_issues",
      issueRecordId(config, item.current),
    );
    if (
      item.current.state !== "open" &&
      !completionReached(task, null, complete)
    ) {
      item.closed = closeWithoutCode({
        task,
        issue: item.current,
        marker: item.marker,
      });
      if (item.closed.verdict !== "order") {
        item.skip = true;
        item.conflicts.push({ field: "state", reason: item.closed.reason });
      }
    }
  }

  const byTask = new Map(items.map((item) => [item.task.id, item])),
    external = new Map();
  for (const item of items) {
    const { task } = item,
      requires = data.edges
        .filter((edge) => edge.to === task.id && edge.kind === "requires")
        .map((edge) => edge.from);
    item.title = task.title;
    item.section = managedSection(
      task,
      plan,
      requires,
      blockerNotes(data, task),
    );
    item.blockerTasks = data.edges
      .filter((edge) => edge.to === task.id && BLOCKING.has(edge.kind))
      .map((edge) => edge.from);
    for (const id of item.blockerTasks) {
      if (byTask.has(id) || external.has(id)) continue;
      const local = data.tasks.find((candidate) => candidate.id === id);
      if (!local?.github?.repository || !local.github.number)
        fail(`Dependency ${id} must be projected before ${task.id}.`, 409);
      const config = store.get("github_repositories", local.github.repository);
      if (!config)
        fail(`No GitHub repository is registered for dependency ${id}.`);
      external.set(id, {
        config,
        issue: await github.issue(config, local.github.number),
      });
    }
  }
  // A blocker's issue: projected now, already on GitHub, or not yet created.
  const blockerRef = (id) => {
    const projected = byTask.get(id);
    if (projected) return projected.issue || projected.current || null;
    return external.get(id).issue;
  };
  const blockerRepository = (id) =>
    (byTask.get(id) || external.get(id)).config.id;

  // 2. Managed-field conflicts against the marker's baselines (R15).
  for (const item of items) {
    if (item.skip || !item.current) continue;
    const { current, labels } = item,
      applied = item.marker?.version === 2 ? item.marker.applied : null,
      resolutions = item.record?.resolutions || {};
    item.before = await github.listIssueBlockers(item.config, current.number);
    const currentBlockers = item.before.map((blocker) => blocker.node_id),
      desiredBlockers = item.blockerTasks.map(
        (id) => blockerRef(id)?.node_id || "new:" + id,
      ),
      previousIds = item.record?.managedBlockerIssueIds,
      // Without a version 2 baseline, the SQLite receipt is the baseline;
      // without either, any existing edge is unmanaged.
      appliedBlockers = applied
        ? applied.blockers
        : Array.isArray(previousIds)
          ? previousIds.map(
              (id) =>
                item.before.find((blocker) => Number(blocker.id) === id)
                  ?.node_id || "db:" + id,
            )
          : [],
      universe = [labels.managed, labels.ready],
      currentLabels = labelNames(current).filter((name) =>
        universe.includes(name),
      ),
      appliedLabels = applied?.labels.filter((name) => universe.includes(name));
    item.arrays = {
      blockers: {
        [key(currentBlockers)]: currentBlockers,
        [key(appliedBlockers)]: appliedBlockers,
        [key(desiredBlockers)]: desiredBlockers,
      },
    };
    item.plans = {
      title: fieldPlan({
        current: digest(current.title || ""),
        applied: applied?.title,
        desired: digest(item.title),
        resolution: resolutions.title,
      }),
      body: fieldPlan({
        current: digest(sectionOf(current.body)),
        applied: applied?.body,
        desired: digest(item.section),
        resolution: resolutions.body,
      }),
      blockers: fieldPlan({
        current: key(currentBlockers),
        applied: key(appliedBlockers),
        desired: key(desiredBlockers),
        resolution: resolutions.blockers,
      }),
      labels: fieldPlan({
        current: key(currentLabels),
        applied: appliedLabels ? key(appliedLabels) : null,
        desired: key([labels.managed]),
        also: [key([labels.managed, labels.ready])],
        resolution: resolutions.labels,
      }),
    };
    item.currentLabels = currentLabels;
    item.appliedLabels = appliedLabels || [];
    for (const field of FIELDS)
      if (item.plans[field].conflict)
        item.conflicts.push({
          field,
          reason: `The ${field} changed on GitHub since Avoozl last wrote it.`,
          desired: item.plans[field].desired,
          ...(await conflictDetail(github, item, field, blockerRef)),
        });
  }

  // 3. Readiness: unblocked, unclaimed, conflict-free leaves, capped per
  // repository by the leaves already carrying the ready label. A leaf that
  // already carries it keeps its slot, so a crew's claim is never pulled;
  // free slots go by the repository's priority labels, then graph order
  // (R27.7).
  const ready = new Set(),
    slots = new Map(),
    order = graphOrder(data),
    holds = (item) =>
      item.current?.state === "open" &&
      labelNames(item.current).includes(item.labels.ready),
    rank = (item) =>
      priorityRank(
        identity.repositories?.[item.config.id]?.priority,
        labelNames(item.current),
      ),
    candidates = [...items].sort(
      (left, right) =>
        Number(holds(right)) - Number(holds(left)) ||
        rank(left) - rank(right) ||
        order(left.task, right.task),
    );
  for (const item of candidates) {
    const { task, config, labels } = item;
    if (
      item.skip ||
      item.conflicts.length ||
      item.closed ||
      taskKind(task) !== "leaf" ||
      !queueReady.has(task.id) ||
      (item.current && item.current.state !== "open")
    )
      continue;
    if (!slots.has(config.id)) {
      const planned = new Set(items.map((entry) => entry.task.id)),
        occupied = managedByRepository
          .get(config.id)
          .issues.filter(
            (issue) =>
              issue.state === "open" &&
              labelNames(issue).includes(labels.ready) &&
              !planned.has(projectedMarker(issue.body)?.taskId),
          ).length;
      slots.set(config.id, concurrencyFor(config, identity) - occupied);
    }
    if (slots.get(config.id) <= 0) continue;
    slots.set(config.id, slots.get(config.id) - 1);
    ready.add(task.id);
  }

  // 4. Withdraw readiness from every leaf that is blocked, conflicted, over
  // the cap, or about to change.
  for (const item of items) {
    if (!item.current) continue;
    const changing =
      item.plans &&
      ["title", "body", "blockers"].some((f) => item.plans[f].write);
    if (
      labelNames(item.current).includes(item.labels.ready) &&
      (!ready.has(item.task.id) || changing)
    ) {
      await github.removeLabel(
        item.config,
        item.current.number,
        item.labels.ready,
      );
      item.current.labels = labelNames(item.current)
        .filter((name) => name !== item.labels.ready)
        .map((name) => ({ name }));
    }
  }

  // 5. Create or update issues; epics get the owner's epic issue type.
  const epicType = async (config) => {
    const name = identity.epicIssueType;
    if (!name || !github.listIssueTypes) return null;
    if (!issueTypes.has(config.owner))
      issueTypes.set(config.owner, await github.listIssueTypes(config.owner));
    if (
      issueTypes
        .get(config.owner)
        .some((type) => type.name === name && type.is_enabled !== false)
    )
      return name;
    notes.add(`${config.owner} has no ${name} issue type; epics have no type.`);
    return null;
  };
  for (const item of items) {
    if (item.skip) continue;
    try {
      await writeIssue(item);
    } catch (error) {
      // A content rule blocked this issue (§4.9): nothing is written for it,
      // its decision is open, and the other issues go on.
      if (!error.contentBlocked) throw error;
      item.issue = null;
      item.contentBlocked = true;
    }
  }
  async function writeIssue(item) {
    const { task, config, labels, current } = item,
      type = taskKind(task) === "epic" ? await epicType(config) : null;
    if (!current) {
      const applied = {
        title: digest(item.title),
        body: digest(item.section),
        labels: [labels.managed],
        blockers: [],
      };
      item.issue = await github.createIssue(config, {
        title: item.title,
        body:
          renderMarker(
            taskMarker({ task, plan, data, namespace, applied }),
            markerOptions,
          ) +
          "\n" +
          item.section,
        assignees: config.assignee ? [config.assignee] : undefined,
        labels: [labels.managed],
        ...(type ? { type } : {}),
      });
      item.plans = {
        title: { baseline: applied.title },
        body: { baseline: applied.body },
        labels: { baseline: key(applied.labels) },
        blockers: { write: item.blockerTasks.length > 0, baseline: null },
      };
      item.before = [];
      item.arrays = { blockers: {} };
      item.currentLabels = [labels.managed];
      return;
    }
    const patch = {};
    if (item.plans.title.write) patch.title = item.title;
    if (item.plans.body.write)
      patch.body = withSection(current.body, item.section);
    if (type && current.type?.name !== type) patch.type = type;
    item.issue = Object.keys(patch).length
      ? await github.updateIssue(config, current.number, patch)
      : current;
    if (
      !item.plans.labels.conflict &&
      !item.plans.labels.kept &&
      !item.currentLabels.includes(labels.managed)
    ) {
      await github.addLabels(config, current.number, [labels.managed]);
      item.currentLabels.push(labels.managed);
    }
    if (
      config.assignee &&
      !(current.assignees || []).some(
        (entry) => entry.login === config.assignee,
      )
    )
      await github.addAssignees(config, current.number, [config.assignee]);
  }
  for (const item of items)
    if (item.issue) item.issueId = issueDatabaseId(item.issue);

  // 6. Links, then dependencies. Sub-issues name the child by database ID, so
  // a parent may sit in another repository or organization (F37, F38); only
  // missing links are added, so a sub-issue a person added stays.
  for (const item of items) {
    const parent = item.task.parent && byTask.get(item.task.parent);
    if (!item.issue || !parent?.issue) continue;
    assertPlanningLink(identity, parent.config.id, item.config.id);
    const has = async () =>
      (await github.listSubIssues(parent.config, parent.issue.number)).some(
        (child) => Number(child.id) === item.issueId,
      );
    if (await has()) continue;
    await github.addSubIssue(parent.config, parent.issue.number, item.issueId);
    if (!(await has()))
      fail(
        `GitHub did not link task ${item.task.id} under ${item.task.parent}.`,
        502,
      );
  }
  for (const item of items) {
    if (!item.issue) continue;
    if (!item.plans.blockers.write) {
      item.blockerNodes = item.before.map((blocker) => blocker.node_id);
      item.blockerIds = item.before.map(issueDatabaseId);
      continue;
    }
    const desired = [];
    for (const id of item.blockerTasks) {
      const issue = blockerRef(id);
      if (!issue) {
        item.conflicts.push({
          field: "blockers",
          reason: `Blocker ${id} has no single issue to link.`,
        });
        continue;
      }
      desired.push(issueDatabaseId(issue));
    }
    assertPlanningLink(
      identity,
      item.config.id,
      ...item.blockerTasks.map(blockerRepository),
    );
    const currentIds = item.before.map(issueDatabaseId);
    for (const id of currentIds)
      if (!desired.includes(id))
        await github.removeIssueBlocker(item.config, item.issue.number, id);
    for (const id of desired)
      if (!currentIds.includes(id))
        await github.addIssueBlocker(item.config, item.issue.number, id);
    const after = await github.listIssueBlockers(
      item.config,
      item.issue.number,
    );
    if (key(after.map(issueDatabaseId)) !== key(desired))
      fail(
        `GitHub did not preserve dependencies for task ${item.task.id}.`,
        502,
      );
    item.blockerNodes = after.map((blocker) => blocker.node_id);
    item.blockerIds = after.map(issueDatabaseId);
  }

  // 7. Re-read, add ready labels last, then record what was applied.
  const results = [],
    conflicts = [];
  for (const item of items) {
    const { task, config, labels } = item;
    conflicts.push(
      ...item.conflicts.map((conflict) => ({ taskId: task.id, ...conflict })),
    );
    if (!item.issue) {
      recordLocal(store, task, { conflicts: item.conflicts });
      continue;
    }
    let issue = await github.issue(config, item.issue.number);
    const marker = projectedMarker(issue.body);
    if (issue.node_id !== item.issue.node_id || marker?.taskId !== task.id)
      fail(
        `GitHub issue identity changed while projecting task ${task.id}.`,
        409,
      );
    const isReady = ready.has(task.id);
    if (isReady && !labelNames(issue).includes(labels.ready))
      await github.addLabels(config, issue.number, [labels.ready]);
    const plans = item.plans,
      labelBaseline = plans.labels.conflict
        ? item.appliedLabels
        : plans.labels.kept
          ? item.currentLabels
          : [labels.managed, ...(isReady ? [labels.ready] : [])],
      blockerBaseline = plans.blockers.conflict
        ? item.arrays.blockers[plans.blockers.baseline]
        : item.blockerNodes,
      next = taskMarker({
        task,
        plan,
        data,
        namespace,
        previous: marker,
        applied: {
          title: plans.title.baseline,
          body: plans.body.baseline,
          labels: labelBaseline,
          blockers: [...blockerBaseline].sort(),
        },
      }),
      rendered = renderMarker(next, markerOptions);
    if (JSON.stringify(marker) !== JSON.stringify(next))
      issue = await github.updateIssue(config, issue.number, {
        body: withMarker(issue.body, rendered),
      });
    const resolutions = Object.fromEntries(
        Object.entries(item.record?.resolutions || {}).filter(
          ([field]) => plans[field]?.kept,
        ),
      ),
      record = {
        id: issueRecordId(config, issue),
        repository: config.id,
        taskId: task.id,
        issueId: issueDatabaseId(issue),
        databaseId: issueDatabaseId(issue),
        nodeId: issue.node_id,
        number: issue.number,
        url: issue.html_url,
        body: issue.body,
        bodyHash: digest(String(issue.body || "")),
        assignees: (issue.assignees || []).map((entry) => entry.login),
        state: isReady
          ? "authorized"
          : item.conflicts.length
            ? "conflict"
            : "blocked",
        managedLabel: labels.managed,
        managedBlockerIssueIds: [
          ...new Set(
            (plans.blockers.conflict
              ? item.record?.managedBlockerIssueIds || []
              : item.blockerIds
            ).map(Number),
          ),
        ].sort((a, b) => a - b),
        conflicts: item.conflicts,
        resolutions,
        projectedPlanId: plan.id,
        projectedPlanHash: plan.hash,
        observedAt: new Date().toISOString(),
      };
    store.put("github_issues", record);
    recordLocal(store, task, {
      conflicts: item.conflicts,
      github: {
        repository: config.id,
        issueId: record.issueId,
        nodeId: issue.node_id,
        number: issue.number,
        url: issue.html_url,
        origin: "design",
        bodyHash: record.bodyHash,
      },
      projectId: config.projectId,
      dispatch: {
        ready: isReady,
        // What the graph allowed at this projection; the tick projects
        // again when it changes (refreshProjectedReadiness).
        graphReady: queueReady.has(task.id),
        state: record.state,
        assignee: record.assignees,
        machineId: config.activeMachine || null,
      },
    });
    results.push(record);
  }
  let parent = null;
  let comment = null;
  if (plan.extractionId && results.length) {
    const repositoryId = results[0].repository,
      config = store.get("github_repositories", repositoryId);
    if (results.some((result) => result.repository !== repositoryId))
      fail(
        "An extracted design can create one parent issue only when its tasks project to one repository.",
        409,
      );
    await github.repository(config);
    const parentReceiptId = `extraction-parent:${repositoryId}:${plan.id}`,
      previousParent = store.get("receipts", parentReceiptId),
      body = [
        "<!-- avoozl:extracted-design -->",
        plan.prompt || plan.title,
        "",
        `Extracted revision \`${plan.hash}\`.`,
        "",
        ...results.map((result) => `- [${result.taskId}](${result.url})`),
        "<!-- /avoozl:extracted-design -->",
      ].join("\n");
    if (previousParent?.number) {
      const current = await github.issue(config, previousParent.number);
      parent = await github.updateIssue(config, previousParent.number, {
        title: plan.title,
        body: replaceExtractedDesignBody(current.body, body),
      });
    } else {
      parent = await github.createIssue(config, {
        title: plan.title,
        body,
      });
    }
    for (const result of results)
      if (result.databaseId && github.addSubIssue)
        await github.addSubIssue(config, parent.number, result.databaseId);
    store.put("receipts", {
      id: parentReceiptId,
      kind: "extraction-parent-issue",
      planId: plan.id,
      extractionId: plan.extractionId,
      repository: repositoryId,
      number: parent.number,
      nodeId: parent.node_id || null,
      url: parent.html_url || null,
      bodyHash: digest(String(parent.body || body)),
      updatedAt: new Date().toISOString(),
    });

    const anchor = plan.context?.github;
    if (
      anchor?.repository === repositoryId &&
      (anchor.pullRequestNumber || anchor.commit)
    ) {
      const commentReceiptId = `extraction-comment:${repositoryId}:${plan.id}`,
        previousComment = store.get("receipts", commentReceiptId),
        commentBody = [
          "<!-- avoozl:extraction-comment -->",
          `Avoozl extracted revision \`${plan.hash}\` into [${plan.title}](${parent.html_url}).`,
          "",
          ...results.map((result) => `- [${result.taskId}](${result.url})`),
          "<!-- /avoozl:extraction-comment -->",
        ].join("\n");
      try {
        if (anchor.pullRequestNumber) {
          comment = previousComment?.databaseId
            ? await github.updateIssueComment(
                config,
                previousComment.databaseId,
                commentBody,
              )
            : await github.createIssueComment(
                config,
                anchor.pullRequestNumber,
                commentBody,
              );
        } else {
          comment = previousComment?.databaseId
            ? await github.updateCommitComment(
                config,
                previousComment.databaseId,
                commentBody,
              )
            : await github.createCommitComment(
                config,
                anchor.commit,
                commentBody,
              );
        }
        store.put("receipts", {
          id: commentReceiptId,
          kind: "extraction-design-comment",
          planId: plan.id,
          extractionId: plan.extractionId,
          repository: repositoryId,
          databaseId: comment.id || null,
          url: comment.html_url || null,
          state: "posted",
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        store.put("receipts", {
          id: commentReceiptId,
          kind: "extraction-design-comment",
          planId: plan.id,
          extractionId: plan.extractionId,
          repository: repositoryId,
          state: "retry",
          error: error.message,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }
  store.event(null, "github.plan.projected", {
    planId: plan.id,
    planHash: plan.hash,
    issues: results.map((entry) => entry.id),
  });
  return {
    planId: plan.id,
    planHash: plan.hash,
    issues: results,
    conflicts,
    notes: [...notes],
    ...(dryRun ? { previewOnly: [...previewOnly] } : {}),
    parent: parent
      ? {
          number: parent.number,
          nodeId: parent.node_id || null,
          url: parent.html_url || null,
        }
      : null,
    comment: comment?.html_url || null,
  };
}

// The local row mirrors the issue and carries open projection conflicts for
// the Conflicts view.
function recordLocal(store, task, { conflicts, github, projectId, dispatch }) {
  store.transaction(() => {
    const next = structuredClone(store.read()),
      local = next.tasks.find((candidate) => candidate.id === task.id);
    if (github) local.github = github;
    if (projectId) local.projectId ||= projectId;
    if (dispatch) local.dispatch = dispatch;
    if (conflicts.length) local.projectionConflicts = conflicts;
    else delete local.projectionConflicts;
    store.commit(next, "Project " + task.id);
  });
}

// A person's choice for one conflicted field: `desired` reapplies Avoozl's
// value on the next projection; `github` keeps GitHub's value until the design
// changes that field again.
export function resolveProjectionConflict(store, { taskId, field, choice }) {
  if (!FIELDS.includes(field))
    fail("Choose a field: " + FIELDS.join(", ") + ".");
  if (!["desired", "github"].includes(choice))
    fail("Choose desired or github.");
  const record = store
    .list("github_issues")
    .find((entry) => entry.taskId === taskId && entry.projectedPlanId);
  if (!record) fail(`Task ${taskId} has no projected issue.`, 404);
  const conflict = (record.conflicts || []).find(
    (entry) => entry.field === field,
  );
  if (!conflict) fail(`Task ${taskId} has no ${field} conflict.`, 409);
  record.resolutions = {
    ...record.resolutions,
    [field]: { choice, desired: conflict.desired },
  };
  store.put("github_issues", record);
  return record;
}
