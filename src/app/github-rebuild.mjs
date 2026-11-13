// `avoozl rebuild` (design §3.3, Requirement 14.3): the SQLite rows of
// GitHub-authority tasks rebuilt from GitHub alone. Each managed issue's
// version 2 marker names its task, kind, parent, edge levels, applied
// Project values and close order; sub-issues and blocked-by dependencies
// carry the graph; labels carry readiness; the Project board is read to check
// the rebuilt graph against the Wave it shows. The plan row comes from the
// spec folder the managed section names, read through the spec-plan code,
// only while that folder still has the revision the markers pin. Rebuild
// only reads GitHub and spec folders. It never touches a local-authority row,
// and a second run writes nothing.
import { digest, statusComplete } from "../model.mjs";
import { taskAuthority, taskKind } from "../work-model.mjs";
import { withWorkLock } from "./git.mjs";
import { verdictKey } from "./github-close.mjs";
import { isParentMarker, requireNamespace } from "./github-marker.mjs";
import { computeWaves, projectFieldValue } from "./github-project.mjs";
import { ensureInbox, issueRecordId, projectedMarker } from "./github-sync.mjs";
import { fail } from "./store.mjs";
import { WORKSPACE_LOCK } from "./tick.mjs";
import { parseSpec, specCategory, specTitle } from "./spec-plans.mjs";
import { parseIssueNotes } from "./task-notes.mjs";

const SECTION =
  /<!-- avoozl:managed:start -->\n([\s\S]*?)\n<!-- avoozl:managed:end -->/;
const HEADER = /^This issue is projected from approved design `([^`]+)` at `/;
const REBUILT = "Rebuilt from GitHub";

export async function rebuildFromGitHub(store, github, options) {
  return withWorkLock(store, WORKSPACE_LOCK, () =>
    rebuild(store, github, options),
  );
}

// The managed section projection writes: plan ID, summary, acceptance
// criteria and the `requires` blockers, which tell a `requires` edge with no
// level from a `sequence` edge (both are plain GitHub dependencies).
export function parseManagedSection(body) {
  const text = String(body || "").match(SECTION)?.[1] ?? "",
    lines = text.split("\n"),
    planId = lines[0]?.match(HEADER)?.[1] ?? null,
    heading = (name) => lines.indexOf("## " + name),
    acceptanceAt = heading("Acceptance criteria"),
    dependenciesAt = heading("Dependencies"),
    notesAt = heading("Links and notes"),
    end = (from) => {
      const next = lines.findIndex(
        (line, index) =>
          index > from && (line.startsWith("## ") || line.startsWith("> ")),
      );
      return next === -1 ? lines.length : next;
    },
    items = (from) =>
      from === -1
        ? []
        : lines
            .slice(from + 1, end(from))
            .map((line) => line.match(/^- (?:\[[ xX]\] )?(.+)$/)?.[1])
            .filter(Boolean);
  return {
    planId,
    summary: lines
      .slice(1, acceptanceAt === -1 ? lines.length : acceptanceAt)
      .join("\n")
      .trim(),
    acceptance: items(acceptanceAt),
    requires: items(dependenciesAt),
    // Entries a person ticked Show on the issue (R61.23), as raw lines.
    notes: notesAt === -1 ? [] : lines.slice(notesAt + 1, end(notesAt)),
  };
}

const labelNames = (issue) =>
  (issue?.labels || []).map((label) =>
    typeof label === "string" ? label : label?.name,
  );

// The same label names projection uses: policy first, else the registered
// repository.
function managedLabels(config, identity) {
  const policy = identity.repositories?.[config.id]?.managedLabels || {};
  return {
    managed: policy.managed || config.managedLabel,
    ready: policy.ready || config.label,
  };
}

async function rebuild(
  store,
  github,
  { identity, policy, repository, readSpec },
) {
  const namespace = requireNamespace(identity),
    configs = store
      .list("github_repositories")
      .filter((config) => !repository || config.id === repository);
  if (!configs.length)
    fail(
      repository
        ? `Register ${repository} before rebuilding from it.`
        : "Register a GitHub repository before rebuilding.",
      409,
    );

  // 1. Every issue whose marker carries this namespace, by task ID.
  const found = new Map(),
    parentIssues = [],
    conflicts = [],
    notes = [];
  for (const config of configs) {
    const labels = managedLabels(config, identity);
    if (!labels.managed) {
      notes.push(`${config.id} names no managed label; skipped.`);
      continue;
    }
    await github.repository(config);
    // shortcut: issues are found by the managed label, as projection finds
    // them; an issue whose label a person removed is missed until it is back.
    const issues = await github.listIssues(config, {
      state: "all",
      label: labels.managed,
    });
    for (const issue of issues) {
      const marker = projectedMarker(issue.body);
      if (marker?.version !== 2 || marker.namespace !== namespace) continue;
      // A plan or epic issue is no task; its receipt comes back below.
      if (isParentMarker(marker)) {
        parentIssues.push({ issue, marker, config });
        continue;
      }
      const list = found.get(marker.taskId) || [];
      list.push({ issue, marker, config, labels });
      found.set(marker.taskId, list);
    }
  }
  const entries = new Map(),
    parentIds = new Set(parentIssues.map(({ marker }) => marker.taskId)),
    // A task under a plan issue has no task parent.
    taskParent = (marker) =>
      marker.parent &&
      !parentIds.has(marker.parent) &&
      !/^(?:plan|epic)\./.test(marker.parent)
        ? marker.parent
        : null;
  for (const [taskId, list] of found) {
    if (list.length > 1) {
      // R14.4: two issues with one task ID write nothing for that task.
      conflicts.push({
        taskId,
        field: "identity",
        reason: `Issues ${list.map(({ config, issue }) => `${config.id}#${issue.number}`).join(", ")} all carry task ${taskId}.`,
      });
      continue;
    }
    entries.set(taskId, list[0]);
  }
  const byNode = new Map(),
    byDatabaseId = new Map();
  for (const [taskId, entry] of entries) {
    byNode.set(entry.issue.node_id, taskId);
    byDatabaseId.set(Number(entry.issue.id), taskId);
  }

  // 2. Native graph: blocked-by dependencies and sub-issues.
  const parents = new Map();
  for (const [taskId, entry] of entries) {
    entry.blockers = await github.listIssueBlockers(
      entry.config,
      entry.issue.number,
    );
    if (["epic", "package"].includes(entry.marker.kind))
      for (const child of await github.listSubIssues(
        entry.config,
        entry.issue.number,
      )) {
        const childId = byDatabaseId.get(Number(child.id));
        if (childId) parents.set(childId, taskId);
      }
  }

  // 3. Desired rows and edges.
  const data = store.read(),
    complete = data.statuses.find((status) => status.complete)?.id,
    rows = new Map(),
    edges = [],
    skipped = [];
  for (const [taskId, entry] of entries) {
    const existing = data.tasks.find((task) => task.id === taskId);
    if (existing && taskAuthority(existing) !== "github") {
      skipped.push({ taskId, reason: "A local task has this ID." });
      continue;
    }
    rows.set(taskId, { entry, existing });
  }
  for (const [taskId, { entry }] of rows) {
    const { marker, issue } = entry,
      section = parseManagedSection(issue.body),
      conditions = marker.edges?.conditions || {};
    entry.section = section;
    for (const blocker of entry.blockers) {
      const from = byNode.get(blocker.node_id);
      if (!from || !rows.has(from)) {
        notes.push(
          `${taskId} is blocked by ${blocker.html_url || blocker.node_id}, which no rebuilt task owns.`,
        );
        continue;
      }
      const requires =
        Object.hasOwn(conditions, from) || section.requires.includes(from);
      edges.push({
        id: `${from}:${requires ? "requires" : "sequence"}:${taskId}`,
        from,
        to: taskId,
        kind: requires ? "requires" : "sequence",
        ...(requires && conditions[from]
          ? { condition: conditions[from] }
          : {}),
        ...(section.planId ? { planId: section.planId } : {}),
        reason: REBUILT,
      });
    }
    for (const to of marker.edges?.supports || []) {
      if (!rows.has(to)) {
        notes.push(`${taskId} supports ${to}, which no rebuilt task owns.`);
        continue;
      }
      edges.push({
        id: `${taskId}:supports:${to}`,
        from: taskId,
        to,
        kind: "supports",
        ...(section.planId ? { planId: section.planId } : {}),
        reason: REBUILT,
      });
    }
  }

  // 4. The Project board as a check: the Wave it shows must match the waves
  // of the rebuilt edges, or a dependency was lost.
  const project = await readProject(github, policy, rows),
    waves = computeWaves({
      tasks: [...rows.keys()].map((id) => ({ id })),
      edges,
    });
  for (const [taskId, values] of project.values)
    if (Number.isInteger(values.Wave) && values.Wave !== waves.get(taskId))
      notes.push(
        `${taskId} shows Wave ${values.Wave} on the Project but its rebuilt dependencies give ${waves.get(taskId)}.`,
      );
  if (project.reason) notes.push(project.reason);

  // 5. Plan rows from their spec folders.
  const plans = specPlans(store, rows, readSpec, notes),
    designs = new Map(plans.flatMap(({ designs }) => [...designs]));

  // 6. One SQLite write: rows, edges, issue receipts and orders. Nothing is
  // written when GitHub says what SQLite already holds.
  const mode = policy?.mode ?? identity.mode ?? null,
    childReleases = new Set(
      [...rows.values()]
        .filter(({ entry }) => entry.marker.applied.project?.Release)
        .map(
          ({ entry }) =>
            taskParent(entry.marker) || parents.get(entry.marker.taskId),
        )
        .filter(Boolean),
    ),
    rebuilt = [];
  const result = store.transaction(() => {
    const next = structuredClone(store.read()),
      before = JSON.stringify({
        tasks: next.tasks,
        edges: next.edges,
        documents: next.documents,
      });
    for (const { document } of plans) next.documents[document.id] ??= document;
    for (const [taskId, { entry }] of rows) {
      const row = taskRow({
        taskId,
        entry,
        existing: next.tasks.find((task) => task.id === taskId),
        parent: taskParent(entry.marker) || parents.get(taskId) || null,
        complete,
        mode,
        ownRelease: !childReleases.has(taskId),
        data: next,
        design: designs.get(taskId),
      });
      const index = next.tasks.findIndex((task) => task.id === taskId);
      if (index === -1) next.tasks.push(row);
      else next.tasks[index] = row;
      rebuilt.push(taskId);
    }
    // Edges between rebuilt tasks are GitHub's; edges touching any other
    // task stay as they are.
    next.edges = [
      ...next.edges.filter(
        (edge) => !(rows.has(edge.from) && rows.has(edge.to)),
      ),
      ...edges,
    ];
    let changed = JSON.stringify({
      tasks: next.tasks,
      edges: next.edges,
      documents: next.documents,
    });
    if (changed !== before) {
      if (rows.size) ensureInbox(next);
      store.commit(next, `Rebuild ${rows.size} tasks from GitHub`);
    } else changed = null;
    let receipts = 0;
    for (const [taskId, { entry }] of rows) {
      receipts += putIfChanged(
        store,
        "github_issues",
        issueRecord(entry, taskId),
      );
      const order = orderReceipt(entry, taskId);
      if (order) receipts += putIfChanged(store, "receipts", order);
      // Shown links and notes come back from the body; unshown ones live
      // only in SQLite and its backups, like session bindings (§3.3).
      for (const note of parseIssueNotes(entry.section.notes, taskId))
        receipts += putIfChanged(store, "task_notes", note);
    }
    for (const { plan, approval } of plans) {
      store.put("approvals", approval);
      store.put("plans", plan);
      receipts += 1;
    }
    // Plan and epic issues come back as their receipts (Requirement 59.8).
    for (const { issue, marker, config } of parentIssues) {
      const level = marker.kind,
        id = marker.taskId.slice(level.length + 1),
        key = `github-parent:${level}:${id}`,
        previous = store.get("receipts", key);
      receipts += putIfChanged(store, "receipts", {
        ...(previous || {}),
        id: key,
        kind: "github-parent",
        level,
        parentId: id,
        ...(level === "plan" ? { planId: id } : {}),
        repository: config.id,
        number: issue.number,
        nodeId: issue.node_id ?? null,
        databaseId: Number(issue.id) || null,
        url: issue.html_url ?? null,
        ...(issue.state === "closed" && !previous?.closedAt
          ? { closedAt: issue.closed_at ?? new Date().toISOString() }
          : {}),
        updatedAt: previous?.updatedAt ?? new Date().toISOString(),
      });
    }
    return { committed: Boolean(changed), receipts };
  });
  if (result.committed || result.receipts)
    store.event(null, "github.rebuilt", {
      tasks: rebuilt,
      edges: edges.length,
      plans: plans.map(({ plan }) => plan.id),
    });
  return {
    tasks: rebuilt,
    edges: edges.length,
    plans: plans.map(({ plan }) => plan.id),
    written: result.committed || result.receipts > 0,
    skipped,
    conflicts,
    notes,
    project: Object.fromEntries(project.values),
  };
}

// An approved plan row and its approval receipt for each plan the rebuilt
// issues name and SQLite lacks. Git owns the reviewed spec (§3.1), so the
// row is a receipt: it is rebuilt only from the folder with the exact
// revision hash the markers pin, which projection only writes once that
// revision was approved. An existing plan row is left alone.
// shortcut: a folder edited since projection is not read at
// `source.commit`; it is a note, and the person reloads and approves it.
function specPlans(store, rows, readSpec, notes) {
  const pinned = new Map();
  for (const [taskId, { entry }] of rows) {
    const planId = entry.section.planId;
    if (!planId) continue;
    const plan = pinned.get(planId) || { hashes: new Set(), taskIds: [] };
    plan.hashes.add(entry.marker.source.manifest);
    plan.taskIds.push(taskId);
    pinned.set(planId, plan);
  }
  const plans = [];
  for (const [planId, { hashes, taskIds }] of pinned) {
    if (store.get("plans", planId)) continue;
    const not = (reason) =>
      notes.push(`Plan ${planId} is not rebuilt: ${reason}`);
    if (hashes.size > 1) {
      not("its issues pin more than one revision.");
      continue;
    }
    let spec;
    try {
      spec = readSpec ? readSpec(planId) : null;
    } catch (error) {
      not(error.message);
      continue;
    }
    if (!spec?.exists) {
      not(`no spec folder .kiro/specs/${planId}/ is found.`);
      continue;
    }
    const [hash] = hashes;
    if (spec.hash !== hash) {
      not(
        `${spec.folder} is at ${String(spec.hash).slice(0, 12)}, but its issues pin ${String(hash).slice(0, 12)}. Reload and approve the folder.`,
      );
      continue;
    }
    const now = new Date().toISOString(),
      ids = [...taskIds].sort(),
      mapping = Object.fromEntries(ids.map((id) => [id, id])),
      documentId = `spec:${spec.name}`,
      text = spec.files["tasks.md"] || "",
      lines = text.split("\n"),
      designs = new Map(),
      approval = {
        id: `approval-rebuilt-${planId}-${hash.slice(0, 12)}`,
        planId,
        hash,
        source: spec.files["tasks.md"] || "",
        approvedBy: "",
        evidence: `Rebuilt from GitHub: ${ids.length} managed issues pin this revision.`,
        at: now,
        mapping,
        taskIds: ids,
        spec: spec.name,
        files: spec.files,
      };
    // The design fields approval wrote from this folder and GitHub does not
    // carry: completion level, checks, route and the approved excerpt.
    for (const proposal of parseSpec(spec).proposals) {
      if (!mapping[proposal.id]) continue;
      const excerpt = lines
        .slice(proposal.lineStart - 1, proposal.lineEnd)
        .join("\n");
      designs.set(proposal.id, {
        contextDocuments: [documentId],
        source: {
          document: documentId,
          key: proposal.id,
          lineStart: proposal.lineStart,
          lineEnd: proposal.lineEnd,
          hash: digest(excerpt),
        },
        approvedSource: { hash, text: excerpt },
        ...(proposal.phase ? { phase: proposal.phase } : {}),
        resources: proposal.resources || [],
        tags: proposal.tags || [],
        statusAuthority: "database",
        needsReview: false,
        ...Object.fromEntries(
          ["route", "completion", "repository", "checks"]
            .filter((key) => proposal[key] !== undefined)
            .map((key) => [key, proposal[key]]),
        ),
      });
    }
    plans.push({
      approval,
      designs,
      // The virtual document approval keeps for a spec plan.
      document: {
        id: documentId,
        path: documentId,
        title: specTitle(spec),
        text,
        hash,
        modifiedAt: now,
        links: [],
        rawLinks: [],
        managed: false,
        virtual: true,
        plan: {
          status: "started",
          ...(specCategory(spec.files)
            ? { category: specCategory(spec.files) }
            : {}),
          taskIds: ids,
        },
      },
      plan: {
        id: planId,
        kind: "plan",
        spec: spec.name,
        title: specTitle(spec),
        prompt: `Spec ${spec.name}`,
        text,
        files: spec.files,
        hash,
        revision: 1,
        state: "approved",
        context: {},
        createdAt: now,
        updatedAt: now,
        history: [],
        documentId,
        mapping,
        approvalId: approval.id,
      },
    });
  }
  return plans;
}

// The rebuilt row. GitHub-owned fields come from the issue; fields only this
// machine knows (runs, worktrees, design source) stay on an existing row.
function taskRow({
  taskId,
  entry,
  existing,
  parent,
  complete,
  mode,
  ownRelease,
  data,
  design,
}) {
  const { issue, marker, config, labels, section } = entry,
    open = issue.state === "open",
    ready = open && labelNames(issue).includes(labels.ready),
    applied = marker.applied.project || {},
    base = { ...design, ...(existing ? structuredClone(existing) : {}) };
  // Keep a stored legacy kind that reads the same, so a rerun changes nothing.
  const kind =
    existing && taskKind(existing) === marker.kind
      ? existing.kind
      : marker.kind;
  const row = {
    ...base,
    id: taskId,
    title: issue.title,
    summary:
      section.summary && section.summary !== issue.title ? section.summary : "",
    nextAction: section.summary || issue.title,
    kind,
    authority: "github",
    track: base.track || "catalog",
    scope: base.scope || "catalog",
    tags: base.tags || [],
    status: base.status || "planned",
    projectId: base.projectId || config.projectId,
    planHash: marker.source.manifest,
    github: {
      repository: config.id,
      issueId: Number(issue.id),
      nodeId: issue.node_id,
      number: issue.number,
      url: issue.html_url,
      origin: "design",
      bodyHash: digest(String(issue.body || "")),
    },
    dispatch: {
      ready,
      // The tick's last projection input, kept in projection's key order
      // so a rerun changes nothing.
      ...(base.dispatch?.graphReady === undefined
        ? {}
        : { graphReady: base.dispatch.graphReady }),
      state: ready
        ? "authorized"
        : base.dispatch?.state === "conflict"
          ? "conflict"
          : "blocked",
      assignee: (issue.assignees || []).map((entry) => entry.login),
      machineId: config.activeMachine || null,
    },
  };
  // An epic projected without criteria has none, not an empty list.
  if (section.acceptance.length || base.acceptance)
    row.acceptance = section.acceptance;
  if (section.planId) row.planId = section.planId;
  if (parent) row.parent = parent;
  else delete row.parent;
  // Release and Iteration as Avoozl last wrote them are the manifest's
  // values; a parent's Release is its own only when no child has one.
  if (applied.Release && (taskKind(row) === "leaf" || ownRelease))
    row.milestone = applied.Release;
  if (applied.Iteration) row.iteration = applied.Iteration;
  // An order is restored as recorded, with the issue's verdict key, so the
  // tick does not judge it again under a later policy (§3.4).
  if (marker.order && !open) {
    const previous = base.githubVerdict;
    row.githubVerdict = {
      state: "order",
      order: marker.order,
      source: previous?.state === "order" ? previous.source : "marker",
      issue: mode === "plans-repo" ? null : issue.html_url || null,
      key: verdictKey(issue),
      previousStatus:
        previous?.state === "order" ? previous.previousStatus : "planned",
      at: previous?.state === "order" ? previous.at : issue.closed_at || null,
    };
    if (complete && !statusComplete(data, row.status)) row.status = complete;
  }
  if (!open && ["epic", "package"].includes(marker.kind) && !row.githubClosedAt)
    row.githubClosedAt = issue.closed_at || null;
  return row;
}

function issueRecord(entry, taskId) {
  const { issue, config, labels } = entry;
  return {
    id: issueRecordId(config, issue),
    repository: config.id,
    taskId,
    issueId: Number(issue.id),
    databaseId: Number(issue.id),
    nodeId: issue.node_id,
    number: issue.number,
    url: issue.html_url,
    body: issue.body,
    bodyHash: digest(String(issue.body || "")),
    assignees: (issue.assignees || []).map((item) => item.login),
    ...(issue.state === "open" && labelNames(issue).includes(labels.ready)
      ? { state: "authorized" }
      : {}),
    managedLabel: labels.managed,
    managedBlockerIssueIds: entry.blockers
      .map((blocker) => Number(blocker.id))
      .sort((a, b) => a - b),
    projectedPlanId: entry.section.planId,
    projectedPlanHash: entry.marker.source.manifest,
  };
}

function orderReceipt(entry, taskId) {
  const { issue, marker, config } = entry;
  if (!marker.order || issue.state === "open") return null;
  return {
    id: `github-order:${taskId}`,
    taskId,
    repository: config.id,
    number: issue.number,
    ...marker.order,
  };
}

// Writes `record` merged over what is stored, only when a field differs, so
// fields the tick or projection added (state, conflicts, source, at) stay.
function putIfChanged(store, table, record) {
  const stored = store.get(table, record.id);
  if (
    stored &&
    Object.entries(record).every(
      ([key, value]) => JSON.stringify(stored[key]) === JSON.stringify(value),
    )
  )
    return 0;
  store.put(table, { ...stored, ...record });
  return 1;
}

// Release, Wave, Iteration and Status per rebuilt task as the board shows
// them. A missing Project or scope is a note, not a failure.
async function readProject(github, policy, rows) {
  const values = new Map(),
    config = policy?.project;
  if (!config || !github.projectV2) return { values };
  try {
    const project = await github.projectV2(config),
      fields = await github.projectFields(project),
      named = (key, fallback) => {
        const name = Object.hasOwn(config.fields || {}, key)
          ? config.fields[key]
          : fallback;
        return name ? fields.find((field) => field.name === name) : null;
      },
      wanted = {
        Status: named("status", "Status"),
        Release: named("release", "Release"),
        Wave: named("wave", "Wave"),
        Iteration: named("iteration", null),
      },
      items = await github.projectItems(
        project,
        Object.values(wanted)
          .filter(Boolean)
          .map((field) => field.id),
      ),
      byNode = new Map(
        items
          .filter((item) => item.content_type === "Issue" && item.content)
          .map((item) => [item.content.node_id, item]),
      );
    for (const [taskId, { entry }] of rows) {
      const item = byNode.get(entry.issue.node_id);
      if (!item) continue;
      values.set(
        taskId,
        Object.fromEntries(
          Object.entries(wanted).map(([key, field]) => [
            key,
            projectFieldValue(item, field),
          ]),
        ),
      );
    }
    return { values };
  } catch (error) {
    return {
      values,
      reason: `The Project could not be read: ${error.message}`,
    };
  }
}
