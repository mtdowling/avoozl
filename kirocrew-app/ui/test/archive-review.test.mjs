// Archived plans are hidden until Show archived, and a review status with
// nothing behind it is labeled plainly instead of drawn as in progress.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ARCHIVE_LINES, filterRows, planEventLine, rowActions } from '../src/plans-api.ts'
import { filterGraph, matches, readFilter } from '../src/filters.ts'
import { deliveryLanes, doneStatus, laneOf } from '../src/delivery-api.ts'
import { summarize } from '../src/dashboard-api.ts'
import { settleActionOf, whyLine } from '../src/conflicts-api.ts'
import { noSessionLabel, reviewRuns } from '../src/views-api.ts'

const src = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

const row = (name, extra = {}) => ({
  key: `plan:${name}`,
  kind: 'spec',
  name,
  spec: null,
  folder: null,
  planId: name,
  type: null,
  category: null,
  categoryProblem: null,
  errors: 0,
  status: 'approved',
  tasks: { total: 1, done: 0 },
  now: { ready: 0, running: 0, needsYou: 0 },
  epics: 0,
  lastChange: null,
  ...extra,
})

const task = (id, extra = {}) => ({
  id,
  title: id,
  epic: null,
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'merged',
  repository: null,
  status: 'planned',
  complete: false,
  ready: true,
  state: 'ready',
  decision: null,
  issue: null,
  ...extra,
})

const item = (id, extra = {}) => ({
  id,
  title: id,
  status: 'review',
  complete: false,
  repository: null,
  sessions: [],
  runs: [],
  evidence: [],
  integration: null,
  pullRequests: [],
  deliveries: [],
  worktrees: [],
  ...extra,
})

test('Plans hides archived plans until Show archived', () => {
  const rows = [row('live'), row('old', { archived: { at: '2026-11-12T00:00:00Z', by: 'Owner' } })]
  assert.deepEqual(filterRows(rows, {}).map((r) => r.name), ['live'])
  assert.deepEqual(filterRows(rows, { archived: true }).map((r) => r.name), ['live', 'old'])
  assert.equal(planEventLine({ action: 'archived', by: 'Owner' }), 'Archived by Owner')
  assert.match(ARCHIVE_LINES.join(' '), /Unarchive undoes all of it/)
})

test('Graph and Delivery hide archived tasks unless Show archived or that plan is picked', () => {
  const graph = { revision: 1, epics: [], statuses: [], repositories: [], total: 2, tasks: [task('a'), task('b', { planArchived: 'p', planId: 'p', state: 'deferred' })], edges: [] }
  assert.deepEqual(filterGraph(graph, {}).tasks.map((t) => t.id), ['a'])
  assert.deepEqual(filterGraph(graph, { archived: true }).tasks.map((t) => t.id), ['a', 'b'])
  assert.deepEqual(filterGraph(graph, { plan: 'plan:p' }).tasks.map((t) => t.id), ['b'])
  assert.equal(matches({ ...task('b'), wave: 1, planArchived: 'p' }, {}), false)
  const stored = { getItem: () => JSON.stringify({ archived: true }) }
  assert.deepEqual(readFilter(stored, 'w'), { archived: true })
})

test('the Dashboard leaves archived work out of its counts but keeps live chats', () => {
  const graph = { revision: 1, epics: [], statuses: [], repositories: [], total: 2, tasks: [task('a'), task('b', { planArchived: 'p' })], edges: [] }
  const live = { slot: 'chat-1', role: 'worker', attempt: 1, title: null, status: 'running', statusAt: null, boundAt: null }
  const summary = summarize({
    graph,
    delivery: [item('b', { status: 'running', planArchived: 'p', sessions: [live] })],
    conflicts: [{ kind: 'decision', taskId: 'b', title: 'b', detail: 'x', planArchived: 'p' }],
    plans: { items: [{ id: 'p', state: 'approved', archivedAt: 't' }, { id: 'q', state: 'approved' }], total: 2 },
  })
  assert.equal(summary.counts.ready, 1)
  assert.equal(summary.attention.length, 0)
  assert.equal(summary.inFlight.length, 1, 'a running agent stays in sight')
  assert.deepEqual(summary.plans, { approved: 1, draft: 0, total: 1 })
})

test('a hand-set review is not drawn as reviewing and offers no settle action', () => {
  const byHand = task('h', { status: 'review', state: 'needs-you', handSetReview: true, nextAction: 'Owner decision: pick.' })
  assert.equal(laneOf(byHand, item('h', { handSetReview: true })), 'needs-you')
  assert.equal(laneOf(task('r', { status: 'review', state: 'running' }), item('r')), 'reviewing')
  const graph = { revision: 1, epics: [], statuses: [{ id: 'planned', label: 'Planned', complete: false }, { id: 'accepted', label: 'Accepted', complete: true }], repositories: [], total: 1, tasks: [byHand], edges: [] }
  const card = deliveryLanes(graph, [item('h', { handSetReview: true, nextAction: 'Owner decision: pick.' })])['needs-you'][0]
  assert.deepEqual([card.handSetReview, card.nextAction], [true, 'Owner decision: pick.'])
  assert.equal(doneStatus(graph), 'accepted')
  const conflict = { kind: 'needs-human', reason: 'hand-set-review', taskId: 'h', title: 'h', detail: 'Status review was set by hand.', authority: 'local' }
  assert.equal(settleActionOf(conflict), null)
  assert.equal(whyLine(conflict), 'Status review was set by hand.')
  assert.match(noSessionLabel('review'), /marked in review, but no review is running/)
  assert.match(noSessionLabel('running'), /marked running, but no session is running/)
})

test('a review run shows role, round, models, verdict and its chat', () => {
  const runs = reviewRuns(
    item('r', {
      sessions: [
        { slot: 'chat-w', role: 'worker', attempt: 1, title: null, status: 'closed', statusAt: null, boundAt: null },
        { slot: 'chat-r', role: 'reviewer', attempt: 2, title: null, status: 'running', statusAt: null, boundAt: null, model: 'opus', served: { model: 'opus-5.5', withheld: false, changed: false }, link: '/chat/chat-r' },
      ],
      rounds: [{ commit: 'c', current: true, verdicts: [{ role: 'reviewer', attempt: 1, outcome: 'rejected', verdict: 'changes-requested', model: 'opus', served: 'opus-5.5', commit: 'c', stale: false, cause: null, slot: 'chat-old', link: '/chat/chat-old', findings: [] }] }],
    }),
  )
  assert.deepEqual(
    runs.map((r) => [r.role, r.round, r.requested, r.served, r.verdict, r.link, r.live]),
    [
      ['reviewer', 2, 'opus', 'opus-5.5', null, '/chat/chat-r', true],
      ['reviewer', 1, 'opus', 'opus-5.5', 'changes-requested', '/chat/chat-old', false],
    ],
  )
  assert.deepEqual(reviewRuns(item('none')), [])
})

test('Archive is a plain confirm and sits beside Delete; the plan page has a banner', () => {
  const plans = src('PlansView.tsx')
  assert.match(plans, /<Btn type="button" primary data-archive-confirm/)
  assert.doesNotMatch(plans.slice(plans.indexOf('function ArchivePlanDialog'), plans.indexOf('function ArchivedBanner')), /data-danger|var\(--danger\)|dangerStyle/)
  assert.match(plans, /icon=\{Archive\} label=\{`Archive \$\{row\.name\}`\} tooltip=\{ARCHIVE_TIP\}/)
  assert.match(plans, /<ArchivedBanner row=\{row\}/)
  assert.match(plans, /data-plan-timeline/)
  assert.match(src('FilterBar.tsx'), /label: 'Show archived'/)
  assert.equal(rowActions(row('x')).archivable, true)
})

test('the drawer shows review runs and the hand-set block', () => {
  for (const name of ['TaskDrawer.tsx']) {
    assert.match(src(name), /<HandSetReview/)
    assert.match(src(name), /<ReviewRuns/)
  }
  const review = src('ReviewState.tsx')
  assert.match(review, /Discuss/)
  assert.match(review, /Back to planned/)
  assert.match(review, /data-confirm-done/)
})

test('Running on the Dashboard is exactly the tasks In flight lists', () => {
  const live = { slot: 'chat-1', role: 'worker', attempt: 1, title: null, status: 'running', statusAt: null, boundAt: null, link: '/chat/chat-1' }
  const g = (tasks) => ({ revision: 1, epics: [], statuses: [], repositories: [], total: tasks.length, tasks, edges: [] })
  // A status:'review' task with no session: Running 0, In flight empty.
  const none = summarize({ graph: g([task('r', { status: 'review', state: 'running' })]), delivery: [item('r')], conflicts: [], plans: null })
  assert.deepEqual([none.counts.running, none.inFlight.length, none.counts['needs-you']], [0, 0, 1])
  // One live session: Running 1, one In flight row with its Attach link.
  const one = summarize({ graph: g([task('r', { status: 'review', state: 'running' })]), delivery: [item('r', { sessions: [live] })], conflicts: [], plans: null })
  assert.deepEqual([one.counts.running, one.inFlight.length, one.inFlight[0].session.link], [1, 1, '/chat/chat-1'])
  // Delivery puts the session-less one in Needs you, not In progress.
  const orphan = task('o', { status: 'running', state: 'needs-you', handSetReview: true, noSession: 'running' })
  assert.equal(laneOf(orphan, item('o', { status: 'running', handSetReview: true, noSession: 'running' })), 'needs-you')
  assert.equal(laneOf(task('l', { state: 'running' }), item('l', { status: 'running', sessions: [live] })), 'running')
})
