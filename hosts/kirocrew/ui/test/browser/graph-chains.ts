// A scratch workspace's graph.view with real chains across three specs:
// done blockers, newly unlocked tasks, cross-spec waits and one sequence
// edge. The Graph's Focus tree tests and screenshots use it (&graph=chains).
const PLANS = [
  { id: 'search-v2', title: 'Search v2', spec: 'search-v2', epic: 'find', phases: [] },
  { id: 'sync-engine', title: 'Sync engine', spec: 'sync-engine', epic: 'core', phases: [] },
  { id: 'billing', title: 'Billing', spec: 'billing', epic: 'core', phases: [] },
]
const T: [string, string, string, string][] = [
  ['S1', 'search-v2', 'done', 'Tokenize recipe text'],
  ['S2', 'search-v2', 'done', 'Store the search index'],
  ['S3', 'search-v2', 'ready', 'Rank results by match'],
  ['S4', 'search-v2', 'waiting', 'Search as you type'],
  ['S5', 'search-v2', 'waiting', 'Search across devices'],
  ['S6', 'search-v2', 'needs-you', 'Pick the ranking weights'],
  ['Y1', 'sync-engine', 'running', 'Change log per device'],
  ['Y2', 'sync-engine', 'waiting', 'Merge two change logs'],
  ['Y3', 'sync-engine', 'waiting', 'Sync search history'],
  ['Y4', 'sync-engine', 'deferred', 'Sync over Bluetooth'],
  ['B1', 'billing', 'done', 'Plan prices table'],
  ['B2', 'billing', 'ready', 'Charge a saved card'],
  ['B3', 'billing', 'waiting', 'Bill synced households once'],
  ['B4', 'billing', 'waiting', 'Email the receipt'],
  ['B5', 'billing', 'waiting', 'Refund a charge'],
]
const E: [string, string, boolean, string?][] = [
  ['S1', 'S3', true],
  ['S2', 'S3', true],
  ['S3', 'S4', false],
  ['S4', 'S5', false],
  ['S3', 'S6', false],
  ['Y1', 'Y2', false],
  ['Y2', 'Y3', false],
  ['S5', 'Y3', false],
  ['B1', 'B2', true],
  ['B2', 'B3', false],
  ['Y3', 'B3', false],
  ['B3', 'B4', false, 'sequence'],
  ['B2', 'B5', false],
]

export const chainsGraph = {
  revision: 1,
  epics: [
    { id: 'find', title: 'Find recipes', count: 6, plans: ['search-v2'] },
    { id: 'core', title: 'Core', count: 9, plans: ['sync-engine', 'billing'] },
  ],
  plans: PLANS,
  statuses: [
    { id: 'planned', label: 'Planned', complete: false },
    { id: 'done', label: 'Done', complete: true },
  ],
  repositories: ['example/recipe-box'],
  total: T.length,
  tasks: T.map(([id, plan, state, title]) => ({
    id,
    title,
    epic: PLANS.find((p) => p.id === plan)!.epic,
    planId: plan,
    spec: plan,
    phase: null,
    kind: 'leaf',
    authority: 'local',
    route: 'local',
    completion: 'integrated',
    repository: 'example/recipe-box',
    status: state === 'done' ? 'done' : 'planned',
    complete: state === 'done',
    ready: state === 'ready',
    state,
    decision: state === 'needs-you' ? 'Which weights: title first, or ingredients first?' : null,
    issue: null,
  })),
  edges: E.map(([from, to, satisfied, kind]) => ({ from, to, kind: kind ?? 'requires', condition: null, blocking: kind !== 'sequence', satisfied })),
}

// The same graph with one draft spec, Meal plans, whose tasks wait on
// approved ones (&graph=drafts). M1 waits only on done work, so it would
// look unlocked if drafts were not kept out of the Frontier's ready list.
const D: [string, string][] = [
  ['M1', 'Save a week of meals'],
  ['M2', 'Shopping list from a plan'],
  ['M3', 'Charge for meal plans'],
  ['M4', 'Share a plan with family'],
]
const DE: [string, string, string?][] = [
  ['S1', 'M1'],
  ['M1', 'M2'],
  ['S3', 'M2'],
  ['M2', 'M3'],
  ['B2', 'M3'],
  ['M3', 'M4', 'sequence'],
]
export const draftsGraph = {
  ...chainsGraph,
  drafts: {
    specs: [{ name: 'meal-plans', title: 'Meal plans', status: 'not stored', count: D.length }],
    total: D.length,
    tasks: D.map(([id, title], i) => ({
      id,
      title,
      epic: null,
      planId: null,
      spec: 'meal-plans',
      phase: null,
      order: T.length + i,
      kind: 'leaf',
      authority: 'local',
      route: 'local',
      completion: 'integrated',
      repository: 'example/recipe-box',
      status: 'draft',
      complete: false,
      ready: false,
      state: 'draft',
      draft: { spec: 'meal-plans', status: 'not stored' },
      decision: null,
      issue: null,
    })),
    edges: DE.map(([from, to, kind]) => ({ from, to, kind: kind ?? 'requires', condition: null, blocking: true, satisfied: from === 'S1', draft: true })),
  },
}
