// Tasks from spec folders that are not approved yet, for the Graph only.
// Each folder's tasks.md and manifest are parsed the way approval parses
// them (parseSpec), and nothing is stored: a draft task never enters the
// store, the ready queue, or a release. Display only.
import { parseSpec, specItems, specTitle } from "./spec-plans.ts";
import { resolveTaskId } from "../../task-identity.ts";
import {
  taskCompletion,
  taskKind,
  taskRepository,
  taskRoute,
} from "../../work-model.ts";
import { specTasks } from "./spec-tasks.ts";
import type { SpecFolder } from "./spec-plans.ts";
import type { Proposal } from "./plan-quality.ts";
import type { Snapshot } from "../../types.ts";

type Plan = {
  id: string;
  spec?: string;
  state?: string;
  deletedAt?: string;
  archivedAt?: string;
};
const KIND_LIST = ["requires", "sequence", "supports"] as const;

const BLOCKING = new Set(["requires", "sequence"]);

// `folders` is every spec folder read from disk: [{name, spec}], where spec
// is readSpecFolder's result. `plans` is the store's plans. A folder counts
// as a draft when no live plan for it is approved. Tasks already in the
// store, checked [x] items, epic folders, and folders that do not parse add
// nothing.
export function draftGraph(
  data: Snapshot,
  folders: { name: string; spec: SpecFolder | null }[] = [],
  plans: Plan[] = [],
) {
  const stored = new Set(data.tasks.map((task) => task.id)),
    specs: { name: string; title: string; status: string; count: number }[] =
      [],
    tasks: Record<string, unknown>[] = [],
    pending: Proposal[] = [];
  for (const { name, spec } of folders) {
    const plan =
      plans.find((entry) => entry.spec === name && !entry.deletedAt) ?? null;
    if (!spec?.exists || plan?.state === "approved" || plan?.archivedAt)
      continue;
    let parsed: ReturnType<typeof parseSpec>;
    try {
      parsed = parseSpec(spec);
    } catch {
      continue;
    }
    if (parsed.kind !== "plan" || !parsed.proposals.length) continue;
    const marks = new Map(
        specItems(name, specTasks(spec.files)?.text ?? "").map((item) => [
          item.line,
          item.mark,
        ]),
      ),
      status = plan?.state ?? "not stored";
    let count = 0;
    for (const proposal of parsed.proposals) {
      if (stored.has(proposal.id) || marks.get(proposal.lineStart ?? 0) === "x")
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
        refs: proposal.refs ?? [],
        order: data.tasks.length + tasks.length,
        kind: taskKind(proposal),
        route: taskRoute(),
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
    known = (id: string) => drafts.has(id) || approved.has(id),
    edges: Record<string, unknown>[] = [];
  for (const proposal of pending)
    for (const kind of KIND_LIST)
      for (const ref of (proposal[kind] as string[] | undefined) || []) {
        const from = drafts.has(ref) ? ref : resolveTaskId(data, ref);
        if (!known(from)) continue;
        edges.push({
          from,
          to: proposal.id,
          kind,
          condition:
            kind === "requires"
              ? ((proposal.conditions as Record<string, unknown> | undefined)?.[
                  ref
                ] ?? null)
              : null,
          blocking: BLOCKING.has(kind),
          // A draft holds nothing back yet; an approved blocker is judged
          // by the caller, which knows the store's statuses.
          satisfied: false,
          draft: true,
        });
      }
  return { specs, tasks, edges };
}
