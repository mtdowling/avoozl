// Broad issues and dependency text (design §6.2, tasks 4.4 and 4.6).
//
// A deliver rule matches an issue; a planner session classifies it. A
// bounded issue stays its own leaf. A broad issue gets a child graph, drafted
// as a Kiro spec folder and critiqued, then previewed in one comment on the
// issue. Nothing else is written to GitHub until an allowed actor re-applies
// the trigger label after that preview (or the rule sets
// `autoPublishChildren`). Then the children become an approved plan,
// projection creates their issues and blocked-by edges, and they are linked
// as sub-issues of the source issue, which stays open as their parent.
//
// With `dependencyText` on, `depends on #N` and `depends on owner/name#N` in
// the frozen snapshot are proposed edges. They show in the same preview and
// become native blocked-by edges only after a re-label approval; until then
// the issue is held, not ready.
import { digest } from "../model.mjs";
import { fail } from "./store.mjs";
import { parseRepository } from "./github.mjs";
import { evaluateRules } from "./github-policy.mjs";
import { secretReason } from "./workspace-repository.mjs";
import { readCritique } from "./spec-plans.mjs";
import { callerSlot } from "./delivery.mjs";
import { listSessionBindings } from "./session-bindings.mjs";

const DELIVERING = new Set(["deliver", "execute"]);
const PREVIEW = "<!-- avoozl:breakdown-preview -->";
const FENCE = /^\s*(```|~~~)/;
const PHRASE =
  /\bdepends\s+on\s*:?\s*((?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#\d+(?:\s*(?:,|&|\band\b)\s*(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#\d+)*)/gi;
const REFERENCE = /(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(\d+)/g;

// References in `depends on` phrases outside code, in body order, once each.
// A reference to the issue itself is kept as `self` so the preview says why
// it is not an edge.
export function parseDependencyText(body, repository, number) {
  const found = new Map();
  let fenced = false;
  for (const line of String(body || "").split("\n")) {
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced) continue;
    const text = line.replace(/`[^`]*`/g, "");
    for (const phrase of text.matchAll(PHRASE))
      for (const match of phrase[1].matchAll(REFERENCE)) {
        const target = match[1] || repository,
          n = Number(match[2]),
          ref = `${target}#${n}`;
        if (!Number.isSafeInteger(n) || n < 1 || found.has(ref.toLowerCase()))
          continue;
        const self =
          target.toLowerCase() === repository.toLowerCase() && n === number;
        found.set(ref.toLowerCase(), {
          ref,
          repository: target,
          number: n,
          state: self ? "self" : "proposed",
          ...(self ? { reason: "An issue cannot depend on itself." } : {}),
        });
      }
  }
  return [...found.values()];
}

// The proposal state carried on a `github_issues` row from sync to sync. A
// new snapshot starts over; a published breakdown is never reset.
export function nextBreakdown(
  previous,
  { bodyHash, body, repository, number, dependencyText, authorized },
) {
  if (previous?.published) return previous;
  if (previous && previous.snapshotHash === bodyHash) {
    if (!dependencyText) return { ...previous, textEdges: [] };
    return previous.textEdges?.length
      ? previous
      : {
          ...previous,
          textEdges: parseDependencyText(body, repository, number),
        };
  }
  // A quarantined body keeps the old proposal; it cannot publish, because
  // publishing needs the issue body to equal its snapshot.
  if (!authorized) return previous || null;
  const textEdges = dependencyText
    ? parseDependencyText(body, repository, number)
    : [];
  if (!textEdges.length && !previous) return null;
  return {
    snapshotHash: bodyHash,
    textEdges,
    classification: null,
    spec: null,
    preview: previous?.preview?.commentId
      ? { commentId: previous.preview.commentId, url: previous.preview.url }
      : null,
    approval: null,
    published: null,
    state: "open",
    reason: "",
  };
}

// Why a matched issue is not ready, or null. Sync and every step here apply
// it to the task's dispatch state.
export function breakdownHold(breakdown) {
  if (!breakdown) return null;
  // The tick started a planner for this issue: it is held until classified.
  const draft = breakdown.planners?.findLast(
    (entry) => entry.mode === "breakdown",
  );
  if (!breakdown.classification && draft)
    return {
      state: "classifying",
      reason:
        draft.state === "ended"
          ? "The planner session ended without classifying this issue. Remove and add the trigger label to plan it again."
          : "A planner session is classifying this issue.",
    };
  if (breakdown.classification?.kind === "broad")
    return breakdown.published
      ? { state: "parent", reason: "This issue is the parent of its children." }
      : {
          state: "planning",
          reason: "This broad issue is waiting for its child graph to publish.",
        };
  if (
    !breakdown.published &&
    (breakdown.textEdges || []).some((edge) => edge.state === "proposed")
  )
    return {
      state: "awaiting-approval",
      reason:
        "Dependency text on this issue is waiting for approval of its preview.",
    };
  const open = (breakdown.textEdges || []).filter(
    (edge) => edge.state === "written" && edge.external && edge.open,
  );
  if (open.length)
    return {
      state: "blocked",
      reason: `Waiting on ${open.map((edge) => edge.ref).join(", ")}.`,
    };
  return null;
}

// A planner session the tick started may classify and draft only its own
// issue. Other callers (the local command line, an Avoozl chat) are not bound
// as planners and keep the old reach.
function plannerScope(store, caller, row) {
  const own = callerSlot(caller);
  if (!own) return;
  const binding = listSessionBindings(store).find(
    (entry) => entry.slot.replace(/^dashboard:/, "") === own,
  );
  if (binding?.role === "planner" && binding.taskId !== row.taskId)
    fail(
      "A planner session may change only the issue it was started for.",
      403,
    );
}

function issueRow(store, { id, repository, number }) {
  const row = id
    ? store.get("github_issues", id)
    : store
        .list("github_issues")
        .find(
          (entry) =>
            entry.repository === parseRepository(repository).id &&
            entry.number === Number(number),
        );
  if (!row)
    fail("No matched GitHub issue has that repository and number.", 404);
  if (!DELIVERING.has(row.action))
    fail("Only an issue a deliver rule matched can be broken down.", 409);
  if (row.state !== "authorized")
    fail(row.reason || "This issue is not authorized.", 409);
  return row;
}

export function saveBreakdown(store, row, breakdown, message) {
  store.transaction(() => {
    store.put("github_issues", { ...row, breakdown });
    const data = structuredClone(store.read()),
      task = data.tasks.find((entry) => entry.id === row.taskId);
    if (!task) return;
    const hold = breakdownHold(breakdown),
      ready = row.state === "authorized" && !hold;
    if (breakdown.classification?.kind === "broad") task.kind = "package";
    else if (
      ["epic", "package"].includes(task.kind) &&
      !breakdown.published
    )
      task.kind = "task";
    task.dispatch = {
      ...task.dispatch,
      ready,
      state: hold ? hold.state : row.state,
      reason: hold ? hold.reason : row.reason,
    };
    store.commit(data, message);
  });
  return { ...row, breakdown };
}

export function openedBreakdown(row) {
  return (
    row.breakdown ||
    nextBreakdown(null, {
      bodyHash: row.snapshotHash || row.bodyHash,
      body: row.body,
      repository: row.repository,
      number: row.number,
      dependencyText: false,
      authorized: true,
    }) || {
      snapshotHash: row.snapshotHash || row.bodyHash,
      textEdges: [],
      classification: null,
      spec: null,
      preview: null,
      approval: null,
      published: null,
      state: "open",
      reason: "",
    }
  );
}

// A planner's answer to one question: is this one bounded leaf? Recorded as
// evidence for the frozen snapshot. Broad holds readiness until publishing.
export function classifyGitHubIssue(store, policy, input = {}, caller) {
  const row = issueRow(store, input);
  plannerScope(store, caller, row);
  if (!["bounded", "broad"].includes(input.kind))
    fail("Classify the issue as bounded or broad.");
  const reason = String(input.reason || "").trim();
  if (!reason || reason.length > 2000)
    fail("Give the reason for the classification in 1–2000 characters.");
  if (input.kind === "broad" && !policy?.repositories?.[row.repository])
    fail(
      `Name ${row.repository} in .avoozl.json before breaking its issues down.`,
      409,
    );
  const breakdown = openedBreakdown(row);
  if (breakdown.published)
    fail("This issue's children are already published.", 409);
  const next = {
    ...breakdown,
    classification: {
      kind: input.kind,
      reason,
      snapshotHash: breakdown.snapshotHash,
      at: new Date().toISOString(),
    },
    ...(input.kind === "bounded" ? { spec: null } : {}),
    state: input.kind === "broad" ? "classified" : breakdown.state,
  };
  store.event(null, "github.breakdown.classified", {
    issue: row.id,
    kind: input.kind,
    snapshotHash: breakdown.snapshotHash,
  });
  return saveBreakdown(
    store,
    row,
    next,
    `Classify ${row.repository}#${row.number}`,
  ).breakdown;
}

// The planner names the spec folder that holds the child graph. It is read
// again from disk before every preview and at publishing.
export function draftGitHubChildren(
  store,
  input = {},
  { readSpec, lint },
  caller,
) {
  const row = issueRow(store, input),
    breakdown = openedBreakdown(row);
  plannerScope(store, caller, row);
  if (breakdown.classification?.kind !== "broad")
    fail("Classify the issue as broad before drafting children.", 409);
  if (breakdown.published)
    fail("This issue's children are already published.", 409);
  const spec = readSpec(input.spec);
  if (!spec.exists) fail(`Spec folder ${spec.folder} does not exist.`, 404);
  const quality = lint(spec),
    graph = childGraph(quality.proposals);
  saveSpec(store, row, breakdown, spec);
  return {
    spec: spec.name,
    hash: spec.hash,
    canPublish: quality.canApprove && !graph.error,
    diagnostics: [
      ...quality.diagnostics,
      ...(graph.error
        ? [{ code: "breakdown.root", message: graph.error }]
        : []),
    ],
    critique: readCritique(spec.critique, spec.hash),
  };
}

function saveSpec(store, row, breakdown, spec) {
  saveBreakdown(
    store,
    row,
    {
      ...breakdown,
      spec: { name: spec.name, hash: spec.hash },
      state: "drafted",
    },
    `Draft children of ${row.repository}#${row.number}`,
  );
}

// The spec's one top-level package stands for the source issue, which
// already exists. Its children become top-level children of that issue.
export function childGraph(proposals = []) {
  const roots = proposals.filter((proposal) => !proposal.parent);
  if (roots.length !== 1 || roots[0].kind !== "package")
    return {
      error:
        "Nest every child under one top-level package item that stands for the issue itself.",
    };
  const root = roots[0].id,
    drop = (list) => list?.filter((id) => id !== root);
  const children = proposals
    .filter((proposal) => proposal.id !== root)
    .map((proposal) => {
      const next = { ...proposal };
      for (const field of ["requires", "sequence", "supports"])
        if (next[field]) next[field] = drop(next[field]);
      if (next.conditions)
        next.conditions = Object.fromEntries(
          Object.entries(next.conditions).filter(([id]) => id !== root),
        );
      if (next.parent === root) {
        delete next.parent;
        next.topLevel = true;
      }
      return next;
    });
  if (!children.length)
    return { error: "The spec has no children to publish." };
  return { root, children };
}

async function issueAt(github, repository, number) {
  try {
    return (await github.issue(repository, number)) || null;
  } catch (error) {
    if (error.status === 404 || error.status === 410) return null;
    throw error;
  }
}

const sameIssue = (left, right) =>
  Boolean(left && right) &&
  ((left.node_id && left.node_id === right.node_id) ||
    (left.id !== undefined && Number(left.id) === Number(right.id)));

// Whether `blocker` already depends, directly on GitHub or through local
// edges, on the issue that would now wait for it.
async function wouldCycle(store, github, { source, target, blocker, row }) {
  const theirs = await github.listIssueBlockers(target, blocker.number);
  if (theirs.some((issue) => sameIssue(issue, source))) return true;
  const data = store.read(),
    blockerTask = data.tasks.find(
      (task) =>
        task.github?.repository === target.id &&
        task.github?.number === blocker.number,
    );
  if (!blockerTask) return false;
  const seen = new Set(),
    stack = [blockerTask.id];
  while (stack.length) {
    const id = stack.pop();
    if (id === row.taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of data.edges)
      if (edge.to === id && ["requires", "sequence"].includes(edge.kind))
        stack.push(edge.from);
  }
  return false;
}

// Proposed references checked against GitHub: a missing issue or one that
// would close a cycle is shown and skipped, never written.
async function resolveTextEdges(store, github, row, source) {
  const result = [];
  for (const edge of row.breakdown.textEdges || []) {
    if (edge.state !== "proposed") {
      result.push(edge);
      continue;
    }
    const target = parseRepository(edge.repository),
      blocker = await issueAt(github, target, edge.number);
    if (!blocker || blocker.pull_request) {
      result.push({
        ...edge,
        state: "missing",
        reason: `${edge.ref} is not an issue Avoozl can read.`,
      });
      continue;
    }
    if (sameIssue(blocker, source)) {
      result.push({ ...edge, state: "self", reason: "It is this issue." });
      continue;
    }
    if (await wouldCycle(store, github, { source, target, blocker, row })) {
      result.push({
        ...edge,
        state: "cycle",
        reason: `${edge.ref} already waits on this issue.`,
      });
      continue;
    }
    result.push({
      ...edge,
      issueId: Number(blocker.id),
      nodeId: blocker.node_id,
    });
  }
  return result;
}

function previewHash({ snapshotHash, spec, children, textEdges }) {
  return digest(
    JSON.stringify({
      snapshotHash,
      spec: spec ? spec.hash : null,
      children: (children || []).map((child) => [
        child.id,
        child.title,
        child.kind || "leaf",
        child.requires || [],
        child.parent || null,
      ]),
      edges: textEdges
        .filter((edge) => edge.state === "proposed")
        .map((edge) => edge.ref),
    }),
  );
}

function renderPreview({ hash, children, textEdges, critique, trigger, auto }) {
  const lines = [PREVIEW, `### Avoozl preview \`${hash.slice(0, 12)}\``, ""];
  if (children?.length) {
    lines.push("Sub-issues this issue would get:", "");
    for (const child of children) {
      const after = (child.requires || []).length
        ? ` (after ${child.requires.join(", ")})`
        : "";
      const indent = child.parent ? "  " : "";
      lines.push(`${indent}- \`${child.id}\` ${child.title}${after}`);
    }
    lines.push("");
  }
  const proposed = textEdges.filter((edge) => edge.state === "proposed"),
    skipped = textEdges.filter((edge) =>
      ["self", "missing", "cycle"].includes(edge.state),
    );
  if (proposed.length) {
    lines.push("Blocked-by links from the issue text:", "");
    for (const edge of proposed) lines.push(`- ${edge.ref}`);
    lines.push("");
  }
  if (skipped.length) {
    lines.push("Not linked:", "");
    for (const edge of skipped) lines.push(`- ${edge.ref}: ${edge.reason}`);
    lines.push("");
  }
  if (critique?.findings?.length)
    lines.push(
      `The planner's critique has ${critique.findings.length} finding(s).`,
      "",
    );
  lines.push(
    auto
      ? "This rule publishes children automatically; the issue text links above still need approval."
      : `To publish exactly this, remove and add the \`${trigger}\` label again. Nothing else is written until then.`,
  );
  return lines.join("\n");
}

function publishedNote(hash, children, edges) {
  return [
    PREVIEW,
    `### Avoozl published \`${hash.slice(0, 12)}\``,
    "",
    ...(children.length ? [`${children.length} sub-issue(s) created.`] : []),
    ...(edges.length ? [`${edges.length} blocked-by link(s) added.`] : []),
  ].join("\n");
}

function screened(text) {
  const reason = secretReason(text);
  if (reason)
    fail(`Refusing to post the preview: it contains a ${reason}.`, 422);
  return text;
}

// The newest allowed re-label after the preview, or null. A label event by a
// disallowed actor, or one from before the preview, approves nothing.
async function relabelApproval(github, config, rules, row, preview) {
  const issue = await github.issue(config, row.number),
    events = await github.issueEvents(config, row.number),
    matches = await evaluateRules(
      rules,
      issue,
      events,
      async (login) =>
        (await github.permission(config, login))?.permission || "none",
    ),
    since = Date.parse(preview.at);
  const approved = matches.find((match) => {
    if (!match.allowed || !DELIVERING.has(match.action)) return false;
    if (!match.eventId || match.eventId === preview.eventId) return false;
    const event = events.find(
      (entry) => String(entry.node_id || entry.id) === match.eventId,
    );
    return event?.event === "labeled" && Date.parse(match.at) > since;
  });
  return approved
    ? {
        via: "relabel",
        actor: approved.actor,
        eventId: approved.eventId,
        at: approved.at,
      }
    : null;
}

function triggerLabel(rules, row) {
  const rule = rules.rules.find((entry) => entry.id === row.rule);
  return rule?.labelsAll[0] || rule?.labelsAny[0] || "trigger";
}

// One step for every matched issue with a pending proposal: preview it,
// detect approval, and publish. Errors are recorded on the row and do not
// stop the other issues.
export async function advanceGitHubBreakdowns(
  store,
  github,
  { policy, identity, readSpec, lint, approveChildren, project },
) {
  const result = { previewed: [], published: [], waiting: [], errors: [] };
  for (const row of store.list("github_issues")) {
    if (!row.breakdown || row.state !== "authorized") continue;
    if (row.breakdown.published) {
      if (row.breakdown.textEdges?.some((edge) => edge.external && edge.open))
        await refreshExternal(store, github, row);
      continue;
    }
    try {
      const outcome = await advanceOne(store, github, row, {
        policy,
        identity,
        readSpec,
        lint,
        approveChildren,
        project,
      });
      result[outcome.bucket].push({ issue: row.id, ...outcome.detail });
    } catch (error) {
      saveBreakdown(
        store,
        row,
        { ...row.breakdown, state: "error", reason: error.message },
        `Record breakdown error for ${row.id}`,
      );
      result.errors.push({ issue: row.id, error: error.message });
    }
  }
  return result;
}

async function advanceOne(store, github, row, hooks) {
  const { policy, identity } = hooks,
    config = store.get("github_repositories", row.repository),
    rules = policy?.repositories?.[row.repository];
  if (!config || !rules)
    return { bucket: "waiting", detail: { reason: "No repository policy." } };
  const source = await github.issue(config, row.number);
  if (digest(String(source?.body || "")) !== row.breakdown.snapshotHash)
    return {
      bucket: "waiting",
      detail: { reason: "The issue body differs from its snapshot." },
    };
  const broad = row.breakdown.classification?.kind === "broad";
  let breakdown = {
    ...row.breakdown,
    textEdges: rules.dependencyText
      ? await resolveTextEdges(store, github, row, source)
      : [],
  };
  let children = null,
    critique = null,
    lintClean = true,
    spec = null;
  if (broad) {
    if (
      identity?.mode === "plans-repo" &&
      row.repository !== identity.planningRepository
    )
      return hold(
        store,
        row,
        breakdown,
        "refused",
        "In plans-repo mode a broad issue must be filed in the planning repository.",
      );
    if (!breakdown.spec)
      return hold(
        store,
        row,
        breakdown,
        "awaiting-draft",
        "Waiting for the planner's child graph.",
      );
    spec = hooks.readSpec(breakdown.spec.name);
    if (!spec.exists)
      return hold(
        store,
        row,
        breakdown,
        "awaiting-draft",
        `Spec folder ${spec.folder} is gone.`,
      );
    const quality = hooks.lint(spec),
      graph = childGraph(quality.proposals);
    if (!quality.canApprove || graph.error)
      return hold(
        store,
        row,
        { ...breakdown, spec: { name: spec.name, hash: spec.hash } },
        "refused",
        graph.error ||
          `Fix the child graph: ${quality.diagnostics.find((d) => d.severity === "error")?.message}`,
      );
    critique = readCritique(spec.critique, spec.hash);
    if (!critique?.current)
      return hold(
        store,
        row,
        { ...breakdown, spec: { name: spec.name, hash: spec.hash } },
        "awaiting-critique",
        "Waiting for a critique of this exact child graph.",
      );
    children = graph.children;
    lintClean = quality.canApprove;
    breakdown.spec = { name: spec.name, hash: spec.hash };
  }
  const proposed = breakdown.textEdges.filter(
    (edge) => edge.state === "proposed",
  );
  if (!broad && !proposed.length) {
    // Nothing to approve: every reference was skipped. Nothing is posted.
    saveBreakdown(
      store,
      row,
      { ...breakdown, state: "open", reason: "" },
      `Check ${row.id}`,
    );
    return { bucket: "waiting", detail: { reason: "No edge to propose." } };
  }
  const hash = previewHash({ ...breakdown, children }),
    rule = rules.rules.find((entry) => entry.id === row.rule),
    auto =
      broad &&
      rule?.autoPublishChildren === true &&
      lintClean &&
      !critique.findings.length;
  let approval = null;
  if (auto && !proposed.length)
    approval = {
      via: "auto",
      actor: row.labelActor,
      eventId: row.labelEventId,
      at: new Date().toISOString(),
    };
  else if (breakdown.preview?.hash === hash)
    approval = await relabelApproval(
      github,
      config,
      rules,
      row,
      breakdown.preview,
    );
  if (!approval) {
    if (breakdown.preview?.hash !== hash) {
      breakdown = await postPreview(github, config, rules, row, breakdown, {
        hash,
        children,
        critique,
        auto,
      });
      saveBreakdown(
        store,
        row,
        { ...breakdown, state: "previewed", reason: "" },
        `Preview ${row.id}`,
      );
      return { bucket: "previewed", detail: { hash } };
    }
    saveBreakdown(
      store,
      row,
      { ...breakdown, state: "previewed" },
      `Check ${row.id}`,
    );
    return { bucket: "waiting", detail: { reason: "Waiting for approval." } };
  }
  // The approval is stored before any write, so a retry publishes the same
  // preview without asking again.
  breakdown = {
    ...breakdown,
    approval: { ...approval, hash },
    state: "approved",
  };
  saveBreakdown(store, row, breakdown, `Approve ${row.id}`);
  const published = await publish(
    store,
    github,
    { ...row, breakdown },
    {
      ...hooks,
      config,
      rules,
      source,
      spec,
      children,
      hash,
    },
  );
  return { bucket: "published", detail: published };
}

function hold(store, row, breakdown, state, reason) {
  saveBreakdown(store, row, { ...breakdown, state, reason }, `Hold ${row.id}`);
  return { bucket: "waiting", detail: { state, reason } };
}

async function postPreview(github, config, rules, row, breakdown, view) {
  const body = screened(
      renderPreview({
        ...view,
        textEdges: breakdown.textEdges,
        trigger: triggerLabel(rules, row),
      }),
    ),
    comment = breakdown.preview?.commentId
      ? await github.updateIssueComment(
          config,
          breakdown.preview.commentId,
          body,
        )
      : await github.createIssueComment(config, row.number, body),
    decision = rules.managedLabels?.decision;
  if (decision) await github.addLabels(config, row.number, [decision]);
  return {
    ...breakdown,
    preview: {
      hash: view.hash,
      commentId: comment.id,
      url: comment.html_url || null,
      at: comment.updated_at || comment.created_at || new Date().toISOString(),
      eventId: row.labelEventId,
    },
  };
}

async function publish(store, github, row, context) {
  const { config, rules, source, spec, children, hash } = context,
    created = [];
  if (children) {
    const plan = context.approveChildren({
      spec,
      children,
      row,
      actor: row.breakdown.approval.actor,
    });
    // Parents first, so each child's marker records the source issue.
    store.mutate(`Parent children of ${row.id}`, (draft) => {
      for (const child of children) {
        const task = draft.tasks.find(
          (entry) => entry.id === plan.mapping[child.id],
        );
        if (task && child.topLevel) task.parent = row.taskId;
      }
    });
    const projected = await context.project(plan.id, config.id);
    const byTask = new Map(
        projected.issues.map((issue) => [issue.taskId, issue]),
      ),
      linked = new Set(
        (await github.listSubIssues(config, row.number)).map((issue) =>
          Number(issue.id),
        ),
      );
    for (const child of children) {
      const issue = byTask.get(plan.mapping[child.id]);
      if (!issue)
        fail(`Projection did not create an issue for ${child.id}.`, 502);
      created.push({
        id: child.id,
        taskId: issue.taskId,
        number: issue.number,
      });
      if (source.assignees?.length)
        await github.addAssignees(
          config,
          issue.number,
          source.assignees.map((entry) => entry.login),
        );
      if (!child.topLevel || linked.has(Number(issue.databaseId))) continue;
      await github.addSubIssue(config, row.number, Number(issue.databaseId));
    }
    const after = new Set(
      (await github.listSubIssues(config, row.number)).map((issue) =>
        Number(issue.id),
      ),
    );
    for (const child of children.filter((entry) => entry.topLevel)) {
      const issue = byTask.get(plan.mapping[child.id]);
      if (!after.has(Number(issue.databaseId)))
        fail(`GitHub did not link ${child.id} under #${row.number}.`, 502);
    }
  }
  const edges = [];
  const textEdges = [];
  for (const edge of row.breakdown.textEdges) {
    if (edge.state !== "proposed" || !rules.dependencyText) {
      textEdges.push(edge);
      continue;
    }
    const current = await github.listIssueBlockers(config, row.number);
    if (!current.some((issue) => Number(issue.id) === edge.issueId))
      await github.addIssueBlocker(config, row.number, edge.issueId);
    const after = await github.listIssueBlockers(config, row.number);
    if (!after.some((issue) => Number(issue.id) === edge.issueId))
      fail(`GitHub did not add ${edge.ref} as a blocker.`, 502);
    const blocker = after.find((issue) => Number(issue.id) === edge.issueId),
      local = store
        .read()
        .tasks.find(
          (task) =>
            task.github?.repository === parseRepository(edge.repository).id &&
            task.github?.number === edge.number,
        );
    if (local)
      store.mutate(`Link ${edge.ref} before ${row.taskId}`, (draft) => {
        const id = `${local.id}:requires:${row.taskId}`;
        if (draft.edges.some((entry) => entry.id === id)) return;
        draft.edges.push({
          id,
          from: local.id,
          to: row.taskId,
          kind: "requires",
          githubIssue: row.id,
          source: "dependency-text",
          reason: `Approved dependency text ${edge.ref}.`,
        });
      });
    edges.push(edge.ref);
    textEdges.push({
      ...edge,
      state: "written",
      ...(local ? {} : { external: true, open: blocker?.state !== "closed" }),
    });
  }
  const decision = rules.managedLabels?.decision;
  if (
    decision &&
    (source.labels || []).some((label) => (label.name || label) === decision)
  )
    await github.removeLabel(config, row.number, decision);
  if (row.breakdown.preview?.commentId)
    await github.updateIssueComment(
      config,
      row.breakdown.preview.commentId,
      publishedNote(hash, created, edges),
    );
  saveBreakdown(
    store,
    row,
    {
      ...row.breakdown,
      textEdges,
      published: {
        at: new Date().toISOString(),
        hash,
        children: created,
        edges,
      },
      state: "published",
      reason: "",
    },
    `Publish ${row.id}`,
  );
  store.event(null, "github.breakdown.published", {
    issue: row.id,
    hash,
    children: created.map((child) => child.number),
    edges,
  });
  return { hash, children: created, edges };
}

// A blocker Avoozl does not track is read each step until it closes.
async function refreshExternal(store, github, row) {
  const textEdges = [];
  for (const edge of row.breakdown.textEdges) {
    if (!(edge.external && edge.open)) {
      textEdges.push(edge);
      continue;
    }
    const issue = await issueAt(
      github,
      parseRepository(edge.repository),
      edge.number,
    );
    textEdges.push({ ...edge, open: issue?.state !== "closed" });
  }
  saveBreakdown(
    store,
    row,
    { ...row.breakdown, textEdges },
    `Read blockers of ${row.id}`,
  );
}
