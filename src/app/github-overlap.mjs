import { digest } from "../model.mjs";
import { fail } from "./store.mjs";

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "because",
  "before",
  "but",
  "can",
  "could",
  "for",
  "from",
  "have",
  "into",
  "issue",
  "not",
  "of",
  "on",
  "pull",
  "request",
  "should",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "through",
  "use",
  "with",
  "would",
]);

function normalized(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function terms(value) {
  return new Set(
    normalized(value)
      .split(/\s+/)
      .filter(
        (term) =>
          term &&
          (term.length >= 3 || /^\d{2,}$/.test(term)) &&
          !STOP_WORDS.has(term),
      ),
  );
}

function intersection(left, right) {
  return [...left].filter((term) => right.has(term));
}

function text(values) {
  return values
    .flat(Infinity)
    .filter((value) => typeof value === "string" && value)
    .join("\n");
}

function sourceExcerpt(data, source) {
  const document = source?.document && data.documents[source.document];
  if (!document?.text) return "";
  if (!source.lineStart || !source.lineEnd) return document.text;
  return document.text
    .split("\n")
    .slice(Math.max(0, source.lineStart - 1), source.lineEnd)
    .join("\n");
}

function taskText(data, task) {
  return text([
    task.title,
    task.summary,
    task.overview,
    task.notes,
    task.nextAction,
    task.acceptance,
    task.tags,
    task.resources,
    task.approvedSource?.text,
    sourceExcerpt(data, task.source),
    (task.sourceReferences || []).map(
      (source) => source.approvedSource?.text || sourceExcerpt(data, source),
    ),
  ]);
}

function planProjectIds(data, plan) {
  return [
    plan.context?.projectId,
    ...data.tasks
      .filter((task) => task.planId === plan.id)
      .map((task) => task.projectId),
  ].filter(Boolean);
}

function linkedKind(link) {
  if (["issue", "pull-request"].includes(link?.kind)) return link.kind;
  if (/pull-request/.test(link?.origin || "")) return "pull-request";
  if (/issue/.test(link?.origin || "")) return "issue";
  return null;
}

function sameItem(left, item) {
  if (!left || left.repository !== item.repository) return false;
  const kind = linkedKind(left);
  if (kind && kind !== item.kind) return false;
  if (item.nodeId && left.nodeId) return left.nodeId === item.nodeId;
  if (item.number && left.number)
    return (
      Number(left.number) === Number(item.number) &&
      (!left.kind || left.kind === item.kind)
    );
  return Boolean(item.url && left.url === item.url);
}

function taskOriginAssociation(task, item) {
  if (!sameItem(task.github, item)) return null;
  return {
    id: `github-task-origin:${task.id}:${item.id}`,
    queueItemId: item.id,
    repository: item.repository,
    kind: item.kind,
    nodeId: item.nodeId || null,
    number: item.number,
    url: item.url || null,
    targetKind: "task",
    targetId: task.id,
    title: task.title,
    confirmedAt:
      task.createdAt ||
      task.updatedAt ||
      item.observedAt ||
      item.updatedAt ||
      new Date(0).toISOString(),
    source: "task-origin",
  };
}

function associationMatches(association, item) {
  return association.queueItemId === item.id || sameItem(association, item);
}

export function queueItemAssociations(store, item, prepared = {}) {
  const recorded = (
      prepared.recordedAssociations || store.list("github_queue_associations")
    ).filter((association) => associationMatches(association, item)),
    origins = (prepared.data || store.read()).tasks
      .map((task) => taskOriginAssociation(task, item))
      .filter(Boolean),
    unique = new Map();
  for (const association of [...origins, ...recorded])
    unique.set(
      `${association.targetKind}:${association.targetId}`,
      association,
    );
  return [...unique.values()].sort((left, right) =>
    `${left.targetKind}:${left.targetId}`.localeCompare(
      `${right.targetKind}:${right.targetId}`,
    ),
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function explicitReference(item, candidateText, sameProject) {
  const reasons = [],
    lower = candidateText.toLowerCase();
  if (item.url && lower.includes(item.url.toLowerCase()))
    reasons.push({
      code: "explicit-url",
      detail: `Contains the exact ${item.kind === "issue" ? "issue" : "pull request"} URL.`,
      weight: 100,
    });
  if (item.nodeId && lower.includes(String(item.nodeId).toLowerCase()))
    reasons.push({
      code: "node-id",
      detail: "Contains the GitHub node ID.",
      weight: 100,
    });
  const repository = escapeRegExp(item.repository),
    shortRepository = escapeRegExp(String(item.repository).split("/").at(-1)),
    number = escapeRegExp(item.number),
    kindPath = item.kind === "issue" ? "issues" : "pull",
    references = [
      new RegExp(
        `(?:https?://github\\.com/)?${repository}/${kindPath}/${number}(?:\\b|/)`,
        "i",
      ),
      new RegExp(`\\b${repository}#${number}\\b`, "i"),
      new RegExp(`\\b${shortRepository}#${number}\\b`, "i"),
    ];
  if (
    !reasons.some((reason) => reason.code === "explicit-url") &&
    references.some((reference) => reference.test(candidateText))
  )
    reasons.push({
      code: "explicit-reference",
      detail: `References ${item.repository}#${item.number}.`,
      weight: 85,
    });
  if (
    sameProject &&
    !reasons.some((reason) =>
      ["explicit-url", "explicit-reference"].includes(reason.code),
    ) &&
    new RegExp(`(^|[^\\w])#${number}\\b`).test(candidateText)
  )
    reasons.push({
      code: "scoped-number",
      detail: `References #${item.number} inside the same configured project.`,
      weight: 45,
    });
  return reasons;
}

function scoreCandidate(item, candidate, evidence) {
  const candidateProjectIds = [...new Set(candidate.projectIds)],
    candidateRepositories = [...new Set(candidate.repositories)];
  if (
    item.projectId &&
    candidateProjectIds.length &&
    !candidateProjectIds.includes(item.projectId)
  )
    return null;
  if (
    candidateRepositories.length &&
    !candidateRepositories.includes(item.repository)
  )
    return null;
  const sameProject =
      Boolean(item.projectId) && candidateProjectIds.includes(item.projectId),
    sameRepository = candidateRepositories.includes(item.repository),
    reasons = explicitReference(item, candidate.searchText, sameProject);
  if (sameProject)
    reasons.push({
      code: "same-project",
      detail: `Uses execution project ${item.projectId}.`,
      weight: 15,
    });
  if (sameRepository)
    reasons.push({
      code: "same-repository",
      detail: `References repository ${item.repository}.`,
      weight: 15,
    });

  if (
    evidence.normalizedTitle &&
    evidence.normalizedTitle === candidate.normalizedTitle
  )
    reasons.push({
      code: "exact-title",
      detail: "Has the same normalized title.",
      weight: 70,
    });
  else {
    const shared = intersection(evidence.titleTerms, candidate.titleTerms),
      coverage = evidence.titleTerms.size
        ? shared.length / evidence.titleTerms.size
        : 0;
    if (
      shared.length >= Math.min(2, evidence.titleTerms.size) &&
      coverage >= 0.5
    )
      reasons.push({
        code: "title-terms",
        detail: `Shares title terms: ${shared.slice(0, 8).join(", ")}.`,
        weight: Math.round(45 * coverage),
      });
  }

  const sharedBody = intersection(evidence.bodyTerms, candidate.bodyTerms),
    bodyCoverage = evidence.bodyTerms.size
      ? sharedBody.length / evidence.bodyTerms.size
      : 0;
  if (sharedBody.length >= 3 && bodyCoverage >= 0.18)
    reasons.push({
      code: "source-terms",
      detail: `Shares source terms: ${sharedBody.slice(0, 8).join(", ")}.`,
      weight: Math.min(
        30,
        sharedBody.length * 3 + Math.round(bodyCoverage * 12),
      ),
    });

  const score = reasons.reduce((total, reason) => total + reason.weight, 0);
  if (score < 35) return null;
  return {
    targetKind: candidate.targetKind,
    targetId: candidate.targetId,
    title: candidate.title,
    projectId: candidateProjectIds[0] || null,
    score,
    reasons,
    unconfirmed: true,
  };
}

function candidateIndex(store, data, recordedAssociations) {
  const associationRepositories = new Map();
  for (const association of recordedAssociations) {
    const key = `${association.targetKind}:${association.targetId}`;
    if (!associationRepositories.has(key)) associationRepositories.set(key, []);
    associationRepositories.get(key).push(association.repository);
  }
  const candidates = [
    ...data.tasks.map((task) => ({
      targetKind: "task",
      targetId: task.id,
      title: task.title,
      projectIds: task.projectId ? [task.projectId] : [],
      repositories: [
        task.github?.repository,
        ...(associationRepositories.get(`task:${task.id}`) || []),
      ].filter(Boolean),
      searchText: taskText(data, task),
    })),
    ...store
      .list("plans")
      .filter((plan) => plan.kind !== "conversation" && !plan.deletedAt)
      .map((plan) => ({
        targetKind: "plan",
        targetId: plan.id,
        title: plan.title,
        projectIds: planProjectIds(data, plan),
        repositories: associationRepositories.get(`plan:${plan.id}`) || [],
        searchText: text([plan.title, plan.prompt, plan.text]),
      })),
  ];
  return candidates.map((candidate) => ({
    ...candidate,
    normalizedTitle: normalized(candidate.title),
    titleTerms: terms(candidate.title),
    bodyTerms: terms(candidate.searchText),
  }));
}

function overlapCandidates(item, candidates, associations, limit) {
  if (!["issue", "pull-request"].includes(item.kind)) return [];
  const confirmed = new Set(
      associations.map(
        (association) => `${association.targetKind}:${association.targetId}`,
      ),
    ),
    evidence = {
      normalizedTitle: normalized(item.title),
      titleTerms: terms(item.title),
      bodyTerms: terms(text([item.title, item.body, item.summary])),
    };
  return candidates
    .filter(
      (candidate) =>
        !confirmed.has(`${candidate.targetKind}:${candidate.targetId}`),
    )
    .map((candidate) => scoreCandidate(item, candidate, evidence))
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.targetKind.localeCompare(right.targetKind) ||
        left.targetId.localeCompare(right.targetId),
    )
    .slice(0, Math.max(0, Math.min(25, Number(limit) || 8)));
}

export function decorateQueueItemsWithOverlaps(
  store,
  items,
  { limit = 8 } = {},
) {
  const data = store.read(),
    recordedAssociations = store.list("github_queue_associations"),
    prepared = { data, recordedAssociations },
    candidates = candidateIndex(store, data, recordedAssociations);
  return items.map((item) => {
    const associations = queueItemAssociations(store, item, prepared);
    return {
      ...item,
      associations,
      overlapCandidates: overlapCandidates(
        item,
        candidates,
        associations,
        limit,
      ),
    };
  });
}

export function queueItemOverlapCandidates(store, item, { limit = 8 } = {}) {
  return decorateQueueItemsWithOverlaps(store, [item], { limit })[0]
    .overlapCandidates;
}

export function queueAssociationId(item, targetKind, targetId) {
  return (
    "github-queue-association:" +
    digest(
      [
        item.repository,
        item.kind,
        item.nodeId || `#${item.number}`,
        targetKind,
        targetId,
      ].join("\0"),
    ).slice(0, 24)
  );
}

export function confirmQueueItemLink(store, input, expectedRevision) {
  const item = store.get("github_queue_items", input.itemId);
  if (!item) fail("Queue item not found.", 404);
  if (!["issue", "pull-request"].includes(item.kind))
    fail("Only imported GitHub issues and pull requests can be linked.");
  const targetKind = input.targetKind;
  if (!["task", "plan"].includes(targetKind))
    fail("Choose a task or plan to link.");
  const target =
    targetKind === "task"
      ? store.read().tasks.find((task) => task.id === input.targetId)
      : store.get("plans", input.targetId);
  if (!target || (targetKind === "plan" && target.deletedAt))
    fail(targetKind === "task" ? "Task not found." : "Plan not found.", 404);
  if (
    expectedRevision !== undefined &&
    store.read().revision !== expectedRevision
  )
    fail("Database changed. Reload and review before saving.", 409);
  const origin =
    targetKind === "task" ? taskOriginAssociation(target, item) : null;
  if (origin) return { association: origin, target, existing: true };
  const id = queueAssociationId(item, targetKind, target.id),
    previous = store.get("github_queue_associations", id);
  if (previous) return { association: previous, target, existing: true };
  const association = {
    id,
    queueItemId: item.id,
    repository: item.repository,
    kind: item.kind,
    nodeId: item.nodeId || null,
    number: item.number,
    url: item.url || null,
    bodyHash: item.bodyHash || null,
    targetKind,
    targetId: target.id,
    title: target.title,
    confirmedAt: new Date().toISOString(),
    source: "operator-confirmed",
    ...(typeof input.confirmedBy === "string" && input.confirmedBy.trim()
      ? { confirmedBy: input.confirmedBy.trim().slice(0, 200) }
      : {}),
  };
  return store.transaction(() => {
    store.put("github_queue_associations", association);
    store.event(null, "github.queue.item.linked", {
      associationId: association.id,
      queueItemId: item.id,
      repository: item.repository,
      kind: item.kind,
      number: item.number,
      targetKind,
      targetId: target.id,
    });
    return { association, target, existing: false };
  });
}
