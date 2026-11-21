import type { Snapshot, SourceRef, Task } from "./types.ts";

export function resolveTaskId(
  data: Pick<Snapshot, "taskAliases">,
  id: string,
): string {
  const seen = new Set<string>();
  while (data.taskAliases?.[id]) {
    if (seen.has(id)) throw Error("Task alias cycle: " + id);
    seen.add(id);
    id = data.taskAliases![id];
  }
  return id;
}
export function taskSourceRefs(task: Task): SourceRef[] {
  const refs = new Map<string, SourceRef>();
  for (const ref of [task.source, ...(task.sourceReferences || [])]) {
    if (!ref) continue;
    const key = ref.document + "#" + ref.key;
    if (!refs.has(key)) refs.set(key, ref);
  }
  return [...refs.values()];
}
function normalizedTaskTitle(title: unknown) {
  return String(title || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
// Each task's normalized title, kept while its title stays the same. Lint
// checks every proposal against every task, so normalizing each task's title
// once per check made a large workspace's Plans list take seconds.
const normalizedTitles = new WeakMap<
  Task,
  { title: string; normalized: string }
>();
function taskTitleKey(task: Task) {
  const known = normalizedTitles.get(task);
  if (known?.title === task.title) return known.normalized;
  const normalized = normalizedTaskTitle(task.title);
  normalizedTitles.set(task, { title: task.title, normalized });
  return normalized;
}
// Tasks by normalized title, for checking many titles against one task list
// (duplicateCandidates' `index`). Build it once per check, after the list
// stops changing.
export function titleIndex(tasks: Task[]) {
  const index = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = taskTitleKey(task);
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(task);
  }
  return index;
}
// A proposed task: its title, its own ID when it has one, and the tasks a
// person said it is not.
export interface TaskInput {
  id?: string;
  title?: string;
  distinctFrom?: Record<string, unknown>;
  distinctReason?: unknown;
  [key: string]: unknown;
}
export interface Candidate {
  id: string;
  title: string;
  status: string;
  document: string | undefined;
  match: "same-title" | "similar-title";
  score: number;
}

export function duplicateCandidates(
  data: Snapshot,
  input: TaskInput,
  {
    limit = 8,
    similar = false,
    index = null,
  }: {
    limit?: number;
    similar?: boolean;
    index?: Map<string, Task[]> | null;
  } = {},
): Candidate[] {
  const title = normalizedTaskTitle(input.title),
    own = resolveTaskId(data, input.id ?? ""),
    tokens = new Set(title.match(/[\p{L}\p{N}]{4,}/gu) || []),
    result: Candidate[] = [];
  if (title.length < 16) return result;
  // Only an exact match counts without `similar`, so an index lookup finds
  // the same tasks as the full scan.
  const candidates = index && !similar ? index.get(title) || [] : data.tasks;
  for (const task of candidates) {
    if (
      task.id === own ||
      (task.distinctFrom as Record<string, unknown> | undefined)?.[own] ||
      input.distinctFrom?.[task.id]
    )
      continue;
    const other = taskTitleKey(task),
      exact = title === other;
    if (!exact && !similar) continue;
    let score = 1;
    if (!exact) {
      const words = new Set(other.match(/[\p{L}\p{N}]{4,}/gu) || []);
      if (tokens.size < 5 || words.size < 5) continue;
      let same = 0;
      for (const token of tokens) if (words.has(token)) same++;
      score = same / (tokens.size + words.size - same);
      if (score < 0.75) continue;
    }
    result.push({
      id: task.id,
      title: task.title,
      status: task.status,
      document: task.source?.document,
      match: exact ? "same-title" : "similar-title",
      score,
    });
  }
  return result
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, Math.min(100, limit)));
}
export function requireDistinctTask(data: Snapshot, input: TaskInput) {
  if (
    input.distinctReason !== undefined &&
    (typeof input.distinctReason !== "string" ||
      input.distinctReason.length > 2000)
  )
    throw Error("distinctReason must be text up to 2,000 characters.");
  const candidates = duplicateCandidates(data, input);
  if (candidates.length && !String(input.distinctReason ?? "").trim()) {
    throw Object.assign(
      Error(
        "Possible existing task: " +
          candidates.map((t) => t.id + " (" + t.title + ")").join("; ") +
          ". Reuse its taskId/reuseTaskId, or provide distinctReason explaining the separate scope.",
      ),
      { status: 409, details: { kind: "duplicate-tasks", candidates } },
    );
  }
  return candidates;
}

// randomUUID requires a secure context; getRandomValues also works on intranet HTTP.
export function randomUUID(
  source:
    | {
        randomUUID?: () => string;
        getRandomValues?: (array: Uint8Array) => Uint8Array;
      }
    | undefined = globalThis.crypto,
): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues !== "function")
    throw Error("Secure random values are unavailable in this browser.");
  const bytes = source.getRandomValues!(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((n) => n.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
