// Approving a spec folder (workflow v1 rule 7): the approver's commit on
// main holds the revision, and this records it. The spec's tasks.md items
// become tasks with their own IDs, the plan keeps the approved mapping, and
// the receipt caches the approval with its commit.
import { approvedSpecDependency } from "../../spec-dependencies.ts";
import { resolveTaskId } from "../../task-identity.ts";
import { randomUUID } from "node:crypto";
import { digest } from "../../model.ts";
import { fail, type Store, type StoredSnapshot } from "../store/store.ts";
import type { Edge, Task } from "../../types.ts";
import { frontMatterCategory } from "../../front-matter.ts";
import {
  checkedItems,
  epicMembers,
  isEpicFolder,
  specEpic,
  specTitle,
} from "./spec-plans.ts";
import { refreshEpicMembers } from "../epics/epics.ts";
import type { Proposal } from "./plan-quality.ts";
import { assertPlanReviewComplete } from "./spec-review.ts";

// A stored plan row, as approval reads and writes it.
interface PlanRow {
  id: string;
  spec?: string;
  hash: string;
  text: string;
  title?: string;
  files?: Record<string, string>;
  mapping?: Record<string, string>;
  reviewHeld?: string[];
  context: {
    selected?: string;
    filters?: { track?: string; scope?: string };
    repositoryId?: string;
  };
  approvalId?: string;
  deletedAt?: string;
  [key: string]: unknown;
}
// A task as one approved revision describes it.
type Design = Partial<Task> & { id: string; title: string };
// Text input, trimmed, or "" when it is not text.
const trimmed = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function baselineAcceptance(
  item: { line: number; key: string; built?: string | null },
  hash: string,
  { at, approver }: { at: string; approver: string },
) {
  return {
    status: "accepted",
    acceptanceEvidence: {
      at,
      evidence:
        `tasks.md line ${item.line} marks ${item.key} [x] at approved revision ${hash}` +
        (item.built ? `. Built: ${item.built}` : ""),
      baseline: { file: "tasks.md", line: item.line, mark: "[x]", hash },
      ...(item.built ? { built: item.built } : {}),
      ...(approver ? { acceptedBy: approver } : {}),
      componentOnly: false,
    },
  };
}
// The two inputs that keep the graph correct are the hashes. Who approved is
// recorded from the workspace's operator when the caller does not say, and
// approval notes are kept only when a caller has something real to add: a
// required field containing a fixed sentence carries less than an absent one.
const plansById = (store: Store) =>
  new Map(
    store
      .list<{ id: string; spec?: string; epic?: string; deletedAt?: string }>(
        "plans",
      )
      .map((plan) => [plan.id, plan]),
  );

// How a spec revision was approved (§4.32.6, §4.42): the approver's commit
// that holds it, or an approval with no commit (a folder outside git).
const approvalRecord = (approver: string, commit: string | null) =>
  commit
    ? { kind: "commit", commit, approvedBy: approver || null }
    : { kind: "local", approvedBy: approver || null };

// An epic folder's approval stores its member list and prose. It never
// approves a member plan or a task (Requirement 59.4).
function approveEpic(
  store: Store,
  data: StoredSnapshot,
  plan: PlanRow,
  {
    expectedRevision,
    approver,
    evidence,
    approvalCommit,
  }: {
    expectedRevision: unknown;
    approver: string;
    evidence: unknown;
    approvalCommit: string | null;
  },
) {
  const now = new Date().toISOString(),
    review = assertPlanReviewComplete(store, plan.id),
    plans = store.list<PlanRow>("plans").filter((entry) => !entry.deletedAt),
    listed = epicMembers(plan.files).map(
      (name) => plans.find((entry) => entry.spec === name)?.id ?? name,
    ),
    receipt = {
      id: "approval-" + randomUUID(),
      planId: plan.id,
      hash: plan.hash,
      source: plan.text,
      approvedBy: approver,
      evidence: trimmed(evidence),
      at: now,
      mapping: {},
      taskIds: [],
      spec: plan.spec,
      files: plan.files,
      approval: approvalRecord(approver, approvalCommit),
      review: {
        commentSnapshot: review.commentSnapshot,
        commentIds: review.comments.map((comment) => comment.id),
      },
      epic: { members: listed },
    };
  store.put("approvals", receipt);
  plan.state = "approved";
  plan.kind = "plan";
  plan.epicFolder = true;
  plan.mapping = {};
  plan.approvalId = receipt.id;
  store.put("plans", plan);
  // This epic's row replaces its last one. Every other row stays: rows
  // from before Requirement 59 are still named by tasks (design §6.9).
  // The stored epic rows.
  const epics: { id?: string }[] = Array.isArray(data.epics) ? data.epics : [];
  data.epics = [
    ...epics.filter((epic) => epic.id !== plan.spec),
    {
      id: plan.spec,
      title: specTitle({ name: plan.spec ?? "", files: plan.files ?? {} }),
      planId: plan.id,
      listed,
      plans: [],
    },
  ];
  refreshEpicMembers(data, plansById(store));
  store.commit(data, "Approve epic " + plan.title, data.revision);
  store.event(null, "plan.approved", {
    planId: plan.id,
    receiptId: receipt.id,
    taskIds: [],
    epic: plan.spec,
  });
  return receipt;
}

// The hash a plan's issues name. An approval carried across a pure layout
// change keeps the one they were projected at, so they need no edit; any
// other approval clears it (design §4.40).

export function approvePlan(
  store: Store,
  {
    id,
    expectedHash,
    expectedRevision,
    approvedBy,
    evidence,
    operator,
    proposals,
    githubPolicy,
    baseline = false,
    declaredDependencies = [],
    // The approver's commit that holds this revision (§4.42), if any.
    approvalCommit = null,
  }: {
    id: unknown;
    expectedHash?: unknown;
    expectedRevision?: unknown;
    approvedBy?: unknown;
    evidence?: unknown;
    operator?: unknown;
    proposals?: Proposal[];
    githubPolicy?: unknown;
    baseline?: boolean;
    declaredDependencies?: { taskId: string; spec?: string; planId: string }[];
    approvalCommit?: string | null;
  },
) {
  // Authorization is the reviewed hash and database revision below. Who
  // approved and why are recorded when supplied; typing them proves nothing.
  return store.transaction(() => {
    const plan = store.get<PlanRow>("plans", id);
    if (!plan) fail("Plan not found.", 404);
    if (!plan.spec) fail("Only a spec folder is approved.", 409);
    if (plan.hash !== expectedHash)
      fail("The reviewed document hash changed.", 409);
    const review = assertPlanReviewComplete(store, plan.id);
    const previous = store
      .list<{ id: string; planId?: string; hash?: string }>("approvals")
      .find((a) => a.planId === id && a.hash === expectedHash);
    if (previous) return { ...previous, existing: true };
    const data = structuredClone(store.read());
    if (data.revision !== expectedRevision)
      fail(
        "Database changed. Review extraction against the current revision.",
        409,
      );
    if (isEpicFolder(plan.files))
      return approveEpic(store, data, plan, {
        expectedRevision,
        approver: trimmed(approvedBy) || trimmed(operator),
        evidence,
        approvalCommit,
      });
    // A spec plan's tasks keep their tasks.md IDs; its tasks.md is plan.text.
    const spec = plan.spec,
      items = proposals ?? [],
      mapping: Record<string, string> = Object.fromEntries(
        items.map((t) => [
          t.id,
          resolveTaskId(data, t.taskId || plan.mapping?.[t.id] || t.id),
        ]),
      );
    if (new Set(Object.values(mapping)).size !== items.length)
      fail(
        "Use one task block per canonical deliverable; combine repeated references.",
      );
    const documentId = `spec:${spec}`,
      now = new Date().toISOString(),
      known = new Set([
        ...data.tasks.map((t) => t.id),
        ...Object.values(mapping),
      ]),
      // Work a person already checked off: the [x] items of the stored
      // tasks.md this approval covers. Only the plan.approve operation asks
      // for it, and only a task this approval creates starts accepted.
      checked = baseline
        ? checkedItems(spec, plan.text)
        : new Map<string, never>(),
      baselined: string[] = [],
      approver = trimmed(approvedBy) || trimmed(operator);
    const oldMapping = plan.mapping || {};
    // A task with an issue may leave the spec: Spec changed (RC2.8) closes
    // its issue and archives it.
    for (const oldId of Object.keys(oldMapping))
      if (
        !mapping[oldId] &&
        !data.tasks.find((t) => t.id === oldMapping[oldId])?.github?.number
      )
        fail(
          "Removing an approved task requires explicitly retiring it before this amendment.",
        );
    // What review covers for one task: its entry and its incoming plan edges.
    // Line numbers are left out, since editing another entry shifts them.
    const entry = (task: Task) =>
        JSON.stringify([
          ...[
            "title",
            "summary",
            "acceptance",
            "nextAction",
            "track",
            "tags",
            "resources",
            "repositoryId",
            "kind",
            "route",
            "completion",
            "repository",
            "authority",
            "parent",
            "paths",
            "type",
            "manual",
          ].map((key) => task[key] ?? null),
          task.source?.hash ?? null,
          // Foreign edges are materialized at Store.commit, after this review
          // comparison. Their declaration is the stable reviewed contract in
          // either the pending or resolved state.
          [
            ...new Set([
              ...data.edges
                .filter((e) => e.to === task.id && e.planId === id)
                .map((e) => `${e.from}:${e.kind}:${e.condition ?? ""}`),
              ...(task.specDependencies || []).map(
                (ref) => `${ref.taskId}:${ref.kind}:${ref.condition ?? ""}`,
              ),
            ]),
          ].sort(),
          (task.specDependencies || [])
            .map((ref) =>
              JSON.stringify([
                ref.taskId,
                ref.spec,
                ref.planId,
                ref.kind,
                ref.condition ?? null,
              ]),
            )
            .sort(),
        ]),
      before = new Map(
        data.tasks
          .filter((t) => t.planId === id)
          .map((t) => [
            t.id,
            {
              entry: entry(t),
              needsReview: t.needsReview,
              prior: {
                title: t.title ?? null,
                summary: t.summary ?? null,
                acceptance: t.acceptance ?? null,
              },
            },
          ]),
      ),
      held = new Set(plan.reviewHeld || []),
      edgeById = new Map(
        data.edges.filter((e) => e.id).map((e) => [String(e.id), e]),
      ),
      foreignDeclarations = new Map(
        declaredDependencies.map((entry) => [entry.taskId, entry]),
      ),
      livePlans = new Set(
        store
          .list<PlanRow>("plans")
          .filter((entry) => !entry.deletedAt)
          .map((entry) => entry.id),
      );
    for (const proposal of items) {
      const taskId = mapping[proposal.id],
        existing = data.tasks.find((t) => t.id === taskId),
        contextTask = data.tasks.find(
          (t) => t.id === resolveTaskId(data, plan.context.selected ?? ""),
        );
      const track =
        plan.context.filters?.track || contextTask?.track || "catalog";
      if (!(data.tracks ?? []).some((t) => t.id === track))
        fail("Unknown track " + track);
      const specDependencies = (proposal.requires || []).flatMap((ref) => {
          const declared = foreignDeclarations.get(ref);
          return declared && !mapping[ref]
            ? [{ ...declared, kind: "requires" }]
            : [];
        }),
        design: Design = {
          id: taskId,
          title: proposal.title,
          ...(proposal.summary ? { summary: proposal.summary } : {}),
          acceptance: proposal.acceptance,
          nextAction: proposal.title,
          track,
          repositoryId: plan.context.repositoryId,
          ...Object.fromEntries(
            [
              "kind",
              "repository",
              "paths",
              "type",
              "specType",
              "manual",
              "refs",
            ]
              .filter((key) => proposal[key] !== undefined)
              .map((key) => [key, proposal[key]]),
          ),
          planId: plan.id,
          planHash: plan.hash,
          ...(specDependencies.length ? { specDependencies } : {}),
          contextDocuments: [documentId],
          source: {
            document: documentId,
            key: proposal.id,
            lineStart: proposal.lineStart,
            lineEnd: proposal.lineEnd,
            hash: digest(
              plan.text
                .split("\n")
                .slice((proposal.lineStart ?? 1) - 1, proposal.lineEnd)
                .join("\n"),
            ),
          },
          statusAuthority: "database",
          updatedAt: now,
        };
      // A spec plan's phase groups only (Requirement 59.5); its epic is the
      // plan's, so a task never stores one.
      if (
        checked.has(proposal.id) &&
        specDependencies.some((ref) => {
          const owner = store.get<PlanRow>("plans", ref.planId) ?? undefined,
            receipt = owner?.approvalId
              ? (store.get<{ id: string; hash?: string; taskIds?: string[] }>(
                  "approvals",
                  owner.approvalId,
                ) ?? undefined)
              : undefined;
          return !approvedSpecDependency(
            ref,
            data.tasks.find((task) => task.id === ref.taskId),
            owner,
            receipt,
          );
        })
      )
        fail(
          "A checked task cannot be baselined before its referenced spec owners are approved.",
          409,
        );
      if (proposal.phase) design.phase = proposal.phase;
      // A spec plan names parents by nesting in tasks.md (spec-plans.mjs);
      // the parent is in the same plan, so it is in mapping.
      if (proposal.parent) design.parent = mapping[proposal.parent];
      if (existing && existing.planId !== id) {
        existing.contextDocuments = [
          ...new Set([...(existing.contextDocuments || []), documentId]),
        ];
        existing.sourceReferences = [
          ...(existing.sourceReferences || []).filter(
            (ref) => ref.document !== documentId || ref.key !== proposal.id,
          ),
          {
            document: documentId,
            ...design.source,
            planId: plan.id,
            approvedSource: {
              hash: plan.hash,
              text: plan.text
                .split("\n")
                .slice((proposal.lineStart ?? 1) - 1, proposal.lineEnd)
                .join("\n"),
            },
          },
        ];
      } else if (existing) {
        if (!specDependencies.length) {
          delete existing.specDependencies;
          delete existing.pendingSpecDependencies;
        }
        // A fact the new revision drops leaves the task.
        for (const key of [
          "paths",
          "type",
          "specType",
          "phase",
          "manual",
          "refs",
        ])
          if (design[key] === undefined) delete existing[key];
        delete existing.epic;
        // An item moved out from under its epic loses that parent.
        if (design.parent === undefined) delete existing.parent;
        Object.assign(existing, design, { needsReview: true });
      } else {
        const baselineItem = checked.get(proposal.id);
        if (baselineItem) baselined.push(taskId);
        data.tasks.push({
          ...design,
          scope:
            plan.context.filters?.scope === "runtime" ? "runtime" : "catalog",
          kind: proposal.kind || "task",
          status: "planned",
          createdAt: now,
          needsReview: false,
          ...(baselineItem
            ? baselineAcceptance(baselineItem, plan.hash, {
                at: now,
                approver,
              })
            : {}),
        });
      }
      data.edges = data.edges.filter((e) => {
        const drop = e.to === taskId && e.planId === id;
        if (drop && edgeById.get(String(e.id)) === e)
          edgeById.delete(String(e.id));
        return !drop;
      });
      const kind = "requires";
      for (const ref of proposal.requires || []) {
        const from = resolveTaskId(data, mapping[ref] || ref);
        if (foreignDeclarations.has(ref) && !mapping[ref]) {
          const expected = foreignDeclarations.get(ref),
            target = data.tasks.find((task) => task.id === from);
          if (target && target.planId !== expected?.planId)
            fail(
              "Foreign dependency ownership does not match its declaration: " +
                ref,
              409,
            );
          continue;
        }
        if (!known.has(from)) fail("Unknown " + kind + " reference " + ref);
        const edgeId = `${from}:${kind}:${taskId}`,
          same = edgeById.get(edgeId);
        // An edge ID is unique. Another live plan's copy of the same edge
        // stays its own; an unowned one (imported, hand-made, or from an
        // old revision that did not name it) becomes this plan's.
        if (same?.planId && same.planId !== id && livePlans.has(same.planId))
          continue;
        if (same) data.edges.splice(data.edges.indexOf(same), 1);
        const edge: Edge = {
          id: edgeId,
          from,
          to: taskId,
          kind,
          planId: plan.id,
          reason: "Approved plan revision " + plan.hash.slice(0, 12),
        };
        data.edges.push(edge);
        edgeById.set(edgeId, edge);
      }
    }
    // Sequence edges also participate in readiness, so reject cycles across both kinds.
    const graph = new Map<string, string[]>(),
      active = new Set<string>(),
      seen = new Set<string>();
    for (const e of data.edges.filter((e) =>
      ["requires", "sequence"].includes(e.kind),
    )) {
      if (!graph.has(e.from)) graph.set(e.from, []);
      graph.get(e.from)?.push(e.to);
    }
    const visit = (id: string) => {
      if (active.has(id)) fail("Dependency cycle " + id);
      if (seen.has(id)) return;
      active.add(id);
      for (const to of graph.get(id) || []) visit(to);
      active.delete(id);
      seen.add(id);
    };
    for (const task of data.tasks) visit(task.id);
    // Only a changed entry needs review again. An unchanged task keeps
    // the state it had before this draft and so keeps its ready label.
    for (const task of data.tasks) {
      const prior = before.get(task.id);
      if (!prior || task.planId !== id) continue;
      task.needsReview =
        entry(task) !== prior.entry ||
        Boolean(prior.needsReview && !held.has(task.id));
      // Keep the text as last reviewed, so Needs you can show what changed.
      if (!task.needsReview) delete task.reviewPrior;
      else if (entry(task) !== prior.entry && !task.reviewPrior)
        task.reviewPrior = prior.prior;
    }
    delete plan.reviewHeld;
    // The category the approved revision's own front-matter names, if any
    // (Requirement 30.9). Avoozl never makes one up.
    const category = frontMatterCategory(
      plan.files?.["requirements.md"] ?? plan.files?.["bugfix.md"],
    );
    data.documents[documentId] = {
      id: documentId,
      path: documentId,
      title: plan.title,
      text: plan.text,
      hash: plan.hash,
      modifiedAt: now,
      links: [],
      rawLinks: [],
      managed: false,
      virtual: true,
      plan: {
        status: "started",
        ...(category ? { category } : {}),
        taskIds: Object.values(mapping),
      },
    };
    // Excerpts refer to the immutable receipt.
    for (const t of data.tasks.filter((t) => t.planId === id))
      t.approvedSource = {
        hash: plan.hash,
        text: plan.text
          .split("\n")
          .slice((t.source?.lineStart ?? 1) - 1, t.source?.lineEnd)
          .join("\n"),
      };
    const receipt = {
      id: "approval-" + randomUUID(),
      planId: id,
      hash: plan.hash,
      source: plan.text,
      approvedBy: approver,
      evidence: trimmed(evidence),
      ...(baselined.length ? { baseline: baselined } : {}),
      at: now,
      mapping,
      taskIds: Object.values(mapping),
      spec,
      files: plan.files,
      approval: approvalRecord(approver, approvalCommit),
      review: {
        commentSnapshot: review.commentSnapshot,
        commentIds: review.comments.map((comment) => comment.id),
      },
    };
    store.put("approvals", receipt);
    plan.state = "approved";
    // The epic this revision's front-matter names; an epic counts the plan
    // only while both sides agree (Requirement 59.2).
    plan.epic = specEpic(plan.files ?? {});
    plan.documentId = documentId;
    plan.mapping = mapping;
    plan.approvalId = receipt.id;
    store.put("plans", plan);
    refreshEpicMembers(data, plansById(store));
    store.commit(data, "Approve " + plan.title, data.revision);
    store.event(null, "plan.approved", {
      planId: id,
      receiptId: receipt.id,
      taskIds: receipt.taskIds,
    });
    return receipt;
  });
}
