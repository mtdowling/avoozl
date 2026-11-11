import { duplicateCandidates, resolveTaskId } from "../task-identity.mjs";
import { extractPlan } from "./plans.mjs";

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

function headingLines(text) {
  return [...text.matchAll(/^(#{1,6})[ \t]+(.+?)\s*$/gm)].map((match) => ({
    depth: match[1].length,
    title: match[2].trim(),
    line: lineAt(text, match.index),
  }));
}

function hasHeading(headings, pattern) {
  return headings.some((heading) => pattern.test(heading.title));
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
    task.projectId || plan?.context?.projectId || existing?.projectId || null
  );
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

export function lintPlan({ text, plan = {}, data = {} }) {
  const diagnostics = [];
  const headings = headingLines(text);
  if (!headings.some((heading) => heading.depth === 1))
    diagnostics.push(
      diagnostic(
        "design.title",
        "warning",
        "Add one top-level title for the design.",
      ),
    );
  if (!hasHeading(headings, /^(intent|objective|goals?)$/i))
    diagnostics.push(
      diagnostic(
        "design.intent",
        "warning",
        "State the intended outcome in an Intent, Objective, or Goals section.",
      ),
    );
  if (!hasHeading(headings, /^(design|approach|decisions?|architecture)$/i))
    diagnostics.push(
      diagnostic(
        "design.decisions",
        "warning",
        "Record the chosen design and its important decisions.",
      ),
    );
  if (!hasHeading(headings, /^non[- ]goals?$/i))
    diagnostics.push(
      diagnostic(
        "design.non-goals",
        "info",
        "Consider naming non-goals so reviewers can distinguish omitted scope from missing work.",
      ),
    );
  if (!hasHeading(headings, /^(constraints?|assumptions?)$/i))
    diagnostics.push(
      diagnostic(
        "design.constraints",
        "info",
        "Consider recording constraints or assumptions that shape the design.",
      ),
    );
  if (!hasHeading(headings, /^(risks?|failure modes?|security)$/i))
    diagnostics.push(
      diagnostic(
        "design.risks",
        "info",
        "Consider describing material risks and failure behavior.",
      ),
    );
  if (!hasHeading(headings, /^(testing|test strategy|acceptance|validation)$/i))
    diagnostics.push(
      diagnostic(
        "design.validation",
        "info",
        "Consider explaining how the whole design will be validated, beyond individual task checks.",
      ),
    );
  if (/\b(deploy|migration|release|rollout|upgrade|backfill)\b/i.test(text)) {
    if (!hasHeading(headings, /^(rollout|deployment|migration)$/i))
      diagnostics.push(
        diagnostic(
          "design.rollout",
          "info",
          "Describe how this change rolls out and how partial progress is observed.",
        ),
      );
    if (!hasHeading(headings, /^(rollback|recovery)$/i))
      diagnostics.push(
        diagnostic(
          "design.rollback",
          "info",
          "Describe rollback or recovery when rollout cannot complete safely.",
        ),
      );
  }
  if (!hasHeading(headings, /^proposed work$/i))
    diagnostics.push(
      diagnostic(
        "design.proposed-work",
        "warning",
        "Put executable proposals under a Proposed work section.",
      ),
    );

  const matches = [...text.matchAll(taskBlocks())];
  if (!matches.length) {
    diagnostics.push(
      diagnostic(
        "task.missing",
        "error",
        "Add at least one fenced task block before approval.",
      ),
    );
    return summarize(diagnostics, []);
  }

  let tasks = [];
  try {
    tasks = extractPlan(text);
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
    if (!diagnostics.some((item) => item.code === "task.schema"))
      diagnostics.push(
        diagnostic(
          "task.schema",
          "error",
          cause.message,
          headings.find((heading) => /^proposed work$/i.test(heading.title))
            ?.line || 1,
        ),
      );
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
    for (const acceptance of task.acceptance)
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
    const projectId = effectiveProject(plan, task, existing);
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
      const duplicates = duplicateCandidates(data, {
        ...task,
        id: plan.mapping?.[task.id] || `${plan.id || "plan"}-${task.id}`,
      });
      if (duplicates.length && !task.distinctReason?.trim())
        diagnostics.push(
          diagnostic(
            "task.possible-duplicate",
            "error",
            `Possible existing task "${duplicates[0].id}" has the same title. Reuse it with taskId or explain the separate scope with distinctReason.`,
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
    else if (!projectId && projects.size > 1)
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
