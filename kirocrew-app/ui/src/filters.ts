// The one filter bar the Graph and Delivery tabs share: the same controls,
// the same matching, and one saved state per workspace, so a filter set on
// one tab holds on the other. Kept free of JSX so node can test it.
//
// Why the Plan and Repository dropdowns were empty before: they listed the
// plan IDs and repositories stored on tasks, but tasks from a spec folder
// carry no plan ID (only 7 of Nupp's 4,217 rows do; membership is the spec
// folder their epic or source reference names), and Nupp's tasks name no
// repository at all. Plans now come from each task's spec folder or plan ID,
// and repositories from the workspace's registered list plus "No repository".
import { STATES, nodeState, waves, type NodeState } from './graph-layout.ts'
import type { Graph, GraphTask } from './views-api.ts'

export interface TaskFilter {
  q?: string
  // `spec:<folder>` or `plan:<id>` (planKey).
  plan?: string
  // An epic across plans; NO_GROUP is No epic (Requirement 59.10).
  epic?: string
  // A phase of the picked plan; NO_GROUP is No phase.
  phase?: string
  // A repository ID, or NO_REPOSITORY.
  repository?: string
  state?: NodeState
  waveMin?: number
  waveMax?: number
  authority?: string
  needsYou?: boolean
  // Show tasks of archived plans; they are hidden otherwise.
  archived?: boolean
}

export const NO_REPOSITORY = '(none)'
export const NO_GROUP = '(none)'

// What a filter reads from a task; Delivery cards without a graph row
// supply the same fields.
export interface Filterable {
  id: string
  title: string
  epic: string | null
  phase?: { id: string; title: string } | null
  planId?: string | null
  spec?: string | null
  repository: string | null
  authority?: string
  state: NodeState
  wave: number
  decision?: string | null
  planArchived?: string | null
}

export const planKey = (task: { spec?: string | null; planId?: string | null }) =>
  task.spec ? `spec:${task.spec}` : task.planId ? `plan:${task.planId}` : null

// A Plans row's key: its folder when it has one, else its stored plan.
export const rowPlanKey = (row: { spec: string | null; planId: string | null }) =>
  row.spec ? `spec:${row.spec}` : row.planId ? `plan:${row.planId}` : undefined

export const filterActive = (filter: TaskFilter) =>
  Boolean(
    filter.q?.trim() ||
      filter.plan ||
      filter.epic ||
      filter.phase ||
      filter.repository ||
      filter.state ||
      filter.waveMin ||
      filter.waveMax ||
      filter.authority ||
      filter.needsYou ||
      filter.archived,
  )

// Archived plans' tasks are hidden unless Show archived is on, or the
// filter names that plan (a click on its Graph or Delivery button).
export const archivedShown = (task: Pick<Filterable, 'planArchived'>, filter: TaskFilter) =>
  !task.planArchived || Boolean(filter.archived || filter.plan)

export function matches(task: Filterable, filter: TaskFilter): boolean {
  const text = filter.q?.trim().toLowerCase() ?? ''
  const key = filter.plan
  return (
    archivedShown(task, filter) &&
    (!text || task.title.toLowerCase().includes(text) || task.id.toLowerCase().includes(text)) &&
    (!key ||
      (key.startsWith('spec:') ? task.spec === key.slice(5) : key.startsWith('plan:') ? task.planId === key.slice(5) : false)) &&
    (!filter.epic || (filter.epic === NO_GROUP ? !task.epic : task.epic === filter.epic)) &&
    // Phase applies inside the picked plan only.
    (!filter.phase || !key || (filter.phase === NO_GROUP ? !task.phase : task.phase?.id === filter.phase)) &&
    (!filter.repository ||
      (filter.repository === NO_REPOSITORY ? !task.repository : task.repository === filter.repository)) &&
    (!filter.state || task.state === filter.state) &&
    (!filter.waveMin || task.wave >= filter.waveMin) &&
    (!filter.waveMax || task.wave <= filter.waveMax) &&
    (!filter.authority || (task.authority ?? 'local') === filter.authority) &&
    (!filter.needsYou || task.state === 'needs-you' || Boolean(task.decision))
  )
}

export const filterable = (task: GraphTask, wave: number): Filterable => ({
  id: task.id,
  title: task.title,
  epic: task.epic,
  phase: task.phase ?? null,
  planId: task.planId ?? null,
  spec: task.spec ?? null,
  repository: task.repository,
  authority: task.authority,
  state: nodeState(task),
  wave,
  decision: task.decision,
  planArchived: task.planArchived ?? null,
})

export interface Option {
  value: string
  label: string
}

// The choices each control offers, from the graph itself. Plans list every
// spec folder and stored plan a task names; repositories list the
// workspace's registered ones, plus No repository when a task names none.
export function filterChoices(graph: Graph | null, planLabels: Record<string, string> = {}, plan?: string) {
  const tasks = graph?.tasks ?? []
  const wave = graph ? waves(graph) : new Map<string, number>()
  const distinct = (pick: (task: GraphTask) => string | null, label: (value: string) => string): Option[] => {
    const seen = new Set<string>()
    for (const task of tasks) {
      const value = pick(task)
      if (value) seen.add(value)
    }
    return [...seen].map((value) => ({ value, label: label(value) })).sort((a, b) => a.label.localeCompare(b.label))
  }
  const epicTitles = new Map((graph?.epics ?? []).map((e) => [e.id, e.title]))
  const repositories = new Set([...(graph?.repositories ?? []), ...tasks.map((t) => t.repository).filter((r): r is string => Boolean(r))])
  return {
    plans: distinct(planKey, (value) => planLabels[value] ?? value.replace(/^(spec|plan):/, '')),
    epics: [
      ...distinct((t) => t.epic, (value) => epicTitles.get(value) ?? value),
      ...(tasks.some((t) => !t.epic) ? [{ value: NO_GROUP, label: 'No epic' }] : []),
    ],
    // The picked plan's phases, in task order; none until a plan is picked.
    phases: (() => {
      if (!plan) return []
      const inPlan = tasks.filter((t) => planKey(t) === plan)
      const seen = new Map<string, string>()
      for (const t of inPlan) if (t.phase && !seen.has(t.phase.id)) seen.set(t.phase.id, t.phase.title)
      return [
        ...[...seen].map(([value, label]) => ({ value, label })),
        ...(inPlan.some((t) => !t.phase) ? [{ value: NO_GROUP, label: 'No phase' }] : []),
      ]
    })(),
    repositories: [
      ...[...repositories].sort().map((value) => ({ value, label: value })),
      ...(tasks.some((t) => !t.repository) ? [{ value: NO_REPOSITORY, label: 'No repository' }] : []),
    ],
    states: STATES.map((s) => ({ value: s.id, label: s.label })),
    authorities: distinct((t) => t.authority ?? 'local', (value) => value),
    waves: Math.max(0, ...wave.values()),
  }
}

// The graph with only the tasks every filter keeps, and the edges whose
// both ends are kept.
export function filterGraph(graph: Graph, filter: TaskFilter): Graph {
  if (!filterActive(filter) && !graph.tasks.some((task) => task.planArchived)) return graph
  const wave = waves(graph)
  const tasks = graph.tasks.filter((task) => matches(filterable(task, wave.get(task.id) ?? 1), filter))
  const ids = new Set(tasks.map((t) => t.id))
  return { ...graph, tasks, edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) }
}

// Saved per workspace in the page's own storage, shared by both tabs.
const key = (workspaceId: string) => `avoozl.filters.${workspaceId}`
export const FILTER_EVENT = 'avoozl-filter'

export function readFilter(storage: Pick<Storage, 'getItem'> | null, workspaceId: string): TaskFilter {
  try {
    const value = JSON.parse(storage?.getItem(key(workspaceId)) ?? 'null')
    if (!value || typeof value !== 'object') return {}
    const out: TaskFilter = {}
    for (const name of ['q', 'plan', 'epic', 'phase', 'repository', 'authority'] as const)
      if (typeof value[name] === 'string' && value[name]) out[name] = value[name]
    if (STATES.some((s) => s.id === value.state)) out.state = value.state
    for (const name of ['waveMin', 'waveMax'] as const)
      if (Number.isInteger(value[name]) && value[name] > 0) out[name] = value[name]
    if (value.needsYou === true) out.needsYou = true
    if (value.archived === true) out.archived = true
    return out
  } catch {
    return {}
  }
}

export function writeFilter(storage: Pick<Storage, 'setItem'> | null, workspaceId: string, filter: TaskFilter): void {
  try {
    storage?.setItem(key(workspaceId), JSON.stringify(filter))
  } catch {
    // Storage may be full or blocked; the filter still works for this visit.
  }
}

// The filter with one change; empty values are dropped.
export function changed(filter: TaskFilter, change: Partial<TaskFilter>): TaskFilter {
  const next: Record<string, unknown> = { ...filter, ...change }
  for (const name of Object.keys(next)) if (next[name] === undefined || next[name] === '' || next[name] === false) delete next[name]
  return next as TaskFilter
}
