// Tasks from spec folders that are not approved yet, for the Graph only.
// Each folder's tasks.md and manifest are parsed the way approval parses
// them (parseSpec), and nothing is stored: a draft task never enters the
// store, the ready queue, or a release. Display only.
import { parseSpec, specItems, specTitle } from "./spec-plans.mjs";
import { resolveTaskId } from "../task-identity.mjs";
import {
  taskCompletion,
  taskKind,
  taskRepository,
  taskRoute,
} from "../work-model.mjs";

const BLOCKING = new Set(["requires", "sequence"]);
const KINDS = ["requires", "sequence", "supports"];

// `folders` is every spec folder read from disk: [{name, spec}], where spec
// is readSpecFolder's result. `plans` is the store's plans. A folder counts
// as a draft when no live plan for it is approved. Tasks already in the
// store, checked [x] items, epic folders, and folders that do not parse add
// nothing.
export function draftGraph(data, folders = [], plans = []) {
  const stored = new Set(data.tasks.map((task) => task.id)),
    specs = [],
    tasks = [],
    pending = [];
  for (const { name, spec } of folders) {
    const plan =
      plans.find((entry) => entry.spec === name && !entry.deletedAt) ?? null;
    if (!spec?.exists || plan?.state === "approved" || plan?.archivedAt)
      continue;
    let parsed;
    try {
      parsed = parseSpec(spec);
    } catch {
      continue;
    }
    if (parsed.kind !== "plan" || !parsed.proposals.length) continue;
    const marks = new Map(
        specItems(name, spec.files?.["tasks.md"] ?? "").map((item) => [
          item.line,
          item.mark,
        ]),
      ),
      status = plan?.state ?? "not stored";
    let count = 0;
    for (const proposal of parsed.proposals) {
      if (stored.has(proposal.id) || marks.get(proposal.lineStart) === "x")
        continue;
      stored.add(proposal.id);
      count++;
      tasks.push({
        id: proposal.id,
        title: proposal.title ?? proposal.id,
        epic: null,
        planId: null,
        spec: name,
        phase: proposal.phase ?? null,
        order: data.tasks.length + tasks.length,
        kind: taskKind(proposal),
        route: taskRoute(proposal),
        completion: taskCompletion(proposal),
        repository: taskRepository(proposal),
        status: "draft",
        complete: false,
        batch: null,
        ready: false,
        state: "draft",
        draft: { spec: name, status },
        review: false,
        decision: null,
        needsYou: null,
        manual: proposal.manual === true,
        manualDone: null,
        noSession: null,
        handSetReview: false,
        nextAction: null,
        planArchived: null,
        authority: "local",
        issue: null,
      });
      pending.push(proposal);
    }
    if (count) specs.push({ name, title: specTitle(spec), status, count });
  }
  const drafts = new Set(pending.map((proposal) => proposal.id)),
    approved = new Set(data.tasks.map((task) => task.id)),
    known = (id) => drafts.has(id) || approved.has(id),
    edges = [];
  for (const proposal of pending)
    for (const kind of KINDS)
      for (const ref of proposal[kind] || []) {
        const from = drafts.has(ref) ? ref : resolveTaskId(data, ref);
        if (!known(from)) continue;
        edges.push({
          from,
          to: proposal.id,
          kind,
          condition:
            kind === "requires" ? (proposal.conditions?.[ref] ?? null) : null,
          blocking: BLOCKING.has(kind),
          // A draft holds nothing back yet; an approved blocker is judged
          // by the caller, which knows the store's statuses.
          satisfied: false,
          draft: true,
        });
      }
  return { specs, tasks, edges };
}
