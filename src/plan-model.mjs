import { resolveTaskId, taskSourceRefs } from "./task-identity.mjs";
import { queryTasks, statusComplete } from "./query.mjs";
export const PLAN_STATUSES = {
  done: "DONE",
  "not-started": "NOT STARTED",
  started: "STARTED",
  abandoned: "ABANDONED",
};
export function featureCategory(doc) {
  if (/^to do$/i.test(doc.title)) return "Planning & tooling";
  const name = (doc.title + " " + doc.id).toLowerCase();
  for (const [category, pattern] of [
    [
      "Planning & tooling",
      /plans.site|handoff|takeover|agent|roadmap|planning|report.generator|cheap.to.change|duplication|engineering.review|correctness|test|\bci\b|coherence|amendment|remaining.public|current|s0.frozen/,
    ],
    [
      "Concurrency & I/O",
      /coroutine|suspension|concurren|worker|scheduler|event.loop|network|http|socket|filesystem|file.api|process|\bio\b|\bi\/o\b|portable.file|host.channel|task.queue|file.watch|application.director/,
    ],
    [
      "Memory & data",
      /\bbyte|buffer|garbage|collector|\bgc\b|memory|array|serialization|serde|json|digest|checksum|allocator|table|object|values|allocation|struct.reference|nupp.set/,
    ],
    [
      "Performance & codegen",
      /performance|optimi|\baot\b|\bjit\b|\bsimd\b|\bssa\b|\bcfg\b|llvm|cranelift|benchmark|codegen|multicore|\bgpu\b|interpreter.speed|vectorization|inline.assembly|static.trace.budget/,
    ],
    [
      "Runtime & delivery",
      /runtime|native|bootstrap|seed|release|backend|reload|snapshot|frames.and.calls|nupp.vm|core.pivot/,
    ],
    [
      "Language & compiler",
      /compiler|type|syntax|language|pattern|checker|method|record|interface|generic|diagnostic|comptime|\bpeg\b|or.exit|metatable|iterator|single.ir/,
    ],
    [
      "Libraries & APIs",
      /library|\bapi|smithy|binding|module|package|everyday.geometry|matrix.math|device.surface|window.design|game.storage|compression|extension|\bspi\b/,
    ],
    [
      "Documentation & experience",
      /document|learn|guide|website|editor|\blsp\b/,
    ],
  ])
    if (pattern.test(name)) return category;
  return "Other plans";
}
export function planSummaries(data) {
  const byId = new Map(data.tasks.map((t) => [t.id, t])),
    owned = new Map();
  for (const t of data.tasks) {
    for (const id of new Set(
      taskSourceRefs(t)
        .map((r) => r.document)
        .concat(t.epic?.startsWith("doc:") ? [t.epic.slice(4)] : []),
    )) {
      if (!owned.has(id)) owned.set(id, []);
      owned.get(id).push(t);
    }
  }
  return Object.values(data.documents)
    .filter((d) => !d.removed)
    .map((doc) => {
      const tasks = doc.plan?.taskQuery
        ? queryTasks(data, doc.plan.taskQuery)
        : Array.isArray(doc.plan?.taskIds)
          ? [...new Set(doc.plan.taskIds.map((id) => resolveTaskId(data, id)))]
              .map((id) => byId.get(id))
              .filter(Boolean)
          : owned.get(doc.id) || [];
      const progressTasks = doc.historical
          ? tasks.map((t) => {
              const ref = taskSourceRefs(t).find((r) => r.document === doc.id);
              return ref?.statusAtMerge
                ? {
                    ...t,
                    status: ref.statusAtMerge,
                    progressPercent: ref.progressAtMerge ?? t.progressPercent,
                  }
                : t;
            })
          : tasks,
        done = progressTasks.filter((t) =>
          statusComplete(data, t.status),
        ).length,
        started = progressTasks.some(
          (t) =>
            statusComplete(data, t.status) ||
            ["partial", "blocked"].includes(t.status) ||
            (t.progressPercent || 0) > 0,
        );
      const lifecycle =
        doc.plan?.status ||
        (/^abandoned\//.test(doc.id)
          ? "abandoned"
          : /^done\//.test(doc.id)
            ? "done"
            : tasks.length && done === tasks.length
              ? "done"
              : started
                ? "started"
                : "not-started");
      const percent =
        doc.plan?.progressPercent ??
        (lifecycle === "done"
          ? 100
          : tasks.length
            ? Math.round(
                progressTasks.reduce(
                  (n, t) =>
                    n +
                    (statusComplete(data, t.status)
                      ? 100
                      : t.progressPercent || 0),
                  0,
                ) / tasks.length,
              )
            : 0);
      return {
        doc,
        tasks,
        total: tasks.length,
        done,
        status: lifecycle,
        percent,
        category: doc.plan?.category || featureCategory(doc),
        branch: doc.plan?.targetBranch || "Unassigned branch",
        basis:
          doc.plan?.progressPercent !== undefined
            ? "Authored estimate"
            : lifecycle === "done" && /^done\//.test(doc.id)
              ? "Archived as done"
              : tasks.length
                ? "Task-count progress"
                : "No tracked tasks",
      };
    });
}
export function applyPlanMetadata(data, id, patch) {
  const doc = data.documents[id];
  if (!doc) throw Error("Document not indexed");
  const next = { ...doc.plan };
  for (const key of ["status", "category", "targetBranch", "progressPercent"])
    if (Object.hasOwn(patch, key)) {
      const value = patch[key];
      if (value === null || value === "") {
        delete next[key];
        continue;
      }
      if (key === "status" && !Object.hasOwn(PLAN_STATUSES, value))
        throw Error("Unknown plan status");
      if (
        ["category", "targetBranch"].includes(key) &&
        (typeof value !== "string" || value.length > 160)
      )
        throw Error(key + " must be text up to 160 characters");
      if (
        key === "progressPercent" &&
        (!Number.isFinite(value) || value < 0 || value > 100)
      )
        throw Error("Progress must be between 0 and 100");
      next[key] = value;
    }
  doc.plan = next;
  return doc;
}
