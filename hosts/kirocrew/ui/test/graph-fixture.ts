// Whole Graph and delivery records for the page tests: what a test does not name is a
// planned local leaf with no epic, decision or issue, and an empty graph.
import type { StoredPlan } from '../src/plans-api.ts'
import type { DeliveryItem, DeliverySession, Graph, GraphEdge, GraphTask } from '../src/views-api.ts'

export const graphTask = (id: string, over: Partial<GraphTask> = {}): GraphTask => ({
  id,
  title: `Task ${id}`,
  epic: null,
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'integrated',
  repository: null,
  status: 'planned',
  complete: false,
  ready: false,
  decision: null,
  issue: null,
  ...over,
})

export const graphEdge = (from: string, to: string, over: Partial<GraphEdge> = {}): GraphEdge => ({
  from,
  to,
  kind: 'requires',
  condition: null,
  blocking: true,
  satisfied: false,
  ...over,
})

// A session with nothing observed yet.
export const deliverySession = (over: Partial<DeliverySession> = {}): DeliverySession => ({
  slot: 's',
  role: 'worker',
  attempt: 1,
  title: null,
  status: null,
  statusAt: null,
  boundAt: null,
  ...over,
})

// A planned task's delivery with no sessions, evidence or pull requests.
export const deliveryItem = (id: string, over: Partial<DeliveryItem> = {}): DeliveryItem => ({
  id,
  title: `Task ${id}`,
  status: 'planned',
  complete: false,
  repository: null,
  sessions: [],
  evidence: [],
  integration: null,
  pullRequests: [],
  deliveries: [],
  worktrees: [],
  ...over,
})

// A stored plan at its first revision.
export const storedPlan = (id: string, over: Partial<StoredPlan> = {}): StoredPlan => ({
  id,
  title: null,
  state: 'draft',
  kind: null,
  revision: 1,
  hash: 'h',
  updatedAt: null,
  ...over,
})

export const graphOf = (over: Partial<Graph> = {}): Graph => ({
  revision: 1,
  epics: [],
  statuses: [],
  repositories: [],
  total: over.tasks?.length ?? 0,
  tasks: [],
  edges: [],
  ...over,
})
