import {
  duplicateCandidates,
  resolveTaskId,
  titleIndex,
} from "../../task-identity.ts";
import { repositoryChecks } from "../workspace/repository-checks.ts";
import { isManual, taskKind } from "../../work-model.ts";
import type { Snapshot, Task } from "../../types.ts";

// A task a spec proposes, as lint reads it.
export interface Proposal {
  id: string;
  title: string;
  kind?: string;
  repository?: string;
  repositoryId?: string;
  acceptance?: string[];
  requires?: string[];
  manual?: boolean;
  lineStart?: number;
  lineEnd?: number;
  [key: string]: unknown;
}
// One lint finding.
export interface Diagnostic {
  id: string;
  code: string;
  severity: string;
  message: string;
  lineStart: number;
  lineEnd: number;
  taskId?: string;
  [key: string]: unknown;
}
// The plan whose proposals are linted.
interface LintedPlan {
  id?: string;
  context?: { repositoryId?: string } | null;
  mapping?: Record<string, string>;
  [key: string]: unknown;
}
type Repository = { id: string; [key: string]: unknown };
type Severity = "error" | "warning" | "info";

function diagnostic(
  code: string,
  severity: string,
  message: string,
  lineStart = 1,
  lineEnd = lineStart,
  extra: { taskId?: string; [key: string]: unknown } = {},
): Diagnostic {
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

function taskLine(task: Proposal) {
  return {
    lineStart: task.lineStart || 1,
    lineEnd: task.lineEnd || task.lineStart || 1,
    taskId: task.id,
  };
}

function effectiveRepository(
  plan: LintedPlan | null | undefined,
  task: Proposal,
  existing: { repository?: string; repositoryId?: string } | null,
): string | null {
  return (
    task.repository ||
    task.repositoryId ||
    plan?.context?.repositoryId ||
    existing?.repository ||
    existing?.repositoryId ||
    null
  );
}

// What a manual leaf may not hold: nothing runs it (R61.9).
const MANUAL_REFUSED = ["checks", "agent", "model", "paths"];

// A manual leaf: acceptance, a repository for its issue, and nothing an
// agent would use. It completes by a person; `manual: true` says so.
function manualDiagnostics(
  task: Proposal,
  repositoryId: string | null,
  add: (code: string, message: string) => void,
) {
  if (task.manual !== true) return;
  if (taskKind(task) !== "leaf")
    add(
      "spec.manual-field",
      `"${task.id}" is a package; only a leaf can be manual.`,
    );
  for (const key of MANUAL_REFUSED)
    if (task[key] !== undefined)
      add(
        "spec.manual-field",
        `Manual task "${task.id}" has "${key}"; nothing runs a manual task, so remove it.`,
      );
  if (!repositoryId)
    add(
      "spec.manual-field",
      `Manual task "${task.id}" needs a "repository": where its issue lives.`,
    );
}

// A leaf is bounded: one repository, acceptance and checks. Acceptance is
// enforced by extractPlan.
function boundednessDiagnostics(
  task: Proposal,
  repositoryId: string | null,
  repositories: Map<string, Repository>,
) {
  const at = taskLine(task),
    found: Diagnostic[] = [],
    add = (code: string, message: string) =>
      found.push(
        diagnostic(code, "error", message, at.lineStart, at.lineEnd, {
          taskId: task.id,
        }),
      );
  manualDiagnostics(task, repositoryId, add);
  if (taskKind(task) !== "leaf") return found;
  // A manual leaf runs nothing: no checks to prove.
  if (isManual(task)) return found;
  // With one registered repository or none (the workspace checkout), the
  // target is implied; with several the leaf must name one.
  if (!repositoryId && repositories.size > 1)
    add(
      "leaf.repository",
      `Name the one repository leaf "${task.id}" changes; this workspace has several.`,
    );
  // An unregistered repository is reported as task.unknown-repository.
  // Every leaf runs its repository's checks; tasks never name them. Only a
  // registered repository's are known here.
  const known = repositoryId !== null && repositories.has(repositoryId),
    // A verifier chat stands in for missing repository checks; plugin
    // checks never do.
    checks = repositoryChecks(
      repositoryId ? repositories.get(repositoryId) : undefined,
      [],
    );
  // A repository with no checks is judged by a verifier chat instead.
  if (!checks.length && known)
    found.push(
      diagnostic(
        "leaf.checks",
        "warning",
        `Repository ${repositoryId} has no checks, so a verifier chat judges leaf "${task.id}". Configure the repository's checks to have Avoozl run them.`,
        at.lineStart,
        at.lineEnd,
        { taskId: task.id },
      ),
    );
  return found;
}

function placeholderAcceptance(value: string) {
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

function cycleDiagnostics(tasks: Proposal[], mapping: Map<string, Proposal>) {
  const graph = new Map<string, Proposal[]>(tasks.map((task) => [task.id, []]));
  for (const task of tasks)
    for (const field of ["requires"] as const)
      for (const reference of task[field] || []) {
        const local = mapping.get(reference);
        if (local) graph.get(local.id)?.push(task);
      }
  const active = new Set<string>();
  const complete = new Set<string>();
  const found = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  function visit(task: Proposal, path: string[]) {
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

// The quality checks on a spec's proposed tasks: titles, acceptance,
// repositories, references and cycles.
export function lintPlan({
  plan = {},
  data = {},
  proposals,
  declaredTasks = [],
}: {
  plan?: LintedPlan;
  data?: Partial<Snapshot> & { repositories?: Repository[] };
  proposals: Proposal[];
  declaredTasks?: { id?: string; requires?: string[] }[];
}) {
  const diagnostics: Diagnostic[] = [],
    tasks = proposals;

  const repositories = new Map(
    (data.repositories || []).map((repository) => [repository.id, repository]),
  );
  const existingTasks = new Map(
    (data.tasks || []).map((task) => [task.id, task]),
  );
  const localTasks = new Map(tasks.map((task) => [task.id, task]));
  const declarations = new Map(declaredTasks.map((task) => [task.id, task]));
  const normalizedTitles = new Map<string, Proposal>();
  // Built once: every proposal's title is checked against every task.
  let titles: ReturnType<typeof titleIndex> | null = null;

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

    // A task without a summary is fine: one exists only when it adds to
    // the title.
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

    let repositoryId = effectiveRepository(plan, task, null);
    {
      titles ??= titleIndex(data.tasks || []);
      const duplicates = duplicateCandidates(
        data as Snapshot,
        {
          ...task,
          id: plan.mapping?.[task.id] || `${plan.id || "plan"}-${task.id}`,
        },
        { index: titles },
      );
      if (duplicates.length)
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
    if (repositoryId && repositories.size && !repositories.has(repositoryId))
      diagnostics.push(
        diagnostic(
          "task.unknown-repository",
          "error",
          `Execution repository "${repositoryId}" is not registered in this workspace.`,
          at.lineStart,
          at.lineEnd,
          { taskId: task.id },
        ),
      );
    else if (
      !repositoryId &&
      repositories.size === 1 &&
      taskKind(task) === "leaf"
    )
      repositoryId = repositories.keys().next().value ?? null;
    else if (
      !repositoryId &&
      repositories.size > 1 &&
      taskKind(task) !== "leaf"
    )
      diagnostics.push(
        diagnostic(
          "task.repository-ambiguous",
          "warning",
          "Choose an execution repository because this workspace has multiple code repositories.",
          at.lineStart,
          at.lineEnd,
          { taskId: task.id },
        ),
      );

    diagnostics.push(
      ...boundednessDiagnostics(task, repositoryId, repositories),
    );

    for (const field of ["requires"] as const) {
      const seen = new Set<string>();
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
          : resolveTaskId(data as Snapshot, reference);
        const existingReference = canonicalReference
          ? existingTasks.get(canonicalReference)
          : null;
        if (!local && !existingReference && !declarations.has(reference))
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
        const dependencyRepository = local
          ? effectiveRepository(plan, local, null)
          : (existingReference?.repositoryId as string | undefined) || null;
        if (
          repositoryId &&
          dependencyRepository &&
          repositoryId !== dependencyRepository
        )
          diagnostics.push(
            diagnostic(
              "task.cross-repository-dependency",
              "info",
              `"${task.id}" waits on "${reference}" across repositories ${dependencyRepository} → ${repositoryId}.`,
              at.lineStart,
              at.lineEnd,
              { taskId: task.id, relatedTaskId: reference },
            ),
          );
      }
    }
  }
  const all = new Map([...declarations, ...localTasks]),
    reachable = new Set<string>();
  function include(id: string) {
    if (reachable.has(id) || !all.has(id)) return;
    reachable.add(id);
    const task = all.get(id);
    for (const field of ["requires"] as const)
      for (const from of task?.[field] || []) include(from);
  }
  for (const task of tasks) include(task.id);
  const connected = [...reachable].map((id) => all.get(id) as Proposal);
  diagnostics.push(
    ...cycleDiagnostics(
      connected,
      new Map(connected.map((task) => [task.id, task])),
    ),
  );
  diagnostics.sort(
    (left, right) =>
      severityRank(left.severity) - severityRank(right.severity) ||
      left.lineStart - right.lineStart ||
      left.code.localeCompare(right.code),
  );
  return summarize(diagnostics, tasks);
}

function severityRank(severity: string) {
  return (
    ({ error: 0, warning: 1, info: 2 } as Record<string, number>)[severity] ?? 3
  );
}

function summarize(diagnostics: Diagnostic[], tasks: Proposal[]) {
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
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const item of diagnostics) counts[item.severity as Severity]++;
  return {
    canApprove: counts.error === 0,
    counts,
    taskCount: tasks.length,
    diagnostics,
  };
}
