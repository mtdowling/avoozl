import { randomUUID } from "node:crypto";
import { resolveTaskId, requireDistinctTask } from "./task-identity.ts";
import type { Snapshot, Task } from "./types.ts";

// The page's state when a person captured a prompt.
interface CaptureContext {
  filters?: Record<string, unknown>;
  selected?: string;
  document?: string;
  revision?: number;
  stripOrder?: string;
  view?: string;
  taskIds?: unknown[];
  visualization?: string;
  tour?: string;
  step?: number;
  url?: unknown;
  camera?: Record<string, unknown>;
}
interface CaptureInput {
  prompt?: unknown;
  submissionId?: unknown;
  context?: CaptureContext;
  reuseTaskId?: string;
  distinctReason?: string;
}
interface Submission {
  submissionId: string;
  prompt: string;
  at: string;
  context: CaptureContext;
}
type Captured = Task & {
  prompt?: string;
  capture?: { submissionId?: string; context?: CaptureContext; at?: string };
  captureSubmissions?: Submission[];
  contextDocuments?: string[];
};
type View = { id: string };

// Capture intent and references. A selection is context, never a dependency.
export function captureTask(data: Snapshot, input: CaptureInput) {
  if (
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > 20000
  )
    throw Error("Describe the task in 1–20,000 characters.");
  if (
    typeof input.submissionId !== "string" ||
    !/^[a-zA-Z0-9-]{8,80}$/.test(input.submissionId)
  )
    throw Error("A submission ID is required.");
  const tasks = data.tasks as Captured[],
    submissionId = input.submissionId;
  const previous = tasks.find(
    (t) =>
      t.capture?.submissionId === submissionId ||
      t.captureSubmissions?.some((c) => c.submissionId === submissionId),
  );
  if (previous) {
    const prompt =
      previous.capture?.submissionId === input.submissionId
        ? previous.prompt
        : previous.captureSubmissions?.find(
            (c) => c.submissionId === submissionId,
          )?.prompt;
    if (prompt !== input.prompt.trim())
      throw Error("This submission ID already belongs to another prompt.");
    return { task: previous, existing: true };
  }
  const c: CaptureContext = input.context || {},
    filters: Record<string, string> = {};
  for (const key of [
    "scope",
    "q",
    "status",
    "activity",
    "track",
    "tag",
    "relation",
  ]) {
    const value = c.filters?.[key];
    if (typeof value === "string" && value.length <= 2000) filters[key] = value;
  }
  const selected = tasks.find(
      (t) => t.id === resolveTaskId(data, c.selected ?? ""),
    ),
    document = c.document && data.documents[c.document] ? c.document : null;
  // A captured task has no plan, so it shows under No plan; the document
  // it came from is provenance only, never a group (Requirement 59.6).
  const compatible =
    selected && (filters.scope !== "runtime" || selected.scope === "runtime")
      ? selected
      : null;
  const scope = document
    ? "catalog"
    : filters.scope === "runtime"
      ? "runtime"
      : compatible?.scope || "catalog";
  const track = (data.tracks ?? []).some((t) => t.id === filters.track)
    ? filters.track
    : compatible?.track || "catalog";
  const contextDocuments = [
    ...new Set(
      [
        document,
        compatible?.source?.document,
        ...(compatible?.contextDocuments || []),
      ].filter((id): id is string => Boolean(id && data.documents[id])),
    ),
  ];
  const prompt = input.prompt.trim(),
    title =
      prompt
        .split("\n")
        .find((s) => s.trim())!
        .trim()
        .replace(/^#+\s*/, "")
        .slice(0, 240) || "New request";
  const reuse = input.reuseTaskId
    ? tasks.find((t) => t.id === resolveTaskId(data, input.reuseTaskId!))
    : !input.distinctReason
      ? tasks.find(
          (t) =>
            t.prompt === prompt &&
            resolveTaskId(data, t.capture?.context?.selected || "") ===
              (selected?.id || "") &&
            (t.capture?.context?.document || null) === document,
        )
      : null;
  if (input.reuseTaskId && !reuse) throw Error("Task to reuse was not found.");
  if (reuse) {
    reuse.contextDocuments = [
      ...new Set([...(reuse.contextDocuments || []), ...contextDocuments]),
    ];
    reuse.captureSubmissions = [
      ...(reuse.captureSubmissions || []),
      {
        submissionId: String(submissionId),
        prompt,
        at: new Date().toISOString(),
        context: c,
      },
    ];
    return { task: reuse, existing: true };
  }
  const duplicates = requireDistinctTask(data, {
    title,
    distinctReason: input.distinctReason,
  });
  const presentation = (data.presentation ?? {}) as {
    views?: View[];
    tours?: View[];
  };
  const context: Record<string, unknown> & { camera?: Record<string, number> } =
    {
      revision: Number.isInteger(c.revision) ? c.revision : data.revision,
      stripOrder: c.stripOrder === "progress" ? "progress" : "chronological",
      view: [
        "strip",
        "epics",
        "graph",
        "tasks",
        "activity",
        "documents",
        "report",
      ].includes(c.view ?? "")
        ? c.view
        : "strip",
      filters,
      selected: selected?.id || "",
      document,
      taskIds: Array.isArray(c.taskIds)
        ? [
            ...new Set(
              c.taskIds.filter((id) => tasks.some((t) => t.id === id)),
            ),
          ].slice(0, 500)
        : [],
      visualization: presentation.views?.some((v) => v.id === c.visualization)
        ? c.visualization
        : "",
      tour: presentation.tours?.some((t) => t.id === c.tour) ? c.tour : "",
      step: Number.isInteger(c.step) ? Math.max(0, c.step!) : 0,
    };
  if (
    typeof c.url === "string" &&
    c.url.startsWith("/?") &&
    c.url.length < 12000
  )
    context.url = c.url;
  const camera: Record<string, number> = {};
  for (const key of ["stripScale", "stripCenter", "epicZoom"]) {
    const value = c.camera?.[key];
    if (typeof value === "number" && Number.isFinite(value))
      camera[key] = value;
  }
  context.camera = camera;
  const now = new Date().toISOString(),
    task: Captured = {
      id: "request-" + randomUUID().slice(0, 12),
      title,
      summary: prompt,
      prompt,
      status: "planned",
      scope,
      track,
      kind: "task",
      tags: [
        ...new Set([
          ...(compatible?.tags || []).filter(
            (t) => !["historical", "plan-inventory"].includes(t),
          ),
          ...(filters.tag ? [filters.tag] : []),
          "prompt-request",
        ]),
      ],
      nextAction: prompt,
      contextDocuments,
      statusAuthority: "database",
      needsReview: false,
      createdAt: now,
      updatedAt: now,
      capture: { submissionId: String(submissionId), at: now, context },
    };
  if (input.distinctReason)
    task.distinctFrom = Object.fromEntries(
      duplicates.map((t) => [t.id, input.distinctReason]),
    );
  data.tasks.push(task);
  return { task, existing: false };
}
