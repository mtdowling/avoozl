// What a person needs to decide a Needs you item without opening anything
// else: its spec, its task, what it unblocks, the task text, and the failing
// checks with their first error line
// when the task stopped on them. Built from stored records only; it makes no
// GitHub call and writes nothing.
import { taskSourceRefs } from "../../task-identity.ts";
import { linkSets } from "../tasks/scm-links.ts";
import type { Store } from "../store/store.ts";
import type { Snapshot, Task } from "../../types.ts";

// One failing check a delivery kept.
type FailedCheck = { name: unknown; conclusion?: string; firstError?: string };
// A task delivery, as far as its failed checks go.
interface Delivery {
  id: string;
  state?: string;
  cause?: string;
  failedChecks?: { cause?: string; commit?: string; checks?: FailedCheck[] };
}
type Plan = { id: string; spec?: string; title?: string; deletedAt?: string };
// The task text a person reads.
type Text = { summary?: unknown; acceptance?: unknown; title?: string };
// One Needs you item; context is added in place.
interface Item {
  kind?: string;
  taskId?: string | null;
  tasks?: { id: string; context?: unknown }[];
  context?: { failedChecks?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

const BLOCKING = new Set(["requires", "sequence"]);

// The checks a delivery stopped on (pr-landing.mjs sendFailureBack), while
// it still waits on that same cause; else null.
function failedChecksOf(store: Store, taskId: string) {
  let delivery: Delivery | null = null;
  try {
    delivery = store.get<Delivery>("task_deliveries", taskId);
  } catch {
    return null;
  }
  const kept = delivery?.failedChecks;
  // A decision with no kept failed checks (the cause was not a failing check)
  // has nothing to show; reading `kept.commit` there was a 500.
  if (delivery?.state !== "decision" || !kept || kept.cause !== delivery.cause)
    return null;
  return {
    commit: kept.commit ?? null,
    checks: (kept.checks ?? []).map((c) => ({
      name: String(c.name),
      conclusion: c.conclusion ?? null,
      firstError: c.firstError ?? null,
    })),
  };
}
const SHOWN_DEPENDENTS = 5;

const specName = (task: Task) => {
  for (const ref of taskSourceRefs(task)) {
    const name =
      typeof ref.document === "string"
        ? ref.document.match(/^\.kiro\/specs\/([^/]+)\//)?.[1]
        : null;
    if (name) return name;
  }
  return null;
};

const textOf = (task: Text) => ({
  summary: (typeof task.summary === "string" && task.summary.trim()) || null,
  acceptance: Array.isArray(task.acceptance)
    ? task.acceptance.map(String)
    : typeof task.acceptance === "string"
      ? [task.acceptance]
      : [],
});

// The spec a task belongs to: its stored plan, else the spec folder its
// source names. `planId` is null when no stored plan exists, so the page
// shows the name without a link.
function specOf(task: Task, plans: Map<string, Plan>) {
  const plan = task.planId ? plans.get(String(task.planId)) : null;
  const name = plan?.spec ?? specName(task);
  if (!plan && !name) return null;
  return {
    planId: plan?.id ?? null,
    name: name ?? null,
    title: plan?.title ?? name ?? task.planId,
  };
}

function sourceOf(task: Task) {
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
export function addItemContext(store: Store, data: Snapshot, items: Item[]) {
  const plans = new Map(
    store
      .list<Plan>("plans")
      .filter((plan) => !plan.deletedAt)
      .map((plan) => [plan.id, plan]),
  );
  const byId = new Map(data.tasks.map((task) => [task.id, task]));
  const dependents = new Map<string, Set<string>>();
  for (const edge of data.edges)
    if (BLOCKING.has(String(edge.kind)))
      dependents.set(
        edge.from,
        new Set([...(dependents.get(edge.from) ?? []), edge.to]),
      );
  let links: Record<string, unknown> | null = null;
  const linksOf = (id: string) => {
    if (links === null) {
      try {
        links = linkSets(store, { data }).tasks as Record<string, unknown>;
      } catch {
        links = {};
      }
    }
    return links[id] ?? null;
  };
  const light = (task: Task) => ({
    task: { id: task.id, title: task.title ?? task.id },
    spec: specOf(task, plans),
    source: sourceOf(task),
    text: textOf(task),
    prior: task.reviewPrior
      ? {
          title: (task.reviewPrior as Text).title ?? null,
          ...textOf(task.reviewPrior as Text),
        }
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
    const id = item.taskId;
    const task = id ? byId.get(id) : null;
    if (!id || !task) continue;
    const blocked = [...(dependents.get(id) ?? [])]
      .map((to) => byId.get(to))
      .filter((t): t is Task => Boolean(t));
    item.context = {
      ...light(task),
      unblocks: {
        total: blocked.length,
        tasks: blocked
          .slice(0, SHOWN_DEPENDENTS)
          .map((t) => ({ id: t.id, title: t.title ?? t.id })),
      },
      links: linksOf(id),
      failedChecks: failedChecksOf(store, id),
    };
  }
  return items;
}
