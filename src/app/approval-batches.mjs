// Batch approval of spec plans (plan.approveMany) and the order drafts can
// be approved in (plan.approvalBatches). A batch runs plan.approve's checks
// on every spec, then approves all of them in one transaction or none.
import { approvedSpecDependency } from "../spec-dependencies.mjs";
import { claimedTaskIds } from "./delivery.mjs";
import { planningIdentity } from "./github-marker.mjs";
import { previewProjection } from "./github-preview.mjs";
import { approvePlan } from "./plans.mjs";
import {
  approvalState,
  openBatchApproval,
  reconcileApproval,
} from "./spec-approval.mjs";
import { fail } from "./store.mjs";

const MAX_ITEMS = 500;

// Layers of a dependency graph, where `needs` names nodes that must come
// first. Nodes in a loop share a layer, so a loop is never split. Layer 1
// needs nothing outside itself; each next layer needs only earlier ones.
export function approvalLayers(nodes) {
  const ids = nodes.map((node) => node.id),
    needs = new Map(
      nodes.map((node) => [
        node.id,
        node.needs.filter((id) => id !== node.id && ids.includes(id)),
      ]),
    );
  // Tarjan's strongly connected components; 41 Nupp specs fit recursion.
  const index = new Map(),
    low = new Map(),
    stack = [],
    onStack = new Set(),
    component = new Map(),
    components = [];
  const visit = (id) => {
    index.set(id, index.size);
    low.set(id, index.get(id));
    stack.push(id);
    onStack.add(id);
    for (const next of needs.get(id)) {
      if (!index.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id), low.get(next)));
      } else if (onStack.has(next))
        low.set(id, Math.min(low.get(id), index.get(next)));
    }
    if (low.get(id) !== index.get(id)) return;
    const members = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.set(member, components.length);
      members.push(member);
    } while (member !== id);
    components.push(members);
  };
  for (const id of ids) if (!index.has(id)) visit(id);
  // Tarjan emits a component after every component it needs, so one pass
  // in emit order sets each layer from finished ones.
  const layer = components.map(() => 1);
  components.forEach((members, at) => {
    for (const id of members)
      for (const next of needs.get(id))
        if (component.get(next) !== at)
          layer[at] = Math.max(layer[at], layer[component.get(next)] + 1);
  });
  const result = [];
  components.forEach((members, at) => {
    (result[layer[at] - 1] ||= []).push(...members);
  });
  // Keep the caller's order inside a layer.
  return result.map((members) => ids.filter((id) => members.includes(id)));
}

// Each draft spec plan and the draft plans whose tasks it still waits on.
function drafts(ops) {
  const store = ops.store,
    rows = new Map(ops.read().tasks.map((task) => [task.id, task])),
    plans = store
      .list("plans")
      .filter(
        (plan) =>
          plan.spec &&
          !plan.deletedAt &&
          !plan.archivedAt &&
          plan.kind !== "conversation" &&
          !ops.planApproved(plan),
      )
      .sort((a, b) => String(a.spec).localeCompare(String(b.spec))),
    ids = new Set(plans.map((plan) => plan.id));
  return plans.map((plan) => {
    let quality = null,
      error = null;
    try {
      quality = ops.lintSpecPlan(plan, [], { content: false });
    } catch (caught) {
      error = caught.message;
    }
    const needs = new Set(),
      waitsOn = new Set();
    for (const ref of quality?.declaredDependencies || []) {
      const owner = store.get("plans", ref.planId),
        receipt = owner?.approvalId && store.get("approvals", owner.approvalId);
      if (approvedSpecDependency(ref, rows.get(ref.taskId), owner, receipt))
        continue;
      if (ids.has(ref.planId)) needs.add(ref.planId);
      else waitsOn.add(ref.spec);
    }
    return {
      plan,
      quality,
      error,
      needs: [...needs],
      waitsOn: [...waitsOn],
    };
  });
}

const errorsOf = (draft) =>
  draft.error
    ? 1
    : (draft.quality?.diagnostics || []).filter(
        (diagnostic) => diagnostic.severity === "error",
      ).length;

// Approve every prepared plan in one transaction, owners first. A failure
// rolls back every approval and is returned with the others.
function approveSet(store, prepared, { githubPolicy, operator }) {
  const inSet = new Set(prepared.map((entry) => entry.plan.id)),
    byId = new Map(prepared.map((entry) => [entry.plan.id, entry])),
    order = approvalLayers(
      prepared.map((entry) => ({
        id: entry.plan.id,
        needs: (entry.quality.declaredDependencies || [])
          .map((ref) => ref.planId)
          .filter((id) => inSet.has(id)),
      })),
    ).flat(),
    failures = [],
    approved = [],
    rollback = Symbol("rollback");
  try {
    store.transaction(() => {
      for (const id of order) {
        const entry = byId.get(id);
        try {
          approved.push(
            approvePlan(store, {
              id,
              expectedHash: entry.expectedHash,
              expectedRevision: store.read().revision,
              githubPolicy,
              proposals: entry.quality.proposals,
              baseline: true,
              declaredDependencies: entry.quality.declaredDependencies,
              coApproved: inSet,
              approvedBy: entry.approver,
              evidence: entry.evidence,
              operator,
            }),
          );
        } catch (error) {
          failures.push({ id, spec: entry.plan.spec, error: error.message });
        }
      }
      // A checked task was let through on a peer in this set; once every
      // peer is approved its owners must have resolved.
      if (!failures.length) {
        const tasks = new Map(
          store.read().tasks.map((task) => [task.id, task]),
        );
        for (const receipt of approved)
          for (const taskId of receipt.baseline || [])
            if (tasks.get(taskId)?.pendingSpecDependencies?.length)
              failures.push({
                id: receipt.planId,
                spec: byId.get(receipt.planId).plan.spec,
                error: `A checked task cannot be baselined before its referenced spec owners are approved: ${taskId} needs ${tasks
                  .get(taskId)
                  .pendingSpecDependencies.map((ref) => ref.spec)
                  .join(", ")}.`,
              });
      }
      if (failures.length) throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return failures.length
    ? { ok: false, approved: [], failures }
    : { ok: true, approved, failures: [] };
}

function readItems(items) {
  if (!Array.isArray(items) || !items.length)
    fail("Name at least one spec to approve: items:[{id, expectedHash}].");
  if (items.length > MAX_ITEMS)
    fail(`Approve at most ${MAX_ITEMS} specs at once.`);
  const seen = new Set();
  for (const item of items) {
    if (
      typeof item?.id !== "string" ||
      !item.id ||
      typeof item.expectedHash !== "string" ||
      !item.expectedHash
    )
      fail("Each item needs an id and an expectedHash.");
    if (seen.has(item.id)) fail(`Spec ${item.id} is listed twice.`);
    seen.add(item.id);
  }
  return items;
}

// plan.approveMany: plan.approve's checks for each spec, then all of them
// in one transaction. Specs in the set may satisfy each other's owners.
export async function approveMany(ops, input = {}) {
  const store = ops.store,
    items = readItems(input.items);
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== ops.read().revision
  )
    fail(
      "Database changed. Review the specs against the current revision.",
      409,
    );
  const failures = [],
    prepared = [],
    // Specs whose approval is a pull request that has not merged yet.
    gated = [];
  for (const item of items) {
    try {
      const checked = ops.approvalChecks({
        id: item.id,
        expectedHash: item.expectedHash,
      });
      if (!checked.plan.spec)
        fail("Batch approval takes spec plans. Approve this plan on its own.");
      let approver = input.approvedBy?.trim() || ops.operator,
        evidence = input.evidence;
      // A spec whose approval is a pull request is approved once that pull
      // request has merged, as plan.approve does.
      const target = ops.approvalGateTarget(checked.plan);
      let state = null;
      if (target) {
        state = await reconcileApproval(store, {
          github: ops.github,
          repository: target.repository,
          ...(target.ref ? { ref: target.ref } : {}),
          planId: checked.plan.id,
          hash: checked.plan.hash,
        });
        if (state?.state === "merged") {
          approver = state.approvedBy;
          evidence = evidence || `Approval merged at ${state.commit}.`;
        }
      }
      const entry = {
        plan: checked.plan,
        quality: checked.specQuality,
        expectedHash: item.expectedHash,
        approver,
        evidence,
      };
      prepared.push(entry);
      if (target && state?.state !== "merged")
        gated.push({ entry, target, state });
    } catch (error) {
      failures.push({
        id: item.id,
        spec: store.get("plans", item.id)?.spec ?? null,
        error: error.message,
      });
    }
  }
  if (failures.length) return { ok: false, approved: [], failures };
  const options = {
    githubPolicy: ops.githubPolicy(),
    operator: input.operator || ops.operator,
  };
  if (gated.length) {
    // Approval waits on pull requests. Open them only for a batch that
    // would approve: try it on a scratch copy first.
    const scratch = store.scratch();
    let trial;
    try {
      trial = approveSet(scratch, prepared, options);
    } finally {
      scratch.close();
    }
    if (!trial.ok) return trial;
    return {
      ok: false,
      pending: true,
      approved: [],
      failures: [],
      approvalPullRequests: await openGatePullRequests(ops, gated, input),
    };
  }
  const result = approveSet(store, prepared, options);
  if (!result.ok) return result;
  // One approval record each; each issue hears of it once (RC18.4).
  for (const receipt of result.approved) {
    if (receipt.existing) continue;
    const entry = prepared.find((p) => p.plan.id === receipt.planId);
    await ops.afterApproval(entry.plan, {
      approver: entry.approver,
      commit: approvalState(store, entry.plan.id, entry.plan.hash)?.commit,
      viaLabel: false,
    });
  }
  return result;
}

// One approval pull request per target for the specs waiting on one. A spec
// whose pull request is already open keeps it.
async function openGatePullRequests(ops, gated, input) {
  const groups = new Map();
  for (const gate of gated) {
    const key = JSON.stringify([
      gate.target.repository.id,
      gate.target.ref ?? null,
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(gate);
  }
  const pulls = new Map();
  for (const group of groups.values()) {
    const { target } = group[0],
      states = await openBatchApproval(ops.store, {
        github: ops.github,
        repository: target.repository,
        ...(target.ref ? { ref: target.ref } : {}),
        approvedBy: input.approvedBy?.trim() || ops.operator,
        specs: group.map(({ entry, target: own }) => ({
          planId: entry.plan.id,
          hash: entry.plan.hash,
          spec: entry.plan.spec,
          files: entry.plan.files || {},
          diagnostics: entry.quality.diagnostics,
          decisionRecord: own.decisionRecord,
        })),
      });
    for (const { entry } of group) {
      const state = states.get(entry.plan.id),
        key = `${state.repository}#${state.number}`;
      if (!pulls.has(key))
        pulls.set(key, {
          repository: state.repository,
          number: state.number,
          branch: state.branch,
          specs: [],
        });
      pulls.get(key).specs.push(entry.plan.spec);
    }
  }
  return [...pulls.values()];
}

// GitHub issue writes projecting each plan would make, read against a
// scratch store where the plans are approved. Null without a GitHub mode.
async function projectionWrites(ops, target, planIds) {
  let policy = null;
  try {
    policy = ops.githubPolicy();
  } catch {
    policy = null;
  }
  const configured = ops.store.list("github_repositories");
  if (!policy?.mode || policy.mode === "local" || configured.length !== 1)
    return new Map();
  const result = new Map();
  for (const planId of planIds) {
    try {
      const preview = await previewProjection(target, ops.github, {
        planId,
        repository: configured[0].id,
        identity: planningIdentity(ops.workspaceRoot),
        policy,
        claimed: claimedTaskIds(target),
      });
      result.set(planId, { writes: preview.writes.length });
    } catch (error) {
      result.set(planId, { writes: null, writesError: error.message });
    }
  }
  return result;
}

function gateOf(ops, plan) {
  try {
    return Boolean(ops.approvalGateTarget(plan));
  } catch {
    // approveMany reports the reason; the preview only marks the spec.
    return false;
  }
}

function entryOf(draft, batch, inBatch) {
  return {
    id: draft.plan.id,
    spec: draft.plan.spec,
    title: draft.plan.title,
    hash: draft.plan.hash,
    batch,
    tasks: draft.quality?.proposals?.length ?? 0,
    errors: errorsOf(draft),
    // Draft specs in this same batch whose tasks this one needs: a loop.
    loop: draft.needs.filter((id) => inBatch.has(id)).length > 0,
    needs: draft.needs,
    ...(draft.waitsOn.length ? { waitsOn: draft.waitsOn } : {}),
  };
}

// plan.approvalBatches: read only. Draft spec plans in the order they can
// be approved. With {writes:true}, each entry also counts the GitHub issue
// writes projecting it would make once its batch and the ones before it
// are approved. With {ids}, `selection` simulates approving just those.
export async function approvalBatches(ops, input = {}) {
  const all = drafts(ops),
    byId = new Map(all.map((draft) => [draft.plan.id, draft])),
    layers = approvalLayers(
      all.map((draft) => ({ id: draft.plan.id, needs: draft.needs })),
    ),
    batches = layers.map((ids, at) => {
      const inBatch = new Set(ids);
      return {
        batch: at + 1,
        specs: ids.map((id) => entryOf(byId.get(id), at + 1, inBatch)),
      };
    });
  const named = (id) => byId.get(id)?.plan.spec || id;
  for (const batch of batches)
    for (const entry of batch.specs) entry.needs = entry.needs.map(named);
  const simulate = (target, ids) =>
    approveSet(
      target,
      ids
        .map((id) => byId.get(id))
        .filter((draft) => draft.quality && !errorsOf(draft))
        .map((draft) => ({
          plan: draft.plan,
          quality: draft.quality,
          expectedHash: draft.plan.hash,
          approver: ops.operator,
        })),
      { githubPolicy: ops.githubPolicy(), operator: ops.operator },
    );
  const result = { batches };
  if (input.writes) {
    const scratch = ops.store.scratch();
    try {
      for (const batch of batches) {
        const ids = batch.specs.map((entry) => entry.id),
          approved = simulate(scratch, ids);
        if (!approved.ok) {
          for (const failure of approved.failures)
            Object.assign(
              batch.specs.find((entry) => entry.id === failure.id) || {},
              { failure: failure.error },
            );
          break;
        }
        const writes = await projectionWrites(ops, scratch, ids);
        for (const entry of batch.specs)
          Object.assign(entry, writes.get(entry.id) || { writes: 0 });
      }
    } finally {
      scratch.close();
    }
  }
  if (Array.isArray(input.ids)) {
    const unknown = input.ids.filter((id) => !byId.has(id));
    if (unknown.length) fail(`Not a draft spec: ${unknown.join(", ")}.`, 404);
    const scratch = ops.store.scratch();
    try {
      const approved = simulate(scratch, input.ids),
        writes = approved.ok
          ? await projectionWrites(ops, scratch, input.ids)
          : new Map(),
        inSet = new Set(input.ids),
        specs = input.ids.map((id) => ({
          ...batches
            .flatMap((batch) => batch.specs)
            .find((entry) => entry.id === id),
          ...(writes.get(id) || {}),
          ...(gateOf(ops, byId.get(id).plan) ? { pullRequest: true } : {}),
        }));
      result.selection = {
        ok: approved.ok && specs.every((entry) => !entry.errors),
        specs,
        writes: specs.reduce((sum, entry) => sum + (entry.writes || 0), 0),
        // Specs approved through an approval pull request: approving opens
        // one for them, and they are approved once it merges.
        pullRequest: specs.filter((entry) => entry.pullRequest).length,
        failures: [
          ...specs
            .filter((entry) => entry.errors)
            .map((entry) => ({
              id: entry.id,
              spec: entry.spec,
              error: `${entry.errors} lint error${entry.errors === 1 ? "" : "s"}.`,
            })),
          ...approved.failures,
        ],
        // Earlier-batch specs this selection needs that it leaves out.
        missing: [
          ...new Set(
            input.ids.flatMap((id) =>
              byId
                .get(id)
                .needs.filter((need) => !inSet.has(need))
                .map(named),
            ),
          ),
        ],
      };
    } finally {
      scratch.close();
    }
  }
  return result;
}
