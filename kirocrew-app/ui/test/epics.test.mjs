// Proof P36's page parts (Requirement 59.10, 59.15): the Graph levels All >
// Epic > Plan > Phase with their groups, the Epic and Phase filters, the
// Dashboard's Progress by epic, and the sub-issue cap shown only in GitHub
// modes. The backend parts are in src/app/test/proof-p36.test.mjs.
import assert from 'node:assert/strict'
import test from 'node:test'
import { drillGraph, drillInto, drillLabel, groupGraph, layoutGraph } from '../src/graph-layout.ts'
import { NO_GROUP, filterChoices, filterGraph } from '../src/filters.ts'
import { summarize } from '../src/dashboard-api.ts'
import { SUB_ISSUE_LINE, visibleSettings } from '../src/settings-api.ts'

const task = (id, planId, epic, phase, state = 'waiting') => ({
  id,
  title: 'Task ' + id,
  epic,
  planId,
  spec: planId,
  phase,
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'integrated',
  repository: null,
  status: null,
  complete: state === 'done',
  ready: false,
  state,
  decision: null,
  issue: null,
})

const W1 = { id: 'w1', title: 'W1: core' }
const LOADER = { id: 'loader', title: 'Loader' }
const graph = {
  revision: 1,
  epics: [{ id: 'rewrite', title: 'Rewrite', count: 4, plans: ['alpha', 'beta'] }],
  plans: [
    { id: 'alpha', title: 'Plan alpha', spec: 'alpha', epic: 'rewrite', phases: [{ id: 'loader', title: 'Loader', count: 1 }, { id: null, title: null, count: 1 }] },
    { id: 'beta', title: 'Plan beta', spec: 'beta', epic: 'rewrite', phases: [{ id: 'w1', title: 'W1: core', count: 2 }] },
    { id: 'gamma', title: 'Plan gamma', spec: 'gamma', epic: null, phases: [{ id: null, title: null, count: 1 }] },
  ],
  statuses: [],
  repositories: [],
  total: 5,
  tasks: [
    task('alpha.0', 'alpha', 'rewrite', null, 'done'),
    task('alpha.1', 'alpha', 'rewrite', LOADER),
    task('beta.1', 'beta', 'rewrite', W1, 'done'),
    task('beta.2', 'beta', 'rewrite', W1),
    task('gamma.1', 'gamma', null, null),
  ],
  edges: [],
}

const groups = (g) => g.groups.map((entry) => [entry.id, entry.title])
const members = (g) => Object.fromEntries(g.tasks.map((t) => [t.id, t.group]))

test('P36 (3): the Graph opens at epics, then plans, then phases, then tasks', () => {
  // All: epics and No epic.
  const top = groupGraph(graph, null)
  assert.deepEqual(groups(top), [['rewrite', 'Rewrite'], [null, 'No epic']])
  assert.equal(members(top)['gamma.1'], null)
  // An epic: its member plans.
  const epic = drillInto(null, 'rewrite', 'Rewrite')
  assert.deepEqual(epic, { kind: 'epic', id: 'rewrite', title: 'Rewrite' })
  const plans = groupGraph(drillGraph(graph, epic), epic)
  assert.deepEqual(plans.tasks.map((t) => t.id), ['alpha.0', 'alpha.1', 'beta.1', 'beta.2'])
  assert.deepEqual(groups(plans).slice(0, 2), [['alpha', 'Plan alpha'], ['beta', 'Plan beta']])
  // A plan: its phases, No phase last.
  const plan = drillInto(epic, 'alpha', 'Plan alpha')
  const phases = groupGraph(drillGraph(graph, plan), plan)
  assert.deepEqual(groups(phases), [['loader', 'Loader'], [null, 'No phase']])
  assert.deepEqual(members(phases), { 'alpha.0': null, 'alpha.1': 'loader' })
  // A phase: its tasks; nothing deeper by group.
  const phase = drillInto(plan, 'loader', 'Loader')
  assert.deepEqual(phase, { kind: 'phase', plan: 'alpha', id: 'loader', title: 'Loader' })
  assert.deepEqual(drillGraph(graph, phase).tasks.map((t) => t.id), ['alpha.1'])
  assert.equal(drillInto(phase, 'loader', 'Loader'), null)
  assert.deepEqual([epic, plan, phase].map(drillLabel), ['Rewrite', 'Plan alpha', 'Loader'])
  // No epic drills to the plans in no epic.
  const none = { kind: 'epic', id: null, title: 'No epic' }
  assert.deepEqual(drillGraph(graph, none).tasks.map((t) => t.id), ['gamma.1'])
  // Collapsed groups draw one node each, named by the level's titles.
  const folded = layoutGraph(top, new Set(['rewrite', '(none)']))
  assert.deepEqual(folded.nodes.map((n) => n.title).sort(), ['No epic', 'Rewrite'])
  // No group or label is a document path or a doc: ID.
  for (const g of [top, plans, phases])
    for (const [, title] of groups(g)) assert.doesNotMatch(String(title), /doc:|\.kiro\/specs|\.md$/)
})

test('P36 (3): Epic and Phase are separate filters; Phase needs a plan', () => {
  const choices = filterChoices(graph)
  assert.deepEqual(choices.epics, [{ value: 'rewrite', label: 'Rewrite' }, { value: NO_GROUP, label: 'No epic' }])
  assert.deepEqual(choices.phases, [], 'no phases until a plan is picked')
  const picked = filterChoices(graph, {}, 'spec:beta')
  assert.deepEqual(picked.phases, [{ value: 'w1', label: 'W1: core' }])
  assert.deepEqual(filterGraph(graph, { epic: NO_GROUP }).tasks.map((t) => t.id), ['gamma.1'])
  assert.deepEqual(filterGraph(graph, { plan: 'spec:alpha', phase: NO_GROUP }).tasks.map((t) => t.id), ['alpha.0'])
  // A phase without a plan filters nothing.
  assert.equal(filterGraph(graph, { phase: 'w1' }).tasks.length, graph.tasks.length)
})

test('P36 (3): the Dashboard shows Progress by epic across member plans, then No epic', () => {
  const summary = summarize({ graph, delivery: [], conflicts: [], plans: null })
  assert.deepEqual(
    summary.progress.map((row) => [row.epic, row.title, row.done, row.total]),
    [
      ['rewrite', 'Rewrite', 2, 4],
      [null, 'No epic', 0, 1],
    ],
  )
})

test('P36 (8): the sub-issue cap shows only in GitHub modes', () => {
  assert.equal(visibleSettings('local').has('subIssueCap'), false)
  assert.equal(visibleSettings('plans-repo').has('subIssueCap'), true)
  assert.equal(visibleSettings('single-repo').has('subIssueCap'), true)
  assert.match(SUB_ISSUE_LINE, /GitHub allows 100, closed ones included/)
})
