import {
  duplicateCandidates,
  resolveTaskId,
  titleIndex,
} from "../task-identity.mjs";
import { extractPlan } from "./plans.mjs";
import { taskCompletion, taskKind, taskRoute } from "../work-model.mjs";

const taskBlocks = () => /^```task\s*\r?\n([\s\S]*?)^```\s*$/gm;

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function diagnostic(
  code,
  severity,
  message,
  lineStart = 1,
  lineEnd = lineStart,
  extra = {},
) {
  return {
    id: `${code}:${lineStart}:${extra.taskId || ""}`,
    code,
    severity,
    message,
    lineStart,
    lineEnd,
    ...extra,
  };
}

function taskLine(task) {
  return {
    lineStart: task.lineStart || 1,
    lineEnd: task.lineEnd || task.lineStart || 1,
    taskId: task.id,
  };
}

function effectiveProject(plan, task, existing) {
  return (
    task.repository ||
    task.projectId ||
    plan?.context?.projectId ||
    existing?.repository ||
    existing?.projectId ||
    null
  );
}

// Completion levels each route can observe (design §4.3).
const ROUTE_COMPLETIONS = {
  local: ["integrated", "released", "answered"],
  github: ["merged-pr", "released", "answered"],
};

// A leaf is bounded: one repository, acceptance, checks and a completion
// its route can observe. Acceptance is enforced by extractPlan.
function boundednessDiagnostics(task, projectId, projects) {
  const at = taskLine(task),
    found = [],
    add = (code, message) =>
      found.push(
        diagnostic(code, "error", message, at.lineStart, at.lineEnd, {
          taskId: task.id,
        }),
      );
  // acceptFrom gates a local leaf's acceptance on validation Avoozl ran at
  // its integrated commit (§5.2); nothing else records such validation.
  if (
    task.acceptFrom !== undefined &&
    (taskKind(task) !== "leaf" ||
      taskRoute(task) !== "local" ||
      !["integrated", "released"].includes(taskCompletion(task)))
  )
    add(
      "leaf.accept-from",
      `acceptFrom on "${task.id}" needs a local leaf that completes by integration.`,
    );
  if (taskKind(task) !== "leaf") return found;
  if (task.repository && task.projectId && task.repository !== task.projectId)
    add(
      "leaf.repository",
      `Leaf "${task.id}" names two repositories; a leaf changes exactly one.`,
    );
  // With one registered repository or none (the workspace checkout), the
  // target is implied; with several the leaf must name one.
  else if (!projectId && projects.size > 1)
    add(
      "leaf.repository",
      `Name the one repository leaf "${task.id}" changes; this workspace has several.`,
    );
  const completion = taskCompletion(task),
    allowed = ROUTE_COMPLETIONS[taskRoute(task)];
  if (allowed && !allowed.includes(completion))
    add(
      "leaf.completion",
      `Completion "${completion}" cannot be observed on route "${taskRoute(task)}".`,
    );
  // An unregistered repository is reported as task.unknown-project.
  const unknown = projectId && projects.size && !projects.has(projectId),
    checks = task.checks?.length
      ? task.checks
      : projects.get(projectId)?.checks || [];
  if (completion !== "answered" && !checks.length && !unknown)
    add(
      "leaf.checks",
      `Name the checks that prove leaf "${task.id}", or configure checks on its repository.`,
    );
  return found;
}

// Repeated IDs stop extraction, so they are found from the raw blocks.
function duplicateIdDiagnostics(text, matches) {
  const first = new Map(),
    found = [];
  for (const match of matches) {
    let id;
    try {
      id = JSON.parse(match[1])?.id;
    } catch {
      continue;
    }
    if (typeof id !== "string") continue;
    const lineStart = lineAt(text, match.index),
      lineEnd = lineAt(text, match.index + match[0].length);
    if (first.has(id))
      found.push(
        diagnostic(
          "task.duplicate-id",
          "error",
          `Task ID "${id}" is already used at line ${first.get(id)}.`,
          lineStart,
          lineEnd,
          { taskId: id },
        ),
      );
    else first.set(id, lineStart);
  }
  return found;
}

function placeholderAcceptance(value) {
  const normalized = value
    .trim()
    .replace(/[.?!]+$/, "")
    .toLowerCase();
  return (
    /^(todo|tbd|fixme)$/.test(normalized) ||
    /^(it )?(works|is done|is complete)$/.test(normalized) ||
    /^(tests?|checks?) pass$/.test(normalized) ||
    /define an observable acceptance check/.test(normalized)
  );
}

function cycleDiagnostics(tasks, mapping) {
  const graph = new Map(tasks.map((task) => [task.id, []]));
  for (const task of tasks)
    for (const field of ["requires", "sequence"])
      for (const reference of task[field] || []) {
        const local = mapping.get(reference);
        if (local) graph.get(local.id)?.push(task);
      }
  const active = new Set();
  const complete = new Set();
  const found = new Set();
  const diagnostics = [];
  function visit(task, path) {
    if (active.has(task.id)) {
      const cycle = [
        ...path.slice(path.findIndex((id) => id === task.id)),
        task.id,
      ];
      const key = [...new Set(cycle)].sort().join("\0");
      if (!found.has(key)) {
        found.add(key);
        diagnostics.push(
          diagnostic(
            "task.dependency-cycle",
            "error",
            `Dependency cycle: ${cycle.join(" → ")}.`,
            task.lineStart,
            task.lineEnd,
            { taskId: task.id },
          ),
        );
      }
      return;
    }
    if (complete.has(task.id)) return;
    active.add(task.id);
    for (const next of graph.get(task.id) || [])
      visit(next, [...path, task.id]);
    active.delete(task.id);
    complete.add(task.id);
  }
  for (const task of tasks) visit(task, []);
  return diagnostics;
}

export function lintPlan({ text, plan = {}, data = {}, proposals }) {
  const diagnostics = [];
  const matches = [...text.matchAll(taskBlocks())];
  if (!matches.length && proposals === undefined)
    return summarize(diagnostics, []);

  let tasks = [];
  try {
    tasks = proposals === undefined ? extractPlan(text) : proposals;
  } catch (cause) {
    for (const match of matches) {
      try {
        extractPlan(match[0]);
      } catch (blockCause) {
        diagnostics.push(
          diagnostic(
            "task.schema",
            "error",
            blockCause.message,
            lineAt(text, match.index),
            lineAt(text, match.index + match[0].length),
          ),
        );
      }
    }
    diagnostics.push(...duplicateIdDiagnostics(text, matches));
    if (!diagnostics.length)
      diagnostics.push(diagnostic("task.schema", "error", cause.message, 1));
    return summarize(diagnostics, []);
  }

  const projects = new Map(
    (data.projects || []).map((project) => [project.id, project]),
  );
  const existingTasks = new Map(
    (data.tasks || []).map((task) => [task.id, task]),
  );
  const localTasks = new Map(tasks.map((task) => [task.id, task]));
  const normalizedTitles = new Map();
  // Built once: every proposal's title is checked against every task.
  let titles = null;

  for (const task of tasks) {
    const at = taskLine(task);
    const titleKey = task.title.trim().toLowerCase().replace(/\s+/g, " ");
    const duplicate = normalizedTitles.get(titleKey);
    if (duplicate)
      diagnostics.push(
        diagnostic(
          "task.duplicate-title",
          "warning",
          `This title duplicates task "${duplicate.id}". Combine the deliverables or explain why they are distinct.`,
          at.lineStart,
          at.lineEnd,
          { taskId: task.id },
        ),
      );
    else normalizedTitles.set(titleKey, task);

    if (!task.summary?.trim())
      diagnostics.push(
        diagnostic(
          "task.basis",
          "warning",
          "Explain what this deliverable changes and why it is required by the design.",
          at.lineStart,
          at.lineEnd,
          { taskId: task.id },
        ),
      );
    for (const acceptance of task.acceptance || [])
      if (placeholderAcceptance(acceptance))
        diagnostics.push(
          diagnostic(
            "task.acceptance-placeholder",
            "warning",
            `Replace placeholder acceptance criterion "${acceptance}" with an observable result.`,
            at.lineStart,
            at.lineEnd,
            { taskId: task.id },
          ),
        );

    const canonical = task.taskId ? resolveTaskId(data, task.taskId) : null;
    const existing = canonical ? existingTasks.get(canonical) : null;
    let projectId = effectiveProject(plan, task, existing);
    if (task.taskId && !existing)
      diagnostics.push(
        diagnostic(
          "task.unknown-target",
          "error",
          `Task "${task.taskId}" cannot be reused because it does not exist.`,
          at.lineStart,
          at.lineEnd,
          { taskId: task.id },
        ),
      );
    if (!task.taskId) {
      titles ??= titleIndex(data.tasks || []);
      const duplicates = duplicateCandidates(
        data,
        {
          ...task,
          id: plan.mapping?.[task.id] || `${plan.id || "plan"}-${task.id}`,
        },
        { index: titles },
      );
      if (duplicates.length && !task.distinctReason?.trim())
        diagnostics.push(
          diagnostic(
            "task.possible-duplicate",
            "warning",
            `Possible existing task "${duplicates[0].id}" has the same title. Reuse it when it covers the same deliverable.`,
            at.lineStart,
            at.lineEnd,
            { taskId: task.id, relatedTaskId: duplicates[0].id },
          ),
        );
    }
    if (projectId && projects.size && !projects.has(projectId))
      diagnostics.push(
        diagnostic(
          "task.unknown-project",
          "error",
          `Execution project "${projectId}" is not registered in this workspace.`,
          at.lineStart,
          at.lineEnd,
          { taskId: task.id },
        ),
      );
    else if (!projectId && projects.size === 1 && taskKind(task) === "leaf")
      projectId = projects.keys().next().value;
    else if (!projectId && projects.size > 1 && taskKind(task) !== "leaf")
      diagnostics.push(
        diagnostic(
          "task.project-ambiguous",
          "warning",
          "Choose an execution project because this workspace has multiple code repositories.",
          at.lineStart,
          at.lineEnd,
          { taskId: task.id },
        ),
      );

    diagnostics.push(...boundednessDiagnostics(task, projectId, projects));

    for (const field of ["requires", "sequence", "supports"]) {
      const seen = new Set();
      for (const reference of task[field] || []) {
        if (seen.has(reference))
          diagnostics.push(
            diagnostic(
              "task.duplicate-dependency",
              "warning",
              `Dependency "${reference}" is repeated in ${field}.`,
              at.lineStart,
              at.lineEnd,
              { taskId: task.id },
            ),
          );
        seen.add(reference);
        if (reference === task.id)
          diagnostics.push(
            diagnostic(
              "task.self-dependency",
              "error",
              `Task "${task.id}" cannot depend on itself.`,
              at.lineStart,
              at.lineEnd,
              { taskId: task.id },
            ),
          );
        const local = localTasks.get(reference);
        const canonicalReference = local
          ? null
          : resolveTaskId(data, reference);
        const existingReference = canonicalReference
          ? existingTasks.get(canonicalReference)
          : null;
        if (!local && !existingReference)
          diagnostics.push(
            diagnostic(
              "task.unknown-dependency",
              "error",
              `Unknown ${field} reference "${reference}".`,
              at.lineStart,
              at.lineEnd,
              { taskId: task.id },
            ),
          );
        const dependencyProject = local
          ? effectiveProject(plan, local, null)
          : existingReference?.projectId || null;
        if (
          ["requires", "sequence"].includes(field) &&
          projectId &&
          dependencyProject &&
          projectId !== dependencyProject
        )
          diagnostics.push(
            diagnostic(
              "task.cross-project-dependency",
              "info",
              `"${task.id}" waits on "${reference}" across projects ${dependencyProject} → ${projectId}.`,
              at.lineStart,
              at.lineEnd,
              { taskId: task.id, relatedTaskId: reference },
            ),
          );
      }
    }
  }
  diagnostics.push(...cycleDiagnostics(tasks, localTasks));
  diagnostics.sort(
    (left, right) =>
      severityRank(left.severity) - severityRank(right.severity) ||
      left.lineStart - right.lineStart ||
      left.code.localeCompare(right.code),
  );
  return summarize(diagnostics, tasks);
}

function severityRank(severity) {
  return { error: 0, warning: 1, info: 2 }[severity] ?? 3;
}

function summarize(diagnostics, tasks) {
  diagnostics = diagnostics.filter(
    (item, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.code === item.code &&
          candidate.severity === item.severity &&
          candidate.message === item.message &&
          candidate.lineStart === item.lineStart &&
          candidate.lineEnd === item.lineEnd &&
          candidate.taskId === item.taskId,
      ) === index,
  );
  const counts = { error: 0, warning: 0, info: 0 };
  for (const item of diagnostics) counts[item.severity]++;
  return {
    canApprove: counts.error === 0,
    counts,
    taskCount: tasks.length,
    diagnostics,
  };
}
