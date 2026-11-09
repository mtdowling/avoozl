import { randomUUID } from "node:crypto";
import { resolveTaskId, requireDistinctTask } from "./task-identity.mjs";

// Capture intent and references. A selection is context, never a dependency.
export function captureTask(data, input) {
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
  const previous = data.tasks.find(
    (t) =>
      t.capture?.submissionId === input.submissionId ||
      t.captureSubmissions?.some((c) => c.submissionId === input.submissionId),
  );
  if (previous) {
    const prompt =
      previous.capture?.submissionId === input.submissionId
        ? previous.prompt
        : previous.captureSubmissions.find(
            (c) => c.submissionId === input.submissionId,
          ).prompt;
    if (prompt !== input.prompt.trim())
      throw Error("This submission ID already belongs to another prompt.");
    return { task: previous, existing: true };
  }
  const c = input.context || {},
    filters = {};
  for (const key of [
    "scope",
    "q",
    "status",
    "activity",
    "epic",
    "track",
    "tag",
    "relation",
  ])
    if (typeof c.filters?.[key] === "string" && c.filters[key].length <= 2000)
      filters[key] = c.filters[key];
  const selected = data.tasks.find(
      (t) => t.id === resolveTaskId(data, c.selected),
    ),
    document = data.documents[c.document] ? c.document : null;
  const epic = data.epics.find(
      (e) => e.id === (filters.epic || c.selected?.replace(/^epic:/, "")),
    ),
    docEpic =
      filters.epic?.startsWith("doc:") && data.documents[filters.epic.slice(4)]
        ? filters.epic
        : null;
  const compatible =
    selected &&
    (filters.scope !== "runtime" || selected.scope === "runtime") &&
    (!filters.epic || selected.epic === filters.epic)
      ? selected
      : null;
  const scope =
    epic?.scope === "catalog" || docEpic || document
      ? "catalog"
      : filters.scope === "runtime"
        ? "runtime"
        : epic
          ? "runtime"
          : compatible?.scope || "catalog";
  const targetEpic =
    docEpic ||
    epic?.id ||
    (document ? "doc:" + document : null) ||
    compatible?.epic ||
    "inbox";
  const track = data.tracks.some((t) => t.id === filters.track)
    ? filters.track
    : compatible?.track || "catalog";
  const contextDocuments = [
    ...new Set(
      [
        document,
        compatible?.source?.document,
        ...(compatible?.contextDocuments || []),
      ].filter((id) => id && data.documents[id]),
    ),
  ];
  const prompt = input.prompt.trim(),
    title =
      prompt
        .split("\n")
        .find((s) => s.trim())
        .trim()
        .replace(/^#+\s*/, "")
        .slice(0, 240) || "New request";
  const reuse = input.reuseTaskId
    ? data.tasks.find((t) => t.id === resolveTaskId(data, input.reuseTaskId))
    : !input.distinctReason
      ? data.tasks.find(
          (t) =>
            t.prompt === prompt &&
            resolveTaskId(data, t.capture?.context?.selected || "") ===
              (selected?.id || "") &&
            (t.capture?.context?.document || null) === document &&
            t.epic === targetEpic,
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
        submissionId: input.submissionId,
        prompt,
        at: new Date().toISOString(),
        context: c,
      },
    ];
    return { task: reuse, existing: true };
  }
  if (targetEpic === "inbox" && !data.epics.some((e) => e.id === "inbox"))
    data.epics.push({
      id: "inbox",
      title: "Inbox",
      scope: "catalog",
      color: "#96abc1",
      summary: "New requests awaiting planning and classification.",
    });
  const duplicates = requireDistinctTask(data, {
    title,
    distinctReason: input.distinctReason,
  });
  const context = {
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
    ].includes(c.view)
      ? c.view
      : "strip",
    filters,
    selected:
      selected?.id ||
      (epic && c.selected === "epic:" + epic.id ? c.selected : ""),
    document,
    taskIds: Array.isArray(c.taskIds)
      ? [
          ...new Set(
            c.taskIds.filter((id) => data.tasks.some((t) => t.id === id)),
          ),
        ].slice(0, 500)
      : [],
    visualization: data.presentation?.views?.some(
      (v) => v.id === c.visualization,
    )
      ? c.visualization
      : "",
    tour: data.presentation?.tours?.some((t) => t.id === c.tour) ? c.tour : "",
    step: Number.isInteger(c.step) ? Math.max(0, c.step) : 0,
  };
  if (
    typeof c.url === "string" &&
    c.url.startsWith("/?") &&
    c.url.length < 12000
  )
    context.url = c.url;
  context.camera = {};
  for (const key of ["stripScale", "stripCenter", "epicZoom"])
    if (Number.isFinite(c.camera?.[key])) context.camera[key] = c.camera[key];
  const now = new Date().toISOString(),
    task = {
      id: "request-" + randomUUID().slice(0, 12),
      title,
      summary: prompt,
      prompt,
      status: "planned",
      scope: targetEpic === "inbox" ? "catalog" : scope,
      epic: targetEpic,
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
      capture: { submissionId: input.submissionId, at: now, context },
    };
  if (input.distinctReason)
    task.distinctFrom = Object.fromEntries(
      duplicates.map((t) => [t.id, input.distinctReason]),
    );
  data.tasks.push(task);
  return { task, existing: false };
}
