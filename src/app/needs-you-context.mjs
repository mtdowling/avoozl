// What a person needs to decide a Needs you item without opening anything
// else: its spec, its task, what it unblocks, the task text, and the review
// evidence for a draft. Built from stored records only; it makes no GitHub
// call and writes nothing.
import { taskSourceRefs } from "../task-identity.mjs";
import { linkSets } from "./scm-links.mjs";
import { planReviewSummary } from "./plan-review-summary.mjs";

const BLOCKING = new Set(["requires", "sequence"]);
const SHOWN_DEPENDENTS = 5;

const specName = (task) => {
  for (const ref of taskSourceRefs(task)) {
    const name =
      typeof ref.document === "string"
        ? ref.document.match(/^\.kiro\/specs\/([^/]+)\//)?.[1]
        : null;
    if (name) return name;
  }
  return null;
};

const textOf = (task) => ({
  summary: typeof task.summary === "string" ? task.summary : null,
  acceptance: Array.isArray(task.acceptance)
    ? task.acceptance.map(String)
    : typeof task.acceptance === "string"
      ? [task.acceptance]
      : [],
});

// The spec a task belongs to: its stored plan, else the spec folder its
// source names. `planId` is null when no stored plan exists, so the page
// shows the name without a link.
function specOf(task, plans) {
  const plan = task.planId ? plans.get(task.planId) : null;
  const name = plan?.spec ?? specName(task);
  if (!plan && !name) return null;
  return {
    planId: plan?.id ?? null,
    name: name ?? null,
    title: plan?.title ?? name ?? task.planId,
  };
}

function sourceOf(task) {
  const ref = taskSourceRefs(task).find((r) => typeof r.document === "string");
  if (!ref) return null;
  return {
    path: ref.document,
    lineStart: Number.isInteger(ref.lineStart) ? ref.lineStart : null,
    lineEnd: Number.isInteger(ref.lineEnd) ? ref.lineEnd : null,
  };
}

// Items that name a task get `context`; a review group's tasks each get a
// lighter one; a draft review gets its spec and review summary.
export function addItemContext(store, data, items) {
  const plans = new Map(
    store
      .list("plans")
      .filter((plan) => !plan.deletedAt)
      .map((plan) => [plan.id, plan]),
  );
  const byId = new Map(data.tasks.map((task) => [task.id, task]));
  const dependents = new Map();
  for (const edge of data.edges)
    if (BLOCKING.has(edge.kind)) {
      if (!dependents.has(edge.from)) dependents.set(edge.from, new Set());
      dependents.get(edge.from).add(edge.to);
    }
  let links = null;
  const linksOf = (id) => {
    if (links === null) {
      try {
        links = linkSets(store, { data }).tasks;
      } catch {
        links = {};
      }
    }
    return links[id] ?? null;
  };
  const light = (task) => ({
    task: { id: task.id, title: task.title ?? task.id },
    spec: specOf(task, plans),
    source: sourceOf(task),
    text: textOf(task),
    prior: task.reviewPrior
      ? { title: task.reviewPrior.title ?? null, ...textOf(task.reviewPrior) }
      : null,
  });
  for (const item of items) {
    if (item.kind === "review") {
      for (const entry of item.tasks ?? []) {
        const task = byId.get(entry.id);
        if (task) entry.context = light(task);
      }
      continue;
    }
    if (item.planReview) {
      const plan = plans.get(item.planReview.planId);
      let review = null;
      try {
        review = planReviewSummary(store, item.planReview.planId);
      } catch {
        // The plan went away; the item clears on the next read.
      }
      item.context = {
        spec: plan
          ? { planId: plan.id, name: plan.spec ?? null, title: plan.title ?? plan.spec ?? plan.id }
          : null,
        review: review && {
          state: review.state,
          current: review.current,
          reviewerModel: review.reviewerModel,
          openBySeverity: review.openBySeverity,
          found: review.found,
          fixed: review.fixed,
          summary: review.summary,
        },
      };
      continue;
    }
    const id = item.taskId ?? null;
    const task = id ? byId.get(id) : null;
    if (!task) continue;
    const blocked = [...(dependents.get(id) ?? [])]
      .map((to) => byId.get(to))
      .filter(Boolean);
    item.context = {
      ...light(task),
      unblocks: {
        total: blocked.length,
        tasks: blocked
          .slice(0, SHOWN_DEPENDENTS)
          .map((t) => ({ id: t.id, title: t.title ?? t.id })),
      },
      links: linksOf(id),
    };
  }
  return items;
}
