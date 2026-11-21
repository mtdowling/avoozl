// Manual tasks on the page: the calls name their operations, a manual task
// is tagged Manual in Needs you and on its Delivery card, and the drawers
// hold the new parts.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { manualClient } from '../src/manual-api.ts'
import { summarize } from '../src/dashboard-api.ts'
import { deliveryLanes } from '../src/delivery-api.ts'

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('each call names its operation', async () => {
  const sent = []
  const api = { post: async (_path, body) => (sent.push(body), { result: {} }) }
  const client = manualClient(api)
  await client.markDone('w', 't', 'skipped')
  await client.reopen('w', 't')
  assert.deepEqual(
    sent.map((body) => body.operation),
    ['task.manual.complete', 'task.manual.reopen'],
  )
  assert.deepEqual(sent[0].input, { taskId: 't', choice: 'skipped' })
})

const graphTask = (id, extra = {}) => ({
  id,
  title: `Task ${id}`,
  epic: null,
  kind: 'leaf',
  authority: 'local',
  route: 'local',
  completion: 'integrated',
  repository: 'code',
  status: 'planned',
  complete: false,
  ready: false,
  decision: null,
  issue: null,
  ...extra,
})

test('a manual task waiting for a person is tagged Manual in Needs you and on its card', () => {
  const graph = {
    revision: 1,
    epics: [],
    statuses: [],
    repositories: [],
    total: 2,
    edges: [],
    tasks: [
      graphTask('review', { manual: true, state: 'needs-you', needsYou: { reason: 'Waiting for a person: Review with team', manual: true } }),
      graphTask('cutover', { state: 'waiting' }),
    ],
  }
  const summary = summarize({ graph, delivery: [], conflicts: [], plans: null })
  const manual = summary.attention.find((item) => item.kind === 'manual')
  assert.deepEqual(manual && { taskId: manual.taskId, detail: manual.detail }, { taskId: 'review', detail: 'Waiting for a person: Review with team' })
  const lanes = deliveryLanes(graph, [])
  assert.deepEqual(
    lanes['needs-you'].map((card) => [card.id, card.manual]),
    [['review', true]],
  )
  assert.equal(lanes.waiting.find((card) => card.id === 'cutover').manual, false)
})

test('the drawer has Links and Mark done, and no notes; New spec has Blank or From a goal', () => {
  const drawer = source('TaskDrawer.tsx')
  assert.match(drawer, /<SectionBox id="task-links" title="Links">/)
  assert.doesNotMatch(drawer, /Links and notes|id="notes"/)
  assert.match(drawer, /task\.manual && \(\s*<ManualTask/)
  const notes = source('ManualTask.tsx')
  for (const words of ['Mark done', "title: 'Done'", "title: 'Skipped'", 'Reopen']) assert.ok(notes.includes(words), words)
  // Tasks keep no notes or links: no field for either in Mark done.
  for (const gone of ['Add note', 'Outcome note', 'textarea', 'Add a link']) assert.ok(!notes.includes(gone), gone)
  assert.doesNotMatch(notes, /<Markdown/)
  assert.match(notes, /<Modal/)
  assert.match(notes, /<RadioFold/)
  const plan = source('NewPlanDrawer.tsx')
  assert.match(plan, /title: 'Blank'/)
  assert.match(plan, /title: 'From a goal'/)
  assert.doesNotMatch(plan, /From template/)
  assert.match(plan, /<RadioFold/)
})
